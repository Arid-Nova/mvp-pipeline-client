import unittest
from unittest.mock import Mock, patch

from src.analysis.javascript_llm import evidence_packets, review_javascript, validate_output
from security_fixture import javascript_ir


class JavaScriptLLMTests(unittest.TestCase):
    def test_quota_failure_is_explicit_and_does_not_retry_other_categories(self):
        response = Mock(ok=False, status_code=429)
        response.json.return_value = {'error': {'type': 'insufficient_quota', 'code': 'credit_balance_exhausted', 'message': 'SECRET'}}
        with patch('src.analysis.javascript_llm.api_key', return_value='private-key'), \
             patch('src.analysis.javascript_llm.requests.post', return_value=response) as post:
            result = review_javascript(javascript_ir())
        self.assertEqual(result['status'], 'blocked')
        self.assertEqual(result['completedCalls'], 0)
        self.assertEqual(post.call_count, 1)
        self.assertNotIn('SECRET', str(result))
        self.assertEqual(result['categories'][1]['status'], 'not-attempted')

    def test_fake_evidence_reference_is_rejected(self):
        body = {'summary': 'Example', 'limitations': [], 'recommendations': [{
            'title': 'Test', 'explanation': 'Test', 'improvement': 'Test', 'testPlan': 'Test',
            'evidenceIds': ['not-in-source']}]}
        with self.assertRaisesRegex(ValueError, 'unrecognized-evidence'):
            validate_output(body, {'source'})

    def test_accepted_recommendation_remains_candidate(self):
        body = {'summary': 'Example', 'limitations': [], 'recommendations': [{
            'title': 'Test', 'explanation': 'Test', 'improvement': 'Test', 'testPlan': 'Test',
            'evidenceIds': ['source']}]}
        self.assertEqual(validate_output(body, {'source'})['recommendations'][0]['classification'], 'llm-review-candidate')

    def test_packets_have_explicit_bounded_scope(self):
        packets, coverage = evidence_packets(javascript_ir())
        self.assertEqual(len(packets), 7)
        self.assertFalse(coverage['fullSourceSemanticReview'])
        self.assertEqual(packets['history']['history']['status'], 'unavailable')
        self.assertEqual(packets['security']['scope']['businessPolicy'], 'Intended business access policy has not been supplied.')

    def test_null_or_legacy_history_is_unavailable(self):
        for history in ({'id': 'old', 'javascriptExtraction': None}, {'id': 'old'},
                        {'id': 'old', 'javascriptExtraction': 'legacy'},
                        {'id': 'old', 'javascriptExtraction': {'architecture': 'legacy'}}):
            with self.subTest(history=history):
                packets, _ = evidence_packets(javascript_ir(), history)
                self.assertEqual(packets['history']['history']['status'], 'unavailable')
                self.assertNotIn('changedFunctionCount', packets['history']['history'])

    def test_endpoint_evidence_reaches_prompts_without_an_id_prefix(self):
        packets, _ = evidence_packets(javascript_ir())
        for category in ('database', 'security', 'test-planning'):
            endpoints = [value for key, value in packets[category].items() if key.startswith('endpoint-')]
            self.assertEqual(len(endpoints), 1)
            self.assertEqual(endpoints[0]['endpointId'], 'ep1')
            self.assertEqual(endpoints[0]['path'], '/orders/:id')
            self.assertEqual(endpoints[0]['component']['name'], 'api')

    def test_equal_endpoint_ids_in_different_components_stay_distinct(self):
        from copy import deepcopy
        ir = javascript_ir()
        second = deepcopy(ir['javascriptExtraction']['securityAnalysis']['components'][0])
        second['component']['name'] = 'other-api'
        ir['javascriptExtraction']['securityAnalysis']['components'].append(second)
        packets, coverage = evidence_packets(ir)
        endpoints = [value for key, value in packets['security'].items() if key.startswith('endpoint-')]
        self.assertEqual(coverage['selectedEndpoints'], 2)
        self.assertEqual({e['component']['name'] for e in endpoints}, {'api', 'other-api'})
        self.assertEqual({e['endpointId'] for e in endpoints}, {'ep1'})

    def test_model_requests_include_endpoint_data_for_relevant_categories(self):
        import json
        from src.analysis.javascript_llm import CATEGORIES
        response = Mock(ok=True)
        response.json.return_value = {'id': 'response', 'model': 'fixture-model', 'usage': {},
            'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps({
                'summary': 'Fixture', 'recommendations': [], 'limitations': []})}}]}
        with patch('src.analysis.javascript_llm.api_key', return_value='fixture-key'), \
             patch('src.analysis.javascript_llm.requests.post', return_value=response) as post:
            result = review_javascript(javascript_ir())
        self.assertEqual(result['completedCalls'], 7)
        for category, call in zip(CATEGORIES, post.call_args_list):
            if category in ('database', 'security', 'test-planning'):
                evidence = json.loads(call.kwargs['json']['messages'][1]['content'])
                endpoints = [v for k, v in evidence.items() if k.startswith('endpoint-')]
                self.assertEqual(endpoints[0]['endpointId'], 'ep1')
                self.assertEqual(endpoints[0]['path'], '/orders/:id')


if __name__ == '__main__':
    unittest.main()
