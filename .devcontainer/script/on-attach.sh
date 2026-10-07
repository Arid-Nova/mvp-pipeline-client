#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "======================================"
echo "Running on-attach scripts"
echo "======================================"
echo ""

find "$SCRIPT_DIR/on-attach" \
    -maxdepth 1 \
    -type f \
    -name "*.sh" \
    | sort \
    | while read -r script
do
    echo "Executing $(basename "$script")"
    bash "$script"
done

echo ""
echo "On-attach complete."
echo ""