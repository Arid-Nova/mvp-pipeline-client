from fastapi import APIRouter, HTTPException
from .javascript_policy import generate_suite

router = APIRouter()


@router.post("/testsuites/javascript")
def javascript_testsuite(payload: dict):
    try:
        return generate_suite(payload.get("report"), payload.get("expectedPolicy"))
    except (ValueError, TypeError, KeyError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
