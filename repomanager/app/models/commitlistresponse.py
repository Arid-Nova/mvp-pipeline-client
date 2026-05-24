from pydantic import BaseModel

class CommitInfo(BaseModel):
    sha: str
    message: str
    author: str
    date: str


class CommitListResponse(BaseModel):
    commits: list[CommitInfo]
    page: int
    perPage: int
    hasMore: bool
