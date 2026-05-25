from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware

from .utils.verifier import verify_internal_service

from .services.configdb import config_db_service

from .models.FeedbackRequest import FeedbackRequest

app = FastAPI(title="User Management Service")

origins = [
    "http://localhost:3000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Authorization", "Content-Type", "X-Internal-Service-Auth"]
)

@app.post("/users/feedback", dependencies=[Depends(verify_internal_service)], 
          responses={400: {"description": "Unacceptable Format."}})
async def save_feedback(req: FeedbackRequest):
    try:
        await config_db_service.save_feedback(req.rating, req.comments)
        return {"message": "Thank you! Your feedback is recorded."}
    except():
        raise HTTPException(status_code=400)