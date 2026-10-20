"""Sync or check browser/coordinator policy dispatch. Executes no analyzed source."""
import argparse
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='Fail when a generated copy is stale')
args = parser.parse_args()
source = (root / 'javascript-workflow/workflow.ts').read_bytes()
stale = []
for name in ('frontend/src/utils/javascriptWorkflow.ts', 'coordinator/src/utilities/javascriptWorkflow.ts'):
    target = root / name
    if args.check:
        if not target.exists() or target.read_bytes() != source:
            stale.append(name)
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source)
if stale:
    raise SystemExit('Stale workflow copies: ' + ', '.join(stale))
print('JavaScript workflow copies are current.' if args.check else 'Synchronized JavaScript workflow dispatch.')
