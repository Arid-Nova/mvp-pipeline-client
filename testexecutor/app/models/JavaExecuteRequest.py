from pydantic import BaseModel

class JavaExecuteRequest(BaseModel):
    code: str