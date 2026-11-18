"""Declare unsupported policy extraction before a formal verdict is computed.

Language markers identify input scope; they do not infer authorization policy.
The current formal parser only extracts Java/Spring security configuration.
"""
import re
from ..source_scope import source_languages
from typing import Any, Dict, List, Optional


_JS_LANGUAGES = {"javascript", "typescript"}


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
    backend_languages: set[str] = set()
    frontend_languages: set[str] = set()
    frontend_evidence = False
    extraction = ir_data.get("javascriptExtraction") or {}
    snapshots = extraction.get("snapshots", []) if isinstance(extraction, dict) else []
    for snapshot in snapshots:
        if not isinstance(snapshot, dict):
            continue
        component = snapshot.get("component") or {}
        if component.get("kind") == "backend":
            components.append(component.get("name") or "unnamed-javascript-backend")
        elif component.get("kind") == "frontend":
            frontend_evidence = True
            for file in snapshot.get('files', []):
                if isinstance(file, dict):
                    frontend_languages.update(source_languages({'orphans': [{'filePath': file.get('path')}]}))

    for service in ir_data.get("microservices", []):
        # Apply the same normalized evidence rules as the other service guards,
        # including physical source paths and service-level language arrays.
        service_languages = source_languages({'microservices': [service]})
        backend_languages.update(service_languages)
        if service_languages & _JS_LANGUAGES:
            components.append(service.get("name") or "unnamed-javascript-backend")

    for orphan in ir_data.get('orphans', []):
        orphan_languages = source_languages({'orphans': [orphan]}) & _JS_LANGUAGES
        if not orphan_languages:
            continue
        # An orphan is not inherently frontend code. The native projection
        # carries this explicit boundary marker for registered frontend roots.
        if (orphan.get('metadata') or {}).get('componentKind') == 'frontend':
            frontend_evidence = True
            frontend_languages.update(orphan_languages)
        else:
            components.append(orphan.get('name') or 'unclassified-javascript-source')

    root_metadata = ir_data.get("metadata") or {}
    # The plural field is an aggregate over backend AND frontend files in
    # IRService. Exempt only languages accounted for by frontend observations;
    # scalar/legacy extractor markers still declare an unsupported source scope.
    aggregate_languages = source_languages({'metadata': {'languages': root_metadata.get('languages', [])}})
    scalar_languages = source_languages({'metadata': {'language': root_metadata.get('language')}})
    explicit_js_extractor = (root_metadata.get("extractor") == "cimet-javascript"
                             or bool(scalar_languages & _JS_LANGUAGES))
    unexplained_root_languages = (aggregate_languages & _JS_LANGUAGES) - frontend_languages
    javascript_observed = bool(languages & _JS_LANGUAGES) or explicit_js_extractor
    frontend_only = frontend_evidence and backend_languages == {'java'}
    if (not components and not explicit_js_extractor and not unexplained_root_languages
            and (not javascript_observed or frontend_only)):
        return None

    response = {
        "capability_status": "unsupported",
        "unsupported_components": sorted(set(components)),
        "reason": (
            "Complete authorization-policy modeling is unavailable for JavaScript/TypeScript "
            "source outside a declared frontend-only scope in the current formal verifier. Authentication, role-check and middleware "
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
