# AridNova MVP Pipeline — Agent Instructions

## Architecture at a glance

Multi-service platform: React 18 frontend, Java backend, and Python microservices for formal verification / vector generation / scenario / test generation, plus the Aegis neuro-symbolic engine. All orchestrated via `docker-compose.yaml` at this repo's root. That file is the source of truth — trust it over prose when ports or service names diverge.

## Running everything

```
docker-compose up --build        # start full platform (first run downloads images)
docker-compose down              # stop everything
docker-compose build <svc>       # rebuild one service
```

Frontend: `http://localhost:3000` | Backend API: `8080`. Full port map is in the compose file.

## Local dev (no Docker)

### Frontend (`frontend/`)
```
npm install && npm start          # CRA dev server on 3000
npm run build                     # production build
npm test                          # Jest; add --watchAll=false to run once
```

### Backend (`backend/`)
```
./mvnw clean package              # produces target/MVPBackend-0.0.1-SNAPSHOT.war
./mvnw test                       # run tests; -Dtest=ClassName#method for a single one
./mvnw spring-boot:run            # local dev

# Required: install the vendored library before any build
mvn install:install-file \
  -Dfile=cimet-extract-lib-1.1.1.jar \
  -DgroupId=edu.baylor.ecs \
  -DartifactId=cimet-extract-lib \
  -Dversion=1.1.1 \
  -Dpackaging=jar
```

### Python services (each in its own directory)
```
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port <port> --reload
```

| Service | Dir | Port |
|---|---|---|
| Formal Verifier | formalmethod/ | 9000 |
| Vector Generator | vectorgenerator/ | 8050 |
| Scenario Generator | scenariogenerator/ | 8040 |
| Test Generator | testgenerator/ | 8030 |
| Test Executor | testexecutor/ | 8010 |
| Aegis API + Dashboard | aegis/ | 8900 / 5600 |

## Cross-service communication — agents miss this

- **No centralized service registry.** Non-backend services are called via hardcoded `http://localhost:<port>` URLs in the frontend (`frontend/src/services/api.ts`). There is no env var that controls these. When adding a new service, update both `docker-compose.yaml` and those URLs.
- Backend and internal Python calls use **Docker Compose hostnames** (e.g., `cache_db`, `cloudhub_mongo`), not `localhost`.
- IDs between pipeline steps are **MongoDB ObjectIds as strings** — never integers.

## Pipeline flow (the real thing)

Frontend's `PipelinePage` in `frontend/src/components/pipeline/` orchestrates these HTTP calls:

1. `SystemInputCard` → backend `/ir/create` (repo clone + CIMET IR JSON → MariaDB/MongoDB)
2. `ComponentGenerateCard` → componentanalysis `:8060/component/create`
3. `VectorGenerateCard` → vectorgenerator `:8050/vectors/generate-all` (MongoDB-backed, ID = `index_id`)
4. `ScenarioGenerateCard` → scenariogenerator `:8040/scenarios/generate` (ID from step 3 feeds this)
5. `PromptGenerateCard` → `:8040/scenarios/prompts/generate`
6. `TestGenerateCard` → testgenerator `:8030/testsuites/generate` (LLM = OpenAI/Anthropic/Groq, configured in compose env vars)
7. `FormalVerifyCard` → formalmethod `:9000/verify`
8. `AegisCard` → aegis_api `:8900/analyze`

IDs thread between cards as MongoDB ObjectIds. If a pipeline step fails, check the upstream card returned the expected ID.

## Known constraints & gotchas

- Root `package.json` is a stub — **do not** treat this repo as a Node project.
- Backend Dockerfile installs `cimet-extract-lib-1.1.1.jar`. Local builds need the same `mvn install:install-file` step; different version of this jar = dependency failure.
- `componentanalysis/` uses `cimet-extract-lib-1.1.0.jar` — **not interchangeable** with backend's 1.1.1.
- Aegis images serve both `aegis_api` and `aegis_dashboard` via the same Docker image (compose `command:` picks the entrypoint). Adding Python deps for one means adding them for both.
- Test generator has an OpenAI key in compose — treat as leaked, rotate before sharing the repo.
- The visualization route (`/graph-visualize`) is a separate flow: IR JSON upload → `parsers/getData.ts` → react-force-graph 3D render.

## Existing instruction sources

This repo uses `CLAUDE.md` and `.devcontainer/devcontainer.json`. When adding new instructions, prefer updating one of those or this file rather than creating new ones — avoid duplication.
