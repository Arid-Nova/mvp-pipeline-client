from pydantic import BaseModel

class PythonExecuteRequest(BaseModel):
    code: str