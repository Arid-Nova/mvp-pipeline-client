# Azure OpenAI rate limits

Two files. `limits.toml` says what the limits should be; `limits.py` makes
Azure match.

## What a rate limit is here

**The TPM capacity assigned to a model deployment.** That is the only rate
limit Azure OpenAI enforces. Requests-per-minute is derived from TPM by Azure
and cannot be set separately — for `gpt-5-mini` on GlobalStandard the ratio is
about 1 RPM per 1,000 TPM, so 50,000 TPM also means roughly 50 requests/minute.

It does **not** cover per-user limits, per-IP limits, or concurrency. See
[What this cannot do](#what-this-cannot-do).

## Commands

```bash
cd <repo root>

# Show current limits and how much budget is left. Read-only.
python3 scripts/azure/openai-limits/limits.py status

# Make Azure match limits.toml. Asks before changing anything.
python3 scripts/azure/openai-limits/limits.py apply

# Report whether spend is over budget. Read-only.
python3 scripts/azure/openai-limits/limits.py guard

# Same check, but actually lowers the limits when over budget — and raises
# them back when a new month resets. No prompt, so this is the cron one.
python3 scripts/azure/openai-limits/limits.py guard --enforce
```

`--resource <id>` limits any command to one account. `apply --yes` skips the
prompt.

```
Resource primary  (aridnova-openai / rg-aridnova-ai / eastus2)
  This month    : $3.27 of $100.00   (3.3%)  <-- binding
    billed      : $3.27  (Azure, through Aug 22)
    since then  : $0.00  (0 tokens at $1.16/M, from your own billing)
  Today (UTC)   : $0.00 of $10.00   (0.0%)
  Status        : under budget; first step is at 80% ($80.00 monthly)
    ok      gpt-5-mini        50,000 TPM
```

Only `apply` can create deployments or pin the quota tier. `guard` only ever
adjusts capacity, which is why it is the one safe to run unattended.

## Three config blocks, one rule

```toml
[[resource]]     # which Azure OpenAI accounts exist
[[deployment]]   # what each limit should normally be
[[budget]]       # when to lower it
```

```
capacity applied = min( what [[deployment]] declares,
                        what [[budget]] currently allows )
```

`apply` and `guard` both compute that, so they can never disagree. They differ
only in what else they may do:

| | `apply` | `guard` |
|---|---|---|
| Create deployments | yes | **no** |
| Pin subscription quota tier | yes | **no** |
| Adjust capacity | yes | yes |
| Prompts first | yes | no |

An hourly cron job should not be able to create deployments or change
subscription settings. Same logic, smaller hands.

Every field is commented in `limits.toml`. `capacity` is in **thousands of
TPM** — Azure's own unit, so `capacity = 50` is 50,000 TPM.

## The budget

Two ceilings in **dollars**, covering that Azure OpenAI resource only — not
your VM, storage or databases:

```toml
monthly_usd = 100.00     # the bill ceiling
daily_usd   = 10.00      # so the month cannot burn in a day. 0 disables it
```

**Both are checked and the tighter one wins.** At 105% of today's cap the
limits tighten even with 96% of the month untouched. `status` marks which is
binding.

Dollars rather than tokens because a million tokens costs different amounts on
different models — the budget does not care which models you use.

### Where the dollar figure comes from

```
spend = billed cost from Azure          (exact, lands about a day late)
      + recent tokens × observed rate   (fresh, approximate)

observed rate = billed cost ÷ tokens over the same period
```

The rate is derived from **your own bill**, so there is no price list to
maintain and it adapts by itself when you add or change models. Yours is
currently about $1.16 per million tokens.

Because cost data lags, **today's figure is almost entirely the estimate** —
the daily cap is approximate in a way the monthly one is not.

### When Azure will not answer

Cost Management throttles hard. Results are cached for 30 minutes in
`.cost-cache.json` (gitignored, safe to delete). If a refresh fails, a stale
cache is used and labelled. If there is no cache either, `status` says the
spend is unknown and **the guard leaves your limits alone** — it never
throttles on a number it could not measure, and never treats a failed read as
"$0 spent".

It otherwise keeps **no state**: every run recalculates from budget, spend so
far, and declared capacity. A new month restores the normal limits by itself,
and running it twice does nothing the second time.

Steps let the service degrade visibly rather than going from working to
unusable at 100%:

```toml
[[budget.step]]
at_percent = 80
capacity   = 25      # noticeably slower, still usable

[[budget.step]]
at_percent = 100
capacity   = 1       # a trickle. The floor — deployments are never deleted
```

### How much can it overshoot?

`guard` only acts **when it runs**:

```
worst case = capacity in force × 1,000 × minutes between runs
```

At 50,000 TPM: **750K tokens** every 15 min, **3M** hourly, **72M** daily.
Hourly is the sensible default; daily is close to pointless. Every run prints
this figure, in dollars as well as tokens.

**A smoke alarm, not a sprinkler.** For a true per-request cap you need Azure
API Management's `token-quota`, which rejects calls at the gateway.

## Running guard on a schedule

```cron
0 * * * * cd /path/to/repo && python3 scripts/azure/openai-limits/limits.py guard --enforce >> /var/log/azure-limits.log 2>&1
```

**Auth is the part people get wrong** — cron has no `az login` session. Either:

1. **Managed identity (recommended).** Enable a system-assigned identity on the
   VM, grant it **Cognitive Services Contributor** on the resource and
   **Monitoring Reader** for the metric reads, then `az login --identity` at
   the top of the job. No secret anywhere.
2. **Service principal.** `az login --service-principal -u <id> -p <secret>
   --tenant <tenant>`. Works everywhere, but you are storing a secret.

## Requirements

- **Azure CLI 2.51.0+** — `az version`, then `az upgrade`
- **Python 3.11+** for the built-in TOML parser. No `pip install`
- `az login`, plus **Cognitive Services Contributor** on the resource

## Why a script rather than a raw `az` command

1. **Updating a deployment is a PUT.** `az ... deployment create` re-sends the
   whole deployment, so a stale model version in a config file would silently
   redeploy a *different model* behind what looked like a capacity change.
   Model, version and SKU are read from Azure for anything that exists and
   echoed back untouched.

2. **Quota is scoped to one subscription and one region.** Applying one
   deployment at a time can succeed for the first and fail for the third.
   `apply` totals the plan against quota first and refuses upfront.

3. It never runs `az account set`, so your CLI is not left pointed somewhere
   you did not choose.

## What this cannot do

- **Per-user limits.** The deployment limit is one shared bucket. Limiting a
  session needs API Management's `llm-token-limit` policy — a paid service.
- **Per-IP limits.** Azure OpenAI only ever sees your VM's outbound IP, so a
  limit placed between your containers and Azure would see one address for
  every user. Per-IP only works at your inbound web edge.
- **Concurrency.** Azure has no such control. `testgenerator` fires one call
  per prompt concurrently, so a large job opens many at once; Azure just 429s
  the overflow. Bounding that needs a change in service code.
- **A hard stop.** The guard throttles capacity; it does not reject requests.
  For a genuine `403` at the gateway, Foundry's **AI Gateway** offers native
  token quotas (hourly/daily/weekly/monthly) configured in the portal — but it
  requires an API Management instance, and it counts tokens, not dollars.
  Azure has no native dollar hard-stop anywhere.

## Troubleshooting

| Message | Cause |
|---|---|
| `You are not signed in` | `az login` |
| `Azure CLI x.y.z is too old` | `az upgrade` |
| `unknown resource '...'` | A `resource` value has no matching `[[resource]] id` |
| `does not exist ... must supply: model, version, sku` | New deployment; copy the values from `status` |
| `the step at N% allows more capacity than the step at M%` | Budget steps must tighten, not loosen |
| `is declared but does not exist in Azure` | `guard` only adjusts. Run `apply` to create it |
| `could not pin <subscription>` | Preview API. The capacities are still applied |
| Month to date shows 0 | Genuinely no usage, or metrics have not settled yet |

## References

- [Manage Azure OpenAI quota](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/quota)
- [Automate deployments with quota](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/automate-quota-deployments)
- [Quotas and limits](https://learn.microsoft.com/en-us/azure/foundry/openai/quotas-limits)
