# GitHub Actions Deployment Configuration Values

This file tracks Azure tenants, subscriptions, and GitHub Actions deployment apps.

## Conuco Labs

- Tenant ID: `de31056d-d95f-41b2-ab24-379515b0fac0`

### Subscriptions

- **Conuco_Labs_Subscription**
  - Subscription ID: `ab81cb03-0cde-4583-8571-52dcd1ba9524`
  - Deployment apps:
    - `github-actions-mvp-pipeline`
      - App ID: `74c2b754-5643-4d83-844a-7fdca7257225`
      - Object ID: `de31056d-d95f-41b2-ab24-379515b0fac0`
      - Federated credential:
        - Name: `github-actions-oidc`
        - Credential ID: `b012ca3d-aa27-471b-b32d-2327bdb1a7ee`
        - Issuer: `https://token.actions.githubusercontent.com`
        - Subject: `repo:Arid-Nove/mvp-pipeline-client:ref:refs/heads/main`
        - Audiences: `api://AzureADTokenExchange`

## Compact reference

| Tenant | Subscription | App name | App ID | Object ID |
| --- | --- | --- | --- | --- |
| Conuco Labs | Conuco_Labs_Subscription | github-actions-mvp-pipeline | 74c2b754-5643-4d83-844a-7fdca7257225 | de31056d-d95f-41b2-ab24-379515b0fac0 |

> Note: Do not commit passwords or secrets. Store any service principal secrets in secure vaults or GitHub repository secrets.
