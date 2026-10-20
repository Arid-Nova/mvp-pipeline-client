import asyncio
import importlib.util
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import Mock, patch

from src.analysis.input_capability import unsupported_source_analysis
from security_fixture import javascript_ir


class InputCapabilityTests(unittest.TestCase):
    def test_upgraded_javascript_ir_is_explicitly_unsupported(self):
        response = unsupported_source_analysis({'javascriptExtraction': {'snapshots': []}})
        self.assertEqual(response['status'], 'unsupported')
        self.assertEqual(response['findings'], [])

    def test_legacy_jsmodule_and_typescript_orphans_are_unsupported(self):
        self.assertIsNotNone(unsupported_source_analysis({'microservices': [
            {'controllers': [{'type': 'JSModule'}]}]}))
        self.assertIsNotNone(unsupported_source_analysis({'orphans': [
            {'metadata': {'language': 'TypeScript'}}]}))

    def test_java_ir_is_not_rejected(self):
        self.assertIsNone(unsupported_source_analysis({'microservices': [
            {'controllers': [{'type': 'JClass', 'metadata': {'language': 'Java'}}]}]}))

    def test_facade_checks_capability_before_cache_clone_graph_or_model(self):
        # Isolate optional integrations only for import; execute the actual facade method.
        imports = {
            'src.config_loader': ['ConfigLoader'],
            'src.domain.models': ['ExecutionPath'],
            'src.services.graph_loader': ['GraphLoader'],
            'src.services.code_fetcher': ['CodeFetcher'],
            'src.services.neo4j_service': ['Neo4jService'],
            'src.services.mongo_service': ['MongoService'],
            'src.analysis.neuro_analyzer': ['NeuroAnalyzer'],
            'src.calculus.evidence_mapper': ['EvidenceMapper'],
            'src.analysis.symbolic_analyzer': ['SymbolicAnalyzer'],
            'src.services.graph_traversal_service': ['GraphTraversalService'],
            'src.calculus.subjective_logic': ['fuse_opinions_list'],
        }
        isolated = {}
        for name, attributes in imports.items():
            module = ModuleType(name)
            for attribute in attributes:
                setattr(module, attribute, Mock())
            isolated[name] = module
        source = Path(__file__).resolve().parents[1] / 'main.py'
        with patch.dict(sys.modules, isolated):
            spec = importlib.util.spec_from_file_location('aegis_facade_guard_test', source)
            loaded = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(loaded)
            for ir, expected in [({'javascriptExtraction': {}}, 'unsupported'), (javascript_ir(), 'partial')]:
                facade = object.__new__(loaded.AnalysisFacade)
                facade._get_ir_for_analysis = Mock(return_value=ir)
                facade.mongo_service = Mock()
                facade.graph_loader = Mock()
                facade.neo4j_service = Mock()
                result = facade.run_analysis({'ir_id': 'local-fixture'})
                facade.cleanup()
                self.assertEqual(result['status'], expected)
                facade.mongo_service.find.assert_not_called()
                facade.graph_loader.load_graph_from_ir.assert_not_called()
                loaded.CodeFetcher.assert_not_called()
                loaded.NeuroAnalyzer.assert_not_called()
                facade.neo4j_service.close.assert_called_once_with()

    def test_api_returns_unsupported_without_latent_model_stage(self):
        main_module = ModuleType('main')
        main_module.AnalysisFacade = Mock()
        source = Path(__file__).resolve().parents[1] / 'service.py'
        with patch.dict(sys.modules, {'main': main_module}):
            spec = importlib.util.spec_from_file_location('aegis_api_guard_test', source)
            loaded = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(loaded)
        response = unsupported_source_analysis({'javascriptExtraction': {}})
        loaded.facade = Mock()
        loaded.facade.run_analysis.return_value = response
        with patch.object(loaded, 'read_stored_ir', return_value={'javascriptExtraction': {}}):
            result = asyncio.run(loaded.analyze_endpoint({'ir_id': 'local-fixture'}))
        self.assertEqual(result['status'], 'unsupported')
        self.assertEqual(result['findings'], [])
        loaded.facade.run_analysis.assert_not_called()
        loaded.facade.get_latent_vulnerabilities.assert_not_called()


if __name__ == '__main__':
    unittest.main()

class PolyglotCapabilityTests(unittest.TestCase):
    def test_generic_languages_do_not_enter_java_analysis(self):
        for language in ('python', 'go', 'csharp'):
            with self.subTest(language=language):
                response = unsupported_source_analysis({'metadata': {'languages': ['java', language]}})
                self.assertEqual(response['status'], 'unsupported')
                self.assertEqual(response['findings'], [])

class NativeJavaScriptCapabilityTests(unittest.TestCase):
    def test_native_metadata_without_saved_security_never_falls_back_to_java(self):
        response = unsupported_source_analysis({'metadata': {'languages': ['javascript']}})
        self.assertEqual(response['status'], 'unsupported')
