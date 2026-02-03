from pydantic import BaseModel
from typing import Dict, Any, Optional, List

class VerificationRequest(BaseModel):
    systemName: str
    repoURL: str
    branch: Optional[str] = "master"
    commitId: Optional[str] = None
    ir: Dict[str, Any]  

class Suggestion(BaseModel):
    endpoint_name: str
    current_role_mask: int
    suggested_role_mask: int
    description: str

class VerificationResponse(BaseModel):
    status: str
    is_satisfiable: bool
    suggestions: List[Suggestion]
    logs: List[str]
    processing_time_seconds: float