from pydantic import BaseModel


class RepoImportResponse(BaseModel):
    name: str
    repoUrl: str
    defaultBranch: str
    latestCommit: str
