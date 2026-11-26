import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from scripts.prepare_cimet_runtime import REQUIRED_ADAPTER_FILES, adapter_files_sha256
from scripts.verify_cimet_dependency import verify_service


class PublishedDependencyVerificationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.repository = self.root / "maven"
        actual = Path(__file__).resolve().parents[2] / "cimet-dependency.lock.json"
        self.lock = copy.deepcopy(json.loads(actual.read_text(encoding="utf-8")))
        self.jar = b"separately published engine"
        self.pom = b"published dependency descriptor"
        self.lock["maven"]["jarSha256"] = hashlib.sha256(self.jar).hexdigest()
        self.lock["maven"]["pomSha256"] = hashlib.sha256(self.pom).hexdigest()
        artifact = self.lock["maven"]
        service = self.root / "backend"
        service.mkdir()
        (service / "pom.xml").write_text(f"""
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <artifactId>application</artifactId><version>1</version>
  <properties><cimet.version>{artifact['version']}</cimet.version></properties>
  <repositories><repository><id>{artifact['repositoryId']}</id>
    <url>{artifact['repositoryUrl']}</url></repository></repositories>
  <dependencies><dependency><groupId>{artifact['groupId']}</groupId>
    <artifactId>{artifact['artifactId']}</artifactId><version>${{cimet.version}}</version>
  </dependency></dependencies>
</project>""", encoding="utf-8")
        self.war = service / "target/application-1.war"
        self.war.parent.mkdir()
        self.write_war(self.jar)
        pom_directory = self.repository.joinpath(*artifact["groupId"].split("."),
                                                artifact["artifactId"], artifact["baseVersion"])
        pom_directory.mkdir(parents=True)
        self.pom_file = pom_directory / f'{artifact["artifactId"]}-{artifact["version"]}.pom'
        self.pom_file.write_bytes(self.pom)
        self.vendor = service / "vendor"
        adapter = self.vendor / "javascript"
        for name in REQUIRED_ADAPTER_FILES:
            path = adapter / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("{}" if name.endswith(".json") else "// released adapter\n", encoding="utf-8")
        for name in ("javascript/node_modules/typescript/lib/typescript.js", "security/analyzer.cjs"):
            path = self.vendor / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("// runtime dependency\n", encoding="utf-8")
        self.manifest = {"schemaVersion": 1, "artifact": artifact,
                         "release": self.lock["release"],
                         "runtime": {**self.lock["runtime"],
                                     "adapterFilesSha256": adapter_files_sha256(adapter)}}
        self.write_manifest()

    def write_war(self, content, duplicate=False):
        with zipfile.ZipFile(self.war, "w") as archive:
            artifact_id = self.lock["maven"]["artifactId"]
            archive.writestr(f"WEB-INF/lib/{artifact_id}-published.jar", content)
            if duplicate:
                archive.writestr(f"WEB-INF/lib/{artifact_id}-old-source.jar", b"old")

    def write_manifest(self):
        (self.vendor / "cimet-dependency.json").write_text(json.dumps(self.manifest), encoding="utf-8")

    def verify(self):
        return verify_service(self.root, "backend", self.repository, self.lock)

    def test_exact_published_dependency_is_accepted(self):
        result = self.verify()
        self.assertEqual(result["jarSha256"], hashlib.sha256(self.jar).hexdigest())
        self.assertTrue(result["artifact"].endswith(self.lock["maven"]["version"]))

    def test_old_locally_built_snapshot_cannot_masquerade_as_published_binary(self):
        self.write_war(b"previous local source build")
        with self.assertRaisesRegex(ValueError, "packaged CIMET JAR"):
            self.verify()

    def test_published_descriptor_hash_is_checked(self):
        self.pom_file.write_bytes(b"different transitive dependency descriptor")
        with self.assertRaisesRegex(ValueError, "POM"):
            self.verify()

    def test_drifting_maven_version_is_rejected(self):
        path = self.root / "backend/pom.xml"
        path.write_text(path.read_text().replace(self.lock["maven"]["version"], "1.2.1"))
        with self.assertRaisesRegex(ValueError, "version differs"):
            self.verify()

    def test_drifting_repository_is_rejected(self):
        path = self.root / "backend/pom.xml"
        path.write_text(path.read_text().replace(self.lock["maven"]["repositoryUrl"], "https://example.invalid"))
        with self.assertRaisesRegex(ValueError, "repository differs"):
            self.verify()

    def test_multiple_engine_jars_are_rejected(self):
        self.write_war(self.jar, duplicate=True)
        with self.assertRaisesRegex(ValueError, "exactly one"):
            self.verify()

    def test_previous_registry_engine_cannot_be_bundled_alongside_jitpack(self):
        with zipfile.ZipFile(self.war, "a") as archive:
            archive.writestr("WEB-INF/lib/cimet-extract-lib-old-source.jar", b"old")
        with self.assertRaisesRegex(ValueError, "exactly one"):
            self.verify()

    def test_another_runtime_release_is_rejected(self):
        self.manifest["release"] = {**self.manifest["release"], "commit": "f" * 40}
        self.write_manifest()
        with self.assertRaisesRegex(ValueError, "provenance disagree"):
            self.verify()

    def test_changed_adapter_cannot_reuse_previous_provenance(self):
        (self.vendor / "javascript/analyzer.cjs").write_text("// changed after preparation\n")
        with self.assertRaisesRegex(ValueError, "adapter changed"):
            self.verify()

    def test_missing_external_typescript_runtime_is_rejected(self):
        (self.vendor / "javascript/node_modules/typescript/lib/typescript.js").unlink()
        with self.assertRaisesRegex(ValueError, "assets are missing"):
            self.verify()


if __name__ == "__main__":
    unittest.main()
