"""Build the exact CIMET source pin and prepare ignored parser assets for both JVM services.

Requires Java 21, Maven, Node 22+, npm and Git. Target repositories are never executed.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]

def run(arguments: list[str], directory: Path) -> str:
    return subprocess.check_output(arguments, cwd=directory, text=True).strip()

def executable(name: str) -> str:
    path = shutil.which(name + ('.cmd' if os.name == 'nt' and name in {'mvn','npm'} else ''))
    if not path:
        raise SystemExit(f'Required build executable is missing: {name}')
    return path

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='Existing engine checkout; its HEAD must match the pin')
    parser.add_argument('--allow-dirty-local', action='store_true', help='Development-only override, recorded in generated provenance')
    parser.add_argument('--maven-repository', type=Path)
    args = parser.parse_args()
    lock = json.loads((ROOT / 'cimet-source.lock.json').read_text(encoding='utf-8'))
    if not args.allow_dirty_local and not re.fullmatch(r'[a-f0-9]{40}', lock['commit']):
        raise SystemExit('The engine lock requires an immutable 40-character commit')
    source = (args.source or ROOT / '.cache/cimet-source').resolve()
    git, mvn, npm = (executable(name) for name in ('git','mvn','npm'))
    if not source.exists():
        source.parent.mkdir(parents=True, exist_ok=True)
        run([git, 'clone', '--no-checkout', lock['repository'], str(source)], ROOT)
        run([git, 'fetch', '--depth', '1', 'origin', lock['commit']], source)
        run([git, 'checkout', '--detach', lock['commit']], source)
    revision = run([git, 'rev-parse', 'HEAD'], source)
    dirty = bool(run([git, 'status', '--porcelain'], source))
    if not args.allow_dirty_local and (revision != lock['commit'] or dirty):
        raise SystemExit('Engine checkout must be clean and match cimet-source.lock.json')
    namespace = {'m': 'http://maven.apache.org/POM/4.0.0'}
    version = ET.parse(source/'pom.xml').getroot().findtext('m:version', namespaces=namespace)
    if version != lock['version']:
        raise SystemExit('Engine Maven version differs from the source lock')
    maven_args = [mvn]
    if args.maven_repository:
        maven_args.append('-Dmaven.repo.local=' + str(args.maven_repository.resolve()))
    run([npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], source/'adapter/javascript')
    subprocess.check_call(maven_args + ['-B','-DskipTests','install'], cwd=source)
    jar = source / f'target/cimet-extract-lib-{version}.jar'
    provenance = {'repository':lock['repository'], 'commit':revision, 'version':version,
                  'dirtyDevelopmentSource':dirty, 'matchesLock':revision==lock['commit'],
                  'jarSha256':hashlib.sha256(jar.read_bytes()).hexdigest()}
    for service in ('backend','componentanalysis'):
        vendor = ROOT/service/'vendor'
        vendor.mkdir(parents=True, exist_ok=True)
        adapter = vendor/'javascript'
        if adapter.exists():
            if not adapter.resolve().is_relative_to((ROOT/service).resolve()):
                raise SystemExit('Unexpected adapter output path')
            shutil.rmtree(adapter)
        shutil.copytree(source/'adapter/javascript', adapter, ignore=shutil.ignore_patterns('node_modules','.git'))
        subprocess.check_call([npm,'ci','--ignore-scripts','--no-audit','--no-fund'], cwd=adapter)
        (vendor/'cimet-source.json').write_text(json.dumps(provenance,indent=2)+'\n',encoding='utf-8')
    subprocess.check_call([os.sys.executable,str(ROOT/'scripts/vendor_javascript_security.py')],cwd=ROOT)
    for service in ('backend','componentanalysis'):
        subprocess.check_call([npm,'ci','--ignore-scripts','--no-audit','--no-fund'],cwd=ROOT/service/'vendor/security')
    print('Engine installed and static parser assets prepared: '+revision)

if __name__ == '__main__':
    main()
