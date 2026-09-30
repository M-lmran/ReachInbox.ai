"""
ReachInbox platform bridge.

The real application backend is a Node.js/TypeScript/Express service (see /app/server)
running on port 9000, backed by PostgreSQL, Redis and BullMQ. The Emergent platform
ingress routes external /api traffic to this FastAPI process on port 8001, so this
process transparently reverse-proxies every request to the Node backend.
"""
import os

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

NODE_BACKEND = os.environ.get("NODE_BACKEND_URL", "http://127.0.0.1:9000")

app = FastAPI(title="ReachInbox Bridge")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

client = httpx.AsyncClient(base_url=NODE_BACKEND, timeout=120.0)

_HOP_BY_HOP = {
    "content-encoding",
    "content-length",
    "transfer-encoding",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "upgrade",
}


@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy(path: str, request: Request):
    url = "/" + path
    headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
    body = await request.body()
    try:
        upstream = await client.request(
            request.method,
            url,
            params=request.query_params,
            headers=headers,
            content=body,
        )
    except httpx.ConnectError:
        return Response(
            content=b'{"success":false,"error":{"message":"Backend service unavailable","code":"UPSTREAM_DOWN"}}',
            status_code=502,
            media_type="application/json",
        )

    resp_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type"),
    )


@app.on_event("shutdown")
async def _shutdown():
    await client.aclose()
