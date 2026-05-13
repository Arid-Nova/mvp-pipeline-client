from pydantic import BaseModel
from typing import List, Dict

class ChangeImpactMetric(BaseModel):
    added: int
    modified: int
    deleted: int

class CriticalImpact(BaseModel):
    source: str
    target: str
    status: str
    riskScore: float

class AnalysisRequest(BaseModel):
    metrics: ChangeImpactMetric
    affectedServices: List[str]
    riskFactors: Dict[str, List[str]]
    criticalImpacts: List[CriticalImpact]