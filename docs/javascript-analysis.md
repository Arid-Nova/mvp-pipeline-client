# JavaScript and TypeScript source reports

See [multi-language extraction](polyglot-integration.md) for the consolidated engine source
pin, build instructions, mixed repositories and the generic per-file registry.

The richer JavaScript workflow preserves the TypeScript compiler adapter's source snapshots,
architecture analysis, handler/import/local-call relationships, HTTP observations and supported
schema/SQL evidence. Express security and finite-policy analysis remain separately scoped;
see [security coverage](javascript-security.md) and the [policy API](../javascript-policy/README.md).

## Explicit component requests

```json
{
  "systemName": "javascript-example",
  "systemRepositories": [{
    "repoBranchPair": {"repositoryURL": "https://github.com/example/backend.git", "branchName": "main"},
    "commitID": "0123456789012345678901234567890123456789",
    "language": "javascript",
    "componentKind": "backend",
    "componentName": "example-backend"
  }]
}
```

`componentKind` is `backend` or `frontend`. `componentName` defaults to the repository name.
JavaScript and TypeScript hints parse the supported JS/JSX/TS/TSX/module extensions together.
Frontend source modules become IR orphans; backend boundaries are declared by the operator.
The server must configure `CIMET_LOCAL_SOURCES_FILE` as described in the general integration
guide. Requests select registered URL/commit identities, never arbitrary source directories.

Runtime settings:

| Variable | Purpose |
| --- | --- |
| `CIMET_JAVASCRIPT_ADAPTER` | Trusted adapter; `vendor/javascript` locally, `/app/vendor/javascript` in containers |
| `CIMET_NODE_EXECUTABLE` | Node 22+ executable, default `node` |
| `CIMET_LOCAL_SOURCES_FILE` | Server-controlled registered export manifest |
| `CIMET_JAVASCRIPT_CONFIG` | Optional trusted JSON configuration for supported call wrappers |

Generic registry extraction uses a neutral wrapper/origin profile by default. Source-report
mode can supply an explicit profile for application-specific wrappers. These are analysis
assumptions and must be reviewed for each project; no deployed startup command is inferred.

## Results and limits

IR responses remain gzip JSON. `javascriptExtraction` retains source snapshots, diagnostics,
architecture, cohesion/semantic observations and `securityAnalysis`. Component indexes retain
module/function identities, handler bindings, partial contracts and separate Express security
evidence. Missing guards, incomplete assembly and unsupported conditions remain unknown.
The component response exposes `analysisCapabilities`, and saved indexes preserve that metadata.

The browser and background coordinator route source-bound JavaScript policy stages to the
separate finite-policy APIs. Expected-policy conformance requires a source-matched,
maintainer-reviewed manifest. An eligible model or completed property does not establish
vulnerability completeness. No Java/Spring role defaults are inserted. Optional runtime
execution requires explicitly configured isolated fixtures and is not part of extraction.

`/ir/delta` preserves the source-report JavaScript snapshot/architecture/security comparison.
Generic mixed snapshots use the structural engine delta and attach the JavaScript analysis
delta when both snapshots contain compatible source reports. Repository/boundary additions or
removals retain the native target snapshot and report partial optional JavaScript comparison coverage. No behavioral-equivalence claim is made.

To run both actual extraction paths without Spring or databases, build first, then use:

```powershell
./scripts/run-local-javascript.ps1 -SourceManifest /path/sources.json -Request /path/request.json -OutputDirectory /path/new-results
```

The harness accepts `auto` mixed-source requests as well as explicit JavaScript requests.
Choose a new output directory: results are not overwritten. The JVM suites include ordinary
Java compatibility, real JS source-report extraction, mixed-language/multi-repository IR,
source-structural comparison, component indexing and rejection of unsupported languages.
