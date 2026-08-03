from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class SummaryStep(BaseModel):
    title: str = Field(..., description="The title of the execution step or phase.")
    description: str = Field(..., description="The detailed CoT summary of the results.")
    branchNames: Optional[List[str]] = Field(default=[], description="Names of parallel branches involved in this step.")

class PipelineSummaryRequest(BaseModel):
    nodes: List[Dict[str, Any]] = Field(..., description="The sanitized pipeline nodes containing execution results.")
    connections: List[Dict[str, Any]] = Field(..., description="The directed edges representing the pipeline's execution flow.")

class PipelineSummaryResponse(BaseModel):
    steps: List[SummaryStep] = Field(..., description="The stepped summary of the non-linear pipeline execution.")