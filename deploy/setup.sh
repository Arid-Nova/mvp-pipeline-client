#!/usr/bin/env bash
# One-shot bootstrap for a fresh Ubuntu 22.04+ VM on Azure.
#
# Usage (run as a sudo-capable user, NOT as root):
#   curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/<branch>/deploy/setup.sh | bash
# or after cloning:
#   ./deploy/setup.sh
#
# This script:
#   1. Installs Docker + the Compose v2 plugin
#   2. Adds the current user to the docker group
#   3. Opens UFW for 22/80/443 (defense in depth on top of the Azure NSG)
#   4. Prints next steps (cloning repo, .env, launching the stack)
#
# It is idempotent — safe to re-run.

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}==>${NC} $*"; }
warn() { echo -e "${YELLOW}!!${NC} $*"; }
err()  { echo -e "${RED}xx${NC} $*" >&2; }

if [[ $EUID -eq 0 ]]; then
	err "Do not run as root. Run as a sudo-capable user; the script uses sudo where needed."
	exit 1
fi

if ! grep -qi ubuntu /etc/os-release; then
	warn "This script is tested on Ubuntu. Other distros may need manual adjustment."
fi

log "Updating apt cache"
sudo apt-get update -y

log "Installing prerequisites"
sudo apt-get install -y ca-certificates curl gnupg lsb-release ufw git

if ! command -v docker >/dev/null 2>&1; then
	log "Installing Docker Engine + Compose plugin"
	sudo install -m 0755 -d /etc/apt/keyrings
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
	sudo chmod a+r /etc/apt/keyrings/docker.gpg

	echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
		| sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

	sudo apt-get update -y
	sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
	log "Docker already installed: $(docker --version)"
fi

if ! getent group docker | grep -q "\b$USER\b"; then
	log "Adding $USER to docker group (you must log out + back in for this to take effect)"
	sudo usermod -aG docker "$USER"
	NEED_RELOGIN=1
fi

log "Configuring UFW (22/80/443)"
sudo ufw allow OpenSSH || true
sudo ufw allow 80/tcp  || true
sudo ufw allow 443/tcp || true
sudo ufw --force enable

log "Enabling docker service on boot"
sudo systemctl enable --now docker

cat <<'EOF'

================================================================
Bootstrap complete.

Next steps:

  1. (If you weren't already there) clone the repo and cd into it:
       git clone <repo-url> aridnova
       cd aridnova

  2. Copy .env.example to .env and fill in real values:
       cp .env.example .env
       nano .env
     Important entries for the prod deploy:
       DEMO_DOMAIN=aridnova-demo.<region>.cloudapp.azure.com   # or your own domain
       MYSQL_ROOT_PASSWORD=<strong-password>
       MONGO_ROOT_PASSWORD=<strong-password>
       NEO4J_PASSWORD=<strong-password-8-chars-min>
       INTERNAL_SERVICE_KEY=<random-string>
       ENCRYPTION_KEY=<random-string>
       OPENAI_API_KEY=...    # rotate the one currently in git history first!

  3. Make sure DEMO_DOMAIN points at this VM's public IP (DNS A record).
     For IP-only demos (no domain), set DEMO_DOMAIN=:80 and skip HTTPS.

  4. Launch the stack:
       docker compose -f docker-compose.yaml -f docker-compose.prod.yaml up -d --build

  5. Tail logs to confirm Caddy got a cert and services came up:
       docker compose logs -f caddy
       docker compose ps

EOF

if [[ "${NEED_RELOGIN:-0}" == "1" ]]; then
	warn "You were added to the docker group — log out and back in (or run 'newgrp docker') before running docker compose."
fi
