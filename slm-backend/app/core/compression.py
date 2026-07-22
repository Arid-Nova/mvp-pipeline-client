import io
import gzip
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

class GzipRequestMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.headers.get("Content-Encoding") == "gzip":
            body = await request.body()
            decompressed_body = gzip.GzipFile(fileobj=io.BytesIO(body)).read()

            async def receive():
                return {"type": "http.request", "body": decompressed_body}
            
            request._receive = receive
            
            headers = dict(request.scope["headers"])
            headers = {k: v for k, v in headers.items() if k != b"content-encoding"}
            request.scope["headers"] = [(k, v) for k, v in headers.items()]

        return await call_next(request)