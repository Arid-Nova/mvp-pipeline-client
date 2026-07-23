from .providers.base import LLMProvider
from .providers.llama_provider import LlamaProvider
from .providers.openai_provider import OpenAIProvider
from .providers.anthropic_provider import AnthropicProvider

class LLMFactory:
    @staticmethod
    def get_provider(model_name: str, llm_uri: str = None, llm_token: str = None) -> LLMProvider:
        model_lower = model_name.lower()

        if "gpt" in model_lower:
            return OpenAIProvider(model_name, llm_uri, llm_token)
        elif "claude" in model_lower:
            return AnthropicProvider(model_name, llm_uri, llm_token)
        elif "llama" in model_lower:
            return LlamaProvider(model_name, llm_uri, llm_token)
        else:
            raise ValueError(f"Unsupported LLM model: {model_name}")