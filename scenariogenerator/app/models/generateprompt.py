from typing import Dict, Any, List, Optional
from pydantic import BaseModel

class GeneratePromptsRequest(BaseModel):
    scenario_ids: Optional[List[str]] = None
    scenarios: Optional[List[Dict[str, Any]]] = None
    template_id: Optional[str] = None