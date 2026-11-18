"""Stored-IR strategy selection; language support is established before side effects."""
from abc import ABC, abstractmethod

from .javascript_security import javascript_security_response


class StoredIRAnalysisStrategy(ABC):
    uses_java_pipeline = False
    supports_history_review = False

    @abstractmethod
    def analyze(self, ir, **options):
        """Analyze saved evidence without promoting unsupported capabilities."""


class JavaStoredIRStrategy(StoredIRAnalysisStrategy):
    uses_java_pipeline = True

    def __init__(self, facade_factory):
        self._facade_factory = facade_factory

    def analyze(self, ir, *, payload, **options):
        if self._facade_factory is None:
            raise ValueError('Java stored-IR analysis requires the configured Java facade')
        engine = self._facade_factory()
        results = engine.run_analysis(payload, ir_data=ir)
        if isinstance(results, dict) and results.get('status') in ('unsupported', 'partial'):
            return results
        if 'vulnerabilities' not in results:
            engine.get_latent_vulnerabilities(payload['ir_id'], results)
        return {'status': 'success'}


class JavaScriptEvidenceStrategy(StoredIRAnalysisStrategy):
    supports_history_review = True

    def __init__(self, report):
        self._report = report

    def analyze(self, ir, *, payload=None, history=None, llm_review=False):
        result = {**self._report, 'ir_id': (payload or {}).get('ir_id', ir.get('id'))}
        if llm_review:
            # This provider-specific evidence formatter is a strategy helper;
            # it never selects a language or enters the Java analysis pipeline.
            from .javascript_llm import review_javascript
            result['llmReview'] = review_javascript(ir, history)
        return result


class UnsupportedSourceStrategy(StoredIRAnalysisStrategy):
    def __init__(self, report):
        self._report = report

    def analyze(self, ir, *, payload=None, **options):
        return {**self._report, 'ir_id': (payload or {}).get('ir_id', ir.get('id'))}


class AnalysisStrategyFactory:
    @staticmethod
    def for_ir(ir, java_facade_factory=None):
        # The same normalized capability/report validation gates every language.
        # Future implementations belong here only after their evidence contract
        # and conservative unsupported cases have tests.
        report = javascript_security_response(ir)
        if report is None:
            return JavaStoredIRStrategy(java_facade_factory)
        if report.get('status') in ('complete', 'partial'):
            return JavaScriptEvidenceStrategy(report)
        return UnsupportedSourceStrategy(report)

    @staticmethod
    def for_java_path(code_fetcher, traverser):
        from .java_neuro_strategy import JavaExecutionPathStrategy
        return JavaExecutionPathStrategy(code_fetcher, traverser)
