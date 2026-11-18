from fastapi import APIRouter, HTTPException
from .javascript_policy import verify_policy, policy_template

router = APIRouter()


@router.post("/verify/javascript")
def verify_javascript(payload: dict):
    try:
        return verify_policy(payload.get("report"), payload.get("expectedPolicy"))
    except (ValueError, TypeError, KeyError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from None


@router.post("/verify/javascript/policy-template")
def javascript_policy_template(payload: dict):
    try:
        return policy_template(payload.get("report"))
    except (ValueError, TypeError, KeyError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
