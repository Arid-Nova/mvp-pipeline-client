from anthropic import AsyncAnthropic
from .base import LLMProvider
import os

class AnthropicProvider(LLMProvider):
    def __init__(self, model_name: str, llm_uri: str = None, llm_token: str = None):
        self.model_name = model_name
        self.client = AsyncAnthropic(
            api_key=llm_token or os.getenv("ANTHROPIC_API_KEY"),
            base_url=llm_uri or None
        )
        self.temperature = float(os.getenv("LLM_TEMPERATURE", 0.2))

    async def generate_test(self, prompt: str) -> str:
        try:
            response = await self.client.messages.create(
                model=self.model_name,
                max_tokens=4000,
                system="You are an expert Java Test Generation Assistant. Output ONLY valid Java code. Do not include markdown blocks.",
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=self.temperature,
            )
            return response.content[0].text.strip()
        except Exception as e:
            return f"Error generating test: {str(e)}"