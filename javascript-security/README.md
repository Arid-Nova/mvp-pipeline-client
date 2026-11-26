# AridNova Express security evidence

This package parses source with the pinned TypeScript AST parser. It never imports
or runs the analyzed modules, installs target dependencies, starts the target server
or calls an external analysis service.

## Run and provenance

Use Node.js 22 or later. Install this package's locked dependencies with
`npm ci --ignore-scripts`, then:

```sh
node analyzer.cjs --input input.json --output new-report.json
npm test
```

Input contains absolute `sourceRoot`, component identity (`name`, `kind`,
`repositoryURL`, `commit`), the corresponding CIMET `snapshot`, and an optional
trusted `analysisProfile` such as `{"entrypoint":"server.js"}`. Output must not
already exist. `analyze(input)` returns the same report for in-process callers.

The source digest binds inspected relative file paths, source bytes and supported
package metadata. Exclusions, skipped files, parse errors and source bounds are
recorded in coverage. The registered commit/export relationship and deployed startup
configuration require separate provenance; a digest does not establish them.

## Report contract

Reports use `schemaVersion: 1`, `analyzer: aridnova-express-security` and
`status: complete|partial`. Completion is relative to declared static properties and
the selected application graph. It never means the whole application is secure.

The report contains component identity, `sourceDigest`, `applicationAssembly`,
per-capability coverage, every recorded snapshot endpoint, findings and limitations.
Endpoint IDs, methods and source paths preserve snapshot identity. `effectivePaths`
records resolved mounted paths; `reachability` identifies inactive registrations
outside the selected application, including unreferenced server copies.

Each endpoint contains ordered middleware, source locations, authentication,
role/ownership predicates, execution paths, `dataOperations`, a typed `policyModel`
and explicit coverage reasons. Guard status is `enforced`, `observed` or `unknown`.
Compound guards keep alternatives/conjunctions and their applicability conditions.
Numeric roles are not translated into invented role names.

| Authentication observation | Meaning |
|---|---|
| `required` | Recognized request-derived credential verification precedes observed admission continuations. |
| `optional` | Verified and unverified continuations are observed. Failure continuation may also produce a finding. |
| `not-observed` | No recognized verification requirement was observed; this is not public/safe/vulnerable classification. |
| `unknown` | Relevant unresolved provenance, guard, registration or control flow prevents classification. |

Read the predicate, scope and outcomes together. A conditional owner comparison or
an observed data-call guard does not establish universal protection for all records.

## Implemented analysis

- Selected startup graph; CommonJS/ES references, app/router aliases, ordered mounts,
  imported registrars, chained routes, literal Consign loading, overlap and dormant
  registrations. See [application assembly](APPLICATION_ASSEMBLY.md).
- Version-aware Multer continuation summaries. They contribute no authorization.
- Synchronous/callback JWT verification evidence, decode distinction, exceptions,
  early returns, denial fallthrough, late checks and forwarded continuations.
- Request/principal provenance through aliases, bounded helpers and supported
  `JSON.parse` transformations; compound role and resource ownership checks.
- Switch and loop abstractions, supported promises/callbacks, reusable helper
  summaries and equivalent-state merging to reduce avoidable path explosion.
- Source data operations and supported SQL selector/parameter provenance, retaining
  which conditions apply to each operation. Identifier interpolation and values
  outside modeled selectors do not become ownership guarantees.
- Typed finite admission/operation predicates. `admissionScope` identifies successful
  HTTP response paths, so controller checks are retained alongside middleware checks.

Source findings cover decoded identity, verification-error continuation, denial
followed by `next()` and conditions evaluated after continuation. Findings are review
evidence, not demonstrations of unauthorized access.

## Conservative boundaries

Supported syntax does not make every use of that syntax complete. Unknown loop
effects, recursion, callback schedules, dynamic loading, reflective mutation,
unresolved helpers/libraries, unsupported coercions and computed routes retain
reasons. Zero execution cutoffs does not mean zero unresolved semantics.

Loose role comparisons and unsupported coercions are not converted into strict
finite equalities. Different ownership resource paths stay distinct. Logical bypass
paths remain visible. `next(error)` and `next('route')` do not become ordinary
admission. Unknown helpers receiving `next` prevent an unconditional authentication
claim. Unresolved SQL predicates do not establish protected database access.

The policy model can be consumed by [the policy pipeline](../javascript-policy/README.md)
only when the relevant startup and path coverage is eligible. Unknown predicates
must never be replaced with default Java roles or assumed public access. A reviewed
expected policy and configured runtime fixtures are separate inputs.

The analyzer does not certify token issuance, signing options, issuer/audience,
secret hygiene, account security, deployment controls or live exploitability.
Missing ownership checks are not automatically IDOR findings.

## Bounds

Source bounds: 3,000 files, 64 MiB source bytes, 2 MiB per file, 2,000,000 indexed
AST nodes, 30,000 directory entries and depth 32. Endpoint execution bounds: 48
abstract paths, 12,000 interpreter steps, helper depth 5 and 100 guard records.
State merging reduces redundant paths without silently treating a cutoff as proof.
Input/output bounds remain 32/64 MiB. Symlinks and dependency/build directories are
skipped. Findings retain locations and structural observations instead of raw tokens,
passwords, signing keys or unrelated compared literals.
