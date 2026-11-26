'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {analyze}=require('../analyzer.cjs');
const component={name:'static-fixture',kind:'backend',repositoryURL:'https://example.invalid/fixture.git',commit:'0'.repeat(40)};
const auth=`const jwt=require('jsonwebtoken');
exports.required=(req,res,next)=>{const token=req.header('Authorization');if(!token)return res.status(401).send();try{req.user=jwt.verify(token,process.env.KEY);return next();}catch(e){return res.status(401).send();}};
exports.optional=(req,res,next)=>{const token=req.header('Authorization');if(!token)return next();try{req.user=jwt.verify(token,process.env.KEY);return next();}catch(e){return res.status(401).send();}};`;
function run(files,registrations){const root=fs.mkdtempSync(path.join(os.tmpdir(),'aridnova-security-'));try{for(const [name,source]of Object.entries(files)){const target=path.join(root,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);}
 const endpoints=registrations.map(([file,route,method='GET'],i)=>({id:'e'+i,file,line:files[file].split('\n').findIndex(l=>l.includes(`'${route}'`))+1,method,path:route}));return analyze({sourceRoot:root,component,snapshot:{component,endpoints}});
 }finally{const target=path.resolve(root);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert.ok(path.basename(target).startsWith('aridnova-security-'));fs.rmSync(target,{recursive:true,force:true});}}
const basic=body=>`throw new Error('MUST_NOT_EXECUTE');\nconst express=require('express');const app=express();const auth=require('./auth');\n${body}`;
test('required and optional depend on continuing paths, not handler name',()=>{
 const r=run({'auth.js':auth,'server.js':basic("app.get('/required',auth.required,(req,res)=>res.send());\napp.get('/optional',auth.optional,(req,res)=>res.send());")},[['server.js','/required'],['server.js','/optional']]);assert.deepEqual(r.endpoints.map(x=>x.authentication.status),['required','optional']);assert.match(r.sourceDigest,/^[a-f0-9]{64}$/);
});
test('global middleware registration order and path prefixes',()=>{
 const r=run({'auth.js':auth,'server.js':basic("app.get('/before',(req,res)=>res.send());\napp.use('/private',auth.required);\napp.get('/private/item',(req,res)=>res.send());\napp.get('/other',(req,res)=>res.send());")},[['server.js','/before'],['server.js','/private/item'],['server.js','/other']]);assert.deepEqual(r.endpoints.map(x=>x.authentication.status),['not-observed','required','not-observed']);
});
test('router mounts include only middleware before the mount and local route',()=>{
 const r=run({'auth.js':auth,'router.js':"const router=require('express').Router();\nrouter.get('/item',(req,res)=>res.send());\nmodule.exports=router;",'server.js':basic("const router=require('./router');\napp.use('/api',auth.required,router);\napp.use(auth.optional);")},[['router.js','/item']]);assert.equal(r.endpoints[0].authentication.status,'required');assert.equal(r.endpoints[0].middlewareChain[0].source,'mount');
});
test('explicit imported registrar invocation propagates earlier global guards',()=>{
 const r=run({'auth.js':auth,'routes.js':"module.exports=app=>{\napp.get('/item',(req,res)=>res.send());\n};",'server.js':basic("app.use(auth.required);\nrequire('./routes')(app);")},[['routes.js','/item']]);assert.equal(r.endpoints[0].authentication.status,'required');assert.equal(r.endpoints[0].analysisCoverage.globalMountResolution,'resolved');
});
test('multiple router mounting alternatives cannot become a required guarantee',()=>{
 const r=run({'auth.js':auth,'router.js':"const router=require('express').Router();\nrouter.get('/item',(req,res)=>res.send());\nmodule.exports=router;",'server.js':basic("const router=require('./router');\napp.use('/private',auth.required,router);\napp.use('/public',router);")},[['router.js','/item']]);assert.equal(r.endpoints[0].authentication.status,'unknown');assert.equal(r.endpoints[0].analysisCoverage.registrationAlternatives,2);
});
test('JWT decode, error continuation, and denial fallthrough have distinct evidence',()=>{
 const code=`const jwt=require('jsonwebtoken');
exports.decode=(req,res,next)=>{req.user=jwt.decode(req.headers.authorization);next();};
exports.error=(req,res,next)=>{try{req.user=jwt.verify(req.headers.authorization,process.env.KEY);}catch(e){return next();}next();};
exports.fall=(req,res,next)=>{if(!req.headers.authorization)res.status(401).send();next();};`;
 const r=run({'auth.js':code,'server.js':basic("app.get('/decode',auth.decode,(req,res)=>res.send());\napp.get('/error',auth.error,(req,res)=>res.send());\napp.get('/fall',auth.fall,(req,res)=>res.send());")},[['server.js','/decode'],['server.js','/error'],['server.js','/fall']]);assert.deepEqual(r.findings.map(x=>x.ruleId).sort(),['DENIAL_FALLTHROUGH','JWT_DECODE_IDENTITY','JWT_FAILURE_CONTINUES']);assert.ok(r.endpoints.every(x=>x.authentication.status!=='required'));
});
test('callback without guarded continuation is not authentication; next control transfers remain unknown',()=>{
 const code=`const jwt=require('jsonwebtoken');
exports.callback=(req,res,next)=>{jwt.verify(req.headers.authorization,process.env.KEY,(err,user)=>{if(err)res.status(401).send();});next();};
exports.skip=(req,res,next)=>next('route');
exports.error=(req,res,next)=>next(new Error());`;
 const r=run({'auth.js':code,'server.js':basic("app.get('/callback',auth.callback,(req,res)=>res.send());\napp.get('/skip',auth.skip,(req,res)=>res.send());\napp.get('/error',auth.error,(req,res)=>res.send());")},[['server.js','/callback'],['server.js','/skip'],['server.js','/error']]);assert.deepEqual(r.endpoints.map(x=>x.authentication.status),['not-observed','unknown','unknown']); // Callback verification does not gate the immediate next().
});
test('unrelated verify methods and static token literals cannot establish request authentication',()=>{
 const code=`const fake=require('something-else');const jwt=require('jsonwebtoken');
exports.fake=(req,res,next)=>{req.user=fake.verify(req.headers.authorization);next();};
exports.static=(req,res,next)=>{req.user=jwt.verify('PRIVATE_VALUE_MUST_NOT_APPEAR',process.env.KEY);next();};`;
 const r=run({'auth.js':code,'server.js':basic("app.get('/fake',auth.fake,(req,res)=>res.send());\napp.get('/static',auth.static,(req,res)=>res.send());")},[['server.js','/fake'],['server.js','/static']]);assert.ok(r.endpoints.every(x=>x.authentication.status!=='required'));assert.ok(!JSON.stringify(r).includes('PRIVATE_VALUE_MUST_NOT_APPEAR'));
});
test('shadowed require and mutated verification objects are never trusted',()=>{
 for(const code of ["const require=x=>({verify:x=>x});const jwt=require('jsonwebtoken');", "const jwt=require('jsonwebtoken');jwt.verify=x=>x;", "const jwt=require('jsonwebtoken');const alias=jwt;alias.verify=x=>x;"]){const r=run({'auth.js':code+"\nexports.bad=(req,res,next)=>{req.user=jwt.verify(req.headers.authorization,process.env.KEY);next();};",'server.js':basic("app.get('/bad',auth.bad,(req,res)=>res.send());")},[['server.js','/bad']]);assert.notEqual(r.endpoints[0].authentication.status,'required');}
});
test('import aliases and bounded helpers preserve request verification',()=>{
 const code=`import { verify as check } from 'jsonwebtoken';
function validate(request){return check(request.headers.authorization,process.env.KEY);}
export function gate(request,response,done){try{request.user=validate(request);done();}catch(e){response.status(401).send();}}`;
 const r=run({'auth.js':code,'server.js':basic("app.get('/alias',auth.gate,(req,res)=>res.send());")},[['server.js','/alias']]);assert.equal(r.endpoints[0].authentication.status,'required');assert.ok(r.endpoints[0].analysisCoverage.functionsAnalyzed>=3);
});
test('owner OR role policy retains the disjunction; input presence and unused equality are not guards',()=>{
 const r=run({'auth.js':auth,'server.js':basic("app.post('/or',auth.required,(req,res)=>{if(req.body.id===req.user.id||req.user.role_id===1)return res.json(save(req.body));return res.status(403).send();});\napp.post('/presence',auth.required,(req,res)=>{if(req.body.id)return res.json(save(req.body));});\napp.post('/unused',auth.required,(req,res)=>{const owner=req.body.id===req.user.id;return res.json(save(req.body));});")},[['server.js','/or','POST'],['server.js','/presence','POST'],['server.js','/unused','POST']]);assert.equal(r.endpoints[0].ownershipChecks[0].predicate.operator,'any-of');assert.equal(r.endpoints[0].ownershipChecks[0].status,'enforced');assert.equal(r.endpoints[1].ownershipChecks.length,0);assert.equal(r.endpoints[2].ownershipChecks.length,0);
});
test('sending denial without return does not enforce ownership; next before guard is reported',()=>{
 const r=run({'auth.js':auth,'server.js':basic("app.post('/fall',auth.required,(req,res)=>{if(req.body.id!==req.user.id)res.status(403).send();save(req.body);});\napp.get('/late',(req,res,next)=>{next();if(req.user.role_id!==1)return res.status(403).send();},(req,res)=>res.send());")},[['server.js','/fall','POST'],['server.js','/late']]);assert.equal(r.endpoints[0].ownershipChecks[0].status,'observed');assert.ok(r.endpoints[1].findings.some(f=>f.ruleId==='GUARD_AFTER_NEXT'));assert.ok(r.endpoints[1].roleChecks.every(g=>g.status!=='enforced'));
});
test('body alias and JSON.parse ownership preserve the compared request provenance',()=>{
 const r=run({'auth.js':auth,'server.js':basic("app.post('/alias',auth.required,(req,res)=>{const p=req.body.user;if(p.id!==req.user.id)return res.status(403).send();save(p);});\napp.post('/parse',auth.required,(req,res)=>{const p=JSON.parse(req.body.user);if(p.id!==req.user.id)return res.status(403).send();save(p);});")},[['server.js','/alias','POST'],['server.js','/parse','POST']]);assert.equal(r.endpoints[0].ownershipChecks[0].status,'enforced');assert.equal(r.endpoints[1].ownershipChecks[0].status,'enforced');
});
test('compound predicates redact unrelated credential literals',()=>{
 const r=run({'auth.js':auth,'server.js':basic("app.get('/secret',auth.required,(req,res)=>{if(req.user.role_id===1&&req.headers.key==='DO_NOT_OUTPUT_SECRET')res.send();else res.status(403).send();});")},[['server.js','/secret']]);assert.ok(!JSON.stringify(r).includes('DO_NOT_OUTPUT_SECRET'));assert.ok(JSON.stringify(r).includes('principal.role_id'));
});
test('opaque middleware remains unknown and resources expose explicit bounds',()=>{
 const r=run({'auth.js':"exports.gate=require('opaque-provider');",'server.js':basic("app.get('/opaque',auth.gate,(req,res)=>res.send());")},[['server.js','/opaque']]);assert.equal(r.endpoints[0].authentication.status,'unknown');assert.equal(r.status,'partial');assert.ok(r.coverage.limits.source.files>0);assert.ok(r.limitations.length>0);
});
test('short circuit verification preserves the unverified continuation',()=>{
 const r=run({'auth.js':"const jwt=require('jsonwebtoken');exports.gate=(req,res,next)=>{const token=req.headers.authorization;try{token&&jwt.verify(token,process.env.KEY);next();}catch(e){res.status(401).send();}};",'server.js':basic("app.get('/short',auth.gate,(req,res)=>res.send());")},[['server.js','/short']]);assert.notEqual(r.endpoints[0].authentication.status,'required');
});
test('named empty JWT callback does not verify the immediate continuation',()=>{
 const r=run({'auth.js':"const jwt=require('jsonwebtoken');function callback(err,user){} exports.gate=(req,res,next)=>{jwt.verify(req.headers.authorization,process.env.KEY,callback);next();};",'server.js':basic("app.get('/callback',auth.gate,(req,res)=>res.send());")},[['server.js','/callback']]);assert.equal(r.endpoints[0].authentication.status,'not-observed'); // The named callback never gates next().
});
test('nullish and logical assignment verification cannot manufacture a required guard',()=>{
 for(const expression of ['token ?? jwt.verify(token,process.env.KEY)','token ||= jwt.verify(token,process.env.KEY)','token &&= jwt.verify(token,process.env.KEY)','token ??= jwt.verify(token,process.env.KEY)']){const r=run({'auth.js':`const jwt=require('jsonwebtoken');exports.gate=(req,res,next)=>{let token=req.headers.authorization;try{${expression};next();}catch(e){res.status(401).send();}};`,'server.js':basic("app.get('/logical',auth.gate,(req,res)=>res.send());")},[['server.js','/logical']]);assert.notEqual(r.endpoints[0].authentication.status,'required');}
});
test('forwarding next to an opaque helper makes continuation coverage unknown',()=>{
 const r=run({'auth.js':"const opaque=require('unknown-helper');const jwt=require('jsonwebtoken');exports.gate=(req,res,next)=>{opaque(req,res,next);req.user=jwt.verify(req.headers.authorization,process.env.KEY);next();};",'server.js':basic("app.get('/opaque',auth.gate,(req,res)=>res.send());")},[['server.js','/opaque']]);assert.equal(r.endpoints[0].authentication.status,'unknown');
});
test('conditional and uninvoked function registrations are not mandatory middleware',()=>{
 for(const registration of ["if(process.env.FLAG)app.use(auth.required);", "function install(){app.use(auth.required);}"]){const r=run({'auth.js':auth,'server.js':basic(`${registration}\napp.get('/conditional',(req,res)=>res.send());`)},[['server.js','/conditional']]);assert.equal(r.endpoints[0].authentication.status,'unknown');}
});
test('oversized files are skipped and unsupported admission loops report bounds',()=>{
 const r=run({'oversized.js':' '.repeat(2*1024*1024+1),'auth.js':"const jwt=require('jsonwebtoken');exports.gate=(req,res,next)=>{for(const x of req.body.items){jwt.verify(x,process.env.KEY);}next();};",'server.js':basic("app.get('/bounded',auth.gate,(req,res)=>res.send());")},[['server.js','/bounded']]);assert.equal(r.coverage.skippedFiles,1);assert.equal(r.coverage.boundsReached,true);assert.equal(r.endpoints[0].analysisCoverage.boundsReached,true);assert.equal(r.endpoints[0].authentication.status,'unknown');
});
test('Bearer slicing and standard trim aliases preserve request credential provenance',()=>{
 for(const trim of ['trimLeft','trimRight','trimStart','trimEnd']){const r=run({'auth.js':`const jwt=require('jsonwebtoken');exports.gate=(req,res,next)=>{let token=req.header('Authorization');if(!token)return res.status(401).send();try{if(token.startsWith('Bearer '))token=token.slice(7,token.length).${trim}();req.user=jwt.verify(token,process.env.KEY);next();}catch(e){res.status(401).send();}};`,'server.js':basic("app.get('/bearer',auth.gate,(req,res)=>res.send());")},[['server.js','/bearer']]);assert.equal(r.endpoints[0].authentication.status,'required');}
});
