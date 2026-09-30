from openai import AsyncOpenAI
from .base import LLMProvider
import httpx

class OllamaProvider(LLMProvider):
    def __init__(self, model_name: str = "llama3.2:latest"):
        self.model_name = model_name
        self.client = AsyncOpenAI(
            api_key="ollama",
            base_url = "http://cloudhub_ollama:11434/v1",
            http_client=httpx.AsyncClient()
        )

    async def generate_test(self, prompt: str) -> str:
        try:
            print(f"Calling Ollama with model: {self.model_name}")
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": "You are an expert Java Test Generation Assistant. Output ONLY valid Java code. Do not include markdown blocks like ```java."},
                    {"role": "user", "content": prompt}
                ]
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"Ollama error: {str(e)}")
            return f"Error generating test: {str(e)}"