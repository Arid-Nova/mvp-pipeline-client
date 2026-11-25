"""Verify direct published CIMET consumption and matching prepared runtime assets.

This reads build outputs only. It never compiles, installs or downloads CIMET.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SERVICES = ("backend", "componentanalysis")
NS = {"m": "http://maven.apache.org/POM/4.0.0"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def project_contract(root: Path, service: str, lock: dict) -> Path:
    """Reject drifting Maven coordinates before trusting a packaged application."""
    project = ET.parse(root / service / "pom.xml").getroot()
    artifact = lock["maven"]
    dependencies = [item for item in project.findall("m:dependencies/m:dependency", NS)
                    if item.findtext("m:groupId", namespaces=NS) == artifact["groupId"]
                    and item.findtext("m:artifactId", namespaces=NS) == artifact["artifactId"]]
    if len(dependencies) != 1:
        raise ValueError(f"{service}: declare exactly one published CIMET dependency")
    version = dependencies[0].findtext("m:version", namespaces=NS)
    if version == "${cimet.version}":
        version = project.findtext("m:properties/m:cimet.version", namespaces=NS)
    if version != artifact["version"]:
        raise ValueError(f"{service}: Maven CIMET version differs from the dependency lock")
    repositories = project.findall("m:repositories/m:repository", NS)
    if not any(item.findtext("m:id", namespaces=NS) == artifact["repositoryId"]
               and item.findtext("m:url", namespaces=NS) == artifact["repositoryUrl"]
               for item in repositories):
        raise ValueError(f"{service}: published CIMET repository differs from the dependency lock")
    name = project.findtext("m:artifactId", namespaces=NS)
    version = project.findtext("m:version", namespaces=NS)
    return root / service / "target" / f"{name}-{version}.war"


def verify_published_pom(repository: Path, artifact: dict) -> None:
    directory = repository.joinpath(*artifact["groupId"].split("."),
                                    artifact["artifactId"], artifact["baseVersion"])
    # Maven may retain a base-version alias for a uniquely pinned snapshot.
    candidates = [directory / f'{artifact["artifactId"]}-{version}.pom'
                  for version in (artifact["version"], artifact["baseVersion"])]
    pom = next((candidate for candidate in candidates if candidate.is_file()), None)
    if pom is None or sha256(pom) != artifact["pomSha256"]:
        raise ValueError("Resolved CIMET POM does not match the published package checksum")


def verify_service(root: Path, service: str, repository: Path, lock: dict) -> dict:
    artifact = lock["maven"]
    war = project_contract(root, service, lock)
    if not war.is_file():
        raise ValueError(f"{service}: package the application before dependency verification")
    with zipfile.ZipFile(war) as archive:
        libraries = [entry for entry in archive.infolist()
                     if entry.filename.startswith("WEB-INF/lib/" + artifact["artifactId"] + "-")
                     and entry.filename.endswith(".jar")]
        if len(libraries) != 1 or libraries[0].file_size > 64 * 1024 * 1024:
            raise ValueError(f"{service}: application must contain exactly one bounded CIMET JAR")
        digest = hashlib.sha256(archive.read(libraries[0])).hexdigest()
    if digest != artifact["jarSha256"]:
        raise ValueError(f"{service}: packaged CIMET JAR differs from the published package")
    verify_published_pom(repository, artifact)
    vendor = root / service / "vendor"
    manifest = json.loads((vendor / "cimet-dependency.json").read_text(encoding="utf-8"))
    if manifest.get("artifact") != artifact or manifest.get("release") != lock["release"]:
        raise ValueError(f"{service}: runtime and published dependency provenance disagree")
    runtime = manifest.get("runtime") or {}
    if any(runtime.get(key) != lock["runtime"][key] for key in ("url", "sha256")):
        raise ValueError(f"{service}: runtime release archive differs from the dependency lock")
    # Reuse the admission tool's canonical runtime digest, not filesystem order.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from prepare_cimet_runtime import adapter_files_sha256
    if runtime.get("adapterFilesSha256") != adapter_files_sha256(vendor / "javascript"):
        raise ValueError(f"{service}: prepared JavaScript adapter changed after verification")
    for required in ("javascript/analyzer.cjs", "javascript/node_modules/typescript/lib/typescript.js",
                     "security/analyzer.cjs"):
        if not (vendor / required).is_file():
            raise ValueError(f"{service}: required parser runtime assets are missing")
    return {"service": service, "artifact": f'{artifact["groupId"]}:{artifact["artifactId"]}:{artifact["version"]}',
            "jarSha256": digest, "release": lock["release"]["tag"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--service", action="append", choices=SERVICES,
                        help="Verify one service; defaults to both")
    parser.add_argument("--maven-repository", type=Path,
                        default=Path.home() / ".m2/repository")
    args = parser.parse_args()
    lock = json.loads((ROOT / "cimet-dependency.lock.json").read_text(encoding="utf-8"))
    try:
        reports = [verify_service(ROOT, service, args.maven_repository.resolve(), lock)
                   for service in (args.service or SERVICES)]
    except (ValueError, OSError, ET.ParseError, zipfile.BadZipFile) as error:
        raise SystemExit(f"Published dependency verification failed: {error}") from None
    print(json.dumps({"publishedCimetVerified": reports}, indent=2))


if __name__ == "__main__":
    main()
