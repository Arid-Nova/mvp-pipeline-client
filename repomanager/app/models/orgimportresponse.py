from pydantic import BaseModel

from .repodata import RepoData

class OrgImportResponse(BaseModel):
    proposedSystemName: str
    relevantRepos: list[RepoData]
    suggestedRepos: list[RepoData]