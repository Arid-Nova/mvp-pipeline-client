from typing import Dict, Any
from pydantic import BaseModel

class GeneratedOutputData(BaseModel):
    """Model for accepting already-generated data for statistics."""
    id: str
    metadata: Dict[str, Any]
    vectors: Dict[str, Any]
