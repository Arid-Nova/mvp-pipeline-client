"""Finite, source-bound Express policy analysis. No source execution or role defaults.

This module is vendored into the five services by sync.py. Only the formal stage
imports Z3; generation and execution have no model-provider dependency.
"""
from __future__ import annotations

import hashlib
import itertools
import json
import math
import re
from collections import Counter
from typing import Any

SCHEMA = "javascript-authorization-policy"
MAX_ENDPOINTS = 10000
MAX_STATES = 4096
MAX_TOTAL_STATES = 100000


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()).hexdigest()


def reports_from(value):
    """Accept a report, report aggregate, native IR, or component index."""
    if not isinstance(value, dict):
        raise ValueError("report must be a JSON object")
    extraction = value.get("javascriptExtraction")
    if isinstance(extraction, dict):
        return reports_from(extraction.get("securityAnalysis", {}))
    if value.get("analyzer") == "aridnova-express-security" and isinstance(value.get("endpoints"), list):
        return [value]
    components = value.get("components")
    if isinstance(components, list) and components:
        return components
    raise ValueError("No source-bound Express security reports found; regenerate source analysis")


def _same(a, b):
    # JavaScript strict equality must not equate Python True with numeric 1.
    if type(a) in (int, float) and type(b) in (int, float):
        return a == b
    return type(a) is type(b) and a == b


def validate_predicate(node, dimensions, depth=0):
    if depth > 32 or not isinstance(node, dict):
        raise ValueError("Invalid or excessively deep policy predicate")
    op = node.get("op")
    if op in ("true", "false", "unknown"):
        return
    if op == "eq":
        field = node.get("field")
        if field not in dimensions or not any(_same(node.get("value"), x) for x in dimensions[field]):
            raise ValueError("Predicate references an undeclared dimension or value")
        return
    if op == "not":
        validate_predicate(node.get("arg"), dimensions, depth + 1)
        return
    if op in ("and", "or") and isinstance(node.get("args"), list) and 0 < len(node["args"]) <= 128:
        for child in node["args"]:
            validate_predicate(child, dimensions, depth + 1)
        return
    raise ValueError("Unsupported policy predicate operator")


def evaluate(node, assignment):
    op = node["op"]
    if op == "unknown":
        return None
    if op in ("true", "false"):
        return op == "true"
    if op == "eq":
        return _same(assignment[node["field"]], node["value"])
    if op == "not":
        value = evaluate(node["arg"], assignment)
        return None if value is None else not value
    values = [evaluate(n, assignment) for n in node["args"]]
    if op == "and":
        return False if False in values else (None if None in values else True)
    return True if True in values else (None if None in values else False)


def _has_unknown(node):
    return node.get("op") == "unknown" or any(_has_unknown(v) for v in node.get("args", [])) or (
        node.get("op") == "not" and _has_unknown(node["arg"]))


def _dimensions(model):
    dims = model.get("dimensions", {"token": ["missing", "invalid", "expired", "valid"]})
    if not isinstance(dims, dict) or not dims or len(dims) > 16:
        raise ValueError("Policy dimensions must contain 1 to 16 finite domains")
    for name, values in dims.items():
        if not isinstance(name, str) or not name or len(name) > 200 or not isinstance(values, list) or not values or len(values) > 64:
            raise ValueError("Invalid finite domain")
        if any(type(v) not in (str, int, float, bool, type(None)) or type(v) is float and not math.isfinite(v) for v in values):
            raise ValueError("Domain values must be strings, integers, Booleans or null")
        if any(_same(value, other) for i, value in enumerate(values) for other in values[:i]):
            raise ValueError("Duplicate finite domain values")
    return dict(sorted(dims.items()))


def merge_expected_dimensions(dimensions, wanted):
    """Reviewed policy may introduce roles/relationships absent from source guards."""
    result = {key: list(values) for key, values in dimensions.items()}
    extra = _dimensions({'dimensions': wanted['dimensions']}) if wanted and wanted.get('dimensions') else {}
    for key, values in extra.items():
        result.setdefault(key, [])
        result[key].extend(v for v in values if not any(_same(v, old) for old in result[key]))
    return _dimensions({'dimensions': result})


def _reviewed_manifest(manifest, reports):
    if manifest is None:
        return {}
    if (not isinstance(manifest, dict) or manifest.get("schemaVersion") != 1
            or not isinstance(manifest.get("reviewedBy"), str) or not manifest["reviewedBy"].strip()
            or not isinstance(manifest.get("reviewedAt"), str) or not manifest["reviewedAt"].strip()):
        raise ValueError("Expected policy requires schemaVersion, reviewedBy and reviewedAt")
    known = {(r["component"]["name"], r["component"].get("commit"), r["sourceDigest"]): r for r in reports}
    result = {}
    for comp in manifest.get("components", []):
        key = (comp.get("name"), comp.get("commit"), comp.get("sourceDigest"))
        if key not in known:
            raise ValueError("Expected policy source digest or component revision does not match the report")
        endpoint_ids = {e["endpointId"] for e in known[key]["endpoints"]}
        for endpoint in comp.get("endpoints", []):
            epkey = (key, endpoint.get("endpointId"))
            if endpoint.get("endpointId") not in endpoint_ids or epkey in result:
                raise ValueError("Expected policy has an unknown or duplicated endpoint")
            if not isinstance(endpoint.get("allow"), dict):
                raise ValueError("Expected endpoint policy requires an allow predicate")
            for status_key in ("allowedStatuses", "deniedStatuses"):
                if status_key in endpoint and (not isinstance(endpoint[status_key], list) or not endpoint[status_key] or any(type(s) is not int or not 100 <= s <= 599 for s in endpoint[status_key])):
                    raise ValueError("Expected HTTP statuses must be explicit integer status codes")
            if endpoint.get('resourceBindingStatus') == 'bound-native-fixture':
                evidence = endpoint.get('resourceBinding', {}).get('nativeVerification', {})
                if (evidence.get('sourceDigest') != key[2] or evidence.get('endpointId') != endpoint.get('endpointId')
                        or evidence.get('status') != 'verified-within-declared-fixture'
                        or evidence.get('databaseFamily') not in ('MySQL', 'MariaDB')
                        or type(evidence.get('assessedCases')) is not int or evidence['assessedCases'] <= 0
                        or evidence.get('unassessedCases') != 0
                        or not re.fullmatch(r'[0-9a-f]{64}', evidence.get('runtimeResultsSha256', ''))
                        or evidence.get('executionPathScope') != 'declared-synthetic-branches'):
                    raise ValueError('Native resource binding needs matching source-bound native runtime evidence')
            result[epkey] = endpoint
    return result


def resource_binding_resolved(wanted):
    """Validated native fixture evidence remains scoped; unknown labels fail closed."""
    if not wanted or 'resourceBindingStatus' not in wanted:
        return True  # Legacy reviewed manifests need not declare resource policies.
    return wanted['resourceBindingStatus'] in ('bound-selected-fixture', 'bound-native-fixture')


def compile_policy(report, expected_policy=None):
    reports = reports_from(report)
    unassessed = []
    extraction = report.get("javascriptExtraction", {})
    analyzed_names = {r.get("component", {}).get("name") for r in reports}
    for snapshot in extraction.get("snapshots", []):
        component = snapshot.get("component", {})
        if component.get("kind") == "backend" and component.get("name") not in analyzed_names:
            unassessed.append(component.get("name", "unnamed-backend"))
    for service in report.get("microservices", []):
        if service.get("name") not in analyzed_names:
            unassessed.append(service.get("name", "unnamed-service"))
    seen = set()
    total = 0
    for source in reports:
        component = source.get("component", {})
        if (source.get("analyzer") != "aridnova-express-security" or source.get("schemaVersion") != 1
                or not component.get("name") or component.get("kind") != "backend"
                or not isinstance(component.get("commit"), str) or not component["commit"]
                or not re.fullmatch(r"[0-9a-f]{64}", source.get("sourceDigest", ""))):
            raise ValueError("Invalid source report identity or digest")
        if not isinstance(source.get("endpoints"), list):
            raise ValueError("Source report requires endpoint records")
        for endpoint in source["endpoints"]:
            key = (component["name"], component.get("commit"), source["sourceDigest"], endpoint.get("endpointId"))
            if not endpoint.get("endpointId") or key in seen:
                raise ValueError("Missing or duplicate endpoint identity")
            seen.add(key)
            total += 1
    if total > MAX_ENDPOINTS:
        raise ValueError("Too many endpoint records")
    expected = _reviewed_manifest(expected_policy, reports)
    endpoints = []
    total_states = 0
    for source in reports:
        component = source["component"]
        component_key = (component["name"], component.get("commit"), source["sourceDigest"])
        for ep in source["endpoints"]:
            model = ep.get("policyModel") or {}
            wanted = expected.get((component_key, ep["endpointId"]))
            dims = merge_expected_dimensions(_dimensions(model), wanted)
            admission = model.get("admission", {"op": "unknown"})
            validate_predicate(admission, dims)
            coverage = ep.get("analysisCoverage", {})
            reachability = ep.get("reachability", coverage.get("reachability", "unknown"))
            inactive = reachability == "inactive"
            reasons = list(model.get("unknownReasons", []))
            assembly = ep.get("applicationAssembly", source.get("applicationAssembly", {}))
            startup_complete = (coverage.get("globalMountResolution") in ("complete", "resolved")
                                and coverage.get("registration") in ("resolved", "complete", "matched")
                                and reachability == "active"
                                and assembly.get("status") in ("resolved", "complete"))
            if not startup_complete:
                reasons.append("Application registration or global middleware order is unresolved")
            path_complete = model.get("admissionStatus", model.get("status")) == "complete" and not coverage.get("boundsReached")
            if not path_complete:
                reasons.append("Admission execution paths are not completely modeled")
            eligible = startup_complete and path_complete and not _has_unknown(admission)
            if wanted:
                validate_predicate(wanted["allow"], dims)
                if _has_unknown(wanted["allow"]):
                    raise ValueError("Reviewed expected policy cannot contain unknown predicates")
                if wanted.get('stateConstraint'):
                    validate_predicate(wanted['stateConstraint'], dims)
                    if _has_unknown(wanted['stateConstraint']): raise ValueError('State constraints must be explicit')
            operations = []
            operation_ids = {operation.get("id") for operation in model.get("operations", [])}
            if wanted and any(key not in operation_ids for key in wanted.get("operations", {})):
                raise ValueError("Expected policy references an operation absent from the source model")
            for operation in model.get("operations", []):
                predicate = operation.get("predicate", {"op": "unknown"})
                validate_predicate(predicate, dims)
                op_complete = eligible and model.get("status") == "complete" and operation.get("status", "complete") == "complete" and not _has_unknown(predicate)
                op_expected = (wanted or {}).get("operations", {}).get(operation.get("id"))
                if op_expected:
                    validate_predicate(op_expected, dims)
                    if _has_unknown(op_expected):
                        raise ValueError("Reviewed operation policy cannot contain unknown predicates")
                operations.append({**operation, "predicate": predicate, "eligible": op_complete, "expected": op_expected})
            state_count = 1
            for domain in dims.values():
                state_count *= len(domain)
            total_states += min(state_count, MAX_STATES)
            if inactive:
                states = []
            elif state_count > MAX_STATES or total_states > MAX_TOTAL_STATES:
                eligible = False
                reasons.append("Finite policy state budget exceeded")
                states = []
            else:
                states = [dict(zip(dims, row)) for row in itertools.product(*dims.values())]
                if wanted and wanted.get('stateConstraint'):
                    states = [s for s in states if evaluate(wanted['stateConstraint'], s) is True]
            records = []
            for state in states:
                observed = evaluate(admission, state) if eligible else None
                intended = evaluate(wanted["allow"], state) if wanted else None
                records.append({"state": state, "observedAdmission": observed, "expectedAdmission": intended})
            endpoints.append({
                "endpointId": ep["endpointId"], "component": component, "sourceDigest": source["sourceDigest"],
                "method": ep.get("method"), "path": ep.get("path"), "location": ep.get("location"),
                "status": "not-applicable" if inactive else ("complete" if eligible else "unknown"), "eligible": eligible,
                "reachability": reachability,
                "dimensions": dims, "admission": admission, "operations": operations,
                "authorizationEnvelope": model.get('authorizationEnvelope') if startup_complete and not inactive else None,
                "startupComplete": startup_complete,
                "expectedPolicy": wanted, "expectedPolicyStatus": "reviewed" if wanted else "not-provided",
                "unknownReasons": list(dict.fromkeys(str(x) for x in reasons)), "states": records,
            })
    eligible_count = sum(e["eligible"] for e in endpoints)
    inactive_count = sum(e["status"] == "not-applicable" for e in endpoints)
    status = "complete" if endpoints and eligible_count + inactive_count == len(endpoints) and not unassessed else ("partial" if eligible_count else "unknown")
    sources = [{"component": r["component"], "sourceDigest": r["sourceDigest"], "applicationAssembly": r.get("applicationAssembly")} for r in reports]
    identity = {"sources": sources, "endpoints": endpoints, "expectedPolicy": expected_policy}
    return {"schemaVersion": 1, "analysis": SCHEMA, "policyId": digest(identity), "status": status,
            "scope": "finite-source-model", "sources": sources, "endpoints": endpoints,
            "coverage": {"endpoints": len(endpoints), "eligibleEndpoints": eligible_count,
                         "inactiveEndpoints": inactive_count,
                         "unknownEndpoints": len(endpoints) - eligible_count - inactive_count,
                         "unassessedComponents": list(dict.fromkeys(unassessed)),
                         "reviewedPolicies": sum(e["expectedPolicy"] is not None for e in endpoints),
                         "boundResourcePolicies": sum((e['expectedPolicy'] or {}).get('resourceBindingStatus') in ('bound-selected-fixture', 'bound-native-fixture') for e in endpoints),
                         "nativeDatabaseBoundPolicies": sum((e['expectedPolicy'] or {}).get('resourceBindingStatus') == 'bound-native-fixture' for e in endpoints),
                         "unresolvedResourcePolicies": sum(bool(e['expectedPolicy']) and not resource_binding_resolved(e['expectedPolicy']) for e in endpoints)},
            "limitations": ["Model results cover the declared finite abstraction and analyzed source revision.",
                            "No expected policy means no policy-conformance or security verdict.",
                            "Static admission predicates do not verify token issuance, cryptography or deployed configuration."]}


def _public(policy):
    return {k: v for k, v in policy.items() if k != "endpoints"}


def _endpoint_public(endpoint):
    return {k: v for k, v in endpoint.items() if k not in ("states",)}


def generate_vectors(report, expected_policy=None):
    policy = compile_policy(report, expected_policy)
    result = _public(policy)
    result["endpoints"] = [_endpoint_public(e) for e in policy["endpoints"]]
    result["vectors"] = [{"endpointId": e["endpointId"], "component": e["component"], "sourceDigest": e["sourceDigest"],
                          "status": e["status"], "dimensions": e["dimensions"], "cases": e["states"]} for e in policy["endpoints"]]
    return result


def verify_authorization_envelope(endpoint):
    """Produce review candidates from sound upper bounds without inventing verdicts."""
    import z3
    envelope, wanted = endpoint.get('authorizationEnvelope'), endpoint.get('expectedPolicy')
    if not envelope or not wanted or envelope.get('scope') != 'conservative-authorization-control':
        return []
    dimensions = endpoint['dimensions']
    variables = {k: z3.Int('envelope_d' + str(i)) for i, k in enumerate(dimensions)}
    domain = [z3.And(variables[k] >= 0, variables[k] < len(v)) for k, v in dimensions.items()]
    def encode(node):
        validate_predicate(node, dimensions)
        op = node['op']
        if op in ('true', 'false'): return z3.BoolVal(op == 'true')
        if op == 'eq': return variables[node['field']] == next(i for i, v in enumerate(dimensions[node['field']]) if _same(v, node['value']))
        if op == 'not': return z3.Not(encode(node['arg']))
        if op in ('and', 'or'): return (z3.And if op == 'and' else z3.Or)(*[encode(x) for x in node['args']])
        raise ValueError('Authorization envelopes must contain no unknown predicates')
    checks = []
    if wanted.get('stateConstraint'): domain.append(encode(wanted['stateConstraint']))
    predicates = [('admission', envelope.get('mayPermit'))] + [(str(o['id']), o.get('mayReach')) for o in envelope.get('operations', [])]
    for name, predicate in predicates:
        if predicate is None: continue
        solver = z3.Solver(); solver.set(timeout=2000)
        expected = wanted.get('operations', {}).get(name) or wanted['allow']
        solver.add(*domain, encode(predicate), z3.Not(encode(expected)))
        answer = solver.check()
        result = {'property': 'possible-overpermission:' + name, 'solverResult': str(answer),
                  'scope': 'conservative-authorization-control', 'conclusiveViolation': False,
                  'interpretation': 'SAT is a candidate for an isolated runtime test; unresolved source semantics may make the candidate infeasible. UNSAT excludes this candidate within the stated upper bound.'}
        if answer == z3.sat:
            model = solver.model()
            result['witness'] = {k: values[model.eval(variables[k], model_completion=True).as_long()] for k, values in dimensions.items()}
        checks.append(result)
    return checks


def verify_policy(report, expected_policy=None):
    import z3
    policy = compile_policy(report, expected_policy)
    results = []
    for ep in policy["endpoints"]:
        result = {"endpointId": ep["endpointId"], "component": ep["component"], "status": "not-applicable" if ep["status"] == "not-applicable" else "unknown",
                  "expectedPolicyStatus": ep["expectedPolicyStatus"], "checks": [], "unknownReasons": ep["unknownReasons"]}
        binding_unresolved = ep['expectedPolicy'] and not resource_binding_resolved(ep['expectedPolicy'])
        if not ep["eligible"] or binding_unresolved:
            result['partialChecks'] = verify_authorization_envelope(ep)
            if result['partialChecks']:
                result['status'] = 'partial'
                result['conformance'] = 'unknown-resource-binding' if binding_unresolved else 'unknown-partial-source-model'
            results.append(result)
            continue
        variables = {k: z3.Int("d" + str(i)) for i, k in enumerate(ep["dimensions"])}
        domain = [z3.And(variables[k] >= 0, variables[k] < len(v)) for k, v in ep["dimensions"].items()]

        def encode(node):
            op = node["op"]
            if op in ("true", "false"):
                return z3.BoolVal(op == "true")
            if op == "eq":
                index = next(i for i, x in enumerate(ep["dimensions"][node["field"]]) if _same(x, node["value"]))
                return variables[node["field"]] == index
            if op == "not":
                return z3.Not(encode(node["arg"]))
            if op in ("and", "or"):
                return (z3.And if op == "and" else z3.Or)(*[encode(v) for v in node["args"]])
            raise ValueError("Unknown predicate cannot be submitted to the solver")

        def check(name, formula, interpretation):
            solver = z3.Solver()
            solver.set(timeout=2000)
            solver.add(*domain, formula)
            answer = solver.check()
            output = {"property": name, "solverResult": str(answer), "interpretation": interpretation}
            if answer == z3.sat:
                m = solver.model()
                output["witness"] = {k: values[m.eval(variables[k], model_completion=True).as_long()] for k, values in ep["dimensions"].items()}
            if answer == z3.unknown:
                output["reason"] = "Solver could not decide the finite model within its budget"
            return output

        if ep['expectedPolicy'] and ep['expectedPolicy'].get('stateConstraint'): domain.append(encode(ep['expectedPolicy']['stateConstraint']))
        observed = encode(ep["admission"])
        result["checks"].append(check("observed-admission-reachability", observed, "SAT means an admitted state exists in the source model; it is not a security verdict"))
        expected = ep["expectedPolicy"]
        if expected:
            intended = encode(expected["allow"])
            bypass = check("policy-overpermission", z3.And(observed, z3.Not(intended)), "SAT is a modeled admission contrary to the reviewed policy; UNSAT means no such state in this finite model")
            restriction = check("policy-overrestriction", z3.And(intended, z3.Not(observed)), "SAT is a reviewed allowed state denied by the model")
            result["checks"].append(bypass)
            if expected.get('conformanceMode') != 'authorization-only':
                result["checks"].append(restriction)
            for operation in ep["operations"]:
                if not operation["eligible"]:
                    result["checks"].append({"property": "operation-policy:" + str(operation.get("id")), "solverResult": "unknown", "reason": "Operation reachability is unresolved"})
                    continue
                allowed = operation.get("expected") or expected["allow"]
                result["checks"].append(check("operation-policy:" + str(operation.get("id")), z3.And(encode(operation["predicate"]), z3.Not(encode(allowed))), "SAT means a modeled protected operation is reachable outside the reviewed policy"))
            relevant = result["checks"][1:]
            result["conformance"] = "violated" if any(c["solverResult"] == "sat" for c in relevant) else ("unknown" if any(c["solverResult"] == "unknown" for c in relevant) else "holds-within-model")
        else:
            result["conformance"] = "not-assessed-no-expected-policy"
        result["status"] = "complete" if all(c["solverResult"] != "unknown" for c in result["checks"]) else "partial"
        results.append(result)
    response = _public(policy)
    response["endpoints"] = [_endpoint_public(e) for e in policy["endpoints"]]
    response["verification"] = results
    response["solver"] = "z3"
    return response


def generate_scenarios(report, expected_policy=None):
    policy = compile_policy(report, expected_policy)
    scenarios = []
    for endpoint in policy["endpoints"]:
        for state in endpoint["states"]:
            scenario = {"endpointId": endpoint["endpointId"], "component": endpoint["component"]["name"],
                        "sourceDigest": endpoint["sourceDigest"], "method": endpoint["method"], "path": endpoint["path"],
                        **state, "oracle": "reviewed-policy" if endpoint["expectedPolicy"] else "observation-only"}
            scenario["id"] = digest({"policyId": policy["policyId"], **scenario})[:32]
            wanted = endpoint["expectedPolicy"] or {}
            statuses = wanted.get("allowedStatuses" if state["expectedAdmission"] else "deniedStatuses")
            scenario["expectedStatuses"] = statuses if state["expectedAdmission"] is not None else None
            scenario["executionRequirement"] = "isolated-fixture-and-explicit-status-oracle"
            scenarios.append(scenario)
    response = _public(policy)
    response["endpoints"] = [_endpoint_public(e) for e in policy["endpoints"]]
    response["scenarios"] = scenarios
    response["count"] = len(scenarios)
    return response


def generate_suite(report, expected_policy=None):
    response = generate_scenarios(report, expected_policy)
    scenarios = response.pop("scenarios")
    response["suite"] = {"schemaVersion": 1, "kind": "aridnova-parameterized-http", "policyId": response["policyId"],
                         "sources": response["sources"], "cases": scenarios,
                         "execution": "disabled-until-server-configured-isolated-fixture",
                         "requiresStateObservationForDenials": True}
    response["generated"] = len(scenarios)
    response["executableWithOracle"] = sum(bool(s["expectedStatuses"]) for s in scenarios)
    return response


def policy_template(report):
    """Draft for a maintainer; it deliberately is not an approved policy."""
    return {"schemaVersion": 1, "reviewedBy": None, "reviewedAt": None,
            "components": [{"name": r["component"]["name"], "commit": r["component"].get("commit"),
                            "sourceDigest": r["sourceDigest"],
                            "endpoints": [{"endpointId": e["endpointId"], "method": e.get("method"), "path": e.get("path"),
                                           "allow": {"op": "unknown"}, "allowedStatuses": [], "deniedStatuses": []} for e in r["endpoints"]]} for r in reports_from(report)]}
