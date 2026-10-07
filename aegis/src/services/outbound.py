import os
import requests

def getConfig(userId: str, provider: str):
    config_service_url = os.getenv('CONFIG_SERVICE_URL')
    config_response = requests.get(
        f'{config_service_url}/{provider}',
        params={'userId': userId}
    )

    llm_uri = None
    llm_token = None

    if config_response.status_code == 200:
        config = config_response.json()
        llm_uri = config.get('uri')
        llm_token = config.get('token')

    return llm_uri, llm_token