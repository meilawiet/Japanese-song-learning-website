"""在电脑和手机之间临时传送网页已保存的歌曲，不连接云服务。"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import re
import secrets
import socket
import tempfile
import threading
import time
from pathlib import Path
from typing import Any
from contextlib import asynccontextmanager
from collections import deque

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from zeroconf import ServiceInfo, Zeroconf


SIGNATURE = b"UTA-LEARNING-BACKUP\n"
MAX_MANIFEST_BYTES = 16 * 1024 * 1024
MAX_BACKUP_BYTES = 2 * 1024 * 1024 * 1024
SESSION_SECONDS = 30 * 60
CHUNK_BYTES = 1024 * 1024
# 恢复 USB 调试映射后，USB 和 Wi-Fi 共用四位数字码；限制连续猜测。
PIN_FAILURE_WINDOW = 60
MAX_PIN_FAILURES = 5
CACHE_DIR = Path(__file__).resolve().parents[1] / ".tools" / "phone-transfer"
# 手机只查找 UTA 的传歌服务，不扫描整段局域网地址。
DISCOVERY_SERVICE_TYPE = "_utatransfer._tcp.local."
DISCOVERY_PORT = 8765


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 进程重启时删除上次异常退出留下的测试传歌文件。
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for path in CACHE_DIR.glob("*.uta-backup"):
        if path.resolve().parent == CACHE_DIR.resolve():
            path.unlink(missing_ok=True)

    async def cleanup_loop():
        while True:
            await asyncio.sleep(60)
            remove_expired()

    task = asyncio.create_task(cleanup_loop())
    # 启动时向局域网公布电脑地址；注册失败不影响 USB 调试映射与手动地址传歌。
    discovery = None
    discovery_info = None
    try:
        addresses = local_addresses()
        if addresses:
            discovery = Zeroconf()
            discovery_info = ServiceInfo(
                DISCOVERY_SERVICE_TYPE,
                f"UTA Transfer {socket.gethostname()}-{secrets.token_hex(3)}.{DISCOVERY_SERVICE_TYPE}",
                addresses=[socket.inet_aton(address) for address in addresses],
                port=DISCOVERY_PORT,
                properties={"app": "uta", "version": "1"},
            )
            await asyncio.to_thread(discovery.register_service, discovery_info)
    except (OSError, ValueError) as exc:
        print(f"[UTA] 局域网自动发现不可用，可在手机手动填写电脑地址：{exc}")
        if discovery is not None:
            await asyncio.to_thread(discovery.close)
        discovery = None
        discovery_info = None
    try:
        yield
    finally:
        if discovery is not None:
            if discovery_info is not None:
                await asyncio.to_thread(discovery.unregister_service, discovery_info)
            await asyncio.to_thread(discovery.close)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        with SESSIONS_LOCK:
            sessions = list(SESSIONS.values())
            SESSIONS.clear()
        for session in sessions:
            # 旧实现保留作对照：Path(session["path"]).unlink(missing_ok=True)
            session["file"].close()


app = FastAPI(title="UTA phone transfer", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

# 会话只存在于此进程的内存；文件也只保留半小时，避免形成另一份长期歌曲库。
SESSIONS: dict[str, dict[str, Any]] = {}
SESSIONS_LOCK = threading.Lock()
# 旧实现保留作对照：四位码仅供本机 USB 映射使用；Wi-Fi 使用长连接码。
# 两种连接方式都需要通过相同的短码验证。
FAILED_PIN_ATTEMPTS: deque[float] = deque()


def local_addresses() -> list[str]:
    """返回电脑的局域网 IPv4 地址，供手机连接同一 Wi-Fi 时填写。"""
    addresses: set[str] = set()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("8.8.8.8", 80))
            addresses.add(probe.getsockname()[0])
    except OSError:
        pass
    try:
        addresses.update(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    # 只显示实际可用于家用或办公局域网的私有地址。
    networks = tuple(ipaddress.ip_network(cidr) for cidr in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))
    return sorted(address for address in addresses if any(ipaddress.ip_address(address) in network for network in networks))


def remove_expired() -> None:
    """访问时清理过期会话；只删除本服务自己创建的精确文件。"""
    now = time.time()
    with SESSIONS_LOCK:
        expired = [code for code, session in SESSIONS.items() if session["expires_at"] < now]
        for code in expired:
            session = SESSIONS.pop(code)
            # 旧实现保留作对照：Path(session["path"]).unlink(missing_ok=True)
            session["file"].close()


def require_session(code: str, request: Request) -> dict[str, Any]:
    remove_expired()
    with SESSIONS_LOCK:
        # 旧实现保留作对照：session = SESSIONS.get(code)
        if re.fullmatch(r"[0-9]{4}", code):
            # 旧实现保留作对照：非本机地址曾被禁止使用四位码。
            # 同一 Wi-Fi 的手机也能访问此接口，输错次数由所有连接共用。
            now = time.time()
            while FAILED_PIN_ATTEMPTS and FAILED_PIN_ATTEMPTS[0] <= now - PIN_FAILURE_WINDOW:
                FAILED_PIN_ATTEMPTS.popleft()
            if len(FAILED_PIN_ATTEMPTS) >= MAX_PIN_FAILURES:
                raise HTTPException(429, "四位码尝试次数过多，请一分钟后重试。")
            session = next((item for item in SESSIONS.values() if item["pin"] == code), None)
            if session is None:
                FAILED_PIN_ATTEMPTS.append(now)
        else:
            # 旧实现保留作对照：session = SESSIONS.get(code)
            # 长随机码只给电脑网页关闭共享使用，不再作为手机取歌凭据。
            session = None
    if session is None:
        raise HTTPException(404, "传歌连接不存在或已过期，请在电脑网页重新开启。")
    return session


def inspect_backup(source) -> tuple[dict[str, Any], int]:
    """检查备份的长度与歌曲位置，防止越界读取或恶意大文件。"""
    # 旧实现保留作对照：size = path.stat().st_size; with path.open("rb") as source:
    source.seek(0, 2)
    size = source.tell()
    source.seek(0)
    prefix = source.read(len(SIGNATURE) + 4)
    if len(prefix) != len(SIGNATURE) + 4 or not prefix.startswith(SIGNATURE):
        raise ValueError("网页数据不是有效的 UTA 备份。")
    metadata_size = int.from_bytes(prefix[len(SIGNATURE):], "little")
    if metadata_size <= 0 or metadata_size > MAX_MANIFEST_BYTES:
        raise ValueError("歌曲资料大小无效。")
    metadata = source.read(metadata_size)
    try:
        manifest = json.loads(metadata.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("无法读取网页歌曲资料。") from exc
    songs = manifest.get("songs") if isinstance(manifest, dict) else None
    # 原来仅接受 version=1；v2 明确支持纯歌词与空时间戳。
    if not isinstance(manifest, dict) or manifest.get("version") not in (1, 2) \
        or not isinstance(songs, list) or not 0 < len(songs) <= 1000:
        raise ValueError("网页歌曲资料格式无效，或没有可传送的歌曲。")
    expected_offset = 0
    seen_ids: set[str] = set()
    for song in songs:
        audio = song.get("audio") if isinstance(song, dict) else None
        song_id = song.get("id") if isinstance(song, dict) else None
        no_audio = isinstance(song, dict) and song.get("lyricsOnly") is True and audio is None and manifest["version"] == 2
        if not isinstance(song_id, str) or not song_id.startswith("local-") or song_id in seen_ids \
            or not isinstance(song.get("title"), str) or not isinstance(song.get("artist"), str) \
            or not isinstance(song.get("lines"), list) \
            or (not no_audio and (not isinstance(audio, dict) \
                or not isinstance(audio.get("size"), int) or audio["size"] <= 0 \
                or audio.get("offset") != expected_offset)):
            raise ValueError("网页歌曲或音频资料格式无效。")
        seen_ids.add(song_id)
        # 原 expected_offset += audio["size"]；纯歌词不占音频字节。
        expected_offset += audio["size"] if audio else 0
    audio_start = len(SIGNATURE) + 4 + metadata_size
    if audio_start + expected_offset != size:
        raise ValueError("网页音频数据不完整。")
    return manifest, audio_start


@app.get("/api/transfer/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "addresses": local_addresses(), "port": 8765}


@app.post("/api/transfer/session")
async def create_session(request: Request) -> dict[str, Any]:
    # 只有这台电脑本机打开的 UTA 网页能提交完整歌曲数据。
    if request.client is None or request.client.host not in {"127.0.0.1", "::1"} \
        or request.headers.get("origin") not in {"http://localhost:5173", "http://127.0.0.1:5173"}:
        raise HTTPException(403, "请从这台电脑上的 UTA 网页开启传歌。")
    remove_expired()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    code = secrets.token_urlsafe(9)
    # 旧实现保留作对照：path = CACHE_DIR / f"{code}.uta-backup"
    # 系统临时文件在进程退出时自动关闭并删除，避免窗口被直接关闭后留下歌曲。
    target = tempfile.TemporaryFile(mode="w+b", dir=CACHE_DIR)
    total = 0
    try:
        async for chunk in request.stream():
            total += len(chunk)
            if total > MAX_BACKUP_BYTES:
                raise ValueError("歌曲总大小超过 2 GB，请分批传送。")
            target.write(chunk)
        manifest, audio_start = inspect_backup(target)
    except (OSError, ValueError) as exc:
        # 旧实现保留作对照：path.unlink(missing_ok=True)
        target.close()
        raise HTTPException(400, str(exc)) from exc
    expires_at = time.time() + SESSION_SECONDS
    with SESSIONS_LOCK:
        used_pins = {session["pin"] for session in SESSIONS.values()}
        if len(used_pins) >= 10000:
            target.close()
            raise HTTPException(503, "当前传歌连接过多，请稍后重试。")
        # 旧实现保留作对照：usb_pin = f"{secrets.randbelow(10000):04d}"
        pin = f"{secrets.randbelow(10000):04d}"
        while pin in used_pins:
            pin = f"{secrets.randbelow(10000):04d}"
        SESSIONS[code] = {"file": target, "file_lock": threading.Lock(), "pin": pin, "manifest": manifest,
                          "audio_start": audio_start, "expires_at": expires_at}
    # 长随机码留在电脑网页中管理共享；手机只需要四位数字码。
    return {"code": code, "pin": pin, "addresses": local_addresses(), "expires_at": expires_at, "count": len(manifest["songs"])}


@app.get("/api/transfer/session/{code}")
def list_songs(code: str, request: Request) -> dict[str, Any]:
    session = require_session(code, request)
    manifest = session["manifest"]
    # 只传歌曲和学习资料；备份格式本身就不包含 API 密钥。
    return {"songs": manifest["songs"], "progress": manifest["progress"],
            "annotations": manifest["annotations"], "aiReviews": manifest["aiReviews"],
            "sentenceExplanations": manifest.get("sentenceExplanations", {}),
            "expires_at": session["expires_at"]}


@app.get("/api/transfer/session/{code}/song/{song_id}/audio")
def song_audio(code: str, song_id: str, request: Request, offset: int = Query(0, ge=0), length: int = Query(CHUNK_BYTES, ge=1, le=CHUNK_BYTES)) -> StreamingResponse:
    session = require_session(code, request)
    song = next((item for item in session["manifest"]["songs"] if item["id"] == song_id), None)
    # 无音频的歌曲只能取得歌词资料，音频接口明确返回不存在。
    if song is None or song.get("audio") is None or offset >= song["audio"]["size"]:
        raise HTTPException(404, "歌曲或音频片段不存在。")
    count = min(length, song["audio"]["size"] - offset)
    position = session["audio_start"] + song["audio"]["offset"] + offset

    def read_chunk():
        # 旧实现保留作对照：with Path(session["path"]).open("rb") as source:
        with session["file_lock"]:
            source = session["file"]
            source.seek(position)
            data = source.read(count)
        yield data

    return StreamingResponse(read_chunk(), media_type="application/octet-stream", headers={"Content-Length": str(count)})


@app.delete("/api/transfer/session/{code}")
def close_session(code: str, request: Request) -> dict[str, bool]:
    if request.client is None or request.client.host not in {"127.0.0.1", "::1"}:
        raise HTTPException(403, "请在电脑上结束传歌。")
    with SESSIONS_LOCK:
        session = SESSIONS.pop(code, None)
    if session:
        # 旧实现保留作对照：Path(session["path"]).unlink(missing_ok=True)
        session["file"].close()
    return {"closed": True}
