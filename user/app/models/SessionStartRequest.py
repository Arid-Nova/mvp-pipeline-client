from pydantic import BaseModel

class SessionStartRequest(BaseModel):
    browser: str
    screen_resolution: str