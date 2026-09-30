#!/usr/bin/env python3
"""Manage Azure OpenAI rate limits from limits.toml.

WHAT A RATE LIMIT IS HERE
    The TPM capacity assigned to a model deployment. That is the only rate
    limit Azure OpenAI enforces; requests-per-minute is derived from it by
    Azure and cannot be set separately.

THE ONE RULE
    capacity applied = min(what [[deployment]] declares,
                           what [[budget]] currently allows)

COMMANDS
    status           Read-only. What limits Azure has now, and how much of the
                     monthly and daily budget is spent.

    apply            Make Azure match limits.toml. Run after editing the config.
                     Shows the changes and waits for a typed "yes". May create
                     deployments and pin the subscription quota tier.

    guard            Read-only. Compares spend against the budget and reports
                     which limits it would lower. Touches nothing.

    guard --enforce  The same check, but acts on it: lowers limits while over
                     budget and raises them back when spend drops (e.g. a new
                     month). No prompt, because this is the scheduled one.
                     Never creates deployments, never pins the quota tier.

Nothing is changed unless `apply` is confirmed or `guard --enforce` is passed.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover
    sys.exit(f"Needs Python 3.11+ for tomllib. You have {sys.version.split()[0]}.")

DEFAULT_CONFIG = Path(__file__).resolve().parent / "limits.toml"

MIN_AZ_VERSION = (2, 51, 0)         # when quota parameters landed
TOKENS_PER_UNIT = 1_000             # Azure counts capacity in thousands of TPM
MIN_CAPACITY = 1                    # the floor; deployments are never deleted
COST_QUERY_ATTEMPTS = 3             # Cost Management throttles aggressively
COST_QUERY_BACKOFF_SECONDS = 10
# Cost data only moves once a day, so re-reading it more often than this wastes
# calls against an API that throttles hard. Purely an optimisation: delete the
# file and it is refetched. No decision depends on the cache existing.
COST_CACHE_PATH = Path(__file__).resolve().parent / ".cost-cache.json"
COST_CACHE_TTL_SECONDS = 1800
QUOTA_TIER_API = "2025-10-01-preview"
GUARD_INTERVAL_MINUTES = 60         # assumed cron cadence, for the overshoot line


class ConfigError(Exception):
    """The config is wrong. Azure was never contacted."""


class AzError(Exception):
    """An `az` command failed."""


# ===========================================================================
# Calling az
# ===========================================================================


def run_az(args: list[str], parse: bool = True, subscription: str = "") -> Any:
    """Run an `az` command and return its parsed JSON.

    `--subscription` is passed per command rather than via `az account set`, so
    this never leaves your CLI pointed somewhere you did not choose.
    """
    cmd = ["az", *args]
    if subscription:
        cmd += ["--subscription", subscription]
    if parse:
        cmd += ["-o", "json"]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        detail = proc.stderr.strip() or proc.stdout.strip() or "(no output)"
        raise AzError(f"`az {' '.join(args[:4])} ...` failed:\n{detail}")
    if not parse or not proc.stdout.strip():
        return None
    return json.loads(proc.stdout)


def preflight() -> None:
    if shutil.which("az") is None:
        raise AzError(
            "The Azure CLI is not installed, or `az` is not on your PATH.\n"
            "https://learn.microsoft.com/cli/azure/install-azure-cli"
        )
    raw = str(run_az(["version"]).get("azure-cli", "0"))
    try:
        version = tuple(int(part) for part in raw.split(".")[:3])
    except ValueError:
        version = (0,)
    if version < MIN_AZ_VERSION:
        want = ".".join(str(n) for n in MIN_AZ_VERSION)
        raise AzError(f"Azure CLI {raw} is too old; needs {want}+. Run `az upgrade`.")
    try:
        run_az(["account", "show"])
    except AzError:
        raise AzError("You are not signed in. Run `az login` first.")


# ===========================================================================
# Config
# ===========================================================================


@dataclass(frozen=True)
class Resource:
    """One Azure OpenAI account -- a [[resource]] block."""

    id: str
    account: str
    resource_group: str
    location: str
    subscription: str

    def label(self) -> str:
        return f"{self.id}  ({self.account} / {self.resource_group} / {self.location})"

    def arm_id(self) -> str:
        return (
            f"/subscriptions/{self.subscription}/resourceGroups/{self.resource_group}"
            f"/providers/Microsoft.CognitiveServices/accounts/{self.account}"
        )


@dataclass(frozen=True)
class Deployment:
    """One deployment's declared limit -- a [[deployment]] block."""

    resource: str
    name: str
    capacity: int
    model: str | None = None
    version: str | None = None
    sku: str | None = None


@dataclass(frozen=True)
class Step:
    """At `at_percent` of the budget spent, cap capacity here."""

    at_percent: float
    capacity: int


@dataclass(frozen=True)
class Budget:
    """One resource's monthly spend budget -- a [[budget]] block."""

    resource: str
    monthly_usd: float
    steps: list[Step]
    # 0 disables the daily cap; the monthly budget then stands alone.
    daily_usd: float = 0.0
    # Used only until Azure has published any cost for the month, when there is
    # nothing to calibrate a rate from. 0 means "do not estimate".
    fallback_usd_per_million: float = 0.0

    def percent_used(self, usd: float) -> float:
        return (usd / self.monthly_usd) * 100 if self.monthly_usd else 0.0

    def daily_percent_used(self, usd: float) -> float:
        return (usd / self.daily_usd) * 100 if self.daily_usd else 0.0

    def ceiling_for(self, percent: float) -> Step | None:
        reached = [s for s in self.steps if percent >= s.at_percent]
        return reached[-1] if reached else None


@dataclass
class Config:
    pin_quota_tier: bool
    resources: dict[str, Resource]
    deployments: list[Deployment]
    budgets: dict[str, Budget]

    def for_resource(self, rid: str) -> list[Deployment]:
        return [d for d in self.deployments if d.resource == rid]


def _need(table: dict[str, Any], key: str, where: str) -> str:
    value = str(table.get(key, "")).strip()
    if not value:
        raise ConfigError(f"{where}: {key} is required.")
    return value


def _capacity(table: dict[str, Any], where: str) -> int:
    value = table.get("capacity")
    if not isinstance(value, int) or isinstance(value, bool):
        raise ConfigError(
            f"{where}: capacity must be a whole number (thousands of tokens "
            "per minute)."
        )
    if value < MIN_CAPACITY:
        raise ConfigError(
            f"{where}: capacity must be at least {MIN_CAPACITY} "
            f"(= {tpm(MIN_CAPACITY)} TPM). Delete the deployment rather than "
            "zeroing it."
        )
    return value


def load_config(path: Path) -> Config:
    if not path.is_file():
        raise ConfigError(f"Config file not found: {path}")
    try:
        raw = tomllib.loads(path.read_text())
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError(f"{path} is not valid TOML: {exc}")

    resources: dict[str, Resource] = {}
    for i, entry in enumerate(raw.get("resource", []), start=1):
        where = f"[[resource]] #{i}"
        rid = _need(entry, "id", where)
        if rid in resources:
            raise ConfigError(f"Resource id {rid!r} is declared more than once.")
        resources[rid] = Resource(
            id=rid,
            account=_need(entry, "account", where),
            resource_group=_need(entry, "resource_group", where),
            location=_need(entry, "location", where),
            subscription=str(entry.get("subscription", "")).strip(),
        )
    if not resources:
        raise ConfigError(f"{path.name}: no [[resource]] blocks -- nothing to target.")

    deployments: list[Deployment] = []
    seen: set[tuple[str, str]] = set()
    for i, entry in enumerate(raw.get("deployment", []), start=1):
        where = f"[[deployment]] #{i}"
        rid = _need(entry, "resource", where)
        name = _need(entry, "name", where)
        if rid not in resources:
            known = ", ".join(sorted(resources))
            raise ConfigError(f"{where} ({name}): unknown resource {rid!r}. "
                              f"Declared: {known}.")
        if (rid, name) in seen:
            raise ConfigError(f"Deployment {name!r} on {rid!r} is declared twice.")
        seen.add((rid, name))
        deployments.append(Deployment(
            resource=rid, name=name, capacity=_capacity(entry, f"{where} ({name})"),
            model=str(entry["model"]).strip() if entry.get("model") else None,
            version=str(entry["version"]).strip() if entry.get("version") else None,
            sku=str(entry["sku"]).strip() if entry.get("sku") else None,
        ))
    if not deployments:
        raise ConfigError(f"{path.name}: no [[deployment]] blocks -- nothing to do.")

    budgets: dict[str, Budget] = {}
    for i, entry in enumerate(raw.get("budget", []), start=1):
        where = f"[[budget]] #{i}"
        rid = _need(entry, "resource", where)
        if rid not in resources:
            known = ", ".join(sorted(resources))
            raise ConfigError(f"{where}: unknown resource {rid!r}. Declared: {known}.")
        if rid in budgets:
            raise ConfigError(f"Resource {rid!r} has more than one budget.")

        monthly = entry.get("monthly_usd")
        if not isinstance(monthly, (int, float)) or isinstance(monthly, bool):
            raise ConfigError(f"{where} ({rid}): monthly_usd must be a number of "
                              "US dollars, e.g. 100.00")
        if monthly <= 0:
            raise ConfigError(f"{where} ({rid}): monthly_usd must be greater "
                              "than 0.")

        steps: list[Step] = []
        for j, raw_step in enumerate(entry.get("step", []), start=1):
            sw = f"{where} ({rid}) [[budget.step]] #{j}"
            percent = raw_step.get("at_percent")
            if not isinstance(percent, (int, float)) or isinstance(percent, bool):
                raise ConfigError(f"{sw}: at_percent must be a number.")
            if percent <= 0:
                raise ConfigError(f"{sw}: at_percent must be greater than 0.")
            steps.append(Step(float(percent), _capacity(raw_step, sw)))
        if not steps:
            raise ConfigError(f"{where} ({rid}): no [[budget.step]] blocks, so this "
                              "budget would never do anything.")

        steps.sort(key=lambda s: s.at_percent)
        for a, b in zip(steps, steps[1:]):
            if a.at_percent == b.at_percent:
                raise ConfigError(f"{where} ({rid}): two steps share "
                                  f"at_percent={a.at_percent:g}.")
            if b.capacity > a.capacity:
                raise ConfigError(
                    f"{where} ({rid}): the step at {b.at_percent:g}% allows more "
                    f"capacity ({b.capacity}) than the step at {a.at_percent:g}% "
                    f"({a.capacity}). Steps must tighten as the budget is used "
                    "up, never loosen."
                )

        daily = entry.get("daily_usd", 0.0)
        if not isinstance(daily, (int, float)) or isinstance(daily, bool):
            raise ConfigError(f"{where} ({rid}): daily_usd must be a number of "
                              "US dollars, or 0 to disable the daily cap.")
        if daily < 0:
            raise ConfigError(f"{where} ({rid}): daily_usd cannot be negative.")
        if daily > monthly:
            raise ConfigError(
                f"{where} ({rid}): daily_usd (${daily:,.2f}) is larger than "
                f"monthly_usd (${monthly:,.2f}), so it could never bind. "
                "A daily cap should be a fraction of the month."
            )

        fallback = entry.get("fallback_usd_per_million", 0.0)
        if not isinstance(fallback, (int, float)) or isinstance(fallback, bool):
            raise ConfigError(f"{where} ({rid}): fallback_usd_per_million must "
                              "be a number.")
        budgets[rid] = Budget(
            resource=rid, monthly_usd=float(monthly), steps=steps,
            daily_usd=float(daily), fallback_usd_per_million=float(fallback),
        )

    return Config(
        pin_quota_tier=bool(raw.get("quota_tier", {}).get("pin", False)),
        resources=resources, deployments=deployments, budgets=budgets,
    )


# ===========================================================================
# Reading Azure
# ===========================================================================


@dataclass(frozen=True)
class Live:
    """One deployment as it exists in Azure right now."""

    name: str
    capacity: int
    model: str
    version: str
    fmt: str
    sku: str


def fetch_deployments(resource: Resource) -> dict[str, Live]:
    raw = run_az(
        ["cognitiveservices", "account", "deployment", "list",
         "-g", resource.resource_group, "-n", resource.account],
        subscription=resource.subscription,
    )
    out: dict[str, Live] = {}
    for item in raw or []:
        model = (item.get("properties") or {}).get("model") or {}
        sku = item.get("sku") or {}
        out[item["name"]] = Live(
            name=item["name"], capacity=int(sku.get("capacity") or 0),
            model=model.get("name", ""), version=model.get("version", ""),
            fmt=model.get("format", "OpenAI"), sku=sku.get("name", ""),
        )
    return out


def month_start(now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


@dataclass
class CostData:
    """Billed cost for one resource this month, and how trustworthy it is."""

    total: float = 0.0
    through: datetime | None = None
    by_day: dict[str, float] = field(default_factory=dict)
    available: bool = True      # False when Azure could not be reached at all
    stale: bool = False         # served from cache after a failed refresh
    note: str = ""


def _cache_key(resource: Resource) -> str:
    return f"{resource.arm_id()}|{month_start().strftime('%Y%m')}"


def _read_cost_cache(resource: Resource) -> tuple[CostData | None, float]:
    """Return (cached data, age in seconds). Any problem means "no cache"."""
    try:
        blob = json.loads(COST_CACHE_PATH.read_text())
        entry = blob[_cache_key(resource)]
        age = time.time() - float(entry["fetched_at"])
        through = (datetime.fromisoformat(entry["through"])
                   if entry.get("through") else None)
        return CostData(float(entry["total"]), through,
                        {k: float(v) for k, v in entry["by_day"].items()}), age
    except Exception:
        return None, 0.0


def _write_cost_cache(resource: Resource, data: CostData) -> None:
    try:
        blob = {}
        if COST_CACHE_PATH.exists():
            blob = json.loads(COST_CACHE_PATH.read_text())
        blob[_cache_key(resource)] = {
            "fetched_at": time.time(),
            "total": data.total,
            "through": data.through.isoformat() if data.through else None,
            "by_day": data.by_day,
        }
        COST_CACHE_PATH.write_text(json.dumps(blob, indent=2))
    except Exception:
        pass  # a cache that cannot be written is not a reason to fail


def fetch_cost(resource: Resource) -> CostData:
    """Actual billed cost for this resource this month, and how far it covers.

    This is the authoritative number -- it is what Azure will invoice, across
    every model, with no price table to maintain. Its weakness is latency:
    cost data lands about a day behind, so it must be topped up with a live
    estimate for the period it does not cover yet.

    Cost Management throttles hard, so results are cached and failures are
    survivable: a stale cache is used if there is one, and if there is not,
    the caller is told the figure is unavailable rather than being handed a
    zero it might act on.
    """
    cached, age = _read_cost_cache(resource)
    if cached is not None and age < COST_CACHE_TTL_SECONDS:
        return cached

    body = json.dumps({
        "type": "ActualCost",
        "timeframe": "MonthToDate",
        "dataset": {
            "granularity": "Daily",
            "aggregation": {"totalCost": {"name": "Cost", "function": "Sum"}},
            "filter": {"dimensions": {"name": "ResourceId", "operator": "In",
                                      "values": [resource.arm_id()]}},
        },
    })
    url = (f"https://management.azure.com/subscriptions/{resource.subscription}"
           f"/providers/Microsoft.CostManagement/query?api-version=2023-11-01")

    raw = None
    failure = ""
    for attempt in range(COST_QUERY_ATTEMPTS):
        try:
            raw = run_az(["rest", "--method", "post", "--url", url, "--body", body])
            break
        except AzError as exc:
            failure = "throttled by Cost Management" if "429" in str(exc) else str(exc)
            if "429" not in str(exc) or attempt == COST_QUERY_ATTEMPTS - 1:
                break
            time.sleep(COST_QUERY_BACKOFF_SECONDS * (attempt + 1))

    if raw is None:
        if cached is not None:
            cached.stale = True
            cached.note = f"{failure}; using cached figures {int(age / 60)} min old"
            return cached
        return CostData(available=False, note=failure)

    props = (raw or {}).get("properties") or {}
    columns = [c.get("name") for c in props.get("columns", [])]
    try:
        cost_at, date_at = columns.index("Cost"), columns.index("UsageDate")
    except ValueError:
        return CostData(available=False, note="unexpected response shape")

    total = 0.0
    latest: datetime | None = None
    by_day: dict[str, float] = {}
    for row in props.get("rows", []):
        cost = float(row[cost_at] or 0)
        total += cost
        stamp = str(row[date_at])
        if len(stamp) == 8 and stamp.isdigit():
            by_day[stamp] = by_day.get(stamp, 0.0) + cost
            day = datetime.strptime(stamp, "%Y%m%d").replace(tzinfo=timezone.utc)
            latest = day if latest is None else max(latest, day)
    # Daily buckets are whole days, so data is complete up to the END of the
    # last day that reported.
    data = CostData(total, (latest + timedelta(days=1)) if latest else None, by_day)
    _write_cost_cache(resource, data)
    return data


def tokens_between(resource: Resource, start: datetime,
                   end: datetime | None = None) -> dict[str, int]:
    """Tokens billed to this resource over a window.

    Read from Azure Monitor rather than Cost Management: metrics appear within
    minutes, which is what makes them usable for the part cost data has not
    caught up with yet.
    """
    now = end or datetime.now(timezone.utc)
    if start >= now:
        return {"input": 0, "output": 0, "total": 0}
    raw = run_az(
        ["monitor", "metrics", "list", "--resource", resource.arm_id(),
         "--metric", "InputTokens", "OutputTokens",
         "--start-time", start.strftime("%Y-%m-%dT%H:%M:%SZ"),
         "--end-time", now.strftime("%Y-%m-%dT%H:%M:%SZ"),
         "--interval", "PT1H", "--aggregation", "Total"],
        subscription=resource.subscription,
    )
    totals = {"input": 0, "output": 0}
    for metric in (raw or {}).get("value", []):
        name = str((metric.get("name") or {}).get("value", ""))
        key = {"InputTokens": "input", "OutputTokens": "output"}.get(name)
        if key is None:
            continue
        for series in metric.get("timeseries", []):
            for point in series.get("data", []):
                totals[key] += int(point.get("total") or 0)
    totals["total"] = totals["input"] + totals["output"]
    return totals


def fetch_quota(subscription: str, location: str) -> dict[str, dict[str, float]]:
    """Quota is scoped to one subscription AND one region, so it is read that
    way. Pooling across regions would pass plans that Azure then rejects."""
    raw = run_az(["cognitiveservices", "usage", "list", "-l", location],
                 subscription=subscription)
    return {
        str((item.get("name") or {}).get("value", "")).lower(): {
            "used": float(item.get("currentValue") or 0),
            "limit": float(item.get("limit") or 0),
        }
        for item in raw or [] if (item.get("name") or {}).get("value")
    }


# ===========================================================================
# Deciding
# ===========================================================================


@dataclass
class Target:
    """One deployment: where it is now, and where it should be."""

    resource: Resource
    name: str
    declared: int
    target: int
    live: Live | None
    model: str
    version: str
    fmt: str
    sku: str

    @property
    def needs_change(self) -> bool:
        return self.live is None or self.live.capacity != self.target

    @property
    def throttled(self) -> bool:
        return self.target < self.declared


@dataclass
class Spend:
    """How much of a resource's monthly budget is gone, and what that permits.

    Split into two parts because they have very different trustworthiness:

      billed_usd     what Azure has actually invoiced. Exact, but about a day
                     behind, and covers every model with no price table.
      estimated_usd  the gap since then: recent tokens priced at the rate the
                     billed data implies. Fresh, approximate.

    The decision uses the sum. `status` shows both so the split is visible.
    """

    budget: Budget | None
    billed_usd: float = 0.0
    estimated_usd: float = 0.0
    billed_through: datetime | None = None
    recent_tokens: int = 0
    usd_per_million: float = 0.0
    rate_source: str = ""
    percent: float = 0.0
    step: Step | None = None
    # Today, tracked separately so one bad day cannot burn the whole month.
    today_usd: float = 0.0
    today_percent: float = 0.0
    # Which budget is closer to its limit, and therefore chose the step.
    binding: str = "monthly"
    # Set when Azure could not tell us what has been spent. The guard must not
    # throttle on a number it could not measure, so it leaves things alone.
    measured: bool = True
    warning: str = ""

    @property
    def total_usd(self) -> float:
        return self.billed_usd + self.estimated_usd

    @property
    def ceiling(self) -> int | None:
        return self.step.capacity if self.step else None


def read_spend(resource: Resource, budget: Budget | None) -> Spend:
    """Work out this month's spend: billed cost, topped up with a live estimate.

    The $/token rate is derived from Azure's own billing -- cost so far divided
    by tokens over the same period -- so it needs no price list and adapts by
    itself when the mix of models changes. That is what makes the budget
    model-agnostic.
    """
    if budget is None:
        return Spend(None)

    now = datetime.now(timezone.utc)
    start = month_start(now)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    cost = fetch_cost(resource)

    if not cost.available:
        # No cost figure and no cache. Reporting $0 would look like "plenty of
        # budget left", so say nothing is known and let the guard stand down.
        return Spend(budget, measured=False,
                     warning=f"could not read spend ({cost.note})")

    billed, through, by_day = cost.total, cost.through, cost.by_day

    if through is None:
        # Nothing billed yet this month, so there is no rate to derive. Fall
        # back to a configured rate if one is set, otherwise report tokens
        # without pricing them rather than inventing a number.
        rate = budget.fallback_usd_per_million
        source = "configured fallback" if rate else "no billing data yet"
        recent = tokens_between(resource, start)["total"]
        estimated = recent / 1e6 * rate if rate else 0.0
        today_tokens = tokens_between(resource, today_start)["total"]
        today = today_tokens / 1e6 * rate if rate else 0.0
    else:
        billed_tokens = tokens_between(resource, start, through)["total"]
        if billed_tokens > 0 and billed > 0:
            rate = billed / (billed_tokens / 1e6)
            source = "from your own billing"
        else:
            rate = budget.fallback_usd_per_million
            source = "configured fallback" if rate else "not enough data"

        recent = tokens_between(resource, through)["total"]
        estimated = recent / 1e6 * rate if rate else 0.0

        # Today is nearly always entirely unbilled -- cost data lands about a
        # day late -- so it is mostly the live estimate. Take whatever HAS been
        # billed for today, and estimate only the part after the billed window.
        today_billed = by_day.get(today_start.strftime("%Y%m%d"), 0.0)
        estimate_from = max(today_start, through)
        today_tokens = tokens_between(resource, estimate_from)["total"]
        today = today_billed + (today_tokens / 1e6 * rate if rate else 0.0)

    total = billed + estimated
    monthly_percent = budget.percent_used(total)
    today_percent = budget.daily_percent_used(today)

    # The tighter of the two decides the throttle: a daily cap is pointless if
    # the monthly percentage can override it, and vice versa.
    if today_percent > monthly_percent:
        percent, binding = today_percent, "daily"
    else:
        percent, binding = monthly_percent, "monthly"

    return Spend(budget, billed, estimated, through, recent, rate, source,
                 percent, budget.ceiling_for(percent), today, today_percent,
                 binding, True, cost.note if cost.stale else "")


def build_targets(resource: Resource, declared: list[Deployment],
                  live: dict[str, Live], spend: Spend,
                  allow_create: bool) -> list[Target]:
    targets: list[Target] = []
    for want in declared:
        found = live.get(want.name)

        if found is None and not allow_create:
            # guard only ever adjusts. Creating a deployment is deliberate.
            print(f"  note: {want.name} is declared but does not exist in Azure; "
                  "skipping. Run `apply` to create it.", file=sys.stderr)
            continue

        if found is not None:
            # Model details always come from Azure. `az deployment create` is a
            # PUT that replaces the whole deployment, so a stale version in the
            # config would silently swap the model behind a capacity change.
            if any(d and d != a for d, a in ((want.model, found.model),
                                             (want.version, found.version),
                                             (want.sku, found.sku))):
                print(f"  note: {want.name} already exists as {found.model}/"
                      f"{found.version} [{found.sku}]; ignoring model/version/sku "
                      "from the config.", file=sys.stderr)
            model, version, fmt, sku = found.model, found.version, found.fmt, found.sku
        else:
            missing = [k for k, v in (("model", want.model), ("version", want.version),
                                      ("sku", want.sku)) if not v]
            if missing:
                raise ConfigError(
                    f"Deployment {want.name!r} does not exist on {resource.id!r} "
                    f"yet, so the config must supply: {', '.join(missing)}.\n"
                    "Run `status` to see the values your existing deployments use."
                )
            model, version, fmt, sku = want.model, want.version, "OpenAI", want.sku

        # An unmeasured budget imposes no ceiling: never throttle on a number
        # we could not read.
        ceiling = spend.ceiling if spend.measured else None
        target = want.capacity if ceiling is None else min(want.capacity, ceiling)
        targets.append(Target(
            resource=resource, name=want.name, declared=want.capacity,
            target=max(MIN_CAPACITY, target), live=found,
            model=model or "", version=version or "", fmt=fmt, sku=sku or "",
        ))
    return targets


def check_quota(targets: list[Target]) -> list[str]:
    """Return readable problems; empty means the plan fits.

    Checked as a whole so a plan cannot half-apply: succeed for the first
    deployment and fail for the third.
    """
    problems: list[str] = []
    groups: dict[tuple[str, str, str, str], list[Target]] = {}
    for t in targets:
        groups.setdefault(
            (t.resource.subscription, t.resource.location, t.sku, t.model), []
        ).append(t)

    cache: dict[tuple[str, str], dict[str, dict[str, float]]] = {}
    for (subscription, location, sku, model), group in sorted(groups.items()):
        if (subscription, location) not in cache:
            cache[(subscription, location)] = fetch_quota(subscription, location)
        entry = cache[(subscription, location)].get(f"openai.{sku}.{model}".lower())
        if entry is None:
            print(f"  note: no quota line for {sku}/{model} in {location}; "
                  "skipping the headroom check for it.", file=sys.stderr)
            continue
        # Anything this plan does not manage keeps its present allocation.
        managed = sum(t.live.capacity for t in group
                      if t.live and t.live.sku == sku and t.live.model == model)
        projected = entry["used"] - managed + sum(t.target for t in group)
        if projected > entry["limit"]:
            problems.append(
                f"{sku}/{model} in {location}: this plan needs {int(projected):,}k "
                f"TPM but the quota there is {int(entry['limit']):,}k. Reduce "
                f"capacities by {int(projected - entry['limit']):,}k, or request "
                "an increase."
            )
    return problems


# ===========================================================================
# Output
# ===========================================================================


def tpm(capacity: int | float) -> str:
    return f"{int(capacity) * TOKENS_PER_UNIT:,}"


def human(count: int) -> str:
    for size, suffix in ((1_000_000_000, "B"), (1_000_000, "M"), (1_000, "K")):
        if count >= size:
            return f"{count / size:.2f}{suffix}"
    return str(count)


def show(resource: Resource, spend: Spend, targets: list[Target]) -> None:
    print(f"\nResource {resource.label()}")

    if spend.budget is None:
        print("  Budget        : none declared")
    elif not spend.measured:
        print(f"  Budget        : ${spend.budget.monthly_usd:,.2f}/month, "
              f"${spend.budget.daily_usd:,.2f}/day")
        print(f"  WARNING       : {spend.warning}")
        print("                  limits left as they are -- the guard does not "
              "act on unmeasured spend")
    else:
        b = spend.budget
        if spend.warning:
            print(f"  NOTE          : {spend.warning}")
        through = (spend.billed_through - timedelta(days=1)).strftime("%b %-d") \
            if spend.billed_through else "nothing yet"
        monthly_percent = b.percent_used(spend.total_usd)
        mark = "  <-- binding" if spend.binding == "monthly" else ""
        print(f"  This month    : ${spend.total_usd:,.2f} of ${b.monthly_usd:,.2f}"
              f"   ({monthly_percent:.1f}%){mark}")
        print(f"    billed      : ${spend.billed_usd:,.2f}  "
              f"(Azure, through {through})")
        print(f"    since then  : ${spend.estimated_usd:,.2f}  "
              f"({human(spend.recent_tokens)} tokens at "
              f"${spend.usd_per_million:,.2f}/M, {spend.rate_source})")
        if b.daily_usd:
            mark = "  <-- binding" if spend.binding == "daily" else ""
            print(f"  Today (UTC)   : ${spend.today_usd:,.2f} of "
                  f"${b.daily_usd:,.2f}   ({spend.today_percent:.1f}%){mark}")
            print("                  today is almost entirely estimated; cost "
                  "data lands a day late")
        if spend.step is None:
            first = min(s.at_percent for s in b.steps)
            cap = b.daily_usd if spend.binding == "daily" else b.monthly_usd
            print(f"  Status        : under budget; first step is at {first:g}% "
                  f"(${cap * first / 100:,.2f} {spend.binding})")
        else:
            print(f"  Status        : past the {spend.step.at_percent:g}% step "
                  f"on the {spend.binding} budget "
                  f"-- ceiling {tpm(spend.step.capacity)} TPM")

    if not targets:
        print("    (no deployments)")
        return

    width = max(len(t.name) for t in targets)
    for t in sorted(targets, key=lambda t: t.name):
        tag = "  [held down by budget]" if t.throttled else ""
        if t.live is None:
            print(f"    CREATE  {t.name:<{width}}  {tpm(t.target):>12} TPM   "
                  f"{t.model}/{t.version} [{t.sku}]")
        elif not t.needs_change:
            print(f"    ok      {t.name:<{width}}  {tpm(t.target):>12} TPM{tag}")
        else:
            way = "lower" if t.live.capacity > t.target else "raise"
            print(f"    CHANGE  {t.name:<{width}}  {tpm(t.live.capacity)} -> "
                  f"{tpm(t.target)} TPM  ({way}){tag}")

    if spend.budget is not None:
        in_force = max(t.target for t in targets)
        window = in_force * TOKENS_PER_UNIT * GUARD_INTERVAL_MINUTES
        money = (f" (about ${window / 1e6 * spend.usd_per_million:,.2f})"
                 if spend.usd_per_million else "")
        print(f"  Overshoot risk: at {tpm(in_force)} TPM, up to {human(window)} "
              f"tokens{money} can be spent before the next hourly guard run")


# ===========================================================================
# Commands
# ===========================================================================


def pin_quota_tier(subscription: str) -> None:
    """Stop Azure raising the quota automatically, which would undo the limits."""
    run_az(["rest", "--method", "patch", "--url",
            f"https://management.azure.com/subscriptions/{subscription}/providers"
            f"/Microsoft.CognitiveServices/quotaTiers/default"
            f"?api-version={QUOTA_TIER_API}",
            "--body",
            json.dumps({"properties": {"tierUpgradePolicy": "NoAutoUpgrade"}})],
           parse=False)


def survey(config: Config, chosen: dict[str, Resource],
           allow_create: bool) -> list[Target]:
    targets: list[Target] = []
    for rid in sorted(chosen):
        resource = chosen[rid]
        spend = read_spend(resource, config.budgets.get(rid))
        live = fetch_deployments(resource)
        found = build_targets(resource, config.for_resource(rid), live,
                              spend, allow_create)
        show(resource, spend, found)
        targets.extend(found)
    return targets


def cmd_status(config: Config, chosen: dict[str, Resource], args) -> int:
    survey(config, chosen, allow_create=False)
    return 0


def cmd_apply(config: Config, chosen: dict[str, Resource], args) -> int:
    targets = survey(config, chosen, allow_create=True)

    problems = check_quota(targets)
    if problems:
        print("\nRefusing to apply -- the plan does not fit your quota:",
              file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    # Quota tiers are per subscription, so pin each distinct one once.
    pins = (sorted({r.subscription for r in chosen.values()})
            if config.pin_quota_tier else [])
    changes = [t for t in targets if t.needs_change]

    if not changes and not pins:
        print("\nNothing to do -- Azure already matches the config.")
        return 0

    print("\nTo apply")
    print("--------")
    for subscription in pins:
        print(f"  pin quota tier   subscription {subscription}")
    for t in changes:
        was = f"{tpm(t.live.capacity)} -> " if t.live else ""
        print(f"  [{t.resource.id}] {t.name}   {was}{tpm(t.target)} TPM")

    if not args.yes:
        if not sys.stdin.isatty():
            print("\nRefusing to apply without a terminal to confirm at. "
                  "Re-run with --yes if this is intentional.", file=sys.stderr)
            return 1
        if input("\nApply these changes? Type 'yes' to continue: ").strip() != "yes":
            print("Aborted. Nothing changed.")
            return 0

    print()
    for subscription in pins:
        try:
            pin_quota_tier(subscription)
            print(f"  pinned quota tier for {subscription}")
        except AzError as exc:
            # Preview API. Failing here must not abandon the capacities, which
            # are the part that actually enforces the limit.
            print(f"  WARNING: could not pin {subscription}: {exc}", file=sys.stderr)

    for t in changes:
        put_deployment(t)
        print(f"  [{t.resource.id}] {'created' if t.live is None else 'set'} "
              f"{t.name} -> {tpm(t.target)} TPM")

    print("\nDone. Azure can take up to 15 minutes to propagate.")
    return 0


def cmd_guard(config: Config, chosen: dict[str, Resource], args) -> int:
    if not any(rid in config.budgets for rid in chosen):
        print("\nNo [[budget]] declared for the selected resource(s), so there is "
              "nothing for guard to enforce.", file=sys.stderr)
        return 0

    targets = survey(config, chosen, allow_create=False)
    changes = [t for t in targets if t.needs_change]
    if not changes:
        print("\nNothing to change -- Azure already matches the budget.")
        return 0

    if not args.enforce:
        print(f"\n{len(changes)} deployment(s) would change. "
              "Re-run with --enforce to apply.")
        return 0

    print()
    for t in changes:
        put_deployment(t)
        assert t.live is not None  # guard never creates
        verb = "throttled" if t.target < t.live.capacity else "restored"
        print(f"  [{t.resource.id}] {verb} {t.name} -> {tpm(t.target)} TPM")

    print("\nDone. Azure can take up to 15 minutes to propagate.")
    return 0


def put_deployment(target: Target) -> None:
    """Create or update one deployment.

    The only place a deployment is written. Model details come from `target`,
    which build_targets fills from Azure for anything that already exists.
    """
    run_az(
        ["cognitiveservices", "account", "deployment", "create",
         "-g", target.resource.resource_group, "-n", target.resource.account,
         "--deployment-name", target.name,
         "--model-name", target.model,
         "--model-version", target.version,
         "--model-format", target.fmt,
         "--sku-name", target.sku,
         "--sku-capacity", str(target.target)],
        parse=False, subscription=target.resource.subscription,
    )


# ===========================================================================
# Main
# ===========================================================================


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Manage Azure OpenAI rate limits from limits.toml.")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--resource", metavar="ID",
                        help="act on one [[resource]] id only")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser(
        "status",
        help="show current limits and budget usage (read-only)",
        description="Read-only. Prints the limits Azure has on your deployments "
                    "right now, and how much of the monthly and daily budget you "
                    "have spent. Changes nothing.")

    apply_cmd = sub.add_parser(
        "apply",
        help="make Azure match limits.toml (asks first)",
        description="Makes Azure match limits.toml. Run this after editing the "
                    "config. Shows what it will change, then waits for you to "
                    "type 'yes'. May create deployments and pin the subscription "
                    "quota tier.")
    apply_cmd.add_argument("--yes", action="store_true",
                           help="skip the confirmation prompt and apply straight away")

    guard = sub.add_parser(
        "guard",
        help="check spend against the budget; --enforce to act on it",
        description="Guards the budget. Compares this month's and today's spend "
                    "against [[budget]] and reports which limits it would lower. "
                    "Without --enforce it only reports.")
    guard.add_argument(
        "--enforce", action="store_true",
        help="actually lower the limits while over budget, and raise them back "
             "when spend drops (e.g. a new month). No prompt -- this is the "
             "form to run from cron")

    args = parser.parse_args()
    # stdout is block-buffered when piped, which would print errors above the
    # output they refer to.
    sys.stdout.reconfigure(line_buffering=True)

    try:
        config = load_config(args.config)

        chosen = config.resources
        if args.resource:
            if args.resource not in chosen:
                raise ConfigError(f"Unknown resource {args.resource!r}. Declared: "
                                  f"{', '.join(sorted(chosen))}.")
            chosen = {args.resource: chosen[args.resource]}

        preflight()
        if any(not r.subscription for r in chosen.values()):
            fallback = str(run_az(["account", "show"])["id"])
            chosen = {
                rid: r if r.subscription else Resource(
                    r.id, r.account, r.resource_group, r.location, fallback)
                for rid, r in chosen.items()
            }

        return {"status": cmd_status, "apply": cmd_apply,
                "guard": cmd_guard}[args.command](config, chosen, args)

    except ConfigError as exc:
        print(f"\nConfig error: {exc}", file=sys.stderr)
        return 2
    except AzError as exc:
        print(f"\nAzure error: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nInterrupted. Nothing further was changed.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
