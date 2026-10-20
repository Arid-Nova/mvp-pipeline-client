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


if __name__ == '__main__':
    unittest.main()
