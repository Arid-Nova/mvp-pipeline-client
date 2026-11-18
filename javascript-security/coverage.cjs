'use strict';

const PROPERTIES = ['authentication', 'roleChecks', 'ownershipChecks', 'executionPaths', 'dataAccess', 'policyModel'];

// Completion is relative to declared properties and the selected application graph.
// It is never a whole-application security verdict.
function endpointCoverage(result, chain, project) {
    const capabilities = {};
    for (const property of PROPERTIES) {
        const supplied = property === 'policyModel' ? {
            status: result.policyModel?.status === 'complete' && (result.policyModel?.admissionStatus || result.policyModel?.status) === 'complete' ? 'complete' : 'partial',
            reasons: result.policyModel?.unknownReasons || ['Finite policy coverage was not established.']
        } : result.coverage?.capabilities?.[property];
        const reasons = [...(supplied?.reasons || [])];
        if (chain.reachability === 'inactive') {
            capabilities[property] = { status: 'not-applicable', reasons: ['Outside the selected application graph.'] };
            continue;
        }
        if (!chain.registration) reasons.push('Route registration was not resolved.');
        if (chain.status !== 'resolved') reasons.push('Application assembly or middleware order is unresolved.');
        if ((chain.alternatives || 0) > 1) reasons.push('Multiple registration contexts require separate analysis.');
        if (project.coverage.boundsReached || project.coverage.parseErrors || project.coverage.skippedFiles)
            reasons.push('Source inspection is incomplete.');
        if (!supplied || supplied.status !== 'complete') reasons.push('The analyzer has not established complete coverage for this property.');
        capabilities[property] = { status: reasons.length ? 'partial' : 'complete', reasons: [...new Set(reasons)] };
    }
    return capabilities;
}

function aggregateCapabilities(endpoints) {
    const result = {};
    for (const property of PROPERTIES) {
        const counts = { complete: 0, partial: 0, 'not-applicable': 0 };
        for (const endpoint of endpoints) {
            const status = endpoint.analysisCoverage.capabilities[property]?.status || 'partial';
            counts[status] = (counts[status] || 0) + 1;
        }
        result[property] = { status: counts.partial ? 'partial' : counts.complete ? 'complete' : 'not-applicable', ...counts };
    }
    return result;
}

module.exports = { PROPERTIES, endpointCoverage, aggregateCapabilities };
