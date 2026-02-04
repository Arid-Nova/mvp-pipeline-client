from fastapi import FastAPI, HTTPException, BackgroundTasks
from .models import VerificationRequest, VerificationResponse
from .services.git_manager import GitManager
from .services.verifier import run_verification

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

# Use for local testing
# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run("main:app", host="0.0.0.0", port=9000)
