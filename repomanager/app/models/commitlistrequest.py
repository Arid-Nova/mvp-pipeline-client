from pydantic import BaseModel, Field


class CommitListRequest(BaseModel):
    repo_url: str
    branch: str
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=10, ge=1, le=100)
