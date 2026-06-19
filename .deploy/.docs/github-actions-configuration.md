# GitHub Actions Deployment Checklist

This file defines the exact deployment setup for this repository. It is intentionally opinionated: use Azure OpenID Connect authentication and subscription-scoped Contributor rights.

OpenID Connect is a standard for federated identity authentication. It allows GitHub Actions to request a short-lived token from Azure Active Directory without storing long-lived secrets.

## 1. Create the Azure service principal with subscription-scoped Contributor rights

Create the service principal and assign the subscription-level Contributor role in the same command:

```bash
az ad sp create-for-rbac \
  --name "github-actions-mvp-pipeline" \
  --role Contributor \
  --scopes /subscriptions/<SUBSCRIPTION_ID> \
  --output json
```

Take the returned `appId` and `tenant` values.

### Validation

- Confirm the command returns JSON containing at least `appId` and `tenant` values.
- If a `password` field is included, note that it is not required for OpenID Connect authentication.
- Verify the `appId` is recorded for later configuration of the federated credential.
- Confirm the `appId` has Contributor assignment at the subscription scope by running:

```bash
az role assignment list \
  --assignee <appId> \
  --scope /subscriptions/<SUBSCRIPTION_ID> \
  --query "[?roleDefinitionName=='Contributor']"
```

- If the command fails, run `az login` and confirm you have permissions to create service principals and assign roles.

## 3. Configure GitHub OpenID Connect federation

Create a federated credential so GitHub Actions can authenticate without storing long-lived secrets.

Replace `<ORG>`, `<REPO>`, and `main` with your repository details.

```bash
az ad app federated-credential create \
  --id <appId> \
  --parameters '{
    "name": "github-actions-oidc",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:<ORG>/<REPO>:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

This subject string is valid for workflows running on the `main` branch only. If you plan to deploy from another branch or from pull requests, update the `subject` accordingly.

This is the recommended authentication method. The `--sdk-auth` option in Azure CLI is deprecated and should not be used for new GitHub Actions workflows. Use OpenID Connect federation instead.

### Validation

- Confirm the command returns without error.
- Verify the federated credential exists:

```bash
az ad app federated-credential list --id <appId>
```

- The output should include an entry with the name `github-actions-oidc` and the correct `issuer`.

## 4. Add repository variables for identifiers

Use repository-level variables rather than secrets for these identifier values.

In the repository UI, go to:

- `Settings` → `Variables` → `Repository`

Then add the following variables:

- `AZURE_CLIENT_ID` — the service principal `appId`
- `AZURE_TENANT_ID` — the tenant ID returned when the SP was created
- `AZURE_SUBSCRIPTION_ID` — the Azure subscription GUID

Do not store client secrets in GitHub for this setup.

### Validation

- Confirm each variable exists under `Settings` → `Variables` → `Repository`.
- Confirm the values are correct by matching them to the `appId`, tenant ID, and subscription ID returned earlier.

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
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

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
        run: ./.deploy/deploy.sh -s "${{ secrets.AZURE_SUBSCRIPTION_ID }}" -e "${{ github.event.inputs.environment }}"
```

### Validation

- Confirm the workflow file is present at `.github/workflows/deploy-bicep.yml`.
- Confirm the workflow contains `permissions: id-token: write` and the `azure/login@v2` step.

## 6. Validate locally before enabling CI

Run the script locally from the repository root to confirm the deployment path and parameters:

```bash
chmod +x .deploy/deploy.sh
AZURE_SUBSCRIPTION_ID=<SUBSCRIPTION_ID> ./.deploy/deploy.sh -s "$AZURE_SUBSCRIPTION_ID" -e dev
```

Confirm:

- Azure login succeeds with your local credentials.
- the subscription is set correctly.
- the deployment script finds the expected parameter file.
- the Bicep deployment command runs.

### Validation

- Confirm the command completes without error when run locally.
- Confirm the deployment is created in Azure under the target subscription.

## 7. Common failure modes

- `Missing parameter file`: the workflow environment input or parameter naming is wrong.
- Azure login failure: the federated credential is not configured correctly, or the service principal does not have subscription permissions.
- Deployment failure: the Bicep template or parameter file contains invalid values.

## 8. Keep this file stable

This document is meant to describe the single, opinionated deployment path. Avoid adding alternate flows or implementation-specific file lists.
