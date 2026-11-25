# Multi-language extraction

Both JVM services consume CIMET v1.3.0 from
[JitPack](https://jitpack.io/#Arid-Nova/mvp-cimet-extraction-library/v1.3.0).
Both POMs declare `com.github.Arid-Nova:mvp-cimet-extraction-library:v1.3.0`
and the public `https://jitpack.io` repository. `cimet-dependency.lock.json`
records the exact JitPack artifact checksums and matching released parser assets.
The application build resolves the dependency through Maven; it does not clone,
compile or locally publish CIMET source, and no engine JAR is committed.

## Scope

| Capability | Coverage |
| --- | --- |
| Source languages | Java, JavaScript/JSX, TypeScript/TSX, Python, Go and C# |
| Mixed repository | Parsers are selected per file; Java and TypeScript can share one repository |
| Multiple repositories | 1 to 8 repository entries in one extraction request |
| JavaScript detail | Supported Express routing, imports, local calls, HTTP calls, schema/SQL and architecture evidence |
| Python, Go, C# | Initial tree-sitter source/framework observations; coverage differs by language and pattern |
| Delta | Structural comparison of complete source snapshots; target snapshot preserves language and service boundaries |
| Security | Existing Java source indexing, and separately scoped Express evidence/finite-policy workflows |
| Other-language or mixed authorization | Explicitly unsupported; no Spring role defaults, successful empty proofs or implicit execution |

Static observations do not establish deployment boundaries, runtime call reachability,
behavioral equivalence, vulnerability completeness or extraction accuracy against ground truth.
An empty result must be read with parser diagnostics and capability metadata.

## Build and verify

Install Java 21, Maven, Node 22+, npm and Python 3.10+. Git is still needed when
the application clones repositories to analyze; it is not used to build CIMET.
JitPack is public, so package-registry credentials and custom Maven settings
are not required. From the repository root:

```sh
python scripts/prepare_cimet_runtime.py
mvn -B -f backend/pom.xml verify
mvn -B -f componentanalysis/pom.xml verify
python scripts/verify_cimet_dependency.py
```

Maven resolves the JitPack package directly. The runtime preparer only fetches
the checksum-verified official release archive and prepares its external
JavaScript/TypeScript adapter plus the pipeline-owned security analyzer under
each service's ignored `vendor/` directory. It does not run Git, Maven or Java
to compile the library. The archive is pinned to release `v1.3.0`, commit
`90987152e3975e3b7fb47336e291c6fb26e31ac7`, and its checksum in the dependency
lock; no moving branch is used.

The published JAR does not embed the Node adapter. Both runtime assets and the
JVM package are therefore required for JavaScript/mixed extraction. Only the
trusted analyzers' lockfile dependencies are installed; analyzed projects'
packages, hooks and scripts are never installed or executed by extraction.
Prepared `vendor/cimet-dependency.json` records the expected package identity and
released runtime hashes. After Maven builds, the verifier checks the actual
resolved POM and the single CIMET JAR embedded in each WAR against the published
hashes, together with the prepared runtime provenance. Preparation alone is not
proof that Maven resolved the expected binary.

To use an isolated Maven repository, pass `-Dmaven.repo.local=PATH` to each Maven
command and `--maven-repository PATH` to the verifier. The local extraction helper
accepts `-MavenRepository` and uses the same verification and dependency
provenance. There is no dirty-source build override in the normal consumption flow.

Docker builds use the repository root context so the dependency lock and canonical
security adapter are available. Both service builds resolve the public JitPack
dependency without package-registry credentials:

```sh
docker compose build backend components
# Or build an individual service:
docker build -f backend/dockerfile -t aridnova-backend .
```

The full Compose deployment still requires its ordinary databases, secrets and service
configuration. JVM tests and the local extraction CLIs require neither databases nor the
analyzed application. Docker runtime validation is separate from JVM compilation and tests.

## Request contract

```json
{
  "systemName": "mixed-example",
  "systemRepositories": [{
    "repoBranchPair": {
      "repositoryURL": "https://github.com/example/mixed.git",
      "branchName": "main"
    },
    "commitID": "0123456789012345678901234567890123456789",
    "language": "auto",
    "componentName": "mixed-api"
  }]
}
```

`language` is a validated discovery hint, not a file exclusion rule. Omitted/`auto`/`polyglot`
use the per-file registry. Accepted named hints are `java`, `javascript`, `typescript`,
`python`, `go`, `csharp`; aliases `js`, `ts`, `c#` and `c-sharp` normalize to these names.
The actual observed languages appear in IR `metadata.languages` and component-index
`metadata.languages`. Existing Java request fields and Java-only source analysis remain
available; a Java-only scan does not require Node. Backend roots always use native per-file
extraction, including when their hint is JavaScript or TypeScript. Registered sources also
retain the richer reports described in [JavaScript analysis](javascript-analysis.md).
Component indexing uses the richer JS/TS-only projection only after a complete native scan
confirms its language coverage; mixed and partial results retain native indexes and diagnostics.

Without a source registry, the engine retains normal Git clone/checkout handling.
With `CIMET_LOCAL_SOURCES_FILE` configured, every requested URL and exact commit must match
an operator-controlled registered source export. Request bodies cannot provide filesystem
paths. Registered directories should be mounted read-only:

```json
{
  "inputs": [{
    "url": "https://github.com/example/mixed.git",
    "commit": "0123456789012345678901234567890123456789",
    "source": "/absolute/read-only/export/mixed",
    "analysisProfile": {"entrypoint": "server.ts"}
  }]
}
```

The registry is bounded to 1 MiB/128 entries. The operator binds export bytes to the stated
commit; no Git HEAD or verified source provenance is inferred from an export directory.
An explicit `componentName` declares one application boundary; this is not evidence of
independent deployment. Registered JavaScript/TypeScript roots declared `componentKind: frontend`
become client modules/orphans, including in `auto` mixed requests; they never create backend
microservices. Frontend source reports require the trusted source registry. Registered mixed exports additionally retain JavaScript architecture
and scoped Express security evidence under `javascriptExtraction`, without duplicating
native modules. Native remote extraction retains parser evidence in class metadata; policy
stages require the richer source-bound report and reject its absence.

## Output and Java compatibility

`metadata.languagePolicy` is `per-file-registry`. Source `status: partial` and parser diagnostics
survive generic component indexing, including invalid-source cases with no extracted classes.
The source-index capability is marked partial rather than a successful empty analysis.
`metadata.capabilities` qualifies snapshot,
architecture, policy, formal and delta support. Generic component-index metadata separately
qualifies source roles, endpoints, control flow and authorization coverage. Non-Java endpoints
retain null authentication/authorization when unknown. Mixed indexes keep the actual language
set so browser, coordinator and direct service APIs reject unsupported downstream stages.

The former component service used a customized engine with additional model methods.
The consolidated pipeline recovers Java field/method annotations, named endpoint parameters,
overloaded signatures and constructors from the source AST. Source-local calls are linked
only when their static same-class target is unique; ambiguous, dynamic and external targets
remain unknown. Control-flow coverage remains partial. Component IDs use a service-scoped
signature format; regenerate dependent indexes together rather than mixing old and new IDs.

Named secondary and nested Java declarations retain their physical source in
`metadata.sourcePath` and their ownership chain in `metadata.declaredType`. Source
recovery binds the exact declaration with an isolated Java 21 parser; equal short
names in different nested owners must remain distinct. The engine also exposes
resolved call namespaces in `metadata.qualifiedObjectType` while retaining the
legacy short `objectType` value.

Full-target delta fingerprints now use the engine's `cimet-snapshot-v2:` format.
Regenerate older full-target deltas; saved base IRs remain usable to create new
comparisons. Do not mix old and new fingerprint formats or component indexes.

## Extending languages

Implement the engine's `LanguageParser` contract and register it in `ParserRegistry`.
Keep parser capabilities, syntax failures and unresolved source observations explicit.
Repository preparation is scoped to one extraction instance; parsers must not execute target
code or share mutable checkout caches across requests. Add parser/IR fixtures, mixed-language
snapshot/delta cases and pipeline capability checks. A parser contribution alone does not
add authorization, formal verification, framework-wide resolution or runtime test support.
