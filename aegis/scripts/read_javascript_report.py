"""Offline execution of the production API handler using one saved IR file."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time
from unittest.mock import patch


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ir', required=True)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--expected-status', choices=['partial', 'complete', 'unsupported'], default='partial')
    args = parser.parse_args()
    source = Path(args.ir).resolve()
    destination = Path(args.output_dir).resolve()
    destination.mkdir(parents=True, exist_ok=False)
    input_bytes = source.read_bytes()
    ir = json.loads(input_bytes.decode('utf-8-sig'))
    network_attempts = []

    def no_network(event, values):
        if event in ('socket.connect', 'socket.getaddrinfo'):
            network_attempts.append(event)
            raise RuntimeError('Offline saved-IR execution cannot use network connections')
    sys.addaudithook(no_network)
    aegis = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(aegis))
    import service

    start = time.perf_counter()
    with patch.object(service, 'read_stored_ir', return_value=ir), \
         patch.object(service, 'get_java_facade', side_effect=AssertionError('JS input reached Java engine')) as java:
        coroutine = service.analyze_endpoint({'ir_id': 'saved-local-ir'})
        try:
            coroutine.send(None)
        except StopIteration as finished:
            response = finished.value
        else:
            coroutine.close()
            raise AssertionError('Unexpected asynchronous I/O in saved report handler')
    elapsed = time.perf_counter() - start
    if response.get('status') != args.expected_status:
        raise AssertionError(f"Expected {args.expected_status}: {response.get('reason', response.get('status'))}")
    (destination / 'response.json').write_text(json.dumps(response, indent=2), encoding='utf-8')
    files = ['service.py', 'src/services/ir_reader.py', 'src/analysis/javascript_security.py',
             'src/analysis/input_capability.py']
    summary = {
        'experiment': 'actual-aegis-api-on-saved-javascript-security-evidence',
        'input': str(source), 'inputSha256': hashlib.sha256(input_bytes).hexdigest(),
        'scope': 'Actual API handler, report validation and report projection; only saved-IR HTTP transport replaced with local JSON. No full container execution.',
        'status': response['status'], 'coverage': response.get('coverage'),
        'sourceHashes': {name: hashlib.sha256((aegis / name).read_bytes()).hexdigest() for name in files},
        'elapsedSeconds': elapsed, 'javaFacadeCalls': java.call_count, 'modelCalls': 0,
        'graphReplacementCalls': 0, 'targetExecution': False, 'networkAttempts': network_attempts,
        'persistence': 'Read existing IR; write response artifact only.',
    }
    (destination / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps({'output': str(destination), 'status': response['status'], 'coverage': response.get('coverage'),
                      'javaFacadeCalls': java.call_count, 'networkAttempts': network_attempts}))


if __name__ == '__main__':
    main()
