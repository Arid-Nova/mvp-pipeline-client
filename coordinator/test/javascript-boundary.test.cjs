// Run with node --test coordinator/test/javascript-boundary.test.cjs.
// Only trusted repository code is evaluated; all coordinator APIs are replaced with local test doubles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(require.resolve('typescript', { paths: [path.join(root, 'javascript-security')] }));

function compile(text) {
  return ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}

function coordinator(api) {
  const exports = {};
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'coordinator/src/coordinatorService.ts'), 'utf8')), {
    exports,
    require(name) {
      if (name === './utilities/api') return { api };
      if (name === './utilities/utils') return { decompressPayload: value => value };
      if (name === './utilities/javascriptWorkflow') {
        const output = {};
        vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'javascript-workflow/workflow.ts'), 'utf8')), { exports: output });
        return output;
      }
      throw new Error('Unexpected test import');
    },
    console: { log() {}, error() {} }
  });
  return exports;
}

function metadataFunction() {
  const source = fs.readFileSync(path.join(root, 'frontend/src/components/pipeline/cards/UploadIRCard.tsx'), 'utf8');
  const ast = ts.createSourceFile('UploadIRCard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(variable => variable.name.getText(ast) === 'extractIRMetadata'));
  assert.ok(declaration, 'Metadata helper must be present');
  const exports = {};
  vm.runInNewContext(compile(declaration.getText(ast)), { exports });
  return exports.extractIRMetadata;
}

test('coordinator dispatches JavaScript extraction with explicit language and declared component kind', async () => {
  let extractions = 0;
  const { PipelineCoordinator } = coordinator({
    fetchSessionCanvas: async () => ({ nodes: [
      { id: 'js', type: 'SYSTEM_INPUT', data: { systemName: 'js', repositories: [{ repoUrl: 'js', language: 'javascript', componentKind: 'frontend' }] } },
      { id: 'extract', type: 'MULTI_REPO', data: {} }
    ], connections: [{ source: 'js', target: 'extract' }] }),
    fetchIR: async input => { extractions++; assert.equal(input.systemRepositories[0].language, 'javascript');
      assert.equal(input.systemRepositories[0].componentKind, 'frontend'); return { javascriptExtraction: {} }; }
  });
  const report = await new PipelineCoordinator('fixture').execute();
  assert.equal(extractions, 1);
  assert.equal(report[0].status, 'completed');
  assert.equal(report[1].status, 'completed');
});

test('coordinator detects restored JS IR and older JSModule projections', () => {
  const { requiresJavaScriptWorkflow } = coordinator({});
  for (const irJson of [
    { javascriptExtraction: { schemaVersion: 1, snapshots: [] } },
    { metadata: { extractor: 'cimet-javascript' } },
    { orphans: [{ type: 'JSModule' }] },
    { microservices: [{ controllers: [{ metadata: { language: 'TypeScript' } }] }] }
  ]) assert.equal(requiresJavaScriptWorkflow({ data: { payload: { irJson } } }), true);
  assert.equal(requiresJavaScriptWorkflow({ data: { payload: { irJson: { microservices: [{ controllers: [{ type: 'JClass' }] }] } } } }), false);
});

test('coordinator preserves existing Java extraction dispatch', async () => {
  let extractions = 0;
  const { PipelineCoordinator } = coordinator({
    fetchSessionCanvas: async () => ({ nodes: [
      { id: 'java', type: 'SYSTEM_INPUT', data: { systemName: 'java', repositories: [{ repoUrl: 'java', commitId: 'head' }] } },
      { id: 'extract', type: 'MULTI_REPO', data: {} }
    ], connections: [{ source: 'java', target: 'extract' }] }),
    fetchIR: async () => { extractions++; return { name: 'java', microservices: [] }; }
  });
  const report = await new PipelineCoordinator('fixture').execute();
  assert.equal(extractions, 1);
  assert.equal(report[1].status, 'completed');
});

test('restored IR retains frontend and backend language identity without duplicating native backend nodes', () => {
  const extract = metadataFunction();
  const result = extract({ javascriptExtraction: { snapshots: [
    { component: { repositoryURL: 'https://github.com/example/server.git', commit: 'a', kind: 'backend' } },
    { component: { repositoryURL: 'https://github.com/example/client.git', commit: 'b', kind: 'frontend' } }
  ] }, microservices: [{ repositoryURL: 'https://github.com/example/server.git', commitID: 'a', metadata: { componentKind: 'backend' } }] }, 'fallback');
  assert.equal(result.length, 2);
  assert.equal(result[0].language, 'javascript');
  assert.equal(result[1].componentKind, 'frontend');
  assert.equal(result[1].commitId, 'b');
  assert.equal(result[1].branch, '', 'Do not invent a branch absent from the snapshot');
});

test('restored mixed and legacy Java IR keep Java repository metadata', () => {
  const extract = metadataFunction();
  const result = extract({ microservices: [{ repositoryURL: 'java-url', commitID: 'old', metadata: { branch: 'release' } }] }, 'fallback');
  assert.equal(result.length, 1);
  assert.equal(result[0].repoUrl, 'java-url');
  assert.equal(result[0].branch, 'release');
  assert.equal(result[0].language, undefined);
});

test('coordinator awaits Aegis and preserves complete or partial JavaScript reports downstream', async () => {
  for (const status of ['complete', 'partial']) {
    const sourceReport = { status, components: [] };
    const securityReport = { status, analysis: 'javascript-express-static-security', components: [], ir_id: 'saved-ir' };
    let calls = 0;
    const { PipelineCoordinator } = coordinator({
      fetchSessionCanvas: async () => ({ nodes: [
        { id: 'input', type: 'UPLOAD_IR', data: { payload: { irJson: { id: 'saved-ir', javascriptExtraction: { securityAnalysis: sourceReport } } } } },
        { id: 'aegis', type: 'AEGIS', data: {} }, { id: 'view', type: 'VISUALIZATION', data: {} }
      ], connections: [{ source: 'input', target: 'aegis' }, { source: 'aegis', target: 'view' }] }),
      analyzeAegis: async input => { calls++; assert.equal(input.ir_id, 'saved-ir'); await Promise.resolve(); return securityReport; }
    });
    const instance = new PipelineCoordinator('fixture');
    const report = await instance.execute();
    assert.equal(calls, 1);
    assert.equal(report[1].status, 'completed');
    assert.equal(report[2].status, 'completed');
    assert.equal(instance.nodesMap.get('aegis').data.securityReport, securityReport);
    assert.equal(instance.nodesMap.get('aegis').data.analysisStatus, status);
    assert.equal(instance.nodesMap.get('view').data.payload.securityReport, securityReport);
  }
});

test('coordinator rejects a Java Aegis response for JavaScript evidence', async () => {
  const { PipelineCoordinator } = coordinator({
    fetchSessionCanvas: async () => ({ nodes: [
      { id: 'input', type: 'UPLOAD_IR', data: { payload: { irJson: { id: 'saved-ir', javascriptExtraction: { securityAnalysis: { status: 'partial', components: [] } } } } } },
      { id: 'aegis', type: 'AEGIS', data: {} }
    ], connections: [{ source: 'input', target: 'aegis' }] }),
    analyzeAegis: async () => ({ ok: true, status: 'success', analysis: 'legacy-java' })
  });
  const instance = new PipelineCoordinator('fixture');
  const report = await instance.execute();
  assert.equal(report[1].status, 'failed');
  assert.match(report[1].logs.at(-1), /did not return JavaScript/);
});

test('coordinator comparison intercepts incomplete JavaScript inputs instead of reporting zero legacy regressions', async () => {
  for (const type of ['VERIFICATION_COMPARISON', 'SECURITY_REGRESSION']) {
    const { PipelineCoordinator } = coordinator({
      fetchSessionCanvas: async () => ({ nodes: [
        { id: 'input', type: 'UPLOAD_IR', data: { payload: { irJson: { javascriptExtraction: { securityAnalysis: { status: 'partial', components: [] } } } } } },
        { id: 'comparison', type, data: {} }
      ], connections: [{ source: 'input', target: 'comparison' }] })
    });
    const instance = new PipelineCoordinator('fixture');
    const report = await instance.execute();
    assert.equal(report[1].status, 'completed');
    const result = instance.nodesMap.get('comparison').data.javascriptAnalysis;
    assert.equal(result.status, 'unknown');
    assert.equal(result.scope.runtimeRegression, 'not-assessed');
    assert.equal('introduced' in result, false);
    assert.equal('inconsistencyRate' in result, false);
  }
});

test('restored polyglot IR preserves language selection for regeneration', () => {
  const extract = metadataFunction();
  const result = extract({ metadata: { languages: ['java', 'python'] }, microservices: [{ repositoryURL: 'https://github.com/example/mixed', commitID: 'a' }] }, 'fallback');
  assert.equal(result[0].language, 'auto');
  const single = extract({ metadata: { languages: ['go'] }, microservices: [{ repositoryURL: 'https://github.com/example/go', commitID: 'a' }] }, 'fallback');
  assert.equal(single[0].language, 'go');
});

test('component indexing for polyglot source never calls Java vector generation', async () => {
  let generated = 0;
  const { PipelineCoordinator } = coordinator({
    fetchSessionCanvas: async () => ({ nodes: [
      { id: 'mixed', type: 'SYSTEM_INPUT', data: { systemName: 'mixed', repositories: [{ repoUrl: 'mixed', language: 'auto' }] } },
      { id: 'components', type: 'COMPONENT_GENERATE', data: {} }
    ], connections: [{ source: 'mixed', target: 'components' }] }),
    generateComponents: async () => ({ id: 'index', componentIndex: { metadata: { languages: ['java', 'python'] } }, endpointIndex: {} }),
    generateVectors: async () => { generated++; throw new Error('must not call'); }
  });
  const report = await new PipelineCoordinator('fixture').execute();
  assert.equal(report[1].status, 'completed');
  assert.equal(generated, 0);
});

test('JavaScript component indexing uses scoped vectors despite unsupported Java authorization metadata', async () => {
  let scoped = 0;
  const { PipelineCoordinator } = coordinator({
    fetchSessionCanvas: async () => ({ nodes: [
      { id: 'js', type: 'SYSTEM_INPUT', data: { systemName: 'js', repositories: [{ repoUrl: 'js', language: 'javascript' }] } },
      { id: 'components', type: 'COMPONENT_GENERATE', data: {} }
    ], connections: [{ source: 'js', target: 'components' }] }),
    generateComponents: async () => ({ id: 'index', componentIndex: { metadata: { languages: ['javascript'], analysisCapabilities: { authorization: 'unsupported' } }, javascriptExtraction: { securityAnalysis: { status: 'partial' } } }, endpointIndex: {} }),
    postJavaScriptStage: async (service, route) => { scoped++; assert.equal(route, '/vectors/javascript'); return { status: 'partial' }; },
    generateVectors: async () => { throw new Error('Java vector route must not run'); }
  });
  const report = await new PipelineCoordinator('fixture').execute();
  assert.equal(report[1].status, 'completed');
  assert.equal(scoped, 1);
});

function browserAegisHandler() {
  const source = fs.readFileSync(path.join(root, 'frontend/src/components/pipeline/PipelinePage.tsx'), 'utf8');
  const ast = ts.createSourceFile('PipelinePage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let branch;
  const visit = node => {
    if (ts.isIfStatement(node) && node.expression.getText(ast) === "targetNode.type === 'AEGIS'") branch = node.thenStatement;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(branch, 'Browser Aegis branch must exist');
  const workflow = {};
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'javascript-workflow/workflow.ts'), 'utf8')), { exports: workflow });
  const output = {};
  const wrapper = `export async function handle(context: any) { const { payload, targetNode, options, analyzeAegis, updateStatus, setNotification, processNextNodes } = context; ${branch.getText(ast)} }`;
  vm.runInNewContext(compile(wrapper), { exports: output, sourceLanguages: workflow.sourceLanguages, securityReportFromPayload: workflow.securityReportFromPayload });
  return output.handle;
}

test('browser Aegis awaits and propagates complete source-bound evidence', async () => {
  const handle = browserAegisHandler();
  const sourceReport = { status: 'partial' };
  const payload = { irJson: { id: 'saved', metadata: { languages: ['javascript'] }, javascriptExtraction: { securityAnalysis: sourceReport } }, metadata: [] };
  const report = { ir_id: 'saved', status: 'complete', analysis: 'javascript-express-static-security' };
  let propagated, completed;
  await handle({ payload, targetNode: { id: 'aegis' }, options: {}, analyzeAegis: async () => report,
    updateStatus: (id, status, message, data) => { if (status === 'completed') completed = data; }, setNotification() {},
    processNextNodes: async (id, data) => { propagated = data; } });
  assert.equal(completed.securityReport, report);
  assert.equal(propagated.securityReport, report);
  assert.equal(propagated.javascriptReport, sourceReport);
});

test('browser native JavaScript without security evidence stops before a legacy analysis call', async () => {
  const handle = browserAegisHandler();
  let called = false;
  await assert.rejects(handle({ payload: { irJson: { id: 'saved', metadata: { languages: ['javascript'] } } }, targetNode: { id: 'aegis' }, options: {},
    analyzeAegis: async () => { called = true; }, updateStatus() {}, setNotification() {}, processNextNodes() {} }), /source-bound Express security evidence/);
  assert.equal(called, false);
});
