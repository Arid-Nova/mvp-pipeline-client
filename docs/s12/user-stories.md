# User Stories - Local LLM Chatbot / Architecture-Grounded Assistant

This story map defines implementation-ready stories for the AridNova Local LLM Chatbot capability, with priority on local-only LLM operation and evidence-grounded answers.

## Epic 1: Local LLM Runtime and Configuration

**Epic description:** Enable reliable local model inference through configurable runtime adapters without cloud provider dependency.

**Primary users:** Platform operator, developer, security engineer.

**User outcomes:** Chatbot runs fully local, can be configured per environment, and fails clearly when runtime is unavailable.

**Story IDs:** S12-001 to S12-004

### S12-001
- **User story:** As a platform operator, I want to configure chatbot model endpoint and model ID using environment variables, so that I can deploy different local model backends without code changes.
- **Acceptance criteria:**
  - Backend reads model base URL, model name, timeout, and token limits from environment variables.
  - Service fails startup validation with clear error if required configuration is missing.
- **Dependencies:** Existing backend service configuration patterns.
- **Suggested milestone:** M1 Foundation

### S12-002
- **User story:** As a developer, I want support for Ollama, llama.cpp server, and OpenAI-style local endpoints, so that we can choose runtime based on hardware and performance.
- **Acceptance criteria:**
  - Provider adapter abstraction supports at least the three local endpoint types.
  - Provider selection is runtime-configurable.
- **Dependencies:** S12-001.
- **Suggested milestone:** M1 Foundation

### S12-003
- **User story:** As a security engineer, I want chatbot operation to not require cloud API keys, so that sensitive architecture artifacts remain local.
- **Acceptance criteria:**
  - Chatbot core flow succeeds without OpenAI/Anthropic/Groq credentials.
  - Documentation states cloud credentials are optional and not required for chatbot.
- **Dependencies:** S12-001.
- **Suggested milestone:** M1 Foundation

### S12-004
- **User story:** As an end user, I want a clear runtime health status, so that I know when chatbot answers may be unavailable.
- **Acceptance criteria:**
  - Health endpoint reports model connectivity and readiness.
  - Frontend shows actionable runtime-unavailable message.
- **Dependencies:** S12-001, S12-002.
- **Suggested milestone:** M1 Foundation

## Epic 2: Chatbot UI and Conversation Experience

**Epic description:** Deliver an embedded conversational interface aligned with AridNova workflows.

**Primary users:** Security engineer, backend engineer, QA engineer, architect.

**User outcomes:** Users can ask scoped questions in context and get readable structured responses.

**Story IDs:** S12-005 to S12-009

### S12-005
- **User story:** As an end user, I want a chatbot panel in the AridNova interface, so that I can ask questions without leaving my workflow.
- **Acceptance criteria:**
  - Chatbot entry point is visible on primary analysis screens.
  - Panel can open/close without losing current analysis state.
- **Dependencies:** App navigation structure.
- **Suggested milestone:** M2 Grounding

### S12-006
- **User story:** As an end user, I want the chatbot to show active system/context, so that I know which artifacts answers are based on.
- **Acceptance criteria:**
  - UI displays active project/system identifier.
  - Response includes scope indicator (current run vs historical run where available).
- **Dependencies:** S12-005.
- **Suggested milestone:** M2 Grounding

### S12-007
- **User story:** As an end user, I want follow-up questions to preserve conversational context, so that I can refine analysis quickly.
- **Acceptance criteria:**
  - Follow-up questions can reference prior answers using pronouns/short forms.
  - Context window is bounded and communicated when older context is dropped.
- **Dependencies:** S12-005.
- **Suggested milestone:** M3 Beta

### S12-008
- **User story:** As an end user, I want response sections for answer, citations, and confidence, so that I can evaluate trust quickly.
- **Acceptance criteria:**
  - Each answer displays separate evidence and confidence/qualification blocks.
  - Missing citation state is visually distinct.
- **Dependencies:** S12-019, S12-030.
- **Suggested milestone:** M2 Grounding

### S12-009
- **User story:** As a QA engineer, I want keyboard-friendly message input and submit behavior, so that conversation is efficient during test sessions.
- **Acceptance criteria:**
  - Enter submits and Shift+Enter inserts newline.
  - Input and send controls meet baseline accessibility behavior.
- **Dependencies:** S12-005.
- **Suggested milestone:** M3 Beta

## Epic 3: Evidence Retrieval and Context Assembly

**Epic description:** Build retrieval pipeline that assembles relevant artifacts before generation.

**Primary users:** End users, developer, platform operator.

**User outcomes:** Answers use the right project artifacts with reproducible context selection.

**Story IDs:** S12-010 to S12-014

### S12-010
- **User story:** As a developer, I want a normalized evidence schema across IR, graph, verification, tests, and risk outputs, so that retrieval and citation are consistent.
- **Acceptance criteria:**
  - Evidence items include artifact type, identifier, timestamp/version, and source location metadata.
  - Schema supports both structured and text-rich artifacts.
- **Dependencies:** Existing service outputs.
- **Suggested milestone:** M1 Foundation

### S12-011
- **User story:** As an end user, I want retrieval to prioritize artifacts from my active analysis context, so that answers stay relevant.
- **Acceptance criteria:**
  - Retrieval filters by active system/session where context is provided.
  - Cross-system retrieval is blocked unless user explicitly changes scope.
- **Dependencies:** S12-006, S12-010.
- **Suggested milestone:** M2 Grounding

### S12-012
- **User story:** As a developer, I want hybrid retrieval (structured lookup + semantic search), so that both exact and exploratory questions are handled.
- **Acceptance criteria:**
  - Entity-specific questions resolve by ID/name matching when possible.
  - Explanatory questions use semantic ranking over evidence corpus.
- **Dependencies:** S12-010.
- **Suggested milestone:** M2 Grounding

### S12-013
- **User story:** As a platform operator, I want context refresh controls, so that chatbot uses latest pipeline outputs after reruns.
- **Acceptance criteria:**
  - Refresh endpoint rebuilds or updates retrievable context.
  - Refresh result reports success, failures, and updated artifact counts.
- **Dependencies:** S12-010.
- **Suggested milestone:** M2 Grounding

### S12-014
- **User story:** As a developer, I want deterministic context truncation rules, so that long contexts remain predictable and debuggable.
- **Acceptance criteria:**
  - Token budget policy is explicit and test-covered.
  - Response metadata indicates when truncation occurred.
- **Dependencies:** S12-012.
- **Suggested milestone:** M3 Beta

## Epic 4: Architecture Question Answering

**Epic description:** Support architecture, service, endpoint, and dependency Q&A grounded in IR and graph data.

**Primary users:** Architect, backend engineer, security engineer.

**User outcomes:** Users can understand architecture and dependencies quickly with evidence.

**Story IDs:** S12-015 to S12-019

### S12-015
- **User story:** As an architect, I want to ask high-level architecture questions, so that I can understand system structure quickly.
- **Acceptance criteria:**
  - Chatbot answers topology questions using graph/IR artifacts.
  - Output references relevant services and relations with citations.
- **Dependencies:** S12-011, S12-012.
- **Suggested milestone:** M2 Grounding

### S12-016
- **User story:** As a backend engineer, I want dependency path explanations between services, so that I can assess coupling and blast radius.
- **Acceptance criteria:**
  - Chatbot returns direct and transitive dependencies when available.
  - Response distinguishes inferred vs explicitly represented links.
- **Dependencies:** S12-015.
- **Suggested milestone:** M2 Grounding

### S12-017
- **User story:** As a backend engineer, I want endpoint-level question answering, so that I can trace endpoint behavior and related components.
- **Acceptance criteria:**
  - Endpoint answers include method/path/service and related dependency hints when available.
  - Missing endpoint evidence triggers qualified response.
- **Dependencies:** S12-010, S12-012.
- **Suggested milestone:** M2 Grounding

### S12-018
- **User story:** As a security engineer, I want anti-pattern-aware architecture responses, so that risks in structure are highlighted during Q&A.
- **Acceptance criteria:**
  - If anti-pattern markers exist in evidence, response includes them in answer summary.
  - Citations point to graph nodes/links or analysis artifacts containing markers.
- **Dependencies:** S12-015.
- **Suggested milestone:** M3 Beta

### S12-019
- **User story:** As an end user, I want citations for architecture claims, so that I can verify statements.
- **Acceptance criteria:**
  - Every architecture/dependency answer includes at least one citation.
  - Citation metadata identifies artifact type and source identifier.
- **Dependencies:** S12-010.
- **Suggested milestone:** M2 Grounding

## Epic 5: Verification and Risk Question Answering

**Epic description:** Provide Q&A over formal verification and Aegis risk outputs.

**Primary users:** Security engineer, architect, QA engineer.

**User outcomes:** Faster interpretation of findings and prioritization of remediation.

**Story IDs:** S12-020 to S12-023

### S12-020
- **User story:** As a security engineer, I want to ask about verification findings, so that I can quickly identify failed assertions or inconsistencies.
- **Acceptance criteria:**
  - Chatbot summarizes verification status and key findings from artifacts.
  - Response distinguishes pass/fail/unknown states when data is partial.
- **Dependencies:** S12-011.
- **Suggested milestone:** M2 Grounding

### S12-021
- **User story:** As a security engineer, I want to ask risk-focused questions, so that I can understand potential vulnerabilities from Aegis analysis.
- **Acceptance criteria:**
  - Chatbot reports risk indicators from available Aegis output.
  - Response cites risk evidence and flags unavailable data.
- **Dependencies:** S12-011, S12-019.
- **Suggested milestone:** M2 Grounding

### S12-022
- **User story:** As an architect, I want verification and risk findings summarized together, so that I can prioritize mitigation work.
- **Acceptance criteria:**
  - Chatbot can produce consolidated summary across both evidence types.
  - Summary separates confirmed findings from low-confidence inferences.
- **Dependencies:** S12-020, S12-021, S12-030.
- **Suggested milestone:** M3 Beta

### S12-023
- **User story:** As a QA engineer, I want actionable follow-up prompts from findings, so that I can derive validation steps.
- **Acceptance criteria:**
  - For finding-related questions, chatbot can suggest next analysis questions.
  - Suggested prompts reference known evidence gaps where relevant.
- **Dependencies:** S12-020.
- **Suggested milestone:** M3 Beta

## Epic 6: Change Impact and Testing Question Answering

**Epic description:** Answer change-impact and test-priority questions from delta, scenario, and test artifacts.

**Primary users:** QA engineer, backend engineer, security engineer.

**User outcomes:** Better regression targeting and release confidence.

**Story IDs:** S12-024 to S12-028

### S12-024
- **User story:** As an end user, I want to ask "what changed?", so that I can understand differences between versions quickly.
- **Acceptance criteria:**
  - Chatbot summarizes changed components/services using delta evidence.
  - Output identifies baseline and comparison versions where available.
- **Dependencies:** S12-011.
- **Suggested milestone:** M2 Grounding

### S12-025
- **User story:** As a backend engineer, I want to ask change impact questions, so that I can estimate downstream effects before release.
- **Acceptance criteria:**
  - Chatbot returns impacted entities and related dependency implications.
  - Response includes qualification when impact chain is incomplete.
- **Dependencies:** S12-024, S12-016.
- **Suggested milestone:** M2 Grounding

### S12-026
- **User story:** As a QA engineer, I want to ask "what should I test?", so that I can prioritize regression effort.
- **Acceptance criteria:**
  - Chatbot recommends test focus areas using change impact + scenario/test evidence.
  - Recommendations include rationale citations.
- **Dependencies:** S12-024, S12-027.
- **Suggested milestone:** M3 Beta

### S12-027
- **User story:** As a QA engineer, I want scenario and generated-test-aware answers, so that guidance aligns with already generated artifacts.
- **Acceptance criteria:**
  - Chatbot can reference existing scenarios/prompts/tests by identifier.
  - If artifacts are absent, chatbot requests generation steps instead of inventing content.
- **Dependencies:** S12-011.
- **Suggested milestone:** M3 Beta

### S12-028
- **User story:** As a release lead, I want a change-risk-test summary response, so that I can make go/no-go decisions faster.
- **Acceptance criteria:**
  - Combined summary includes changed scope, top risks, and recommended test areas.
  - Summary clearly marks any missing evidence.
- **Dependencies:** S12-021, S12-024, S12-026.
- **Suggested milestone:** M4 MVP Release

## Epic 7: Guardrails, Confidence, and Explainability

**Epic description:** Prevent hallucinations and enforce evidence-linked, qualified outputs.

**Primary users:** End users, security engineer, product owner.

**User outcomes:** Higher trust and safer decision-making.

**Story IDs:** S12-029 to S12-033

### S12-029
- **User story:** As an end user, I want the chatbot to refuse unsupported claims, so that I do not act on fabricated information.
- **Acceptance criteria:**
  - When evidence retrieval is empty for required sources, chatbot refuses or returns qualified partial response.
  - Response includes explicit missing-evidence list.
- **Dependencies:** S12-012.
- **Suggested milestone:** M2 Grounding

### S12-030
- **User story:** As an end user, I want confidence labels on answers, so that I can weigh recommendations appropriately.
- **Acceptance criteria:**
  - Each answer includes confidence label (high/medium/low) with rule-based rationale.
  - Low-confidence responses include caution language and next-step suggestions.
- **Dependencies:** S12-014.
- **Suggested milestone:** M2 Grounding

### S12-031
- **User story:** As a security engineer, I want hallucination prevention guardrails in prompt orchestration, so that model output remains bounded by evidence.
- **Acceptance criteria:**
  - System prompt explicitly forbids unsupported assertions.
  - Post-generation validation checks citations for key claims.
- **Dependencies:** S12-012, S12-019.
- **Suggested milestone:** M2 Grounding

### S12-032
- **User story:** As an end user, I want citation drill-down details, so that I can inspect the source artifacts behind each claim.
- **Acceptance criteria:**
  - UI lets user expand citation details (artifact type, ID, location hint).
  - Invalid citation references are surfaced as system errors, not hidden.
- **Dependencies:** S12-019, S12-008.
- **Suggested milestone:** M3 Beta

### S12-033
- **User story:** As a product owner, I want policy controls for strict evidence-only mode, so that teams with higher assurance needs can enforce conservative behavior.
- **Acceptance criteria:**
  - Config toggle enables strict mode.
  - In strict mode, unsupported inference is refused by default.
- **Dependencies:** S12-029, S12-031.
- **Suggested milestone:** M4 MVP Release

## Epic 8: Persistence, Export, and Session Continuity

**Epic description:** Preserve useful chat context and allow reproducible sharing of answer evidence.

**Primary users:** End users, QA engineer, architect.

**User outcomes:** Conversations remain useful across workflow steps and can be shared for review.

**Story IDs:** S12-034 to S12-037

### S12-034
- **User story:** As an end user, I want chat session continuity during navigation, so that I can continue analysis without re-asking the same questions.
- **Acceptance criteria:**
  - Session persists while moving between key views in same browser session.
  - Context scope remains visible and updates when project context changes.
- **Dependencies:** S12-005, S12-006.
- **Suggested milestone:** M3 Beta

### S12-035
- **User story:** As a QA engineer, I want to export answer + citations, so that I can attach evidence to test planning artifacts.
- **Acceptance criteria:**
  - Export action outputs question, answer, confidence, and citation metadata.
  - Export format is machine-readable and human-readable.
- **Dependencies:** S12-008, S12-032.
- **Suggested milestone:** M3 Beta

### S12-036
- **User story:** As an architect, I want a clear indication when session context is stale, so that I avoid using outdated answers.
- **Acceptance criteria:**
  - UI flags potential staleness after pipeline reruns or context refresh requirement.
  - User can trigger context refresh from chatbot controls.
- **Dependencies:** S12-013, S12-034.
- **Suggested milestone:** M3 Beta

### S12-037
- **User story:** As an end user, I want the ability to clear conversation history, so that I can start a fresh analysis thread.
- **Acceptance criteria:**
  - Clear action removes local chat history for current scope.
  - Clear action does not delete underlying analysis artifacts.
- **Dependencies:** S12-034.
- **Suggested milestone:** M3 Beta

## Epic 9: Observability and Product Feedback

**Epic description:** Add telemetry and feedback loops to improve quality and reliability.

**Primary users:** Developer, platform operator, product owner.

**User outcomes:** Teams can monitor performance, detect failures, and iterate based on user feedback.

**Story IDs:** S12-038 to S12-041

### S12-038
- **User story:** As a platform operator, I want structured logs for retrieval and generation stages, so that I can debug failures and latency bottlenecks.
- **Acceptance criteria:**
  - Logs include request ID, timing segments, selected evidence count, and model provider.
  - Sensitive payload logging can be disabled by configuration.
- **Dependencies:** S12-001.
- **Suggested milestone:** M3 Beta

### S12-039
- **User story:** As a product owner, I want lightweight user feedback capture on answer usefulness, so that we can prioritize improvements.
- **Acceptance criteria:**
  - Users can rate response usefulness (e.g., thumbs up/down).
  - Feedback events include query type and confidence label.
- **Dependencies:** S12-008, S12-030.
- **Suggested milestone:** M4 MVP Release

### S12-040
- **User story:** As a developer, I want quality metrics for citation coverage and refusal correctness, so that grounding regressions are detected early.
- **Acceptance criteria:**
  - Metrics pipeline tracks citation presence and insufficient-evidence refusal rates.
  - Alert thresholds are configurable.
- **Dependencies:** S12-029, S12-031, S12-038.
- **Suggested milestone:** M4 MVP Release

### S12-041
- **User story:** As a platform operator, I want health dashboards for chatbot and local model runtime, so that operational incidents are visible.
- **Acceptance criteria:**
  - Health view includes chatbot API status and model endpoint status.
  - Degraded states provide actionable remediation hints.
- **Dependencies:** S12-004, S12-038.
- **Suggested milestone:** M4 MVP Release

## Epic 10: Developer Experience and Deployment

**Epic description:** Ensure local-first deployment and maintainable developer workflow.

**Primary users:** Developer, platform operator.

**User outcomes:** Fast setup, reproducible local deployment, and safe defaults.

**Story IDs:** S12-042 to S12-045

### S12-042
- **User story:** As a developer, I want Docker Compose profiles for chatbot and local model runtime, so that I can start the stack consistently.
- **Acceptance criteria:**
  - Compose configuration supports enabling/disabling chatbot and local model services.
  - Startup docs define minimal commands and required env vars.
- **Dependencies:** S12-001, S12-002.
- **Suggested milestone:** M1 Foundation

### S12-043
- **User story:** As a developer, I want local integration test scenarios for major question categories, so that regressions are caught before release.
- **Acceptance criteria:**
  - Test set covers architecture, risk, change impact, and missing-evidence flows.
  - Tests verify citation presence and refusal behavior.
- **Dependencies:** S12-015, S12-021, S12-024, S12-029.
- **Suggested milestone:** M3 Beta

### S12-044
- **User story:** As a platform operator, I want startup-time configuration validation, so that misconfiguration is detected before users hit runtime errors.
- **Acceptance criteria:**
  - Service validates required environment variables and endpoint reachability checks.
  - Validation failures return clear diagnostics.
- **Dependencies:** S12-001, S12-004.
- **Suggested milestone:** M1 Foundation

### S12-045
- **User story:** As a developer, I want API contracts for chatbot endpoints documented, so that frontend integration remains stable.
- **Acceptance criteria:**
  - Request/response schema documents include citations, confidence flags, and error envelopes.
  - Contract changes require versioned update notes.
- **Dependencies:** S12-005, S12-008.
- **Suggested milestone:** M2 Grounding

## Milestone Rollup (Suggested)

- **M1 Foundation:** S12-001, S12-002, S12-003, S12-004, S12-010, S12-042, S12-044
- **M2 Grounding:** S12-005, S12-006, S12-008, S12-011, S12-012, S12-013, S12-015, S12-016, S12-017, S12-019, S12-020, S12-021, S12-024, S12-025, S12-029, S12-030, S12-031, S12-045
- **M3 Beta:** S12-007, S12-009, S12-014, S12-018, S12-022, S12-023, S12-026, S12-027, S12-032, S12-034, S12-035, S12-036, S12-037, S12-038, S12-043
- **M4 MVP Release:** S12-028, S12-033, S12-039, S12-040, S12-041
