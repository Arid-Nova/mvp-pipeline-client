from fastapi import FastAPI
from app.api.endpoints import router as api_router
from app.core.config import settings
from app.core.compression import GzipRequestMiddleware

app = FastAPI(
    title=settings.api_title,
    version=settings.api_version
)

app.add_middleware(GzipRequestMiddleware)

app.include_router(api_router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "slm-backend"}