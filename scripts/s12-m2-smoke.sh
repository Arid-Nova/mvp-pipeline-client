#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'EOF'
S12-M2 smoke runner (no cloud credentials required)

Usage:
  scripts/s12-m2-smoke.sh [--mocked-only] [--live-http]

Modes:
  --mocked-only  Run deterministic backend integration tests with fake LocalLlmClient.
                 This is the default mode.
  --live-http    Also run lightweight /chatbot HTTP checks against localhost:8080.
                 Requires backend service already running.
EOF
}

LIVE_HTTP=0
for arg in "$@"; do
  case "$arg" in
    --mocked-only) ;;
    --live-http) LIVE_HTTP=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage; exit 2 ;;
  esac
done

echo "[1/2] Running deterministic S12-M2 backend integration tests (mocked local model)..."
( cd backend && ./mvnw -Dtest=ChatbotS12M2IntegrationTest test )

if [[ "$LIVE_HTTP" -eq 1 ]]; then
  echo "[2/2] Running optional live HTTP checks against localhost:8080 ..."
  curl -fsS http://localhost:8080/chatbot/health >/dev/null
  curl -fsS -X POST http://localhost:8080/chatbot/query \
    -H "Content-Type: application/json" \
    -d '{
      "question":"What architecture risks exist?",
      "context":{"systemName":"TrainTicket","irId":"ir-1"}
    }' >/dev/null
  echo "Live HTTP checks passed."
else
  echo "[2/2] Skipped live HTTP checks. Use --live-http to enable them."
fi

echo "PASS: S12-M2 smoke checks passed."
