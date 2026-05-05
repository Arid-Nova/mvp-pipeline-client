from pydantic import BaseModel

class RepoData(BaseModel):
    url: str
    branch: str
    branches: list[str] = []
    commitMap: dict[str, str] = {}