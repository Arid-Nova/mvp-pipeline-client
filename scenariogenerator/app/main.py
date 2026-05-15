import gzip
import json
import traceback
from contextlib import asynccontextmanager

from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, Request, APIRouter, HTTPException

from .logic import scenario_generation_pipeline

from .services.data_service import DataService

from .models.generateprompt import GeneratePromptsRequest
from .models.generatescenarios import GenerateScenariosRequest

from .prompt_generator import generate_prompts
from .insights_generator import ImpactInsightGenerator

df_service = None
insight_gen = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global df_service
    global insight_gen
    
    try:
        df_service = DataService()
        insight_gen = ImpactInsightGenerator()
    except Exception as e:
        print(f"CRITICAL ERROR during startup: {e}")

    yield 

app = FastAPI(title="AI Test Generator API", lifespan=lifespan)

origins = [
    "http://localhost:3000", "https://aridnova-demo.eastus.cloudapp.azure.com",
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
analysis_router = APIRouter(prefix="/analysis")

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

@analysis_router.post("/impact-insights", responses=
             {400: {"description": "Invalid payload or corrupted compression"},
              500: {"description": "Insight generation failed"}})
async def get_change_impact_insights(request: Request):
    """
    Analyzes calculated blast radius data and returns AI-generated 
    architectural risk assessments.
    """
    try:
        body = await request.body()

        if request.headers.get("Content-Encoding") == "gzip":
            try:
                body = gzip.decompress(body)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid GZIP compression")

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

        insight = await insight_gen.generate_impact_insights(data)
        return {
            "status": "success",
            "insight": insight
        }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Insight generation failed: {str(e)}")

app.include_router(router)
app.include_router(analysis_router)

# if __name__ == '__main__':
#     import uvicorn
#     uvicorn.run("main:app", host="0.0.0.0", port=8040, reload=True)