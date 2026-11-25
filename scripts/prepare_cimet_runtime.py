"""Prepare released parser runtime assets; CIMET itself is a published Maven dependency.

This command never clones or compiles CIMET and never installs a JVM artifact.
Only the checksum-locked external JavaScript adapter and the pipeline-owned
security adapter receive production, lifecycle-disabled npm dependencies.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import tempfile
from typing import Callable
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SERVICES = ("backend", "componentanalysis")
MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 20_000
MAX_RUNTIME_BYTES = 32 * 1024 * 1024
MAX_RUNTIME_FILES = 256
REQUIRED_ADAPTER_FILES = {
    "analyzer.cjs", "architecture.cjs", "contracts.cjs", "semantics.cjs",
    "lib/analysis.cjs", "lib/cli.cjs", "package.json", "package-lock.json",
}


class PublicationRollbackError(RuntimeError):
    """Retain staged backups if the filesystem prevents complete rollback."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_lock(path: Path) -> dict:
    lock = json.loads(path.read_text(encoding="utf-8"))
    validate_lock(lock)
    return lock


def validate_lock(lock: dict) -> None:
    try:
        commit = lock["release"]["commit"]
        runtime = lock["runtime"]
        artifact = lock["maven"]
        valid = bool(re.fullmatch(r"[a-f0-9]{40}", commit))
        valid &= runtime["url"] == (
            "https://codeload.github.com/Arid-Nova/mvp-cimet-extraction-library/zip/" + commit)
        for value in (runtime["sha256"], artifact["jarSha256"], artifact["pomSha256"]):
            valid &= bool(re.fullmatch(r"[a-f0-9]{64}", value))
        for field in ("groupId", "artifactId", "version", "baseVersion", "repositoryId"):
            valid &= bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._+-]*", artifact[field]))
        valid &= artifact["repositoryUrl"] == (
            "https://maven.pkg.github.com/arid-nova/mvp-cimet-extraction-library")
        if not valid:
            raise ValueError("Invalid dependency lock")
    except (ValueError, KeyError, TypeError):
        raise ValueError("The published CIMET dependency lock is incomplete or invalid") from None


def checked_archive(path: Path, expected: str) -> Path:
    if not path.is_file() or path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError("The released runtime archive is missing or exceeds its size limit")
    if sha256(path) != expected:
        raise ValueError("The released runtime archive does not match its locked checksum")
    return path


def download_archive(lock: dict, cache: Path) -> Path:
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / (lock["release"]["commit"] + ".zip")
    if archive.exists():
        return checked_archive(archive, lock["runtime"]["sha256"])
    descriptor, temporary = tempfile.mkstemp(prefix="download-", suffix=".zip", dir=cache)
    temporary_path = Path(temporary)
    try:
        with os.fdopen(descriptor, "wb") as output, urllib.request.urlopen(
                lock["runtime"]["url"], timeout=60) as source:
            total = 0
            while chunk := source.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_ARCHIVE_BYTES:
                    raise ValueError("The released runtime archive exceeds its size limit")
                output.write(chunk)
        checked_archive(temporary_path, lock["runtime"]["sha256"])
        temporary_path.replace(archive)
        return archive
    finally:
        temporary_path.unlink(missing_ok=True)


def _within(path: Path, directory: Path) -> Path:
    resolved = path.resolve()
    allowed = directory.resolve()
    if resolved == allowed or not resolved.is_relative_to(allowed):
        raise ValueError("Generated runtime output must remain inside its intended directory")
    return resolved


def _remove_generated(path: Path, allowed: Path) -> None:
    _within(path, allowed)
    if path.is_symlink():
        raise ValueError("Generated runtime paths must not be symbolic links")
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink(missing_ok=True)


@contextmanager
def _staging(root: Path):
    cache = root / ".cache"
    _within(cache, root)
    if cache.is_symlink():
        raise ValueError("Runtime staging directory must not be a symbolic link")
    cache.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix="prepare-cimet-runtime-", dir=cache))
    _within(stage, cache)
    preserve = False
    try:
        yield stage
    except PublicationRollbackError:
        preserve = True
        raise
    finally:
        if not preserve:
            _remove_generated(stage, cache)


def _adapter_file(relative: str) -> bool:
    return relative in REQUIRED_ADAPTER_FILES or (
        relative.startswith("lib/") and relative.endswith(".cjs"))


def adapter_files_sha256(directory: Path) -> dict[str, str]:
    """Hash executable adapter inputs, excluding installed dependencies and tooling."""
    library = directory / "lib"
    _within(library, directory)
    if library.is_symlink():
        raise ValueError("Runtime adapter paths must not be symbolic links")
    paths = [directory / relative for relative in REQUIRED_ADAPTER_FILES]
    visited = 0
    for current, directories, files in os.walk(library, followlinks=False):
        visited += len(directories) + len(files)
        if visited > MAX_ARCHIVE_ENTRIES:
            raise ValueError("The runtime adapter exceeds its entry budget")
        for name in directories:
            child = Path(current) / name
            _within(child, directory)
            if child.is_symlink():
                raise ValueError("Runtime adapter paths must not be symbolic links")
        paths.extend(Path(current) / name for name in files if name.endswith(".cjs"))
        if len(paths) > MAX_RUNTIME_FILES + len(REQUIRED_ADAPTER_FILES):
            raise ValueError("The runtime adapter exceeds its file budget")
    selected = sorted(set(paths))
    if len(selected) > MAX_RUNTIME_FILES:
        raise ValueError("The runtime adapter exceeds its file budget")
    total = 0
    hashes = {}
    for path in selected:
        _within(path, directory)
        if path.is_symlink() or not path.is_file():
            raise ValueError("Runtime adapter files are missing or symbolic links")
        total += path.stat().st_size
        if total > MAX_RUNTIME_BYTES:
            raise ValueError("The runtime adapter exceeds its byte budget")
        hashes[path.relative_to(directory).as_posix()] = sha256(path)
    return hashes


def extract_adapter(archive: Path, destination: Path, commit: str) -> dict[str, str]:
    """Extract only the external adapter, never archive Java sources or build hooks."""
    expected_root = "mvp-cimet-extraction-library-" + commit
    prefix = expected_root + "/adapter/javascript/"
    selected: list[tuple[zipfile.ZipInfo, str]] = []
    seen: set[str] = set()
    total = 0
    with zipfile.ZipFile(archive) as bundle:
        if len(bundle.infolist()) > MAX_ARCHIVE_ENTRIES:
            raise ValueError("The runtime archive exceeds its entry limit")
        for item in bundle.infolist():
            parts = PurePosixPath(item.filename).parts
            if (not parts or parts[0] != expected_root or "\\" in item.filename
                    or item.filename.startswith("/")
                    or any(part in (".", "..") or ":" in part for part in parts)):
                raise ValueError("The runtime archive contains an unsafe path")
            if item.is_dir() or not item.filename.startswith(prefix):
                continue
            relative = item.filename[len(prefix):]
            if not _adapter_file(relative):
                continue
            mode = item.external_attr >> 16
            if stat.S_ISLNK(mode) or item.flag_bits & 1:
                raise ValueError("The runtime archive contains an unsupported adapter file")
            if relative.casefold() in seen:
                raise ValueError("The runtime archive contains duplicate adapter paths")
            seen.add(relative.casefold())
            total += item.file_size
            if total > MAX_RUNTIME_BYTES or len(selected) >= MAX_RUNTIME_FILES:
                raise ValueError("The runtime adapter exceeds its extraction budget")
            selected.append((item, relative))
        if not REQUIRED_ADAPTER_FILES.issubset({relative for _, relative in selected}):
            raise ValueError("The released runtime archive lacks required adapter files")
        destination.mkdir(parents=True, exist_ok=True)
        hashes = {}
        for item, relative in selected:
            target = destination.joinpath(*PurePosixPath(relative).parts)
            _within(target, destination)
            target.parent.mkdir(parents=True, exist_ok=True)
            data = bundle.read(item)
            if len(data) != item.file_size:
                raise ValueError("The runtime archive has inconsistent file sizes")
            target.write_bytes(data)
            hashes[relative] = hashlib.sha256(data).hexdigest()
        return dict(sorted(hashes.items()))


def stage_security(root: Path, destination: Path) -> None:
    source = root / "javascript-security"
    _within(source, root)
    if source.is_symlink():
        raise ValueError("Pipeline security source must not be a symbolic link")
    files = sorted(source.glob("*.cjs")) + [source / "package.json", source / "package-lock.json"]
    if not (source / "analyzer.cjs").is_file() or any(not path.is_file() for path in files):
        raise ValueError("The pipeline security analyzer and dependency lock are required")
    destination.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for path in files:
        _within(path, source)
        if path.is_symlink():
            raise ValueError("Pipeline security assets must not be symbolic links")
        shutil.copyfile(path, destination / path.name)
        hashes[path.name] = sha256(path)
    provenance = {"analyzer": "aridnova-express-security", "schemaVersion": 1,
                  "sourceDirectory": "javascript-security", "filesSha256": hashes}
    (destination / "aridnova-security-source.json").write_text(
        json.dumps(provenance, indent=2) + "\n", encoding="utf-8")


def install_dependencies(directory: Path) -> None:
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm:
        raise ValueError("npm is required to prepare released parser dependencies")
    subprocess.run([npm, "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
                   cwd=directory, check=True)


def _move(source: Path, destination: Path) -> None:
    source.rename(destination)


def publish_runtime(root: Path, stage: Path) -> None:
    """Rollback all known runtime outputs if publication fails partway through."""
    operations = []
    for service in SERVICES:
        service_root = root / service
        vendor = service_root / "vendor"
        _within(vendor, service_root)
        if service_root.is_symlink() or vendor.is_symlink():
            raise ValueError("Service runtime directories must not be symbolic links")
        for name in ("javascript", "security", "cimet-dependency.json", "cimet-source.json"):
            target = vendor / name
            _within(target, vendor)
            if target.is_symlink():
                raise ValueError("Service runtime outputs must not be symbolic links")
            source = stage / "prepared" / service / "vendor" / name
            if name != "cimet-source.json" and not source.exists():
                raise ValueError("Prepared runtime output is incomplete")
            operations.append((target, source if source.exists() else None,
                               stage / "backups" / service / name, vendor))
    completed = []
    try:
        for target, source, backup, vendor in operations:
            vendor.mkdir(parents=True, exist_ok=True)
            backup.parent.mkdir(parents=True, exist_ok=True)
            previous = target.exists()
            # Register first: interruption can arrive after a rename has taken
            # effect but before the following Python statement runs.
            completed.append((target, backup if previous else None, vendor))
            if previous:
                _move(target, backup)
            if source is not None:
                _move(source, target)
    except BaseException:
        failed = False
        for target, backup, vendor in reversed(completed):
            try:
                if backup is None:
                    if target.exists():
                        _remove_generated(target, vendor)
                elif backup.exists():
                    if target.exists():
                        _remove_generated(target, vendor)
                    _move(backup, target)
                elif not target.exists():
                    raise OSError("Previous runtime output cannot be located")
                # If the original target remains and no backup exists, its
                # first rename never took effect; leave that original intact.
            except BaseException:
                failed = True
        if failed:
            raise PublicationRollbackError(
                "Runtime publication rollback was incomplete; backups are retained in " + str(stage)) from None
        raise


def prepare_runtime(root: Path, lock: dict, archive: Path | None = None,
                    cache: Path | None = None,
                    installer: Callable[[Path], None] = install_dependencies) -> None:
    root = root.resolve()
    validate_lock(lock)
    archive = checked_archive(archive, lock["runtime"]["sha256"]) if archive is not None else (
        download_archive(lock, cache or root / ".cache" / "cimet-runtime"))
    with _staging(root) as stage:
        javascript = stage / "shared" / "javascript"
        security = stage / "shared" / "security"
        adapter_hashes = extract_adapter(archive, javascript, lock["release"]["commit"])
        stage_security(root, security)
        installer(javascript)
        installer(security)
        if not (javascript / "node_modules" / "typescript" / "lib" / "typescript.js").is_file():
            raise ValueError("The released TypeScript runtime was not installed")
        if adapter_files_sha256(javascript) != adapter_hashes:
            raise ValueError("Runtime source changed during dependency preparation")
        provenance = {"schemaVersion": 1, "artifact": lock["maven"], "release": lock["release"],
                      "runtime": {**lock["runtime"], "adapterFilesSha256": adapter_hashes}}
        for service in SERVICES:
            vendor = stage / "prepared" / service / "vendor"
            vendor.mkdir(parents=True)
            shutil.copytree(javascript, vendor / "javascript")
            shutil.copytree(security, vendor / "security")
            (vendor / "cimet-dependency.json").write_text(
                json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
        publish_runtime(root, stage)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="Use an already downloaded, checksum-matching release archive")
    parser.add_argument("--cache-directory", type=Path, help="Directory for checksum-verified release archives")
    args = parser.parse_args()
    prepare_runtime(ROOT, read_lock(ROOT / "cimet-dependency.lock.json"), args.archive, args.cache_directory)
    print("Released parser runtime assets prepared for both services; CIMET is resolved by Maven.")


if __name__ == "__main__":
    main()
