from typing import Dict, Any, Optional
from pydantic import BaseModel

class SystemData(BaseModel):
    components: Optional[Dict[str, Any]] = None
    endpoints: Optional[Dict[str, Any]] = None