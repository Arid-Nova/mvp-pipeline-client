"""Execute actual lookup handlers without starting optional dashboard/DB integrations."""
import ast
import gzip
import json
import os

from pathlib import Path
from types import SimpleNamespace

import unittest
from unittest.mock import Mock, MagicMock

from src.services.mongo_service import MongoService

def route_functions(mongo, query):
    source = Path(__file__).resolve().parents[1] / 'frontend.py'
    tree = ast.parse(source.read_text(encoding='utf-8'))
    functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in ('visualize', 'get_results')]
    for node in functions:
        node.decorator_list = []
    namespace = {'MongoService': Mock(return_value=mongo), 'os': os, 'gzip': gzip,
                 'json': json, 'request': SimpleNamespace(args=query), 'render_template': Mock(side_effect=lambda name, **args: (name, args))}
    exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), namespace)
    
    return namespace

class SavedResultsLookupTests(unittest.TestCase):
    def test_mongo_single_lookup_does_not_materialize_a_cursor(self):
        mongo = object.__new__(MongoService)
        mongo.db = MagicMock()
        collection = mongo.db.__getitem__.return_value
        document = {'irID': 'saved'}
        collection.find_one.return_value = document
        self.assertIs(mongo.find_one('results', {'irID': 'saved'}), document)
        collection.find_one.assert_called_once_with({'irID': 'saved'}, None)
        collection.find.assert_not_called()

    def test_unique_ir_visualization_checks_one_result_and_closes_connection(self):
        mongo = Mock()
        mongo.find_one.return_value = {'irID': 'saved'}
        routes = route_functions(mongo, {'id': 'saved'})
        self.assertEqual(routes['visualize'](), ('visualize.html', {'irID': 'saved'}))
        self.assertEqual(mongo.find_one.call_args.args[1], {'irID': 'saved'})
        mongo.find.assert_not_called()
        mongo.close.assert_called_once()

    def test_results_are_decoded_without_sorting_or_mutating_document(self):
        document = {'_id': 'mongo-id', 'irID': 'saved', 'results': gzip.compress(json.dumps([{'value': 1}]).encode())}
        mongo = Mock()
        mongo.find_one.return_value = document
        routes = route_functions(mongo, {'irID': 'saved'})
        self.assertEqual(routes['get_results'](), {'irID': 'saved', 'results': [{'value': 1}]})
        self.assertEqual(mongo.find_one.call_args.args[1], {'irID': 'saved'})
        self.assertIn('_id', document)
        mongo.find.assert_not_called()
        mongo.close.assert_called_once()

    def test_results_without_identifier_do_not_query_all_results(self):
        mongo = Mock()
        routes = route_functions(mongo, {})
        self.assertEqual(routes['get_results'](), [])
        routes['MongoService'].assert_not_called()
