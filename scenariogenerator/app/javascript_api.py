from fastapi import APIRouter, HTTPException
from .javascript_policy import generate_scenarios

router = APIRouter()


@router.post("/scenarios/javascript")
def javascript_scenarios(payload: dict):
    try:
        return generate_scenarios(payload.get("report"), payload.get("expectedPolicy"))
    except (ValueError, TypeError, KeyError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
