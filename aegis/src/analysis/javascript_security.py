"""Validate and expose saved Express AST evidence without running source or models."""
from copy import deepcopy
import re
from typing import Any, Dict, Optional

from .input_capability import unsupported_source_analysis

ANALYZER = 'aridnova-express-security'
AUTH_STATUSES = {'required', 'optional', 'not-observed', 'unknown'}
CHECK_STATUSES = {'enforced', 'observed', 'unknown'}


def _nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def _component_key(component):
    if not isinstance(component, dict):
        raise ValueError('component identity is missing')
    if not _nonempty(component.get('name')) or component.get('kind') not in ('backend', 'frontend'):
        raise ValueError('component name/kind is invalid')
    return component['kind'], component['name']


def _location(location):
    return (isinstance(location, dict) and _nonempty(location.get('file'))
            and isinstance(location.get('line'), int) and not isinstance(location['line'], bool)
            and location['line'] > 0)


def _validate_report(report, snapshot):
    if (report.get('schemaVersion') != 1 or report.get('analyzer') != ANALYZER
            or report.get('status') not in ('partial', 'complete')):
        raise ValueError('unsupported component report schema, analyzer or status')
    component = report['component']
    for key in ('name', 'kind', 'repositoryURL', 'commit'):
        if not _nonempty(component.get(key)) or component[key] != snapshot['component'].get(key):
            raise ValueError('security report does not match stored component provenance')
    if not re.fullmatch(r'[a-fA-F0-9]{64}', report.get('sourceDigest', '') or ''):
        raise ValueError('source digest is missing or invalid')
    if (not isinstance(report.get('coverage'), dict)
            or not isinstance(report.get('limitations'), list)
            or not all(isinstance(item, str) for item in report['limitations'])):
        raise ValueError('coverage or limitations are missing')
    endpoints, findings = report.get('endpoints'), report.get('findings')
    if not isinstance(endpoints, list) or not isinstance(findings, list):
        raise ValueError('endpoints or findings are missing')
    expected = {item['id']: item for item in snapshot.get('endpoints', [])}
    ids = set()
    for endpoint in endpoints:
        if not isinstance(endpoint, dict) or endpoint.get('endpointId') not in expected:
            raise ValueError('security endpoint is not present in stored extraction')
        eid = endpoint['endpointId']
        if eid in ids:
            raise ValueError('duplicate security endpoint')
        ids.add(eid)
        original = expected[eid]
        if endpoint.get('method') != original.get('method') or endpoint.get('path') != original.get('path'):
            raise ValueError('security endpoint method/path differs from stored extraction')
        if not _location(endpoint.get('location')):
            raise ValueError('endpoint source location is missing')
        auth = endpoint.get('authentication')
        if (not isinstance(auth, dict) or auth.get('status') not in AUTH_STATUSES
                or not isinstance(auth.get('evidence'), list)):
            raise ValueError('authentication evidence is missing or invalid')
        for field in ('middlewareChain', 'roleChecks', 'ownershipChecks', 'executionPaths', 'findings'):
            if not isinstance(endpoint.get(field), list):
                raise ValueError('endpoint evidence collection is missing')
        for check in endpoint['roleChecks'] + endpoint['ownershipChecks']:
            if not isinstance(check, dict) or check.get('status') not in CHECK_STATUSES:
                raise ValueError('authorization check status is invalid')
    if ids != set(expected):
        raise ValueError('security report omits extracted endpoint registrations')
    if report['status'] == 'complete':
        properties = ('authentication', 'roleChecks', 'ownershipChecks', 'executionPaths', 'dataAccess', 'policyModel')
        if (report.get('completionScope') != 'declared-static-security-properties'
                or report.get('applicationAssembly', {}).get('status') != 'complete'
                or not endpoints
                or any(report.get('capabilities', {}).get(p, {}).get('status') not in ('complete', 'not-applicable') for p in properties)):
            raise ValueError('complete report lacks declared property and assembly coverage')
        for endpoint in endpoints:
            if endpoint.get('reachability') == 'inactive':
                continue
            coverage = endpoint.get('analysisCoverage', {})
            if (endpoint.get('reachability') != 'active' or coverage.get('globalMountResolution') != 'resolved'
                    or coverage.get('boundsReached') or endpoint['authentication']['status'] == 'unknown'
                    or any(coverage.get('capabilities', {}).get(p, {}).get('status') != 'complete' for p in properties)):
                raise ValueError('complete report contains an unresolved active endpoint property')
    finding_ids = set()
    for finding in findings:
        if not isinstance(finding, dict):
            raise ValueError('finding must be an object')
        for field in ('id', 'ruleId', 'title', 'severity', 'confidence', 'classification', 'recommendation'):
            if not _nonempty(finding.get(field)):
                raise ValueError('finding metadata is missing')
        if finding['id'] in finding_ids:
            raise ValueError('duplicate finding identifier')
        finding_ids.add(finding['id'])
        if finding.get('endpointId') not in ids or not _location(finding.get('location')):
            raise ValueError('finding is not associated with an extracted endpoint location')
        if not isinstance(finding.get('evidence'), list) or not finding['evidence']:
            raise ValueError('finding has no supporting evidence')


def javascript_security_response(ir_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Return JS-only partial evidence, unsupported for invalid JS IR, or None for Java."""
    unsupported = unsupported_source_analysis(ir_data)
    if unsupported and unsupported.get('languages'):
        return unsupported
    extraction = ir_data.get('javascriptExtraction')
    if not isinstance(extraction, dict):
        return unsupported
    try:
        aggregate = extraction.get('securityAnalysis')
        if (not isinstance(aggregate, dict) or aggregate.get('schemaVersion') != 1
                or aggregate.get('analyzer') != ANALYZER or aggregate.get('status') not in ('partial', 'complete')):
            raise ValueError('versioned Express security evidence is unavailable')
        snapshots = {_component_key(item.get('component')): item for item in extraction.get('snapshots', [])}
        reports = aggregate.get('components')
        if not isinstance(reports, list) or not reports:
            raise ValueError('component security reports are unavailable')
        included = set()
        for report in reports:
            if not isinstance(report, dict):
                raise ValueError('component security report must be an object')
            key = _component_key(report.get('component'))
            if key not in snapshots or key in included:
                raise ValueError('unknown or duplicate component security report')
            _validate_report(report, snapshots[key])
            included.add(key)
        expected_backends = {key for key in snapshots if key[0] == 'backend'}
        if not expected_backends or not expected_backends.issubset(included):
            raise ValueError('security evidence is missing for a declared JavaScript backend')
    except (ValueError, TypeError, KeyError, AttributeError) as error:
        return {**(unsupported or {}), 'status': 'unsupported', 'capability': 'source-security-analysis',
                'findings': [], 'reason': f'JavaScript security report unavailable: {error}. No source analysis or model call was performed.'}

    components = deepcopy(reports)
    endpoints, findings = [], []
    for report in components:
        for endpoint in report['endpoints']:
            endpoints.append({**endpoint, 'component': report['component']['name']})
        for finding in report['findings']:
            findings.append({**finding, 'component': report['component']['name']})
    auth_counts = {status: sum(e['authentication']['status'] == status for e in endpoints)
                   for status in sorted(AUTH_STATUSES)}
    known_js = {key[1] for key in expected_backends}
    other_backends = sorted({service.get('name', 'unnamed-backend')
                             for service in ir_data.get('microservices', [])
                             if service.get('name') not in known_js})
    limitations = sorted({item for report in components for item in report['limitations']} | {
        'Completion applies to declared static properties and the selected application graph; runtime exploitability and complete vulnerability coverage are separate.',
        'Not-observed and unknown authentication evidence do not mean public access or a confirmed vulnerability.',
        'Java components, runtime configuration, external enforcement and deployment behavior are outside this report.',
        'The supplied source digest records analyzer provenance; this reader does not re-read or execute source files.',
    })
    return {
        'status': 'complete' if all(r['status'] == 'complete' for r in reports) and not other_backends else 'partial',
        'schemaVersion': 1, 'analyzer': ANALYZER,
        'analysis': 'javascript-express-static-security', 'capability': 'source-security-analysis',
        'components': components, 'endpoints': endpoints, 'findings': findings,
        'capabilities': {r['component']['name']: r.get('capabilities', {}) for r in reports},
        'applicationAssembly': {r['component']['name']: r.get('applicationAssembly', {}) for r in reports},
        'completionScope': 'declared-static-security-properties',
        'coverage': {'componentReports': len(components), 'endpointRegistrations': len(endpoints),
                     'findingCount': len(findings), 'authentication': auth_counts,
                     'roleCheckObservations': sum(len(e['roleChecks']) for e in endpoints),
                     'ownershipCheckObservations': sum(len(e['ownershipChecks']) for e in endpoints)},
        'scope': {'language': 'JavaScript/TypeScript', 'framework': 'Express',
                  'unassessedBackendComponents': other_backends, 'runtimeValidation': False,
                  'completeVulnerabilityCoverage': False},
        'limitations': limitations, 'persistence': 'Evidence retained in the saved source IR; no additional analysis record written.',
    }
