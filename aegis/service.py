import os
import json
import tempfile
import configparser
import dataclasses
from contextlib import asynccontextmanager

from typing import Dict, Any, List
from fastapi.middleware.cors import CORSMiddleware

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from main import AnalysisFacade

facade = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Checking configuration...")
    config = configparser.ConfigParser()
    files_read = config.read('config.ini')
    
    if not files_read:
        print("WARNING: config.ini not found! Please ensure it exists in the container.")
    
    global facade
    print("Initializing Aegis Analysis Engine...")
    
    config_dict = {s: dict(config.items(s)) for s in config.sections()}
    
    try:
        facade = AnalysisFacade(config_dict)
        print("Aegis Engine initialized successfully.")
    except Exception as e:
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

@app.get("/health")
def health_check():
    if facade:
        return {"status": "healthy", "service": "Aegis Analysis Engine"}
    else:
        raise HTTPException(status_code=503, detail="Engine not initialized")

@app.post("/analyze")
async def analyze_endpoint(payload: Dict[str, Any]):
    global facade
    if not facade:
        raise HTTPException(status_code=500, detail="Analysis service not initialized. Check server logs.")

    # 1. Write the incoming JSON to a temporary file.
    temp_file = tempfile.NamedTemporaryFile(mode='w+', suffix='.json', delete=False)
    json.dump(payload, temp_file)
    temp_file.close()
    temp_path = temp_file.name

    try:
        # 2. Dynamically override the 'ir_path' in the loaded configuration
        original_path = facade.config.get('REPOSITORY', {}).get('ir_path')
        
        if 'REPOSITORY' not in facade.config:
            facade.config['REPOSITORY'] = {}
            
        facade.config['REPOSITORY']['ir_path'] = temp_path

        # 3. Run the analysis using your existing logic
        print(f"[INFO] Starting analysis on temp file: {temp_path}")
        analyzed_paths = facade.run_analysis()

        # 4. Format the output
        results = []
        if analyzed_paths:
            for path in analyzed_paths:
                # Convert dataclass to dict
                path_dict = dataclasses.asdict(path)
                path_dict.pop("method_flow", None)             
                results.append(path_dict)

        # Restore the configuration
        if original_path:
            facade.config['REPOSITORY']['ir_path'] = original_path

        # facade.save_results(results, 'opinion_vector_results.json')

        return {"status": "success", "results": results}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Use for local testing
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("service:app", host="0.0.0.0", port=8900)