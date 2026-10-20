import importlib.util
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import Mock, patch

from app.models import VerificationResponse
from app.services.authorization_capability import unsupported_authorization
from app.services.verifier import run_verification


class AuthorizationCapabilityTests(unittest.TestCase):
    def test_partial_express_evidence_does_not_enable_solver(self):
        component = {'name': 'api', 'kind': 'backend', 'repositoryURL': 'https://example.invalid/api', 'commit': 'a' * 40}
        endpoint = {'endpointId': 'e1', 'method': 'GET', 'path': '/orders',
                    'authentication': {'status': 'unknown'},
                    'roleChecks': [{'status': 'observed'}], 'ownershipChecks': [{'status': 'unknown'}]}
        report = {'schemaVersion': 1, 'analyzer': 'aridnova-express-security', 'status': 'partial',
                  'component': component, 'sourceDigest': 'b' * 64, 'endpoints': [endpoint]}
        ir = {'javascriptExtraction': {
            'snapshots': [{'component': component, 'endpoints': [{'id': 'e1', 'method': 'GET', 'path': '/orders'}]}],
            'securityAnalysis': {'schemaVersion': 1, 'analyzer': 'aridnova-express-security',
                                 'status': 'partial', 'components': [report]}}}
        with patch('app.services.verifier.getModelFromIRAndCode') as parser, \
             patch('app.services.verifier.AuthorizationConsistencySolver') as solver:
            response = VerificationResponse(**run_verification('fixture', [], ir_data=ir))
        self.assertEqual(response.status, 'UNSUPPORTED')
        self.assertIsNone(response.is_satisfiable)
        self.assertEqual(response.suggestions, [])
        self.assertEqual(response.observed_security_evidence['authentication']['unknown'], 1)
        self.assertEqual(response.observed_security_evidence['roleCheckObservations'], 1)
        self.assertFalse(response.observed_security_evidence['formalPolicyModelAvailable'])
        parser.assert_not_called()
        solver.assert_not_called()
        endpoint['authentication']['status'] = 'public'
        self.assertNotIn('observed_security_evidence', unsupported_authorization(ir))

    def test_api_rejects_unsupported_before_cloning(self):
        git_module = ModuleType('app.services.git_manager')
        git_module.GitManager = Mock()
        source = Path(__file__).resolve().parents[1] / 'app' / 'main.py'
        with patch.dict(sys.modules, {'app.services.git_manager': git_module}):
            spec = importlib.util.spec_from_file_location('app.guard_api_test', source)
            api = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(api)
        ir = {'metadata': {'extractor': 'cimet-javascript'}}
        with patch.object(api, '_getIRData', return_value=ir), \
             patch('app.services.verifier.getModelFromIRAndCode') as parser, \
             patch('app.services.verifier.AuthorizationConsistencySolver') as solver:
            result = api.verify(api.VerificationRequest(ir_id='local-fixture', systemName='fixture', repos=[]), None)
        self.assertEqual(result['status'], 'UNSUPPORTED')
        api.git_manager.clone_repos_concurrently.assert_not_called()
        parser.assert_not_called()
        solver.assert_not_called()

    def test_javascript_snapshot_returns_unsupported_without_parser_or_solver(self):
        ir = {"microservices": [], "javascriptExtraction": {
            "snapshots": [{"component": {"name": "api", "kind": "backend"}}],
            "authorizationPolicy": {"supported": False, "status": "unsupported"},
        }}
        with patch('app.services.verifier._getIRData', return_value=ir), \
             patch('app.services.verifier.getModelFromIRAndCode') as parser, \
             patch('app.services.verifier.AuthorizationConsistencySolver') as solver:
            response = VerificationResponse(**run_verification('local-fixture', []))
        self.assertEqual(response.status, 'UNSUPPORTED')
        self.assertIsNone(response.is_satisfiable)
        self.assertEqual(response.suggestions, [])
        self.assertEqual(response.unsupported_components, ['api'])
        parser.assert_not_called()
        solver.assert_not_called()

    def test_older_jsmodule_ir_is_also_rejected(self):
        result = unsupported_authorization({'microservices': [{
            'name': 'legacy-js', 'controllers': [{'type': 'JSModule'}],
        }]})
        self.assertEqual(result['unsupported_components'], ['legacy-js'])

    def test_typescript_and_mixed_backends_are_rejected(self):
        result = unsupported_authorization({'microservices': [
            {'name': 'java', 'controllers': [{'type': 'JClass'}]},
            {'name': 'ts', 'controllers': [{'metadata': {'language': 'TypeScript'}}]},
        ]})
        self.assertEqual(result['unsupported_components'], ['ts'])

    def test_support_flag_cannot_enable_missing_parser(self):
        self.assertIsNotNone(unsupported_authorization({'javascriptExtraction': {
            'authorizationPolicy': {'supported': True},
            'snapshots': [{'component': {'name': 'api', 'kind': 'backend'}}],
        }}))

    def test_java_backend_with_frontend_only_snapshot_is_not_rejected(self):
        self.assertIsNone(unsupported_authorization({
            'microservices': [{'name': 'java', 'controllers': [{'type': 'JClass'}]}],
            'javascriptExtraction': {'snapshots': [
                {'component': {'name': 'web', 'kind': 'frontend'}}]},
        }))

    def test_java_only_verification_still_invokes_existing_solver(self):
        from app.core.ms_system import Endpoint, Microservice, MicroserviceSystem, SystemConnectionGraph
        model = MicroserviceSystem([Microservice([Endpoint([], 1, 'GET /status')], 'java')],
                                   SystemConnectionGraph(), 'java-fixture', {1: 'user'})
        model.populateBackReferences()
        with patch('app.services.verifier._getIRData', return_value={'microservices': []}), \
             patch('app.services.verifier.getModelFromIRAndCode', return_value=model) as parser:
            result = run_verification('local-fixture', [])
        parser.assert_called_once()
        self.assertEqual(result['status'], 'SAT')
        self.assertTrue(result['is_satisfiable'])
        self.assertEqual(result['suggestions'], [])


if __name__ == '__main__':
    unittest.main()

class PolyglotCapabilityTests(unittest.TestCase):
    def test_generic_languages_do_not_enter_java_solver(self):
        for language in ('python', 'go', 'csharp'):
            with self.subTest(language=language), patch('app.services.verifier.getModelFromIRAndCode') as parser:
                response = run_verification('fixture', [], ir_data={'metadata': {'languages': ['java', language]}})
                self.assertEqual(response['status'], 'UNSUPPORTED')
                self.assertIsNone(response['is_satisfiable'])
                parser.assert_not_called()

class NativeJavaScriptCapabilityTests(unittest.TestCase):
    def test_native_metadata_without_security_never_enters_java_solver(self):
        with patch('app.services.verifier.getModelFromIRAndCode') as parser:
            response = run_verification('fixture', [], ir_data={'metadata': {'languages': ['javascript']}})
        self.assertEqual(response['status'], 'UNSUPPORTED')
        parser.assert_not_called()
