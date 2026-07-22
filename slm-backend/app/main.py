from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.compression import GzipRequestMiddleware

from app.core.config import settings
from app.api.endpoints import router as api_router

app = FastAPI(
    title=settings.api_title,
    version=settings.api_version
)

origins = [
    "http://localhost:3000"
]

app.add_middleware(GzipRequestMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Authorization", "Content-Type", "X-Internal-Service-Auth"],
)

app.include_router(api_router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "slm-backend"}