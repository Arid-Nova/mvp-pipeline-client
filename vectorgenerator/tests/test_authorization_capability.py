import asyncio
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from app import main
from app.models.generateallrequest import GenerateAllRequest
from app.services.authorization_capability import unsupported_authorization_reason


class AuthorizationCapabilityTests(unittest.TestCase):
    def test_component_or_endpoint_metadata_declares_unsupported(self):
        unsupported = {'metadata': {'analysisCapabilities': {'authorization': 'unsupported'}}}
        self.assertIsNotNone(unsupported_authorization_reason({}, unsupported))
        self.assertIsNotNone(unsupported_authorization_reason(unsupported, {}))

    def test_top_level_capability_is_recognized(self):
        self.assertIsNotNone(unsupported_authorization_reason({
            'analysisCapabilities': {'authorization': 'unsupported'}}))

    def test_legacy_java_metadata_is_unchanged(self):
        self.assertIsNone(unsupported_authorization_reason({'endpoints': {}}, {'roles': ['USER']}))

    def test_direct_generation_routes_do_not_invent_roles_or_write_vectors(self):
        for operation in (main.generate_all, main.generate_single, main.show_chain):
            with self.subTest(operation=operation.__name__):
                request = GenerateAllRequest(indexId='local-fixture', components={}, endpoints={})
                data_service = Mock()
                def populate(actual_request):
                    actual_request.components = {'metadata': {
                        'analysisCapabilities': {'authorization': 'unsupported'}}, 'roles': []}
                    actual_request.endpoints = {'endpoints': {}}
                data_service.fetch_index_data.side_effect = populate
                with patch.object(main, 'df_service', data_service), \
                     patch.object(main, 'RoleAnalyzer') as roles, \
                     patch.object(main, 'VectorGenerator') as vectors:
                    with self.assertRaises(HTTPException) as caught:
                        if operation == main.generate_all:
                            asyncio.run(operation(request))
                        else:
                            asyncio.run(operation('endpoint', request))
                self.assertEqual(caught.exception.status_code, 422)
                self.assertEqual(caught.exception.detail['status'], 'unsupported')
                roles.assert_not_called()
                vectors.assert_not_called()
                data_service.add_auth_vectors.assert_not_called()


if __name__ == '__main__':
    unittest.main()

class PolyglotCapabilityTests(unittest.TestCase):
    def test_generic_languages_do_not_enter_java_vectors(self):
        for language in ('python', 'go', 'csharp', 'javascript'):
            with self.subTest(language=language):
                self.assertIsNotNone(unsupported_authorization_reason({'metadata': {'languages': [language]}}))
