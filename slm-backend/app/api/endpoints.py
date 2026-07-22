from fastapi import APIRouter, HTTPException
from app.models.schemas import PipelineSummaryRequest, PipelineSummaryResponse
from app.services.summerizer_cot import summarizer_service
import traceback

router = APIRouter()

@router.post("/summaries", response_model=PipelineSummaryResponse, 
             responses={500: {"description": "Internal server error"}})
async def create_summary(request: PipelineSummaryRequest):
    try:
        result_steps = await summarizer_service.summarize(request.nodes, request.connections)
        print("Recived the results!")
        return PipelineSummaryResponse(steps=result_steps)
    except Exception as e:
        print(f"Error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))