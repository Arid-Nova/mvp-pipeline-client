# S12-M2 Implementation Map: Evidence-grounded architecture Q&A

Date: 2026-05-22
Scope: repository mapping and implementation prep only (no feature logic changes)

## 1) Existing S12-M1 files discovered

### Backend chatbot (Spring Boot)
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/ChatbotController.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/model/ChatbotQueryRequest.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/model/ChatbotResponse.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/model/ChatbotContext.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/model/ChatbotMessage.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/model/CitationItem.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/model/EvidenceItem.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/ChatbotQueryService.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/ChatContextService.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/EvidenceGuardrailService.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/ChatbotHealthService.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/ChatbotRuntimeHealthChecker.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/prompt/PromptAssemblyService.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/prompt/PromptAssemblyResult.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/prompt/PromptEvidenceItem.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/runtime/LocalLlmClient.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/runtime/DefaultLocalLlmClient.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/runtime/LocalLlmAdapter.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/runtime/AbstractHttpLocalLlmAdapter.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/runtime/OpenAiStyleLocalLlmAdapter.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/runtime/OllamaLocalLlmAdapter.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/runtime/LlamaCppLocalLlmAdapter.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/runtime/LocalLlmException.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/runtime/model/ChatbotPrompt.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/runtime/model/LocalLlmResult.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/runtime/model/LocalLlmFailureCode.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/config/ChatbotConfig.java`

### Backend services likely used for S12-M2 evidence retrieval
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/ir/IRService.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/ir/IRController.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/graph/GraphService.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/graph/GraphController.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/persistence/ir/MicroserviceIRRepository.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/persistence/dao/GraphDAO.java`

### Frontend chatbot and wiring
- `frontend/src/components/chatbot/ChatbotPanel.tsx`
- `frontend/src/components/chatbot/useChatbotState.ts`
- `frontend/src/components/chatbot/ChatbotPanel.test.tsx`
- `frontend/src/services/api.ts` (chatbot endpoints `/chatbot/health` and `/chatbot/query`)
- `frontend/src/services/types.ts` (chatbot request/response/context DTOs)
- `frontend/src/components/pipeline/PipelinePage.tsx` (active context wiring into `ChatbotPanel`)

### Existing backend chatbot tests
- `backend/src/test/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/ChatbotControllerTest.java`
- `backend/src/test/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/model/ChatbotDtoSerializationTest.java`
- `backend/src/test/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/model/ChatbotQueryRequestValidationTest.java`
- `backend/src/test/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/prompt/PromptAssemblyServiceTest.java`
- `backend/src/test/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/runtime/LocalLlmAdapterTest.java`
- `backend/src/test/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/ChatbotQueryServiceTest.java`
- `backend/src/test/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/ChatEvidenceServicesTest.java`
- `backend/src/test/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/ChatbotRuntimeHealthCheckerTest.java`
- `backend/src/test/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/config/ChatbotConfigBindingTest.java`

## 2) Actual package paths

- Base backend package: `edu.baylor.ecs.cloudhubs.mvp.MVPBackend`
- Chatbot controller package: `edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot`
- Chatbot DTO package: `edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model`
- Prompt assembly package: `edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt`
- Local LLM runtime package: `edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime`
- Local LLM runtime models: `edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model`
- Chatbot services package: `edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service`
- IR service package: `edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir`
- Graph service package: `edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.graph`
- Frontend chatbot component path root: `frontend/src/components/chatbot`
- Frontend API service path: `frontend/src/services`
- Frontend pipeline context wiring: `frontend/src/components/pipeline`

## 3) S12-M2 target files to add or modify

Planned modifications (existing files):
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/ChatContextService.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/ChatbotQueryService.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/prompt/PromptAssemblyService.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/model/CitationItem.java` (if citation metadata extensions are needed)
- `frontend/src/components/chatbot/ChatbotPanel.tsx` (citation/evidence rendering updates)
- `frontend/src/components/chatbot/useChatbotState.ts` (if request context/history behavior changes)
- `frontend/src/services/types.ts` (if DTO fields evolve)

Likely new backend files for S12-M2 (recommended):
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/EvidenceRetrievalService.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/EvidenceRankingService.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/IrEvidenceExtractor.java`
- `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/GraphEvidenceExtractor.java`

Likely new tests for S12-M2:
- `backend/src/test/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/EvidenceRetrievalServiceTest.java`
- `backend/src/test/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/EvidenceRankingServiceTest.java`
- `backend/src/test/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot/service/ChatContextServiceTest.java` (if split from existing evidence tests)
- `frontend/src/components/chatbot/ChatbotPanel.evidence.test.tsx`

## 4) Test commands available (backend and frontend)

Backend (Maven / Spring Boot module):
- `cd backend && ./mvnw test`
- `cd backend && ./mvnw -Dtest=ChatbotControllerTest test`
- `cd backend && ./mvnw -Dtest=ChatbotQueryServiceTest,ChatEvidenceServicesTest test`
- `cd backend && ./mvnw -Dtest=ChatbotS12M2IntegrationTest test`

Frontend (CRA / React module):
- `cd frontend && npm test -- --watchAll=false`
- `cd frontend && npm test -- --watchAll=false --runInBand --testPathPattern=chatbot`
- `cd frontend && npm test -- --watchAll=false --runInBand --testPathPattern=ChatbotPanel.test.tsx`

## 5) Baseline test failures observed before S12-M2 implementation

Baseline validation run for this prompt (documentation-only change):
- Backend focused chatbot tests: failed before tests executed due to dependency resolution.
  - Command: `cd backend && ./mvnw -Dtest=ChatbotControllerTest,ChatbotQueryServiceTest,ChatEvidenceServicesTest,PromptAssemblyServiceTest,LocalLlmAdapterTest,ChatbotRuntimeHealthCheckerTest,ChatbotDtoSerializationTest,ChatbotQueryRequestValidationTest,ChatbotConfigBindingTest test`
  - Observed failure: `Could not resolve dependencies ... edu.university.ecs.lab:cimet-extract-lib:jar:1.2.0 was not found in https://repo.maven.apache.org/maven2`
  - Classification: baseline/environmental (unrelated to this prompt's docs-only change).
- Frontend focused chatbot tests: pass.
  - Command: `cd frontend && npm test -- --watchAll=false --runInBand --testPathPattern=ChatbotPanel.test.tsx`
  - Result: `PASS src/components/chatbot/ChatbotPanel.test.tsx` (6/6 tests passed, 1/1 suite passed).
  - Notes: console warnings about React `act(...)` and deprecated `ReactDOMTestUtils.act`, but no failing assertions.

## 6) Chatbot strict evidence mode (S12-033)

- Config key: `chatbot.strict-evidence-only`
- Environment variable: `CHATBOT_STRICT_EVIDENCE_ONLY`
- Current default: `true` (safe-by-default in `backend/src/main/resources/application.yml`)

Behavior:
- Strict mode (`true`):
  - Architecture/dependency/endpoint answers must have strong retrieved evidence.
  - Weak/inferred-only support is refused with `insufficient_evidence`.
  - Missing/invalid citations trigger `citation_validation_failed` and insufficient-evidence handling.
- Non-strict mode (`false`):
  - Qualified recommendations are allowed when grounded in retrieved evidence and valid citations.
  - Unsupported architecture facts are still refused.

## 7) Retrieval context refresh flow (S12-013)

- Backend endpoint: `POST /chatbot/context/refresh`
  - Request: `{"context": {systemName, irId, indexId, runId, commitId, selectedService, selectedEndpoint}}`
  - Response fields:
    - `success`
    - `refreshedArtifactCountsByType`
    - `unavailableProviders`
    - `refreshedAt`
    - `refreshVersion`
    - `message`
    - `staleContext`
- Current implementation behavior:
  - There is no persisted chatbot retrieval index yet.
  - Refresh validates/rebuilds provider-backed evidence in request scope and reports artifact counts and provider availability.
  - Missing active context returns actionable failure (`No active context identifiers were supplied...`).
- Frontend integration:
  - `ChatbotPanel` shows `Refresh context` when active context exists.
  - Refresh result and provider failures are visible in-panel.
  - Local stale-context indicator is set on refresh failures and cleared on successful non-stale refresh.
