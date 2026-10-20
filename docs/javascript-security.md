# Express security analysis and policy verification

AridNova parses JavaScript/TypeScript source to reconstruct the selected Express
application, follow authentication/authorization paths, and expose source-bound
security evidence. Static extraction never imports or executes the analyzed
application. The optional Nutrosal component fixture described below explicitly
executes selected immutable source files against a seeded local database.

Two pipeline-owned packages extend the source-pinned consolidated CIMET extraction and
architecture build:

- `javascript-security/`: TypeScript AST analysis of startup, middleware, request
  identity, role/ownership checks, execution paths and data operations.
- `javascript-policy/`: finite typed policy analysis, Z3 verification, vectors,
  deterministic scenarios/test suites and isolated parameterized execution.

The AST analyzer is copied into both Java service build contexts by
`scripts/vendor_javascript_security.py`. Each copy has a provenance hash manifest.
The Python engine is copied into its five service build contexts by
`javascript-policy/sync.py`; canonical and vendored hashes must match.

## Reading coverage correctly

Each backend snapshot has `security`; the combined IR has
`javascriptExtraction.securityAnalysis.components`. Component indexes retain the
endpoint evidence in `sourceEvidence.security`.

The report contains `applicationAssembly` and separate coverage for authentication,
role checks, ownership checks, execution paths, data access and the finite policy
model. Completion means coverage of those declared properties for the selected
source configuration. It does not mean absence of vulnerabilities.

Every recorded endpoint includes:

- Active, inactive or unresolved registration context, effective paths and ordered
  middleware evidence. Inactive server copies remain visible outside the active graph.
- Authentication observations: `required`, `optional`, `not-observed` or `unknown`.
- Role/ownership predicates, conditions, locations and enforcement evidence.
- Execution-path observations, protected data operations and applicable guards.
- A typed finite `policyModel`, where the source abstraction is supported.
- Findings, confidence, review guidance and explicit unresolved reasons.

`not-observed` does not assert public access. Numeric role values are retained;
business role names are not invented. Conditions retain conjunctions, alternatives
and resource-specific ownership scope. A guard on one resource does not protect
an unrelated read/write merely because it occurs in the same controller.

## Startup and the Nutrosal study configuration

The trusted source manifest may select an entrypoint:

```json
{
  "inputs": [{
    "url": "https://github.com/example/backend.git",
    "commit": "<exact revision>",
    "source": "/analysis/source/backend",
    "analysisProfile": {"entrypoint": "server.js"}
  }]
}
```

The Nutrosal study selects `server.js`. This is a declared study configuration,
not independent confirmation of the production startup command. The report records
the selected entrypoint, selection source and remaining assembly assumptions.

Supported literal Consign loading, app/router aliases, registration order, mount
prefixes, route overlap and version-aware Multer summaries are reconstructed
statically. Dynamic options, unresolved loading and order-dependent directory
registration retain partial coverage. See
[application assembly](../javascript-security/APPLICATION_ASSEMBLY.md).

## Pipeline stages

Regenerate source IR and component indexes through the existing language-aware
APIs or `scripts/run-local-javascript.ps1`. Older saved IR lacks the new evidence.

The browser and background coordinator now dispatch JavaScript stages to the
dedicated APIs:

| Stage | API | Meaning |
|---|---|---|
| Aegis evidence | `/analyze` with saved `ir_id` | Validated static report; no Java/model/graph execution |
| Formal analysis | `/verify/javascript` | Property-specific finite Z3 checks where eligible |
| Vectors | `/vectors/javascript` | Actual typed role/token/ownership states; unknown retained |
| Scenarios | `/scenarios/javascript` | Deterministic source-bound cases |
| Tests | `/testsuites/javascript` | Declarative HTTP suite; no model-generated code |
| Execution | `/api/execute/javascript` | Explicit server-configured isolated fixture only |

The JavaScript prompt stage prepares policy inputs without an LLM. An executor
stage without a fixture selection returns `awaiting-fixtures` and performs no
requests. Inline policy hashes are not legacy MongoDB ObjectIds. The browser
provides a report view and downloadable JSON for each JavaScript stage.

## Formal results and intended policy

An endpoint is eligible only when its application registration/middleware context
and the relevant typed path model are complete, active and within execution limits.
`policyModel.admissionScope: successful-http-response` identifies successful response
paths; protected-operation reachability is checked separately. Unsupported coercion,
unknown predicates and unresolved paths do not become Boolean guarantees.

Z3 checks observed reachability and, when a source-matched reviewed expected policy
is supplied, overpermission, overrestriction and protected-operation policy
violations. SAT/UNSAT applies to the named property within the finite model. A
missing expected policy means no conformance verdict; it does not imply that public
access is intended or that a route is secure. Templates are explicitly unreviewed.

The legacy `/verify` API preserves its response shape and adds `policyAnalysis` for
typed JavaScript reports, with a null whole-system `is_satisfiable` value. Old reports
without typed models remain unsupported. Mixed inputs name unassessed components.
See [policy schemas and examples](../javascript-policy/README.md).

## Runtime tests

The HTTP executor is disabled by default. An administrator must configure a named,
isolated fixture set, exact source-bound cases and test credentials outside the
reports. Only literal loopback HTTP origins are supported; callers cannot supply
arbitrary target URLs or executable code. No redirects are followed.

Denied cases require both a reviewed status oracle and a read-only state observation.
The runner compares the observed state before/after. Thus a 403 response followed by
an observed write fails. Missing bindings or observations are skips. State outside
the fixture's observations is not proven unchanged. Static analysis and the generic
Express regression fixture execute no Nutrosal source. The separate
`run_nutrosal_access_study.py --runtime` workflow executes selected original
Nutrosal routes, controllers, models and middleware with fixture dependencies.
It uses in-memory SQLite, fresh JWT credentials and literal loopback requests.
The production server entrypoint, production configuration, MySQL deployment,
jobs and websockets are outside that execution.

## Reviewed resource policy and partial models

`javascript-policy/business_policy.py` turns the supplied administrator/own/assigned
rule into a source-bound expected-policy manifest. Role values are supplied
explicitly. Assigned access means a database-backed relationship; request client
IDs do not establish assignment. Nutrosal's selected fixture uses
`group_client.client_id`, `group.admin_id` and `group.backup_admin_id`.

Declaring a rule does not resolve which resource every operation touches.
`resourceBindingStatus` retains that gap. Selected resource bindings may declare
finite `stateConstraint` predicates linking an observed ownership dimension to
the expected resource relation; impossible combinations are excluded from both
scenario enumeration and Z3. Global resources remain administrator-only.

`authorizationEnvelope` bounds possible admission and operation reachability.
Unknown predicates are bounded in both directions, including under negation.
Unresolved operations use a universal upper bound: an endpoint's authentication
requirement cannot protect a write that might precede verification. SAT in
`partialChecks` is a runtime-test candidate, not a conclusive vulnerability.
Unresolved resource bindings cannot produce exact policy-conformance verdicts.

The handler interpreter links supported literal CommonJS imports; module
initialization side effects are outside that model. Unsupported calls, date
validity/exception behavior, dynamic spreads and principal mutations remain
explicit. Per-endpoint `unmodeledCallSites` names the remaining source locations.
See [the reproducible component study](../javascript-policy/README.md#nutrosal-source-component-study).

## History and other analysis

The existing `/ir/delta` path now dispatches paired JavaScript snapshots to the
JavaScript comparison implementation. It compares recorded contracts, available
architecture evidence and security observations for matching component identities.
Missing comparison inputs retain partial coverage. Changed evidence is a review
candidate, not an automatic vulnerability or architectural degradation verdict.

Existing architecture, cohesion, dependency and data-access extraction remains
available through the pinned engine. Each capability retains its own source and
model limits; adding the security engine does not establish universal language or
vulnerability coverage.

## Build and verification

From the repository root:

```powershell
npm.cmd --prefix javascript-security ci --ignore-scripts --no-audit --no-fund
npm.cmd --prefix javascript-security test
python scripts/vendor_javascript_security.py
python javascript-policy/sync.py
python -m pip install -r javascript-policy/requirements-test.txt
npm.cmd --prefix javascript-policy ci --ignore-scripts --no-audit --no-fund
python -m unittest discover -s javascript-policy/tests -v
```

The policy tests cover actual AST-to-policy integration, real FastAPI applications,
Z3 counterexamples, unknown propagation and trusted local Express/JWT HTTP fixtures.
The separate saved-IR readers exercise API handlers without target execution.
Passing these tests does not establish a deployed container stack or production
security; build/deployment evidence must be recorded separately.

`docker-compose.javascript-security.yaml` selects JavaScript mode for the vector,
scenario and Aegis services. Vector/scenario analysis then starts without MongoDB;
Aegis uses its smaller static-report image. Other pipeline persistence stages keep
their declared database requirements. Use the original Aegis image for Java/model
analysis.

## Semantics references and boundaries

- [Express middleware order and continuation](https://expressjs.com/en/4x/guide/writing-middleware/)
- [Express route/router middleware](https://expressjs.com/en/guide/using-middleware/)
- [jsonwebtoken verification and decoding](https://github.com/auth0/node-jsonwebtoken/blob/master/README.md)

Token issuance, key secrecy, cryptographic configuration, account recovery, dependency
vulnerabilities, deployment controls and general JavaScript vulnerability coverage
require separately scoped analysis. Static findings do not establish exploitability.
