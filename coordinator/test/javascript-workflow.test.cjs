const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(require.resolve('typescript', { paths: [path.join(root, 'javascript-security')] }));
const source = fs.readFileSync(path.join(root, 'javascript-workflow/workflow.ts'), 'utf8');
const exported = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exported });
const { runJavaScriptStage, compareJavaScriptEvidence } = exported;
const report = { status: 'partial', components: [] };

test('JS stages preserve source reports and bypass legacy role/vector/LLM dispatch', async () => {
    const calls = [];
    let payload = { irJson: { javascriptExtraction: { securityAnalysis: report } } };
    const post = async (service, route, body) => { calls.push({ service, route, body }); return { status: 'partial', analysis: 'javascript-authorization-policy' }; };
    for (const stage of ['FORMAL_VERIFY', 'SCENARIO_GENERATE', 'PROMPT_GENERATE', 'TEST_GENERATE', 'TEST_EXECUTOR']) {
        const output = await runJavaScriptStage(stage, payload, {}, post);
        assert.ok(output); payload = output.payload;
    }
    assert.deepEqual(calls.map(x => x.route), ['/verify/javascript', '/scenarios/javascript', '/testsuites/javascript']);
    assert.ok(calls.every(x => x.body.report === report));
    assert.equal(payload.javascriptAnalysis.executed, false);
    assert.equal(payload.javascriptAnalysis.status, 'awaiting-fixtures');
});

test('explicit isolated fixture ID reaches only declarative execution API', async () => {
    const suite = { analysis: 'javascript-authorization-policy' };
    let sent;
    const caseIds = ['approved-source-case'];
    await runJavaScriptStage('TEST_EXECUTOR', { javascriptReport: report, javascriptSuite: suite }, { fixtureSet: 'isolated-fixture', caseIds }, async (...args) => { sent = args; return { status: 'completed' }; });
    assert.equal(sent[0], 'EXECUTOR'); assert.equal(sent[1], '/api/execute/javascript');
    assert.equal(sent[2].fixtureSet, 'isolated-fixture'); assert.equal(sent[2].suite, suite);
    assert.equal(sent[2].caseIds, caseIds);
    assert.equal('targetUrl' in sent[2], false);
});

test('old JS evidence is rejected, while Java returns to existing dispatcher', async () => {
    await assert.rejects(runJavaScriptStage('FORMAL_VERIFY', { irJson: { javascriptExtraction: {} } }, {}, () => { throw new Error('must not call'); }), /Regenerate/);
    assert.equal(await runJavaScriptStage('FORMAL_VERIFY', { irJson: { microservices: [] } }, {}, () => { throw new Error('must not call'); }), null);
});

test('browser and background dispatcher copies are byte-identical', () => {
    for (const name of ['frontend/src/utils/javascriptWorkflow.ts', 'coordinator/src/utilities/javascriptWorkflow.ts'])
        assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), source);
});

function policy(commit = 'a', predicate = { op: 'true' }) {
    const component = { name: 'backend', repositoryURL: 'https://example.invalid/backend.git', commit: commit.repeat(40) };
    const sourceDigest = commit.repeat(64);
    const endpoint = { endpointId: 'endpoint-' + commit, component, sourceDigest, method: 'POST', path: '/account',
        status: 'complete', reachability: 'active', admission: predicate, operations: [], dimensions: {}, expectedPolicyStatus: 'not-provided' };
    return { analysis: 'javascript-authorization-policy', scope: 'finite-source-model', status: 'complete', policyId: commit.repeat(64),
        sources: [{ component, sourceDigest }], endpoints: [endpoint],
        verification: [{ endpointId: endpoint.endpointId, component, status: 'complete', checks: [{ property: 'observed-admission-reachability', solverResult: 'sat' }], conformance: 'not-assessed-no-expected-policy' }],
        scenarios: [{ endpointId: endpoint.endpointId, component: component.name, sourceDigest, method: 'POST', path: '/account' }] };
}
function input(id, type, result, extra = {}) { return { id, type, status: 'completed', data: { javascriptAnalysis: result, payload: { javascriptReport: report } }, ...extra }; }

test('verification comparison matches only identical source-policy identities without legacy statistics', () => {
    const p = policy();
    const result = compareJavaScriptEvidence('VERIFICATION_COMPARISON', [input('v', 'FORMAL_VERIFY', p), input('s', 'SCENARIO_GENERATE', p)]);
    assert.equal(result.status, 'complete');
    assert.equal(result.summary.scenarios, 1);
    assert.equal(result.endpoints[0].scenarioCount, 1);
    assert.equal(result.scope.runtimeValidation, false);
    assert.equal(result.scope.businessPolicyConformance, 'not-recomputed');
    assert.equal('inconsistencyRate' in result, false);
    const mismatched = policy('b'); mismatched.policyId = p.policyId;
    assert.equal(compareJavaScriptEvidence('VERIFICATION_COMPARISON', [input('v', 'FORMAL_VERIFY', p), input('s', 'SCENARIO_GENERATE', mismatched)]).status, 'unknown');
});

test('comparison never treats missing or mixed language records as zero findings', async () => {
    for (const inputs of [[], [input('v', 'FORMAL_VERIFY', policy()), { id: 's', type: 'SCENARIO_GENERATE', status: 'completed', data: { scenarioPayload: { scenarios: [] } } }]]) {
        const output = await runJavaScriptStage('VERIFICATION_COMPARISON', { javascriptReport: report }, { javascriptComparisonInputs: inputs }, () => { throw new Error('No service call expected'); });
        assert.equal(output.payload.javascriptAnalysis.status, 'unknown');
        assert.equal('totalSuggestions' in output.payload.comparisonResult, false);
    }
});

test('source-policy changes compare route identities across revisions without claiming runtime regressions', () => {
    const before = policy('a'), after = policy('b', { op: 'false' });
    const inputs = [input('base', 'FORMAL_VERIFY', before, { position: { y: 0 } }), input('target', 'FORMAL_VERIFY', after, { position: { y: 100 } })];
    const result = compareJavaScriptEvidence('SECURITY_REGRESSION', inputs);
    assert.equal(result.status, 'complete');
    assert.equal(result.changes.length, 1);
    assert.equal(result.changes[0].kind, 'recorded-policy-evidence-changed');
    assert.equal(result.changes[0].baseEndpointId, 'endpoint-a');
    assert.equal(result.changes[0].targetEndpointId, 'endpoint-b');
    assert.equal(result.scope.runtimeRegression, 'not-assessed');
    assert.equal('introduced' in result, false);
    assert.equal('resolved' in result, false);
    after.sources[0].component.repositoryURL = 'https://example.invalid/unrelated.git';
    assert.equal(compareJavaScriptEvidence('SECURITY_REGRESSION', inputs).status, 'unknown');
});

test('comparison checks endpoint source binding and keeps ambiguous correspondence partial', () => {
    const before = policy('a'), after = policy('b');
    const inputs = [input('base', 'FORMAL_VERIFY', before), input('target', 'FORMAL_VERIFY', after)];
    const direction = { baseVerificationNodeId: 'base', targetVerificationNodeId: 'target' };
    after.endpoints[0].sourceDigest = 'c'.repeat(64);
    assert.equal(compareJavaScriptEvidence('SECURITY_REGRESSION', inputs, direction).status, 'unknown');
    after.endpoints[0].sourceDigest = 'b'.repeat(64);
    after.endpoints.push({ ...after.endpoints[0], endpointId: 'duplicate' });
    const result = compareJavaScriptEvidence('SECURITY_REGRESSION', inputs, direction);
    assert.equal(result.status, 'partial');
    assert.equal(result.ambiguous.length, 1);
    assert.equal(result.changes.length, 0);
    assert.equal(compareJavaScriptEvidence('SECURITY_REGRESSION', inputs).status, 'unknown');
});

test('comparison waits for upstream outputs and preserves stage-specific policy records', async () => {
    const p = policy();
    const output = await runJavaScriptStage('VERIFICATION_COMPARISON', { javascriptReport: report }, { javascriptComparisonInputs: [input('v', 'FORMAL_VERIFY', p), input('s', 'SCENARIO_GENERATE', p, { status: 'running' })] }, () => { throw new Error('No call expected'); });
    assert.equal(output.waiting, true);
    assert.equal(output.payload.javascriptAnalysis.status, 'awaiting-inputs');
    const generated = await runJavaScriptStage('FORMAL_VERIFY', { javascriptReport: report }, {}, async () => p);
    assert.equal(generated.payload.javascriptResults.FORMAL_VERIFY, p);
});

test('per-file language capability guards stop polyglot policy and security stages without API calls', async () => {
    for (const languages of [['python'], ['go'], ['csharp'], ['java', 'javascript'], ['javascript', 'python']]) {
        for (const stage of ['FORMAL_VERIFY', 'SCENARIO_GENERATE', 'PROMPT_GENERATE', 'TEST_GENERATE', 'TEST_EXECUTOR', 'AEGIS']) {
            let calls = 0;
            const result = await runJavaScriptStage(stage, { irJson: { metadata: { languages } } }, {}, async () => { calls++; });
            assert.equal(result.data.javascriptAnalysis.status, 'unsupported');
            assert.equal(result.data.javascriptAnalysis.securityVerdict, 'not-assessed');
            assert.equal(calls, 0);
        }
    }
});

test('observed languages override auto requests, and native class metadata is respected', async () => {
    const { sourceLanguages } = exported;
    assert.equal(sourceLanguages({ irJson: { metadata: { languages: ['typescript'] } }, metadata: [{ language: 'auto' }] }).join(','), 'typescript');
    const result = await runJavaScriptStage('FORMAL_VERIFY', { irJson: { microservices: [{ unknowns: [{ metadata: { language: 'Python' } }] }] } }, {}, () => { throw new Error('must not call'); });
    assert.equal(result.data.javascriptAnalysis.status, 'unsupported');
    const jsOnly = await runJavaScriptStage('FORMAL_VERIFY', { irJson: { metadata: { languages: ['javascript', 'typescript'] }, javascriptExtraction: { securityAnalysis: report } }, metadata: [{ language: 'auto' }] }, {}, async () => ({ status: 'partial' }));
    assert.equal(jsOnly.data.javascriptAnalysis.status, 'partial');
});

test('native JClass containers retain explicit Python, Go, C# and JavaScript language identity', async () => {
    const { sourceLanguages } = exported;
    for (const language of ['python', 'go', 'csharp', 'javascript', 'typescript']) {
        const payload = { irJson: { microservices: [{ unknowns: [{ type: 'JClass', metadata: { language } }] }] } };
        assert.equal(sourceLanguages(payload).join(','), language);
    }
    assert.equal(sourceLanguages({ irJson: { microservices: [{ controllers: [{ type: 'JClass' }] }] } }).join(','), 'java');
    const payload = { irJson: { metadata: { languages: ['javascript'] }, microservices: [{ unknowns: [{ type: 'JClass', metadata: { language: 'javascript' } }] }], javascriptExtraction: { securityAnalysis: report } } };
    const result = await runJavaScriptStage('FORMAL_VERIFY', payload, {}, async () => ({ status: 'partial' }));
    assert.equal(result.data.javascriptAnalysis.status, 'partial');
});

test('root language and source path hints prevent false Java classification of generic classes', () => {
    const { sourceLanguages } = exported;
    for (const [language, filename] of [['python', 'module.py'], ['csharp', 'Module.cs'], ['go', 'module.go']]) {
        assert.equal(sourceLanguages({ irJson: { microservices: [{ unknowns: [{ type: 'JClass', fileName: filename }] }] } }).join(','), language);
        assert.equal(sourceLanguages({ irJson: { metadata: { languages: [language] }, microservices: [{ unknowns: [{ type: 'JClass' }] }] } }).join(','), language);
    }
});
