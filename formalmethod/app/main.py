from fastapi import FastAPI, HTTPException, BackgroundTasks
from app.models import VerificationRequest, VerificationResponse
from app.services.git_manager import GitManager
from app.services.verifier import run_verification
import shutil

app = FastAPI(title="Formal Authorization Verifier")
git_manager = GitManager()

@app.post("/verify", response_model=VerificationResponse)
def verify(request: VerificationRequest, background_tasks: BackgroundTasks):
    repo_path = None
    try:
        # 1. Clone/Fetch Code
        repo_path = git_manager.clone_repo(
            request.repoURL, 
            request.branch, 
            request.commitId
        )

        # 2. Run Analysis
        result = run_verification(request.ir, repo_path)
        
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "OK"}
