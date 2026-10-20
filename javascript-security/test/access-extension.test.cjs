'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { analyze } = require('../analyzer.cjs');
const { predicateBound } = require('../flow-policy.cjs');
function run(body) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aridnova-access-'));
    const component = { name: 'fixture', kind: 'backend', commit: 'f'.repeat(40), repositoryURL: 'https://example.invalid/fixture' };
    try {
        fs.writeFileSync(path.join(root, 'server.js'), "const app=require('express')();const jwt=require('jsonwebtoken');\nconst auth=(req,res,next)=>{try{req.user=jwt.verify(req.headers.authorization,process.env.KEY);next();}catch(e){res.status(401).send();}};\n" + body);
        return analyze({ sourceRoot: root, component, analysisProfile: { entrypoint: 'server.js' }, snapshot: { component, endpoints: [{ id: 'e', method: 'POST', path: '/record', file: 'server.js', line: 3 }] } }).endpoints[0];
    } finally {
        assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(root).startsWith('aridnova-access-'));
        fs.rmSync(root, { recursive: true, force: true });
    }
}
test('pure regex/date declarations and numeric locals do not erase a role guard', () => {
    const endpoint = run("app.post('/record',auth,(req,res)=>{const pattern=/test/;const date=new Date();let count=0;count+=2;count++;if(req.user.role_id!==1)return res.status(403).send();res.json({date:date.toISOString(),count});});");
    assert.equal(endpoint.policyModel.status, 'complete');
    assert.equal(endpoint.roleChecks[0].typedPredicate.op, 'not');
});
test('literal spread arguments preserve helper positions', () => {
    const endpoint = run("app.post('/record',auth,(req,res)=>{function answer(r,s){if(r.user.role_id!==1)return s.status(403).send();s.send();}answer(...[req,res]);});");
    assert.equal(endpoint.roleChecks[0].typedPredicate.op, 'not');
    assert.equal(endpoint.policyModel.status, 'complete');
});
test('unknown spread arguments and transformed principal updates remain partial', () => {
    for (const code of ["answer(...req.body.items);", "req.user.role_id++;", "req.user.role_id+=1;", "const date=new Date(req.body.date);date.toISOString();"]) {
        const endpoint = run(`app.post('/record',auth,(req,res)=>{${code}if(req.user.role_id!==1)return res.status(403).send();res.send();});`);
        assert.equal(endpoint.policyModel.status, 'partial', code);
    }
});
test('unknown predicates reverse bound direction under negation', () => {
    const predicate = { op: 'not', arg: { op: 'unknown' } };
    assert.deepEqual(predicateBound(predicate, true), { op: 'not', arg: { op: 'false' } });
    assert.deepEqual(predicateBound(predicate, false), { op: 'not', arg: { op: 'true' } });
});

test('unresolved operations before verification have no invented credential bound', () => {
    const endpoint = run("const db=require('mysql2');app.post('/record',(req,res,next)=>{db.query('UPDATE accounts SET active=1');unknown(req.body);next();},auth,(req,res)=>res.send());");
    assert.equal(endpoint.authentication.status, 'required');
    assert.ok(endpoint.policyModel.authorizationEnvelope.operations.length > 0);
    assert.equal(endpoint.policyModel.authorizationEnvelope.operations[0].mayReach.op, 'true');
    assert.equal(endpoint.policyModel.status, 'partial');
});
