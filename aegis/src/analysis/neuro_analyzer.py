"""Language-independent analysis context with lazy, capability-specific strategies.

The historical constructor and execution-path methods remain the Java API.
Use ``for_ir`` for stored-IR request dispatch. Neither route loads another
language's model/database integrations during strategy selection.
"""
from .analysis_strategies import AnalysisStrategyFactory


class NeuroAnalyzer:
    def __init__(self, code_fetcher=None, traverser=None, *, strategy=None):
        self._strategy = strategy if strategy is not None else AnalysisStrategyFactory.for_java_path(code_fetcher, traverser)

    @classmethod
    def for_ir(cls, ir, java_facade_factory=None):
        return cls(strategy=AnalysisStrategyFactory.for_ir(ir, java_facade_factory))

    @property
    def supports_history_review(self):
        return getattr(self._strategy, 'supports_history_review', False)

    def analyze(self, execution_path=None, *, ir=None, **options):
        if execution_path is not None and ir is not None:
            raise TypeError('Pass either execution_path or ir, not both')
        value = ir if ir is not None else execution_path
        if value is None:
            raise TypeError('Analysis requires an execution_path or stored ir')
        return self._strategy.analyze(value, **options)

    def analyse_latent_vulnerabilities(self, analyzed_paths):
        return self._strategy.analyse_latent_vulnerabilities(analyzed_paths)

    def __getattr__(self, name):
        # Preserve the legacy Java analyzer's public services/attributes.
        return getattr(self._strategy, name)

    def __setattr__(self, name, value):
        if name in ('llm_service', 'code_fetcher', 'traverser') and '_strategy' in self.__dict__:
            setattr(self._strategy, name, value)
        else:
            object.__setattr__(self, name, value)


def __getattr__(name):
    # Existing direct imports of Java LLM products remain valid, but JS requests
    # do not import provider SDKs, Git parsers or database integrations.
    if name in ('BaseLLMService', 'OpenAILLMService', 'HuggingFaceLLMService', 'LLMFactory'):
        from . import java_neuro_strategy
        return getattr(java_neuro_strategy, name)
    raise AttributeError(name)
