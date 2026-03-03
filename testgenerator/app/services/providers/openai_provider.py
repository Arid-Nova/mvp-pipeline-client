from openai import AsyncOpenAI
from .base import LLMProvider
import os

class OpenAIProvider(LLMProvider):
    def __init__(self, model_name: str):
        self.model_name = model_name
        self.client = AsyncOpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_BASE_URL"))
        self.temperature = float(os.getenv("LLM_TEMPERATURE", 0.2))

    async def generate_test(self, prompt: str) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": "You are an expert Java Test Generation Assistant. Output ONLY valid Java code. Do not include markdown blocks like ```java."},
                    {"role": "user", "content": prompt}
                ],
                temperature=self.temperature, 
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            return f"Error generating test: {str(e)}"