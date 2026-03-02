from .systemdata import SystemData

class GenerateAllRequest(SystemData):
    lean: bool = False
    indexId: str 
    