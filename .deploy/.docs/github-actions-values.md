# GitHub Actions Deployment Configuration Values

This file tracks Azure tenants, subscriptions, and GitHub Actions deployment apps.

## Conuco Labs

- Tenant ID: `362751f4-e3ba-4ae4-9d9b-b82b861d59c0`

### Subscriptions

- **Conuco_Labs_Subscription**
  - Subscription ID: `ab81cb03-0cde-4583-8571-52dcd1ba9524`
  - Deployment apps:
    - `github-actions-mvp-pipeline`
      - App ID: `74c2b754-5643-4d83-844a-7fdca7257225`
      - Object ID: `de31056d-d95f-41b2-ab24-379515b0fac0`
      - Federated credentials:
        - Name: `github-actions-dev`
          - Issuer: `https://token.actions.githubusercontent.com`
          - Subject: `repo:Arid-Nova/mvp-pipeline-client:environment:dev`
          - Audiences: `api://AzureADTokenExchange`
        - Name: `github-actions-prod`
          - Issuer: `https://token.actions.githubusercontent.com`
          - Subject: `repo:Arid-Nova/mvp-pipeline-client:environment:prod`
          - Audiences: `api://AzureADTokenExchange`

## Compact reference

| Tenant | Subscription | App name | App ID | Object ID |
| --- | --- | --- | --- | --- |
| Conuco Labs | Conuco_Labs_Subscription | github-actions-mvp-pipeline | 74c2b754-5643-4d83-844a-7fdca7257225 | de31056d-d95f-41b2-ab24-379515b0fac0 |

&gt; Note: Do not commit passwords or secrets. Store any service principal secrets in secure vaults or GitHub repository secrets.