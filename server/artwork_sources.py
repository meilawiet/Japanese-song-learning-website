"""搜索多个公开音乐目录的候选封面；各来源失败时独立降级。"""

from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor
from urllib import parse, request


PROVIDERS = ("Apple Music", "网易云音乐", "QQ 音乐", "酷狗音乐")


def _json(url: str, referer: str = "") -> dict:
    headers = {"Accept": "application/json", "User-Agent": "Mozilla/5.0 UTA/0.1"}
    if referer:
        headers["Referer"] = referer
    with request.urlopen(request.Request(url, headers=headers), timeout=7) as response:
        if response.status != 200:
            return {}
        return json.loads(response.read(2_000_000).decode("utf-8"))


def _key(value: str) -> str:
    return "".join(char for char in str(value).casefold() if char.isalnum())


def _score(name: str, singer: str, title: str, artist: str) -> int:
    song, target = _key(name), _key(title)
    performer, expected = _key(singer), _key(artist)
    if not song or not target:
        return 0
    score = 8 if song == target else 3 if song in target or target in song else 0
    if expected and performer:
        score += 5 if expected == performer else 2 if expected in performer or performer in expected else 0
    return score


def _candidate(provider: str, name: str, singer: str, cover: str, source: str, title: str, artist: str) -> dict | None:
    cover = cover.replace("http://", "https://", 1)
    source = source.replace("http://", "https://", 1)
    score = _score(name, singer, title, artist)
    if score < 3 or not cover.startswith("https://"):
        return None
    return {"artworkUrl": cover, "artworkSourceUrl": source if source.startswith("https://") else "",
            "artworkProvider": provider, "trackTitle": name, "artistName": singer, "matchScore": score}


def _apple(title: str, artist: str) -> list[dict]:
    query = parse.urlencode({"term": f"{title} {artist}".strip(), "country": "JP", "media": "music", "entity": "song", "limit": 12})
    rows = _json(f"https://itunes.apple.com/search?{query}").get("results", [])
    items = []
    for row in rows:
        cover = str(row.get("artworkUrl100", "")).replace("100x100bb", "600x600bb")
        item = _candidate("Apple Music", str(row.get("trackName", "")), str(row.get("artistName", "")),
                          cover, str(row.get("trackViewUrl", "")), title, artist)
        if item:
            items.append(item)
    return items


def _netease(title: str, artist: str) -> list[dict]:
    query = parse.urlencode({"s": f"{title} {artist}".strip(), "type": 1, "offset": 0, "limit": 12})
    rows = _json(f"https://music.163.com/api/search/get/web?{query}", "https://music.163.com/").get("result", {}).get("songs", [])
    matched = []
    for row in rows:
        singer = " / ".join(part.get("name", "") for part in row.get("artists", []) if isinstance(part, dict))
        if _score(str(row.get("name", "")), singer, title, artist) >= 3 and isinstance(row.get("id"), int):
            matched.append((row, singer))
    ids = [row["id"] for row, _ in matched[:4]]
    if not ids:
        return []
    details = _json("https://music.163.com/api/song/detail?" + parse.urlencode({"ids": json.dumps(ids)}),
                    "https://music.163.com/").get("songs", [])
    covers = {row.get("id"): row.get("album", {}).get("picUrl", "") for row in details if isinstance(row, dict)}
    return [item for row, singer in matched[:4] if (item := _candidate(
        "网易云音乐", str(row.get("name", "")), singer, str(covers.get(row["id"], "")),
        f"https://music.163.com/#/song?id={row['id']}", title, artist))]


def _qq(title: str, artist: str) -> list[dict]:
    query = parse.urlencode({"format": "json", "w": f"{title} {artist}".strip(), "p": 1, "n": 12})
    rows = _json(f"https://c.y.qq.com/soso/fcgi-bin/client_search_cp?{query}", "https://y.qq.com/").get("data", {}).get("song", {}).get("list", [])
    items = []
    for row in rows:
        mid = str(row.get("albummid", ""))
        if not re.fullmatch(r"[A-Za-z0-9]{8,32}", mid):
            continue
        singer = " / ".join(part.get("name", "") for part in row.get("singer", []) if isinstance(part, dict))
        item = _candidate("QQ 音乐", str(row.get("songname", "")), singer,
                          f"https://y.gtimg.cn/music/photo_new/T002R500x500M000{mid}.jpg",
                          f"https://y.qq.com/n/ryqq/songDetail/{row.get('songmid', '')}", title, artist)
        if item:
            items.append(item)
    return items


def _kugou(title: str, artist: str) -> list[dict]:
    query = parse.urlencode({"format": "json", "keyword": f"{title} {artist}".strip(), "page": 1, "pagesize": 12, "showtype": 1})
    rows = _json(f"https://mobiles.kugou.com/api/v3/search/song?{query}", "https://www.kugou.com/").get("data", {}).get("info", [])
    items = []
    for row in rows:
        cover = str(row.get("trans_param", {}).get("union_cover", "")).replace("{size}", "480")
        item = _candidate("酷狗音乐", str(row.get("songname", "")), str(row.get("singername", "")),
                          cover, "https://www.kugou.com/", title, artist)
        if item:
            items.append(item)
    return items


def search_artwork_candidates(title: str, artist: str = "") -> dict:
    """最多返回每来源三张封面；平台接口变动时不影响其他来源。"""
    tasks = (_apple, _netease, _qq, _kugou)
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(task, title, artist) for task in tasks]
        collected = []
        unavailable = []
        for provider, future in zip(PROVIDERS, futures):
            try:
                rows = sorted(future.result(), key=lambda item: item["matchScore"], reverse=True)
                collected.extend(rows[:3])
            except (OSError, ValueError, TypeError, KeyError, AttributeError, json.JSONDecodeError):
                unavailable.append(provider)
    seen = set()
    candidates = []
    for item in sorted(collected, key=lambda row: row["matchScore"], reverse=True):
        if item["artworkUrl"] not in seen:
            candidates.append(item)
            seen.add(item["artworkUrl"])
    return {"candidates": candidates, "unavailable": unavailable}


def fetch_artwork_image(url: str) -> tuple[bytes, str]:
    """仅代理已支持音乐平台的 HTTPS 图片，不允许跳转到其他地址。"""
    parsed = parse.urlsplit(url)
    host = (parsed.hostname or "").lower()
    allowed = (host == "y.gtimg.cn" or host.endswith(".mzstatic.com")
               or host.endswith(".music.126.net") or host.endswith(".kugou.com"))
    if parsed.scheme != "https" or not allowed or parsed.port not in (None, 443) or parsed.username or parsed.password:
        raise ValueError("封面地址不属于受支持的图片来源。")

    class NoRedirect(request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = request.build_opener(NoRedirect)
    req = request.Request(url, headers={"Accept": "image/jpeg,image/png,image/webp", "User-Agent": "Mozilla/5.0 UTA/0.1"})
    with opener.open(req, timeout=12) as response:
        data = response.read(5 * 1024 * 1024 + 1)
        if len(data) > 5 * 1024 * 1024:
            raise ValueError("封面文件过大。")
    if data.startswith(b"\xff\xd8\xff"):
        return data, "image/jpeg"
    if data.startswith(b"\x89PNG"):
        return data, "image/png"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return data, "image/webp"
    raise ValueError("封面网址没有返回受支持的图片。")
