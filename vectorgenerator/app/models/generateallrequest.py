from .systemdata import SystemData
from typing import Optional

class GenerateAllRequest(SystemData):
    lean: bool = False
    indexId: Optional[str] = None
    