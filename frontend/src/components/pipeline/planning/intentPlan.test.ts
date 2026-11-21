import fs from 'fs';
import path from 'path';
import {
    INTENT_TIERS,
    MAX_ANALYSIS_PER_OPTION,
    ParseIntentPlanResult,
    describeIntentIssuesForRetry,
    intentOptionId,
    parseIntentPlan,
} from './intentPlan';
import { buildPipelineCapabilityCatalog } from './pipelineCapabilities';
import { createRandom, randomJsonValue } from './testRandomJson';

const catalog = buildPipelineCapabilityCatalog();
const ANALYSIS = catalog.cards.filter((c) => c.isAnalysis).map((c) => c.cardType as string);
const NON_ANALYSIS = catalog.cards.filter((c) => !c.isAnalysis).map((c) => c.cardType as string);

const validPlan = (): any => ({
    version: 1,
    options: [
        { tier: 'focused', title: 'Architecture and auth check', rationale: 'Topology plus policy check.', analysisCardTypes: ['VISUALIZATION', 'FORMAL_VIZ'] },
        { tier: 'balanced', title: 'Plus scenario comparison', rationale: 'Adds Quick Compare.', analysisCardTypes: ['VISUALIZATION', 'FORMAL_VIZ', 'VERIFICATION_COMPARISON'] },
        { tier: 'comprehensive', title: 'Full analysis', analysisCardTypes: ['VISUALIZATION', 'FORMAL_VIZ', 'VERIFICATION_COMPARISON', 'AEGIS', 'TEST_EXECUTOR'] },
    ],
});

const codes = (result: ParseIntentPlanResult) => result.issues.map((issue) => issue.code);
const noteCodes = (result: ParseIntentPlanResult) => result.notes.map((note) => note.code);

describe('parseIntentPlan — valid plans', () => {
    it('accepts a valid 3-profile plan, ordered by tier, with catalog-ordered capabilities', () => {
        const result = parseIntentPlan(validPlan(), catalog);
        expect(result.status).toBe('ok');
        expect(result.issues).toEqual([]);
        expect(result.options?.map((o) => o.tier)).toEqual([...INTENT_TIERS]);
        result.options?.forEach((option) => {
            const order = option.analysisCardTypes.map((id) => ANALYSIS.indexOf(id));
            expect(order).toEqual([...order].sort((a, b) => a - b));
            expect(option.optionId).toBe(intentOptionId(option.analysisCardTypes));
        });
        expect(result.options?.[2].rationale).toBeUndefined();
    });

    it('returns options in tier order regardless of input order', () => {
        const raw = validPlan();
        raw.options.reverse();
        expect(parseIntentPlan(raw, catalog).options?.map((o) => o.tier)).toEqual([...INTENT_TIERS]);
    });

    it('gives the same optionId to the same capability set listed in a different order', () => {
        const a = validPlan();
        const b = validPlan();
        b.options[0].analysisCardTypes = ['FORMAL_VIZ', 'VISUALIZATION'];
        expect(parseIntentPlan(a, catalog).options?.[0].optionId).toBe(parseIntentPlan(b, catalog).options?.[0].optionId);
        expect(parseIntentPlan(b, catalog).options?.[0].analysisCardTypes).toEqual(parseIntentPlan(a, catalog).options?.[0].analysisCardTypes);
    });

    it('does not require summary; a model-supplied summary only fills a missing rationale', () => {
        const raw = validPlan();
        delete raw.options[0].rationale;
        raw.options[0].summary = 'Used as the rationale.';
        raw.options[1].summary = 'Ignored because a rationale exists.';
        const result = parseIntentPlan(raw, catalog);
        expect(result.status).toBe('ok');
        expect(result.options?.[0].rationale).toBe('Used as the rationale.');
        expect(result.options?.[1].rationale).toBe('Adds Quick Compare.');
        expect(noteCodes(result)).toContain('SUMMARY_USED_AS_RATIONALE');
        expect(result.ignoredFields).toContain('options[1].summary');
        result.options?.forEach((option) => expect(option).not.toHaveProperty('summary'));
    });

    it('accepts every analysis capability in the catalog', () => {
        const rejected = ANALYSIS.filter((id) => {
            const raw = validPlan();
            raw.options[0].analysisCardTypes = [id];
            return parseIntentPlan(raw, catalog).validOptions.find((o) => o.tier === 'focused')?.analysisCardTypes[0] !== id;
        });
        expect(ANALYSIS).toHaveLength(11);
        expect(rejected).toEqual([]);
    });

    it('recognises an unsupported goal', () => {
        const result = parseIntentPlan({ version: 1, options: [], unsupportedReason: 'AridNova cannot deploy services.' }, catalog);
        expect(result.status).toBe('unsupported');
        expect(result.unsupportedReason).toBe('AridNova cannot deploy services.');
        expect(result.validOptions).toEqual([]);
    });
});

describe('parseIntentPlan — rejected plans', () => {
    it.each([
        ['null', null, 'NOT_OBJECT'],
        ['a string', '{"version":1}', 'NOT_OBJECT'],
        ['a number', 7, 'NOT_OBJECT'],
        ['an array', [validPlan()], 'NOT_OBJECT'],
        ['an object without options', { version: 1 }, 'NO_OPTIONS_ARRAY'],
        ['options that is not an array', { version: 1, options: 'focused' }, 'NO_OPTIONS_ARRAY'],
        ['empty options without a reason', { version: 1, options: [] }, 'WRONG_OPTION_COUNT'],
    ])('rejects malformed value: %s', (_label, raw, code) => {
        const result = parseIntentPlan(raw, catalog);
        expect(result.status).toBe('invalid');
        expect(codes(result)).toContain(code);
    });

    it('rejects options that are not objects', () => {
        const raw = validPlan();
        raw.options[1] = 'balanced';
        const result = parseIntentPlan(raw, catalog);
        expect(result.status).toBe('invalid');
        expect(codes(result)).toEqual(expect.arrayContaining(['BAD_OPTION', 'MISSING_TIER']));
        expect(result.validOptions.map((o) => o.tier)).toEqual(['focused', 'comprehensive']);
    });

    it('rejects a wrong version', () => {
        const raw = validPlan();
        raw.version = 2;
        expect(codes(parseIntentPlan(raw, catalog))).toContain('BAD_VERSION');
    });

    it('rejects a missing tier', () => {
        const raw = validPlan();
        delete raw.options[1].tier;
        const result = parseIntentPlan(raw, catalog);
        expect(result.status).toBe('invalid');
        expect(codes(result)).toEqual(expect.arrayContaining(['BAD_TIER', 'MISSING_TIER']));
    });

    it('rejects an unknown tier', () => {
        const raw = validPlan();
        raw.options[2].tier = 'extreme';
        expect(codes(parseIntentPlan(raw, catalog))).toEqual(expect.arrayContaining(['BAD_TIER', 'MISSING_TIER']));
    });

    it('rejects a duplicate tier', () => {
        const raw = validPlan();
        raw.options[2].tier = 'focused';
        const result = parseIntentPlan(raw, catalog);
        expect(result.status).toBe('invalid');
        expect(codes(result)).toEqual(expect.arrayContaining(['DUPLICATE_TIER', 'MISSING_TIER']));
    });

    it.each([2, 4])('rejects %i options', (count) => {
        const raw = validPlan();
        raw.options = count === 2 ? raw.options.slice(0, 2) : [...raw.options, { ...raw.options[0], analysisCardTypes: ['AEGIS'] }];
        expect(codes(parseIntentPlan(raw, catalog))).toContain('WRONG_OPTION_COUNT');
    });

    it('rejects an option with an unknown capability but keeps the other valid options', () => {
        const raw = validPlan();
        raw.options[1].analysisCardTypes = ['VISUALIZATION', 'FORMAL_VERYFY'];
        const result = parseIntentPlan(raw, catalog);
        expect(result.status).toBe('invalid');
        const issue = result.issues.find((i) => i.code === 'UNKNOWN_CAPABILITY');
        expect(issue?.path).toBe('options[1].analysisCardTypes[1]');
        expect(result.validOptions.map((o) => o.tier)).toEqual(['focused', 'comprehensive']);
    });

    it('rejects non-string capability IDs', () => {
        const raw = validPlan();
        raw.options[0].analysisCardTypes = ['VISUALIZATION', 42];
        expect(codes(parseIntentPlan(raw, catalog))).toContain('BAD_CAPABILITY_ID');
    });

    it('drops known non-analysis capabilities with a note (prerequisites are the composer’s job)', () => {
        const raw = validPlan();
        raw.options[0].analysisCardTypes = ['SYSTEM_INPUT', 'IR_HOLDER', 'VISUALIZATION', 'FORMAL_VIZ'];
        const result = parseIntentPlan(raw, catalog);
        expect(result.status).toBe('ok');
        expect(result.options?.[0].analysisCardTypes).toEqual(['VISUALIZATION', 'FORMAL_VIZ']);
        expect(result.notes.filter((n) => n.code === 'NON_ANALYSIS_DROPPED')).toHaveLength(2);
    });

    it('drops every non-analysis catalog card, and rejects an option left with none', () => {
        const raw = validPlan();
        raw.options[0].analysisCardTypes = NON_ANALYSIS;
        const result = parseIntentPlan(raw, catalog);
        expect(NON_ANALYSIS).toHaveLength(6);
        expect(result.status).toBe('invalid');
        expect(codes(result)).toContain('NO_ANALYSIS_CAPABILITY');
        expect(result.notes.filter((n) => n.code === 'NON_ANALYSIS_DROPPED')).toHaveLength(NON_ANALYSIS.length);
    });

    it('rejects an empty capability list', () => {
        const raw = validPlan();
        raw.options[0].analysisCardTypes = [];
        expect(codes(parseIntentPlan(raw, catalog))).toContain('NO_ANALYSIS_CAPABILITY');
    });

    it('collapses duplicate capabilities within an option', () => {
        const raw = validPlan();
        raw.options[0].analysisCardTypes = ['VISUALIZATION', 'VISUALIZATION', 'FORMAL_VIZ'];
        const result = parseIntentPlan(raw, catalog);
        expect(result.status).toBe('ok');
        expect(result.options?.[0].analysisCardTypes).toEqual(['VISUALIZATION', 'FORMAL_VIZ']);
        expect(noteCodes(result)).toContain('DUPLICATE_CAPABILITY_COLLAPSED');
    });

    it('rejects duplicate capability sets across options, even when ordered differently', () => {
        const raw = validPlan();
        raw.options[1].analysisCardTypes = ['FORMAL_VIZ', 'VISUALIZATION'];
        const result = parseIntentPlan(raw, catalog);
        expect(result.status).toBe('invalid');
        expect(codes(result)).toContain('DUPLICATE_CAPABILITY_SET');
    });

    it('rejects a set that only becomes a duplicate after dropping non-analysis cards', () => {
        const raw = validPlan();
        raw.options[1].analysisCardTypes = ['SYSTEM_INPUT', 'VISUALIZATION', 'FORMAL_VIZ'];
        expect(codes(parseIntentPlan(raw, catalog))).toContain('DUPLICATE_CAPABILITY_SET');
    });
});

describe('parseIntentPlan — graph and runtime fields are stripped', () => {
    it('drops nodes, edges, prerequisites, IDs, coordinates, config and runtime data everywhere', () => {
        const raw = validPlan();
        raw.nodes = [{ key: 'a', cardType: 'SYSTEM_INPUT' }];
        raw.edges = [{ from: 'a', to: 'b' }];
        raw.id = 'plan-1';
        Object.assign(raw.options[0], {
            nodes: [{ key: 'viz', cardType: 'VISUALIZATION' }],
            edges: [{ from: 'src', to: 'viz' }],
            prerequisites: ['SYSTEM_INPUT'],
            id: 'opt-1',
            x: 10,
            y: 20,
            position: { x: 1, y: 2 },
            config: { repositories: ['https://example.com/repo'], targetUrl: 'http://localhost:1234' },
            status: 'completed',
        });
        const result = parseIntentPlan(raw, catalog);
        expect(result.status).toBe('ok');
        expect(result.ignoredFields).toEqual(
            expect.arrayContaining([
                'nodes', 'edges', 'id',
                'options[0].nodes', 'options[0].edges', 'options[0].prerequisites', 'options[0].id',
                'options[0].x', 'options[0].y', 'options[0].position', 'options[0].config', 'options[0].status',
            ])
        );
        result.options?.forEach((option) => {
            expect(Object.keys(option).sort()).toEqual(
                (option.rationale === undefined
                    ? ['analysisCardTypes', 'optionId', 'tier', 'title']
                    : ['analysisCardTypes', 'optionId', 'rationale', 'tier', 'title']
                ).sort()
            );
        });
    });
});

describe('parseIntentPlan — length boundaries', () => {
    it('accepts a 60-character title, a 400-character rationale and 6 capabilities', () => {
        const raw = validPlan();
        raw.options[2].title = 't'.repeat(60);
        raw.options[2].rationale = 'r'.repeat(400);
        raw.options[2].analysisCardTypes = ANALYSIS.slice(0, MAX_ANALYSIS_PER_OPTION);
        expect(parseIntentPlan(raw, catalog).status).toBe('ok');
    });

    it.each([
        ['a 61-character title', (o: any) => (o.title = 't'.repeat(61)), 'TITLE_TOO_LONG'],
        ['an empty title', (o: any) => (o.title = '  '), 'MISSING_TITLE'],
        ['a missing title', (o: any) => delete o.title, 'MISSING_TITLE'],
        ['a non-string title', (o: any) => (o.title = ['x']), 'BAD_TITLE'],
        ['a 401-character rationale', (o: any) => (o.rationale = 'r'.repeat(401)), 'RATIONALE_TOO_LONG'],
        ['7 capabilities', (o: any) => (o.analysisCardTypes = ANALYSIS.slice(0, 7)), 'TOO_MANY_CAPABILITIES'],
        ['33 capability IDs', (o: any) => (o.analysisCardTypes = Array.from({ length: 33 }, () => 'VISUALIZATION')), 'TOO_MANY_CAPABILITIES'],
        ['a missing capability list', (o: any) => delete o.analysisCardTypes, 'NO_CAPABILITY_ARRAY'],
    ])('rejects %s', (_label, mutate, code) => {
        const raw = validPlan();
        mutate(raw.options[2]);
        const result = parseIntentPlan(raw, catalog);
        expect(result.status).toBe('invalid');
        expect(codes(result)).toContain(code);
    });

    it('rejects an over-long unsupported reason', () => {
        const result = parseIntentPlan({ version: 1, options: [], unsupportedReason: 'u'.repeat(401) }, catalog);
        expect(result.status).toBe('invalid');
        expect(codes(result)).toContain('UNSUPPORTED_REASON_TOO_LONG');
    });
});

describe('parseIntentPlan — robustness', () => {
    it('never throws, even when reading the input throws', () => {
        const hostile = new Proxy({}, {
            get: () => {
                throw new Error('boom');
            },
            ownKeys: () => {
                throw new Error('boom');
            },
        });
        expect(() => parseIntentPlan(hostile, catalog)).not.toThrow();
        expect(parseIntentPlan(hostile, catalog).status).toBe('invalid');
    });

    it('never throws for 2,000 pseudo-random JSON values, and handles a 1 MB string', () => {
        const random = createRandom(60_015);
        const failures: string[] = [];
        for (let i = 0; i < 2000; i += 1) {
            const value = randomJsonValue(random);
            try {
                parseIntentPlan(value, catalog);
                parseIntentPlan({ version: 1, options: [value, value, value] }, catalog);
            } catch (error) {
                failures.push(String(error));
            }
        }
        expect(failures).toEqual([]);
        expect(parseIntentPlan('x'.repeat(1024 * 1024), catalog).status).toBe('invalid');
    });

    it('stays cheap for very large option and capability lists', () => {
        const raw = { version: 1, options: Array.from({ length: 5000 }, () => ({ ...validPlan().options[0], analysisCardTypes: Array(5000).fill('VISUALIZATION') })) };
        const result = parseIntentPlan(raw, catalog);
        expect(result.status).toBe('invalid');
        expect(codes(result)).toContain('WRONG_OPTION_COUNT');
    });
});

describe('describeIntentIssuesForRetry', () => {
    it('summarises codes, unknown IDs and accepted sets within the retry limits', () => {
        const raw = validPlan();
        raw.options[1].analysisCardTypes = ['FORMAL_VERYFY'];
        const result = parseIntentPlan(raw, catalog);
        const lines = describeIntentIssuesForRetry(result, result.validOptions);
        expect(lines).toEqual(expect.arrayContaining(['Problem: UNKNOWN_CAPABILITY', 'Not capability IDs, do not use: FORMAL_VERYFY']));
        expect(lines.some((line) => line.startsWith('Already accepted, do not repeat: [VISUALIZATION, FORMAL_VIZ]'))).toBe(true);
        expect(lines.length).toBeLessThanOrEqual(20);
        lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(200));
    });
});

describe('contract fixture shared with chatbot-backend', () => {
    const frontendFixture = path.join(__dirname, '__fixtures__', 'intent-response.valid.json');
    const backendFixture = path.join(__dirname, '../../../../../chatbot-backend/src/test/resources/pipeline/intent-response.valid.json');

    it('is byte-identical to the backend test resource', () => {
        expect(fs.readFileSync(frontendFixture, 'utf8')).toBe(fs.readFileSync(backendFixture, 'utf8'));
    });

    it('carries options that parse as a valid intent plan', () => {
        const response = JSON.parse(fs.readFileSync(frontendFixture, 'utf8'));
        const result = parseIntentPlan({ version: 1, options: response.options }, catalog);
        expect(response.outcome).toBe('OK');
        expect(result.status).toBe('ok');
    });
});
