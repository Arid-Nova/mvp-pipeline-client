# Monorepo Deployment Architecture

## Goals

- Each project can be built, released, and deployed independently.
- All projects live inside a single monorepo.
- Shared deployment logic is centralized.
- Entire platform can be rolled out through a separate orchestration repository.
- Services own their deployment configuration and infrastructure definitions.
- Platform infrastructure is managed separately.

---

# Repository Layout

## Monorepo

```text
enterprise-platform/
│
├── apps/
│   ├── orders-api/
│   │   ├── src/
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── deployment/
│   │       ├── containerapp.bicep
│   │       ├── parameters/
│   │       │   ├── dev.json
│   │       │   ├── stage.json
│   │       │   └── prod.json
│   │       └── smoke-tests/
│   │           └── smoke.ps1
│   │
│   ├── payments-api/
│   │   ├── src/
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── deployment/
│   │       ├── containerapp.bicep
│   │       └── parameters/
│   │
│   ├── inventory-api/
│   │   ├── src/
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── deployment/
│   │       ├── containerapp.bicep
│   │       └── parameters/
│   │
│   └── customer-portal/
│       ├── src/
│       ├── Dockerfile
│       └── deployment/
│           ├── containerapp.bicep
│           └── parameters/
│
├── shared/
│   ├── libraries/
│   ├── common/
│   └── contracts/
│
├── infrastructure/
│   ├── platform/
│   │   ├── vnet.bicep
│   │   ├── keyvault.bicep
│   │   ├── loganalytics.bicep
│   │   ├── containerapps-environment.bicep
│   │   └── monitoring.bicep
│   │
│   └── environments/
│       ├── dev/
│       ├── stage/
│       └── prod/
│
└── .github/
    └── workflows/
        ├── orders-ci.yml
        ├── orders-release.yml
        ├── orders-deploy.yml
        │
        ├── payments-ci.yml
        ├── payments-release.yml
        ├── payments-deploy.yml
        │
        ├── inventory-ci.yml
        ├── inventory-release.yml
        ├── inventory-deploy.yml
        │
        ├── customerportal-ci.yml
        ├── customerportal-release.yml
        └── customerportal-deploy.yml
```

---

# Platform Actions Repository

Contains reusable workflow logic.

```text
platform-actions/
│
└── .github/
    └── workflows/
        ├── build.yml
        ├── release.yml
        ├── deploy-containerapp.yml
        ├── deploy-aks.yml
        ├── security-scan.yml
        └── smoke-test.yml
```

## Responsibilities

- Build logic
- Docker build logic
- Docker push logic
- Security scanning
- Azure deployment mechanics
- Smoke testing

Example:

```yaml
jobs:
  deploy:
    uses: org/platform-actions/.github/workflows/deploy-containerapp.yml@v1
```

---

# Release Orchestrator Repository

Coordinates full-platform deployments.

```text
release-orchestrator/
│
├── environments/
│   ├── dev/
│   │   └── versions.yaml
│   │
│   ├── stage/
│   │   └── versions.yaml
│   │
│   └── prod/
│       └── versions.yaml
│
└── .github/
    └── workflows/
        ├── rollout-dev.yml
        ├── rollout-stage.yml
        ├── rollout-prod.yml
        ├── hotfix.yml
        └── rollback.yml
```

Example:

```yaml
orders-api: 1.4.2
payments-api: 2.3.0
inventory-api: 5.1.1
customer-portal: 3.0.0
```

---

# Ownership Model

## Service Repository

Owns:

- Source code
- Dockerfile
- Service-specific Bicep
- Service deployment configuration
- Release lifecycle
- Independent deployments

Examples:

```text
apps/orders-api/deployment/containerapp.bicep
apps/payments-api/deployment/containerapp.bicep
```

---

## Infrastructure Folder

Owns shared Azure resources.

Examples:

```text
VNET
Container Apps Environment
AKS Cluster
Key Vault
Log Analytics
Monitoring
```

Examples:

```text
infrastructure/platform/vnet.bicep
infrastructure/platform/keyvault.bicep
```

---

## Platform Actions Repository

Owns:

- Reusable CI logic
- Reusable Release logic
- Reusable Deployment logic
- Security standards
- Common deployment patterns

---

## Release Orchestrator Repository

Owns:

- Environment promotion
- Coordinated releases
- Rollouts
- Rollbacks
- Release trains
- Fleet deployments

Does NOT own:

- Application code
- Dockerfiles
- Service Bicep files

---

# Deployment Flow

## Independent Service Deployment

```text
Developer Commit
        ↓
CI
        ↓
Release
        ↓
Docker Hub / ACR
        ↓
Deploy Service
        ↓
Azure
```

Example:

```text
orders-api -> v1.4.2
```

Only Orders API is deployed.

---

# Full Platform Rollout

```text
Release Orchestrator
        ↓
Read versions.yaml
        ↓
Trigger Orders Deployment
        ↓
Trigger Payments Deployment
        ↓
Trigger Inventory Deployment
        ↓
Trigger Customer Portal Deployment
        ↓
Validate Platform
```

---

# Rule of Thumb

✅ Service-specific Bicep files belong inside the service's `deployment/` folder.

✅ Shared Azure infrastructure belongs under `infrastructure/platform/`.

✅ Reusable GitHub workflows belong in `platform-actions`.

✅ Coordinated releases belong in `release-orchestrator`.

✅ Services should always be deployable independently.

✅ Orchestrator should coordinate deployments, not contain deployment implementations.