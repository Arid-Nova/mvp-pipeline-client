import unittest

from app.scenario_generator import generate_scenarios, summarize_permissions


class UnknownPermissionTests(unittest.TestCase):
    def test_all_unknown_financial_endpoint_is_not_public_or_exposure(self):
        result = summarize_permissions({
            'roles': ['admin', 'user'], 'endpoints': ['payment'], 'matrix': [[-1, -1]],
        }, 'payment')
        self.assertFalse(result['is_public_endpoint'])
        self.assertEqual(result['policy_inconsistencies'], [])
        self.assertEqual(result['unknown_roles'], ['admin', 'user'])
        self.assertEqual(result['expected_status_by_role'], {'admin': 'UNKNOWN', 'user': 'UNKNOWN'})

    def test_known_role_matrix_remains_allowed_and_denied(self):
        result = summarize_permissions({
            'roles': ['admin', 'user'], 'endpoints': ['payment'], 'matrix': [[1, 0]],
        }, 'payment')
        self.assertEqual(result['allowed_roles'], ['admin'])
        self.assertEqual(result['denied_roles'], ['user'])
        self.assertEqual(result['unknown_roles'], [])

    def test_generated_scenario_does_not_turn_unknown_into_denial(self):
        result = generate_scenarios({'vectors': {'payment': {
            'endpoint_info': {'id': 'payment', 'service_name': 'api', 'uri': '/payment', 'method': 'POST'},
            'call_chain': [{'endpoint_id': 'payment', 'depth': 0}],
            'permission_matrix': {'roles': ['admin', 'user'], 'endpoints': ['payment'], 'matrix': [[-1, -1]]},
        }}})[0]
        self.assertEqual(result['allowed_roles'], [])
        self.assertEqual(result['denied_roles'], [])
        self.assertEqual(result['unknown_roles'], ['admin', 'user'])
        self.assertEqual(result['expected_status_by_role'], {'admin': 'UNKNOWN', 'user': 'UNKNOWN'})
        self.assertEqual(result['policy_inconsistencies'], [])

    def test_known_and_unknown_permissions_remain_distinct(self):
        result = generate_scenarios({'vectors': {'status': {
            'endpoint_info': {'id': 'status', 'service_name': 'api', 'uri': '/status', 'method': 'GET'},
            'call_chain': [{'endpoint_id': 'status', 'depth': 0}],
            'permission_matrix': {'roles': ['admin', 'user', 'guest'], 'endpoints': ['status'], 'matrix': [[1, 0, -1]]},
        }}})[0]
        self.assertEqual(result['expected_status_by_role'], {'admin': '2xx', 'user': '403', 'guest': 'UNKNOWN'})
        self.assertEqual(result['denied_roles'], ['user'])


if __name__ == '__main__':
    unittest.main()
