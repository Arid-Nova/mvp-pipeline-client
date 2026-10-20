def javascript_ir():
    component = {'name': 'api', 'kind': 'backend', 'repositoryURL': 'https://example.invalid/api.git',
                 'commit': 'a' * 40}
    location = {'file': 'routes.js', 'line': 5}
    endpoint = {'endpointId': 'ep1', 'method': 'GET', 'path': '/orders/:id', 'location': location,
                'middlewareChain': [], 'authentication': {'status': 'unknown', 'evidence': []},
                'roleChecks': [], 'ownershipChecks': [], 'executionPaths': [], 'findings': []}
    finding = {'id': 'candidate1', 'ruleId': 'AUTH-CANDIDATE', 'title': 'Review authorization evidence',
               'severity': 'medium', 'confidence': 'medium', 'classification': 'review-candidate',
               'endpointId': 'ep1', 'location': location, 'evidence': [{'location': location}],
               'recommendation': 'Review the intended access policy.'}
    report = {'schemaVersion': 1, 'analyzer': 'aridnova-express-security', 'status': 'partial',
              'component': component, 'sourceDigest': 'b' * 64,
              'endpoints': [endpoint], 'findings': [finding], 'coverage': {'endpointCount': 1},
              'limitations': ['Source observations only.']}
    return {'microservices': [{'name': 'api', 'controllers': [{'type': 'JSModule'}]}],
            'javascriptExtraction': {'snapshots': [{'component': component,
                'endpoints': [{'id': 'ep1', 'method': 'GET', 'path': '/orders/:id'}]}],
                'securityAnalysis': {'schemaVersion': 1, 'analyzer': 'aridnova-express-security',
                                     'status': 'partial', 'components': [report]}}}
