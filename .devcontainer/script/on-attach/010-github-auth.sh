#!/usr/bin/env bash

set -euo pipefail

export GH_CONFIG_DIR=/home/vscode/.github-auth

if gh auth status >/dev/null 2>&1; then
    echo "GitHub already authenticated."
    exit 0
fi

echo ""
echo "GitHub authentication required."
echo ""

gh auth login \
  --web \
  --git-protocol https \
  --scopes "read:packages"