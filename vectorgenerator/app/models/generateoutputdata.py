from typing import Dict, Any, Optional
from pydantic import BaseModel

class GeneratedOutputData(BaseModel):
    """Model for accepting already-generated data for statistics."""
    id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    vectors: Optional[Dict[str, Any]] = None
