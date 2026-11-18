'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Project, ts } = require('../ast.cjs');
const { Routes } = require('../routes.cjs');

function fixture(files, inspect, profile = { entrypoint: 'server.js' }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aridnova-assembly-'));
    try {
        for (const [name, contents] of Object.entries(files)) {
            const target = path.join(root, name);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, typeof contents === 'string' ? contents : JSON.stringify(contents));
        }
        const project = new Project(root), routes = new Routes(project, profile);
        const endpoint = (file, path, method = 'GET') => {
            const source = files[file];
            const line = source.split('\n').findIndex(s => s.includes(`'${path}'`)) + 1;
            return routes.forEndpoint({ file, path, method, line });
        };
        return inspect({ root, project, routes, endpoint });
    }
    finally {
        const target = path.resolve(root);
        assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
        assert.ok(path.basename(target).startsWith('aridnova-assembly-'));
        fs.rmSync(target, { recursive: true, force: true });
    }
}
const auth = "exports.required=(req,res,next)=>next();";
const base = "const app=require('express')();const auth=require('./auth');\n";

test('selected entrypoint excludes dormant server copies and uninvoked registrars', () => {
    fixture({ 'server.js': base + "app.use(auth.required);require('./routes')(app);", 'server copy.js': base + "require('./routes')(app);", 'auth.js': auth, 'routes.js': "module.exports=app=>{\napp.get('/active',(req,res)=>res.send());\n};function unused(app){\napp.get('/dead',(req,res)=>res.send());\n}" }, ({ routes, endpoint }) => {
        assert.equal(routes.applicationCoverage.status, 'complete');
        assert.equal(endpoint('routes.js', '/active').alternatives, 1);
        assert.equal(endpoint('routes.js', '/active').handlers[0].name, 'auth.required');
        assert.equal(endpoint('routes.js', '/dead').reachability, 'inactive');
        assert.ok(routes.applicationCoverage.unreferencedSourceModules.includes('server copy.js'));
    });
});
test('literal package startup is parsed as data and shell startup remains unresolved', () => {
    for (const [start, status] of [['node ./server.js', 'complete'], ['node server.js && touch SHOULD_NOT_RUN', 'partial']]) {
        fixture({ 'package.json': { scripts: { start } }, 'server.js': "const app=require('express')();\napp.get('/x',(req,res)=>res.send());" }, ({ routes }) => assert.equal(routes.applicationCoverage.status, status), {});
    }
});
test('invalid missing or escaping entrypoint never falls back to another server', () => {
    for (const entrypoint of ['index.js', '../server.js', 'C:/server.js']) {
        fixture({ 'server.js': "const app=require('express')();app.get('/x',()=>{});" }, ({ routes }) => {
            assert.equal(routes.applicationCoverage.status, 'partial');
            assert.equal(routes.applicationCoverage.selectedEntrypoint, null);
        }, { entrypoint });
    }
});
test('Consign include then order binds only selected application and honors exclude', () => {
    fixture({
        'package.json': { dependencies: { consign: '^0.1.6' } }, 'auth.js': auth,
        'server.js': base + "consign=require('consign');\nconsign().include('init.js').then('routes').exclude('routes/dead.js').into(app);",
        'server copy.js': base + "const consign=require('consign');consign().include('routes').into(app);",
        'init.js': "module.exports=app=>{app.use(require('./auth').required);};",
        'routes/live.js': "module.exports=app=>{\napp.get('/live',(req,res)=>res.send());\n};",
        'routes/dead.js': "module.exports=app=>{\napp.get('/dead',(req,res)=>res.send());\n};"
    }, ({ routes, endpoint }) => {
        assert.equal(routes.applicationCoverage.status, 'complete');
        assert.equal(endpoint('routes/live.js', '/live').reachability, 'active');
        assert.equal(endpoint('routes/live.js', '/live').status, 'resolved');
        assert.equal(endpoint('routes/live.js', '/live').alternatives, 1);
        assert.equal(endpoint('routes/live.js', '/live').handlers[0].source, 'use');
        assert.equal(endpoint('routes/dead.js', '/dead').reachability, 'inactive');
        assert.deepEqual(routes.applicationCoverage.consignLoads[0].modules, ['init.js', 'routes/live.js']);
    });
});
test('conditional middleware is never upgraded to mandatory by selected startup', () => {
    fixture({ 'server.js': base + "if(process.env.FLAG)app.use(auth.required);\napp.get('/x',(req,res)=>res.send());", 'auth.js': auth }, ({ endpoint }) => {
        const route = endpoint('server.js', '/x');
        assert.equal(route.status, 'partial');
        assert.equal(route.handlers[0].conditional, true);
    });
});
test('router prefixes and cross-module import order survive assembly', () => {
    fixture({ 'server.js': base + "const router=require('./router');app.use('/api',auth.required,router);", 'auth.js': auth, 'router.js': "const router=require('express').Router();\nrouter.get('/x',(req,res)=>res.send());\nmodule.exports=router;" }, ({ endpoint }) => {
        const route = endpoint('router.js', '/x');
        assert.equal(route.status, 'resolved');
        assert.deepEqual(route.effectivePaths, ['/api/x']);
        assert.equal(route.handlers[0].name, 'auth.required');
    });
});
test('Multer literal configuration gets version-aware continuation but no guard', () => {
    fixture({ 'package.json': { dependencies: { multer: '^1.4.5-lts.1' } }, 'server.js': "const app=require('express')();const multer=require('multer');const upload=multer({dest:'./uploads'});\napp.post('/upload',upload.single('files'),(req,res)=>res.send());" }, ({ endpoint }) => {
        const handler = endpoint('server.js', '/upload', 'POST').handlers[0];
        assert.equal(handler.resolution, 'modeled-external');
        assert.equal(handler.value.admission, 'continue-or-error');
        assert.equal(handler.value.guard, false);
        assert.equal(handler.value.authenticationUnknown, false);
        assert.equal(handler.value.versionSource, 'package.json');
    });
});
test('custom upload callback remains unresolved and unreviewed Multer versions opaque', () => {
    for (const [version, expected] of [['^1.4.5-lts.1', true], ['^9.0.0', undefined]]) {
        fixture({ 'package.json': { dependencies: { multer: version } }, 'server.js': "const app=require('express')();const multer=require('multer');const upload=multer({fileFilter(req,file,cb){cb(null,true);}});\napp.post('/upload',upload.single('files'),(req,res)=>res.send());" }, ({ endpoint }) => assert.equal(endpoint('server.js', '/upload', 'POST').handlers[0].value?.authenticationUnknown, expected));
    }
});
test('single static CommonJS model member resolves and duplicate assignments are rejected', () => {
    for (const duplicate of [false, true]) {
        fixture({ 'server.js': "const User=require('./model');\nUser.save({});", 'model.js': "const User=function(data){};User.save=(data)=>data;" + (duplicate ? 'User.save=(data)=>null;' : '') + 'module.exports=User;' }, ({ project }) => {
            let value;
            const visit = n => { if (ts.isCallExpression(n) && n.expression.getText() === 'User.save') value = project.resolve(n.expression); ts.forEachChild(n, visit); };
            visit(project.modules.get('server.js').sf);
            assert.equal(value?.kind, duplicate ? undefined : 'function');
        });
    }
});
test('chained route methods keep distinct AST identities and original source locations', () => {
    fixture({ 'server.js': "const app=require('express')();\napp.route('/x').get((req,res)=>res.send()).post((req,res)=>res.send()).delete((req,res)=>res.send());" }, ({ routes, endpoint }) => {
        assert.equal(routes.applicationCoverage.recordedRegistrations, 3);
        for (const method of ['GET', 'POST', 'DELETE']) {
            const route = endpoint('server.js', '/x', method);
            assert.equal(route.status, 'resolved');
            assert.equal(route.alternatives, 1);
            assert.equal(route.reachability, 'active');
        }
    });
});
test('initialized router that is never mounted is explicitly inactive', () => {
    fixture({ 'server.js': "const app=require('express')();require('./router');", 'router.js': "const router=require('express').Router();\nrouter.get('/x',(req,res)=>res.send());\nmodule.exports=router;" }, ({ endpoint }) => assert.equal(endpoint('router.js', '/x').reachability, 'inactive'));
});
test('Consign directory middleware ordering remains partial', () => {
    fixture({ 'package.json': { dependencies: { consign: '0.1.6' } }, 'server.js': "const app=require('express')();const consign=require('consign');consign().include('routes').into(app);", 'routes/a.js': "module.exports=app=>app.use((req,res,next)=>next());", 'routes/b.js': "module.exports=app=>{\napp.get('/x',(req,res)=>res.send());\n};" }, ({ routes, endpoint }) => {
        assert.equal(routes.applicationCoverage.status, 'partial');
        assert.ok(routes.applicationCoverage.reasons.some(x => x.code === 'CONSIGN_DIRECTORY_MIDDLEWARE_ORDER'));
        assert.equal(endpoint('routes/b.js', '/x').status, 'partial');
    });
});
test('pinned Consign runtime capture agrees with static explicit-file middleware order', () => {
    const consign = require('consign');
    assert.equal(require('consign/package.json').version, '0.1.6');
    for (const first of ['guard.js', 'routes.js']) {
        const second = first === 'guard.js' ? 'routes.js' : 'guard.js';
        fixture({
            'package.json': { dependencies: { consign: '0.1.6' } },
            'server.js': `const app=require('express')();const consign=require('consign');consign().include('${first}').then('${second}').into(app);`,
            // These minimal files are authored test fixtures, not analyzed target
            // source. The runtime has no network, database or external callbacks.
            'guard.js': 'module.exports=app=>app.use(function guard(req,res,next){next();});',
            'routes.js': "module.exports=app=>{\napp.get('/x',function terminal(req,res){res.send();});\n};"
        }, ({ root, endpoint }) => {
            const captured = [];
            const app = { use(handler) { captured.push({ kind: 'use', name: handler.name }); }, get(route, handler) { captured.push({ kind: 'route', path: route, name: handler.name }); } };
            consign({ cwd: root, verbose: false }).include(first).then(second).into(app);
            const before = captured.slice(0, captured.findIndex(x => x.kind === 'route')).filter(x => x.kind === 'use');
            const staticChain = endpoint('routes.js', '/x').handlers.filter(x => x.source === 'use');
            assert.equal(staticChain.length, before.length);
            assert.equal(staticChain.length, first === 'guard.js' ? 1 : 0);
            for (const file of ['guard.js', 'routes.js']) delete require.cache[path.join(root, file)];
        });
    }
});
test('mutating a Multer instance method invalidates the standard middleware summary', () => {
    fixture({ 'package.json': { dependencies: { multer: '1.4.5-lts.1' } }, 'server.js': "const app=require('express')();const upload=require('multer')();upload.single=()=>((req,res,next)=>next());\napp.post('/x',upload.single('file'),(req,res)=>res.send());" }, ({ endpoint }) => assert.notEqual(endpoint('server.js', '/x', 'POST').handlers[0].value?.kind, 'middleware-summary'));
});
test('earlier overlapping routes retain dispatch uncertainty across app and router contexts', () => {
    for (const mounted of [false, true]) {
        const file = mounted ? 'router.js' : 'server.js';
        const files = mounted ? { 'server.js': "const app=require('express')();app.use('/api',require('./router'));", 'router.js': "const app=require('express').Router();\napp.get('/users/:id',(req,res)=>res.send());\napp.get('/users/settings',(req,res)=>res.send());\nmodule.exports=app;" } : { 'server.js': "const app=require('express')();\napp.get('/users/:id',(req,res)=>res.send());\napp.get('/users/settings',(req,res)=>res.send());" };
        fixture(files, ({ endpoint }) => {
            assert.equal(endpoint(file, '/users/:id').status, 'resolved');
            const later = endpoint(file, '/users/settings');
            assert.equal(later.status, 'partial');
            assert.equal(later.precedingRoutes.length, 1);
            assert.equal(later.precedingRoutes[0].path, '/users/:id');
        });
    }
});
test('parameter and deferred registration callbacks expose unresolved startup behavior', () => {
    for (const registration of ["app.param('id',(req,res,next,id)=>next());", "setTimeout(()=>app.use((req,res,next)=>next()),1);", "app[process.env.METHOD]('/x',(req,res)=>res.send());"]) {
        fixture({ 'server.js': "const app=require('express')();\n" + registration + "\napp.get('/x/:id',(req,res)=>res.send());" }, ({ routes }) => assert.equal(routes.applicationCoverage.status, 'partial'));
    }
});
test('Express configuration get is not reported as a route registration', () => {
    fixture({ 'server.js': "const app=require('express')();app.get('trust proxy');\napp.get('/x',(req,res)=>res.send());" }, ({ routes }) => assert.equal(routes.applicationCoverage.recordedRegistrations, 1));
});
test('conditional or uninvoked property assignments cannot manufacture a model helper', () => {
    for (const assignment of ['if(process.env.FLAG)User.save=data=>data;', 'function install(){User.save=data=>data;}']) {
        fixture({ 'server.js': "const User=require('./model');\nUser.save({});", 'model.js': 'const User=function(data){};' + assignment + 'module.exports=User;' }, ({ project }) => {
            let value;
            const visit = n => { if (ts.isCallExpression(n) && n.expression.getText() === 'User.save') value = project.resolve(n.expression); ts.forEachChild(n, visit); };
            visit(project.modules.get('server.js').sf);
            assert.equal(value, null);
        });
    }
});
test('database connection aliases preserve verified driver and factory identity', () => {
    fixture({ 'server.js': "const mysql=require('mysql2');const db=mysql.createPool({});const alias=db.promise();alias.query('SELECT 1');const {Pool}=require('pg');const pg=new Pool({});pg.query('SELECT 1');" }, ({ project }) => {
        const values = [];
        const visit = n => { if (ts.isCallExpression(n) && n.expression.getText().endsWith('.query')) values.push(project.resolve(n.expression)); ts.forEachChild(n, visit); };
        visit(project.modules.get('server.js').sf);
        assert.deepEqual(values.map(x => [x.kind, x.spec, x.factory, x.member]), [['external-instance', 'mysql2', 'createPool', 'query'], ['external-instance', 'pg', 'Pool', 'query']]);
    });
});
test('conditional CommonJS exports are not resolved as unconditional guard functions', () => {
    fixture({ 'server.js': "const app=require('express')();const guard=require('./auth').required;\napp.get('/x',guard,(req,res)=>res.send());", 'auth.js': "if(process.env.FLAG)exports.required=(req,res,next)=>next();" }, ({ endpoint }) => assert.equal(endpoint('server.js', '/x').handlers[0].resolution, 'unknown'));
});
test('Express middleware uses default case-insensitive and optional trailing-slash matching', () => {
    const express = require('express');
    assert.equal(require('express/package.json').version, '4.21.2');
    const examples = [
        { mount: '/X', startup: '', configure: () => {}, matches: true },
        { mount: '/x/', startup: '', configure: () => {}, matches: true },
        { mount: '/X', startup: "app.enable('case sensitive routing');", configure: app => app.enable('case sensitive routing'), matches: false },
        { mount: '/X', startup: "app.set('case sensitive routing',true);", configure: app => app.set('case sensitive routing', true), matches: false },
        { mount: '/x/', startup: "app.enable('strict routing');", configure: app => app.enable('strict routing'), matches: true },
        { mount: '/x//', startup: '', configure: () => {}, matches: false, conditional: true }
    ];
    for (const example of examples) {
        const runtime = express(); example.configure(runtime);
        runtime.use(example.mount, function guard(req, res, next) { next(); });
        const layer = runtime._router.stack.find(candidate => candidate.handle.name === 'guard');
        assert.equal(layer.match('/x'), example.matches);
        fixture({ 'server.js': base + example.startup + `app.use('${example.mount}',auth.required);\napp.post('/x',(req,res)=>res.send());`, 'auth.js': auth }, ({ endpoint }) => {
            const route = endpoint('server.js', '/x', 'POST');
            assert.equal(route.handlers.some(handler => handler.source === 'use'), example.matches || Boolean(example.conditional), example.startup + example.mount);
            assert.equal(route.status, example.conditional ? 'partial' : 'resolved');
            if (example.conditional) assert.equal(route.handlers.find(handler => handler.source === 'use').conditional, true);
        });
    }
});
test('routing settings are captured at lazy initialization and router options are local', () => {
    fixture({ 'server.js': base + "app.use((req,res,next)=>next());app.enable('case sensitive routing');app.use('/X',auth.required);\napp.post('/x',(req,res)=>res.send());", 'auth.js': auth }, ({ endpoint }) => {
        assert.equal(endpoint('server.js', '/x', 'POST').handlers.some(handler => handler.name === 'auth.required'), true);
    });
    for (const sensitive of [false, true]) {
        fixture({ 'server.js': "const app=require('express')();app.use(require('./router'));", 'router.js': `const router=require('express').Router({caseSensitive:${sensitive},strict:true});const auth=require('./auth');router.use('/X/',auth.required);\nrouter.post('/x',(req,res)=>res.send());\nmodule.exports=router;`, 'auth.js': auth }, ({ endpoint }) => {
            assert.equal(endpoint('router.js', '/x', 'POST').handlers.some(handler => handler.source === 'use'), !sensitive);
        });
    }
});
test('computed case sensitivity cannot certify a middleware guard', () => {
    fixture({ 'server.js': base + "app.set('case sensitive routing',process.env.SENSITIVE);app.use('/X',auth.required);\napp.post('/x',(req,res)=>res.send());", 'auth.js': auth }, ({ routes, endpoint }) => {
        assert.equal(routes.applicationCoverage.status, 'partial');
        const route = endpoint('server.js', '/x', 'POST');
        assert.equal(route.handlers.find(handler => handler.source === 'use').conditional, true);
        assert.equal(route.status, 'partial');
    });
});
test('direct router option mutations apply to later middleware layers', () => {
    fixture({ 'server.js': "const app=require('express')();app.use(require('./router'));", 'router.js': "const router=require('express').Router();const auth=require('./auth');router.caseSensitive=true;router.use('/X',auth.required);\nrouter.post('/x',(req,res)=>res.send());\nmodule.exports=router;", 'auth.js': auth }, ({ endpoint }) => {
        assert.equal(endpoint('router.js', '/x', 'POST').handlers.some(handler => handler.source === 'use'), false);
    });
});
