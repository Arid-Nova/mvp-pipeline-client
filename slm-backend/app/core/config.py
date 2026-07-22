from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    api_title: str = "SLM CoT Backend"
    api_version: str = "1.0.0"
    
    # Internal Ollama Config
    ollama_base_url: str = "http://cloudhub_ollama:11434"
    model_name: str = "llama3.2"
    temperature: float = 0.1
    
    # Toggle switch
    use_external_slm: bool = True
    
    # External SLM Config 
    external_api_base: str = "" 
    external_api_key: str = ""
    external_model_name: str = "gpt-4o-mini"

    class Config:
        env_file = ".env"

settings = Settings()