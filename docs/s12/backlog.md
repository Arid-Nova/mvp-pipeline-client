# Backlog - Local LLM Chatbot / Architecture-Grounded Assistant

This implementation backlog is derived from `docs/s12/product-requirements.md` and `docs/s12/user-stories.md` for Sprint S12. `Arid-Nova-description.txt` was not found in repository root or `docs/`.

| Backlog ID | Story ID | Epic | Task | Description | Target Files | Dependencies | Priority | Estimate | Milestone | Acceptance Criteria |
|---|---|---|---|---|---|---|---|---|---|---|
| S12-BL-001 | S12-042 | Local LLM Runtime and Configuration | Add Docker Compose local LLM integration | Add optional Compose service/profile for local model runtime and chatbot backend wiring. | `docker-compose.yaml`; `backend/Dockerfile` (if chatbot added in backend image) | None | P0 | 3 pts | S12-M1: Local chatbot foundation | Given compose profile enabled, when stack starts, then local model and chatbot runtime are reachable on configured local network ports. |
| S12-BL-002 | S12-001 | Local LLM Runtime and Configuration | Define env vars for local provider settings | Add env var contract for provider, model name, base URL, timeout, token limit (and optional temperature). | `docker-compose.yaml`; `backend/src/main/resources/application.properties` (or `application.yml`, verify package path before implementation); `docs/s12/release-plan.md` (config rollout notes) | S12-BL-001 | P0 | 2 pts | S12-M1: Local chatbot foundation | Given env vars are set, when chatbot starts, then runtime config is loaded; given required var missing, then startup fails with clear diagnostic. |
| S12-BL-003 | S12-004 | Local LLM Runtime and Configuration | Add chatbot health endpoint | Expose health endpoint that checks local model endpoint readiness and returns actionable status. | `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/ChatbotController.java` (verify package path before implementation) | S12-BL-002 | P0 | 2 pts | S12-M1: Local chatbot foundation | Given model endpoint is healthy, when `GET /chatbot/health` is called, then API returns healthy status; given endpoint down, then degraded status + reason is returned. |
| S12-BL-004 | S12-003 | Local LLM Runtime and Configuration | Enforce local-only default mode | Ensure chatbot flow does not require cloud keys and defaults to local provider mode. | `backend/src/main/java/.../chatbot/ChatbotConfig.java` (verify package path before implementation); `docker-compose.yaml` | S12-BL-002 | P0 | 2 pts | S12-M1: Local chatbot foundation | Given no cloud credentials exist, when chatbot query runs, then local provider path is used and request succeeds or fails only due to local runtime conditions. |
| S12-BL-005 | S12-045 | Backend/API | Create chatbot query endpoint | Add `POST /chatbot/query` endpoint accepting question + context selector and returning answer payload. | `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/ChatbotController.java` (verify package path before implementation) | S12-BL-002 | P0 | 3 pts | S12-M1: Local chatbot foundation | Given valid request, when endpoint is called, then answer envelope includes answer text, citations, confidence label, and flags. |
| S12-BL-006 | S12-010 | Evidence Retrieval and Context Assembly | Implement context retrieval service | Build service that gathers artifacts for active system/session across IR, graph, verification, change impact, scenarios/tests, and Aegis. | `backend/src/main/java/.../chatbot/ChatContextService.java` (verify package path before implementation); `backend/src/main/java/.../api/ir/IRService.java`; `backend/src/main/java/.../api/graph/GraphService.java` | S12-BL-005 | P0 | 5 pts | S12-M2: Evidence-grounded architecture Q&A | Given active context, when retrieval runs, then normalized evidence set is returned with artifact metadata and source references. |
| S12-BL-007 | S12-012 | Evidence Retrieval and Context Assembly | Implement hybrid retrieval strategy | Add structured lookup + semantic ranking path over normalized evidence. | `backend/src/main/java/.../chatbot/retrieval/HybridRetriever.java` (verify package path before implementation) | S12-BL-006 | P1 | 5 pts | S12-M2: Evidence-grounded architecture Q&A | Given entity query, when retrieval runs, then exact match path is used; given exploratory query, then ranked semantic snippets are returned. |
| S12-BL-008 | S12-014 | Evidence Retrieval and Context Assembly | Add deterministic context budgeting | Implement token budgeting and deterministic truncation of retrieval context. | `backend/src/main/java/.../chatbot/retrieval/ContextBudgeter.java` (verify package path before implementation) | S12-BL-007 | P1 | 3 pts | S12-M2: Evidence-grounded architecture Q&A | Given oversized context, when assembly runs, then truncation is deterministic and truncation metadata is included in response flags. |
| S12-BL-009 | S12-031 | Guardrails, Confidence, and Explainability | Implement prompt assembly service | Compose system + developer prompt with hard grounding instructions and refusal guardrails. | `backend/src/main/java/.../chatbot/prompt/PromptAssemblyService.java` (verify package path before implementation) | S12-BL-006 | P0 | 3 pts | S12-M1: Local chatbot foundation | Given retrieved evidence, when prompt is assembled, then instructions explicitly forbid unsupported claims and require citations. |
| S12-BL-010 | S12-002 | Local LLM Runtime and Configuration | Implement local model invocation service | Add provider adapter to invoke Ollama, llama.cpp server, or OpenAI-compatible local endpoint. | `backend/src/main/java/.../chatbot/llm/LocalLlmClient.java`; `backend/src/main/java/.../chatbot/llm/providers/*` (verify package path before implementation) | S12-BL-002, S12-BL-009 | P0 | 5 pts | S12-M1: Local chatbot foundation | Given configured provider, when invocation is requested, then response is returned through unified client contract with timeout handling. |
| S12-BL-011 | S12-019 | Architecture Question Answering | Define answer schema with citations/evidence | Create response DTO including answer, citations, confidence label, and qualification flags. | `backend/src/main/java/.../chatbot/model/ChatbotResponse.java`; `backend/src/main/java/.../chatbot/model/CitationItem.java` (verify package path before implementation) | S12-BL-005 | P0 | 2 pts | S12-M1: Local chatbot foundation | Given successful response, when serialized, then each citation includes artifact type, source identifier, and location hint. |
| S12-BL-012 | S12-005 | Chatbot UI and Conversation Experience | Build frontend chatbot panel component | Create embedded chatbot UI panel in main app workflow. | `frontend/src/App.tsx`; `frontend/src/components/chatbot/ChatbotPanel.tsx` (new); `frontend/src/components/` | S12-BL-005 | P0 | 5 pts | S12-M1: Local chatbot foundation | Given user opens panel, when asking a question, then request is sent to backend and response renders without leaving current workflow. |
| S12-BL-013 | S12-007 | Chatbot UI and Conversation Experience | Add conversation state management | Manage message history, loading state, retries, and context reset behavior. | `frontend/src/components/chatbot/ChatbotPanel.tsx`; `frontend/src/hooks/useChatbotState.ts` (new); `frontend/src/App.tsx` | S12-BL-012 | P1 | 3 pts | S12-M2: Evidence-grounded architecture Q&A | Given multi-turn chat, when follow-up is sent, then prior context is preserved until explicit clear/reset. |
| S12-BL-014 | S12-006 | Chatbot UI and Conversation Experience | Integrate selected IR/indexId/session context | Attach active system/session/index context to chatbot query payload. | `frontend/src/App.tsx`; `frontend/src/components/pipeline/PipelinePage.tsx`; `frontend/src/services/api.ts` | S12-BL-012 | P0 | 3 pts | S12-M1: Local chatbot foundation | Given active selection exists, when question is sent, then payload includes context identifiers and response displays active scope indicator. |
| S12-BL-015 | S12-015 | Architecture Question Answering | Add IR JSON architecture context retrieval | Extract service/component architecture facts from IR JSON for Q&A grounding. | `backend/src/main/java/.../chatbot/context/IrContextProvider.java` (verify package path before implementation); `backend/src/main/java/.../api/ir/IRService.java` | S12-BL-006 | P0 | 3 pts | S12-M2: Evidence-grounded architecture Q&A | Given IR exists, when architecture query is asked, then answer references IR-derived entities and cites IR source metadata. |
| S12-BL-016 | S12-016 | Architecture Question Answering | Add graph dependency context retrieval | Retrieve graph links/dependency paths for dependency and blast-radius questions. | `backend/src/main/java/.../chatbot/context/GraphContextProvider.java` (verify package path before implementation); `backend/src/main/java/.../api/graph/GraphService.java` | S12-BL-006 | P0 | 3 pts | S12-M2: Evidence-grounded architecture Q&A | Given graph data exists, when dependency query is asked, then response includes direct/transitive dependencies with graph citations. |
| S12-BL-017 | S12-020 | Verification and Risk Question Answering | Add verification result retrieval | Retrieve and normalize formal verification outputs for chatbot evidence. | `backend/src/main/java/.../chatbot/context/VerificationContextProvider.java` (verify package path before implementation); `formalmethod/app/main.py` (contract verify only, no direct edit required) | S12-BL-006 | P0 | 3 pts | S12-M3: Verification, risk, and change-impact Q&A | Given verification artifacts exist, when findings question is asked, then chatbot returns pass/fail/unknown summary with citations. |
| S12-BL-018 | S12-024 | Change Impact and Testing Question Answering | Add change impact retrieval | Pull delta/change-impact artifacts for "what changed" and impact answers. | `backend/src/main/java/.../chatbot/context/ChangeImpactContextProvider.java` (verify package path before implementation); `backend/src/main/java/.../api/ir/DeltaService.java` | S12-BL-006 | P0 | 3 pts | S12-M3: Verification, risk, and change-impact Q&A | Given delta artifacts exist, when impact question is asked, then changed entities and downstream effects are cited in answer. |
| S12-BL-019 | S12-027 | Change Impact and Testing Question Answering | Add scenario/test context retrieval | Retrieve scenarios, prompts, and generated test artifacts to support testing guidance Q&A. | `backend/src/main/java/.../chatbot/context/ScenarioTestContextProvider.java` (verify package path before implementation); `scenariogenerator/app/main.py`; `testgenerator/app/main.py` (contract verify only) | S12-BL-006 | P1 | 3 pts | S12-M3: Verification, risk, and change-impact Q&A | Given scenario/test artifacts exist, when "what should I test" is asked, then response includes prioritized recommendations with evidence links. |
| S12-BL-020 | S12-021 | Verification and Risk Question Answering | Add Aegis risk context retrieval | Retrieve Aegis analysis outputs and normalize as evidence items. | `backend/src/main/java/.../chatbot/context/AegisContextProvider.java` (verify package path before implementation); `aegis/service.py` (contract verify only) | S12-BL-006 | P0 | 3 pts | S12-M3: Verification, risk, and change-impact Q&A | Given Aegis outputs exist, when risk question is asked, then response includes risk indicators and citations to Aegis artifacts. |
| S12-BL-021 | S12-030 | Guardrails, Confidence, and Explainability | Implement confidence label generation | Derive confidence label from evidence quantity/consistency/freshness rules. | `backend/src/main/java/.../chatbot/quality/ConfidenceService.java` (verify package path before implementation); `frontend/src/components/chatbot/ChatbotPanel.tsx` | S12-BL-011 | P1 | 2 pts | S12-M2: Evidence-grounded architecture Q&A | Given response generated, when confidence is computed, then label and rationale are returned and displayed in UI. |
| S12-BL-022 | S12-029 | Guardrails, Confidence, and Explainability | Implement missing evidence handling and refusal logic | Add insufficient-evidence detection and non-speculative refusal/qualification responses. | `backend/src/main/java/.../chatbot/guardrails/EvidenceGuardrailService.java` (verify package path before implementation); `backend/src/main/java/.../chatbot/prompt/PromptAssemblyService.java` | S12-BL-006, S12-BL-009 | P0 | 3 pts | S12-M2: Evidence-grounded architecture Q&A | Given required evidence missing, when query is processed, then response refuses speculation and lists missing sources in flags/message. |
| S12-BL-023 | S12-004 | Local LLM Runtime and Configuration | Handle unavailable local LLM runtime errors | Add timeout, connection, and upstream error mapping to user-safe error envelopes. | `backend/src/main/java/.../chatbot/llm/LocalLlmClient.java`; `frontend/src/services/api.ts`; `frontend/src/components/chatbot/ChatbotPanel.tsx` | S12-BL-010, S12-BL-012 | P0 | 3 pts | S12-M3: Verification, risk, and change-impact Q&A | Given local model endpoint fails, when user submits query, then UI shows actionable error state without crash and supports retry. |
| S12-BL-024 | S12-043 | Developer Experience and Deployment | Add backend unit tests for chatbot services | Unit tests for retrieval, prompt assembly, guardrails, confidence labeling, and schema serialization. | `backend/src/test/java/.../chatbot/*` (verify package path before implementation) | S12-BL-006 through S12-BL-023 | P1 | 5 pts | S12-M4: Hardening, telemetry, and release readiness | Given test suite runs, when unit tests execute, then core services pass coverage threshold and failure cases are validated. |
| S12-BL-025 | S12-043 | Developer Experience and Deployment | Add frontend unit tests for chatbot UI/state | Unit tests for panel rendering, citation rendering, confidence badge, and error states. | `frontend/src/components/chatbot/__tests__/ChatbotPanel.test.tsx`; `frontend/src/hooks/__tests__/useChatbotState.test.ts` (verify test framework path before implementation) | S12-BL-012, S12-BL-013, S12-BL-021, S12-BL-023 | P1 | 3 pts | S12-M4: Hardening, telemetry, and release readiness | Given test runner executes, when UI tests run, then happy path and unavailable-runtime/missing-evidence states are covered. |
| S12-BL-026 | S12-043 | Developer Experience and Deployment | Add integration tests for end-to-end chatbot flow | Validate API + retrieval + local inference + UI integration on local stack. | `backend/src/test/java/.../integration/*` (verify package path before implementation); `frontend` e2e tests path (verify package path before implementation); `docker-compose.yaml` | S12-BL-001 through S12-BL-023 | P1 | 8 pts | S12-M4: Hardening, telemetry, and release readiness | Given local stack is up, when scripted queries are executed, then responses include citations/confidence and guardrail behavior passes expected assertions. |
| S12-BL-027 | S12-042 | Developer Experience and Deployment | Write developer documentation | Document setup, env vars, local model options, health checks, and troubleshooting. | `README.md`; `docs/s12/release-plan.md`; `docs/s12/product-requirements.md` (cross-links only) | S12-BL-001, S12-BL-002, S12-BL-003 | P1 | 3 pts | S12-M4: Hardening, telemetry, and release readiness | Given a new developer, when following docs, then they can run chatbot locally and execute a sample question successfully. |
| S12-BL-028 | S12-003 | Privacy and Security | Perform security/privacy review for chatbot data flow | Review secrets handling, local-only defaults, logging policy, and citation trace data exposure. | `docs/s12/product-requirements.md`; `backend/src/main/java/.../chatbot/*` (verify package path before implementation); `docker-compose.yaml` | S12-BL-002, S12-BL-005, S12-BL-022 | P0 | 3 pts | S12-M4: Hardening, telemetry, and release readiness | Given security checklist runs, when review is completed, then no cloud dependency is required and sensitive logging defaults are documented and enforced. |
| S12-BL-029 | S12-045 | Observability and Product Feedback | Add structured observability for chatbot pipeline | Add request IDs, latency segments, retrieval counts, provider metadata, and error taxonomy. | `backend/src/main/java/.../chatbot/*` (verify package path before implementation); `frontend/src/services/api.ts` | S12-BL-005, S12-BL-006, S12-BL-010 | P1 | 3 pts | S12-M4: Hardening, telemetry, and release readiness | Given chatbot query executes, when logs are inspected, then request trace includes retrieval, model invocation, and response status fields. |
| S12-BL-030 | S12-039 | Observability and Product Feedback | Add user feedback capture hook | Add UI affordance and backend endpoint/logging for response usefulness feedback. | `frontend/src/components/chatbot/ChatbotPanel.tsx`; `frontend/src/services/api.ts`; `backend/src/main/java/.../chatbot/FeedbackController.java` (verify package path before implementation) | S12-BL-012, S12-BL-029 | P2 | 2 pts | S12-M4: Hardening, telemetry, and release readiness | Given user submits feedback, when action is triggered, then event is stored/logged with request ID and confidence label context. |
| S12-BL-031 | S12-045 | Backend/API | Align backlog to JIRA import schema | Prepare backlog rows and mapping fields compatible with `docs/s12/jira-import.csv` columns. | `docs/s12/jira-import.csv`; `docs/s12/backlog.md`; `docs/s12/user-stories.md` | S12-BL-001 through S12-BL-030 | P1 | 2 pts | S12-M4: Hardening, telemetry, and release readiness | Given import template, when backlog mapping is exported, then required JIRA columns are populated with consistent IDs/dependencies. |

## Notes

- `Arid-Nova-description.txt` was not found in the repository root or `docs/` directory at the time of backlog creation.
- For Java chatbot package paths under `backend/src/main/java/.../chatbot/`, verify exact package structure before implementation.

## CSV Validation Notes

- Validation status: `Passed`
- File checked: `docs/s12/jira-import.csv`
- Rows validated (excluding header): 86
- Header check: exact 10-column header matches required schema.
- Column count check: all rows contain exactly 10 columns.
- Issue Type check: all values are in `{Epic, Story, Task}`.
- Priority check: all values are in `{Highest, High, Medium, Low}`.
- Milestone check: all values are in `{S12-M1, S12-M2, S12-M3, S12-M4}`.
- Story Points check: all values are numeric.
- Auto-fix actions: none required.

## Developer Handoff Notes

### 1. Probable Frontend Files To Modify

- `frontend/src/App.tsx`
  - Add chatbot panel mount point and route/context wiring.
- `frontend/src/services/api.ts`
  - Add chatbot API client function for `POST /chat/ask` and health/status calls.
- `frontend/src/components/pipeline/PipelinePage.tsx`
  - Pass active `analysisId`, `indexId`, `sessionId`, and selected node context to chatbot.
- `frontend/src/components/graph/GraphWrapper.tsx`
  - Surface selected node identifier (`selectedNodeId`) for context-aware question asking.
- `frontend/src/components/graph/NodeInfoBox.tsx`
  - Optional entry point for “ask about this node” action.
- New suggested files:
  - `frontend/src/components/chatbot/ChatbotPanel.tsx`
  - `frontend/src/components/chatbot/ChatMessageList.tsx`
  - `frontend/src/components/chatbot/ChatComposer.tsx`
  - `frontend/src/components/chatbot/EvidenceList.tsx`
  - `frontend/src/components/chatbot/ConfidenceBadge.tsx`
  - `frontend/src/hooks/useChatbotState.ts`
  - `frontend/src/services/chatbotTypes.ts`

### 2. Probable Backend Files/Packages To Create Or Modify

- Existing backend base:
  - `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/`
- Probable new package root (verify package path before implementation):
  - `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/`
- Suggested classes (create):
  - `ChatController` (endpoint handler)
  - `ChatRequest` / `ChatResponse` DTOs
  - `EvidenceItem` DTO
  - `ChatService` (orchestrator)
  - `ContextAssemblyService`
  - `PromptAssemblyService`
  - `LocalLlmClient` + provider adapters
  - `ConfidenceService`
  - `EvidenceGuardrailService`
- Existing services likely to integrate with:
  - `backend/.../api/ir/IRService.java`
  - `backend/.../api/ir/DeltaService.java`
  - `backend/.../api/graph/GraphService.java`
- External service contract integrations (no direct frontend call):
  - `formalmethod/app/main.py`
  - `scenariogenerator/app/main.py`
  - `testgenerator/app/main.py`
  - `aegis/service.py`

### 3. Docker Compose Changes Needed For Local LLM Runtime

- Update `docker-compose.yaml` to support local model runtime and chatbot usage path.
- Add optional local model service/profile (for example Ollama or compatible local endpoint).
- Ensure chatbot backend service receives model endpoint env vars.
- Keep model runtime and chatbot services on existing `app_network`.
- Add healthcheck for model service and wire dependency order where appropriate.
- Keep local-only default behavior; do not require cloud provider services for chatbot flow.

### 4. Environment Variables To Add

Use environment-driven config for portability and local-only operation.

- `CHAT_MODEL_PROVIDER` (example: `ollama`, `llamacpp`, `openai_compatible_local`)
- `CHAT_MODEL_NAME` (example: `llama3.1:8b-instruct`)
- `CHAT_MODEL_BASE_URL` (example: `http://local-llm:11434`)
- `CHAT_MODEL_TIMEOUT_MS` (example: `30000`)
- `CHAT_MODEL_MAX_TOKENS` (example: `4096`)
- Optional:
  - `CHAT_MODEL_TEMPERATURE`
  - `CHAT_EVIDENCE_TOP_K`
  - `CHAT_STRICT_EVIDENCE_MODE`
  - `CHAT_REQUEST_LOGGING_ENABLED`

### 5. Proposed API Contract For Chatbot Request/Response

Endpoint:

- `POST /chat/ask`

Request:

```json
{
  "question": "string",
  "analysisId": "string",
  "indexId": "string",
  "sessionId": "string",
  "selectedNodeId": "string | null",
  "contextTypes": ["IR", "GRAPH", "VERIFICATION", "CHANGE_IMPACT", "RISK", "TESTS"]
}
```

Response:

```json
{
  "answer": "string",
  "confidence": "HIGH | MEDIUM | LOW | INSUFFICIENT_EVIDENCE",
  "evidence": [
    {
      "type": "IR | GRAPH | VERIFICATION | CHANGE_IMPACT | RISK | TEST",
      "sourceId": "string",
      "label": "string",
      "excerpt": "string"
    }
  ],
  "missingEvidence": ["string"],
  "followUpQuestions": ["string"]
}
```

Recommended error envelope (for consistency):

```json
{
  "error": {
    "code": "LOCAL_MODEL_UNAVAILABLE | INVALID_REQUEST | INSUFFICIENT_EVIDENCE | INTERNAL_ERROR",
    "message": "string",
    "requestId": "string"
  }
}
```

### 6. Proposed Evidence Object Schema

Use a normalized internal evidence model before formatting response:

```json
{
  "type": "IR | GRAPH | VERIFICATION | CHANGE_IMPACT | RISK | TEST",
  "sourceId": "string",
  "label": "string",
  "excerpt": "string",
  "artifactVersion": "string",
  "timestamp": "string",
  "entityRefs": ["string"],
  "locationHint": "string",
  "score": 0.0
}
```

Minimum response mapping:

- `type`, `sourceId`, `label`, `excerpt` required in API response.
- Keep richer fields internal or expose later via expanded citation UI.

### 7. Suggested Frontend Component Hierarchy

- `ChatbotPanel`
  - `ChatHeader` (scope + health)
  - `ChatMessageList`
    - `ChatMessage`
    - `EvidenceList`
      - `EvidenceItem`
    - `ConfidenceBadge`
  - `MissingEvidenceNotice`
  - `RuntimeErrorNotice`
  - `FollowUpQuestionChips`
  - `ChatComposer`

State split recommendation:

- `useChatbotState` for messages/loading/errors
- API functions in `frontend/src/services/api.ts`
- shared types in `frontend/src/services/chatbotTypes.ts`

### 8. Suggested Backend Service Hierarchy

- `ChatController`
  - validates request
  - invokes `ChatService`
- `ChatService`
  - orchestrates pipeline
  - calls:
    - `ContextAssemblyService`
    - `PromptAssemblyService`
    - `LocalLlmClient`
    - `ConfidenceService`
    - `EvidenceGuardrailService`
- `ContextAssemblyService`
  - provider modules:
    - `IrContextProvider`
    - `GraphContextProvider`
    - `VerificationContextProvider`
    - `ChangeImpactContextProvider`
    - `RiskContextProvider`
    - `TestContextProvider`
- `LocalLlmClient`
  - provider adapters per runtime
- `EvidenceGuardrailService`
  - enforces no-speculation and missing evidence behavior

### 9. Testing Plan

- Backend unit tests:
  - request validation
  - context assembly per `contextTypes`
  - prompt assembly guardrails
  - confidence mapping
  - missing-evidence refusal behavior
- Frontend unit tests:
  - message rendering
  - evidence list rendering
  - confidence badge states
  - unavailable-runtime error state
- Integration tests:
  - `POST /chat/ask` happy path with local model stub
  - missing evidence path returns `INSUFFICIENT_EVIDENCE`
  - local runtime timeout/unavailable path returns stable error envelope
- Non-functional checks:
  - ensure no direct browser-to-model calls
  - ensure no cloud credential requirement for local flow

### 10. Known Repository Gotchas

- Hardcoded localhost service URLs already exist in `frontend/src/services/api.ts`; avoid adding more hardcoded endpoints for chatbot and centralize config.
- Multiple backend/service stacks are split across Java and Python services; contract mismatches are a likely failure mode.
- CORS settings vary by service; chatbot endpoints should use explicit safe origins.
- `docker-compose.yaml` currently includes cloud-oriented env vars for other services; chatbot path must remain local-only by default.
- Existing docs and backlog use `S12-BL-###`; keep this ID format consistent in any new planning artifacts.
- Package paths under backend Java modules should be verified before implementation to avoid namespace drift.
