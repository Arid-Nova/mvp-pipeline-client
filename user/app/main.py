from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware

from .utils.verifier import verify_internal_service

from .services.configdb import config_db_service

from .models.FeedbackRequest import FeedbackRequest
from .models.SessionStartRequest import SessionStartRequest

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
    

@app.post("/users/session", 
          dependencies=[Depends(verify_internal_service)], 
          responses={
              400: {"description": "Unacceptable Format."}
            })
async def start_new_user_session(req: SessionStartRequest, request: Request):
    try:
        # Extracting the IP address
        ip_address = request.headers.get("X-Forwarded-For") or request.client.host
        if ip_address and "," in ip_address:
            ip_address = ip_address.split(",")[0].strip()

        session_id = await config_db_service.save_new_session(
            browser=req.browser,
            screen_resolution=req.screen_resolution,
            ip_address=ip_address
        )

        return {
            "message": "Started a new session",
            "session_id": session_id
        }
    except():
        raise HTTPException(status_code=400)

@app.post("/users/session/{session_id}/end",
          responses={
              400: {"description": "Invalid session ID format."},
              404: {"description": "Session not found."}
            })
async def end_user_session(session_id: str):
    was_updated = await config_db_service.end_session(session_id)
    
    if not was_updated:
        raise HTTPException(
            status_code=404, 
            detail="Session not found or invalid session ID format."
        )
        
    return {"message": "Session ended successfully"}