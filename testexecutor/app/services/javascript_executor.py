"""Execute declarative HTTP cases only against an explicitly configured fixture.

No generated code, shell, source URL, credential material, redirects, or external
hostnames enter execution. Fixture configuration is administrator-controlled.
"""
from contextlib import contextmanager
import errno
import hashlib
import http.client
import ipaddress
import json
import os
from pathlib import Path
import tempfile
import time
from urllib.parse import urlsplit, urlencode

MAX_CASES = 500
MAX_BODY = 1024 * 1024
LOCK_WAIT_SECONDS = 30
LOCK_POLL_SECONDS = 0.05


def _origin_key(target):
    # A dual-stack/wildcard fixture can be reachable through several loopback
    # addresses. Conservatively serialize every loopback alias on this port,
    # including explicit/default port spelling, rather than split its state.
    origin = f"loopback-http-port:{target.port or 80}"
    return hashlib.sha256(origin.encode("ascii")).hexdigest()


def _try_lock(stream):
    try:
        if os.name == "nt":
            import msvcrt
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return True
    except OSError as error:
        if error.errno in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):
            return False
        raise


def _unlock(stream):
    if os.name == "nt":
        import msvcrt
        stream.seek(0)
        msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        import fcntl
        fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


@contextmanager
def _fixture_lock(target, timeout=None):
    """Coordinate the complete suite across threads/processes sharing this lock directory.

    Workers on different hosts/containers sharing a fixture must mount the same
    administrator-configured lock directory. A process-local mutex is insufficient.
    Lock files remain present: unlinking them can give waiters different inodes.
    """
    directory = Path(os.getenv("ARIDNOVA_JS_FIXTURE_LOCK_DIR")
                     or Path(tempfile.gettempdir()) / "aridnova-fixture-locks")
    try:
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(directory / (_origin_key(target) + ".lock"), flags, 0o600)
        stream = os.fdopen(descriptor, "r+b", buffering=0)
    except OSError:
        raise ValueError("Fixture execution isolation is unavailable; configure a working shared lock directory") from None
    with stream:
        acquired = False
        try:
            # Both OS mechanisms can lock an empty file. Never initialize a
            # byte before locking: another worker may already own that range.
            deadline = time.monotonic() + (LOCK_WAIT_SECONDS if timeout is None else timeout)
            while not acquired:
                acquired = _try_lock(stream)
                if acquired:
                    break
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise ValueError("Fixture origin is busy; retry after the active suite completes")
                time.sleep(min(LOCK_POLL_SECONDS, remaining))
        except OSError:
            raise ValueError("Fixture execution isolation could not be established") from None
        try:
            yield
        finally:
            if acquired:
                try:
                    _unlock(stream)
                except OSError:
                    raise ValueError("Fixture execution isolation could not be released") from None


def _target(url):
    parsed = urlsplit(url)
    try:
        address = ipaddress.ip_address(parsed.hostname or "")
    except ValueError:
        raise ValueError("Fixture target must use a literal loopback address") from None
    if not address.is_loopback or parsed.scheme != "http" or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise ValueError("Only isolated HTTP loopback fixture origins are supported")
    return parsed


def _path(path):
    if not isinstance(path, str) or not path.startswith("/") or path.startswith("//") or any(c in path for c in ("\r", "\n", "\\", "#")):
        raise ValueError("Fixture path must be an origin-relative HTTP path")
    return path


def _request(target, method, path, body=None, headers=None):
    if method not in ("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"):
        raise ValueError("Unsupported HTTP method")
    payload = json.dumps(body).encode() if body is not None else None
    if payload is not None and len(payload) > MAX_BODY:
        raise ValueError("Fixture request exceeds size limit")
    safe_headers = {"Content-Type": "application/json"}
    for key, value in (headers or {}).items():
        if key.lower() not in ("authorization", "x-access-token", "cookie", "x-test-identity") or not isinstance(value, str) or "\r" in value or "\n" in value:
            raise ValueError("Unsupported fixture credential header")
        safe_headers[key] = value
    connection = http.client.HTTPConnection(target.hostname, target.port or 80, timeout=5)
    try:
        connection.request(method, _path(path), body=payload, headers=safe_headers)
        response = connection.getresponse()
        content = response.read(MAX_BODY + 1)
        if len(content) > MAX_BODY:
            raise ValueError("Fixture response exceeds size limit")
        # No redirect following. Response bodies and credentials never enter reports.
        return response.status, hashlib.sha256(content).hexdigest()
    finally:
        connection.close()


def execute_suite(payload):
    if os.getenv("ARIDNOVA_ENABLE_JS_TEST_EXECUTION") != "1":
        raise ValueError("JavaScript HTTP execution is disabled; configure an isolated fixture explicitly")
    configured = os.getenv("ARIDNOVA_JS_FIXTURES")
    if not configured:
        raise ValueError("No server-owned fixture registry configured")
    config_path = Path(configured).resolve(strict=True)
    if config_path.stat().st_size > 4 * MAX_BODY:
        raise ValueError("Fixture registry is too large")
    registry = json.loads(config_path.read_text(encoding="utf-8-sig"))
    fixture = registry.get("fixtures", {}).get(payload.get("fixtureSet"))
    if not isinstance(fixture, dict) or fixture.get("isolated") is not True:
        raise ValueError("Unknown or non-isolated fixture set")
    target = _target(fixture.get("baseUrl", ""))
    response = payload.get("suite", {})
    suite = response.get("suite", response)
    if suite.get("kind") != "aridnova-parameterized-http" or suite.get("schemaVersion") != 1:
        raise ValueError("Only parameterized AridNova HTTP suites can be executed")
    if fixture.get("policyId") != suite.get("policyId"):
        raise ValueError("Fixture source policy does not match the suite")
    case_ids = payload.get("caseIds")
    cases = suite.get("cases", [])
    if case_ids is not None:
        if not isinstance(case_ids, list) or len(case_ids) > MAX_CASES:
            raise ValueError("Invalid case selection")
        cases = [case for case in cases if case.get("id") in case_ids]
        if len(cases) != len(set(case_ids)):
            raise ValueError("Case selection contains unknown or duplicated IDs")
    if len(cases) > MAX_CASES:
        raise ValueError("Select at most 500 cases per execution")
    # The lock spans ALL cases, from the first setup to the final observation.
    # Another suite must not reset state between any two requests in this suite.
    with _fixture_lock(target):
        return _execute_cases(payload, fixture, target, suite, cases)


def _execute_cases(payload, fixture, target, suite, cases):
    output = []
    for case in cases:
        case_id = case.get("id")
        item = {"id": case_id, "endpointId": case.get("endpointId"), "status": "skipped"}
        binding = fixture.get("cases", {}).get(case_id)
        if not binding or not case.get("expectedStatuses") or case.get("oracle") != "reviewed-policy":
            item["reason"] = "No reviewed status oracle or configured fixture binding"
            output.append(item)
            continue
        # Bind the exact complete case, including the expected oracle, to server config.
        fingerprint = hashlib.sha256(json.dumps(case, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()).hexdigest()
        if binding.get("caseDigest") != fingerprint:
            raise ValueError("Suite case differs from the server-approved fixture binding")
        if binding.get("method") != case.get("method"):
            raise ValueError("Fixture method does not match the source endpoint")
        observation = binding.get("stateObservation")
        denied = case.get("expectedAdmission") is False
        if denied and not observation:
            item["reason"] = "Denied requests require a fixture state observation to check side effects"
            output.append(item)
            continue
        try:
            setup = binding.get('beforeCase', [])
            if not isinstance(setup, list) or len(setup) > 3:
                raise ValueError('Fixture setup must contain at most three control requests')
            for control in setup:
                control_path = control.get('path', '')
                if control.get('method') != 'POST' or not control_path.startswith('/__fixture/'):
                    raise ValueError('Fixture setup must use an isolated fixture control path')
                control_status, _ = _request(target, 'POST', control_path, body=control.get('body', {}), headers=control.get('headers'))
                if control_status != 200:
                    raise ValueError('Fixture setup did not complete')
            before = None
            if observation:
                before_status, before = _request(target, "GET", observation["path"], headers=observation.get("headers"))
                if before_status != 200:
                    raise ValueError("Fixture state observation did not return 200")
            status, _ = _request(target, binding["method"], binding["path"], body=binding.get("body"), headers=binding.get("headers"))
            unchanged = None
            if observation:
                after_status, after = _request(target, "GET", observation["path"], headers=observation.get("headers"))
                if after_status != 200:
                    raise ValueError("Fixture state observation did not return 200")
                unchanged = before == after
            passed = status in case["expectedStatuses"] and (not denied or unchanged is True)
            item.update(status="passed" if passed else "failed", httpStatus=status, stateUnchanged=unchanged,
                        checks={"reviewedHttpStatus": status in case["expectedStatuses"], "denialHasNoObservedStateChange": unchanged if denied else None})
        except Exception:
            item.update(status="error", reason="Fixture request or state observation failed; no credentials or response body retained")
        output.append(item)
    counts = {state: sum(item["status"] == state for item in output) for state in ("passed", "failed", "error", "skipped")}
    return {"schemaVersion": 1, "analysis": "javascript-authorization-execution", "policyId": suite["policyId"],
            "fixtureSet": payload["fixtureSet"], "status": "complete" if not counts["skipped"] and not counts["error"] else "partial",
            "counts": counts, "results": output,
            "scope": "isolated configured fixture; production behavior and unobserved state are not established"}
