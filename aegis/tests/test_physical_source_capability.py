import unittest

from src.analysis.input_capability import unsupported_source_analysis
from src.analysis.source_scope import source_languages


class PhysicalSourceCapabilityTests(unittest.TestCase):
    def test_synthetic_java_identity_cannot_admit_other_source_languages(self):
        for field in ('sourcePath', 'sourceFile'):
            for extension, language in (('py', 'python'), ('go', 'go'), ('cs', 'csharp'),
                                        ('js', 'javascript'), ('ts', 'typescript')):
                with self.subTest(field=field, extension=extension):
                    ir = {'javascriptExtraction': None, 'microservices': [{'unknowns': [{
                        'type': 'JClass', 'path': 'synthetic/Worker.java',
                        'metadata': {field: f'src/worker.{extension}'},
                    }]}]}
                    self.assertEqual(source_languages(ir), {language})
                    response = unsupported_source_analysis(ir)
                    self.assertEqual(response['status'], 'unsupported')
                    self.assertEqual(response['findings'], [])

    def test_physical_java_source_retains_the_existing_java_scope(self):
        ir = {'microservices': [{'controllers': [{
            'type': 'JClass', 'path': 'synthetic/Controller.py',
            'metadata': {'sourceFile': 'src/Controller.java'},
        }]}]}
        self.assertEqual(source_languages(ir), {'java'})
        self.assertIsNone(unsupported_source_analysis(ir))
