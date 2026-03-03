from groq import AsyncGroq
from .base import LLMProvider
import os

class LlamaProvider(LLMProvider):
    def __init__(self, model_name: str):
        self.model_name = "llama3-70b-8192" if model_name == "llama-3-70b" else model_name
        self.client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
        self.temperature = float(os.getenv("LLM_TEMPERATURE", 0.2))
        self.max_tokens = int(os.getenv("MAX_TOKENS", 4000))

    async def generate_test(self, prompt: str) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model_name, 
                messages=[
                    {
                        "role": "system", 
                        "content": "You are an expert Java Test Generation Assistant. Output ONLY valid Java code. Do not include markdown blocks like ```java."
                    },
                    {
                        "role": "user", 
                        "content": prompt
                    }
                ],
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            return f"Error generating Llama test: {str(e)}"