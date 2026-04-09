from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import subprocess
import shlex

app = FastAPI(title="Test Execution Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, this should be restricted to our app URL ONLY
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExecuteRequest(BaseModel):
    command: str

@app.post("/api/execute/curl")
async def execute_command(req: ExecuteRequest):
    # Basic security check to ensure we only run curl commands
    if not req.command.strip().startswith("curl"):
        raise HTTPException(status_code=400, detail="Only cURL commands are allowed.")
    
    try:
        args = shlex.split(req.command)
        
        # Execute the command (shell=False prevents shell injection attacks)
        result = subprocess.run(args, capture_output=True, text=True, timeout=15)
        
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Command execution timed out after 15 seconds.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run(app, host="0.0.0.0", port=8001)