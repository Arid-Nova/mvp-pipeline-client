/**
 * Serializable description of what the pipeline canvas can build (P60-M1-001).
 *
 * The catalog is derived from the real pipeline configuration (CARD_CONFIG, CATEGORIES,
 * VALID_CONNECTIONS, CARD_INPUT_REQUIREMENTS, ...) and the shipped PIPELINE_TEMPLATES, so the
 * planner prompt and the validator never rely on a hand-written copy of the card vocabulary.
 * It contains plain data only: no JSX icons, colour classes, or runtime node state.
 *
 * `inputRequirement` is a structural fact. `requiredUserConfig` and `runtimeHint` are user
 * guidance only; they are not validation rules and do not predict whether a run succeeds.
 */
import { CardType } from '../models';
import {
    ANALYSIS_CATEGORIES,
    CARD_CONFIG,
    CARD_INPUT_REQUIREMENTS,
    CATEGORIES,
    CardInputRequirement,
    INPUT_CARD_TYPES,
    REQUIRED_USER_CONFIG,
    RUNTIME_INTERACTION_HINTS,
    RequiredUserConfig,
    VALID_CONNECTIONS,
} from '../pipelineConfig';
import { PIPELINE_TEMPLATES, PipelineTemplate } from '../configs/PipelineTemplates';

export interface PipelineCardCapability {
    cardType: CardType;
    title: string;
    description: string;
    purpose: string;
    outcome: string;
    category: string;
    isInput: boolean;
    isAnalysis: boolean;
    allowedTargets: CardType[];
    inputRequirement: CardInputRequirement | null;
    requiredUserConfig: RequiredUserConfig | null;
    runtimeHint: string | null;
}

/** A shipped template expressed as graph structure only (no coordinates, icons or node state). */
export interface PipelineExample {
    templateId: string;
    title: string;
    summary: string;
    nodes: { key: string; cardType: CardType }[];
    edges: { from: string; to: string }[];
}

export interface PipelineCapabilityCatalog {
    catalogVersion: string;
    inputCardTypes: CardType[];
    analysisCategories: string[];
    cards: PipelineCardCapability[];
    examples: PipelineExample[];
}

/** Everything the catalog is built from; injectable so tests can vary the configuration. */
export interface CatalogSource {
    cardConfig: Record<CardType, { title: string; description: string; tooltip: { purpose: string; outcome: string } }>;
    categories: Record<string, CardType[]>;
    validConnections: Record<CardType, CardType[]>;
    inputRequirements: Partial<Record<CardType, CardInputRequirement>>;
    inputCardTypes: CardType[];
    analysisCategories: string[];
    requiredUserConfig: Partial<Record<CardType, RequiredUserConfig>>;
    runtimeHints: Partial<Record<CardType, string>>;
    templates: Pick<PipelineTemplate, 'id' | 'name' | 'description' | 'nodes' | 'connections'>[];
}

export const DEFAULT_CATALOG_SOURCE: CatalogSource = {
    cardConfig: CARD_CONFIG,
    categories: CATEGORIES,
    validConnections: VALID_CONNECTIONS,
    inputRequirements: CARD_INPUT_REQUIREMENTS,
    inputCardTypes: INPUT_CARD_TYPES,
    analysisCategories: ANALYSIS_CATEGORIES,
    requiredUserConfig: REQUIRED_USER_CONFIG,
    runtimeHints: RUNTIME_INTERACTION_HINTS,
    templates: PIPELINE_TEMPLATES,
};

const cloneRequirement = (requirement: CardInputRequirement): CardInputRequirement => {
    const copy: CardInputRequirement = {};
    if (requirement.requiresAllOf) copy.requiresAllOf = requirement.requiresAllOf.map((group) => [...group]);
    if (requirement.exactUpstreamCount) copy.exactUpstreamCount = { ...requirement.exactUpstreamCount };
    if (requirement.maxIncoming !== undefined) copy.maxIncoming = requirement.maxIncoming;
    return copy;
};

const categoryOf = (cardType: CardType, categories: Record<string, CardType[]>): string => {
    const matches = Object.keys(categories).filter((name) => categories[name].includes(cardType));
    if (matches.length !== 1) {
        throw new Error(`Card type ${cardType} must belong to exactly one CATEGORIES group, found ${matches.length}.`);
    }
    return matches[0];
};

const toExample = (template: CatalogSource['templates'][number]): PipelineExample => ({
    templateId: template.id,
    title: template.name,
    summary: template.description,
    nodes: template.nodes.map((node) => ({ key: node.tempId, cardType: node.type })),
    edges: template.connections.map((conn) => ({ from: conn.sourceTempId, to: conn.targetTempId })),
});

/** JSON with object keys sorted, so semantically identical values always serialize identically. */
const stableStringify = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const entries = Object.keys(value as Record<string, unknown>)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value);
};

/** cyrb53: small deterministic 53-bit string hash (non-cryptographic). */
const hashString = (input: string): string => {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < input.length; i += 1) {
        const ch = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return hash.toString(16).padStart(14, '0');
};

/**
 * Builds the capability catalog. Pure: the same source always yields the same catalog.
 * `catalogVersion` hashes everything except `examples`, so it changes whenever the card
 * vocabulary, connection rules, structural requirements or guidance change.
 */
export const buildPipelineCapabilityCatalog = (
    source: CatalogSource = DEFAULT_CATALOG_SOURCE
): PipelineCapabilityCatalog => {
    const cardTypes = Object.keys(source.cardConfig) as CardType[];

    const cards: PipelineCardCapability[] = cardTypes.map((cardType) => {
        const config = source.cardConfig[cardType];
        const category = categoryOf(cardType, source.categories);
        const requirement = source.inputRequirements[cardType];
        const userConfig = source.requiredUserConfig[cardType];
        return {
            cardType,
            title: config.title,
            description: config.description,
            purpose: config.tooltip.purpose,
            outcome: config.tooltip.outcome,
            category,
            isInput: source.inputCardTypes.includes(cardType),
            isAnalysis: source.analysisCategories.includes(category),
            allowedTargets: [...(source.validConnections[cardType] ?? [])],
            inputRequirement: requirement ? cloneRequirement(requirement) : null,
            requiredUserConfig: userConfig ? { fields: [...userConfig.fields], hint: userConfig.hint } : null,
            runtimeHint: source.runtimeHints[cardType] ?? null,
        };
    });

    const inputCardTypes = [...source.inputCardTypes];
    const analysisCategories = [...source.analysisCategories];
    const catalogVersion = `pcat-${hashString(stableStringify({ inputCardTypes, analysisCategories, cards }))}`;

    return {
        catalogVersion,
        inputCardTypes,
        analysisCategories,
        cards,
        examples: source.templates.map(toExample),
    };
};
