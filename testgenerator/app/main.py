import re
import asyncio

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from dotenv import load_dotenv

from .models.schemas import (
    TestGenerationRequest,
    TestGenerationResponse,
    TestSuiteItem,
    GenerationFailure,
)
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

# Models sometimes wrap output in a markdown fence (```java, ```python, ```bash).
# Strip it for any language rather than just Java.
FENCE_START = re.compile(r'^```[a-zA-Z0-9_+-]*\s*')
FENCE_END = re.compile(r'\s*```$')


def _strip_code_fence(code: str) -> str:
    code = FENCE_START.sub('', code.strip())
    return FENCE_END.sub('', code).strip()


async def process_single_prompt(provider, item):
    """Returns a TestSuiteItem on success, or a GenerationFailure on error.

    A provider failure must never be returned as test code: doing so makes the
    pipeline report success while every "test" is an error message.
    """
    try:
        code = await provider.generate_test(item.prompt)
    except Exception as e:
        return GenerationFailure(scenario_id=item.scenario_id, error=str(e))

    return TestSuiteItem(scenario_id=item.scenario_id, test_code=_strip_code_fence(code))

@app.post("/testsuites/generate", response_model=TestGenerationResponse, 
          responses={400: {"description": "Invalid LLM model or request"}, 
                     500: {"description": "Internal Server Error"}})
async def generate_testsuites(request: TestGenerationRequest):
    try:
        # 1. Instantiate the correct provider using the Factory
        provider = LLMFactory.get_provider(request.llm_model)
        
        # 2. Creating asynchronous tasks for all prompts
        tasks = [process_single_prompt(provider, item) for item in request.prompts]
        
        # 3. Wait for all tasks to complete
        results = await asyncio.gather(*tasks)

        # 4. Separate successes from failures so the caller sees what happened
        tests = [r for r in results if isinstance(r, TestSuiteItem)]
        failures = [r for r in results if isinstance(r, GenerationFailure)]

        if not failures:
            status = "success"
        elif not tests:
            status = "error"
        else:
            status = "partial"

        return TestGenerationResponse(
            status=status,
            tests=tests,
            generated=len(tests),
            failed=len(failures),
            errors=failures,
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
