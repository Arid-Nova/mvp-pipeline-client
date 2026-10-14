# Chatbot Backend

Standalone Spring Boot service for chatbot APIs. This module is intentionally separate from the main `backend` service and does not depend on that module. Shared contracts can be added later through a dedicated shared module if needed.

## Run Locally

```sh
mvn -f chatbot-backend/pom.xml spring-boot:run
```

The service starts on port `8081` by default.

## Health Check

```sh
curl http://localhost:8081/chatbot/health
```

## Pipeline intent selection

`POST /chatbot/pipeline/intents` (Issue #60) asks the local model which **analyses** fit a user's goal. It performs **intent selection only**: the model returns three intent options (focused, balanced, comprehensive), each naming analysis capabilities from the catalog the frontend sends. The model never produces pipeline graphs, nodes, edges, prerequisites, IDs, positions, configuration, or a summary.

The backend only validates the request, builds the prompt from `catalog` (cards with `isAnalysis: true`), calls the model, extracts the JSON tolerantly, and shape-checks it. The returned options are **untrusted**. The frontend parses and normalizes them, composes each pipeline deterministically, and validates it structurally before showing anything; unknown capability IDs pass through here and are rejected there.

```sh
curl -s http://localhost:8081/chatbot/pipeline/intents \
  -H 'Content-Type: application/json' \
  -d '{
    "goal": "I want to visualize the architecture and check authorization problems.",
    "suggestionSetId": "3f2b8c1e-9a4d-4e6f-b1c2-7d8e9f0a1b2c",
    "attempt": 1,
    "catalogVersion": "pcat-0861a6885a178a",
    "catalog": { "catalogVersion": "pcat-0861a6885a178a", "cards": [ { "cardType": "VISUALIZATION", "title": "System Visualization", "category": "Visualization", "purpose": "…", "outcome": "…", "isAnalysis": true } ] },
    "excludeCapabilitySets": [],
    "rejectionFeedback": []
  }'
```

In the app, `catalog` is the full output of the frontend's `buildPipelineCapabilityCatalog()`. Response:

```json
{
  "outcome": "OK",
  "suggestionSetId": "3f2b8c1e-9a4d-4e6f-b1c2-7d8e9f0a1b2c",
  "requestId": "…",
  "catalogVersion": "pcat-0861a6885a178a",
  "options": [
    { "tier": "focused", "title": "System View", "rationale": "…", "analysisCardTypes": ["VISUALIZATION", "FORMAL_VIZ"] },
    { "tier": "balanced", "title": "…", "analysisCardTypes": ["…"] },
    { "tier": "comprehensive", "title": "…", "analysisCardTypes": ["…"] }
  ],
  "parseErrors": [],
  "unsupportedReason": null,
  "model": "llama3.2",
  "provider": "OLLAMA",
  "processingTimeMs": 9091
}
```

| Situation | HTTP | `outcome` |
|---|---|---|
| Model returned usable-looking options | 200 | `OK` |
| Unusable model output (prose, malformed or truncated JSON, no well-shaped option) | 200 | `INVALID_MODEL_OUTPUT` (see `parseErrors`) |
| Model says the goal can't be served (`options: []` + `unsupportedReason`) | 200 | `UNSUPPORTED_GOAL` |
| Model runtime unreachable, erroring, or timed out | 503 | `MODEL_UNAVAILABLE` |
| Invalid request (blank or >1000-char goal, bad UUID, attempt not 1–2, missing or oversized catalog, oversized retry lists) | 400 | — |

On the frontend's single retry (`attempt: 2`), `rejectionFeedback` (≤ 20 lines of ≤ 200 characters) and `excludeCapabilitySets` (≤ 6 sets of ≤ 6 IDs) are added to the prompt as capability/profile-level guidance; graph-wiring feedback is never forwarded.

**Model and settings.** The reference model is `llama3.2` on Ollama (`CHATBOT_MODEL`, `CHATBOT_BASE_URL`), with the measured intent prompt v2 and JSON mode. Ollama must be running with the model pulled:

```sh
docker compose --profile local-llm up ollama
docker exec cloudhub_ollama ollama pull llama3.2
```

The first call after a model load is much slower; warm the model once before demos or measurements. These properties apply to this endpoint only, so `/chatbot/query` keeps its own settings:

| Property | Environment variable | Default |
|---|---|---|
| `chatbot.pipeline-intent.max-tokens` (Ollama `num_predict`) | `CHATBOT_PIPELINE_INTENT_MAX_TOKENS` | `512` |
| `chatbot.pipeline-intent.temperature` | `CHATBOT_PIPELINE_INTENT_TEMPERATURE` | `0.4` |
| `chatbot.pipeline-intent.timeout-ms` (per call) | `CHATBOT_PIPELINE_INTENT_TIMEOUT_MS` | `75000` |
| `chatbot.pipeline-intent.context-tokens` (Ollama `num_ctx`) | `CHATBOT_PIPELINE_INTENT_CONTEXT_TOKENS` | `4096` |

OpenAI-compatible runtimes get `response_format: {"type": "json_object"}`; llama.cpp gets no JSON mode and relies on tolerant extraction. Logs contain operational metadata only (request and suggestion-set IDs, attempt, outcome, counts, latency, model); never the goal, prompt, or model output.

## Test

```sh
mvn -f chatbot-backend/pom.xml test
```

## Docker

```sh
docker build -t chatbot-backend ./chatbot-backend
docker run --rm -p 8081:8081 chatbot-backend
```
