from pydantic import BaseModel, Field


class RepoImportResponse(BaseModel):
    name: str
    repoUrl: str
    defaultBranch: str
    latestCommit: str
    branches: list[str] = Field(default_factory=list)
    commitMap: dict[str, str] = Field(default_factory=dict)
