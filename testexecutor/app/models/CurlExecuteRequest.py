from pydantic import BaseModel

class CurlExecuteRequest(BaseModel):
    command: str