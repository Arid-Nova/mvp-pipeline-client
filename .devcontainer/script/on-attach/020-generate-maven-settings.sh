#!/usr/bin/env bash

set -euo pipefail

export GH_CONFIG_DIR=/home/vscode/.github-auth

GITHUB_USER=$(gh api user --jq .login)
GITHUB_TOKEN=$(gh auth token)

mkdir -p ~/.m2

cat > ~/.m2/settings.xml <<EOF
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0">

    <servers>
        <server>
            <id>github</id>
            <username>${GITHUB_USER}</username>
            <password>${GITHUB_TOKEN}</password>
        </server>
    </servers>

</settings>
EOF

echo "Generated ~/.m2/settings.xml"