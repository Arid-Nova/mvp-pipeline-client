# S12-M2 Demo Script: Evidence-Grounded Architecture and Dependency Q&A

## 1) Prerequisites (from S12-M1 + S12-M2)

- Docker + Docker Compose installed.
- Local repository checked out.
- Backend chatbot path configured for local runtime (`CHATBOT_PROVIDER=OLLAMA` by default in `docker-compose.yaml`).
- No cloud credentials are required for this demo path.

Useful local sample artifacts already in repo:
- `frontend/src/data/IR.json`
- `frontend/src/data/pipeline_ir.json`

## 2) Start Services

### Option A: Full local stack with local model runtime

```bash
docker compose --profile local-llm up --build backend frontend mariadb mongodb ollama
```

Then verify:

```bash
curl http://localhost:8080/chatbot/health
```

### Option B: Backend-only deterministic smoke (no live model required)

```bash
scripts/s12-m2-smoke.sh --mocked-only
```

This runs `ChatbotS12M2IntegrationTest` with a fake local model client.

## 3) Load/Select Sample IR and Graph Context

In UI (`http://localhost:3000`):

1. Open the pipeline/graph page.
2. Use existing sample timeline/data (backed by repository sample IR files above).
3. Select an active system/service context (for example `TrainTicket`, `order-service`).
4. Open Chatbot panel and confirm the active scope indicator is populated.
5. If needed, click `Refresh context` in Chatbot panel to re-validate retrieval artifacts.

## 4) Questions to Ask

### Architecture topology

Ask:
- `Explain architecture topology for order-service.`

Expected:
- Direct answer section is shown.
- Evidence citations are present (IR/architecture-oriented).
- Confidence is visible (`HIGH|MEDIUM|LOW|INSUFFICIENT_EVIDENCE`).

### Dependency path

Ask:
- `What depends on payment-service?`

Expected:
- Dependency-focused answer.
- Graph/dependency citations are present.
- If transitive path is mentioned, answer is qualified as inferred where applicable.

### Endpoint/service

Ask:
- `What does POST /orders do in order-service?`

Expected:
- Endpoint/service-grounded answer.
- Endpoint/service citation(s) include location hints (for example controller/method path).

### Unsupported/speculative

Ask:
- `Predict outages next quarter for services not in this system.`

Expected:
- Refusal/qualification path with `insufficient_evidence`.
- No fabricated architecture facts.
- Missing evidence/qualification notice is visible.

## 5) Validation Checklist

- Citations present for supported architecture/dependency/endpoint claims.
- Missing-evidence refusal appears for unsupported/speculative prompts.
- Confidence label is visible for each assistant response.
- Frontend does not call model runtime directly (browser only calls backend chatbot endpoints).

Local validation command:

```bash
scripts/validate-chatbot-local-only.sh
```

## 6) Optional HTTP Demo Calls (Backend Running)

```bash
curl -X POST http://localhost:8080/chatbot/query \
  -H "Content-Type: application/json" \
  -d '{
    "question":"What depends on payment-service?",
    "context":{"systemName":"TrainTicket","irId":"ir-1","selectedService":"payment-service"}
  }'
```

Check response fields:
- `answer`
- `citations`
- `confidence`
- `flags`
- `traceMetadata`
