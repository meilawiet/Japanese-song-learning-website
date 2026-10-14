"""UtaTen 单页结构验证及注音导出；使用项目 Python 3.12 虚拟环境运行。"""

import argparse
from collections import defaultdict, deque
from dataclasses import dataclass, field
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


@dataclass
class Node:
    tag: str
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)

    def has_class(self, value):
        return value in self.attrs.get('class', '').split()


class PageParser(HTMLParser):
    # 不执行网页脚本，只解析普通 HTML；避免广告、评论中的文字混入歌词。
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
            'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('document')
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, dict(attrs))
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def descendants(node):
    for child in node.children:
        if isinstance(child, Node):
            yield child
            yield from descendants(child)


def text(node):
    if isinstance(node, str):
        return node
    if node.tag in {'script', 'style', 'rp'}:
        return ''
    return ''.join(text(child) for child in node.children)


def by_class(node, name):
    return next((item for item in descendants(node) if item.has_class(name)), None)


def track_lines(root, reading_name):
    # 网站使用 span.ruby / span.rb / span.rt，并非一定使用原生 ruby 标签。
    rows, segments = [], []

    def finish():
        nonlocal segments
        surface = ''.join(item['surface'] for item in segments).strip()
        if surface:
            rows.append({'text': surface, 'segments': segments})
        segments = []

    def walk(node):
        if isinstance(node, str):
            # 换行由 br 决定；清除源码缩进，保留词间空格和标点。
            value = re.sub(r'[\r\n\t]+[ ]*', '', node)
            if value:
                segments.append({'surface': value})
            return
        if node.tag in {'script', 'style', 'rt', 'rp'} or node.has_class('rt'):
            return
        if node.tag == 'br':
            finish()
            return
        if node.tag == 'ruby' or node.has_class('ruby'):
            base = by_class(node, 'rb') or next((n for n in descendants(node) if n.tag == 'rb'), None)
            ruby = by_class(node, 'rt') or next((n for n in descendants(node) if n.tag == 'rt'), None)
            surface = text(base).strip() if base else ''.join(text(n) for n in node.children if not isinstance(n, Node) or not (n.tag in {'rt', 'rp'} or n.has_class('rt'))).strip()
            if surface:
                item = {'surface': surface}
                if ruby and text(ruby).strip():
                    item[reading_name] = text(ruby).strip()
                segments.append(item)
            return
        for child in node.children:
            walk(child)

    walk(root)
    finish()
    return rows


def normalize_surface(value):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value))


def parse_utaten_html(html, source_url=''):
    parser = PageParser()
    parser.feed(html)
    body = by_class(parser.root, 'lyricBody')
    kana = by_class(body, 'hiragana') if body else None
    if kana is None:
        raise ValueError('页面没有 UtaTen 注音歌词结构；可能不是歌词页，或网站结构已变化。')
    rows = track_lines(kana, 'kana')
    if not rows:
        raise ValueError('页面没有可提取的歌词行。')
    roman = by_class(body, 'romaji')
    roman_rows = track_lines(roman, 'romaji') if roman else []
    available = defaultdict(deque)
    for row in roman_rows:
        available[normalize_surface(row['text'])].append(row)
    warnings = []
    for index, row in enumerate(rows):
        row['index'] = index + 1
        row['kana'] = ''.join(s.get('kana', s['surface']) for s in row['segments']).strip()
        queue = available[normalize_surface(row['text'])]
        if queue:
            matched = queue.popleft()
            # 两套 HTML 的分词可以不同，各自保留原词面，不按索引强行逐词配对。
            row['romaji_segments'] = matched['segments']
            row['romaji'] = ''.join(s.get('romaji', s['surface']) for s in matched['segments']).strip()
        else:
            row['romaji'] = None
    unmatched = sum(len(queue) for queue in available.values())
    missing = sum(row['romaji'] is None for row in rows)
    if missing or unmatched:
        warnings.append(f'罗马音有 {missing} 行未匹配、{unmatched} 行多余；未猜测配对。')
    title_node = by_class(parser.root, 'newLyricTitle__main')
    artist_node = by_class(parser.root, 'newLyricWork__name')
    # 标题副标签含动画等说明，不属于歌曲名；仅去掉网站附加的末尾“歌詞”。
    title = ''.join(child for child in title_node.children if isinstance(child, str)).strip() if title_node else ''
    title = re.sub(r'\s+歌詞\s*$', '', title)
    return {'format': 'uta-annotated-lyrics', 'version': 1, 'source': 'UtaTen',
            'url': source_url, 'title': title,
            'artist': text(artist_node).strip() if artist_node else '',
            'timed': False, 'lines': rows, 'warnings': warnings}


def validate_url(url):
    parsed = urlsplit(url)
    if (parsed.scheme != 'https' or parsed.hostname not in {'utaten.com', 'www.utaten.com'}
            or parsed.username or parsed.password or parsed.port not in {None, 443}
            or parsed.query or parsed.fragment or not re.fullmatch(r'/lyric/[A-Za-z0-9]+/', parsed.path)):
        raise ValueError('请输入 https://utaten.com/lyric/歌曲编号/ 形式的歌词页网址。')
    return url


class SameSiteRedirect(HTTPRedirectHandler):
    # 重定向也校验目标，不携带凭据、不访问任意第三方地址。
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_page(url):
    request = Request(validate_url(url), headers={
        'User-Agent': 'UTA-Lyrics-Research/1.2 (single-page compatibility check)',
        'Accept': 'text/html',
    })
    with build_opener(SameSiteRedirect()).open(request, timeout=25) as response:
        if 'text/html' not in response.headers.get('Content-Type', ''):
            raise ValueError('网站未返回 HTML 歌词页面。')
        raw = response.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError('页面超过 2MB，已停止解析。')
        return raw.decode('utf-8-sig')


def summary(result):
    # 联网检查仅输出统计，不把完整歌词打印到日志或写入项目数据。
    return {key: result[key] for key in ('source', 'url', 'title', 'artist', 'timed', 'warnings')} | {
        'lines': len(result['lines']),
        'kana_segments': sum('kana' in s for row in result['lines'] for s in row['segments']),
        'romaji_lines': sum(row['romaji'] is not None for row in result['lines']),
        'romaji_segments': sum('romaji' in s for row in result['lines'] for s in row.get('romaji_segments', [])),
    }


def export_files(result, base):
    # 对用户有权使用的内容导出 JSON 和便于阅读的 TXT；不伪造 LRC 时间戳。
    base = Path(base)
    base.parent.mkdir(parents=True, exist_ok=True)
    json_file, text_file = Path(str(base) + '.uta-lyrics.json'), Path(str(base) + '.txt')
    if json_file.exists() or text_file.exists():
        raise ValueError('输出文件已存在，请换一个文件名。')
    blocks = []
    for row in result['lines']:
        annotated = ''.join(s['surface'] + (f"（{s['kana']}）" if s.get('kana') and s['kana'] != s['surface'] else '') for s in row['segments']).strip()
        blocks.append('\n'.join([annotated, row['kana']] + ([row['romaji']] if row['romaji'] is not None else [])))
    json_file.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    text_file.write_text('\n\n'.join(blocks) + '\n', encoding='utf-8')
    return json_file, text_file


def main():
    cli = argparse.ArgumentParser(description='验证或提取一个 UtaTen 歌词页，保留原文与假名/罗马音对应关系。')
    cli.add_argument('url', help='UtaTen 单首歌词页网址')
    cli.add_argument('--html', type=Path, help='改为解析本机保存的页面，不联网')
    cli.add_argument('--output', type=Path, help='对有权使用的内容导出文件名，不带扩展名；省略时仅输出统计')
    args = cli.parse_args()
    try:
        validate_url(args.url)
        result = parse_utaten_html(args.html.read_text(encoding='utf-8') if args.html else fetch_page(args.url), args.url)
        print(json.dumps(summary(result), ensure_ascii=False, indent=2))
        if args.output:
            for path in export_files(result, args.output):
                print(path.resolve())
    except (ValueError, OSError) as error:
        cli.exit(1, f'提取失败：{error}\n')


if __name__ == '__main__':
    main()
