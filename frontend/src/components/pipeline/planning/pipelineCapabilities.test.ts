import fs from 'fs';
import path from 'path';
import { CardType } from '../models';
import {
    ANALYSIS_CATEGORIES,
    CARD_CONFIG,
    CARD_INPUT_REQUIREMENTS,
    CATEGORIES,
    INPUT_CARD_TYPES,
    REQUIRED_USER_CONFIG,
    RUNTIME_INTERACTION_HINTS,
    VALID_CONNECTIONS,
} from '../pipelineConfig';
import { PIPELINE_TEMPLATES } from '../configs/PipelineTemplates';
import {
    CatalogSource,
    DEFAULT_CATALOG_SOURCE,
    buildPipelineCapabilityCatalog,
} from './pipelineCapabilities';

const ALL_CARD_TYPES = Object.keys(CARD_CONFIG) as CardType[];

const readSource = (relativePath: string): string =>
    fs.readFileSync(path.join(__dirname, relativePath), 'utf8');

const cloneSource = (): CatalogSource => ({
    ...DEFAULT_CATALOG_SOURCE,
    validConnections: JSON.parse(JSON.stringify(DEFAULT_CATALOG_SOURCE.validConnections)),
    categories: JSON.parse(JSON.stringify(DEFAULT_CATALOG_SOURCE.categories)),
    inputRequirements: JSON.parse(JSON.stringify(DEFAULT_CATALOG_SOURCE.inputRequirements)),
    requiredUserConfig: JSON.parse(JSON.stringify(DEFAULT_CATALOG_SOURCE.requiredUserConfig)),
    runtimeHints: { ...DEFAULT_CATALOG_SOURCE.runtimeHints },
    inputCardTypes: [...DEFAULT_CATALOG_SOURCE.inputCardTypes],
    analysisCategories: [...DEFAULT_CATALOG_SOURCE.analysisCategories],
    templates: [...DEFAULT_CATALOG_SOURCE.templates],
});

describe('buildPipelineCapabilityCatalog', () => {
    const catalog = buildPipelineCapabilityCatalog();

    it('has exactly one entry per current CardType', () => {
        const types = catalog.cards.map((card) => card.cardType);
        expect(types).toHaveLength(17);
        expect(new Set(types).size).toBe(types.length);
        expect([...types].sort()).toEqual([...ALL_CARD_TYPES].sort());
        expect([...types].sort()).toEqual(Object.keys(VALID_CONNECTIONS).sort());
    });

    it('copies allowedTargets exactly from VALID_CONNECTIONS', () => {
        catalog.cards.forEach((card) => {
            expect(card.allowedTargets).toEqual(VALID_CONNECTIONS[card.cardType]);
        });
    });

    it('carries title, description, purpose and outcome from CARD_CONFIG', () => {
        catalog.cards.forEach((card) => {
            const config = CARD_CONFIG[card.cardType];
            expect(card.title).toBe(config.title);
            expect(card.description).toBe(config.description);
            expect(card.purpose).toBe(config.tooltip.purpose);
            expect(card.outcome).toBe(config.tooltip.outcome);
        });
    });

    it('references only existing CardTypes everywhere', () => {
        const known = new Set<string>(ALL_CARD_TYPES);
        const referenced: string[] = [
            ...Object.values(VALID_CONNECTIONS).flat(),
            ...Object.values(CATEGORIES).flat(),
            ...INPUT_CARD_TYPES,
            ...Object.keys(CARD_INPUT_REQUIREMENTS),
            ...Object.values(CARD_INPUT_REQUIREMENTS).flatMap((req) => [
                ...(req?.requiresAllOf ?? []).flat(),
                ...(req?.exactUpstreamCount ? [req.exactUpstreamCount.type] : []),
            ]),
            ...Object.keys(REQUIRED_USER_CONFIG),
            ...Object.keys(RUNTIME_INTERACTION_HINTS),
            ...PIPELINE_TEMPLATES.flatMap((template) => template.nodes.map((node) => node.type)),
        ];
        referenced.forEach((type) => expect(known.has(type)).toBe(true));
    });

    it('only requires upstream types that VALID_CONNECTIONS allows to connect', () => {
        Object.entries(CARD_INPUT_REQUIREMENTS).forEach(([target, req]) => {
            const upstreamTypes = [
                ...(req?.requiresAllOf ?? []).flat(),
                ...(req?.exactUpstreamCount ? [req.exactUpstreamCount.type] : []),
            ];
            upstreamTypes.forEach((upstream) => {
                expect(VALID_CONNECTIONS[upstream]).toContain(target as CardType);
            });
        });
    });

    it('places every card in exactly one valid category and derives isInput/isAnalysis from config', () => {
        ANALYSIS_CATEGORIES.forEach((name) => expect(Object.keys(CATEGORIES)).toContain(name));
        catalog.cards.forEach((card) => {
            const groups = Object.keys(CATEGORIES).filter((name) => CATEGORIES[name].includes(card.cardType));
            expect(groups).toEqual([card.category]);
            expect(card.isInput).toBe(INPUT_CARD_TYPES.includes(card.cardType));
            expect(card.isAnalysis).toBe(ANALYSIS_CATEGORIES.includes(card.category));
        });
        expect(catalog.cards.filter((card) => card.isInput).map((card) => card.category)).toEqual(['Input', 'Input']);
    });

    it('fails fast when a card is missing from CATEGORIES', () => {
        const source = cloneSource();
        source.categories.Processes = source.categories.Processes.filter((type) => type !== 'FORMAL_VERIFY');
        expect(() => buildPipelineCapabilityCatalog(source)).toThrow(/FORMAL_VERIFY/);
    });

    it('survives a JSON stringify/parse round trip unchanged', () => {
        expect(JSON.parse(JSON.stringify(catalog))).toEqual(catalog);
    });

    it('contains no functions, React elements, icons, colours or runtime node state', () => {
        const forbiddenKeys = new Set(['icon', 'color', 'gif', 'x', 'y', 'id', 'data', 'status', 'logs', '$$typeof']);
        const violations: string[] = [];
        const walk = (value: unknown, where: string) => {
            if (['function', 'symbol', 'undefined'].includes(typeof value)) {
                violations.push(`${where} is ${typeof value}`);
            }
            if (value !== null && typeof value === 'object') {
                Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
                    if (forbiddenKeys.has(key)) violations.push(`${where}.${key} is a forbidden key`);
                    walk(child, `${where}.${key}`);
                });
            }
        };
        walk(catalog, 'catalog');
        expect(violations).toEqual([]);
    });

    it('produces a stable catalogVersion for identical config', () => {
        const again = buildPipelineCapabilityCatalog();
        expect(again.catalogVersion).toBe(catalog.catalogVersion);
        expect(buildPipelineCapabilityCatalog(cloneSource()).catalogVersion).toBe(catalog.catalogVersion);
        expect(catalog.catalogVersion).toMatch(/^pcat-[0-9a-f]{14}$/);
    });

    it('changes catalogVersion when semantic config changes', () => {
        const removedConnection = cloneSource();
        removedConnection.validConnections.IR_HOLDER = removedConnection.validConnections.IR_HOLDER.filter((t) => t !== 'AEGIS');

        const changedRequirement = cloneSource();
        changedRequirement.inputRequirements.SECURITY_REGRESSION = { exactUpstreamCount: { type: 'FORMAL_VERIFY', count: 3 } };

        const changedInputs = cloneSource();
        changedInputs.inputCardTypes = ['SYSTEM_INPUT'];

        const changedGuidance = cloneSource();
        changedGuidance.runtimeHints.TEST_EXECUTOR = 'different guidance';

        [removedConnection, changedRequirement, changedInputs, changedGuidance].forEach((source) => {
            expect(buildPipelineCapabilityCatalog(source).catalogVersion).not.toBe(catalog.catalogVersion);
        });
    });

    it('does not change catalogVersion when only the examples change', () => {
        const fewerExamples = cloneSource();
        fewerExamples.templates = fewerExamples.templates.slice(1);
        expect(buildPipelineCapabilityCatalog(fewerExamples).catalogVersion).toBe(catalog.catalogVersion);
    });
});

describe('catalog examples from PIPELINE_TEMPLATES', () => {
    const { examples } = buildPipelineCapabilityCatalog();

    it('converts every shipped template', () => {
        expect(examples.map((example) => example.templateId)).toEqual(PIPELINE_TEMPLATES.map((t) => t.id));
        examples.forEach((example, i) => {
            expect(example.title).toBe(PIPELINE_TEMPLATES[i].name);
            expect(example.summary).toBe(PIPELINE_TEMPLATES[i].description);
        });
    });

    it('keeps graph structure only: no runtime ids, coordinates, config state or presentation', () => {
        examples.forEach((example) => {
            expect(Object.keys(example).sort()).toEqual(['edges', 'nodes', 'summary', 'templateId', 'title']);
            example.nodes.forEach((node) => expect(Object.keys(node).sort()).toEqual(['cardType', 'key']));
            example.edges.forEach((edge) => expect(Object.keys(edge).sort()).toEqual(['from', 'to']));
        });
    });

    it('has unique node keys, edges between known keys, and preserves template node order', () => {
        examples.forEach((example, i) => {
            const keys = example.nodes.map((node) => node.key);
            expect(new Set(keys).size).toBe(keys.length);
            example.edges.forEach((edge) => {
                expect(keys).toContain(edge.from);
                expect(keys).toContain(edge.to);
            });
            expect(keys).toEqual(PIPELINE_TEMPLATES[i].nodes.map((node) => node.tempId));
        });
    });

    // Data sanity check for this story's CARD_INPUT_REQUIREMENTS values (too-strict values would
    // reject a shipped template). Full graph validation of templates belongs to P60-M1-003.
    it('shipped templates are consistent with CARD_INPUT_REQUIREMENTS', () => {
        const violations: string[] = [];
        examples.forEach((example) => {
            const typeOf = new Map(example.nodes.map((node) => [node.key, node.cardType]));
            example.nodes.forEach((node) => {
                const req = CARD_INPUT_REQUIREMENTS[node.cardType];
                if (!req) return;
                const where = `${example.templateId}/${node.key}`;
                const upstream = example.edges.filter((edge) => edge.to === node.key).map((edge) => typeOf.get(edge.from));
                if (req.maxIncoming !== undefined && upstream.length > req.maxIncoming) {
                    violations.push(`${where}: ${upstream.length} incoming > maxIncoming ${req.maxIncoming}`);
                }
                req.requiresAllOf?.forEach((group) => {
                    if (!upstream.some((type) => type !== undefined && group.includes(type))) {
                        violations.push(`${where}: missing upstream of ${group.join('|')}`);
                    }
                });
                if (req.exactUpstreamCount) {
                    const { type, count } = req.exactUpstreamCount;
                    const actual = upstream.filter((t) => t === type).length;
                    if (actual !== count) violations.push(`${where}: ${actual} ${type} upstream, expected ${count}`);
                }
            });
        });
        expect(violations).toEqual([]);
    });
});

describe('structural requirements and guidance mirror the existing runtime', () => {
    const pipelinePage = readSource('../PipelinePage.tsx');

    it('REQUIRED_USER_CONFIG covers exactly the cards with pre-run configuration checks', () => {
        expect(Object.keys(REQUIRED_USER_CONFIG).sort()).toEqual(['SYSTEM_INPUT', 'UPLOAD_IR']);
        expect(REQUIRED_USER_CONFIG.SYSTEM_INPUT?.fields).toEqual(['systemName', 'repositories']);
        expect(REQUIRED_USER_CONFIG.UPLOAD_IR?.fields).toEqual(['payload']);

        // The runtime checks these entries mirror (runPipeline / runFromNode).
        expect(pipelinePage).toContain("'System Name and at least one Repository URL are required.'");
        expect(pipelinePage).toContain("if (!node.data.systemName || !reposToProcess || reposToProcess.length === 0)");
        expect(pipelinePage).toContain("if (!node.data.payload?.irJson)");
        expect(pipelinePage).toContain("'No File Uploaded'");
    });

    it('cards whose settings have runtime defaults are not listed as required configuration', () => {
        expect(readSource('../cards/TestGenerateCard.tsx')).toContain("node.data.selectedLlm || 'gpt-5-mini'");
        expect(readSource('../cards/TestExecutorCard.tsx')).toContain("node.data.targetUrl || 'http://localhost:1234'");
        expect(readSource('../cards/PromptGenerateCard.tsx')).toContain("node.data.language || 'java'");
        ['TEST_GENERATE', 'TEST_EXECUTOR', 'PROMPT_GENERATE'].forEach((type) => {
            expect(REQUIRED_USER_CONFIG[type as CardType]).toBeUndefined();
        });
    });

    it('RUNTIME_INTERACTION_HINTS mirror steps that need user action during a run', () => {
        expect(Object.keys(RUNTIME_INTERACTION_HINTS).sort()).toEqual(['PROMPT_GENERATE', 'TEST_EXECUTOR']);
        expect(pipelinePage).toContain('No scenarios selected. Please check scenarios in the previous card.');
        expect(readSource('../cards/TestExecutorCard.tsx')).toContain('Launch Test Executor');
    });

    it('each multi-input requirement mirrors a check in processNextNodes', () => {
        expect(Object.keys(CARD_INPUT_REQUIREMENTS).filter((t) => {
            const req = CARD_INPUT_REQUIREMENTS[t as CardType];
            return Boolean(req?.requiresAllOf || req?.exactUpstreamCount);
        }).sort()).toEqual(['CHANGE_IMPACT', 'FORMAL_VIZ', 'SCENARIO_GENERATE', 'SECURITY_REGRESSION', 'VERIFICATION_COMPARISON']);

        expect(pipelinePage).toContain('No endpoints found. Please connect a COMPONENT HOLDER to this card');
        expect(pipelinePage).toContain("Link BOTH 'Formal Verification' and 'Scenario Generation' cards.");
        expect(pipelinePage).toContain('Missing Inputs: Please connect a Base IR (Generate IR / IR Holder) AND a Target Commit (System Source)');
        expect(pipelinePage).toContain('if (fvNodes.length !== 2) return;');
        expect(pipelinePage).toContain('Please connect a Formal Verify base card.');
        expect(pipelinePage).toContain("const inputNodes = nodes.filter(n => n.type === 'SYSTEM_INPUT' || n.type === 'UPLOAD_IR');");
        expect(pipelinePage).toContain('const upstreamConnection = connections.find(c => c.target === nodeId);');
    });
});
