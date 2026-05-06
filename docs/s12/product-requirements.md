# Local LLM Chatbot PRD for AridNova Analysis Outputs

## 1. Title

Local LLM Chatbot for Architecture-Grounded Q&A in AridNova / CloudHub Toolkit.

## 2. Status

Draft for Sprint S12 planning and implementation breakdown.

## 3. Problem Statement

AridNova produces high-value analysis artifacts (IR, architecture graph, dependencies, verification findings, scenarios, test outputs, and risk analysis), but users must manually inspect multiple cards, views, and service outputs to answer operational questions. This increases time-to-insight, creates interpretation inconsistency, and can cause missed risks.

A local, evidence-grounded chatbot is needed to provide fast, explainable answers from existing AridNova outputs without requiring cloud LLM dependency.

## 4. Target Users and Personas

| Persona | Primary Jobs | Pain Points Today | Chatbot Outcome |
|---|---|---|---|
| Security Engineer | Investigate policy drift and risk findings | Cross-checking Aegis, verification, and change impact manually | One place to ask risk and verification questions with cited evidence |
| Backend Engineer | Understand service dependencies and endpoint behavior | Navigating graph and IR details across views | Direct dependency and endpoint Q&A with references |
| QA/Test Engineer | Derive and prioritize tests after architecture changes | Mapping change impact to scenarios/tests is manual | Recommended "what should I test" answers grounded in artifacts |
| Architect/Tech Lead | Assess architecture quality and evolution | Consolidating outputs from many cards is time-consuming | High-level summaries with drill-down citations |
| Product/Program Stakeholder | Track impact and release risk | Hard to interpret technical outputs | Qualified, evidence-linked status answers |

## 5. Goals

- Reduce median time to answer analysis questions by at least 40% versus manual navigation baseline.
- Provide evidence-grounded answers with explicit citations to AridNova artifacts for at least 95% of supported question types.
- Operate fully in local-only inference mode using an open local model endpoint.
- Improve user confidence by clearly qualifying uncertainty and refusing unsupported claims.

## 6. Non-Goals

- No autonomous code modification or repository write actions by the chatbot.
- No replacement of existing pipeline cards or graph visualization.
- No cloud LLM requirement for core chatbot operation.
- No natural-language-to-pipeline auto-execution in initial release.
- No general internet search or external knowledge grounding in initial release.
- No production-blocking decisions made solely by chatbot output without human review.

## 7. Scope

### In Scope

- Embedded chatbot UI in AridNova frontend.
- Backend chatbot API that orchestrates retrieval + local model inference.
- Evidence retrieval from existing AridNova outputs.
- Citation and confidence/qualification behavior.
- Local model provider abstraction for Ollama, llama.cpp server, or OpenAI-compatible local endpoint.

### Out of Scope

- New architecture analysis engines.
- New risk models beyond existing service outputs.
- Fine-tuning custom foundation models in this phase.

## 8. User Value Proposition

Terminology note: This document uses `Local LLM Chatbot` and `Architecture-Grounded Assistant` as equivalent capability names; responses are expected to be evidence-grounded answers built from retrieval context and displayed with a confidence label.

Users can ask architecture and analysis questions in natural language and receive fast, evidence-cited, locally generated answers that are traceable to AridNova artifacts, reducing manual cross-tool effort while improving decision quality.

## 9. Functional Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-001 | Ask architecture questions | Must | Given loaded project artifacts, when user asks architecture topology question, then chatbot returns answer with at least one citation to IR/graph evidence. |
| FR-002 | Ask dependency questions | Must | Given dependency data exists, when user asks "what depends on X", then chatbot returns dependent services/endpoints and cites graph/IR evidence. |
| FR-003 | Ask verification/finding questions | Must | Given verification results exist, when user asks findings question, then chatbot summarizes finding status and cites verification output. |
| FR-004 | Ask change impact questions | Must | Given delta output exists, when user asks impact question, then chatbot references changed entities and downstream effects with citations. |
| FR-005 | Ask risk questions | Must | Given Aegis output exists, when user asks risk question, then chatbot reports risk/vulnerability indicators and cites risk artifacts. |
| FR-006 | Ask endpoint/service questions | Must | Given component/endpoint index exists, when user asks endpoint/service behavior question, then chatbot answers using indexed data and cites source artifacts. |
| FR-007 | Ask "what changed?" questions | Must | Given multiple IR versions or delta data, when asked, chatbot returns concise before/after summary with evidence. |
| FR-008 | Ask "what should I test?" questions | Must | Given scenarios/tests/change impact artifacts, chatbot recommends test focus areas with references to changed/risky components. |
| FR-009 | Evidence citation in every supported answer | Must | For supported intents, chatbot includes citation list mapping claims to IR/graph/verification/scenario/test/risk artifacts. |
| FR-010 | Missing evidence handling | Must | If required evidence is absent, chatbot explicitly states missing sources and either refuses or provides clearly qualified partial answer. |
| FR-011 | Local-only model inference support | Must | Chatbot functions without cloud model credentials using configured local model endpoint. |
| FR-012 | Session context binding | Should | Chatbot can answer relative to active system/project/session artifacts selected in frontend. |
| FR-013 | Follow-up question continuity | Should | Chatbot supports short conversational follow-ups while preserving citation discipline. |
| FR-014 | Deterministic evidence mode | Should | Optional strict mode: answer only from retrieved evidence chunks; refuse unsupported inference. |

## 9.1 Canonical Requirement ID Mapping

To support end-to-end traceability across PRD, stories, backlog, release milestones, and JIRA imports, each major functional requirement is assigned a canonical `LLM-REQ-*` ID while preserving existing `FR-*` IDs.

| Canonical ID | Existing ID | Requirement Summary |
|---|---|---|
| LLM-REQ-001 | FR-001 | Ask architecture questions |
| LLM-REQ-002 | FR-002 | Ask dependency questions |
| LLM-REQ-003 | FR-003 | Ask verification/finding questions |
| LLM-REQ-004 | FR-004 | Ask change impact questions |
| LLM-REQ-005 | FR-005 | Ask risk questions |
| LLM-REQ-006 | FR-006 | Ask endpoint/service questions |
| LLM-REQ-007 | FR-007 | Ask "what changed?" questions |
| LLM-REQ-008 | FR-008 | Ask "what should I test?" questions |
| LLM-REQ-009 | FR-009 | Evidence citation in every supported answer |
| LLM-REQ-010 | FR-010 | Missing evidence handling |
| LLM-REQ-011 | FR-011 | Local-only model inference support |
| LLM-REQ-012 | FR-012 | Session context binding |
| LLM-REQ-013 | FR-013 | Follow-up question continuity |
| LLM-REQ-014 | FR-014 | Deterministic evidence mode |


## 10. Non-Functional Requirements

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-001 | Latency | 95th percentile response time for standard queries | <= 8 seconds on recommended local setup |
| NFR-002 | Availability | Chatbot API uptime while platform services healthy | >= 99% in local deployment sessions |
| NFR-003 | Reliability | Error rate for handled requests | < 2% excluding upstream service outages |
| NFR-004 | Explainability | Citation coverage for supported intents | >= 95% of answers include citations |
| NFR-005 | Security | No direct browser-to-model calls | 100% via backend API |
| NFR-006 | Portability | Runtime configuration via environment variables | 100% model/runtime config env-driven |
| NFR-007 | Observability | Structured logs for query, retrieval, and generation pipeline | Enabled by default in backend service |

## 11. Local LLM Requirements

- System shall support local runtime endpoints including:
  - Ollama HTTP API.
  - llama.cpp server API.
  - OpenAI-compatible local API endpoints.
- System shall not require OpenAI, Anthropic, Groq, or other cloud providers for this feature.
- Model/runtime configuration shall be environment-driven (base URL, model ID, timeout, max tokens, temperature, context window hints).
- Frontend shall never call model runtime directly; frontend calls AridNova backend chatbot endpoints only.
- Docker Compose deployment should include optional chatbot service and optional local model service profile.
- If local model endpoint is unavailable, chatbot returns actionable local-runtime error message without crashing frontend.

## 12. Retrieval-Augmented Generation Requirements

- Backend shall implement retrieval before generation for supported question intents.
- Retrieval corpus shall include normalized artifacts from IR, graph, verification, scenarios, tests, change impact, and Aegis outputs.
- Retrieval shall preserve metadata: artifact type, source path/id, timestamp/version, and entity identifiers.
- Pipeline shall support hybrid retrieval strategy:
  - Structured lookup for exact entity queries (service, endpoint, IR ID).
  - Semantic retrieval for explanatory questions.
- Retrieved context shall be bounded by token budget with deterministic truncation strategy.
- Generation prompt shall include explicit instruction to ground claims only in provided evidence.

## 13. Evidence Grounding Requirements

- Responses shall distinguish evidence-backed facts from recommendations or inferred guidance, with recommendations explicitly labeled.
- Every substantive claim in supported answers must map to at least one evidence item.
- Citation block shall include, at minimum:
  - Artifact type.
  - Artifact identifier (ID/name/version).
  - Location hint (field, node/service/endpoint, or result section).
- Unsupported claim detection:
  - If no evidence found, assistant must refuse or qualify with "insufficient evidence".
- Contradictory evidence handling:
  - Assistant must surface conflict and list conflicting sources rather than collapsing to one side silently.
- Evidence freshness:
  - Assistant should indicate if answer is based on latest run artifacts or historical artifacts.

## 14. UI/UX Requirements

- Provide chatbot entry point in primary frontend workflow (pipeline/analysis context).
- Support context indicator showing active project/system and artifact scope.
- Answer card shall visually separate:
  - Direct answer.
  - Evidence citations.
  - Confidence/qualification notices.
- Provide explicit "missing evidence" and "service unavailable" states.
- Provide copy/export for answer + citations.
- Preserve usability on standard desktop viewport; degrade gracefully on smaller screens.

## 15. Backend/API Requirements

- Introduce backend chatbot API surface (example contract):
  - `POST /chatbot/query` for question answering.
  - `GET /chatbot/health` for runtime/model availability.
  - `POST /chatbot/context/refresh` to rebuild/refresh retrieval corpus from current artifacts.
- Backend shall orchestrate:
  - Context assembly from existing services/data stores.
  - Retrieval and ranking.
  - Prompt construction.
  - Local model invocation.
  - Citation packaging.
- API response must include:
  - Final answer text.
  - Structured citations array.
  - Qualification flags (`partial`, `insufficient_evidence`, `stale_context`, etc.).
  - Trace metadata (`request_id`, processing time, model used).
- API shall enforce request validation and safe limits (question length, timeout, max citations).

## 16. Data Sources

Primary evidence sources for chatbot answers:

- IR JSON and IR history from backend IR APIs and stored IR artifacts.
- Reconstructed graph data (services, nodes, links, metadata, anti-pattern labels).
- Component and endpoint extraction outputs.
- Formal verification result outputs.
- Scenario generation outputs and prompt artifacts.
- Generated test suites and available execution summaries.
- Change impact/delta outputs.
- Aegis risk analysis outputs.

Each source should be versioned or timestamped in retrieval metadata when available.

## 17. Privacy and Security Requirements

- Source code and IR artifacts used for chatbot grounding shall remain local to the deployment environment by default.
- Prompt assembly shall occur locally within AridNova backend services.
- Model inference calls shall target a configured local endpoint (for example Ollama, llama.cpp server, or compatible local API).
- Default operation shall be local-network/local-host oriented.
- No mandatory outbound transfer of user artifacts to third-party LLM APIs.
- Secrets (if any optional providers exist) must be environment-based and not exposed to frontend.
- Query and answer logs shall be configurable; sensitive content logging should be disable-able.
- CORS and service auth boundaries must be explicitly configured for chatbot endpoints.

## 18. Failure Modes and Guardrails

| Failure Mode | Expected Behavior | Guardrail |
|---|---|---|
| Local model unreachable | Return non-200 with actionable remediation | Health check + explicit error classification |
| Retrieval returns no relevant evidence | Refuse/qualify answer | `insufficient_evidence` flag + missing sources list |
| Contradictory artifacts | Present conflict clearly | Conflict summary with dual citations |
| Upstream analysis service unavailable | Partial response or fail with diagnostics | Source-level availability indicators |
| Oversized context/token overflow | Truncate deterministically and disclose | Retrieval budget policy + truncation notice |
| Hallucination risk in open-ended prompt | Constrain answer to evidence | System prompt guardrails + citation requirement |

## 19. Success Metrics

| Metric | Definition | Target |
|---|---|---|
| Time-to-Insight | Median time from question to usable answer | >= 40% improvement vs baseline manual workflow |
| Citation Coverage | % supported answers containing citations | >= 95% |
| Evidence Accuracy | % evaluated answers with correct citation-claim mapping | >= 90% |
| Qualified Refusal Correctness | % unsupported questions correctly refused/qualified | >= 95% |
| Local-Only Operability | % sessions working without cloud credentials | 100% |
| User Satisfaction | Post-session rating for relevance/trust | >= 4.0/5 |

## 20. Open Questions

- Which backend service should own chatbot orchestration (extend `backend/` vs new dedicated service)?
- Should retrieval index be rebuilt on every pipeline run or incrementally updated per artifact?
- What is the canonical evidence schema across heterogeneous outputs (IR/graph/verification/risk)?
- What minimum local hardware profile is required for acceptable latency?
- Should strict evidence-only mode be default or opt-in?
- What retention policy should apply to chat history and cached retrieval documents?

## 21. Traceability to Existing MVP Stories

| PRD Requirement Area | Existing MVP Capability Touchpoint | Existing Evidence in Repo |
|---|---|---|
| Architecture/dependency Q&A | Graph visualization and node/link metadata | `frontend/src/components/graph/GraphWrapper.tsx`, `frontend/src/components/graph/NodeInfoBox.tsx` |
| IR-grounded answers | IR create/read/meta/delta flow | `frontend/src/services/api.ts`, `backend/.../api/ir/IRController.java` |
| Verification Q&A | Formal verification execution | `formalmethod/app/main.py`, `frontend/src/components/pipeline/cards/FormalVerifyCard*` |
| Change impact Q&A | Delta retrieval and pipeline card integration | `frontend/src/services/api.ts` (`fetchChangeImpact`), backend `/ir/delta` |
| Endpoint/service Q&A | Component and endpoint extraction/indexing | `componentanalysis/.../ComponentController.java` |
| Scenario/test guidance Q&A | Scenario/prompt/test generation chain | `scenariogenerator/app/main.py`, `testgenerator/app/main.py` |
| Risk Q&A | Aegis analysis service | `aegis/service.py` and pipeline Aegis card integration |
| Local service orchestration constraints | Multi-service compose topology | `docker-compose.yaml` |

## Repository Fit Analysis

### Source Inspection Summary

- `Arid-Nova-description.txt` in repository root: not found.
- `docs/Arid-Nova-description.txt`: not found.
- Frontend targets inspected:
  - `frontend/src/App.tsx`
  - `frontend/src/components/pipeline/PipelinePage.tsx`
  - `frontend/src/components/pipeline/pipelineConfig.tsx`
  - `frontend/src/components/graph/GraphWrapper.tsx`
  - `frontend/src/components/graph/NodeInfoBox.tsx`
  - `frontend/src/services/api.ts`
- Backend/service folders inspected (present):
  - `backend/`
  - `repomanager/`
  - `componentanalysis/`
  - `formalmethod/`
  - `vectorgenerator/`
  - `scenariogenerator/`
  - `testgenerator/`
  - `aegis/`
- Additional runtime boundary file inspected:
  - `docker-compose.yaml`

### Current Product Capabilities Relevant to a Chatbot

- IR lifecycle and historical timeline are already available via frontend + backend IR APIs (`/ir/create`, `/ir`, `/ir/meta`, `/ir/delta`) in:
  - `frontend/src/services/api.ts`
  - `backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/ir/IRController.java`
- Pipeline-first orchestration exists with cards for IR generation/upload, component extraction, vector generation, scenario generation, prompt generation, test generation, formal verification, change impact, policy drift, and Aegis analysis in:
  - `frontend/src/components/pipeline/PipelinePage.tsx`
  - `frontend/src/components/pipeline/pipelineConfig.tsx`
- Architecture graph visualization and node/link detail exploration exists, including anti-pattern and dependency context, in:
  - `frontend/src/components/graph/GraphWrapper.tsx`
  - `frontend/src/components/graph/NodeInfoBox.tsx`
- Formal verification service endpoint exists (`/verify`) in:
  - `formalmethod/app/main.py`
- Component index generation endpoint exists (`/component/create`) in:
  - `componentanalysis/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPComponents/api/component/ComponentController.java`
- Role/auth vector generation exists (`/vectors/generate-all`) in:
  - `vectorgenerator/app/main.py`
- Scenario and prompt generation exists (`/scenarios/generate`, `/scenarios/prompts/generate`) in:
  - `scenariogenerator/app/main.py`
- LLM-backed test generation exists (`/testsuites/generate`) in:
  - `testgenerator/app/main.py`
- Aegis risk analysis endpoint exists (`/analyze`) in:
  - `aegis/service.py`

### Likely Frontend Integration Points

- Main app routing and shared state entrypoint for a chatbot panel/drawer:
  - `frontend/src/App.tsx`
- Pipeline surface to attach context-aware assistant actions (card-level helper, run explanation, next-step guidance):
  - `frontend/src/components/pipeline/PipelinePage.tsx`
  - `frontend/src/components/pipeline/pipelineConfig.tsx`
- Graph surface for node/link-grounded Q&A ("why flagged", "what depends on this", "what changed"):
  - `frontend/src/components/graph/GraphWrapper.tsx`
  - `frontend/src/components/graph/NodeInfoBox.tsx`
- Existing API abstraction to add chatbot endpoints without scattering calls:
  - `frontend/src/services/api.ts`

### Likely Backend/Service Integration Points

- Core system/IR truth source and change impact:
  - `backend/.../api/ir/IRController.java`
- Graph instances and graph retrieval APIs:
  - `backend/.../api/graph/GraphController.java`
- Repo-level ingestion/context summarization path:
  - `repomanager/app/main.py`
- Component index and endpoint extraction:
  - `componentanalysis/.../ComponentController.java`
- Verification reasoning results:
  - `formalmethod/app/main.py`
- Vector/scenario/prompt/test generation chain:
  - `vectorgenerator/app/main.py`
  - `scenariogenerator/app/main.py`
  - `testgenerator/app/main.py`
- Risk and vulnerability reasoning:
  - `aegis/service.py`

### Data Sources the Chatbot Should Answer From

- IR JSON and historical IR timeline:
  - Backend `/ir` and `/ir/meta` responses, plus uploaded IR paths in `frontend/src/App.tsx`
- Graph topology and node/link metadata:
  - Graph payloads consumed by `frontend/src/components/graph/*`
- Verification results and inconsistency findings:
  - `formalmethod` `/verify` responses and pipeline verification card state
- Scenario artifacts and generated prompts:
  - `scenariogenerator` `/scenarios/generate` and `/scenarios/prompts/generate`
- Test generation outputs and execution outcomes:
  - `testgenerator` `/testsuites/generate`
  - `testexecutor/app/main.py` execution endpoints (`/api/execute/*`) where present
- Change impact / delta output:
  - Backend `/ir/delta` integration (`fetchChangeImpact` in `frontend/src/services/api.ts`)
- Aegis risk analysis output:
  - `aegis/service.py` `/analyze` and related Aegis data artifacts

### Risks and Constraints

- Hardcoded local service URLs are pervasive in frontend API calls (`http://localhost:9000`, `8060`, `8050`, `8040`, `8030`, `8900`, `8080`, `8020`) in `frontend/src/services/api.ts`; chatbot integration must avoid adding more hardcoded endpoints.
- Docker Compose service boundaries are explicit and multi-container (`backend`, `formalmethod`, `componentanalysis`, `vectorgenerator`, `scenariogenerator`, `testgenerator`, `testexecutor`, `repohandler`, `aegis_api`, data stores) in `docker-compose.yaml`; chatbot orchestration should respect these boundaries and avoid bypassing service ownership.
- Existing services have mixed CORS policies and origins (some strict localhost lists, some wildcard), which can constrain chatbot UI/API placement.
- Avoiding cloud LLM dependency is a key product constraint for this feature. Current stack already includes cloud-oriented environment settings (for example OpenAI/Azure-style variables in `docker-compose.yaml` for `testgenerator` and `repohandler`), so chatbot design should explicitly support local model hosting/inference and degrade gracefully when cloud credentials are absent.
- Data freshness and provenance risk: pipeline state uses in-memory/session storage patterns (`frontend/src/components/pipeline/PipelinePage.tsx`), so chatbot answers should indicate source and recency (latest run vs historical cached state).
