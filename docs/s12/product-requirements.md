# Product Requirements - Local LLM Chatbot / Architecture-Grounded Assistant

This document defines product requirements for the AridNova Local LLM Chatbot capability, focused on architecture-grounded assistance.

## Document Control

| Field | Value |
|---|---|
| Feature | Local LLM Chatbot / Architecture-Grounded Assistant |
| Product Area | AridNova MVP Pipeline Client |
| Status | Draft |
| Owner | TBC |
| Last Updated | TBC |

## Problem Statement

- Current pain points: TBC
- Target user outcomes: TBC
- Business impact: TBC

## Goals

- Primary goals:
  - TBC
- Secondary goals:
  - TBC

## Non-Goals

- TBC

## Users and Stakeholders

| Role | Needs | Notes |
|---|---|---|
| End User | TBC | TBC |
| Engineering | TBC | TBC |
| Product | TBC | TBC |

## Scope

### In Scope

- TBC

### Out of Scope

- TBC

## Functional Requirements

| ID | Requirement | Priority | Notes |
|---|---|---|---|
| FR-001 | TBC | High | TBC |
| FR-002 | TBC | Medium | TBC |

## Non-Functional Requirements

| Category | Requirement | Target |
|---|---|---|
| Performance | TBC | TBC |
| Reliability | TBC | TBC |
| Security | TBC | TBC |
| Privacy | TBC | TBC |

## Data and Context Sources

- Architecture knowledge inputs: TBC
- Metadata/index sources: TBC
- Refresh/update approach: TBC

## Constraints and Dependencies

- Technical constraints: TBC
- Team/process dependencies: TBC
- External dependencies: TBC

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| TBC | TBC | TBC |

## Success Metrics

| Metric | Baseline | Target | Measurement Method |
|---|---|---|---|
| TBC | TBC | TBC | TBC |

## Open Questions

- TBC

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
