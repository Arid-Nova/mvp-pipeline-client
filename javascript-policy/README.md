# JavaScript authorization policy pipeline

This package connects source evidence to finite policy verification, authorization
vectors, scenarios, deterministic HTTP suites and isolated execution. It does not
assign a whole-application "secure" verdict. Unknown evidence stays unknown.

`aridnova_policy.py` is the canonical Python engine. Run `python sync.py` after
editing it; use `python sync.py --check` in CI. The identical copies and SHA-256 provenance files under the five
service `app/` directories are included by their existing Docker build contexts.
The analyzer and this policy engine execute no analyzed source or package scripts.

## API contract

All four analysis routes accept the same JSON object:

```json
{"report": {"components": ["<source-bound Express reports>"]}, "expectedPolicy": null}
```

`report` can also be a single report or the native source IR. `expectedPolicy` is
optional; the routes never require MongoDB, a model provider, or a token to run.

| Service | Route | Result field |
|---|---|---|
| Formal verifier | `POST /verify/javascript` | `verification` |
| Vector generator | `POST /vectors/javascript` | `vectors` |
| Scenario generator | `POST /scenarios/javascript` | `scenarios` |
| Test generator | `POST /testsuites/javascript` | `suite` |
| Formal verifier | `POST /verify/javascript/policy-template` | Unreviewed manifest template |

Responses have `schemaVersion: 1`, `analysis: javascript-authorization-policy`, a
deterministic `policyId`, source/component/revision identities, per-endpoint
coverage and `status: complete|partial|unknown`. Here **complete is completion of
the declared finite admission model**, not complete security coverage. Inactive
source registrations are retained as `not-applicable`, with no scenarios.

The existing `/verify` route also dispatches typed JavaScript models into this
engine, without cloning or the Java solver. Its compatibility response uses
`status: JAVASCRIPT_ANALYZED`, `is_satisfiable: null`, and `policyAnalysis`.
Older reports without typed models retain their unsupported response. Mixed
language input names unassessed components; Java behavior is unchanged.

Set `ARIDNOVA_ANALYSIS_MODE=javascript-only` for the vector and scenario services
to start without MongoDB. Other existing Java routes retain their persistence
requirements. JavaScript API output is inline JSON, with deterministic identifiers;
the caller may save it without pretending those hashes are MongoDB ObjectIds.

## Model eligibility and actual verification

The source analyzer emits `endpoint.policyModel`, including finite `dimensions`,
an `admission` predicate and protected `operations` with reachability predicates.
`admissionScope: successful-http-response` means this predicate includes controller
conditions on successful response paths, rather than stopping at middleware `next()`.
Protected-operation predicates remain separate because work may occur before a denial.
The grammar is deliberately typed and non-executable:

```json
{"op":"and","args":[
  {"op":"eq","field":"token","value":"valid"},
  {"op":"or","args":[
    {"op":"eq","field":"role","value":1},
    {"op":"eq","field":"owner:params.id","value":true}
  ]}
]}
```

Supported nodes are `true`, `false`, `unknown`, `eq`, `not`, `and`, and `or`.
Actual numeric roles are retained. Ownership dimensions distinguish different
resource ID expressions. No Spring ADMIN/USER defaults are inserted. Predicates
are never evaluated as Python or JavaScript code.

An endpoint is eligible only when application assembly is resolved, registration
and global middleware ordering are resolved, the route is active, the admission
model is complete, no execution bound was reached, and its predicate contains no
unknown term. Finite domains and total state counts have explicit bounds.

Z3 checks:

1. Observed admission reachability, which establishes that some finite state can
   reach the declared successful-response path; this alone is not a security verdict.
2. Overpermission: `observed AND NOT expected`.
3. Overrestriction: `expected AND NOT observed`.
4. Protected-operation policy: `operationReachable AND NOT expected`.

SAT gives a concrete token/role/owner counterexample for the violation queries.
UNSAT means no violation exists **within the declared model**. Solver timeout,
unsupported predicates, unmodeled paths and absent expected policy remain explicit.

The browser and background coordinator use these dedicated routes and preserve
the source report, optional expected manifest and generated suite across stages.
The prompt stage does not call an LLM. Execution without a selected fixture is
reported as `awaiting-fixtures`; it is not counted as a runtime test pass.

Startup comes from the explicitly supplied source analysis profile. An entrypoint
selection describes the analyzed graph; it is not independent evidence of the
production startup command. No application-specific startup profile is selected by default.
Assembly and per-property uncertainty continue to gate model eligibility.

## Expected policy review

The template route never fabricates maintainer approval. A reviewed manifest has
`schemaVersion`, `reviewedBy`, `reviewedAt`, and `components`, each containing the
exact `name`, `commit`, `sourceDigest` and endpoint rules. Each rule contains
`endpointId`, `allow`, optional operation-specific `operations` predicates, and
explicit `allowedStatuses`/`deniedStatuses` for runtime assertions. Source mismatch,
unknown endpoints, unknown rules and unknown expected predicates are rejected.

The review fields record the maintainer's supplied declaration; they are not a
digital signature or independent proof of review. A missing manifest permits
observations and scenarios, but provides no policy-conformance verdict or invented
HTTP pass criterion.

## Isolated parameterized execution

`POST /api/execute/javascript` accepts:

```json
{"suite": {"<testsuite response>": "..."}, "fixtureSet": "local-fixture", "caseIds": ["selected-case-id"]}
```

Execution is disabled unless the server sets `ARIDNOVA_ENABLE_JS_TEST_EXECUTION=1`
and `ARIDNOVA_JS_FIXTURES` to an administrator-owned JSON registry. The registry
contains:

```json
{"fixtures":{"local-fixture":{
  "isolated":true,
  "baseUrl":"http://127.0.0.1:19090",
  "policyId":"<exact suite policyId>",
  "cases":{"<case id>":{
    "caseDigest":"<SHA256 of canonical complete case JSON>",
    "method":"POST",
    "path":"/record/other",
    "headers":{"Authorization":"Bearer <fixture-only credential>"},
    "body":{"example":"fixture data"},
    "stateObservation":{"path":"/__state"}
  }}
}}}
```

`digest(case)` in the canonical engine computes `caseDigest`. The exact case and
policy ID prevent a caller changing the oracle while reusing a configured fixture.
Credentials remain in the server registry, outside source reports and test suites.
Only literal loopback HTTP origins are accepted; no hostname resolution, redirect
following, analyzed-source URLs, shell commands or generated code execution occurs.
At most 500 selected cases execute per call, with 5-second request and 1 MiB body
bounds. Container use requires the isolated fixture to share the executor's network
namespace; external targets deliberately are not silently enabled.

Denied cases require a configured read-only state observation endpoint. The runner
compares its response before/after and checks the explicitly reviewed HTTP status.
A 403 response that changes the observed state fails. Observation coverage depends
on the fixture; it does not prove absence of effects outside the state it exposes.
Missing binding, expected status or state observation is a skip, never a pass.

## Reproducible checks

```powershell
python -m pip install -r javascript-policy/requirements-test.txt
npm.cmd --prefix javascript-policy ci --ignore-scripts --no-audit --no-fund
python javascript-policy/sync.py
python -m unittest discover -s javascript-policy/tests -v
```

The tests exercise all five actual FastAPI apps in JavaScript mode, the legacy
formal route, finite Z3 counterexamples, unknown propagation, unchanged Java guards,
and a trusted local Express/JWT fixture. The fixture checks 32 token/role/ownership
combinations and a deliberately faulty denied request with an observable write.
Only authored synthetic fixture code and loopback endpoints are executed. No analyzed application source, production endpoint, database or credential is used.


## Language capabilities

Snapshot extraction and authorization support are separate capabilities. Python,
Go and C# snapshots, and mixed Java/JavaScript snapshots, cannot be passed through
legacy Java policy stages. Browser and background coordinator use observed
`metadata.languages` and component language markers to stop those stages with an
explicit `unsupported` result. Pure JavaScript/TypeScript inputs use the bounded
source-policy routes above. Direct Java verifier/vector APIs also reject unsupported
source scope before model generation.

`source_scope.py` is the canonical language reader for Python service guards.
`sync.py` copies it together with the policy engine; `--check` checks all generated
copies without changing files. The shared TypeScript dispatcher lives in
`javascript-workflow/workflow.ts`; run
`python scripts/sync_javascript_workflow.py --check` to verify browser/coordinator parity.
