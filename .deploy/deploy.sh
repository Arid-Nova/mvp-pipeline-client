#!/usr/bin/env bash

set -euo pipefail

# ----------------------------
# Defaults
# ----------------------------
DEFAULT_SUB="ab81cb03-0cde-4583-8571-52dcd1ba9524"
DEFAULT_ENV="dev"
LOCATION="westus2"

SUBSCRIPTION_ID="$DEFAULT_SUB"
ENVIRONMENT="$DEFAULT_ENV"

# ----------------------------
# Help
# ----------------------------
show_help() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -s, --sub, --subscription-id   Azure subscription ID
  -e, --env, --environment       Environment (dev | prod)
  -h, --help                     Show this help

Examples:
  ./deploy.sh
  ./deploy.sh -e prod
  ./deploy.sh -s <sub-id> -e dev
EOF
}

# ----------------------------
# Parse args
# ----------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--sub|--subscription-id)
      SUBSCRIPTION_ID="$2"
      shift 2
      ;;
    -e|--env|--environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo "❌ Unknown option: $1"
      show_help
      exit 1
      ;;
  esac
done

# ----------------------------
# Validate environment
# ----------------------------
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
  echo "❌ Environment must be 'dev' or 'prod'"
  exit 1
fi

PARAM_FILE="bicep/env/demo-${ENVIRONMENT}.bicepParam"

if [[ ! -f "$PARAM_FILE" ]]; then
  echo "❌ Missing parameter file: $PARAM_FILE"
  exit 1
fi

# ----------------------------
# Info
# ----------------------------
echo "🌎 Environment: $ENVIRONMENT"
echo "📌 Subscription: $SUBSCRIPTION_ID"

# ----------------------------
# Login
# ----------------------------
echo "🔐 Logging into Azure..."
az login > /dev/null

echo "📌 Setting subscription..."
az account set --subscription "$SUBSCRIPTION_ID"

echo "✅ Active subscription:"
az account show --query "{name:name, id:id}" -o table

# ----------------------------
# Deployment
# ----------------------------
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "🚀 Starting deployment..."

az deployment sub create \
  --name "mvp-pipeline-deploy-${ENVIRONMENT}-${TIMESTAMP}" \
  --location "$LOCATION" \
  --template-file bicep/main.bicep \
  --parameters "$PARAM_FILE"

echo "✅ Deployment completed"