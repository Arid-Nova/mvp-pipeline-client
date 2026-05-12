from pydantic import BaseModel


class RepoImportRequest(BaseModel):
    repo_url: str
