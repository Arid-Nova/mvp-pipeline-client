from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from .models import VerificationRequest, VerificationResponse
from .services.git_manager import GitManager
from .services.verifier import run_verification

app = FastAPI(title="Formal Authorization Verifier")

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

git_manager = GitManager()

@app.post("/verify", response_model=VerificationResponse)
def verify(request: VerificationRequest, background_tasks: BackgroundTasks):
    repo_path = None

    try:
        # Currently the formal methods support mono-repo security extraction.
        # Hence, we only consider the first repository in the list for cloning and analysis. 

        # 1. Clone/Fetch Code
        repo_path = git_manager.clone_repo(
            request.repos[0].repoURL, 
            request.repos[0].branch, 
            request.repos[0].commitId
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
