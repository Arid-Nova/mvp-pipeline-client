from fastapi import APIRouter, HTTPException
from .javascript_policy import generate_vectors

router = APIRouter()


@router.post("/vectors/javascript")
def javascript_vectors(payload: dict):
    try:
        return generate_vectors(payload.get("report"), payload.get("expectedPolicy"))
    except (ValueError, TypeError, KeyError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
