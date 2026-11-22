"""Exercise worker-process fixture isolation with authored loopback HTTP state."""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
EXECUTOR = ROOT / 'testexecutor/app/services/javascript_executor.py'


def executor_module():
    spec = importlib.util.spec_from_file_location('isolated_fixture_executor', EXECUTOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_suite_worker(registry, locks, name, suite, ready, start, output):
    os.environ.update(ARIDNOVA_ENABLE_JS_TEST_EXECUTION='1', ARIDNOVA_JS_FIXTURES=registry,
                      ARIDNOVA_JS_FIXTURE_LOCK_DIR=locks)
    executor = executor_module()
    ready.put(name)
    if not start.wait(10):
        output.put({'error': 'worker start timeout'})
        return
    try:
        output.put(executor.execute_suite({'fixtureSet': name, 'suite': suite}))
    except Exception as error:
        output.put({'error': str(error)})


def hold_origin_worker(locks, origin, ready, finish):
    os.environ['ARIDNOVA_JS_FIXTURE_LOCK_DIR'] = locks
    executor = executor_module()
    with executor._fixture_lock(executor._target(origin)):
        ready.set()
        finish.wait(10)


class ExecutorIsolationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='aridnova-executor-isolation-')
        self.directory = Path(self.temporary.name)
        self.locks = self.directory / 'locks'
        self.registry = self.directory / 'registry.json'
        self.env = patch.dict(os.environ, {
            'ARIDNOVA_ENABLE_JS_TEST_EXECUTION': '1',
            'ARIDNOVA_JS_FIXTURES': str(self.registry),
            'ARIDNOVA_JS_FIXTURE_LOCK_DIR': str(self.locks),
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        self.addCleanup(self.temporary.cleanup)
        self.executor = executor_module()
        self.context = multiprocessing.get_context('spawn')

    def suite(self):
        return {'kind': 'aridnova-parameterized-http', 'schemaVersion': 1,
                'policyId': 'isolated-policy', 'cases': [{
                    'id': 'denied', 'endpointId': 'write', 'method': 'POST',
                    'expectedAdmission': False, 'expectedStatuses': [403],
                    'oracle': 'reviewed-policy',
                }]}

    def write_registry(self, origin):
        case = self.suite()['cases'][0]
        digest = hashlib.sha256(json.dumps(case, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()
        fixtures = {}
        for name in ('a', 'b'):
            fixtures[name] = {'isolated': True, 'baseUrl': origin + ('/' if name == 'b' else ''),
                'policyId': 'isolated-policy', 'cases': {'denied': {
                    'caseDigest': digest, 'method': 'POST', 'path': '/denied',
                    'headers': {'X-Test-Identity': name},
                    'beforeCase': [{'method': 'POST', 'path': '/__fixture/reset', 'body': {'owner': name}}],
                    'stateObservation': {'path': '/state', 'headers': {'X-Test-Identity': name}},
                }}}
        self.registry.write_text(json.dumps({'fixtures': fixtures}), encoding='utf-8')

    def stop_process(self, process):
        if process.is_alive():
            process.terminate()
        process.join(5)
        process.close()

    def test_two_worker_processes_cannot_interleave_complete_suites(self):
        state = {'owner': None, 'events': []}
        mutex = threading.Lock()

        class Fixture(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def respond(self, status, data):
                body = json.dumps(data, sort_keys=True).encode()
                self.send_response(status)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self):
                data = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))) or b'{}')
                if self.path == '/__fixture/reset':
                    with mutex:
                        state['owner'] = data['owner']
                        state['events'].append((data['owner'], 'setup'))
                    self.respond(200, {})
                else:
                    with mutex:
                        state['events'].append((self.headers['X-Test-Identity'], 'request'))
                    # Give an unprotected second suite a chance to reset state
                    # between this denial's before and after observations.
                    time.sleep(0.15)
                    self.respond(403, {})

            def do_GET(self):
                with mutex:
                    state['events'].append((self.headers['X-Test-Identity'], 'observe'))
                    owner = state['owner']
                self.respond(200, {'owner': owner})

        server = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        self.write_registry(f'http://127.0.0.1:{server.server_port}')
        ready, output = self.context.Queue(), self.context.Queue()
        start = self.context.Event()
        processes = [self.context.Process(target=run_suite_worker,
            args=(str(self.registry), str(self.locks), name, self.suite(), ready, start, output)) for name in ('a', 'b')]
        for process in processes:
            process.start()
            self.addCleanup(self.stop_process, process)
        self.assertEqual({ready.get(timeout=10), ready.get(timeout=10)}, {'a', 'b'})
        start.set()
        results = [output.get(timeout=10), output.get(timeout=10)]
        for result in results:
            self.assertEqual(result.get('counts'), {'passed': 1, 'failed': 0, 'error': 0, 'skipped': 0}, result)
        for process in processes:
            process.join(5)
            self.assertEqual(process.exitcode, 0)
        self.assertEqual(len(state['events']), 8)
        first, second = state['events'][:4], state['events'][4:]
        self.assertEqual({name for name, _ in first}, {first[0][0]})
        self.assertEqual({name for name, _ in second}, {second[0][0]})
        self.assertNotEqual(first[0][0], second[0][0])
        self.assertEqual([step for _, step in first], ['setup', 'observe', 'request', 'observe'])
        self.assertEqual([step for _, step in second], ['setup', 'observe', 'request', 'observe'])

    def test_loopback_aliases_and_default_port_share_the_same_lock(self):
        targets = ['http://127.0.0.1', 'http://127.0.0.1:80/', 'http://127.0.0.2:80',
                   'http://[::1]:80', 'http://[0:0:0:0:0:0:0:1]']
        self.assertEqual(len({self.executor._origin_key(self.executor._target(origin)) for origin in targets}), 1)
        self.assertNotEqual(self.executor._origin_key(self.executor._target(targets[0])),
                            self.executor._origin_key(self.executor._target('http://127.0.0.1:81')))

    def test_busy_origin_fails_before_any_fixture_request(self):
        self.write_registry('http://127.0.0.1:12345')
        target = self.executor._target('http://127.0.0.1:12345')
        with self.executor._fixture_lock(target), patch.object(self.executor, 'LOCK_WAIT_SECONDS', 0.05), \
             patch.object(self.executor, '_request') as request:
            with self.assertRaisesRegex(ValueError, 'busy'):
                self.executor.execute_suite({'fixtureSet': 'a', 'suite': self.suite()})
        request.assert_not_called()

    def test_lock_directory_failure_fails_before_any_fixture_request(self):
        self.write_registry('http://127.0.0.1:12345')
        self.locks.write_text('not a directory', encoding='utf-8')
        with patch.object(self.executor, '_request') as request:
            with self.assertRaisesRegex(ValueError, 'isolation is unavailable'):
                self.executor.execute_suite({'fixtureSet': 'a', 'suite': self.suite()})
        request.assert_not_called()

    def test_request_failure_releases_the_lock(self):
        self.write_registry('http://127.0.0.1:12345')
        with patch.object(self.executor, '_request', side_effect=OSError('fixture unavailable')):
            result = self.executor.execute_suite({'fixtureSet': 'a', 'suite': self.suite()})
        self.assertEqual(result['counts']['error'], 1)
        with self.executor._fixture_lock(self.executor._target('http://127.0.0.1:12345'), timeout=0):
            pass

    def test_other_ports_are_independent_and_process_exit_releases_lock(self):
        ready, finish = self.context.Event(), self.context.Event()
        process = self.context.Process(target=hold_origin_worker,
            args=(str(self.locks), 'http://127.0.0.1:12345', ready, finish))
        process.start()
        self.addCleanup(self.stop_process, process)
        self.assertTrue(ready.wait(10))
        with self.executor._fixture_lock(self.executor._target('http://127.0.0.1:12346'), timeout=0):
            pass
        process.terminate()
        process.join(5)
        with self.executor._fixture_lock(self.executor._target('http://127.0.0.1:12345'), timeout=0):
            pass


if __name__ == '__main__':
    unittest.main()
