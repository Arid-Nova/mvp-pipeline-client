"""Copy the pipeline-owned Express analyzer into the two isolated service build contexts."""
import hashlib
import json
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / 'javascript-security'
files = sorted(source.glob('*.cjs')) + [source / 'package.json', source / 'package-lock.json']
if not (source / 'analyzer.cjs').is_file() or any(not path.is_file() for path in files):
    raise SystemExit('The Express analyzer and lockfile must exist before vendoring.')
hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
provenance = {'analyzer': 'aridnova-express-security', 'schemaVersion': 1,
              'sourceDirectory': 'javascript-security', 'filesSha256': hashes}
for service in ('backend', 'componentanalysis'):
    destination = root / service / 'vendor/security'
    destination.mkdir(parents=True, exist_ok=True)
    for path in files:
        shutil.copyfile(path, destination / path.name)
    (destination / 'aridnova-security-source.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
print(f'Vendored {len(files)} security analyzer files into both services.')
