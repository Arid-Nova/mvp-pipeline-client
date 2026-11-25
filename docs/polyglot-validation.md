# Polyglot contribution validation

The `capability-workflows` job in `.github/workflows/polyglot.yml` runs the bounded
JavaScript analyzer, browser/background dispatch probes, finite source-policy
engine, service capability guards, report UI tests, TypeScript checks and production
frontend compilation. The separate JVM job builds and tests the extraction-backed
Java services.

These checks execute authored synthetic Express/JWT fixtures on loopback. They do
not execute analyzed repositories, connect to production services, call a model
provider or download model weights. Test doubles replace optional Java/model/graph
integrations. Database and provider SDK packages satisfy existing service imports;
no database or API credential is required.

## Install the test dependencies

Use Node.js 22 and Python 3.13, matching CI. From the repository root:

```sh
python -m venv .venv
```

Activate `.venv` with `. .venv/bin/activate` on POSIX, or
`.\.venv\Scripts\Activate.ps1` in PowerShell, then install:

```sh
python -m pip install --disable-pip-version-check -r javascript-policy/requirements-test.txt
npm --prefix javascript-security ci --ignore-scripts --no-audit --no-fund
npm --prefix javascript-policy ci --ignore-scripts --no-audit --no-fund
npm --prefix coordinator ci --ignore-scripts --no-audit --no-fund
npm --prefix frontend ci --ignore-scripts --no-audit --no-fund
```

The checked-in test requirements contain only lightweight API, finite-solver and
service-import dependencies. Torch, transformers, Neo4j and model weights are not
part of this test environment. Package installation uses lockfiles and disables
package lifecycle scripts. The frontend has a pinned public transitive Git dependency;
CI rewrites its SSH transport to HTTPS so no SSH credential is needed.

## Canonical source and dispatch checks

Run these from the repository root. `--check` never rewrites generated copies:

```sh
python scripts/sync_javascript_workflow.py --check
python javascript-policy/sync.py --check
npm --prefix javascript-security test
npm --prefix coordinator run build
npm --prefix coordinator test
```

The TypeScript dispatch tests cover Java compatibility, explicit JS/TS dispatch,
source identity, scoped comparisons, generic-class language metadata, mixed-language
capability guards, and browser/coordinator Aegis behavior. Unsupported language
combinations must make no Java policy/vector/model call.

Run each Python command in its listed working directory with the activated test
environment. The policy suite also exercises the five real lightweight FastAPI
applications, finite Z3 witnesses and the explicitly configured synthetic HTTP
fixture executor.

| Working directory | Command | Locally verified tests on 2026-10-20 |
| --- | --- | ---: |
| `javascript-policy` | `python -m unittest discover -s tests -v` | 30 |
| `aegis` | `python -m unittest discover -s tests -v` | 22 |
| `formalmethod` | `python -m unittest discover -s tests -v` | 10 |
| `vectorgenerator` | `python -m unittest discover -s tests -v` | 5 |
| `scenariogenerator` | `python -m unittest discover -s tests -v` | 4 |

The bounded JavaScript analyzer passed 78 tests and the coordinator/browser probes
passed 26 tests in that local validation. Counts describe the checked revision,
not extraction accuracy or complete security coverage.

## Frontend type, report and production checks

Run in `frontend`:

```sh
npx --no-install tsc --noEmit
npm test -- --watchAll=false --runInBand --testMatch='**/ExpressSecurityReport.test.tsx' '**/polyglotGraph.test.ts' --testPathIgnorePatterns='node_modules'
```

The six source-evidence report tests and thirteen graph parser tests passed (19 total).
The graph tests invoke the real snapshot/comparison parsers with native-IR-shaped
JSModule/JClass fixtures: neutral UNKNOWN containers and methods, calls originating
in those containers, source-module additions/removals, multiple classes in one
physical C# file, distinct source paths, external/unknown target exclusion, and
unchanged Java controller/service behavior. The detailed component view also keeps
neutral modules. No service role is inferred from an UNKNOWN container.

Module graph identity uses physical source path plus declared type/name, so the
engine's portable per-type path representation does not collapse multiple classes
from one file. Modules have a neutral gray source-module visual and retain their
native type/language for inspection.

JavaScript native paths consistently project `{param}` to `{?}` for endpoints and
calls. The existing graph correlation remains exact-URL based; this small
compatibility change does not introduce new verb, host or runtime resolution.
Calls explicitly classified `external` or `unknown` by the JavaScript extractor
cannot create backend edges. Older saved calls without target metadata retain
their previous matching behavior. Graph links remain source observations rather
than proof of runtime communication.

The explicit test match also works when a Windows checkout path contains mixed
separators from the surrounding workspace.

For the production build, use `CI=false npm run build` on POSIX, or in PowerShell:

```powershell
$env:CI = 'false'
npm run build
```

Compilation and TypeScript errors remain fatal. `CI=false` is explicit because the
existing frontend emits source-map warnings from `mobile-drag-drop`/`posthog-js`,
existing lint warnings, and a large-bundle warning. The standard production build
succeeds; Create React App's strict `CI=true` warning policy rejects those warnings.
The contribution does not suppress individual diagnostics or claim a warning-free
frontend.

## Frontend validation after the development update (2026-11-25)

After merging `development` commit `2b21981e022e09843dfcb3ade98d0c06e1fc94cf`,
all 29 frontend suites passed: 518 tests passed and three tests were explicitly
skipped. Two skips are opt-in live-model probes; the third is the upstream
`ChatbotPanel` citation-toggle `aria-expanded` case, already marked `it.skip`.
`RUN_LIVE_LLM=0` prevents live model calls. TypeScript checking and the standard
production build also passed.

The earlier nine-failure chatbot baseline was reproduced against the old
`160760a` source; that historical claim no longer describes this merged branch.
CI now runs the full offline frontend suite, including the new chatbot/planning
tests and the existing polyglot report/graph/upload cases. From `frontend`:

```sh
npm test -- --watchAll=false --runInBand --testMatch='**/*.test.ts' '**/*.test.tsx' --testPathIgnorePatterns='node_modules'
```

Set `RUN_LIVE_LLM=0` in the environment before running this command. The chatbot
backend's `mvn -B -f chatbot-backend/pom.xml verify` passed 196 tests and packaged
the application. CI now includes that check alongside both extraction services.
No local model, full application stack or model downloads were required.

## Source pin, JVM integration and containers

The initial engine source pin was `aa4baa3dab4bafb0be2a97d8c2ff9d1eadc8aafb`
(companion extraction-library PR #29). A fresh remote source checkout was built
successfully with `python scripts/build_cimet.py`, without the development override.
Both JVM services then passed `mvn verify`: 10 backend and 12 component tests.

`docker compose --progress plain build backend components` built both images from
that pin. Runtime probes confirmed UID 10001, writable `/app`, Java 21, Node 22,
and the locked TypeScript 5.9.3 parser in each image. A read-only synthetic source
mount with Express router prefixes, a false `.get()` candidate, aliased Axios and
a top-level execution sentinel produced the expected single route and outbound
call with networking disabled. The target module was not executed.

These checks cover the extraction/runtime integration. The complete deployed
AridNova database and model-service stack was not started by this validation.

## Review regression checks (2026-10-26)

Both JVM `mvn verify` builds passed after the review fixes: 15 backend tests and
14 component tests, with no failures, errors or skipped tests. The Aegis suite
passed 25 tests; frontend TypeScript checking, the 19 focused graph/report tests
above and the standard production build passed. Existing frontend warnings and
the unrelated chatbot baseline described above remain separate.

The added cases cover null JavaScript addons on Java IRs; module source paths
versus nested endpoint URLs; legacy persisted Java comparisons with omitted,
`auto` and `polyglot` hints; unchanged repositories in partial comparisons; HTTP
route suffixes excluded from language detection; named JS/TS hints retaining all
backend languages; malformed non-JavaScript sources preserving partial coverage;
detail-view module identities across files/services; and report-dialog keyboard
focus containment and restoration. Existing pure-Java dispatch, rich JavaScript
security projections, frontend orphans and saved JavaScript comparisons remain
covered. These regressions use authored source fixtures and no target execution.

## Maintainer review integration (2026-11-16)

The immutable engine source pin for that review was
`b095c17e8ca19bc23afd5b0aa65d10c8568796cb`. A clean remote checkout built
through `scripts/build_cimet.py` without a development override; both generated
service manifests matched the lock and the same built JAR hash. The extraction
library's Windows and Ubuntu CI passed on that commit.

Both JVM services passed `mvn verify`: 15 backend and 17 component tests, with
zero failures, errors or skipped tests. The new source fixture covers seven
declarations in one Java file, repeated nested `Worker` names, distinct native
and component identities, source-bound constructors/annotations, four routes,
different ADMIN/EDITOR roles and 201/202 response codes, and actual nested method
CFG bodies beside a record. Two configuration parity cases ensure that adding a
sibling record preserves existing security rules and observed authentication.

Component extraction now resolves physical source separately from synthetic
declaration identities and reuses exact owner-bound Java 21 ASTs. Active source
configuration parsers also use isolated Java 21 configuration. Unresolved response
argument types retain the existing `Object` placeholder without discarding
directly observed response status; no global symbol solver or runtime reachability
is inferred. The engine's versioned full-target delta bindings require older
deltas to be regenerated; existing saved base IRs remain usable.

## Pipeline reviewer corrections (2026-11-18)

Local lightweight suites passed: 42 Aegis, 34 canonical policy, 14 formal and
6 vector-generation tests. The focused native graph suite also passed all 13
tests. Canonical workflow/policy synchronization checks and Python compilation
passed. Run `python -m unittest discover -s tests -v` from each Python service
directory after installing `javascript-policy/requirements-test.txt` in a test
environment; no model weights or live database are required by these suites.

Physical source metadata now precedes synthetic source identities in the shared
language detector. Formal API regressions verify that unsupported physical,
root, service and unclassified-orphan language evidence cannot invoke cloning,
the Java parser or the solver. An explicitly declared frontend remains exempt
only beside a Java backend, including the aggregate language metadata emitted
by actual extraction. Pure frontend inputs cannot enter an empty Java proof.

Aegis uses a shared `NeuroAnalyzer` context and strategy factory for the existing
Java pipeline, bounded JavaScript evidence and explicit unsupported results.
The Java implementation's five class bodies were compared structurally with
the previous version: only the strategy class name and trailing prompt whitespace
were normalized. Actual legacy path/latent-method and attribute-delegation tests
also pass. A fresh-process API test blocks optional Java/model/database imports
while successfully serving JavaScript evidence.

Additional regressions cover null/non-object historical evidence, component-scoped
endpoint facts in mocked provider requests, both callers of the bounded stored-IR
reader, single-document Mongo lookups and existing compressed-result decoding.
All Aegis model/HTTP/database interactions in these cases use local doubles;
no production provider, database or source-analysis deployment was exercised.

## Final reviewer follow-up (2026-11-22)

The current source lock consumes engine
`86f69788676ab5cd24af3c5446366f6889ab2e25`, including the reviewer's readability
changes, enforced formatting and current multi-repository schema regressions.
A clean exact-commit source build succeeded; both generated service manifests
matched the lock and the same JAR hash. Full `mvn verify` passed with 22 backend
and 24 component tests, zero failures/errors/skips, and both WARs packaged.
The engine's Windows/Ubuntu CI passed with 184 JVM tests and 52 parser tests.

The policy/executor suite passed 40 tests. Six new isolation cases include actual
spawned workers executing authored loopback HTTP suites, verifying noninterleaved
setup/request/before-after observations. Repeated worker runs, bounded contention,
failure/process-exit release, origin aliases and independent ports are covered.
Executors sharing a fixture across containers must use the same lock-capable
`ARIDNOVA_JS_FIXTURE_LOCK_DIR` mount; this is not an automatic distributed lock.

Fourteen new Java regressions cover both auxiliary JavaScript presence probes:
100,000 visited entries and 64 directory levels, existing exclusions and no link
following, early positive discovery, and explicit incomplete-inspection errors
for depth/entry/read failures. Actual callers propagate incomplete inspection
before invoking Node. These bounds apply to this auxiliary probe, not every
stage of native source traversal.

Six upload regressions exercise both local-file and saved-IR loading plus source
identity cases. Native services reuse a matching URL/commit backend snapshot
mapping while distinct frontend mappings, revisions, repositories and legacy
branches remain separate. TypeScript checking passed; the focused CI command
now includes `UploadIRCard.test.tsx` alongside the existing graph/report suites.
