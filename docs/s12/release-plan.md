# Release Plan - Local LLM Chatbot / Architecture-Grounded Assistant

## 1. Release Overview

| Field | Value |
|---|---|
| Release Name | AridNova Local LLM Chatbot (S12) |
| Product | AridNova / CloudHub Toolkit |
| Release Type | Incremental milestone rollout |
| Plan Status | Draft (execution-ready) |
| Primary Goal | Deliver evidence-grounded local chatbot Q&A without cloud LLM dependency |
| Milestones | S12-M1, S12-M2, S12-M3, S12-M4 |

## 2. Release Objectives

- Deliver a local-only chatbot path that runs in developer/operator environments using local model runtime endpoints.
- Provide architecture-grounded answers with evidence citations from IR and graph artifacts.
- Extend Q&A to verification, risk, scenarios/tests, and change-impact artifacts.
- Ensure safe behavior for missing evidence and runtime failures.
- Complete hardening: testing, telemetry, documentation, security/privacy checks, and release readiness.

## 3. Milestone Plan

| Milestone | Outcome | Exit Gate Summary |
|---|---|---|
| S12-M1: Local chatbot foundation | Local runtime + backend invocation + basic UI chat loop | User can ask a basic question in UI and receive response from local model through backend only |
| S12-M2: Evidence-grounded architecture Q&A | IR/graph grounding + citations + safe missing-evidence behavior | Architecture/dependency answers include citations and refuse speculation when evidence is insufficient |
| S12-M3: Verification, risk, and change-impact Q&A | Adds verification/risk/change/scenario/test reasoning | User can ask “what changed?”, risk/finding questions, and “what should I test?” with evidence-backed responses |
| S12-M4: Hardening, telemetry, and release readiness | Testing, observability, docs, security/privacy and release hygiene | Quality, operability, and release governance checks are complete and reproducible |

## 4. Scope by Milestone

### S12-M1: Local chatbot foundation

**Included stories:** S12-001, S12-002, S12-003, S12-004, S12-005, S12-006, S12-019, S12-031, S12-042, S12-045  
**Included backlog tasks:** BL-S12-001, BL-S12-002, BL-S12-003, BL-S12-004, BL-S12-005, BL-S12-009, BL-S12-010, BL-S12-011, BL-S12-012, BL-S12-014

**Demo after milestone:**
- Start stack with local model service profile.
- Open chatbot panel in frontend.
- Submit simple question and receive response.
- Confirm backend endpoint path is used (not browser direct model call).

**Must be true before moving to S12-M2:**
- Chatbot query endpoint works reliably for basic prompts.
- Local model adapter supports configured provider.
- Local-only mode works with no cloud credentials.
- Basic response envelope (answer + citation structure fields) is stable.

### S12-M2: Evidence-grounded architecture Q&A

**Included stories:** S12-007, S12-010, S12-012, S12-013, S12-014, S12-015, S12-016, S12-029, S12-030  
**Included backlog tasks:** BL-S12-006, BL-S12-007, BL-S12-008, BL-S12-013, BL-S12-015, BL-S12-016, BL-S12-021, BL-S12-022

**Demo after milestone:**
- Ask architecture topology question grounded in IR.
- Ask dependency path question grounded in graph.
- View evidence citations including artifact type + source identifier.
- Ask unsupported/speculative question and observe refusal/qualification.

**Must be true before moving to S12-M3:**
- Citation coverage for supported architecture questions meets PRD target direction.
- Missing-evidence flow consistently avoids speculation.
- Confidence/qualification labels render in UI.
- Context retrieval handles active project/session scope.

### S12-M3: Verification, risk, and change-impact Q&A

**Included stories:** S12-020, S12-021, S12-024, S12-027, plus supporting runtime-failure handling from S12-004  
**Included backlog tasks:** BL-S12-017, BL-S12-018, BL-S12-019, BL-S12-020, BL-S12-023

**Demo after milestone:**
- Ask verification findings question and get cited result summary.
- Ask risk question and get Aegis-grounded answer.
- Ask “what changed?” and get cited change-impact answer.
- Ask “what should I test?” and receive evidence-backed validation focus areas.

**Must be true before moving to S12-M4:**
- Multi-source retrieval (verification/risk/change/scenario/test) works end-to-end.
- Error handling for unavailable local runtime is graceful and actionable.
- Responses explain likely affected areas using evidence links.

### S12-M4: Hardening, telemetry, and release readiness

**Included stories:** S12-003, S12-039, S12-043, S12-045 (plus release quality outcomes)  
**Included backlog tasks:** BL-S12-024, BL-S12-025, BL-S12-026, BL-S12-027, BL-S12-028, BL-S12-029, BL-S12-030, BL-S12-031

**Demo after milestone:**
- Run automated unit/integration suites and show pass report.
- Demonstrate structured logs/telemetry for query lifecycle.
- Show deployment and troubleshooting docs used by a fresh setup.
- Present security/privacy checklist completion evidence.

**Must be true for release sign-off:**
- Test suites pass defined quality gates.
- Observability and error taxonomy are available in logs.
- Security/privacy review has no release-blocking findings.
- JIRA-aligned backlog and traceability are complete.

## 5. Out of Scope

- Autonomous code changes by chatbot.
- Replacing existing pipeline cards or graph UI flows.
- Cloud LLM dependency as a requirement for chatbot operation.
- Internet-grounded or external-knowledge answers beyond AridNova artifacts.

## 6. Dependency Plan

| Dependency | Type | Used In | Owner | Plan |
|---|---|---|---|---|
| Local model runtime (Ollama/llama.cpp/OpenAI-style local endpoint) | Runtime | M1+ | Platform/Backend | Provide profile-based startup and health checks |
| Backend chatbot controller and services | Internal service | M1-M4 | Backend | Incremental delivery by milestone |
| IR/Graph services | Internal data source | M2+ | Backend | Reuse existing service APIs and normalize evidence |
| Formal verification outputs | Internal data source | M3+ | Formalmethod/Backend | Add context provider adapter |
| Scenario/Test outputs | Internal data source | M3+ | Scenario/Test services | Add context provider adapter |
| Aegis risk outputs | Internal data source | M3+ | Aegis/Backend | Add context provider adapter |
| Frontend app state and pipeline context | UI integration | M1-M3 | Frontend | Bind active session/index context into queries |

## 7. Technical Readiness Checklist

- [ ] Docker Compose local model profile is documented and runnable.
- [ ] Required env vars implemented: provider, model name, base URL, timeout, token limit.
- [ ] Backend `POST /chatbot/query` and `GET /chatbot/health` endpoints implemented.
- [ ] Backend model invocation uses provider adapter abstraction.
- [ ] Retrieval context assembly and token budgeting implemented.
- [ ] Response schema includes citations, confidence label, and qualification flags.
- [ ] Local runtime failures return stable, typed error envelopes.
- [ ] No browser-direct model calls are present.

## 8. UX Readiness Checklist

- [ ] Chatbot panel is discoverable in primary workflow.
- [ ] Active system/session scope is visible.
- [ ] Response layout separates answer, citations, and confidence.
- [ ] Missing evidence state is explicit and understandable.
- [ ] Runtime unavailable state is actionable and non-blocking.
- [ ] Conversation state supports follow-ups and clear/reset.

## 9. Security and Privacy Checklist

- [ ] Local-only operation succeeds without cloud provider credentials.
- [ ] Sensitive artifacts are not sent to mandatory third-party endpoints.
- [ ] Secrets are environment-driven and not exposed in frontend bundles.
- [ ] Logging policy for sensitive payloads is documented and enforceable.
- [ ] CORS and API boundaries for chatbot endpoints are explicitly configured.

## 10. Testing Strategy

### Test layers

- Unit tests:
  - Backend retrieval, prompt assembly, guardrails, confidence logic, schema serialization.
  - Frontend panel state, rendering, citation/uncertainty/error states.
- Integration tests:
  - End-to-end query flow across frontend -> backend -> local model.
  - Evidence-grounding verification for architecture, risk, verification, and change-impact query classes.
- Failure-mode tests:
  - Local model unavailable/timeout.
  - Missing/partial evidence.
  - Contradictory evidence signaling.

### Quality gates by milestone

- M1: Basic API/UI loop stable with local provider.
- M2: Citation and missing-evidence behavior validated for architecture/dependency.
- M3: Multi-domain evidence retrieval and response behavior validated.
- M4: Full automated suite and regression checks pass.

### No-cloud dependency validation

- Run stack with cloud credentials absent/unset.
- Execute representative query set across milestones.
- Verify successful responses rely on local model endpoint.
- Verify failure modes reference local runtime only.
- Verify no outbound cloud LLM calls in logs/config for mandatory flow.

## 11. Demo Plan

| Milestone | Demo Script | Success Signal |
|---|---|---|
| S12-M1 | Start stack, open chatbot panel, ask simple question | Response returned from backend-local model path |
| S12-M2 | Ask architecture + dependency questions, inspect citations, ask unsupported question | Cited answers + safe refusal/qualification |
| S12-M3 | Ask verification/risk/change/test-focus questions | Multi-source evidence-backed responses |
| S12-M4 | Show tests, telemetry logs, docs-based fresh setup, security checklist | Release-readiness evidence complete |

## 12. Rollback Plan

- Feature-flag chatbot entry point in frontend.
- Disable chatbot backend endpoints via service configuration if blocking issue found.
- Keep existing pipeline/graph features unaffected by chatbot disablement.
- Roll back to prior stable compose profile that excludes chatbot/local model services.
- Preserve logs and request IDs for incident triage.

## 13. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Local model runtime instability or high latency | Poor UX and failed demos | Health checks, timeout strategy, clear retry paths, performance budgeting |
| Incomplete evidence artifacts | Incorrect or weak answers | Missing-evidence guardrails + qualification flags |
| Hallucination/speculation | Trust and safety regression | Prompt guardrails + refusal logic + citation enforcement |
| Integration drift across services | Breakages in retrieval | Contract validation and integration tests per milestone |
| Unclear ownership for cross-service data contracts | Delivery delays | Milestone dependency plan and explicit owner assignments |
| Hidden cloud coupling | Violates local-only objective | No-cloud validation gate in every milestone exit review |

## 14. Definition of Done

A milestone is Done when all of the following are true:

- All included backlog items are implemented and reviewed.
- Included user stories are behaviorally satisfied in milestone demos.
- Acceptance criteria in backlog rows pass validation.
- Required tests for milestone scope pass.
- Known high-severity defects for milestone scope are resolved or formally waived.
- No-cloud dependency validation for covered flows is successfully executed.

Release is Done when S12-M1 through S12-M4 are completed and sign-off is recorded for technical, UX, and security/privacy checklists.

## 15. Traceability Matrix

| Milestone | Included Stories | Included Backlog Items |
|---|---|---|
| S12-M1: Local chatbot foundation | S12-001, S12-002, S12-003, S12-004, S12-005, S12-006, S12-019, S12-031, S12-042, S12-045 | BL-S12-001, BL-S12-002, BL-S12-003, BL-S12-004, BL-S12-005, BL-S12-009, BL-S12-010, BL-S12-011, BL-S12-012, BL-S12-014 |
| S12-M2: Evidence-grounded architecture Q&A | S12-007, S12-010, S12-012, S12-013, S12-014, S12-015, S12-016, S12-029, S12-030 | BL-S12-006, BL-S12-007, BL-S12-008, BL-S12-013, BL-S12-015, BL-S12-016, BL-S12-021, BL-S12-022 |
| S12-M3: Verification, risk, and change-impact Q&A | S12-020, S12-021, S12-024, S12-027, S12-004 | BL-S12-017, BL-S12-018, BL-S12-019, BL-S12-020, BL-S12-023 |
| S12-M4: Hardening, telemetry, and release readiness | S12-003, S12-039, S12-043, S12-045 | BL-S12-024, BL-S12-025, BL-S12-026, BL-S12-027, BL-S12-028, BL-S12-029, BL-S12-030, BL-S12-031 |
