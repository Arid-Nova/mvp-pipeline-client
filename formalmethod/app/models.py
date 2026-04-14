from pydantic import BaseModel
from typing import Dict, Any, List

class VerifyRepo(BaseModel):
    repoURL: str
    branch: str
    commitId: str

class VerificationRequest(BaseModel):
    systemName: str
    repos: List[VerifyRepo]
    ir: Dict[str, Any]  

class Suggestion(BaseModel):
    endpoint_name: str
    id: str
    current_role_mask: int
    suggested_role_mask: int
    description: str

class VerificationResponse(BaseModel):
    status: str
    is_satisfiable: bool
    suggestions: List[Suggestion]
    logs: List[str]
    processing_time_seconds: float