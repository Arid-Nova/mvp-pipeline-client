import asyncio
from copy import deepcopy
import gzip
import json
import unittest
from unittest.mock import Mock, patch
from fastapi import HTTPException

import service
from src.analysis.javascript_security import javascript_security_response
from src.services.ir_reader import read_stored_ir
from security_fixture import javascript_ir


class JavaScriptSecurityTests(unittest.TestCase):
    def test_valid_report_remains_partial_and_unknown_is_not_public(self):
        ir = javascript_ir()
        result = javascript_security_response(ir)
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['coverage']['authentication']['unknown'], 1)
        self.assertFalse(result['scope']['completeVulnerabilityCoverage'])
        self.assertEqual(result['findings'][0]['component'], 'api')
        result['components'][0]['findings'].clear()
        self.assertEqual(len(ir['javascriptExtraction']['securityAnalysis']['components'][0]['findings']), 1)

    def test_mixed_ir_lists_java_component_outside_javascript_report(self):
        ir = javascript_ir()
        ir['microservices'].append({'name': 'java-billing', 'controllers': [{'type': 'JClass'}]})
        result = javascript_security_response(ir)
        self.assertEqual(result['scope']['unassessedBackendComponents'], ['java-billing'])
        self.assertEqual(result['coverage']['endpointRegistrations'], 1)

    def test_missing_and_malformed_evidence_fail_closed(self):
        variants = []
        ir = javascript_ir(); ir['javascriptExtraction'].pop('securityAnalysis'); variants.append(ir)
        for field, value in [('schemaVersion', 2), ('status', 'complete'), ('sourceDigest', ''),
                             ('endpoints', []), ('coverage', None)]:
            ir = javascript_ir()
            ir['javascriptExtraction']['securityAnalysis']['components'][0][field] = value
            variants.append(ir)
        ir = javascript_ir()
        ir['javascriptExtraction']['securityAnalysis']['components'][0]['component'] = {
            **ir['javascriptExtraction']['snapshots'][0]['component'], 'commit': 'c' * 40}
        variants.append(ir)
        ir = javascript_ir()
        ir['javascriptExtraction']['securityAnalysis']['components'][0]['endpoints'][0]['authentication']['status'] = 'public'
        variants.append(ir)
        ir = javascript_ir()
        ir['javascriptExtraction']['securityAnalysis']['components'][0]['findings'][0]['endpointId'] = 'unextracted'
        variants.append(ir)
        for number, ir in enumerate(variants):
            with self.subTest(case=number):
                result = javascript_security_response(ir)
                self.assertEqual(result['status'], 'unsupported')
                self.assertEqual(result['findings'], [])

    def test_missing_second_backend_report_is_not_silent_full_coverage(self):
        ir = javascript_ir()
        additional = deepcopy(ir['javascriptExtraction']['snapshots'][0])
        additional['component']['name'] = 'another-api'
        ir['javascriptExtraction']['snapshots'].append(additional)
        self.assertEqual(javascript_security_response(ir)['status'], 'unsupported')

    def test_actual_api_needs_no_facade_and_does_not_accept_source_or_url(self):
        with patch.object(service, 'facade', None), \
             patch.object(service, 'read_stored_ir', return_value=javascript_ir()) as reader, \
             patch.object(service, 'get_java_facade') as java:
            result = asyncio.run(service.analyze_endpoint({
                'ir_id': 'saved1', 'repoUrl': 'ignored', 'sourcePath': 'ignored', 'serviceUrl': 'ignored'}))
        self.assertEqual(result['status'], 'partial')
        reader.assert_called_once_with('saved1')
        java.assert_not_called()

    def test_actual_api_keeps_existing_java_path(self):
        ir = {'microservices': [{'name': 'java'}]}
        engine = Mock()
        engine.run_analysis.return_value = {'vulnerabilities': []}
        with patch.object(service, 'read_stored_ir', return_value=ir), \
             patch.object(service, 'get_java_facade', return_value=engine):
            result = asyncio.run(service.analyze_endpoint({'ir_id': 'java1'}))
        self.assertEqual(result['status'], 'success')
        engine.run_analysis.assert_called_once_with({'ir_id': 'java1'}, ir_data=ir)
        engine.get_latent_vulnerabilities.assert_not_called()

    def test_saved_ir_reader_uses_configured_service_and_identifier_only(self):
        response = Mock()
        response.iter_content.return_value = [gzip.compress(json.dumps(javascript_ir()).encode())]
        with patch('src.services.ir_reader.requests.post', return_value=response) as post:
            result = read_stored_ir('saved1', 'http://trusted-ir/ir')
        self.assertIn('javascriptExtraction', result)
        self.assertEqual(post.call_args.args, ('http://trusted-ir/ir',))
        self.assertEqual(post.call_args.kwargs['json'], {'id': 'saved1', 'systemName': '', 'systemRepositories': []})
        self.assertTrue(post.call_args.kwargs['stream'])
        response.close.assert_called_once()

    def test_reader_bounds_compressed_and_decompressed_responses(self):
        for compressed_limit, decompressed_limit, body in [
                (3, 100, b'too-large'), (100, 3, gzip.compress(b'1234'))]:
            with self.subTest(compressed_limit=compressed_limit):
                response = Mock()
                response.iter_content.return_value = [body]
                with patch('src.services.ir_reader.requests.post', return_value=response), \
                     patch('src.services.ir_reader.MAX_COMPRESSED_BYTES', compressed_limit), \
                     patch('src.services.ir_reader.MAX_DECOMPRESSED_BYTES', decompressed_limit):
                    with self.assertRaises(ValueError):
                        read_stored_ir('saved1', 'http://trusted-ir/ir')
                response.close.assert_called_once()

    def test_reader_rejects_long_ids_and_non_http_configuration_before_network(self):
        with patch('src.services.ir_reader.requests.post') as post:
            for identifier, url in [('x' * 257, 'http://trusted-ir/ir'), ('saved1', 'file:///source.json')]:
                with self.assertRaises(ValueError):
                    read_stored_ir(identifier, url)
        post.assert_not_called()

    def test_java_only_has_no_javascript_report(self):
        self.assertIsNone(javascript_security_response({'microservices': [{'name': 'java'}]}))

    def test_lightweight_image_rejects_java_before_optional_imports(self):
        with patch.dict('os.environ', {'AEGIS_ANALYSIS_MODE': 'javascript-only'}):
            with self.assertRaises(HTTPException) as caught:
                service.get_java_facade()
        self.assertEqual(caught.exception.status_code, 422)
        self.assertEqual(caught.exception.detail['status'], 'unsupported')


if __name__ == '__main__':
    unittest.main()
