from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from .models import VerificationRequest, VerificationResponse
from .services.git_manager import GitManager
from .services.verifier import run_verification, _getIRData
from .services.authorization_capability import unsupported_authorization

app = FastAPI(title="Formal Authorization Verifier")
from .javascript_api import router as javascript_router
app.include_router(javascript_router)

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
    repo_mappings = []

    try:
        # Unsupported source input must not trigger a source clone or solver.
        ir_data = _getIRData(request.ir_id)
        if unsupported_authorization(ir_data):
            return run_verification(request.ir_id, [], ir_data=ir_data, expected_policy=request.expectedPolicy)

        # 1. Clone/Fetch Code
        repo_mappings = git_manager.clone_repos_concurrently(request.repos)

        # 2. Run Analysis
        result = run_verification(request.ir_id, repo_mappings, ir_data=ir_data)
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "formal-method", "description": "Formal Method Service is running."}

# Use for local testing
# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run("main:app", host="0.0.0.0", port=9000)
