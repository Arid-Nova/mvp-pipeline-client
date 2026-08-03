from fastapi import APIRouter, HTTPException
from ..models.schemas import PipelineSummaryRequest, PipelineSummaryResponse
from ..services.summerizer_cot import summarizer_service
import traceback

import gzip
import json
from fastapi import APIRouter, Request, HTTPException
from pydantic import ValidationError

router = APIRouter()

@router.post("/summaries", response_model=PipelineSummaryResponse, 
             responses={500: {"description": "Internal server error"}})
async def create_summary(request: Request):
    try:
        raw_body = await request.body()

        try:
            decompressed_bytes = gzip.decompress(raw_body)
        except Exception:
            decompressed_bytes = raw_body

        json_data = json.loads(decompressed_bytes)
        payload = PipelineSummaryRequest(**json_data)
        result_steps = await summarizer_service.summarize(payload.nodes, payload.connections)
        
        return PipelineSummaryResponse(steps=result_steps)

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Payload could not be parsed as valid JSON.")
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))