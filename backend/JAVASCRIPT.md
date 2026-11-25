# JavaScript, TypeScript and mixed-language extraction

The backend consumes the published CIMET 1.3.0 package from GitHub Packages.
`cimet-dependency.lock.json` identifies the exact published artifact and matching
released parser assets; no CIMET source build is part of the application build.
Run `python scripts/prepare_cimet_runtime.py` from the repository root, then use
`mvn -s .mvn/cimet-settings.xml -f backend/pom.xml verify`. Maven authentication
uses `GITHUB_ACTOR` and a read-packages `GITHUB_TOKEN` from the environment.
See [multi-language integration](../docs/polyglot-integration.md) for mixed repositories,
request fields, build requirements and capability limits, and [JavaScript source reports](../docs/javascript-analysis.md)
for the registered-source Express/architecture workflow.
