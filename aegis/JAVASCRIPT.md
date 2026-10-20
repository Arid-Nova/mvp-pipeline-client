# Stored JavaScript security reports

## Optional OpenAI evidence review

Set `OPENAI_API_KEY_FILE` to a server-mounted secret file and `LLM_MODEL` to
`gpt-5-mini`. Add `llmReview: true` to the saved-IR analysis request (or AEGIS
node data in the coordinator canvas). `history_ir_id` optionally supplies a saved
historical IR. No key is accepted from the browser or written into results.
`ARIDNOVA_LLM_BUSINESS_POLICY` optionally supplies intended business rules for
interpretation. Intended business access policy remains unknown unless the operator
explicitly supplies it; no repository-specific roles or ownership rules are selected.

The response retains deterministic security evidence and adds `llmReview` with
seven bounded reviews: architecture, API integration, cohesion, database,
history, security, and test planning. Only extracted evidence is sent; full
source bodies and runtime fixtures are excluded. Recommendations must reference
supplied evidence IDs and remain human-review candidates. This is not a full
source semantic audit or classic design-pattern detector. Strict metric coverage
and finite-model verdicts are not changed by LLM output. Generated test plans are
advice and are not executed.

Provider errors have explicit status/code, with no raw credential-bearing error
messages. A failed request stops subsequent category calls. Completion records
include model, response ID, input hash and token usage; failed quota requests do
not count as successful LLM analysis. The existing default request uses no LLM.

`POST /analyze` accepts the existing `ir_id` identifier. The service fetches that
saved IR from the configured `IR_SERVICE_URL` using the backend's gzip transport.
Caller-provided source paths and service URLs are not used.
Identifiers are limited to 256 characters. The configured service URL must use
HTTP(S); streamed responses are capped at 64 MiB compressed and 128 MiB decompressed.

For JavaScript inputs, the service validates
`javascriptExtraction.securityAnalysis` version 1 from
`aridnova-express-security`, including component provenance, source digest format,
endpoint identities, authentication statuses and finding evidence. It returns the
saved component reports with `status: partial|complete`, flattened `endpoints` and
`findings`, derived coverage counts, and explicit limitations. A mixed input lists
backend components outside the JavaScript result in
`scope.unassessedBackendComponents`; it does not imply those were analyzed.

The source digest is analyzer provenance, not an independently re-computed source
attestation. Source and models are not run by this reader. Unknown and not-observed
authentication statuses do not establish public access or vulnerabilities. Missing,
old, incomplete or malformed reports return `unsupported` without falling through
to Java analysis. `complete` requires validated coverage for all declared static properties
and the selected application graph; it is not a vulnerability-absence verdict. Separate
JavaScript policy APIs perform finite-model checks and preserve unresolved paths.

Evidence is already persisted as part of the upstream IR. The Aegis response does
not write a second MongoDB result. It is reproducibly obtained from the saved IR
identifier. This response is intended for the pipeline UI; the older separate
Flask dashboard's MongoDB views are not populated by this path.

Java integrations are loaded lazily on a Java-only analysis request. Therefore the
JavaScript report API can start without Torch, model clients, Neo4j or MongoDB.
`/health` reports API readiness plus whether the saved-IR service is configured and
the Java engine has been initialized; it is not an end-to-end dependency probe.

For a lightweight JavaScript report image:

```sh
docker build -f dockerfile.javascript -t aridnova-aegis-javascript .
docker run --rm -p 8900:8900 -e IR_SERVICE_URL=http://backend:8080/ir/create aridnova-aegis-javascript
```

Set `IR_SERVICE_URL` to the existing backend's saved-IR POST endpoint for the
deployment. The example hostname requires a shared Docker network. Java analysis
continues to require the original image/dependencies and configured services.

Run focused tests with `python -m unittest discover -s tests -v` from this folder.

For an offline saved-IR check of the actual API handler, run
`python scripts/read_javascript_report.py --ir SAVED_IR --output-dir NEW_DIRECTORY`.
The tool replaces only IR HTTP retrieval with the supplied JSON, blocks socket
connections, and records input/source hashes plus the returned report. It does
not execute analyzed application source, a model, Neo4j, MongoDB or the full container stack.

## Polyglot capability limits

Python, Go and C# extraction does not enable the Java security analyzer. Requests
containing those languages return `unsupported` before Java integrations or model
calls run. The pipeline also stops whole-system policy stages for mixed Java and
JavaScript/TypeScript input. Explicit JavaScript report APIs retain their scoped
results and list unassessed components; those results are not whole-system verdicts.
