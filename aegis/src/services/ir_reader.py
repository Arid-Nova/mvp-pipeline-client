"""Read saved IR through the configured backend; never accept a caller URL."""
import gzip
import io
import json
import os
from typing import Any, Dict, Optional
from urllib.parse import urlsplit

import requests

MAX_COMPRESSED_BYTES = 64 * 1024 * 1024
MAX_DECOMPRESSED_BYTES = 128 * 1024 * 1024


def read_stored_ir(ir_id: str, endpoint: Optional[str] = None) -> Dict[str, Any]:
    if not isinstance(ir_id, str) or not ir_id.strip() or len(ir_id) > 256:
        raise ValueError('ir_id must be a nonempty saved IR identifier of at most 256 characters')
    endpoint = endpoint or os.getenv('IR_SERVICE_URL')
    if not endpoint:
        raise ValueError('IR_SERVICE_URL is not configured')
    url = urlsplit(endpoint)
    if url.scheme not in ('http', 'https') or not url.netloc:
        raise ValueError('IR_SERVICE_URL must be a configured HTTP(S) service URL')
    response = requests.post(
        endpoint,
        json={'id': ir_id, 'systemName': '', 'systemRepositories': []},
        headers={'Content-Type': 'application/json', 'Accept': 'application/gzip'},
        timeout=30,
        stream=True,
        allow_redirects=False,
    )
    try:
        response.raise_for_status()
        compressed = bytearray()
        for chunk in response.iter_content(chunk_size=64 * 1024):
            if len(compressed) + len(chunk) > MAX_COMPRESSED_BYTES:
                raise ValueError('Saved IR compressed response exceeds 64 MiB')
            compressed.extend(chunk)
        with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as archive:
            data = archive.read(MAX_DECOMPRESSED_BYTES + 1)
        if len(data) > MAX_DECOMPRESSED_BYTES:
            raise ValueError('Saved IR decompressed response exceeds 128 MiB')
        ir = json.loads(data)
    finally:
        response.close()
    if not isinstance(ir, dict):
        raise ValueError('Stored IR must be a JSON object')
    return ir
