# GitHub Actions Deployment Checklist

This file defines the exact deployment setup for this repository. It is intentionally opinionated: use Azure OpenID Connect authentication and subscription-scoped Contributor rights.

OpenID Connect is a standard for federated identity authentication. It allows GitHub Actions to request a short-lived token from Azure Active Directory without storing long-lived secrets.

## 1. Create the Azure service principal with subscription-scoped Contributor rights

Create the service principal and assign the subscription-level Contributor role in the same command:

```bash
az ad sp create-for-rbac   --name "github-actions-mvp-pipeline"   --role Contributor   --scopes /subscriptions/<SUBSCRIPTION_ID>   --output json
```

Take the returned `appId` and `tenant` values.

### Validation

- Confirm the command returns JSON containing at least `appId` and `tenant` values.
- If a `password` field is included, note that it is not required for OpenID Connect authentication.
- Verify the `appId` is recorded for later configuration of the federated credential.
- Confirm the `appId` has Contributor assignment at the subscription scope by running:

```bash
az role assignment list   --assignee <appId>   --scope /subscriptions/<SUBSCRIPTION_ID>   --query "[?roleDefinitionName=='Contributor']"
```

- If the command fails, run `az login` and confirm you have permissions to create service principals and assign roles.

## 3. Configure GitHub OpenID Connect federation

Create federated credentials so GitHub Actions can authenticate without storing long-lived secrets.

```bash
# Dev
az ad app federated-credential create   --id <appId>   --parameters '{
    "name": "github-actions-dev",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:<ORG>/<REPO>:environment:dev",
    "audiences": ["api://AzureADTokenExchange"]
  }'

# Prod
az ad app federated-credential create   --id <appId>   --parameters '{
    "name": "github-actions-prod",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:<ORG>/<REPO>:environment:prod",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

### Validation

- Confirm the commands return without error.
- Verify the federated credentials exist:

```bash
az ad app federated-credential list --id <appId>
```

## 4. Add repository variables for identifiers

Use repository-level variables rather than secrets for these identifier values.

In the repository UI, go to:

- Settings → Variables → Repository

Then add the following variables:

- `AZURE_CLIENT_ID` — the service principal `appId`
- `AZURE_TENANT_ID` — the tenant ID returned when the SP was created
- `AZURE_SUBSCRIPTION_ID` — the Azure subscription GUID

Do not store client secrets in GitHub for this setup.

## 5. Create the workflow file

Add `.github/workflows/deploy-bicep.yml` with the exact contents below.

```yaml
name: Deploy Azure Bicep

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'dev'
        type: choice
        options:
          - dev
          - prod

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Login to Azure using OpenID Connect
        uses: azure/login@v2
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}

      - name: Install Azure Bicep
        run: az bicep install

      - name: Make deploy script executable
        run: chmod +x .deploy/deploy.sh

      - name: Validate environment parameter file exists
        run: |
          PARAM_FILE=".deploy/bicep/env/demo-${{ github.event.inputs.environment }}.bicepParam"
          if [ ! -f "$PARAM_FILE" ]; then
            echo "Missing parameter file: $PARAM_FILE"
            exit 1
          fi

      - name: Run deployment
        run: ./.deploy/deploy.sh -s "${{ vars.AZURE_SUBSCRIPTION_ID }}" -e "${{ github.event.inputs.environment }}"
```

## 6. Validate locally before enabling CI

```bash
chmod +x .deploy/deploy.sh
AZURE_SUBSCRIPTION_ID=<SUBSCRIPTION_ID> ./.deploy/deploy.sh -s "$AZURE_SUBSCRIPTION_ID" -e dev
```

## 7. Common failure modes

- `Missing parameter file`: the workflow environment input or parameter naming is wrong.
- Azure login failure: the federated credential subject does not exactly match `environment: dev` or `environment: prod`.
- Deployment failure: the Bicep template or parameter file contains invalid values.

## 8. Keep this file stable

This document is meant to describe the single, opinionated deployment path. Avoid adding alternate flows or implementation-specific file lists.
