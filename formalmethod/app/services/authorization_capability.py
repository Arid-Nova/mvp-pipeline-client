"""Declare unsupported policy extraction before a formal verdict is computed.

Language markers identify input scope; they do not infer authorization policy.
The current formal parser only extracts Java/Spring security configuration.
"""
import re
from ..source_scope import source_languages
from typing import Any, Dict, List, Optional


_JS_LANGUAGES = {"javascript", "typescript", "jsx", "tsx"}
_CLASS_COLLECTIONS = ("controllers", "services", "repositories", "entities",
                      "unknowns", "feignClients")


def _observed_security_summary(extraction):
    """Describe recognized observations without constructing role policies."""
    if not isinstance(extraction, dict):
        return None
    aggregate = extraction.get('securityAnalysis')
    analyzer = 'aridnova-express-security'
    if (not isinstance(aggregate, dict) or aggregate.get('schemaVersion') != 1
            or aggregate.get('analyzer') != analyzer or aggregate.get('status') != 'partial'):
        return None
    reports = aggregate.get('components')
    if not isinstance(reports, list) or not reports:
        return None
    snapshots = {}
    for snapshot in extraction.get('snapshots', []):
        if not isinstance(snapshot, dict) or not isinstance(snapshot.get('component'), dict):
            return None
        c = snapshot['component']
        snapshots[(c.get('kind'), c.get('name'))] = snapshot
    included = set()
    authentication = {key: 0 for key in ('required', 'optional', 'not-observed', 'unknown')}
    endpoint_count = role_count = ownership_count = 0
    for report in reports:
        if (not isinstance(report, dict) or report.get('schemaVersion') != 1
                or report.get('analyzer') != analyzer or report.get('status') != 'partial'
                or not isinstance(report.get('endpoints'), list)):
            return None
        component = report.get('component')
        if not isinstance(component, dict):
            return None
        key = (component.get('kind'), component.get('name'))
        snapshot = snapshots.get(key)
        if snapshot is None or key in included:
            return None
        included.add(key)
        if any(component.get(field) != snapshot['component'].get(field)
               for field in ('repositoryURL', 'commit')):
            return None
        digest = report.get('sourceDigest')
        if not isinstance(digest, str) or not re.fullmatch(r'[a-fA-F0-9]{64}', digest):
            return None
        expected = {e['id']: e for e in snapshot.get('endpoints', [])}
        endpoint_ids = set()
        for endpoint in report['endpoints']:
            if not isinstance(endpoint, dict):
                return None
            auth = endpoint.get('authentication')
            if not isinstance(auth, dict) or auth.get('status') not in authentication:
                return None
            eid = endpoint.get('endpointId')
            if eid not in expected or eid in endpoint_ids:
                return None
            endpoint_ids.add(eid)
            if any(endpoint.get(field) != expected[eid].get(field) for field in ('method', 'path')):
                return None
            if any(not isinstance(endpoint.get(field), list) for field in ('roleChecks', 'ownershipChecks')):
                return None
            if any(not isinstance(check, dict) or check.get('status') not in ('enforced', 'observed', 'unknown')
                   for check in endpoint['roleChecks'] + endpoint['ownershipChecks']):
                return None
            authentication[auth['status']] += 1
            endpoint_count += 1
            role_count += len(endpoint['roleChecks'])
            ownership_count += len(endpoint['ownershipChecks'])
        if endpoint_ids != set(expected):
            return None
    if not {key for key in snapshots if key[0] == 'backend'}.issubset(included):
        return None
    return {'status': 'partial', 'analyzer': analyzer, 'componentReports': len(reports),
            'endpointRegistrations': endpoint_count, 'authentication': authentication,
            'roleCheckObservations': role_count, 'ownershipCheckObservations': ownership_count,
            'formalPolicyModelAvailable': False,
            'limitation': 'Stored AST observations only; no complete role-policy model, satisfiability verdict or permission changes are inferred.'}


def _javascript_language(value: Any) -> bool:
    return isinstance(value, str) and value.lower() in _JS_LANGUAGES


def unsupported_authorization(ir_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Return a capability limitation for JS backend inputs, including mixed IR.

Frontend-only snapshots do not invalidate an otherwise Java-only backend model.
A support flag cannot enable a parser implementation that does not exist.
"""
    languages = source_languages(ir_data)
    if languages - {'java', 'javascript', 'typescript'}:
        return {'capability_status': 'unsupported', 'unsupported_components': sorted(languages - {'java'}),
                'reason': 'Whole-system authorization verification is unsupported for these extracted languages. No Java policy model or SAT/UNSAT security verdict was computed.'}
    components: List[str] = []
    extraction = ir_data.get("javascriptExtraction") or {}
    snapshots = extraction.get("snapshots", []) if isinstance(extraction, dict) else []
    for snapshot in snapshots:
        if not isinstance(snapshot, dict):
            continue
        component = snapshot.get("component") or {}
        if component.get("kind") == "backend":
            components.append(component.get("name") or "unnamed-javascript-backend")

    for service in ir_data.get("microservices", []):
        metadata = service.get("metadata") or {}
        javascript = _javascript_language(metadata.get("language"))
        for collection in _CLASS_COLLECTIONS:
            for module in service.get(collection, []) or []:
                module_metadata = module.get("metadata") or {}
                if (module.get("type") == "JSModule"
                        or _javascript_language(module_metadata.get("language"))):
                    javascript = True
        if javascript:
            components.append(service.get("name") or "unnamed-javascript-backend")

    root_metadata = ir_data.get("metadata") or {}
    explicit_js_extractor = root_metadata.get("extractor") == "cimet-javascript" or any(_javascript_language(value) for value in root_metadata.get("languages", []))
    if not components and not explicit_js_extractor:
        return None

    response = {
        "capability_status": "unsupported",
        "unsupported_components": sorted(set(components)),
        "reason": (
            "Complete authorization-policy modeling is unavailable for JavaScript/TypeScript "
            "backends in the current formal verifier. Authentication, role-check and middleware "
            "observations do not establish the complete policies required by this solver. No SAT/UNSAT security "
            "verdict or authorization changes were computed."
        ),
    }
    try:
        observed = _observed_security_summary(extraction)
    except (TypeError, KeyError, AttributeError):
        observed = None
    if observed is not None:
        response['observed_security_evidence'] = observed
    return response
