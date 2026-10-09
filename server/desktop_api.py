"""Private, portable desktop API. The parent owns the process via stdin."""
from __future__ import annotations

import hmac
import json
import os
import socket
import sys
import threading

import uvicorn
from starlette.responses import JSONResponse


def main() -> None:
    # A fresh secret travels through a pipe, never through process arguments.
    settings = json.loads(sys.stdin.readline())
    token = settings.get("token", "")
    if not isinstance(token, str) or len(token) < 32:
        raise ValueError("Missing desktop session token")

    def watch_parent() -> None:
        for _ in sys.stdin:
            pass
        os._exit(0)

    threading.Thread(target=watch_parent, daemon=True).start()
    from app import app, get_tokenizer

    @app.middleware("http")
    async def authorize(request, call_next):
        if not hmac.compare_digest(request.headers.get("x-uta-desktop-token", ""), token):
            return JSONResponse({"detail": "Desktop session required"}, status_code=403)
        return await call_next(request)

    # Fail visibly during startup if the packaged Sudachi dictionary is missing.
    get_tokenizer()
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(("127.0.0.1", 0))
    print("UTA_BACKEND_READY " + json.dumps({"port": listener.getsockname()[1]}), flush=True)
    configuration = uvicorn.Config(app, host="127.0.0.1", log_level="warning", access_log=False,
                                   loop="asyncio", http="h11", ws="none")
    try:
        uvicorn.Server(configuration).run(sockets=[listener])
    finally:
        listener.close()


if __name__ == "__main__":
    main()
