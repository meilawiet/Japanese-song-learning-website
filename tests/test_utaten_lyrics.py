"""使用原创短句检验 HTML 提取，不将网站整首歌词加入测试仓库。"""

import importlib.util
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest


MODULE = Path(__file__).resolve().parents[1] / 'scripts' / 'utaten_lyrics.py'
SPEC = importlib.util.spec_from_file_location('utaten_lyrics', MODULE)
utaten = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = utaten
SPEC.loader.exec_module(utaten)


class UtaTenLyricsTests(unittest.TestCase):
    def page(self, kana, roman=''):
        return ('<h2 class="newLyricTitle__main">原创测试</h2>'
                '<div class="newLyricWork__name"><a>UTA</a></div>'
                '<div class="advertisement">广告不可提取</div>'
                '<div class="lyricBody"><div class="medium">'
                f'<div class="hiragana">{kana}</div>'
                f'<div class="romaji">{roman}</div>'
                '</div></div><div class="comment">评论不可提取</div>')

    def test_span_ruby_preserves_original_and_two_tracks(self):
        page = self.page(
            '<span class="ruby"><span class="rb">庭</span><span class="rt">にわ</span></span>で<br>UTA &amp; friends',
            '<span class="ruby"><span class="rb">庭で</span><span class="rt">niwa de</span></span><br>UTA &amp; friends')
        result = utaten.parse_utaten_html(page)
        self.assertEqual(result['title'], '原创测试')
        self.assertEqual(result['artist'], 'UTA')
        self.assertFalse(result['timed'])
        self.assertEqual(result['lines'][0]['text'], '庭で')
        self.assertEqual(result['lines'][0]['kana'], 'にわで')
        self.assertEqual(result['lines'][0]['romaji'], 'niwa de')
        self.assertEqual(result['lines'][0]['segments'][0], {'surface': '庭', 'kana': 'にわ'})
        self.assertEqual(result['lines'][1]['text'], 'UTA & friends')
        self.assertEqual(len(result['lines']), 2)

    def test_native_ruby_duplicate_lines_and_breaks(self):
        kana = '\n<ruby><rb>庭</rb><rp>（</rp><rt>にわ</rt><rp>）</rp></ruby>で<br/><br>庭で'
        result = utaten.parse_utaten_html(self.page(kana, '庭で<br>庭で'))
        self.assertEqual([row['text'] for row in result['lines']], ['庭で', '庭で'])
        self.assertEqual(result['warnings'], [])

    def test_mismatch_is_not_paired_by_position(self):
        result = utaten.parse_utaten_html(self.page('庭で<br>森で', '山で<br>森で'))
        self.assertIsNone(result['lines'][0]['romaji'])
        self.assertEqual(result['lines'][1]['romaji'], '森で')
        self.assertTrue(result['warnings'])
        with self.assertRaises(ValueError):
            utaten.parse_utaten_html('<div class="comment">空页面</div>')

    def test_restricted_url(self):
        self.assertEqual(utaten.validate_url('https://utaten.com/lyric/aa123/'), 'https://utaten.com/lyric/aa123/')
        for url in ['http://utaten.com/lyric/aa123/', 'https://utaten.com.evil.test/lyric/aa123/',
                    'https://utaten.com/lyric/aa123/?x=1', 'https://x:y@utaten.com/lyric/aa123/',
                    'https://utaten.com:444/lyric/aa123/', 'https://utaten.com/search/']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                utaten.validate_url(url)

    def test_song_title_excludes_site_suffix_and_tie_up(self):
        page = self.page('庭で', '庭で').replace('原创测试</h2>', '原创测试 歌詞<span class="newLyricTitle__subTitle">动画说明</span></h2>')
        self.assertEqual(utaten.parse_utaten_html(page)['title'], '原创测试')

    def test_export_has_no_fabricated_timestamps_and_refuses_overwrite(self):
        result = utaten.parse_utaten_html(self.page('<ruby>庭<rt>にわ</rt></ruby>で', '庭で'))
        with TemporaryDirectory() as directory:
            base = Path(directory) / 'original'
            json_file, text_file = utaten.export_files(result, base)
            self.assertEqual(json.loads(json_file.read_text(encoding='utf-8'))['lines'][0]['text'], '庭で')
            self.assertIn('庭（にわ）で', text_file.read_text(encoding='utf-8'))
            self.assertNotIn('[00:', text_file.read_text(encoding='utf-8'))
            with self.assertRaises(ValueError):
                utaten.export_files(result, base)


if __name__ == '__main__':
    unittest.main()
