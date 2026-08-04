from openai import AsyncOpenAI, AsyncAzureOpenAI
from .base import LLMProvider
import os

class OpenAIProvider(LLMProvider):
    def __init__(self, model_name: str, llm_uri: str = None, llm_token: str = None):
        self.model_name = model_name
        if llm_uri and "azure.com" in llm_uri:
                    self.client = AsyncAzureOpenAI(
                        api_key=llm_token or os.getenv("OPENAI_API_KEY"),
                        azure_endpoint=llm_uri,
                        azure_deployment=model_name,
                        api_version="2024-10-21"
                    )
        else:
            self.client = AsyncOpenAI(
                api_key=llm_token or os.getenv("OPENAI_API_KEY"),
                base_url=llm_uri or os.getenv("OPENAI_BASE_URL")
            )
        self.temperature = float(os.getenv("LLM_TEMPERATURE", 0.2))

    async def generate_test(self, prompt: str) -> str:
        try:
            kwargs = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": "You are an expert Java Test Generation Assistant. Output ONLY valid Java code. Do not include markdown blocks like ```java."},
                {"role": "user", "content": prompt}
            ]
            }
            if not isinstance(self.client, AsyncAzureOpenAI):
                kwargs["temperature"] = self.temperature

            response = await self.client.chat.completions.create(**kwargs)
            return response.choices[0].message.content.strip()
        except Exception as e:
            return f"Error generating test: {str(e)}"