import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware

from .utils.verifier import verify_internal_service
from .utils.network import extract_client_ip
from .utils.geolocate import geolocate_ip

from .services.configdb import config_db_service

from .models.FeedbackRequest import FeedbackRequest
from .models.SessionStartRequest import SessionStartRequest
from .models.DemographicsRequest import DemographicsRequest


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await config_db_service.ensure_indexes()
    except Exception as exc:
        logging.warning("Could not ensure MongoDB indexes at startup: %s", exc)
    yield


app = FastAPI(title="User Management Service", lifespan=lifespan)

# Local pipeline app plus any public landing/marketing origins (comma-separated).
origins = ["http://localhost:3000"]
origins += [
    origin.strip()
    for origin in os.getenv("LANDING_ORIGINS", "").split(",")
    if origin.strip()
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
        ip_address = extract_client_ip(request)

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

@app.get("/users/sessions",
         dependencies=[Depends(verify_internal_service)])
async def check_ended_sessions():
    has_ended = await config_db_service.has_ended_sessions()
    return {
        "has_ended_sessions": has_ended
    }

@app.post("/users/demographics")
async def capture_demographics(req: DemographicsRequest, request: Request):
    ip_address = extract_client_ip(request)
    
    ip_geo = await geolocate_ip(ip_address)

    result = await config_db_service.upsert_demographics(
        visitor_id=req.visitor_id,
        profile=req.model_dump(exclude={"visitor_id"}),
        ip_address=ip_address,
        ip_geo=ip_geo,
    )

    return {"message": "Captured", **result}

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "user-service", "description": "User Service is running."}