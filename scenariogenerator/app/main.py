
import traceback
from contextlib import asynccontextmanager

from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, APIRouter, HTTPException

from .logic import scenario_generation_pipeline

from .services.data_service import DataService

from .models.generatescenarios import GenerateScenariosRequest
from .models.generateprompt import GeneratePromptsRequest

from .prompt_generator import generate_prompts

df_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global df_service
    
    try:
        df_service = DataService()
    except Exception as e:
        print(f"CRITICAL ERROR during startup: {e}")

    yield 

app = FastAPI(title="AI Test Generator API", lifespan=lifespan)

origins = [
    "http://localhost:3000",
    "http://localhost:8060"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,   
    allow_credentials=True,
    allow_methods=["*"],        
    allow_headers=["*"],        
)

router = APIRouter(prefix="/scenarios")

@router.post("/generate", responses=
             {500: {"description": "Scenario generation failed"}})
async def create_scenarios(request: GenerateScenariosRequest):
    """Generate and enrich LLM-ready authorization scenarios."""
    global df_service

    try:
        result = scenario_generation_pipeline(request, df_service)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Scenario generation failed: {str(e)}")


@router.post("/prompts/generate", responses=
             {404: {"description": "No valid scenarios found for provided IDs"},
              500: {"description": "Prompt generation failed"}})
async def create_prompts(request: GeneratePromptsRequest):
    """Generate test generation prompts from LLM-ready scenarios."""
    try:
        scenarios_list = []
        if request.scenario_ids:
            scenarios_list = df_service.fetch_scenarios_by_ids(request.scenario_ids)

            if not scenarios_list:
                raise HTTPException(status_code=404, detail="No valid scenarios found for provided IDs")
        
        elif request.scenarios:
            scenarios_list.extend(request.scenarios)

        # Pass the language parameter down to the generator
        prompts = generate_prompts(
            scenarios_list, 
            template_filter=request.template_id,
            language=request.language
        )
        
        return {
            "status": "success",
            "language": request.language,
            "count": len(prompts),
            "prompts": prompts
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Prompt generation failed: {str(e)}")


app.include_router(router)

# if __name__ == '__main__':
#     import uvicorn
#     uvicorn.run("main:app", host="0.0.0.0", port=8040, reload=True)