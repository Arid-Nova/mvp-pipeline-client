# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

AridNova / "cloudhub-toolkit" is a multi-service platform for analyzing distributed microservice systems: 3D architecture visualization (CIMET-IR), formal authorization-policy verification, LLM-driven authorization test generation, and a neuro-symbolic risk introspection engine (Aegis). Everything runs together via `docker-compose.yaml` at the repo root — there is no top-level orchestrator beyond Compose.

The repo's root `package.json` is a near-empty stub; do not treat the root as a Node project. Each service is its own self-contained build.

## Running everything

`docker-compose up --build` from the repo root brings up the full toolkit. Frontend is at `http://localhost:3000`, backend at `8080`. See README.md for the full port map and database connection strings (MariaDB on 3306, MongoDB on 27017, Neo4j on 7474/7687).

`dockerpush.sh` pushes prebuilt images to Docker Hub under the `cloudhub` org.

## Services and their ports

The compose file is the source of truth. Cross-service calls are hardcoded to `localhost:<port>` in the frontend (`frontend/src/services/api.ts`) and to compose hostnames (`cache_db`, `cloudhub_mongo`, `aegis_neo4j`) inside backends. When adding or moving a service, update both compose and the frontend's hardcoded URLs.

| Container | Path | Stack | Port |
|---|---|---|---|
| `cloudhub_frontend` | `frontend/` | React 18 + TypeScript + Tailwind (CRA) | 3000 |
| `cloudhub_backend` | `backend/` | Spring Boot 3.2 / Java 21 (war) | 8080 |
| `cloudhub_components` | `componentanalysis/` | Spring Boot / Java (cimet-extract-lib) | 8060 |
| `cloudhub_formalverifier` | `formalmethod/` | Python FastAPI | 9000 |
| `cloudhub_vectorgenerator` | `vectorgenerator/` | Python FastAPI + MongoDB | 8050 |
| `cloudhub_scenariogenerator` | `scenariogenerator/` | Python FastAPI + MongoDB | 8040 |
| `cloudhub_testgenerator` | `testgenerator/` | Python FastAPI + LLM clients | 8030 |
| `cloudhub_testexecutor` | `testexecutor/` | Python FastAPI | 8010 |
| `aegis_api` | `aegis/` (uvicorn `service:app`) | FastAPI + Neo4j | 8900 |
| `aegis_dashboard` | `aegis/` (flask `frontend.py`) | Flask UI | 5600 |

The `aegis/` directory builds one image used as both `aegis_api` and `aegis_dashboard` — the `command:` in compose decides which entrypoint runs.

## Pipeline architecture

The frontend's `PipelinePage` (`frontend/src/components/pipeline/`) is a visual node-based canvas that orchestrates the analysis pipeline by chaining HTTP calls to the services above. The canonical flow:

1. `SystemInputCard` → backend `/ir/create` (Spring) clones a repo and runs CIMET to produce IR JSON, persisted to MariaDB/MongoDB.
2. `ComponentGenerateCard` → componentanalysis `:8060/component/create` extracts components/endpoints.
3. `VectorGenerateCard` → vectorgenerator `:8050/vectors/generate-all` produces authorization vectors (MongoDB-backed by `indexId`).
4. `ScenarioGenerateCard` → scenariogenerator `:8040/scenarios/generate` produces scenarios from `(index_id, vectors_id)`.
5. `PromptGenerateCard` → `:8040/scenarios/prompts/generate` materializes LLM prompts.
6. `TestGenerateCard` → testgenerator `:8030/testsuites/generate` runs the chosen LLM (`llm_model` selects between OpenAI / Anthropic / Groq, configured via env in compose).
7. `FormalVerifyCard` → formalmethod `:9000/verify` runs solver-based policy verification.
8. `AegisCard` → aegis_api `:8900/analyze` runs neuro-symbolic risk analysis.
9. `ChangeImpactCard` → backend `:8080/ir/delta` computes delta between two IR snapshots.

IDs threaded between cards (`indexId`, `vectorsId`, scenario IDs) are MongoDB document IDs. When debugging a broken pipeline step, check the upstream card actually returned the ID the next step expects.

The visualization side (`/graph-visualize` route) is a separate flow: parse an IR JSON (uploaded or fetched from `/ir` history) → `parsers/getData.ts` → 3D force graph via `react-force-graph`.

## Frontend specifics

- All `axios` calls go through `setupAxios()` in `frontend/src/utils/axiosSetup.tsx`, which sets `axios.defaults.baseURL = "http://localhost:8080"`. Anything calling a non-backend service uses raw `fetch` with a hardcoded `http://localhost:<port>` URL — see `frontend/src/services/api.ts` for the full list. There is no centralized service-URL config.
- Routes are declared in `frontend/src/App.tsx`; the default redirect lands on `/pipeline`.
- Build/test from `frontend/`:
  - `npm install`
  - `npm start` — dev server on 3000
  - `npm run build` — production build (Docker image serves `build/` via `http-server`)
  - `npm test` — react-scripts/Jest in watch mode; `npm test -- --watchAll=false <pattern>` to run once or filter.

## Backend (Spring) specifics

- Build with the Maven wrapper from `backend/`:
  - `./mvnw clean package` — produces `target/MVPBackend-0.0.1-SNAPSHOT.war`
  - `./mvnw test` — full test suite; `./mvnw test -Dtest=ClassName#method` for a single test
  - `./mvnw spring-boot:run` — local run (expects MariaDB on `cache_db:3306`, override `SPRING_DATASOURCE_URL` for localhost)
- Depends on `cimet-extract-lib-1.1.1.jar` (vendored at `backend/cimet-extract-lib-1.1.1.jar`). The Dockerfile installs it into the Maven local repo before `mvn package`. For local builds, run the same `mvn install:install-file` step the Dockerfile uses, or you'll get an unresolved dependency.
- Package layout: `edu.baylor.ecs.cloudhubs.mvp.MVPBackend.{api,persistence,config}`. Controllers under `api/ir` and `api/graph` mount at `/ir/*` and `/graph/*`. Persistence is split between JPA (MariaDB, IR storage) and MongoDB (graph state).
- `componentanalysis/` mirrors this layout but with `cimet-extract-lib-1.1.0.jar` — the two jars are not interchangeable; respect the version each module pins.

## Python services

Each of `formalmethod/`, `vectorgenerator/`, `scenariogenerator/`, `testgenerator/`, `testexecutor/` is a FastAPI app under `app/main.py`. Pattern:

- `pip install -r requirements.txt`
- `uvicorn app.main:app --host 0.0.0.0 --port <service-port> --reload` for local dev (use the port from the table above)

`aegis/` is shaped differently: `service.py` is the FastAPI API and `frontend.py` is a Flask dashboard, both in the same image. Source modules are under `aegis/src/` (`analysis/`, `calculus/`, `domain/`, `services/`, plus `ahp_calculator.py` and `config_loader.py`); config files live in `aegis/configs/`.

LLM credentials for `testgenerator` are passed via `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GROQ_API_KEY` env vars in compose. **Note: the compose file currently has a real-looking OpenAI key checked in — treat it as a leaked secret and rotate before sharing the repo.**

## Conventions worth knowing

- Cross-service IDs are MongoDB ObjectIds passed as strings; do not assume integer IDs anywhere in the pipeline.
- The frontend's pipeline canvas validates connections against `pipelineConfig.tsx` (`VALID_CONNECTIONS`); when adding a card type, register it there or the edge will be rejected silently in the UI.
- The Aegis dashboard and API share the same image and `requirements.txt`; if you add a Python dep for one, it lands in both.
