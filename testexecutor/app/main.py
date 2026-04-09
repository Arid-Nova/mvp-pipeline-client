from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import CurlExecuteRequest, JavaExecuteRequest
from .services.curlExecutor import execute_curl_commands
from .services.javaExecutor import execute_java_tests

app = FastAPI(title="Test Execution Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, this should be restricted to our app URL ONLY
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/execute/curl", 
          responses={400: {"description": "Only cURL commands are allowed."}, 
                     500: {"description": "Internal server error during command execution."}})
async def execute_command(req: CurlExecuteRequest):
    # Basic security check to ensure we only run curl commands
    if not req.command.strip().startswith("curl"):
        raise HTTPException(status_code=400, detail="Only cURL commands are allowed.")
    try:
        return execute_curl_commands(req.command)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/execute/java",
          responses={500: {"description": "Internal error during code execution."}})
async def execute_java(req: JavaExecuteRequest):
    code = req.code
    try:
        return execute_java_tests(code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run(app, host="0.0.0.0", port=8001)