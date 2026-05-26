import os
from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="X-Internal-Service-Auth", auto_error=True)

@staticmethod
def verify_internal_service(api_key_header: str = Security(api_key_header)):
    expected_key = os.getenv("INTERNAL_SERVICE_KEY")
    if not expected_key or api_key_header != expected_key:
        raise HTTPException(status_code=403, detail="Unauthorized internal service call")
    return api_key_header