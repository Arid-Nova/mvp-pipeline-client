import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
CANONICAL = ROOT / 'javascript-policy'
sys.path.insert(0, str(CANONICAL))
import aridnova_policy as policy


def eq(field, value):
    return {'op': 'eq', 'field': field, 'value': value}


def fixture():
    allow = {'op': 'and', 'args': [eq('token', 'valid'), {'op': 'or', 'args': [eq('role', 1), eq('owner:params.id', True)]}]}
    report = {
        'schemaVersion': 1, 'analyzer': 'aridnova-express-security', 'status': 'complete',
        'component': {'name': 'fixture', 'kind': 'backend', 'commit': 'a' * 40},
        'sourceDigest': 'b' * 64, 'applicationAssembly': {'status': 'complete'},
        'endpoints': [{
            'endpointId': 'record', 'method': 'POST', 'path': '/record/:id', 'location': {'file': 'fixture.cjs', 'line': 1},
            'analysisCoverage': {'registration': 'matched', 'globalMountResolution': 'resolved', 'reachability': 'active', 'boundsReached': False},
            'policyModel': {'status': 'complete', 'admission': allow,
                'dimensions': {'token': ['missing', 'invalid', 'expired', 'valid'], 'role': [1, 2, 3, 'OTHER'], 'owner:params.id': [True, False]},
                'operations': [{'id': 'write', 'kind': 'write', 'predicate': allow, 'location': {'file': 'fixture.cjs', 'line': 10}}]},
        }],
    }
    manifest = {'schemaVersion': 1, 'reviewedBy': 'isolated test fixture author', 'reviewedAt': '2026-10-07',
                'components': [{'name': 'fixture', 'commit': 'a' * 40, 'sourceDigest': 'b' * 64,
                    'endpoints': [{'endpointId': 'record', 'allow': allow, 'allowedStatuses': [200], 'deniedStatuses': [401, 403]}]}]}
    return report, manifest


def load_service(name):
    # Load each app under its own package to exercise real API routes without
    # connecting its unrelated Mongo/model-provider startup dependencies.
    package = 'policy_test_' + name
    spec = importlib.util.spec_from_file_location(package, ROOT / name / 'app' / '__init__.py', submodule_search_locations=[str(ROOT / name / 'app')])
    module = importlib.util.module_from_spec(spec)
    sys.modules[package] = module
    if spec.origin and Path(spec.origin).exists():
        spec.loader.exec_module(module)
    return __import__(package + '.javascript_api', fromlist=['router'])


def load_main(name):
    load_service(name)
    return __import__('policy_test_' + name + '.main', fromlist=['app'])


class FinitePolicyTests(unittest.TestCase):
    def setUp(self):
        self.report, self.manifest = fixture()

    def test_numeric_roles_and_compound_owner_alternative(self):
        result = policy.generate_vectors(self.report, self.manifest)
        cases = result['vectors'][0]['cases']
        self.assertEqual(len(cases), 32)
        self.assertEqual(sum(c['observedAdmission'] for c in cases), 5)
        self.assertTrue(all(c['expectedAdmission'] == c['observedAdmission'] for c in cases))

    def test_no_java_roles_or_security_verdict_when_policy_missing(self):
        result = policy.verify_policy(self.report)
        self.assertEqual(result['verification'][0]['conformance'], 'not-assessed-no-expected-policy')
        self.assertNotIn('ADMIN', json.dumps(result))
        self.assertNotIn('USER', json.dumps(result))

    def test_z3_proves_finite_conformance(self):
        result = policy.verify_policy(self.report, self.manifest)['verification'][0]
        self.assertEqual(result['conformance'], 'holds-within-model')
        self.assertEqual([c['solverResult'] for c in result['checks']], ['sat', 'unsat', 'unsat', 'unsat'])

    def test_z3_provides_bypass_witness(self):
        self.report['endpoints'][0]['policyModel']['admission'] = {'op': 'true'}
        result = policy.verify_policy(self.report, self.manifest)['verification'][0]
        check = next(c for c in result['checks'] if c['property'] == 'policy-overpermission')
        self.assertEqual(check['solverResult'], 'sat')
        self.assertFalse(policy.evaluate(self.manifest['components'][0]['endpoints'][0]['allow'], check['witness']))

    def test_operation_reachable_after_denial_is_separate_violation(self):
        self.report['endpoints'][0]['policyModel']['operations'][0]['predicate'] = {'op': 'true'}
        result = policy.verify_policy(self.report, self.manifest)['verification'][0]
        self.assertEqual(result['checks'][1]['solverResult'], 'unsat')
        self.assertEqual(result['checks'][-1]['solverResult'], 'sat')

    def test_unknown_startup_cannot_enable_solver_verdict(self):
        self.report['applicationAssembly']['status'] = 'partial'
        result = policy.verify_policy(self.report, self.manifest)
        self.assertEqual(result['verification'][0]['status'], 'unknown')
        self.assertEqual(result['verification'][0]['checks'], [])

    def test_inactive_route_cannot_enable_solver(self):
        self.report['endpoints'][0]['analysisCoverage']['reachability'] = 'inactive'
        self.assertEqual(policy.verify_policy(self.report)['coverage']['eligibleEndpoints'], 0)
        self.assertEqual(policy.generate_scenarios(self.report)['scenarios'], [])

    def test_mixed_ir_does_not_claim_java_was_analyzed(self):
        ir = {'javascriptExtraction': {'securityAnalysis': {'components': [self.report]}}, 'microservices': [{'name': 'java-orders'}]}
        result = policy.verify_policy(ir)
        self.assertEqual(result['coverage']['unassessedComponents'], ['java-orders'])
        self.assertEqual(result['status'], 'partial')

    def test_unknown_predicate_and_path_limit_fail_closed(self):
        for change in ('predicate', 'bounds'):
            report = copy.deepcopy(self.report)
            if change == 'predicate':
                report['endpoints'][0]['policyModel']['admission'] = {'op': 'unknown'}
            else:
                report['endpoints'][0]['analysisCoverage']['boundsReached'] = True
            result = policy.generate_vectors(report)
            self.assertTrue(all(c['observedAdmission'] is None for c in result['vectors'][0]['cases']))

    def test_mismatched_expected_source_rejected(self):
        self.manifest['components'][0]['sourceDigest'] = 'c' * 64
        with self.assertRaisesRegex(ValueError, 'does not match'):
            policy.verify_policy(self.report, self.manifest)

    def test_unreviewed_template_cannot_be_used_as_oracle(self):
        template = policy.policy_template(self.report)
        with self.assertRaisesRegex(ValueError, 'reviewedBy'):
            policy.generate_suite(self.report, template)

    def test_boolean_true_does_not_equal_numeric_one(self):
        self.assertFalse(policy.evaluate(eq('role', 1), {'role': True}))

    def test_expected_unknown_predicate_is_rejected(self):
        self.manifest['components'][0]['endpoints'][0]['allow'] = {'op': 'unknown'}
        with self.assertRaisesRegex(ValueError, 'cannot contain unknown'):
            policy.compile_policy(self.report, self.manifest)

    def test_unknown_expected_operation_cannot_reach_solver(self):
        self.manifest['components'][0]['endpoints'][0]['operations'] = {'write': {'op': 'unknown'}}
        with self.assertRaisesRegex(ValueError, 'cannot contain unknown'):
            policy.verify_policy(self.report, self.manifest)

    def test_finite_state_budget_preserves_unknown(self):
        model = self.report['endpoints'][0]['policyModel']
        model['dimensions']['extra1'] = list(range(64))
        model['dimensions']['extra2'] = list(range(64))
        result = policy.generate_vectors(self.report)
        self.assertEqual(result['status'], 'unknown')
        self.assertEqual(result['vectors'][0]['cases'], [])
        self.assertIn('Finite policy state budget exceeded', result['endpoints'][0]['unknownReasons'])

    def test_duplicate_and_undeclared_endpoints_rejected(self):
        self.report['endpoints'].append(copy.deepcopy(self.report['endpoints'][0]))
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            policy.compile_policy(self.report)

    def test_same_inputs_produce_same_suite_without_models(self):
        first = policy.generate_suite(self.report, self.manifest)
        self.assertEqual(first, policy.generate_suite(self.report, self.manifest))
        self.assertEqual(first['executableWithOracle'], 32)

    def test_no_expected_status_means_no_executable_assertion(self):
        result = policy.generate_suite(self.report)
        self.assertEqual(result['executableWithOracle'], 0)
        self.assertEqual({c['oracle'] for c in result['suite']['cases']}, {'observation-only'})

    def test_canonical_vendors_are_identical(self):
        content = (CANONICAL / 'aridnova_policy.py').read_bytes()
        for service in ('formalmethod', 'vectorgenerator', 'scenariogenerator', 'testgenerator', 'testexecutor'):
            self.assertEqual(content, (ROOT / service / 'app' / 'javascript_policy.py').read_bytes())

    def test_four_analysis_api_routes_use_real_engine(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        for service, route, key in [('formalmethod', '/verify/javascript', 'verification'), ('vectorgenerator', '/vectors/javascript', 'vectors'), ('scenariogenerator', '/scenarios/javascript', 'scenarios'), ('testgenerator', '/testsuites/javascript', 'suite')]:
            app = FastAPI()
            app.include_router(load_service(service).router)
            client = TestClient(app)
            response = client.post(route, json={'report': self.report, 'expectedPolicy': self.manifest})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn(key, response.json())
            self.assertEqual(client.post(route, json={'report': {}}).status_code, 422)

    def test_complete_service_apps_start_without_database_or_model_clients(self):
        from fastapi.testclient import TestClient
        with patch.dict(os.environ, {'ARIDNOVA_ANALYSIS_MODE': 'javascript-only'}):
            for service, route in [('formalmethod', '/verify/javascript'), ('vectorgenerator', '/vectors/javascript'), ('scenariogenerator', '/scenarios/javascript'), ('testgenerator', '/testsuites/javascript')]:
                app = load_main(service).app
                with TestClient(app) as client:
                    response = client.post(route, json={'report': self.report, 'expectedPolicy': self.manifest})
                    self.assertEqual(response.status_code, 200, response.text)
            with TestClient(load_main('testexecutor').app) as client:
                self.assertEqual(client.post('/api/execute/javascript', json={}).status_code, 422)

    def test_existing_verify_api_dispatches_typed_model_without_cloning(self):
        from fastapi.testclient import TestClient
        main = load_main('formalmethod')
        ir = {'javascriptExtraction': {'snapshots': [{'component': self.report['component']}], 'securityAnalysis': {'components': [self.report]}}}
        with patch.object(main, '_getIRData', return_value=ir), patch.object(main.git_manager, 'clone_repos_concurrently') as clone:
            response = TestClient(main.app).post('/verify', json={'ir_id': 'fixture', 'systemName': 'fixture', 'repos': [], 'expectedPolicy': self.manifest})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['status'], 'JAVASCRIPT_ANALYZED')
        self.assertIsNone(response.json()['is_satisfiable'])
        self.assertEqual(response.json()['policyAnalysis']['verification'][0]['conformance'], 'holds-within-model')
        clone.assert_not_called()

    def test_actual_ast_extraction_flows_into_formal_and_vectors(self):
        temp = tempfile.TemporaryDirectory(prefix='aridnova-policy-fixture-')
        try:
            root = Path(temp.name)
            source = """const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();
function auth(req,res,next) {
  try { req.user=jwt.verify(req.headers.authorization,process.env.KEY); return next(); }
  catch(error) { return res.status(401).send(); }
}
app.post('/items/:id',auth,(req,res)=> {
  if(req.user.role_id===1 || req.params.id===req.user.id) return res.json({ok:true});
  return res.status(403).send();
});
app.listen(3000);
"""
            (root / 'server.js').write_text(source, encoding='utf-8')
            (root / 'package.json').write_text('{"main":"server.js"}', encoding='utf-8')
            component = {'name': 'ast-fixture', 'kind': 'backend', 'repositoryURL': 'https://example.invalid/ast-fixture', 'commit': 'd' * 40}
            request = {'sourceRoot': str(root), 'component': component, 'snapshot': {'component': component,
                       'endpoints': [{'id': 'items', 'file': 'server.js', 'line': 8, 'method': 'POST', 'path': '/items/:id'}]}}
            input_file, output_file = root / 'input.json', root / 'output.json'
            input_file.write_text(json.dumps(request), encoding='utf-8')
            completed = subprocess.run(['node', str(ROOT / 'javascript-security' / 'analyzer.cjs'), '--input', str(input_file), '--output', str(output_file)], text=True, capture_output=True, timeout=30)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            report = json.loads(output_file.read_text(encoding='utf-8'))
            result = policy.verify_policy(report)
            self.assertEqual(result['coverage']['eligibleEndpoints'], 1, json.dumps(report['endpoints'][0]['policyModel']))
            cases = policy.generate_vectors(report)['vectors'][0]['cases']
            self.assertTrue(any(c['observedAdmission'] is True for c in cases))
            self.assertTrue(any(c['observedAdmission'] is False for c in cases))
            self.assertTrue(all(c['state']['token'] == 'valid' for c in cases if c['observedAdmission']))
        finally:
            resolved = Path(temp.name).resolve()
            if not resolved.name.startswith('aridnova-policy-fixture-') or resolved.parent != Path(tempfile.gettempdir()).resolve():
                raise RuntimeError('Unsafe fixture temporary directory')
            temp.cleanup()


class HttpExecutionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.api = load_service('testexecutor')
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        app = FastAPI()
        app.include_router(cls.api.router)
        cls.client = TestClient(app)
        cls.process = subprocess.Popen(['node', str(CANONICAL / 'tests' / 'express_fixture.cjs')], cwd=str(CANONICAL), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        ready = cls.process.stdout.readline()
        if not ready:
            raise RuntimeError('Isolated Express fixture failed to start: ' + cls.process.stderr.read())
        cls.runtime = json.loads(ready)

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=10)
        cls.process.stdout.close()
        cls.process.stderr.close()

    def setUp(self):
        report, manifest = fixture()
        self.suite = policy.generate_suite(report, manifest)
        self.temp = tempfile.TemporaryDirectory(prefix='aridnova-policy-fixture-')
        self.path = Path(self.temp.name) / 'fixtures.json'
        bindings = {}
        for case in self.suite['suite']['cases']:
            state = case['state']
            token = self.runtime['tokens'][json.dumps(state['role'])][state['token']]
            bindings[case['id']] = {'caseDigest': policy.digest(case), 'method': 'POST',
                'path': '/record/' + ('self' if state['owner:params.id'] else 'other'),
                'headers': {'Authorization': 'Bearer ' + token} if token else {},
                'stateObservation': {'path': '/__state'}}
        self.registry = {'fixtures': {'local': {'isolated': True, 'baseUrl': self.runtime['baseUrl'], 'policyId': self.suite['policyId'], 'cases': bindings}}}
        self.path.write_text(json.dumps(self.registry), encoding='utf-8')
        self.env = patch.dict(os.environ, {'ARIDNOVA_ENABLE_JS_TEST_EXECUTION': '1', 'ARIDNOVA_JS_FIXTURES': str(self.path)})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        # Verify exact generated temp path before recursive cleanup on Windows.
        resolved = Path(self.temp.name).resolve()
        if not resolved.name.startswith('aridnova-policy-fixture-') or resolved.parent != Path(tempfile.gettempdir()).resolve():
            raise RuntimeError('Unsafe fixture temporary directory')
        self.temp.cleanup()

    def execute(self, suite=None, ids=None):
        payload = {'suite': suite or self.suite, 'fixtureSet': 'local'}
        if ids is not None:
            payload['caseIds'] = ids
        return self.client.post('/api/execute/javascript', json=payload)

    def test_real_express_all_token_role_owner_combinations_and_state_effects(self):
        response = self.execute()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['counts'], {'passed': 32, 'failed': 0, 'error': 0, 'skipped': 0})
        self.assertNotIn('eyJ', response.text)

    def test_403_response_with_database_effect_fails(self):
        case = next(c for c in self.suite['suite']['cases'] if c['expectedAdmission'] is False)
        self.registry['fixtures']['local']['cases'][case['id']]['path'] = '/bad-record/other'
        self.path.write_text(json.dumps(self.registry), encoding='utf-8')
        response = self.execute(ids=[case['id']]).json()
        self.assertEqual(response['counts']['failed'], 1)
        self.assertFalse(response['results'][0]['stateUnchanged'])

    def test_remote_or_hostname_target_rejected(self):
        for url in ('http://example.com', 'http://localhost:8000', 'http://169.254.169.254', 'http://127.0.0.1@evil.invalid'):
            self.registry['fixtures']['local']['baseUrl'] = url
            self.path.write_text(json.dumps(self.registry), encoding='utf-8')
            self.assertEqual(self.execute().status_code, 422)

    def test_execution_disabled_by_default(self):
        with patch.dict(os.environ, {'ARIDNOVA_ENABLE_JS_TEST_EXECUTION': '0'}):
            self.assertEqual(self.execute().status_code, 422)

    def test_changed_oracle_rejected_by_fixture_digest(self):
        suite = copy.deepcopy(self.suite)
        suite['suite']['cases'][0]['expectedStatuses'] = [200, 401, 403]
        self.assertEqual(self.execute(suite=suite).status_code, 422)

    def test_denied_case_without_state_observation_skips(self):
        case = next(c for c in self.suite['suite']['cases'] if c['expectedAdmission'] is False)
        del self.registry['fixtures']['local']['cases'][case['id']]['stateObservation']
        self.path.write_text(json.dumps(self.registry), encoding='utf-8')
        result = self.execute(ids=[case['id']]).json()
        self.assertEqual(result['counts']['skipped'], 1)


if __name__ == '__main__':
    unittest.main()

class SourceLanguageScopeTests(unittest.TestCase):
    def test_native_jclass_uses_explicit_source_language(self):
        from source_scope import source_languages
        for language in ('python', 'go', 'csharp', 'javascript', 'typescript'):
            with self.subTest(language=language):
                ir = {'microservices': [{'unknowns': [{'type': 'JClass', 'metadata': {'language': language}}]}]}
                self.assertEqual(source_languages(ir), {language})
        self.assertEqual(source_languages({'microservices': [{'controllers': [{'type': 'JClass'}]}]}), {'java'})
