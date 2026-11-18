from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional

class VerifyRepo(BaseModel):
    repoURL: str
    branch: str
    commitId: str

class VerificationRequest(BaseModel):
    systemName: str
    repos: List[VerifyRepo]
    ir_id: str  
    expectedPolicy: Optional[Dict[str, Any]] = None

class Suggestion(BaseModel):
    endpoint_name: str
    id: str
    current_role_mask: int
    suggested_role_mask: int
    description: str

class VerificationResponse(BaseModel):
    status: str
    is_satisfiable: Optional[bool]
    suggestions: List[Suggestion]
    logs: List[str]
    processing_time_seconds: float
    capability_status: Optional[str] = None
    reason: Optional[str] = None
    unsupported_components: List[str] = Field(default_factory=list)
    observed_security_evidence: Optional[Dict[str, Any]] = None
    policyAnalysis: Optional[Dict[str, Any]] = None
