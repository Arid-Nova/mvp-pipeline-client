"""Runtime-only bootstrap contracts, isolated from registry and npm services."""
import copy
import importlib.util
import json
import pathlib
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile


SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "prepare_cimet_runtime.py"
spec = importlib.util.spec_from_file_location("prepare_cimet_runtime", SCRIPT)
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class PrepareCimetRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        self.lock = runtime.read_lock(SCRIPT.parents[1] / "cimet-dependency.lock.json")
        security = self.root / "javascript-security"
        security.mkdir()
        (security / "analyzer.cjs").write_text("// Pipeline-owned trusted analyzer\n")
        (security / "package.json").write_text('{"name":"security","version":"1.0.0"}')
        (security / "package-lock.json").write_text('{"lockfileVersion":3}')
        for service in runtime.SERVICES:
            vendor = self.root / service / "vendor"
            (vendor / "javascript").mkdir(parents=True)
            (vendor / "javascript" / "old.txt").write_text("previous adapter")
            (vendor / "security").mkdir()
            (vendor / "security" / "old.txt").write_text("previous security")
            (vendor / "cimet-source.json").write_text('{"old":true}')
            (vendor / "unrelated.txt").write_text("preserve unrelated assets")
        self.installed = []

    def archive(self, extra=None):
        archive = self.root / "release.zip"
        prefix = "mvp-cimet-extraction-library-" + self.lock["release"]["commit"] + "/"
        with zipfile.ZipFile(archive, "w") as bundle:
            for name in runtime.REQUIRED_ADAPTER_FILES:
                contents = ("// trusted runtime " + name + "\n").encode()
                if name == "package.json":
                    contents = json.dumps({"name": "released-runtime", "version": "1.0.0",
                        "dependencies": {"typescript": "5.9.3"},
                        "scripts": {"postinstall": "must-not-run"}}).encode()
                elif name == "package-lock.json":
                    contents = b'{"lockfileVersion":3}'
                bundle.writestr(prefix + "adapter/javascript/" + name, contents)
            bundle.writestr(prefix + "adapter/javascript/lib/extra.cjs", b"// helper\n")
            bundle.writestr(prefix + "src/main/java/NeverCompile.java", b"not compiled")
            bundle.writestr(prefix + "adapter/javascript/eslint.config.cjs", b"not a runtime input")
            if extra:
                extra(bundle, prefix)
        self.lock["runtime"]["sha256"] = runtime.sha256(archive)
        return archive

    def installer(self, directory):
        self.installed.append(directory.name)
        if directory.name == "javascript":
            compiler = directory / "node_modules" / "typescript" / "lib" / "typescript.js"
            compiler.parent.mkdir(parents=True)
            compiler.write_text("// fake installed compiler")

    def assert_previous(self):
        for service in runtime.SERVICES:
            vendor = self.root / service / "vendor"
            self.assertEqual((vendor / "javascript" / "old.txt").read_text(), "previous adapter")
            self.assertEqual((vendor / "security" / "old.txt").read_text(), "previous security")
            self.assertEqual(json.loads((vendor / "cimet-source.json").read_text()), {"old": True})
            self.assertFalse((vendor / "cimet-dependency.json").exists())

    def test_matching_release_prepares_both_services_without_java_source_or_old_provenance(self):
        runtime.prepare_runtime(self.root, self.lock, self.archive(), installer=self.installer)
        self.assertEqual(self.installed, ["javascript", "security"])
        manifests = []
        for service in runtime.SERVICES:
            vendor = self.root / service / "vendor"
            manifest = json.loads((vendor / "cimet-dependency.json").read_text())
            manifests.append(manifest)
            self.assertEqual(manifest["artifact"], self.lock["maven"])
            self.assertEqual(manifest["release"], self.lock["release"])
            self.assertEqual(manifest["runtime"]["sha256"], self.lock["runtime"]["sha256"])
            self.assertEqual(manifest["runtime"]["adapterFilesSha256"],
                             runtime.adapter_files_sha256(vendor / "javascript"))
            self.assertFalse((vendor / "cimet-source.json").exists())
            self.assertFalse((vendor / "javascript" / "old.txt").exists())
            self.assertFalse((vendor / "javascript" / "eslint.config.cjs").exists())
            self.assertEqual((vendor / "unrelated.txt").read_text(), "preserve unrelated assets")
            self.assertFalse(list(vendor.rglob("*.java")))
            self.assertEqual(json.loads((vendor / "security" / "aridnova-security-source.json").read_text())["analyzer"],
                             "aridnova-express-security")
        self.assertEqual(manifests[0], manifests[1])

    def test_bad_checksum_never_installs_or_changes_existing_assets(self):
        archive = self.archive()
        archive.write_bytes(archive.read_bytes() + b"tampered")
        with self.assertRaisesRegex(ValueError, "checksum"):
            runtime.prepare_runtime(self.root, self.lock, archive, installer=self.installer)
        self.assertEqual(self.installed, [])
        self.assert_previous()

    def test_archive_traversal_is_rejected_before_publication(self):
        archive = self.archive(lambda bundle, prefix: bundle.writestr(
            prefix + "adapter/javascript/../../../../escape.cjs", "escape"))
        with self.assertRaisesRegex(ValueError, "unsafe path"):
            runtime.prepare_runtime(self.root, self.lock, archive, installer=self.installer)
        self.assert_previous()
        self.assertFalse((self.root / "escape.cjs").exists())

    def test_archive_symbolic_link_is_rejected(self):
        def linked(bundle, prefix):
            entry = zipfile.ZipInfo(prefix + "adapter/javascript/lib/linked.cjs")
            entry.create_system = 3
            entry.external_attr = (stat.S_IFLNK | 0o777) << 16
            bundle.writestr(entry, "../../outside")
        archive = self.archive(linked)
        with self.assertRaisesRegex(ValueError, "unsupported adapter file"):
            runtime.prepare_runtime(self.root, self.lock, archive, installer=self.installer)
        self.assert_previous()

    def test_extraction_budget_is_checked_before_dependency_installation(self):
        archive = self.archive()
        with patch.object(runtime, "MAX_RUNTIME_BYTES", 10):
            with self.assertRaisesRegex(ValueError, "extraction budget"):
                runtime.prepare_runtime(self.root, self.lock, archive, installer=self.installer)
        self.assertEqual(self.installed, [])
        self.assert_previous()

    def test_dependency_failure_leaves_both_old_runtimes_intact(self):
        def failed(directory):
            self.installer(directory)
            if directory.name == "security":
                raise subprocess.CalledProcessError(1, ["npm", "ci"])
        with self.assertRaises(subprocess.CalledProcessError):
            runtime.prepare_runtime(self.root, self.lock, self.archive(), installer=failed)
        self.assert_previous()

    def test_mid_publication_failure_rolls_back_both_services(self):
        original = runtime._move
        failed = False
        def fail_second(source, destination):
            nonlocal failed
            if not failed and destination == self.root / "componentanalysis/vendor/javascript":
                failed = True
                raise OSError("simulated publication failure")
            original(source, destination)
        with patch.object(runtime, "_move", side_effect=fail_second):
            with self.assertRaisesRegex(OSError, "publication failure"):
                runtime.prepare_runtime(self.root, self.lock, self.archive(), installer=self.installer)
        self.assert_previous()

    def test_unrestorable_publication_retains_backup_data(self):
        original = runtime._move
        failed = False
        def fail_second_and_restore(source, destination):
            nonlocal failed
            if not failed and destination == self.root / "componentanalysis/vendor/javascript":
                failed = True
                raise OSError("simulated publication failure")
            if failed and "backups" in source.parts:
                raise OSError("simulated restore failure")
            original(source, destination)
        with patch.object(runtime, "_move", side_effect=fail_second_and_restore):
            with self.assertRaises(runtime.PublicationRollbackError):
                runtime.prepare_runtime(self.root, self.lock, self.archive(), installer=self.installer)
        saved = list((self.root / ".cache").glob("prepare-cimet-runtime-*/backups/backend/javascript/old.txt"))
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0].read_text(), "previous adapter")

    def test_interruption_during_backup_or_publication_restores_both_services(self):
        archive = self.archive()
        original = runtime._move
        for phase in ("after-backup", "before-second-publication"):
            with self.subTest(phase=phase):
                interrupted = False
                def interrupt(source, destination):
                    nonlocal interrupted
                    if (phase == "before-second-publication" and not interrupted
                            and destination == self.root / "componentanalysis/vendor/javascript"):
                        interrupted = True
                        raise KeyboardInterrupt("simulated cancellation")
                    original(source, destination)
                    if (phase == "after-backup" and not interrupted
                            and source == self.root / "backend/vendor/javascript"):
                        interrupted = True
                        raise KeyboardInterrupt("simulated cancellation after rename")
                with patch.object(runtime, "_move", side_effect=interrupt):
                    with self.assertRaises(KeyboardInterrupt):
                        runtime.prepare_runtime(self.root, self.lock, archive, installer=self.installer)
                self.assert_previous()

    def test_only_production_lifecycle_disabled_npm_runs(self):
        with patch.object(runtime.shutil, "which", return_value="trusted-npm"), \
             patch.object(runtime.subprocess, "run") as run:
            runtime.install_dependencies(self.root)
        run.assert_called_once_with(
            ["trusted-npm", "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
            cwd=self.root, check=True)

    def test_source_and_archive_lock_changes_cannot_enable_other_download_origins(self):
        changed = copy.deepcopy(self.lock)
        changed["runtime"]["url"] = "https://example.invalid/source.zip"
        with patch.object(runtime.urllib.request, "urlopen") as fetch:
            with self.assertRaisesRegex(ValueError, "lock"):
                runtime.prepare_runtime(self.root, changed)
            fetch.assert_not_called()
        self.assert_previous()


if __name__ == "__main__":
    unittest.main()
