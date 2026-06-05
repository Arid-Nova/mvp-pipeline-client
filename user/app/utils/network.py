from typing import Optional

from fastapi import Request

def extract_client_ip(request: Request) -> Optional[str]:
    """
    Return the originating client IP for a request.

    Prefers the first hop in ``X-Forwarded-For`` (set when behind a proxy/load
    balancer) and falls back to the direct socket peer.
    """
    ip_address = request.headers.get("X-Forwarded-For") or request.client.host
    if ip_address and "," in ip_address:
        ip_address = ip_address.split(",")[0].strip()
    return ip_address
