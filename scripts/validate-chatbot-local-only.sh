#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/4] Validating chatbot backend config is local-only by default..."
if ! rg -n "chatbot:" backend/src/main/resources/application.yml >/dev/null; then
  echo "ERROR: chatbot config block not found in backend/src/main/resources/application.yml"
  exit 1
fi
if ! rg -n "provider:\\s*\\$\\{CHATBOT_PROVIDER:OLLAMA\\}" backend/src/main/resources/application.yml >/dev/null; then
  echo "ERROR: CHATBOT_PROVIDER default is not OLLAMA in backend application.yml"
  exit 1
fi

echo "[2/4] Ensuring chatbot backend path does not require cloud credential env vars..."
if rg -n "OPENAI_API_KEY|ANTHROPIC_API_KEY|GROQ_API_KEY" \
  backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/api/chatbot \
  backend/src/main/java/edu/baylor/ecs/cloudhubs/mvp/MVPBackend/config/ChatbotConfig.java \
  backend/src/main/resources/application.yml >/dev/null; then
  echo "ERROR: Cloud credential reference found in chatbot backend path"
  exit 1
fi

echo "[3/4] Ensuring frontend chatbot path uses backend endpoints only..."
if ! rg -n "axios\\.get\\('/chatbot/health'\\)|axios\\.post\\('/chatbot/query'" frontend/src/services/api.ts >/dev/null; then
  echo "ERROR: Frontend chatbot API helper is not using backend /chatbot endpoints"
  exit 1
fi
if rg -n "http://[^\"']*11434|ollama|llama\\.cpp|/v1/chat/completions|api\\.openai\\.com|api\\.anthropic\\.com|api\\.groq\\.com" \
  frontend/src/components/chatbot frontend/src/services/api.ts \
  --glob '!**/*.test.*' >/dev/null; then
  echo "ERROR: Direct model runtime/cloud provider reference found in frontend chatbot path"
  exit 1
fi

echo "[4/4] Ensuring chatbot query flow wiring exists..."
if ! rg -n "sendChatbotQuery\\(" frontend/src/components/chatbot/useChatbotState.ts >/dev/null; then
  echo "ERROR: Chatbot UI is not wired to sendChatbotQuery"
  exit 1
fi

echo "PASS: S12-M1 local-only chatbot validation passed."
