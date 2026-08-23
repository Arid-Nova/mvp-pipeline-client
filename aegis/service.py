import configparser, requests
from contextlib import asynccontextmanager

import os
from time import time
from typing import Dict, Any
from fastapi.middleware.cors import CORSMiddleware

from fastapi import FastAPI, HTTPException

from main import AnalysisFacade

facade = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Checking configuration...")
    config = configparser.ConfigParser()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    files_read = config.read(os.path.join(script_dir, 'config.ini'))
    
    if not files_read:
        print("WARNING: config.ini not found! Please ensure it exists in the container.")
    
    global facade
    print("Initializing Aegis Analysis Engine...")

    # Allow explicit env override for runtime flexibility in containers.
    try:
        facade = AnalysisFacade()
        print("Aegis Engine initialized successfully.")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"CRITICAL ERROR during startup: {e}")

    yield  

    print("Shutting down Aegis Engine...")
    if facade:
        facade.cleanup()
    print("Cleanup complete.")

app = FastAPI(title="Aegis Security Analysis API", lifespan=lifespan)

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

@app.get("/health", 
         responses={503: {"description": "Engine not initialized"}})
def health_check():
    if facade:
        return {"status": "healthy", "description": "Aegis Analysis Engine"}
    else:
        raise HTTPException(status_code=503, detail="Engine not initialized")

@app.post("/analyze", 
          responses={500: {"description": "Internal Error"}})

async def analyze_endpoint(payload: Dict[str, Any]):
    global facade
    if not facade:
        raise HTTPException(status_code=500, detail="Analysis service not initialized. Check server logs.")

    try:
        print("[INFO] Starting introspection!")
        
        # Fetch LLM config from backend
        userId = payload.get('userId', 'default-user')
        config_response = requests.get(
            'http://cloudhub_backend:8080/api/llm-config/service/gpt-5-mini',
            params={'userId': userId}
        )
        
        llm_uri = None
        llm_token = None
        
        if config_response.status_code == 200:
            config = config_response.json()
            llm_uri = config.get('uri')
            llm_token = config.get('token')
        
        results = facade.run_analysis(payload, llm_uri=llm_uri, llm_token=llm_token)

        if 'vulnerabilities' in results:
            return {"status": "success"}

        facade.get_latent_vulnerabilities(payload['ir_id'], results, llm_uri=llm_uri, llm_token=llm_token)
        return {"status": "success"}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
# Use for local testing
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("service:app", host="0.0.0.0", port=8900)
