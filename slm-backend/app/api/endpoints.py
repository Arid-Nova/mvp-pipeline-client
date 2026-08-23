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
        
        # Fetch LLM config from backend
        userId = payload.userId
        config_response = requests.get(
            'http://cloudhub_backend:8080/api/llm-config/service/gpt-5-mini',
            params={'userId': userId}
        )
        
        use_external_slm = False
        external_api_base = None
        external_api_key = None
        
        if config_response.status_code == 200:
            config = config_response.json()
            external_api_base = config.get('uri')
            external_api_key = config.get('token')
            use_external_slm = True if external_api_base and external_api_key else False
        
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