# JavaScript, TypeScript and mixed-language extraction

The backend consumes CIMET v1.3.0 from the public JitPack repository as
`com.github.Arid-Nova:mvp-cimet-extraction-library:v1.3.0`.
`cimet-dependency.lock.json` identifies the exact artifact and matching released
parser assets; no CIMET source build is part of the application build.
Run `python scripts/prepare_cimet_runtime.py` from the repository root, then use
`mvn -f backend/pom.xml verify`. Package-registry credentials are not required.
See [multi-language integration](../docs/polyglot-integration.md) for mixed repositories,
request fields, build requirements and capability limits, and [JavaScript source reports](../docs/javascript-analysis.md)
for the registered-source Express/architecture workflow.
