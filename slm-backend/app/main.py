from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .api.endpoints import router as api_router

app = FastAPI(
    title=settings.api_title,
    version=settings.api_version
)

origins = [
    "http://localhost:3000"
]

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
    return {"status": "ok", "service": "slm-backend", "description": "SLM Backend is running."}

# if __name__ == "__main__":
#     import uvicorn
#     # Run on port 8071 as requested
#     uvicorn.run(app, host="127.0.0.1", port=8071)