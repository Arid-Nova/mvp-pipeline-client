"""Exercise shared saved-IR transport through both current entry points."""
import ast
import asyncio
import gzip
import json
import os
from pathlib import Path
from types import SimpleNamespace
from typing import Dict, Any
import time
import unittest
from unittest.mock import Mock, patch

import service
from src.services.ir_reader import read_stored_ir
from src.analysis.analysis_strategies import AnalysisStrategyFactory
from security_fixture import javascript_ir


class IRReaderReuseTests(unittest.TestCase):
    def test_java_facade_reuses_single_saved_result_before_clone_or_graph_work(self):
        source = Path(__file__).resolve().parents[1] / 'main.py'
        facade = next(n for n in ast.parse(source.read_text(encoding='utf-8')).body
                      if isinstance(n, ast.ClassDef) and n.name == 'AnalysisFacade')
        method = next(n for n in facade.body if isinstance(n, ast.FunctionDef) and n.name == 'run_analysis')
        code_fetcher = Mock(side_effect=AssertionError('Cached analysis must not clone source'))
        namespace = {'Dict': Dict, 'Any': Any, 'time': time, 'os': os,
                     'AnalysisStrategyFactory': AnalysisStrategyFactory, 'CodeFetcher': code_fetcher}
        exec(compile(ast.Module(body=[method], type_ignores=[]), str(source), 'exec'), namespace)
        document = {'irID': 'saved', 'vulnerabilities': []}
        mongo = Mock()
        mongo.find_one.return_value = document
        instance = SimpleNamespace(mongo_service=mongo)
        self.assertIs(namespace['run_analysis'](instance, {'ir_id': 'saved'},
            ir_data={'metadata': {'languages': ['java']}}), document)
        self.assertEqual(mongo.find_one.call_args.args[1], {'irID': 'saved'})
        mongo.find.assert_not_called()
        code_fetcher.assert_not_called()

    def test_api_and_facade_share_backend_transport_without_ir_files(self):
        source = Path(__file__).resolve().parents[1] / 'main.py'
        facade = next(n for n in ast.parse(source.read_text(encoding='utf-8')).body
                      if isinstance(n, ast.ClassDef) and n.name == 'AnalysisFacade')
        method = next(n for n in facade.body if isinstance(n, ast.FunctionDef) and n.name == '_get_ir_for_analysis')
        reader = Mock(wraps=read_stored_ir)
        namespace = {'read_stored_ir': reader, 'Dict': Dict, 'Any': Any}
        exec(compile(ast.Module(body=[method], type_ignores=[]), str(source), 'exec'), namespace)
        ir = javascript_ir()
        response = Mock()
        response.iter_content.return_value = [gzip.compress(json.dumps(ir).encode())]
        with patch.dict('os.environ', {'IR_SERVICE_URL': 'http://trusted-ir/ir'}), \
             patch('src.services.ir_reader.requests.post', return_value=response) as post, \
             patch.object(service, 'read_stored_ir', reader), \
             patch.object(service, 'get_java_facade') as java, \
             patch('builtins.open', side_effect=AssertionError('Runtime IR transport must not open files')):
            loaded = namespace['_get_ir_for_analysis'](SimpleNamespace(ir_endpoint='http://trusted-ir/ir'), 'saved')
            result = asyncio.run(service.analyze_endpoint({'ir_id': 'saved'}))
        self.assertEqual(loaded, ir)
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(post.call_count, 2)
        self.assertEqual(reader.call_args_list[0].args, ('saved', 'http://trusted-ir/ir'))
        self.assertEqual(reader.call_args_list[1].args, ('saved',))
        for call in post.call_args_list:
            self.assertEqual(call.args, ('http://trusted-ir/ir',))
            self.assertEqual(call.kwargs['json']['id'], 'saved')
        java.assert_not_called()
