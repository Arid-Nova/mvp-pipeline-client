/** Canonical shared browser/coordinator dispatch. Sync with scripts/sync_javascript_workflow.py. */
export type PostStage = (service: string, path: string, body: any) => Promise<any>;
const STAGES = new Set(['FORMAL_VERIFY', 'SCENARIO_GENERATE', 'PROMPT_GENERATE', 'TEST_GENERATE', 'TEST_EXECUTOR', 'FORMAL_VIZ', 'VERIFICATION_COMPARISON', 'SECURITY_REGRESSION']);

/** Languages observed in source take priority over an auto-detection request. */
export function sourceLanguages(payload: any): string[] {
    const languages = new Set<string>();
    const add = (value: any) => {
        const normalized = String(value || '').toLowerCase();
        const aliases: Record<string, string> = { js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', 'c#': 'csharp', 'c-sharp': 'csharp' };
        if (normalized && !['auto', 'polyglot'].includes(normalized)) languages.add(aliases[normalized] || normalized);
    };
    const addModule = (module: any, context: any[]) => {
        const explicit = module.metadata?.language;
        if (explicit) { add(explicit); return; }
        const filename = String(module.filePath || module.fileName || module.path || '').toLowerCase();
        const extension = filename.match(/\.([a-z]+)$/)?.[1];
        const byExtension: Record<string, string> = { java: 'java', py: 'python', go: 'go', cs: 'csharp', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript' };
        if (extension && byExtension[extension]) { add(byExtension[extension]); return; }
        if (module.type === 'JSModule') add('javascript');
        else if (module.type === 'JClass' && !context.some(value => !['java', 'auto', 'polyglot', ''].includes(String(value || '').toLowerCase()))) add('java');
    };
    const ir = payload?.irJson || payload?.systemInfo?.ir || {};
    const documents = [ir, ir.componentIndex, ir.endpointIndex].filter(Boolean);
    for (const document of documents) {
        (document.metadata?.languages || []).forEach(add);
        add(document.metadata?.language);
        if (document.javascriptExtraction) add('javascript');
        const context = [...(document.metadata?.languages || []), document.metadata?.language].filter(Boolean);
        for (const service of document.microservices || []) {
            const serviceContext = [...context, ...(service.metadata?.languages || []), service.metadata?.language].filter(Boolean);
            serviceContext.forEach(add);
            for (const key of ['controllers', 'services', 'repositories', 'entities', 'unknowns', 'feignClients'])
                for (const module of service[key] || []) addModule(module, serviceContext);
        }
        for (const module of document.orphans || []) addModule(module, context);
    }
    if (!languages.size) (payload?.metadata || payload?.repositories || []).forEach((item: any) => add(item?.language));
    return Array.from(languages).sort();
}

/** Existing Java stages cannot establish a whole-system policy for polyglot IR. */
export function unsupportedDownstreamReason(payload: any): string | null {
    const languages = sourceLanguages(payload);
    const nonJava = languages.filter(language => language !== 'java');
    const onlyJavaScript = languages.length > 0 && languages.every(language => ['javascript', 'typescript'].includes(language));
    if (!nonJava.length || onlyJavaScript) return null;
    return `Source extraction is available for ${languages.join(', ')}. Whole-system authorization, formal verification, security and test generation are unsupported for this language combination. No Java policy defaults or security verdict were computed.`;
}

export function securityReportFromPayload(payload: any): any {
    return payload?.javascriptReport || payload?.irJson?.javascriptExtraction?.securityAnalysis
        || payload?.irJson?.componentIndex?.javascriptExtraction?.securityAnalysis
        || payload?.systemInfo?.ir?.javascriptExtraction?.securityAnalysis;
}

const POLICY = 'javascript-authorization-policy';
const comparisonScope = {
    analysis: 'recorded-source-policy-evidence', runtimeValidation: false,
    runtimeRegression: 'not-assessed', businessPolicyConformance: 'not-recomputed', securityVerdict: 'not-assessed'
};
function stable(value: any): string {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
    return JSON.stringify(value) ?? 'null';
}
function nodePayload(input: any): any { return input?.data?.payload || input?.payload || {}; }
function nodeResult(input: any): any {
    const payload = nodePayload(input);
    return input?.data?.javascriptAnalysis || payload?.javascriptResults?.[input.type] || payload?.javascriptAnalysis;
}
function isJavaScriptInput(payload: any): boolean {
    const ir = payload?.irJson || payload?.systemInfo?.ir;
    return Boolean(securityReportFromPayload(payload) || payload?.javascriptAnalysis?.analysis?.startsWith('javascript-')
        || ir?.javascriptExtraction || ir?.componentIndex?.javascriptExtraction || ir?.metadata?.extractor === 'cimet-javascript'
        || payload?.metadata?.some((item: any) => ['javascript', 'typescript'].includes(String(item?.language || '').toLowerCase()))
        || ir?.orphans?.some((item: any) => item?.type === 'JSModule')
        || ir?.microservices?.some((service: any) => service?.metadata?.language === 'javascript'
            || ['controllers', 'services', 'repositories', 'entities', 'unknowns'].some(key => service?.[key]?.some((item: any) => item?.type === 'JSModule'))));
}
function validPolicy(result: any): boolean {
    return result?.analysis === POLICY && result.scope === 'finite-source-model'
        && typeof result.policyId === 'string' && /^[0-9a-f]{64}$/.test(result.policyId)
        && Array.isArray(result.sources) && result.sources.length > 0
        && result.sources.every((source: any) => typeof source?.component?.name === 'string'
            && typeof source?.component?.repositoryURL === 'string' && typeof source?.component?.commit === 'string'
            && /^[0-9a-f]{64}$/.test(source?.sourceDigest || ''))
        && Array.isArray(result.endpoints) && result.endpoints.length <= 5000
        && result.endpoints.every((endpoint: any) => typeof endpoint?.endpointId === 'string' && typeof endpoint?.method === 'string'
            && (endpoint.path === null || typeof endpoint.path === 'string')
            && result.sources.some((source: any) => source.component.name === endpoint.component?.name
                && source.component.repositoryURL === endpoint.component?.repositoryURL && source.component.commit === endpoint.component?.commit
                && source.sourceDigest === endpoint.sourceDigest));
}
function sourceIdentity(result: any): string {
    return stable(result.sources.map((source: any) => ({ component: source.component, sourceDigest: source.sourceDigest, applicationAssembly: source.applicationAssembly })).sort((a: any, b: any) => stable(a).localeCompare(stable(b))));
}
function comparisonResult(status: string, reason: string, extra: any = {}): any {
    return { schemaVersion: 1, analysis: 'javascript-source-evidence-comparison', status, scope: comparisonScope, reason, ...extra };
}
function endpointKey(endpoint: any): string {
    const name = typeof endpoint.component === 'string' ? endpoint.component : endpoint.component?.name;
    return stable([name, endpoint.sourceDigest, endpoint.endpointId]);
}
function observedPolicy(endpoint: any): any {
    return { status: endpoint.status, reachability: endpoint.reachability, admission: endpoint.admission,
        dimensions: endpoint.dimensions, operations: endpoint.operations, expectedPolicyStatus: endpoint.expectedPolicyStatus };
}

/** Compare stored, source-bound outputs. This never reclassifies a source change as a live regression. */
export function compareJavaScriptEvidence(type: string, inputs: any[], data: any = {}): any {
    const required = type === 'VERIFICATION_COMPARISON' ? ['FORMAL_VERIFY', 'SCENARIO_GENERATE'] : ['FORMAL_VERIFY', 'FORMAL_VERIFY'];
    const selected = inputs.filter(input => required.includes(input.type));
    if (selected.length !== 2 || required.some(kind => selected.filter(input => input.type === kind).length !== required.filter(value => value === kind).length))
        return comparisonResult('unknown', 'Connect the required two JavaScript source-policy outputs before comparing evidence.');
    if (selected.some(input => input.status !== 'completed'))
        return comparisonResult('awaiting-inputs', 'Waiting for both connected source-policy analyses to complete.');
    if (selected.some(input => !validPolicy(nodeResult(input))))
        return comparisonResult('unknown', 'A connected result is missing source identity, uses a legacy language model, or is not a JavaScript finite source-policy result.');
    if (type === 'VERIFICATION_COMPARISON') {
        const verification = nodeResult(selected.find(input => input.type === 'FORMAL_VERIFY'));
        const scenarios = nodeResult(selected.find(input => input.type === 'SCENARIO_GENERATE'));
        if (verification.policyId !== scenarios.policyId || sourceIdentity(verification) !== sourceIdentity(scenarios))
            return comparisonResult('unknown', 'Verification and scenarios refer to different source configurations or policy inputs. Regenerate both from the same source-bound policy.');
        if (!Array.isArray(verification.verification) || !Array.isArray(scenarios.scenarios))
            return comparisonResult('unknown', 'The required verification or scenario records are absent.');
        const endpointMap = new Map<string, any>(verification.endpoints.map((endpoint: any) => [endpointKey(endpoint), endpoint]));
        const counts = new Map<string, number>();
        let unmatched = 0;
        for (const scenario of scenarios.scenarios) {
            const key = endpointKey(scenario);
            if (!endpointMap.has(key)) unmatched++;
            else counts.set(key, (counts.get(key) || 0) + 1);
        }
        const endpoints = verification.endpoints.map((endpoint: any) => {
            const result = verification.verification.find((item: any) => item.endpointId === endpoint.endpointId && item.component?.name === endpoint.component?.name);
            return { endpointId: endpoint.endpointId, component: endpoint.component, sourceDigest: endpoint.sourceDigest,
                method: endpoint.method, path: endpoint.path, modelStatus: endpoint.status,
                verificationStatus: result?.status || 'unknown', scenarioCount: counts.get(endpointKey(endpoint)) || 0,
                recordedChecks: result?.checks || [], recordedConformance: result?.conformance || 'not-assessed' };
        });
        const incomplete = unmatched > 0 || verification.status !== 'complete' || scenarios.status !== 'complete'
            || endpoints.some((endpoint: any) => !['complete', 'not-applicable'].includes(endpoint.verificationStatus));
        return comparisonResult(incomplete ? 'partial' : 'complete', 'Matched recorded verification checks and generated abstract scenarios for the same source-policy identity.', {
            kind: 'verification-scenario-evidence', policyId: verification.policyId, sources: verification.sources, endpoints,
            summary: { endpoints: endpoints.length, scenarios: scenarios.scenarios.length, unmatchedScenarios: unmatched,
                endpointsWithScenarios: endpoints.filter((endpoint: any) => endpoint.scenarioCount > 0).length },
            limitations: ['Scenario counts describe generated abstract states, not executed tests or runtime coverage.', 'Recorded conformance is copied from verification and is not recomputed by this comparison.']
        });
    }
    let base = selected.find(input => input.id === data.baseVerificationNodeId);
    let target = selected.find(input => input.id === data.targetVerificationNodeId);
    let selectionBasis = 'explicit-node-identities';
    if (!base || !target || base === target) {
        if (data.baseVerificationNodeId || data.targetVerificationNodeId)
            return comparisonResult('unknown', 'Explicit base and target verification node identities do not match the two connected inputs.');
        const positions = selected.map(input => input.position?.y ?? input.y);
        if (positions.some(value => !Number.isFinite(value)) || positions[0] === positions[1])
            return comparisonResult('unknown', 'Select distinct base and target verification node identities; revision direction is not established by these inputs.');
        const ordered = selected.slice().sort((a, b) => (a.position?.y ?? a.y) - (b.position?.y ?? b.y));
        [base, target] = ordered;
        selectionBasis = 'canvas-order-upper-node-is-base; revision chronology is not verified';
    }
    const before = nodeResult(base), after = nodeResult(target);
    const repositories = (policy: any): Set<string> => new Set(policy.sources.map((source: any) => source.component.repositoryURL));
    const beforeRepositories = repositories(before), afterRepositories = repositories(after);
    if (!Array.from(beforeRepositories).some(repository => afterRepositories.has(repository)))
        return comparisonResult('unknown', 'The connected reports describe unrelated repositories and cannot establish source-policy change.');
    const group = (policy: any): Map<string, any[]> => {
        const grouped = new Map<string, any[]>();
        for (const endpoint of policy.endpoints.filter((item: any) => item.status !== 'not-applicable' && item.reachability !== 'inactive')) {
            const key = stable([endpoint.component?.repositoryURL, endpoint.component?.name, endpoint.method, endpoint.path]);
            grouped.set(key, [...(grouped.get(key) || []), endpoint]);
        }
        return grouped;
    };
    const oldEndpoints = group(before), newEndpoints = group(after), changes: any[] = [], ambiguous: any[] = [];
    let unchanged = 0;
    for (const key of Array.from(new Set([...Array.from(oldEndpoints.keys()), ...Array.from(newEndpoints.keys())]))) {
        const oldMatches = oldEndpoints.get(key) || [], newMatches = newEndpoints.get(key) || [];
        if (oldMatches.length > 1 || newMatches.length > 1) { ambiguous.push({ identity: JSON.parse(key), baseMatches: oldMatches.length, targetMatches: newMatches.length }); continue; }
        const oldEndpoint = oldMatches[0], newEndpoint = newMatches[0], endpoint = newEndpoint || oldEndpoint;
        const oldEvidence = oldEndpoint ? observedPolicy(oldEndpoint) : null, newEvidence = newEndpoint ? observedPolicy(newEndpoint) : null;
        if (oldEndpoint && newEndpoint && stable(oldEvidence) === stable(newEvidence)) { unchanged++; continue; }
        changes.push({ kind: !oldEndpoint ? 'source-endpoint-added' : !newEndpoint ? 'source-endpoint-removed' : 'recorded-policy-evidence-changed',
            endpoint: { component: endpoint.component?.name, repositoryURL: endpoint.component?.repositoryURL, method: endpoint.method, path: endpoint.path },
            base: oldEvidence, target: newEvidence, baseEndpointId: oldEndpoint?.endpointId, targetEndpointId: newEndpoint?.endpointId,
            interpretation: 'Review this source-model change; it is not a demonstrated security regression or remediation.' });
    }
    const partial = before.status !== 'complete' || after.status !== 'complete' || ambiguous.length > 0
        || [...before.endpoints, ...after.endpoints].some(endpoint => !['complete', 'not-applicable'].includes(endpoint.status));
    return comparisonResult(partial ? 'partial' : 'complete', 'Compared recorded source-policy evidence across the selected reports.', {
        kind: 'source-policy-change', selectionBasis, basePolicyId: before.policyId, targetPolicyId: after.policyId,
        baseSources: before.sources, targetSources: after.sources, changes, ambiguous,
        summary: { changed: changes.length, unchanged, ambiguous: ambiguous.length },
        limitations: ['Endpoint correspondence uses repository, component, method and path; duplicates remain ambiguous.', 'Changes in predicates or coverage do not prove security degradation, improvement or production behavior.']
    });
}

export async function runJavaScriptStage(type: string, payload: any, data: any, post: PostStage): Promise<any | null> {
    const guarded = STAGES.has(type) || type === 'AEGIS';
    const reason = guarded ? unsupportedDownstreamReason(payload) : null;
    if (reason) {
        const result = { schemaVersion: 1, analysis: 'source-language-capability', status: 'unsupported',
            languages: sourceLanguages(payload), capability: type, reason, securityVerdict: 'not-assessed' };
        const next = { ...payload, javascriptAnalysis: result };
        return { message: reason, data: { javascriptAnalysis: result, payload: next }, payload: next };
    }
    if (!STAGES.has(type)) return null;
    data = data || {};
    if (type === 'VERIFICATION_COMPARISON' || type === 'SECURITY_REGRESSION') {
        const inputs = Array.isArray(data.javascriptComparisonInputs) ? data.javascriptComparisonInputs : [];
        const javascript = isJavaScriptInput(payload) || inputs.some((input: any) => isJavaScriptInput(nodePayload(input)) || nodeResult(input)?.analysis === POLICY);
        if (!javascript) return null;
        const result = compareJavaScriptEvidence(type, inputs, data);
        const next = { ...payload, javascriptAnalysis: result, javascriptResults: { ...payload.javascriptResults, [type]: result } };
        const field = type === 'VERIFICATION_COMPARISON' ? 'comparisonResult' : 'regressionPayload';
        return { waiting: result.status === 'awaiting-inputs', message: result.reason,
            data: { javascriptAnalysis: result, [field]: result, payload: next }, payload: { ...next, [field]: result } };
    }
    const report = securityReportFromPayload(payload);
    const jsInput = report || isJavaScriptInput(payload) || sourceLanguages(payload).some(language => ['javascript', 'typescript'].includes(language));
    if (!jsInput) return null;
    if (!report || !['complete', 'partial'].includes(report.status))
        throw new Error('Regenerate JavaScript extraction to obtain source-bound security evidence.');
    const expectedPolicy = data.expectedPolicy || payload.expectedPolicy;
    const request = { report, ...(expectedPolicy ? { expectedPolicy } : {}) };
    let result: any;
    let message: string;
    if (type === 'FORMAL_VERIFY') {
        result = await post('VERIFY', '/verify/javascript', request);
        message = `JavaScript policy analysis: ${result.status}. Expected-policy conformance is reported separately.`;
    } else if (type === 'SCENARIO_GENERATE') {
        result = await post('ANALYSIS', '/scenarios/javascript', request);
        message = 'Source-bound JavaScript authorization scenarios generated.';
    } else if (type === 'TEST_GENERATE') {
        result = await post('TEST', '/testsuites/javascript', request);
        message = 'Declarative JavaScript tests generated; review and configure fixtures before execution.';
    } else if (type === 'TEST_EXECUTOR') {
        const suite = payload.javascriptSuite;
        if (!suite) throw new Error('Connect the JavaScript test-generation output before execution.');
        if (!data.fixtureSet) {
            result = { schemaVersion: 1, analysis: 'javascript-authorization-policy', status: 'awaiting-fixtures',
                suite, executed: false, reason: 'Select a server-configured isolated fixture set to execute these tests.' };
            message = 'Tests prepared. Execution awaits an isolated fixture set.';
        } else {
            result = await post('EXECUTOR', '/api/execute/javascript', {
                suite, fixtureSet: data.fixtureSet,
                ...(Array.isArray(data.caseIds) ? { caseIds: data.caseIds } : {})
            });
            message = `Isolated JavaScript test execution: ${result.status}.`;
        }
    } else if (type === 'PROMPT_GENERATE') {
        result = { schemaVersion: 1, analysis: 'javascript-authorization-policy', status: 'prepared',
            generation: 'deterministic', reason: 'JavaScript authorization tests are generated from typed policies without an LLM prompt.' };
        message = 'Policy inputs prepared for deterministic test generation.';
    } else {
        result = payload.javascriptAnalysis;
        if (!result) throw new Error('Connect a completed JavaScript policy analysis.');
        message = 'JavaScript policy evidence ready to view.';
    }
    const next = { ...payload, javascriptReport: report, expectedPolicy, javascriptAnalysis: result,
        javascriptResults: { ...payload.javascriptResults, [type]: result },
        ...(type === 'TEST_GENERATE' ? { javascriptSuite: result } : {}) };
    return { message, data: { javascriptAnalysis: result, payload: next }, payload: next };
}
