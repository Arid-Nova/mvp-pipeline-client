import os
import ipaddress
from typing import Optional

import httpx

# Free, key-less geolocation provider. Field selection and response parsing below
# are tuned for ip-api.com; override the URL only with a compatible provider.
GEOLOCATION_API_URL = os.getenv("GEOLOCATION_API_URL", "http://ip-api.com/json")
GEOLOCATION_TIMEOUT_SECONDS = 3.0
_GEOLOCATION_FIELDS = "status,message,country,countryCode,regionName,city,lat,lon"

def _is_public_ip(ip_address: Optional[str]) -> bool:
    """True only for routable public addresses worth a geolocation lookup."""
    if not ip_address:
        return False
    try:
        ip = ipaddress.ip_address(ip_address)
    except ValueError:
        return False
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )

async def geolocate_ip(ip_address: Optional[str]) -> Optional[dict]:
    """
    Resolve an IP address to a coarse location.

    Returns ``None`` (never raises) for private/loopback IPs, network/timeout
    errors, or an unsuccessful provider response, so callers can always treat
    geolocation as best-effort and never block on it.
    """
    if not _is_public_ip(ip_address):
        return None

    try:
        async with httpx.AsyncClient(timeout=GEOLOCATION_TIMEOUT_SECONDS) as client:
            response = await client.get(
                f"{GEOLOCATION_API_URL}/{ip_address}",
                params={"fields": _GEOLOCATION_FIELDS},
            )
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError):
        return None

    if data.get("status") != "success":
        return None

    return {
        "country": data.get("country"),
        "country_code": data.get("countryCode"),
        "region": data.get("regionName"),
        "city": data.get("city"),
        "lat": data.get("lat"),
        "lon": data.get("lon"),
    }
