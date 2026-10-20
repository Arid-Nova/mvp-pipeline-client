'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { analyze } = require('../analyzer.cjs');

const identity = { name: 'flow-fixture', kind: 'backend', repositoryURL: 'https://example.invalid/flow.git', commit: 'f'.repeat(40) };
const auth = `const jwt=require('jsonwebtoken');exports.required=(req,res,next)=>{try{req.user=jwt.verify(req.headers.authorization,process.env.KEY);return next();}catch(e){return res.status(401).send();}};`;
const preamble = `const app=require('express')();const auth=require('./auth');const db=require('mysql2');\n`;
function run(source, paths, other = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aridnova-flow-'));
    const files = { 'auth.js': auth, 'server.js': preamble + source, ...other };
    try {
        for (const [name, text] of Object.entries(files)) {
            const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text);
        }
        return analyze({ sourceRoot: root, component: identity, analysisProfile: { entrypoint: 'server.js' }, snapshot: { component: identity, endpoints: paths.map((route, index) => ({ id: `e${index}`, file: 'server.js', line: files['server.js'].split('\n').findIndex(line => line.includes(`'${route}'`)) + 1, method: 'POST', path: route })) } });
    }
    finally {
        const target = path.resolve(root);
        assert.equal(path.dirname(target), path.resolve(os.tmpdir())); assert.ok(path.basename(target).startsWith('aridnova-flow-'));
        fs.rmSync(target, { recursive: true, force: true });
    }
}

test('parsed request ownership dominates the actual matching database subject', () => {
    const e = run(`app.post('/owner',auth.required,async(req,res)=>{const item=JSON.parse(req.body.user);if(item.id!==req.user.id)return res.status(403).send();await db.query('UPDATE accounts SET name = ? WHERE id = ?',[item.name,item.id]);res.send();});`, ['/owner']).endpoints[0];
    assert.equal(e.authentication.status, 'required'); assert.equal(e.ownershipChecks[0].status, 'enforced');
    assert.equal(e.dataOperations.length, 1); assert.equal(e.dataOperations[0].operation, 'update');
    assert.ok(e.dataOperations[0].subjects.some(x => x.path === 'request.body.user.id'));
    assert.equal(e.dataOperations[0].policy.status, 'guarded'); assert.equal(e.dataOperations[0].policy.ownershipGuardIds.length, 1);
});

test('checking one resource does not claim ownership of a different database subject', () => {
    const e = run(`app.post('/wrong',auth.required,async(req,res)=>{if(req.body.id!==req.user.id)return res.status(403).send();await db.query('DELETE FROM accounts WHERE id = ?',[req.body.otherId]);res.send();});`, ['/wrong']).endpoints[0];
    assert.equal(e.dataOperations[0].policy.ownershipGuardIds.length, 0); assert.equal(e.dataOperations[0].policy.status, 'unguarded');
});

test('an ownership check after a write never dominates that write', () => {
    const e = run(`app.post('/late',auth.required,async(req,res)=>{await db.query('DELETE FROM accounts WHERE id = ?',[req.body.id]);if(req.body.id!==req.user.id)return res.status(403).send();res.send();});`, ['/late']).endpoints[0];
    assert.deepEqual(e.dataOperations[0].pathConditions, [[]]); assert.equal(e.dataOperations[0].policy.status, 'unguarded');
});

test('JWT callback continuation distinguishes guarded and immediate bypass paths', () => {
    const r = run(`const jwt=require('jsonwebtoken');
app.post('/callback',(req,res,next)=>{jwt.verify(req.headers.authorization,process.env.KEY,(err,user)=>{if(err)return res.status(401).send();req.user=user;next();});},(req,res)=>res.send());
app.post('/bypass',(req,res,next)=>{jwt.verify(req.headers.authorization,process.env.KEY,(err,user)=>{if(err)return res.status(401).send();req.user=user;next();});next();},(req,res)=>res.send());`, ['/callback', '/bypass']);
    assert.equal(r.endpoints[0].authentication.status, 'required'); assert.equal(r.endpoints[1].authentication.status, 'optional');
    assert.ok(r.endpoints[1].policyModel.unknownReasons.includes('asynchronous-callback-schedule'));
});

test('JWT callback failure that calls next is an unverified continuation', () => {
    const e = run(`const jwt=require('jsonwebtoken');app.post('/failure',(req,res,next)=>{jwt.verify(req.headers.authorization,process.env.KEY,(err,user)=>{if(err)return next();req.user=user;next();});},(req,res)=>res.send());`, ['/failure']).endpoints[0];
    assert.equal(e.authentication.status, 'optional'); assert.ok(e.findings.some(x => x.ruleId === 'JWT_FAILURE_CONTINUES'));
});

test('switch role alternatives preserve cases and default termination', () => {
    const e = run(`app.post('/switch',auth.required,async(req,res)=>{switch(req.user.role_id){case 1: case 2: await db.query('DELETE FROM accounts WHERE id = ?',[req.body.id]);break;default:return res.status(403).send();}res.send();});`, ['/switch']).endpoints[0];
    assert.equal(e.analysisCoverage.boundsReached, false); assert.equal(e.roleChecks.length, 2);
    assert.equal(e.dataOperations.length, 1); assert.equal(e.dataOperations[0].pathConditions.length, 2);
    assert.ok(JSON.stringify(e.dataOperations[0].predicate).includes('"value":2'));
});

test('default before a later switch case follows JavaScript fallthrough order', () => {
    const e = run(`app.post('/default',auth.required,async(req,res)=>{switch(req.user.role_id){default:return res.status(403).send();case 1:await db.query('DELETE FROM accounts WHERE id = ?',[req.body.id]);break;}res.send();});`, ['/default']).endpoints[0];
    assert.equal(e.dataOperations.length, 1); assert.equal(e.dataOperations[0].pathConditions.length, 1);
});

test('representative loop records guarded per-item writes without a path cutoff', () => {
    const e = run(`app.post('/loop',auth.required,async(req,res)=>{for(const item of req.body.items){if(item.id!==req.user.id)continue;await db.query('UPDATE accounts SET active = 1 WHERE id = ?',[item.id]);}res.send();});`, ['/loop']).endpoints[0];
    assert.equal(e.authentication.status, 'required'); assert.equal(e.analysisCoverage.boundsReached, false);
    assert.ok(e.dataOperations[0].subjects.some(x => x.path === 'request.body.items[].id'));
    assert.ok(e.analysisCoverage.capabilities.executionPaths.reasons.includes('loop-iteration-summary'));
});

test('promise executor and database callbacks retain request subjects and lexical scope', () => {
    const e = run(`function update(id){return new Promise((resolve,reject)=>{db.query('UPDATE accounts SET active = 1 WHERE id = ?',[id],(err,result)=>{if(err)return reject(err);resolve(result);});});}
app.post('/promise',auth.required,async(req,res)=>{if(req.params.id!==req.user.id)return res.status(403).send();try{await update(req.params.id);res.send();}catch(e){res.status(500).send();}});`, ['/promise']).endpoints[0];
    assert.equal(e.dataOperations.length, 1); assert.ok(e.dataOperations[0].subjects.some(x => x.path === 'request.params.id')); assert.equal(e.authentication.status, 'required');
});

test('a query-shaped method from an unrelated package is not a proven database operation', () => {
    const e = run(`const other=require('unrelated');app.post('/fake',auth.required,(req,res)=>{other.query('DELETE FROM accounts',[req.body.id]);res.send();});`, ['/fake']).endpoints[0];
    assert.deepEqual(e.dataOperations, []); assert.equal(e.analysisCoverage.capabilities.dataAccess.status, 'partial');
});

test('nullish query parameters do not create exponential policy paths', () => {
    const parameters = Array.from({ length: 24 }, (_, i) => `req.body.p${i} ?? null`).join(',');
    const e = run(`app.post('/params',auth.required,async(req,res)=>{await db.query('SELECT * FROM accounts WHERE id = ?',[${parameters}]);res.send();});`, ['/params']).endpoints[0];
    assert.equal(e.analysisCoverage.boundsReached, false); assert.equal(e.dataOperations[0].subjects.length, 24); assert.equal(e.authentication.status, 'required');
});

test('unsupported business condition remains explicit in the policy model', () => {
    const e = run(`app.post('/flag',auth.required,async(req,res)=>{if(req.query.flag)await db.query('DELETE FROM accounts WHERE id = ?',[req.body.id]);res.send();});`, ['/flag']).endpoints[0];
    assert.equal(e.policyModel.status, 'partial'); assert.ok(e.policyModel.unknownReasons.includes('unresolved-policy-predicate'));
});

test('unawaited asynchronous verification cannot authenticate immediate next', () => {
    const e = run(`const jwt=require('jsonwebtoken');async function verify(req){await Promise.resolve();return jwt.verify(req.headers.authorization,process.env.KEY);}app.post('/async',(req,res,next)=>{verify(req);next();},(req,res)=>res.send());`, ['/async']).endpoints[0];
    assert.notEqual(e.authentication.status, 'required');
});

test('request-derived replacement identity cannot create a complete role policy', () => {
    const e = run(`app.post('/replacement',auth.required,async(req,res)=>{req.user={role_id:req.body.role};if(req.user.role_id!==1)return res.status(403).send();await db.query('DELETE FROM accounts WHERE id = ?',[req.body.id]);res.send();});`, ['/replacement']).endpoints[0];
    assert.notEqual(e.policyModel.status, 'complete');
});

test('controller role denial is retained in the successful-response policy', () => {
    const e = run(`app.post('/controller-role',auth.required,(req,res)=>{if(req.user.role_id!==1)return res.status(403).send();res.send();});`, ['/controller-role']).endpoints[0];
    assert.equal(e.authentication.status, 'required');
    assert.equal(e.policyModel.status, 'complete');
    assert.ok(JSON.stringify(e.policyModel.admission).includes('"field":"role"'));
    assert.ok(JSON.stringify(e.policyModel.admission).includes('"value":1'));
});

test('ownership source matching uses exact paths and WHERE selectors', () => {
    const r = run(`app.post('/prefix',auth.required,async(req,res)=>{if(req.body.identity!==req.user.id)return res.status(403).send();await db.query('DELETE FROM accounts WHERE id = ?',[req.body.id]);res.send();});
app.post('/set-value',auth.required,async(req,res)=>{if(req.body.id!==req.user.id)return res.status(403).send();await db.query('UPDATE accounts SET changed_by = ? WHERE id = ?',[req.body.id,req.body.otherId]);res.send();});
app.post('/or-selector',auth.required,async(req,res)=>{if(req.body.id!==req.user.id)return res.status(403).send();await db.query('DELETE FROM accounts WHERE id = ? OR id = ?',[req.body.id,req.body.otherId]);res.send();});`, ['/prefix', '/set-value', '/or-selector']);
    for (const e of r.endpoints) assert.equal(e.dataOperations[0].policy.ownershipGuardIds.length, 0);
    assert.equal(r.endpoints[1].dataOperations[0].selectors[0].path, 'request.body.otherId');
    assert.equal(r.endpoints[2].dataOperations[0].selectorMapping, 'unknown');
});

test('coercion and literal OTHER roles cannot manufacture complete finite policies', () => {
    const r = run(`app.post('/loose',auth.required,(req,res)=>{if(req.user.role_id==1)res.send();else res.status(403).send();});
app.post('/number',auth.required,(req,res)=>{if(Number(req.user.role_id)===1)res.send();else res.status(403).send();});
app.post('/other',auth.required,(req,res)=>{if(req.user.role_id==='OTHER')res.send();else res.status(403).send();});`, ['/loose', '/number', '/other']);
    for (const e of r.endpoints) assert.notEqual(e.policyModel.status, 'complete');
});

test('parsed integer comparison does not prove ownership of the original raw identifier', () => {
    const e = run(`app.post('/coerced',auth.required,async(req,res)=>{if(parseInt(req.body.id,10)!==req.user.id)return res.status(403).send();await db.query('DELETE FROM accounts WHERE id = ?',[req.body.id]);res.send();});`, ['/coerced']).endpoints[0];
    assert.equal(e.ownershipChecks[0].status, 'unknown'); assert.equal(e.dataOperations[0].policy.ownershipGuardIds.length, 0); assert.notEqual(e.policyModel.status, 'complete');
});

test('principal role mutation and alias mutation do not describe original JWT roles', () => {
    const r = run(`app.post('/mutate',auth.required,(req,res,next)=>{req.user.role_id=1;if(req.user.role_id===1)next();else res.status(403).send();},(req,res)=>res.send());
app.post('/alias-mutate',auth.required,(req,res,next)=>{const user=req.user;user.role_id=1;if(req.user.role_id===1)next();else res.status(403).send();},(req,res)=>res.send());`, ['/mutate', '/alias-mutate']);
    for (const e of r.endpoints) {
        assert.equal(e.authentication.status, 'required'); assert.notEqual(e.policyModel.status, 'complete');
        assert.ok(e.policyModel.unknownReasons.includes('principal-policy-field-mutated'));
        assert.ok(!JSON.stringify(e.policyModel.admission).includes('"field":"role"'));
    }
});

test('role predicates from absent or decoded identity remain unknown policy inputs', () => {
    const r = run(`const jwt=require('jsonwebtoken');app.post('/missing',(req,res)=>{if(req.user.role_id===1)return res.send();res.status(403).send();});
app.post('/decoded',(req,res,next)=>{req.user=jwt.decode(req.headers.authorization);if(req.user.role_id===1)return next();res.status(403).send();},(req,res)=>res.send());`, ['/missing', '/decoded']);
    for (const e of r.endpoints) assert.equal(e.policyModel.status, 'partial');
});

test('unawaited promise verification cannot protect immediate next but returned chain can', () => {
    const r = run(`const jwt=require('jsonwebtoken');app.post('/immediate',(req,res,next)=>{Promise.resolve().then(()=>{req.user=jwt.verify(req.headers.authorization,process.env.KEY);});next();},(req,res)=>res.send());
app.post('/returned',(req,res,next)=>{return Promise.resolve().then(()=>{req.user=jwt.verify(req.headers.authorization,process.env.KEY);next();}).catch(()=>res.status(401).send());},(req,res)=>res.send());`, ['/immediate', '/returned']);
    assert.equal(r.endpoints[0].authentication.status, 'not-observed'); assert.equal(r.endpoints[0].policyModel.status, 'partial');
    assert.equal(r.endpoints[1].authentication.status, 'required');
});

test('inverse database selector never establishes ownership of selected records', () => {
    const r = run(`app.post('/inverse',auth.required,async(req,res)=>{if(req.body.id!==req.user.id)return res.status(403).send();await db.query('DELETE FROM accounts WHERE id != ?',[req.body.id]);res.send();});
app.post('/negated',auth.required,async(req,res)=>{if(req.body.id!==req.user.id)return res.status(403).send();await db.query('DELETE FROM accounts WHERE NOT(id = ?)',[req.body.id]);res.send();});`, ['/inverse', '/negated']);
    for (const e of r.endpoints) { assert.equal(e.dataOperations[0].policy.ownershipGuardIds.length, 0); assert.equal(e.dataOperations[0].selectorMapping, 'unknown'); }
});

test('denial followed by a database operation has a source control-flow finding', () => {
    const e = run(`app.post('/denial-write',auth.required,async(req,res)=>{if(req.user.role_id!==1)res.status(403).send();await db.query('DELETE FROM accounts WHERE id = ?',[req.body.id]);res.send();});`, ['/denial-write']).endpoints[0];
    const finding = e.findings.find(x => x.ruleId === 'DENIAL_BEFORE_DATA_OPERATION');
    assert.ok(finding); assert.equal(finding.classification, 'source-supported');
    assert.ok(finding.evidence.some(x => x.observation.includes('HTTP 403')));
});

test('next route control transfers never certify a terminating dispatch', () => {
    const r = run(`app.post('/early',(req,res,next)=>next('route'),(req,res)=>res.send());
app.post('/final',auth.required,(req,res,next)=>next('route'));
app.post('/error',auth.required,(req,res,next)=>next(new Error('fixture')));`, ['/early', '/final', '/error']);
    for (const e of r.endpoints) { assert.equal(e.dispatch.status, 'partial'); assert.equal(e.dispatch.canContinue, null); }
});
