import fs from 'fs';
import path from 'path';
import { NODE_KEY_PATTERN, PipelineSpecV1, parsePipelineSpec } from './pipelineSpec';
import { createRandom, randomJsonValue } from './testRandomJson';

const validSpec = (): Record<string, unknown> => ({
    specVersion: 1,
    title: 'Architecture overview',
    summary: 'Runs System Visualization.',
    rationale: 'Shows the service topology.',
    nodes: [
        { key: 'system_input', cardType: 'SYSTEM_INPUT' },
        { key: 'multi_repo', cardType: 'MULTI_REPO' },
        { key: 'ir_holder', cardType: 'IR_HOLDER' },
        { key: 'visualization', cardType: 'VISUALIZATION' },
    ],
    edges: [
        { from: 'system_input', to: 'multi_repo' },
        { from: 'multi_repo', to: 'ir_holder' },
        { from: 'ir_holder', to: 'visualization' },
    ],
});

const codesOf = (raw: unknown): string[] => {
    const result = parsePipelineSpec(raw);
    return result.ok ? [] : result.issues.map((issue) => issue.code);
};

const issueAt = (raw: unknown, code: string) => {
    const result = parsePipelineSpec(raw);
    return result.ok ? undefined : result.issues.find((issue) => issue.code === code);
};

describe('parsePipelineSpec', () => {
    it('accepts a well-formed spec with exactly the whitelisted fields', () => {
        const result = parsePipelineSpec(validSpec());
        expect(result.ok).toBe(true);
        expect(result.ok && result.spec).toEqual(validSpec() as unknown as PipelineSpecV1);
        expect(result.ignoredFields).toEqual([]);
    });

    it('treats rationale as optional', () => {
        const raw = validSpec();
        delete raw.rationale;
        const result = parsePipelineSpec(raw);
        expect(result.ok).toBe(true);
        expect(result.ok && 'rationale' in result.spec).toBe(false);
    });

    it('drops and reports fields outside the contract (positions, ids, runtime data, config)', () => {
        const raw = validSpec() as any;
        raw.x = 10;
        raw.id = 'abc';
        raw.data = { repositories: [{ repoUrl: 'https://example.com/repo' }] };
        raw.config = { targetUrl: 'http://localhost:1234' };
        raw.nodes[0].x = 100;
        raw.nodes[0].data = { systemName: 'Demo' };
        raw.nodes[1].status = 'completed';
        raw.edges[0].id = 'e1';
        const result = parsePipelineSpec(raw);
        expect(result.ok).toBe(true);
        expect(result.ok && result.spec).toEqual(validSpec() as unknown as PipelineSpecV1);
        expect(result.ignoredFields.sort()).toEqual(
            ['config', 'data', 'edges[0].id', 'id', 'nodes[0].data', 'nodes[0].x', 'nodes[1].status', 'x'].sort()
        );
    });

    it.each([
        ['missing title', (s: any) => delete s.title, 'MISSING_TITLE', 'title'],
        ['empty title', (s: any) => (s.title = '   '), 'MISSING_TITLE', 'title'],
        ['61-character title', (s: any) => (s.title = 't'.repeat(61)), 'TITLE_TOO_LONG', 'title'],
        ['non-string title', (s: any) => (s.title = 5), 'BAD_TITLE', 'title'],
        ['missing summary', (s: any) => delete s.summary, 'MISSING_SUMMARY', 'summary'],
        ['281-character summary', (s: any) => (s.summary = 's'.repeat(281)), 'SUMMARY_TOO_LONG', 'summary'],
        ['401-character rationale', (s: any) => (s.rationale = 'r'.repeat(401)), 'RATIONALE_TOO_LONG', 'rationale'],
        ['specVersion 2', (s: any) => (s.specVersion = 2), 'BAD_SPEC_VERSION', 'specVersion'],
        ['missing specVersion', (s: any) => delete s.specVersion, 'BAD_SPEC_VERSION', 'specVersion'],
        ['non-array nodes', (s: any) => (s.nodes = { key: 'a' }), 'NODES_NOT_ARRAY', 'nodes'],
        ['non-array edges', (s: any) => (s.edges = 'a->b'), 'EDGES_NOT_ARRAY', 'edges'],
        ['bad node key', (s: any) => (s.nodes[0].key = 'Bad Key!'), 'BAD_NODE_KEY', 'nodes[0].key'],
        ['node key starting with a digit', (s: any) => (s.nodes[1].key = '1abc'), 'BAD_NODE_KEY', 'nodes[1].key'],
        ['33-character node key', (s: any) => (s.nodes[2].key = 'k'.repeat(33)), 'BAD_NODE_KEY', 'nodes[2].key'],
        ['missing cardType', (s: any) => delete s.nodes[3].cardType, 'BAD_NODE_CARD_TYPE', 'nodes[3].cardType'],
        ['non-object node', (s: any) => (s.nodes[0] = 'SYSTEM_INPUT'), 'BAD_NODE', 'nodes[0]'],
        ['edge without target', (s: any) => delete s.edges[1].to, 'BAD_EDGE_ENDPOINT', 'edges[1]'],
        ['non-object edge', (s: any) => (s.edges[2] = ['a', 'b']), 'BAD_EDGE', 'edges[2]'],
    ])('rejects %s with a coded issue and path', (_label, mutate, code, issuePath) => {
        const raw = validSpec();
        mutate(raw);
        const issue = issueAt(raw, code);
        expect(issue).toBeDefined();
        expect(issue?.path).toBe(issuePath);
    });

    it('accepts the length boundaries exactly', () => {
        const raw = validSpec() as any;
        raw.title = 't'.repeat(60);
        raw.summary = 's'.repeat(280);
        raw.rationale = 'r'.repeat(400);
        raw.nodes[0].key = `k${'0'.repeat(31)}`;
        raw.edges[0].from = raw.nodes[0].key;
        expect(parsePipelineSpec(raw).ok).toBe(true);
        expect(NODE_KEY_PATTERN.test(raw.nodes[0].key)).toBe(true);
    });

    it('reports every problem, not just the first', () => {
        const raw = validSpec() as any;
        raw.specVersion = 3;
        raw.title = '';
        raw.nodes[0].key = 'Bad Key!';
        raw.edges = null;
        expect(codesOf(raw)).toEqual(expect.arrayContaining(['BAD_SPEC_VERSION', 'MISSING_TITLE', 'BAD_NODE_KEY', 'EDGES_NOT_ARRAY']));
    });

    it('leaves card-type membership to the validator', () => {
        const raw = validSpec() as any;
        raw.nodes[3].cardType = 'VECTOR_GENERATE';
        const result = parsePipelineSpec(raw);
        expect(result.ok).toBe(true);
        expect(result.ok && result.spec.nodes[3].cardType).toBe('VECTOR_GENERATE');
    });

    it('removes control characters and surrounding whitespace from text', () => {
        const raw = validSpec();
        raw.title = '  Archi\u0000tecture\u0007 overview  ';
        const result = parsePipelineSpec(raw);
        expect(result.ok && result.spec.title).toBe('Architecture overview');
    });

    it.each([
        ['null', null],
        ['undefined', undefined],
        ['a number', 42],
        ['an empty string', ''],
        ['a 1 MB string', 'x'.repeat(1024 * 1024)],
        ['an array', [validSpec()]],
        ['a boolean', true],
    ])('returns issues for %s without throwing', (_label, raw) => {
        const result = parsePipelineSpec(raw);
        expect(result.ok).toBe(false);
        expect(result.ok ? [] : result.issues.map((i) => i.code)).toEqual(['NOT_OBJECT']);
    });

    it('never throws, even when reading the input throws', () => {
        const hostile = new Proxy({}, {
            get: () => {
                throw new Error('boom');
            },
            ownKeys: () => {
                throw new Error('boom');
            },
        });
        expect(() => parsePipelineSpec(hostile)).not.toThrow();
        expect(parsePipelineSpec(hostile).ok).toBe(false);
    });

    it('never throws for 2,000 pseudo-random JSON values', () => {
        const random = createRandom(60_002);
        const failures: string[] = [];
        for (let i = 0; i < 2000; i += 1) {
            const value = randomJsonValue(random);
            try {
                parsePipelineSpec(value);
            } catch (error) {
                failures.push(String(error));
            }
        }
        expect(failures).toEqual([]);
    });

    it('is independent of the intent contract', () => {
        const source = fs.readFileSync(path.join(__dirname, 'pipelineSpec.ts'), 'utf8');
        expect(source).not.toMatch(/from '\.\/intentPlan'/);
    });
});
