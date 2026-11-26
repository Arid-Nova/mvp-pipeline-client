'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { analyze } = require('../analyzer.cjs');

function duplicate(first) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aridnova-coverage-'));
    try {
        fs.writeFileSync(path.join(root, 'server.js'), `const app=require('express')();\napp.get('/same',${first});\napp.get('/same',(req,res)=>res.send('later'));\n`);
        const component = { name: 'fixture', kind: 'backend', repositoryURL: 'https://example.invalid/fixture', commit: '0'.repeat(40) };
        return analyze({ sourceRoot: root, component, analysisProfile: { entrypoint: 'server.js' }, snapshot: {
            component, endpoints: [2, 3].map((line, i) => ({ id: `e${i}`, method: 'GET', path: '/same', file: 'server.js', line }))
        }});
    } finally {
        const target = path.resolve(root);
        assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
        assert.ok(path.basename(target).startsWith('aridnova-coverage-'));
        fs.rmSync(target, { recursive: true, force: true });
    }
}

test('only a proven terminating earlier registration makes a duplicate inactive', () => {
    const report = duplicate('(req,res)=>res.send()');
    assert.equal(report.endpoints[0].dispatch.status, 'complete');
    assert.equal(report.endpoints[1].reachability, 'inactive');
    assert.equal(report.endpoints[1].shadowedBy, 'e0');
    assert.ok(Object.values(report.endpoints[1].analysisCoverage.capabilities).every(c => c.status === 'not-applicable'));
});

test('continuations, route skipping and unresolved dispatch never prove duplicate inactivity', () => {
    for (const first of ['(req,res,next)=>next()', "(req,res,next)=>next('route')", "(req,res,next)=>next('route'),(req,res)=>res.send()", '(req,res,next)=>unknown(req,res,next)']) {
        const report = duplicate(first);
        assert.notEqual(report.endpoints[1].reachability, 'inactive', first);
        assert.equal(report.endpoints[1].shadowedBy, undefined, first);
    }
});

test('complete static report requires a complete finite policy model', () => {
    const report = duplicate('(req,res)=>{if(req.body.allowed)res.send();else res.status(403).send();}');
    assert.equal(report.endpoints[0].policyModel.status, 'partial');
    assert.equal(report.capabilities.policyModel.status, 'partial');
    assert.equal(report.status, 'partial');
});
