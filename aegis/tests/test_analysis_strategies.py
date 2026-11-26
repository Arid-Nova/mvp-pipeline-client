import asyncio
import subprocess
from pathlib import Path
from textwrap import dedent

import sys
from types import SimpleNamespace

import unittest
from unittest.mock import Mock, patch

import service
from src.analysis.analysis_strategies import (
    AnalysisStrategyFactory,
    JavaScriptEvidenceStrategy, 
    JavaStoredIRStrategy, 
    UnsupportedSourceStrategy)
from src.analysis.neuro_analyzer import NeuroAnalyzer
from security_fixture import javascript_ir


class AnalysisStrategyTests(unittest.TestCase):
    def test_js_api_starts_and_runs_without_java_model_or_database_imports(self):
        # A fresh process prevents already-imported test doubles from hiding a
        # dependency on optional integrations absent from the lightweight image.
        script = dedent("""
            import builtins
            original = builtins.__import__
            def guarded(name, *args, **kwargs):
                if name.split('.')[0] in {'openai', 'torch', 'transformers', 'neo4j', 'pymongo', 'git', 'javalang'}:
                    raise AssertionError('Unexpected optional integration: ' + name)
                return original(name, *args, **kwargs)
            builtins.__import__ = guarded
            import asyncio, sys
            sys.path.insert(0, 'tests')
            from security_fixture import javascript_ir
            import service
            service.read_stored_ir = lambda identifier: javascript_ir()
            result = asyncio.run(service.analyze_endpoint({'ir_id': 'saved'}))
            assert result['status'] == 'partial'
            assert service.facade is None
            """)
        result = subprocess.run([sys.executable, '-c', script],
            cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_factory_preserves_capabilities_and_defers_java_integrations(self):
        java = Mock()
        cases = [(javascript_ir(), JavaScriptEvidenceStrategy),
                 ({'metadata': {'languages': ['python']}}, UnsupportedSourceStrategy),
                 ({'javascriptExtraction': None, 'microservices': [{'controllers': [
                     {'type': 'JClass', 'path': 'Controller.java'}]}]}, JavaStoredIRStrategy)]
        
        with patch.object(AnalysisStrategyFactory, 'for_java_path') as path_factory:
            for ir, expected in cases:
                self.assertIsInstance(AnalysisStrategyFactory.for_ir(ir, java), expected)
            path_factory.assert_not_called()
        
        java.assert_not_called()
        ir = javascript_ir()
        analyzer = NeuroAnalyzer.for_ir(ir, java_facade_factory=java)
        self.assertEqual(analyzer.analyze(ir=ir, payload={'ir_id': 'saved'})['status'], 'partial')
        
        with self.assertRaises(TypeError):
            analyzer.analyze(ir, ir=ir)
        java.assert_not_called()

    def test_api_routes_js_review_through_shared_context_and_saved_history(self):
        ir = javascript_ir()
        history = {'id': 'history', 'javascriptExtraction': None}
        review = {'status': 'blocked', 'completedCalls': 0}
        
        with patch.object(service, 'read_stored_ir', side_effect=[ir, history]) as reader, \
             patch.object(service, 'get_java_facade') as java, \
             patch('src.analysis.javascript_llm.review_javascript', return_value=review) as llm:
            result = asyncio.run(
                service.analyze_endpoint(
                    {
                        'ir_id': 'saved', 
                        'history_ir_id': 'history', 
                        'llmReview': True
                    }
                )
            )
        
        self.assertEqual([c.args[0] for c in reader.call_args_list], ['saved', 'history'])
        llm.assert_called_once_with(ir, history)
        java.assert_not_called()
        
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['llmReview'], review)

    def test_unsupported_strategy_never_requests_history_or_a_model(self):
        with patch.object(service, 'read_stored_ir', return_value={'metadata': {'languages': ['go']}}) as reader, \
             patch.object(service, 'get_java_facade') as java, \
             patch('src.analysis.javascript_llm.review_javascript') as llm:
            result = asyncio.run(
                service.analyze_endpoint(
                    {
                        'ir_id': 'saved', 
                        'history_ir_id': 'history', 
                        'llmReview': True
                    }
                )
            )
        
        self.assertEqual(result['status'], 'unsupported')
        reader.assert_called_once_with('saved')
        java.assert_not_called()
        llm.assert_not_called()

    def test_java_constructor_services_path_and_latent_methods_remain_compatible(self):
        from src.analysis.java_neuro_strategy import LLMFactory
        
        fetcher, traverser, llm = Mock(), Mock(), Mock()
        traverser.get_method_flow.return_value = [SimpleNamespace(source_file_path='Controller.java', method_name='read', node_type='Endpoint')]
        fetcher.get_method_body.return_value = 'return data;'
        llm.analyze_path.return_value = {
            'findings': [
                {
                    'finding': 'Review', 
                    'confidence': 0.5, 
                    'polarity': 'unsure'
                }
            ]
        }
        
        with patch.object(LLMFactory, 'create_llm_service', return_value=llm):
            analyzer = NeuroAnalyzer(fetcher, traverser)
        
        self.assertIs(analyzer.code_fetcher, fetcher)
        self.assertIs(analyzer.traverser, traverser)
        
        replacement = Mock()
        replacement.analyze_path.return_value = llm.analyze_path.return_value
        replacement.analyse_latent_vulnerabilities.return_value = ['candidate']
        
        analyzer.llm_service = replacement
        
        path = SimpleNamespace(id='path', method_flow=[], neuro_evidence=[])
        self.assertIs(analyzer.analyze(execution_path=path), path)
        self.assertEqual(path.neuro_evidence[0].finding, 'Review')
        
        replacement.analyze_path.assert_called_once()
        self.assertEqual(analyzer.analyse_latent_vulnerabilities([path]), ['candidate'])
        
        llm.analyze_path.assert_not_called()
