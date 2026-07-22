import gzip
import io
from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse
import traceback

class GzipRequestMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.headers.get("content-encoding") == "gzip":
            body = await request.body()
            
            try:
                decompressed_body = gzip.GzipFile(fileobj=io.BytesIO(body)).read()
            except Exception as e:
                print(f"Decompression failed: {e}")
                traceback.print_exc()
                return JSONResponse(status_code=400, content={"detail": "Failed to decompress gzip payload."})
            
            async def receive():
                return {
                    "type": "http.request", 
                    "body": decompressed_body,
                    "more_body": False 
                }
            
            request._receive = receive
            
            headers = dict(request.scope["headers"])
            headers = {
                k: v for k, v in headers.items() 
                if k.lower() not in (b"content-encoding", b"content-length")
            }
            request.scope["headers"] = [(k, v) for k, v in headers.items()]

        return await call_next(request)