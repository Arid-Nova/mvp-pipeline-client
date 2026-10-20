# Multi-language extraction

The pipeline consumes the consolidated CIMET engine pinned in `cimet-source.lock.json`.
The source pin combines the parser contracts and per-file registry from `16-polyglot-contract`
with the repository-aware TypeScript compiler adapter and architecture analysis.
Both JVM services depend on the same `1.3.0-polyglot-SNAPSHOT` Maven artifact built from that pin.
No prebuilt engine JAR is committed.

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

Install Java 21, Maven, Node 22+, npm, Git and Python 3.10+. From the repository root:

```sh
python scripts/build_cimet.py
mvn -B -f backend/pom.xml verify
mvn -B -f componentanalysis/pom.xml verify
```

The build script clones the exact locked engine commit into `.cache/cimet-source`, checks
that its checkout is clean and its Maven version matches, installs it into the local Maven
repository, then prepares trusted parser assets under each service's ignored `vendor/` directory.
Only the trusted analyzers' lockfile dependencies are installed. Analyzed projects' packages,
configuration hooks and scripts are never installed or executed by extraction.

An existing engine checkout can be supplied with `--source PATH`; its clean HEAD must match
the lock. `--maven-repository PATH` supports an isolated Maven cache. `--allow-dirty-local` is
an explicit development override and records the dirty/mismatched source state in generated
provenance; CI and Docker do not use this override. Generated `vendor/cimet-source.json`
records the engine commit, version and built JAR hash.

Docker builds use the repository root context so the source lock and canonical security
adapter are available:

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
available; a Java-only scan does not require Node. Requests containing JavaScript/TypeScript
with an explicit `componentKind` use the existing richer source-report workflow described
in [JavaScript analysis](javascript-analysis.md).

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

## Extending languages

Implement the engine's `LanguageParser` contract and register it in `ParserRegistry`.
Keep parser capabilities, syntax failures and unresolved source observations explicit.
Repository preparation is scoped to one extraction instance; parsers must not execute target
code or share mutable checkout caches across requests. Add parser/IR fixtures, mixed-language
snapshot/delta cases and pipeline capability checks. A parser contribution alone does not
add authorization, formal verification, framework-wide resolution or runtime test support.
