from typing import Dict, Any
from pydantic import BaseModel

class SystemData(BaseModel):
    components: Dict[str, Any]
    endpoints: Dict[str, Any]