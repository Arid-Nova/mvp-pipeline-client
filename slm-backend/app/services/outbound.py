import requests
import os

def get_config(userId: str, provider: str):
    config_service_url = os.getenv('CONFIG_SERVICE_URL')
    config_response = requests.get(
        f'{config_service_url}/{provider}',
        params={'userId': userId}
    )
    
    use_external_slm = False
    external_api_base = None
    external_api_key = None
    
    if config_response.status_code == 200:
        config = config_response.json()
        external_api_base = config.get('uri')
        external_api_key = config.get('token')
        use_external_slm = True if external_api_base and external_api_key else False

    return use_external_slm, external_api_base, external_api_key