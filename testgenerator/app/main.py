import asyncio, requests

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from dotenv import load_dotenv

from .models.schemas import TestGenerationRequest, TestGenerationResponse, TestSuiteItem
from .services.llm_factory import LLMFactory

load_dotenv()

app = FastAPI(title="Test Suite Generation Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def process_single_prompt(provider, item) -> TestSuiteItem:
    code = await provider.generate_test(item.prompt)
    
    if code.startswith("```java"):
        code = code[7:]
    if code.endswith("```"):
        code = code[:-3]
        
    return TestSuiteItem(scenario_id=item.scenario_id, test_code=code.strip())

@app.post("/testsuites/generate", response_model=TestGenerationResponse, 
          responses={400: {"description": "Invalid LLM model or request"}, 
                     500: {"description": "Internal Server Error"}})

async def generate_testsuites(request: TestGenerationRequest):
    try:
        # Fetch LLM config from backend
        config_response = requests.get(
            'http://cloudhub_backend:8080/api/llm-config/service/gpt-5-mini',
            params={'userId': request.userId}
        )
        
        llm_uri = None
        llm_token = None
        
        if config_response.status_code == 200:
            config = config_response.json()
            llm_uri = config.get('uri')
            llm_token = config.get('token')
        
        # 1. Instantiate the correct provider using the Factory
        provider = LLMFactory.get_provider(request.llm_model, llm_uri, llm_token)
        
        # 2. Creating asynchronous tasks for all prompts
        tasks = [process_single_prompt(provider, item) for item in request.prompts]
        
        # 3. Wait for all tasks to complete
        generated_tests = await asyncio.gather(*tasks)
        return TestGenerationResponse(
            status="success",
            tests=list(generated_tests)
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "test-generator", "description": "Test Generator Service is running."}

# if __name__ == "__main__":
#     import uvicorn
#     # Run on port 8030 as requested
#     uvicorn.run(app, host="0.0.0.0", port=8030)