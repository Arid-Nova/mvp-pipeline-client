"""Vendor or verify canonical policy code inside independently built services."""
import argparse
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='Fail when generated copies are stale')
args = parser.parse_args()
content = Path(__file__).with_name('aridnova_policy.py').read_bytes()
provenance = {'schemaVersion': 1, 'canonicalSource': 'javascript-policy/aridnova_policy.py',
              'sha256': hashlib.sha256(content).hexdigest()}
outputs = {}
for service in ('formalmethod', 'vectorgenerator', 'scenariogenerator', 'testgenerator', 'testexecutor'):
    target = root / service / 'app' / 'javascript_policy.py'
    outputs[target] = content
    outputs[target.parent / 'javascript-policy-source.json'] = (json.dumps(provenance, indent=2) + '\n').encode()
scope = (root / 'javascript-policy/source_scope.py').read_bytes()
for name in ('formalmethod/app/source_scope.py', 'vectorgenerator/app/source_scope.py', 'aegis/src/analysis/source_scope.py'):
    outputs[root / name] = scope
stale = []
for target, data in outputs.items():
    if args.check:
        if not target.exists() or target.read_bytes() != data:
            stale.append(str(target.relative_to(root)))
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
if stale:
    raise SystemExit('Stale policy copies: ' + ', '.join(stale))
print('Policy copies are current.' if args.check else json.dumps(provenance))
