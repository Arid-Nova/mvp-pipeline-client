from ..models.schemas import PipelineSummaryRequest, PipelineSummaryResponse
from ..services.summerizer_cot import summarizer_service
from ..services.outbound import get_config

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

        # Fetch LLM config from backend
        user_id = getattr(payload, 'userId', 'default-user')
        provider = getattr(payload, 'provider', 'internal')
        use_external_slm, external_api_base, external_api_key = get_config(user_id, provider)

        result_steps = await summarizer_service.summarize(
            payload.nodes, 
            payload.connections,
            use_external_slm=use_external_slm,
            external_api_base=external_api_base,
            external_api_key=external_api_key
        )
        return PipelineSummaryResponse(steps=result_steps)

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Payload could not be parsed as valid JSON.")
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))