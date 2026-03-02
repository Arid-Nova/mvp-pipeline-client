from pydantic import BaseModel
from typing import Any, Optional

class GenerateScenariosRequest(BaseModel):
    vectors_id: str
    index_id: str
    template_id: Optional[str] = None

class FullGenerateScenariosRequest():
    all_vectors: Any
    endpoints: Any 
    components: Any 

    def __init__(self, all_vectors: Any, endpoints: Any, components: Any):
        self.all_vectors = all_vectors
        self.endpoints = endpoints
        self.components = components