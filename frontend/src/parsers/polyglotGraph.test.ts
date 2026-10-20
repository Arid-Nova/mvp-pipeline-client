import getData, { IRData } from './getData';
import compareChanges from './getChanges';
import filterNodes from '../utils/createConnections';
import nativeFixture from './__fixtures__/polyglot-native.json';
import { showError } from '../utils/notifications';

jest.mock('../utils/notifications', () => ({ showError: jest.fn() }));

// Native constructors initialize these arrays. Plain Method nodes intentionally
// lack Endpoint-only URL properties, just as they do in serialized CIMET output.
const fixture = (): IRData => JSON.parse(JSON.stringify(nativeFixture));
const links = (graph: any) => graph.links.filter((link: any) => link.nodeType === 'link');

beforeEach(() => jest.clearAllMocks());

test('native JSModule and generic JClass UNKNOWN containers remain neutral source modules', () => {
    const ir = fixture();
    const before = JSON.stringify(ir);
    const graph = getData(ir)!;
    expect(showError).not.toHaveBeenCalled();
    expect(graph).not.toBeNull();
    const worker = graph.nodes.find(node => node.nodeName === 'workers.src/jobs.py#Worker')!;
    expect(worker).toMatchObject({ nodeType: 'module', sourceType: 'JClass', sourceLanguage: 'python', parentMicroservice: 'workers' });
    const client = graph.nodes.find(node => node.nodeName === 'client.src/client.ts#client.ts')!;
    expect(client).toMatchObject({ nodeType: 'module', sourceType: 'JSModule', sourceLanguage: 'typescript' });
    const workerMethod = graph.nodes.find(node => node.parentModule === worker.nodeName)!;
    expect(workerMethod.displayName).toBe('Worker.run');
    expect(graph.links).toEqual(expect.arrayContaining([
        expect.objectContaining({ source: 'workers', target: worker.nodeName, nodeType: 'hierarchy' }),
        expect.objectContaining({ source: worker.nodeName, target: workerMethod.nodeName, nodeType: 'hierarchy' })
    ]));
    expect(graph.nodes.some(node => node.nodeType === 'service')).toBe(false);
    expect(graph.nodes.find(node => node.nodeName === 'api.routes.ts')?.nodeType).toBe('controller');
    expect(JSON.stringify(ir)).toBe(before);
});

test('HTTP calls in UNKNOWN JS modules retain native normalized endpoint correspondence', () => {
    const graph = getData(fixture())!;
    expect(links(graph)).toHaveLength(1);
    expect(links(graph)[0]).toMatchObject({ source: 'client', target: 'api', requests: [expect.objectContaining({
        sourceMethod: 'loadUser', destinationUrl: '/users/{?}', endpointFunction: 'users-route'
    })] });
});

test('source module and communication additions/removals survive comparison parsing', () => {
    const target = fixture();
    const base = fixture();
    base.microservices[0].unknowns = [];
    base.microservices[1].unknowns = [];
    const added = compareChanges(base, target)!;
    expect(added.nodes.find(node => node.nodeName === 'workers.src/jobs.py#Worker')).toMatchObject({ nodeType: 'module', color: 'green' });
    expect(links(added)[0]).toMatchObject({ source: 'client', target: 'api', color: 'green' });
    const removed = compareChanges(target, base)!;
    expect(removed.nodes.find(node => node.nodeName === 'workers.src/jobs.py#Worker')).toMatchObject({ nodeType: 'module', color: 'red' });
    expect(links(removed)[0]).toMatchObject({ source: 'client', target: 'api', color: 'red' });
    const unchanged = compareChanges(target, target)!;
    expect(unchanged.nodes.find(node => node.nodeName === 'workers.src/jobs.py#Worker')?.color).toBe('grey');
    expect(showError).not.toHaveBeenCalled();
});

test.each(['external', 'unknown'])('a JavaScript call classified %s cannot fabricate a backend graph edge', target => {
    const ir = fixture();
    ir.microservices[1].unknowns![0].methods[0].methodCalls[0].metadata!.target = target;
    expect(links(getData(ir)!)).toHaveLength(0);
    expect(links(compareChanges(ir, ir)!)).toHaveLength(0);
});

test('detailed component view retains UNKNOWN modules without assigning a service role', () => {
    const result = filterNodes(fixture(), ['workers', 'client'])!;
    expect(result).not.toBeNull();
    expect(result[0].nodes).toHaveLength(2);
    expect(result[0].nodes.every(node => node.nodeType === 'module')).toBe(true);
    expect(result[0].nodes.find(node => node.nodeName === 'Worker')?.methods[0].name).toBe('Worker.run');
});

test('same-named source containers in different files retain distinct graph identities', () => {
    const ir = fixture();
    const second = JSON.parse(JSON.stringify(ir.microservices[0].unknowns![0]));
    second.metadata.sourcePath = 'other/jobs.py';
    ir.microservices[0].unknowns!.push(second);
    const modules = getData(ir)!.nodes.filter(node => node.parentMicroservice === 'workers' && node.nodeType === 'module');
    expect(modules.map(node => node.nodeName)).toEqual(['workers.src/jobs.py#Worker', 'workers.other/jobs.py#Worker']);
});

test('legacy Java controller and service node names, hierarchy and communication stay unchanged', () => {
    const method = (name: string, url: string, calls: any[] = []) => ({ name, url, httpMethod: 'GET', className: 'Controller', parameters: [], returnType: 'User', annotations: [], methodCalls: calls, antiPattern: null });
    const component = (name: string, methods: any[]) => ({ name, methods, imports: [], implementedTypes: [], antiPattern: null });
    const ir: IRData = { createDate: null, modifyDate: null, antiPattern: null, microservices: [
        { name: 'api', controllers: [component('Controller', [method('read', '/users')])], services: [component('Service', [method('work', '')])], antiPattern: null },
        { name: 'gateway', controllers: [], services: [component('Client', [method('fetch', '', [{ name: 'read', url: '/users', httpMethod: 'GET', calledFrom: 'fetch', parameterContents: [], antiPattern: null }])])], antiPattern: null }
    ] };
    const graph = getData(ir)!;
    expect(graph.nodes.map(node => node.nodeName)).toEqual(['api', 'api.Controller', 'api.Controller.read_0', 'api.Service', 'api.Service.work._0', 'gateway', 'gateway.Client', 'gateway.Client.fetch._0']);
    expect(graph.nodes.some(node => node.nodeType === 'module')).toBe(false);
    expect(links(graph)[0]).toMatchObject({ source: 'gateway', target: 'api' });
    expect(links(compareChanges(ir, ir)!)[0]).toMatchObject({ source: 'gateway', target: 'api', color: 'grey' });
    expect(showError).not.toHaveBeenCalled();
});


test('multiple generic classes in one physical C# file retain distinct neutral module identities', () => {
    const ir = fixture();
    const first = ir.microservices[0].unknowns![0];
    first.name = 'Processor';
    first.metadata = { language: 'csharp', sourcePath: 'Worker.cs', declaredType: 'Processor' };
    const second = JSON.parse(JSON.stringify(first));
    second.name = 'Observer';
    second.metadata.declaredType = 'Observer';
    ir.microservices[0].unknowns!.push(second);
    const graph = getData(ir)!;
    const modules = graph.nodes.filter(node => node.parentMicroservice === 'workers' && node.nodeType === 'module');
    expect(modules.map(node => node.nodeName)).toEqual(['workers.Worker.cs#Processor', 'workers.Worker.cs#Observer']);
    const comparison = compareChanges(ir, ir)!;
    expect(comparison.nodes.filter(node => node.nodeType === 'module' && node.parentMicroservice === 'workers')).toHaveLength(2);
    expect(showError).not.toHaveBeenCalled();
});

test('older saved JavaScript call metadata without target keeps backward-compatible URL matching', () => {
    const ir = fixture();
    delete ir.microservices[1].unknowns![0].methods[0].methodCalls[0].metadata!.target;
    expect(links(getData(ir)!)).toHaveLength(1);
    expect(links(compareChanges(ir, ir)!)).toHaveLength(1);
});
