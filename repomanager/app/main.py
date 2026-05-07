from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware

from .utils.verifier import verify_internal_service

from .services.configdb import config_db_service

from .services.repoextractor import fetchorganizationrepos
from .services.llmanalyzer import LLMAnalyzer

from .models.orgimportrequest import OrgImportRequest
from .models.orgimportresponse import OrgImportResponse
from .models.tokenrequest import TokenRequest

import re

app = FastAPI(title="Repo Resolution Proxy")

origins = [
    "http://localhost:3000"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

llm_analyzer = LLMAnalyzer()

@app.post("/import/organization", response_model=OrgImportResponse, 
          responses={400: {"description": "Invalid GitHub Organization URL"}})
async def import_organization(req: OrgImportRequest):
    
    # Extracting organization name from URL 
    # e.g., "https://github.com/Arid-Nova" -> "Arid-Nova"
    match = re.search(r"github\.com/([^/]+)", req.org_url)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid GitHub Organization URL")
    
    org_name = match.group(1)
    condensed_repos = await fetchorganizationrepos(org_name)

    # LLM analysis and response preparation
    return await llm_analyzer.analyze_repos_with_llm(org_name, condensed_repos)

@app.post("/settings/github-token", responses={400: {"description": "Invalid GitHub Token format."}})
async def save_github_token(req: TokenRequest):
    # Basic validation for modern GitHub tokens
    if not req.github_token.startswith(("ghp_", "github_pat_")):
        raise HTTPException(status_code=400, detail="Invalid GitHub Token format.")
    
    await config_db_service.save_token(req.github_token)
    return {"message": "Token securely saved."}

@app.delete("/settings/github-token")
async def delete_github_token():
    await config_db_service.delete_token()
    return {"message": "Token deleted successfully."}

@app.get("/settings/github-token", dependencies=[Depends(verify_internal_service)])
async def get_encrypted_github_token():
    token = await config_db_service.get_token()
    return {"token": token}

@app.get("/settings/github-token/status")
async def check_github_token_status():
    token = await config_db_service.get_token()
    return {"hasToken": token is not None}

# if __name__ == "__main__":
#     import uvicorn
#     # Run on port 8020 as requested
#     uvicorn.run(app, host="127.0.0.1", port=8020)