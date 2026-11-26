#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Project, hash, LIMITS } = require('./ast.cjs');
const { Routes } = require('./routes.cjs');
const { Flow, BOUNDS } = require('./flow.cjs');
const { endpointCoverage, aggregateCapabilities } = require('./coverage.cjs');
const ANALYZER = 'aridnova-express-security';
function analyze(input) {
    if (!input || typeof input !== 'object' || typeof input.sourceRoot !== 'string' || !path.isAbsolute(input.sourceRoot))
        throw new Error('sourceRoot must be an absolute source directory.');
    const stat = fs.lstatSync(input.sourceRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error('sourceRoot must be a real directory, not a symlink.');
    const c = input.component;
    if (!c || !['backend', 'frontend'].includes(c.kind) || !['name', 'repositoryURL', 'commit'].every(k => typeof c[k] === 'string' && c[k].length > 0 && c[k].length <= 2048))
        throw new Error('A complete component identity is required.');
    if (!input.snapshot || !Array.isArray(input.snapshot.endpoints) || input.snapshot.endpoints.length > 5000)
        throw new Error('A bounded snapshot endpoint array is required.');
    for (const key of ['name', 'kind', 'repositoryURL', 'commit'])
        if (input.snapshot.component?.[key] !== undefined && input.snapshot.component[key] !== c[key])
            throw new Error('Snapshot and component identity differ.');
    const seen = new Set();
    for (const e of input.snapshot.endpoints) {
        if (!e || typeof e.id !== 'string' || e.id.length > 256 || seen.has(e.id) || typeof e.method !== 'string' || e.method.length > 16 || typeof e.file !== 'string' || e.file.length > 2048 || path.isAbsolute(e.file) || e.file.split(/[\\/]/).includes('..') || !Number.isInteger(e.line) || e.line < 1 || !(e.path === null || typeof e.path === 'string' && e.path.length <= 8192))
            throw new Error('Invalid or duplicate snapshot endpoint identity.');
        seen.add(e.id);
    }
    const component = { name: c.name, kind: c.kind, repositoryURL: c.repositoryURL, commit: c.commit }, project = new Project(input.sourceRoot), routes = new Routes(project, input.analysisProfile || {}), endpoints = [], findings = [];
    for (const e of input.snapshot.endpoints) {
        const location = { file: e.file, line: e.line }, chain = routes.forEndpoint(e), flow = new Flow(project, { ...e, location,
            dataAccess: input.snapshot.architecture?.semanticEvidence?.dataAccess || [] }), result = flow.analyze(chain.handlers);
        if (!chain.registration || chain.reachability === 'inactive')
            result.authentication = { status: 'unknown', evidence: [{ ...location, observation: chain.reason }] };
        if (chain.alternatives > 1)
            result.authentication = { status: 'unknown', evidence: [...result.authentication.evidence, { ...location, observation: 'Multiple registration/mount contexts have different possible middleware chains.' }] };
        const endpointFindings = [];
        for (const issue of chain.reachability === 'inactive' ? [] : result.issues) {
            const id = `finding-${hash(`${component.repositoryURL}:${component.commit}:${e.id}:${issue.ruleId}:${issue.location.file}:${issue.location.line}`).slice(0, 24)}`;
            if (endpointFindings.some(x => x.id === id))
                continue;
            const finding = { id, ruleId: issue.ruleId, title: issue.title, severity: issue.severity, confidence: issue.confidence, classification: issue.classification, endpointId: e.id, location: issue.location, evidence: issue.evidence, recommendation: issue.ruleId === 'JWT_DECODE_IDENTITY' ? 'Verify credentials before trusting decoded claims; confirm the surrounding middleware and runtime configuration.' : issue.ruleId === 'GUARD_AFTER_NEXT' ? 'Evaluate and enforce access conditions before calling next().' : 'Terminate denied or verification-failed paths before calling another handler or performing protected work.' };
            endpointFindings.push(finding);
            findings.push(finding);
        }
        const capabilities = endpointCoverage(result, chain, project);
        const policyModel = result.policyModel ? { ...result.policyModel } : { status: 'unknown', unknownReasons: ['A finite policy model was not produced.'] };
        if (chain.status !== 'resolved' || chain.reachability === 'inactive' || (chain.alternatives || 0) > 1) {
            policyModel.status = 'unknown';
            policyModel.unknownReasons = [...new Set([...(policyModel.unknownReasons || []), 'Application registration context is unresolved or inactive.'])];
        }
        endpoints.push({ endpointId: e.id, method: e.method, path: e.path, location,
            reachability: chain.reachability || 'unknown', effectivePaths: chain.effectivePaths || [],
            middlewareChain: chain.handlers.map(h => ({ name: h.name, location: h.location, source: h.source, resolution: h.resolution, conditional: h.conditional || false })),
            authentication: result.authentication, roleChecks: result.roleChecks, ownershipChecks: result.ownershipChecks,
            executionPaths: result.executionPaths, dataOperations: result.dataOperations || [], policyModel, dispatch: result.dispatch, findings: endpointFindings,
            analysisCoverage: { registration: chain.registration ? 'matched' : 'unknown', globalMountResolution: chain.status,
                registrationAlternatives: chain.alternatives || 0, ...result.coverage, capabilities,
                precedingRoutes: chain.precedingRoutes || [],
                registrationReasons: chain.reasons || (chain.reason ? [chain.reason] : []) } });
    }
    for (const endpoint of endpoints) {
        for (const preceding of endpoint.analysisCoverage.precedingRoutes || []) {
            const prior = endpoints.find(candidate => candidate.location.file === preceding.location?.file && candidate.location.line === preceding.location?.line
                && candidate.method === endpoint.method && candidate.path === endpoint.path
                && JSON.stringify(candidate.effectivePaths) === JSON.stringify(endpoint.effectivePaths));
            if (prior?.reachability === 'active' && prior.analysisCoverage.globalMountResolution === 'resolved'
                && prior.dispatch?.status === 'complete' && prior.dispatch.canContinue === false) {
                endpoint.reachability = 'inactive';
                endpoint.shadowedBy = prior.endpointId;
                endpoint.analysisCoverage.globalMountResolution = 'resolved';
                endpoint.analysisCoverage.registrationReasons = ['An earlier identical route is proven to terminate without continuing to this registration.'];
                for (const property of Object.keys(endpoint.analysisCoverage.capabilities))
                    endpoint.analysisCoverage.capabilities[property] = { status: 'not-applicable', reasons: ['Shadowed by a terminating earlier registration.'] };
                endpoint.policyModel = { ...endpoint.policyModel, status: 'unknown', admissionStatus: 'unknown', unknownReasons: ['Inactive registration shadowed by an earlier route.'] };
                endpoint.authentication = { status: 'unknown', evidence: [{ ...endpoint.location, observation: 'Inactive registration shadowed by an earlier route.' }] };
                endpoint.findings = [];
                break;
            }
        }
    }
    findings.splice(0, findings.length, ...endpoints.flatMap(endpoint => endpoint.findings));
    const counts = { required: 0, optional: 0, 'not-observed': 0, unknown: 0 };
    for (const e of endpoints)
        counts[e.authentication.status]++;
    const capabilities = aggregateCapabilities(endpoints);
    const applicationAssembly = routes.applicationCoverage || { status: 'partial', reasons: ['Application graph was not established.'] };
    const complete = endpoints.length > 0 && applicationAssembly.status === 'complete' && Object.values(capabilities).every(c => c.status !== 'partial');
    return { schemaVersion: 1, analyzer: ANALYZER, status: complete ? 'complete' : 'partial', component, sourceDigest: project.sourceDigest,
        completionScope: 'declared-static-security-properties', applicationAssembly, capabilities,
        scope: { properties: Object.keys(capabilities), runtimeValidation: false, completeVulnerabilityCoverage: false },
        endpoints, findings, coverage: { ...project.coverage, endpointCount: endpoints.length, authentication: counts, resolvedRegistrations: endpoints.filter(e => e.analysisCoverage.registration === 'matched').length, partialGlobalMounts: endpoints.filter(e => e.analysisCoverage.globalMountResolution !== 'resolved').length, endpointsReachingBounds: endpoints.filter(e => e.analysisCoverage.boundsReached).length, capabilities, limits: { source: LIMITS, execution: BOUNDS } }, limitations: [
            'This is bounded static source evidence, not a runtime penetration test, exploitability assessment, or proof that an endpoint is secure or public.',
            'Authentication required means a recognized successful credential verification is present on observed admission paths; it does not validate key secrecy, token issuer/audience/algorithms, credential strength, or deployment controls.',
            'Dynamic loading, unresolved external guards, computed routes, callback-based verification, loops, switches, recursion, and execution limits can leave policy unknown.',
            'Role values are source constants, not inferred business role names. Conditional and disjunctive ownership/role predicates must retain their scope.',
            'Absence of a recognized ownership or authentication condition is not itself an IDOR, missing authorization finding, or evidence that model/proxy/deployment controls are absent.',
            'Database effects, external libraries and asynchronous scheduling are modeled only where explicit supported summaries and coverage evidence exist.',
            'The digest binds inspected source and supported package metadata; excluded directories and skipped files are counted in coverage.',
            'Complete means coverage of the declared static properties and selected application graph, not absence of vulnerabilities. Expected policy and runtime evidence are separate.'
        ] };
}
if (require.main === module) {
    try {
        const args = process.argv.slice(2);
        if (args.length !== 4 || args[0] !== '--input' || args[2] !== '--output')
            throw new Error('Usage: node analyzer.cjs --input input.json --output new-output.json');
        const inputPath = path.resolve(args[1]), outputPath = path.resolve(args[3]);
        if (fs.statSync(inputPath).size > 32 * 1024 * 1024)
            throw new Error('Input JSON exceeds the 32 MiB limit.');
        if (fs.existsSync(outputPath))
            throw new Error('Output already exists; use a new output path.');
        const result = analyze(JSON.parse(fs.readFileSync(inputPath, 'utf8'))), text = JSON.stringify(result, null, 2) + '\n';
        if (Buffer.byteLength(text) > 64 * 1024 * 1024)
            throw new Error('Output exceeds the 64 MiB limit.');
        fs.writeFileSync(outputPath, text, { flag: 'wx' });
        process.stdout.write(JSON.stringify({ status: result.status, endpoints: result.endpoints.length, findings: result.findings.length }) + '\n');
    }
    catch (error) {
        process.stderr.write(`Static analysis failed: ${error.message}\n`);
        process.exitCode = 1;
    }
}
module.exports = { analyze, ANALYZER };
