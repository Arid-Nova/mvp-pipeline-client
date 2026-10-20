from fastapi import APIRouter, HTTPException
from .services.javascript_executor import execute_suite

router = APIRouter()


@router.post("/api/execute/javascript")
def execute_javascript(payload: dict):
    try:
        return execute_suite(payload)
    except (ValueError, TypeError, KeyError, OSError) as error:
        detail = str(error) if isinstance(error, ValueError) else "Invalid isolated fixture configuration"
        raise HTTPException(status_code=422, detail=detail) from None
