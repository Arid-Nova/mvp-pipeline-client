
from pydantic import BaseModel

class OrgImportRequest(BaseModel):
    org_url: str