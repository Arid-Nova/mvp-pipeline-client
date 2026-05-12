import gzip
import json
import base64

@staticmethod
def decompress_field(document, field_name):
    data = document.get(field_name)
    if not data:
        return {}

    try:
        if isinstance(data, (bytes, bytearray)):
            compressed_bytes = data
        
        elif isinstance(data, dict) and "$binary" in data:
            b64_string = data["$binary"].get("base64", "")
            compressed_bytes = base64.b64decode(b64_string)
        
        elif isinstance(data, str):
            compressed_bytes = base64.b64decode(data)
        else:
            return data

        decompressed = gzip.decompress(compressed_bytes)
        return json.loads(decompressed.decode('utf-8'))
    except Exception as e:
        print(f"Error decompressing field '{field_name}': {e}")
        return {}