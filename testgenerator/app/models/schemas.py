from pydantic import BaseModel
from typing import List, Optional

class PromptItem(BaseModel):
    scenario_id: str
    prompt: str

class TestGenerationRequest(BaseModel):
    llm_model: str
    prompts: List[PromptItem]
    userId: str

class TestSuiteItem(BaseModel):
    scenario_id: str
    test_code: str

class GenerationFailure(BaseModel):
    scenario_id: str
    error: str

class TestGenerationResponse(BaseModel):
    status: str
    tests: List[TestSuiteItem]
    generated: int = 0
    failed: int = 0
    errors: List[GenerationFailure] = []
