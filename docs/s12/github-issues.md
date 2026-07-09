# GitHub Issue Planning - S12 Local LLM Chatbot

This document provides draft GitHub issue templates derived from:
- `docs/s12/user-stories.md`
- `docs/s12/backlog.md`
- `docs/s12/release-plan.md`

Labels baseline for all issues: `aridnova`, `local-llm`, `chatbot`, `rag`, `evidence-grounded`, `s12`.

## Epic Issues

### Issue: Local LLM Runtime and Configuration
- Title: `S12 Epic: Local LLM Runtime and Configuration`
- Type: Epic
- Labels: `epic`, `aridnova`, `local-llm`, `chatbot`, `s12`
- Milestone: `S12-M1`
- Description: Enable local model runtime configuration and backend invocation without cloud dependency.
- Acceptance Criteria:
  - Local model runtime can be configured with env vars.
  - Backend can invoke supported local providers.
  - Health and error behaviors are visible and actionable.
- Dependencies: none
- Target Files: `docker-compose.yaml`, `backend/src/main/java/.../chatbot/*`, `frontend/src/services/api.ts`
- Definition of Done: M1 foundation demo is passable using local-only model path.

### Issue: Chatbot UI and Conversation Experience
- Title: `S12 Epic: Chatbot UI and Conversation Experience`
- Type: Epic
- Labels: `epic`, `frontend`, `aridnova`, `chatbot`, `s12`
- Milestone: `S12-M1`
- Description: Deliver embedded chatbot UX with scoped context and conversation continuity.
- Acceptance Criteria:
  - User can open panel and ask questions.
  - Active context is visible.
  - Conversation state supports follow-up behavior.
- Dependencies: Local LLM Runtime and Configuration
- Target Files: `frontend/src/App.tsx`, `frontend/src/components/chatbot/*`, `frontend/src/components/pipeline/PipelinePage.tsx`
- Definition of Done: Chatbot is usable in primary workflow with context-aware requests.

### Issue: Evidence Retrieval and Context Assembly
- Title: `S12 Epic: Evidence Retrieval and Context Assembly`
- Type: Epic
- Labels: `epic`, `backend`, `rag`, `aridnova`, `s12`
- Milestone: `S12-M2`
- Description: Build retrieval context assembly and hybrid retrieval strategy.
- Acceptance Criteria:
  - Evidence normalized across required context types.
  - Retrieval supports structured + semantic modes.
  - Deterministic context budgeting is enforced.
- Dependencies: Chatbot API foundation
- Target Files: `backend/src/main/java/.../chatbot/context/*`, `.../retrieval/*`
- Definition of Done: Context retrieval works for architecture and dependency use cases.

### Issue: Architecture Question Answering
- Title: `S12 Epic: Architecture Question Answering`
- Type: Epic
- Labels: `epic`, `backend`, `frontend`, `chatbot`, `s12`
- Milestone: `S12-M2`
- Description: Support architecture, endpoint, and dependency Q&A with citations.
- Acceptance Criteria:
  - IR and graph evidence are cited.
  - Endpoint and dependency questions return evidence-grounded answers.
  - Missing evidence is clearly qualified.
- Dependencies: Evidence Retrieval and Context Assembly
- Target Files: `backend/src/main/java/.../chatbot/*`, `frontend/src/components/chatbot/*`
- Definition of Done: Architecture Q&A demo passes with citations and safe qualification.

### Issue: Verification and Risk Question Answering
- Title: `S12 Epic: Verification and Risk Question Answering`
- Type: Epic
- Labels: `epic`, `backend`, `chatbot`, `s12`
- Milestone: `S12-M3`
- Description: Provide Q&A over verification findings and Aegis risk outputs.
- Acceptance Criteria:
  - Verification and risk evidence can be queried.
  - Responses explain findings and affected areas.
  - Citations are included.
- Dependencies: Evidence Retrieval and Context Assembly
- Target Files: `backend/src/main/java/.../chatbot/context/Verification*`, `.../Aegis*`
- Definition of Done: Verification/risk demo queries are answerable with evidence.

### Issue: Change Impact and Testing Question Answering
- Title: `S12 Epic: Change Impact and Testing Question Answering`
- Type: Epic
- Labels: `epic`, `backend`, `chatbot`, `s12`
- Milestone: `S12-M3`
- Description: Support change-impact and testing-priority Q&A.
- Acceptance Criteria:
  - “What changed?” and “What should I test?” are evidence-backed.
  - Scenario/test context is integrated.
- Dependencies: Evidence Retrieval and Context Assembly
- Target Files: `backend/src/main/java/.../chatbot/context/ChangeImpact*`, `.../ScenarioTest*`
- Definition of Done: M3 demo includes validated test-focus recommendations.

### Issue: Guardrails, Confidence, and Explainability
- Title: `S12 Epic: Guardrails, Confidence, and Explainability`
- Type: Epic
- Labels: `epic`, `backend`, `frontend`, `chatbot`, `s12`
- Milestone: `S12-M2`
- Description: Enforce no-speculation behavior with confidence labels and citation visibility.
- Acceptance Criteria:
  - Missing evidence causes refusal/qualification.
  - Confidence labels are returned and rendered.
  - Citations are consistently visible.
- Dependencies: API schema + retrieval
- Target Files: `backend/src/main/java/.../chatbot/guardrails/*`, `.../quality/*`, `frontend/src/components/chatbot/*`
- Definition of Done: Guardrail and confidence behavior pass acceptance tests.

### Issue: Persistence, Export, and Session Continuity
- Title: `S12 Epic: Persistence, Export, and Session Continuity`
- Type: Epic
- Labels: `epic`, `frontend`, `chatbot`, `s12`
- Milestone: `S12-M3`
- Description: Preserve session continuity and export answer+citation outputs.
- Acceptance Criteria:
  - Chat persists within session.
  - Exports include answer, confidence, and evidence.
  - Stale context is indicated.
- Dependencies: Chatbot UI and Conversation Experience
- Target Files: `frontend/src/components/chatbot/*`, `frontend/src/hooks/*`
- Definition of Done: Session continuity and export flow demoed successfully.

### Issue: Observability and Product Feedback
- Title: `S12 Epic: Observability and Product Feedback`
- Type: Epic
- Labels: `epic`, `backend`, `telemetry`, `chatbot`, `s12`
- Milestone: `S12-M4`
- Description: Add structured telemetry and feedback capture.
- Acceptance Criteria:
  - Query lifecycle telemetry is available.
  - User feedback can be captured.
  - Quality metrics are measurable.
- Dependencies: Core chatbot flow stable
- Target Files: `backend/src/main/java/.../chatbot/*`, `frontend/src/components/chatbot/*`
- Definition of Done: Operational visibility supports release readiness.

### Issue: Developer Experience and Deployment
- Title: `S12 Epic: Developer Experience and Deployment`
- Type: Epic
- Labels: `epic`, `devex`, `docs`, `chatbot`, `s12`
- Milestone: `S12-M4`
- Description: Finalize testing, docs, deployment workflow, and release alignment.
- Acceptance Criteria:
  - Unit/integration tests are implemented and pass.
  - Documentation supports first-run setup.
  - JIRA/GitHub planning artifacts remain aligned.
- Dependencies: All previous epics
- Target Files: `docs/s12/*`, `README.md`, `docker-compose.yaml`, test directories
- Definition of Done: Hardening and release-readiness gates are complete.

## Story Issues (S12-001 to S12-045)

### Issue: S12-001 Configure model endpoint and model ID via env
- Title: `S12-001 Configure model endpoint and model ID via env`
- Type: Story
- Labels: `story`, `backend`, `local-llm`, `s12`
- Milestone: `S12-M1`
- Description: Configure provider endpoint/model via env-driven backend config.
- Acceptance Criteria: Given required vars, when service starts, then settings load; missing vars fail clearly.
- Dependencies: none
- Target Files: `docker-compose.yaml`, `backend/src/main/resources/*`
- Definition of Done: Startup behavior validated for present/missing config.

### Issue: S12-002 Support Ollama/llama.cpp/OpenAI-style local endpoints
- Title: `S12-002 Support multiple local provider adapters`
- Type: Story
- Labels: `story`, `backend`, `local-llm`, `s12`
- Milestone: `S12-M1`
- Description: Add adapter strategy for local model endpoints.
- Acceptance Criteria: Given provider selection, when query runs, then matching adapter is used.
- Dependencies: S12-001
- Target Files: `backend/src/main/java/.../chatbot/llm/*`
- Definition of Done: Adapters function for configured provider types.

### Issue: S12-003 No cloud key required for core chatbot
- Title: `S12-003 Ensure no cloud dependency is required`
- Type: Story
- Labels: `story`, `security`, `local-llm`, `s12`
- Milestone: `S12-M1`
- Description: Ensure chatbot core works without cloud credentials.
- Acceptance Criteria: Given cloud keys absent, when queries run, then local-only flow remains functional.
- Dependencies: S12-001, S12-002
- Target Files: `docker-compose.yaml`, `backend/src/main/java/.../chatbot/*`
- Definition of Done: No-cloud validation scenario passes.

### Issue: S12-004 Runtime health visibility
- Title: `S12-004 Expose local runtime health and user-visible status`
- Type: Story
- Labels: `story`, `backend`, `frontend`, `s12`
- Milestone: `S12-M1`
- Description: Provide health endpoint and UI-visible availability status.
- Acceptance Criteria: Given runtime unavailable, then user sees actionable status and retry guidance.
- Dependencies: S12-001
- Target Files: `backend/.../ChatbotController.java`, `frontend/src/components/chatbot/*`
- Definition of Done: Health status surfaced and validated.

### Issue: S12-005 Embedded chatbot panel
- Title: `S12-005 Add embedded chatbot panel`
- Type: Story
- Labels: `story`, `frontend`, `chatbot`, `s12`
- Milestone: `S12-M1`
- Description: Add panel in main workflow for chat interactions.
- Acceptance Criteria: Panel opens and sends question to backend.
- Dependencies: S12-004
- Target Files: `frontend/src/App.tsx`, `frontend/src/components/chatbot/*`
- Definition of Done: Basic ask/response path visible in UI.

### Issue: S12-006 Show active context
- Title: `S12-006 Show active context in chatbot`
- Type: Story
- Labels: `story`, `frontend`, `chatbot`, `s12`
- Milestone: `S12-M1`
- Description: Show active analysis/session context in chat UI and request payload.
- Acceptance Criteria: Response view shows active scope; payload carries selected context IDs.
- Dependencies: S12-005
- Target Files: `frontend/src/App.tsx`, `frontend/src/components/pipeline/PipelinePage.tsx`, `frontend/src/services/api.ts`
- Definition of Done: Context-bound requests are verified.

### Issue: S12-007 Preserve follow-up context
- Title: `S12-007 Preserve follow-up conversation context`
- Type: Story
- Labels: `story`, `frontend`, `chatbot`, `s12`
- Milestone: `S12-M2`
- Description: Enable follow-up question continuity for current session.
- Acceptance Criteria: Follow-up turns can reference previous chat output.
- Dependencies: S12-005
- Target Files: `frontend/src/components/chatbot/*`, `frontend/src/hooks/useChatbotState.ts`
- Definition of Done: Multi-turn flow validated.

### Issue: S12-008 Structured response sections
- Title: `S12-008 Render answer, evidence, and confidence sections`
- Type: Story
- Labels: `story`, `frontend`, `chatbot`, `s12`
- Milestone: `S12-M2`
- Description: Separate answer/citations/confidence into clear UI regions.
- Acceptance Criteria: Missing citation and uncertainty states are visually distinct.
- Dependencies: S12-019, S12-030
- Target Files: `frontend/src/components/chatbot/*`
- Definition of Done: Response layout consistently structured.

### Issue: S12-009 Keyboard-friendly input
- Title: `S12-009 Improve keyboard handling in chat composer`
- Type: Story
- Labels: `story`, `frontend`, `ux`, `s12`
- Milestone: `S12-M2`
- Description: Support Enter submit and Shift+Enter newline behavior.
- Acceptance Criteria: Input behavior follows expected shortcuts and accessibility basics.
- Dependencies: S12-005
- Target Files: `frontend/src/components/chatbot/ChatComposer.tsx`
- Definition of Done: Interaction behavior verified.

### Issue: S12-010 Normalize evidence schema
- Title: `S12-010 Implement normalized evidence schema`
- Type: Story
- Labels: `story`, `backend`, `rag`, `s12`
- Milestone: `S12-M2`
- Description: Standardize evidence objects across context providers.
- Acceptance Criteria: Evidence metadata includes type/source/location/version fields.
- Dependencies: S12-005
- Target Files: `backend/src/main/java/.../chatbot/model/*`, `.../context/*`
- Definition of Done: Common evidence DTO used by context services.

### Issue: S12-011 Scope retrieval to active context
- Title: `S12-011 Scope retrieval to active session/project`
- Type: Story
- Labels: `story`, `backend`, `rag`, `s12`
- Milestone: `S12-M2`
- Description: Restrict retrieval to selected context for relevance and safety.
- Acceptance Criteria: Cross-system leakage is prevented unless explicitly requested.
- Dependencies: S12-006, S12-010
- Target Files: `backend/src/main/java/.../chatbot/context/*`
- Definition of Done: Scoped retrieval tests pass.

### Issue: S12-012 Hybrid retrieval strategy
- Title: `S12-012 Add structured plus semantic retrieval`
- Type: Story
- Labels: `story`, `backend`, `rag`, `s12`
- Milestone: `S12-M2`
- Description: Blend exact entity retrieval with semantic ranking.
- Acceptance Criteria: Exact path used when possible; semantic fallback otherwise.
- Dependencies: S12-010
- Target Files: `backend/src/main/java/.../chatbot/retrieval/*`
- Definition of Done: Query class routing validated.

### Issue: S12-013 Context refresh controls
- Title: `S12-013 Add refresh flow for retrieval context`
- Type: Story
- Labels: `story`, `backend`, `frontend`, `s12`
- Milestone: `S12-M2`
- Description: Allow context rebuild/update after pipeline reruns.
- Acceptance Criteria: Refresh reports updated counts/failures.
- Dependencies: S12-010
- Target Files: `backend/src/main/java/.../chatbot/*`, `frontend/src/components/chatbot/*`
- Definition of Done: Refresh controls functional and observable.

### Issue: S12-014 Deterministic context truncation
- Title: `S12-014 Implement deterministic context budgeting`
- Type: Story
- Labels: `story`, `backend`, `rag`, `s12`
- Milestone: `S12-M2`
- Description: Enforce token budget with predictable truncation.
- Acceptance Criteria: Truncation metadata is returned when triggered.
- Dependencies: S12-012
- Target Files: `backend/src/main/java/.../chatbot/retrieval/*`
- Definition of Done: Budgeting behavior test-covered.

### Issue: S12-015 Architecture topology Q&A
- Title: `S12-015 Support architecture topology answers`
- Type: Story
- Labels: `story`, `backend`, `chatbot`, `s12`
- Milestone: `S12-M2`
- Description: Answer topology questions using IR+graph evidence.
- Acceptance Criteria: Answers include citations to relevant architecture objects.
- Dependencies: S12-011, S12-012
- Target Files: `backend/src/main/java/.../chatbot/context/IrContextProvider.java`, `.../GraphContextProvider.java`
- Definition of Done: Topology queries are evidence-grounded.

### Issue: S12-016 Dependency path explanation
- Title: `S12-016 Explain direct and transitive dependencies`
- Type: Story
- Labels: `story`, `backend`, `chatbot`, `s12`
- Milestone: `S12-M2`
- Description: Return dependency paths and blast radius context.
- Acceptance Criteria: Response identifies direct/transitive links with citations.
- Dependencies: S12-015
- Target Files: `backend/src/main/java/.../chatbot/context/GraphContextProvider.java`
- Definition of Done: Dependency queries validated.

### Issue: S12-017 Endpoint-level Q&A
- Title: `S12-017 Answer endpoint/service-level questions`
- Type: Story
- Labels: `story`, `backend`, `chatbot`, `s12`
- Milestone: `S12-M2`
- Description: Use component/endpoint evidence for endpoint behavior answers.
- Acceptance Criteria: Method/path/service details returned with evidence.
- Dependencies: S12-010, S12-012
- Target Files: `backend/src/main/java/.../chatbot/context/*`
- Definition of Done: Endpoint-level Q&A supported.

### Issue: S12-018 Anti-pattern-aware architecture responses
- Title: `S12-018 Surface anti-pattern evidence in architecture answers`
- Type: Story
- Labels: `story`, `backend`, `security`, `s12`
- Milestone: `S12-M2`
- Description: Include anti-pattern markers when available.
- Acceptance Criteria: Markers appear in responses with source citations.
- Dependencies: S12-015
- Target Files: `backend/src/main/java/.../chatbot/context/*`, `frontend/src/components/chatbot/*`
- Definition of Done: Anti-pattern signals are visible and cited.

### Issue: S12-019 Citation requirement
- Title: `S12-019 Enforce citation requirement for claims`
- Type: Story
- Labels: `story`, `backend`, `chatbot`, `s12`
- Milestone: `S12-M1`
- Description: Ensure architecture/dependency claims carry citations.
- Acceptance Criteria: Supported answers include at least one citation.
- Dependencies: S12-010
- Target Files: `backend/src/main/java/.../chatbot/model/*`, `.../guardrails/*`
- Definition of Done: Citation presence checks pass.

### Issue: S12-020 Verification findings Q&A
- Title: `S12-020 Support verification findings questions`
- Type: Story
- Labels: `story`, `backend`, `verification`, `s12`
- Milestone: `S12-M3`
- Description: Provide findings summary from verification artifacts.
- Acceptance Criteria: pass/fail/unknown states are distinguished and cited.
- Dependencies: S12-011
- Target Files: `backend/src/main/java/.../chatbot/context/VerificationContextProvider.java`
- Definition of Done: Verification Q&A demo passes.

### Issue: S12-021 Risk-focused Q&A
- Title: `S12-021 Support Aegis risk questions`
- Type: Story
- Labels: `story`, `backend`, `risk`, `s12`
- Milestone: `S12-M3`
- Description: Return risk indicators based on Aegis evidence.
- Acceptance Criteria: Risk answers include evidence and missing-data flags.
- Dependencies: S12-011, S12-019
- Target Files: `backend/src/main/java/.../chatbot/context/AegisContextProvider.java`
- Definition of Done: Risk Q&A path validated.

### Issue: S12-022 Consolidated verification+risk summary
- Title: `S12-022 Consolidate verification and risk outputs`
- Type: Story
- Labels: `story`, `backend`, `risk`, `verification`, `s12`
- Milestone: `S12-M3`
- Description: Combine verification and risk findings in one answer path.
- Acceptance Criteria: Confirmed findings are separated from low-confidence inferences.
- Dependencies: S12-020, S12-021, S12-030
- Target Files: `backend/src/main/java/.../chatbot/*`
- Definition of Done: Consolidated summary behavior verified.

### Issue: S12-023 Findings follow-up prompts
- Title: `S12-023 Generate actionable follow-up prompts`
- Type: Story
- Labels: `story`, `backend`, `frontend`, `s12`
- Milestone: `S12-M3`
- Description: Suggest next questions based on findings and evidence gaps.
- Acceptance Criteria: Follow-up suggestions are provided and relevant.
- Dependencies: S12-020
- Target Files: `backend/src/main/java/.../chatbot/*`, `frontend/src/components/chatbot/*`
- Definition of Done: Follow-up prompt suggestions demonstrated.

### Issue: S12-024 What changed?
- Title: `S12-024 Support what-changed questions`
- Type: Story
- Labels: `story`, `backend`, `change-impact`, `s12`
- Milestone: `S12-M3`
- Description: Answer version-delta questions using change-impact artifacts.
- Acceptance Criteria: Baseline/comparison context and changed entities are cited.
- Dependencies: S12-011
- Target Files: `backend/src/main/java/.../chatbot/context/ChangeImpactContextProvider.java`
- Definition of Done: Change summary queries validated.

### Issue: S12-025 Change impact explanation
- Title: `S12-025 Explain downstream change impact`
- Type: Story
- Labels: `story`, `backend`, `change-impact`, `s12`
- Milestone: `S12-M3`
- Description: Provide impact chain explanation across affected entities.
- Acceptance Criteria: Impact rationale references available evidence.
- Dependencies: S12-024, S12-016
- Target Files: `backend/src/main/java/.../chatbot/context/*`
- Definition of Done: Impact explanation behavior verified.

### Issue: S12-026 What should I test?
- Title: `S12-026 Recommend validation focus areas`
- Type: Story
- Labels: `story`, `backend`, `qa`, `s12`
- Milestone: `S12-M3`
- Description: Recommend test focus from change+scenario+test evidence.
- Acceptance Criteria: Recommendations include evidence-backed rationale.
- Dependencies: S12-024, S12-027
- Target Files: `backend/src/main/java/.../chatbot/context/ScenarioTestContextProvider.java`
- Definition of Done: Test-focus recommendations demonstrated.

### Issue: S12-027 Scenario/test-aware answers
- Title: `S12-027 Use scenario/test artifacts in recommendations`
- Type: Story
- Labels: `story`, `backend`, `qa`, `s12`
- Milestone: `S12-M3`
- Description: Ensure answers reference generated scenario/test artifacts when present.
- Acceptance Criteria: Artifacts referenced by ID; absence triggers qualified behavior.
- Dependencies: S12-011
- Target Files: `backend/src/main/java/.../chatbot/context/ScenarioTestContextProvider.java`
- Definition of Done: Scenario/test-aware path validated.

### Issue: S12-028 Combined change/risk/test summary
- Title: `S12-028 Provide combined release-risk summary`
- Type: Story
- Labels: `story`, `backend`, `release`, `s12`
- Milestone: `S12-M3`
- Description: Summarize change, risk, and testing recommendations together.
- Acceptance Criteria: Summary includes missing evidence qualifiers.
- Dependencies: S12-021, S12-024, S12-026
- Target Files: `backend/src/main/java/.../chatbot/*`
- Definition of Done: Combined summary flow demonstrated.

### Issue: S12-029 Missing evidence refusal behavior
- Title: `S12-029 Refuse unsupported claims when evidence is missing`
- Type: Story
- Labels: `story`, `backend`, `guardrails`, `s12`
- Milestone: `S12-M2`
- Description: Enforce missing-evidence refusal/qualification behavior.
- Acceptance Criteria: Missing sources are explicitly listed.
- Dependencies: S12-012
- Target Files: `backend/src/main/java/.../chatbot/guardrails/*`
- Definition of Done: No-speculation checks pass.

### Issue: S12-030 Confidence labels
- Title: `S12-030 Add confidence labels with rationale`
- Type: Story
- Labels: `story`, `backend`, `frontend`, `s12`
- Milestone: `S12-M2`
- Description: Return and render confidence labels per answer.
- Acceptance Criteria: Low confidence includes caution/qualification messaging.
- Dependencies: S12-014
- Target Files: `backend/src/main/java/.../chatbot/quality/*`, `frontend/src/components/chatbot/*`
- Definition of Done: Confidence labels visible and consistent.

### Issue: S12-031 Hallucination prevention guardrails
- Title: `S12-031 Add prompt and response guardrails`
- Type: Story
- Labels: `story`, `backend`, `guardrails`, `s12`
- Milestone: `S12-M1`
- Description: Prevent uncited speculation via prompt rules and checks.
- Acceptance Criteria: Unsupported claims are blocked or qualified.
- Dependencies: S12-012, S12-019
- Target Files: `backend/src/main/java/.../chatbot/prompt/*`, `.../guardrails/*`
- Definition of Done: Guardrail behavior test-covered.

### Issue: S12-032 Citation drill-down details
- Title: `S12-032 Support citation drill-down in UI`
- Type: Story
- Labels: `story`, `frontend`, `chatbot`, `s12`
- Milestone: `S12-M2`
- Description: Provide expandable citation metadata in response UI.
- Acceptance Criteria: Artifact type/source/location hints are inspectable.
- Dependencies: S12-019, S12-008
- Target Files: `frontend/src/components/chatbot/EvidenceList.tsx`
- Definition of Done: Citation drill-down verified.

### Issue: S12-033 Strict evidence-only mode
- Title: `S12-033 Add strict evidence-only configuration mode`
- Type: Story
- Labels: `story`, `backend`, `guardrails`, `s12`
- Milestone: `S12-M2`
- Description: Optional strict mode to refuse unsupported inference by default.
- Acceptance Criteria: Strict mode toggles behavior as expected.
- Dependencies: S12-029, S12-031
- Target Files: `backend/src/main/java/.../chatbot/config/*`, `.../guardrails/*`
- Definition of Done: Strict mode behavior validated.

### Issue: S12-034 Session continuity across navigation
- Title: `S12-034 Preserve chat session across app navigation`
- Type: Story
- Labels: `story`, `frontend`, `chatbot`, `s12`
- Milestone: `S12-M3`
- Description: Maintain conversation state while moving through app views.
- Acceptance Criteria: Session persists for active scope; scope changes are reflected.
- Dependencies: S12-005, S12-006
- Target Files: `frontend/src/hooks/useChatbotState.ts`, `frontend/src/App.tsx`
- Definition of Done: Navigation continuity demonstrated.

### Issue: S12-035 Export answer and citations
- Title: `S12-035 Export chat output with evidence`
- Type: Story
- Labels: `story`, `frontend`, `qa`, `s12`
- Milestone: `S12-M3`
- Description: Export question/answer/confidence/citations for handoff use.
- Acceptance Criteria: Export contains required fields in stable format.
- Dependencies: S12-008, S12-032
- Target Files: `frontend/src/components/chatbot/*`
- Definition of Done: Export flow validated.

### Issue: S12-036 Staleness indication
- Title: `S12-036 Indicate stale context and allow refresh`
- Type: Story
- Labels: `story`, `frontend`, `backend`, `s12`
- Milestone: `S12-M3`
- Description: Flag stale context after pipeline updates and support refresh.
- Acceptance Criteria: Stale state is visible and refresh action works.
- Dependencies: S12-013, S12-034
- Target Files: `frontend/src/components/chatbot/*`, `backend/src/main/java/.../chatbot/*`
- Definition of Done: Staleness handling verified.

### Issue: S12-037 Clear conversation history
- Title: `S12-037 Add clear chat history action`
- Type: Story
- Labels: `story`, `frontend`, `chatbot`, `s12`
- Milestone: `S12-M3`
- Description: Allow clearing conversation without deleting artifacts.
- Acceptance Criteria: Clear action resets history safely.
- Dependencies: S12-034
- Target Files: `frontend/src/components/chatbot/*`
- Definition of Done: Clear-history behavior validated.

### Issue: S12-038 Structured logging
- Title: `S12-038 Add structured query lifecycle logging`
- Type: Story
- Labels: `story`, `backend`, `telemetry`, `s12`
- Milestone: `S12-M4`
- Description: Emit structured logs for query/retrieval/model stages.
- Acceptance Criteria: request ID, timings, evidence counts, provider metadata logged.
- Dependencies: S12-001
- Target Files: `backend/src/main/java/.../chatbot/*`
- Definition of Done: Logs support debugging and ops review.

### Issue: S12-039 User feedback capture
- Title: `S12-039 Capture response usefulness feedback`
- Type: Story
- Labels: `story`, `frontend`, `backend`, `s12`
- Milestone: `S12-M4`
- Description: Capture lightweight user feedback for iterative quality improvements.
- Acceptance Criteria: Feedback events include query type/confidence context.
- Dependencies: S12-008, S12-030
- Target Files: `frontend/src/components/chatbot/*`, `backend/src/main/java/.../chatbot/*`
- Definition of Done: Feedback endpoint and UI action verified.

### Issue: S12-040 Grounding quality metrics
- Title: `S12-040 Track citation and refusal quality metrics`
- Type: Story
- Labels: `story`, `backend`, `telemetry`, `s12`
- Milestone: `S12-M4`
- Description: Track and monitor citation coverage and refusal correctness.
- Acceptance Criteria: Metrics available and thresholdable.
- Dependencies: S12-029, S12-031, S12-038
- Target Files: `backend/src/main/java/.../chatbot/*`
- Definition of Done: Metrics pipeline operational.

### Issue: S12-041 Health dashboard visibility
- Title: `S12-041 Expose chatbot/runtime health visibility`
- Type: Story
- Labels: `story`, `ops`, `chatbot`, `s12`
- Milestone: `S12-M4`
- Description: Provide operator visibility into chatbot and model status.
- Acceptance Criteria: Dashboard/health outputs show actionable degraded states.
- Dependencies: S12-004, S12-038
- Target Files: `backend/src/main/java/.../chatbot/*`, monitoring/docs assets
- Definition of Done: Ops review confirms usable health visibility.

### Issue: S12-042 Compose-based startup workflow
- Title: `S12-042 Provide compose-first local startup workflow`
- Type: Story
- Labels: `story`, `devex`, `local-llm`, `s12`
- Milestone: `S12-M1`
- Description: Ensure local stack startup is reproducible.
- Acceptance Criteria: Compose instructions and profile startup work for new contributor.
- Dependencies: S12-001, S12-002
- Target Files: `docker-compose.yaml`, `README.md`
- Definition of Done: Fresh setup execution succeeds.

### Issue: S12-043 Integration/regression tests
- Title: `S12-043 Implement chatbot integration and regression tests`
- Type: Story
- Labels: `story`, `qa`, `devex`, `s12`
- Milestone: `S12-M4`
- Description: Build test coverage for architecture/risk/change/missing-evidence flows.
- Acceptance Criteria: Core e2e and regression checks pass.
- Dependencies: S12-015, S12-021, S12-024, S12-029
- Target Files: backend/frontend test paths, `docker-compose.yaml`
- Definition of Done: Test gate supports release readiness.

### Issue: S12-044 Startup configuration validation
- Title: `S12-044 Validate runtime configuration at startup`
- Type: Story
- Labels: `story`, `backend`, `devex`, `s12`
- Milestone: `S12-M4`
- Description: Validate required runtime config before serving requests.
- Acceptance Criteria: Startup failures include clear diagnostics.
- Dependencies: S12-001, S12-004
- Target Files: `backend/src/main/java/.../chatbot/config/*`
- Definition of Done: Misconfiguration scenarios are validated.

### Issue: S12-045 API contract documentation
- Title: `S12-045 Maintain stable chatbot API contract docs`
- Type: Story
- Labels: `story`, `docs`, `backend`, `s12`
- Milestone: `S12-M1`
- Description: Document request/response contracts and change policy.
- Acceptance Criteria: Contract docs include citations/confidence/error envelopes.
- Dependencies: S12-005, S12-008
- Target Files: `docs/s12/*`, `README.md`
- Definition of Done: API consumers can integrate without ambiguity.

## Major Task Issues (Backlog-Derived)

Major implementation tasks are represented by the backlog IDs and should be tracked as task issues:
- `S12-BL-001` to `S12-BL-031`

Use this task issue template for each major task:

### Task Template
- Title: `<S12-BL-###> <Task Summary>`
- Type: Task
- Labels: `task`, `aridnova`, `local-llm`, `chatbot`, `rag`, `evidence-grounded`, `s12`
- Milestone: `<S12-M1 | S12-M2 | S12-M3 | S12-M4>`
- Description: `<Use backlog Task + Description fields directly from docs/s12/backlog.md>`
- Acceptance Criteria: `<Use backlog Acceptance Criteria field directly>`
- Dependencies: `<Use backlog Dependencies field directly>`
- Target Files: `<Use backlog Target Files field directly>`
- Definition of Done: Backlog acceptance criteria pass; related story acceptance behavior is verified.

Reference source for all task issue instances:
- `docs/s12/backlog.md` rows `S12-BL-001` through `S12-BL-031`.

## Milestone Grouping Guidance

- `S12-M1`: Foundation (`S12-BL-001,2,3,4,5,9,10,11,12,14` + related stories)
- `S12-M2`: Architecture grounding and guardrails (`S12-BL-006,7,8,13,15,16,21,22` + related stories)
- `S12-M3`: Verification/risk/change/test Q&A (`S12-BL-017,18,19,20,23` + related stories)
- `S12-M4`: Hardening and release readiness (`S12-BL-024` to `S12-BL-031` + related stories)
