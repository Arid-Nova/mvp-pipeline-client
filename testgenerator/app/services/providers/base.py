from abc import ABC, abstractmethod

class LLMProvider(ABC):
    @abstractmethod
    async def generate_test(self, prompt: str) -> str:
        """Asynchronously generates test code based on the prompt."""
        pass