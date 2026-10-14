/**
 * @jest-environment node
 */
/**
 * Local-model feasibility spikes (live measurement harness):
 *   - P60-M1-014: graph generation (LIVE_LLM_TASK=graph, default). Completed: Decision D.
 *   - P60-M1-016: intent selection (LIVE_LLM_TASK=intent). The model only picks analysis
 *     capabilities; it never sees or produces graph structure (Revision 7, D11).
 *   - P60-M1-011: final release qualification (LIVE_LLM_TASK=release) of the finished path:
 *     real chatbot-backend /chatbot/pipeline/intents + the real frontend planner (see
 *     releaseQualification.ts). Reuses the intent test slot, so the skip count is unchanged:
 *       RUN_LIVE_LLM=1 LIVE_LLM_TASK=release CHATBOT_BASE_URL=http://localhost:8081 \
 *         CI=true npm test -- --watchAll=false localModelFeasibility
 *
 * SKIPPED unless RUN_LIVE_LLM=1, so normal `npm test` makes no network calls.
 *
 *   RUN_LIVE_LLM=1 OLLAMA_BASE_URL=http://[::1]:11434 \
 *     CI=true npm test -- --watchAll=false localModelFeasibility
 *   RUN_LIVE_LLM=1 LIVE_LLM_TASK=intent OLLAMA_BASE_URL=http://[::1]:11434 LIVE_LLM_NUM_PREDICT=1024 \
 *     CI=true npm test -- --watchAll=false localModelFeasibility
 *
 * Everything the model sees is built from buildPipelineCapabilityCatalog(); this file keeps no
 * card list, connection list or simplified capability model of its own.
 *
 * The evaluator below is TEMPORARY spike code standing in for P60-M1-002/003, which do not exist
 * yet. It reports syntax problems (JSON / shape) separately from semantic pipeline-rule
 * violations and must not be reused as production validation.
 *
 * Environment knobs (all optional):
 *   OLLAMA_BASE_URL         default http://localhost:11434 (on a machine that also runs a native
 *                           Ollama, point this at the compose container explicitly)
 *   OLLAMA_MODEL            default llama3.2
 *   LIVE_LLM_NUM_CTX        default 8192
 *   LIVE_LLM_NUM_PREDICT    default 2048
 *   LIVE_LLM_TEMPERATURE    default 0.4
 *   LIVE_LLM_TIMEOUT_MS     per-call HTTP timeout, default 300000
 *   LIVE_LLM_PROMPT         prompt variant: v1 (default) | v2 (tuning iteration)
 *   LIVE_LLM_PLAN           full (default) | g1 (G1 main reps + retry probe only)
 *   LIVE_LLM_RESULTS_DIR    where the raw JSON results are written, default os.tmpdir()
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { CardType } from '../../models';
import { PipelineCapabilityCatalog, PipelineExample, buildPipelineCapabilityCatalog } from '../pipelineCapabilities';
import { runReleaseQualification } from './releaseQualification';

const LIVE = process.env.RUN_LIVE_LLM === '1';
/** graph = P60-M1-014 graph-generation task (default); intent = P60-M1-016 intent-selection task. */
const TASK = process.env.LIVE_LLM_TASK || 'graph';
const describeLive = LIVE && TASK === 'graph' ? describe : describe.skip;
/** intent = P60-M1-016 spike; release = P60-M1-011 qualification (same test slot). */
const describeIntentLive = LIVE && (TASK === 'intent' || TASK === 'release') ? describe : describe.skip;
const CHATBOT_BASE_URL = process.env.CHATBOT_BASE_URL || 'http://localhost:8081';

const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const NUM_CTX = Number(process.env.LIVE_LLM_NUM_CTX || 8192);
const NUM_PREDICT = Number(process.env.LIVE_LLM_NUM_PREDICT || 2048);
const TEMPERATURE = Number(process.env.LIVE_LLM_TEMPERATURE || 0.4);
const TIMEOUT_MS = Number(process.env.LIVE_LLM_TIMEOUT_MS || 300000);
const PROMPT_VARIANT = process.env.LIVE_LLM_PROMPT || 'v1';
const PLAN = process.env.LIVE_LLM_PLAN || 'full';
const RESULTS_DIR = process.env.LIVE_LLM_RESULTS_DIR || os.tmpdir();

const GOALS: Record<string, string> = {
    G1: 'I want to visualize the architecture and check authorization problems.',
    G2: 'Just show me the architecture.',
    G3: 'I want to test authorization of my endpoints.',
    G4: 'Find security or architecture risks.',
    G5: 'Compare policy or verification results across versions.',
};

/** Templates shown to the model as examples (taken from catalog.examples, not rewritten). */
const EXAMPLE_TEMPLATE_IDS = ['arch-reconstruction', 'auth-test-generation'];

const MAX_NODES = 16;
const MAX_EDGES = 24;
const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

// ---------------------------------------------------------------------------------------------
// Prompt (draft for P60-M1-005's PipelinePlanPromptBuilder)
// ---------------------------------------------------------------------------------------------

const describeRequirement = (cardType: CardType, catalog: PipelineCapabilityCatalog): string[] => {
    const card = catalog.cards.find((c) => c.cardType === cardType);
    const req = card?.inputRequirement;
    if (!req) return [];
    const lines: string[] = [];
    req.requiresAllOf?.forEach((group) => {
        lines.push(`${cardType} must have an incoming edge from ${group.join(' or ')}.`);
    });
    if (req.exactUpstreamCount) {
        lines.push(
            `${cardType} must have exactly ${req.exactUpstreamCount.count} incoming edges from ` +
                `${req.exactUpstreamCount.type} cards (list the base/older one first).`
        );
    }
    return lines;
};

const exampleCandidate = (example: PipelineExample) => ({
    specVersion: 1,
    title: example.title,
    summary: example.summary,
    rationale: 'Example of the required format, taken from a shipped template.',
    nodes: example.nodes,
    edges: example.edges,
});

export const buildSystemPrompt = (catalog: PipelineCapabilityCatalog, variant: string): string => {
    const cardLines = catalog.cards.map(
        (c) =>
            `- ${c.cardType} ("${c.title}", ${c.category}${c.isInput ? ', INPUT' : ''}${c.isAnalysis ? ', ANALYSIS' : ''}): ${c.purpose}`
    );
    const edgeLines = catalog.cards
        .filter((c) => c.allowedTargets.length > 0)
        .map((c) => `- ${c.cardType} -> ${c.allowedTargets.join(', ')}`);
    const noTargets = catalog.cards.filter((c) => c.allowedTargets.length === 0).map((c) => c.cardType);
    const singleInput = catalog.cards.filter((c) => c.inputRequirement?.maxIncoming === 1).map((c) => c.cardType);
    const requirementLines = catalog.cards.flatMap((c) => describeRequirement(c.cardType, catalog));
    const examples = catalog.examples
        .filter((e) => EXAMPLE_TEMPLATE_IDS.includes(e.templateId))
        .map((e) => JSON.stringify(exampleCandidate(e)));

    const lines = [
        'You design analysis pipelines for AridNova, a microservice analysis toolkit.',
        'A pipeline is a directed graph of cards. Respond with ONE JSON object and nothing else.',
        '',
        'CARDS (use these cardType values exactly):',
        ...cardLines,
        '',
        'ALLOWED CONNECTIONS (an edge may only go from a card to one of the listed targets):',
        ...edgeLines,
        `- These cards have no outgoing edges: ${noTargets.join(', ')}.`,
        '',
        'STRUCTURAL RULES (every candidate must satisfy all of them):',
        `1. Start from at least one input card: ${catalog.inputCardTypes.join(' or ')}.`,
        '2. Use only the allowed connections above. No duplicate edges, no edge from a card to itself.',
        '3. Every non-input card needs at least one incoming edge, and every card must be reachable from an input card.',
        '4. A candidate is ONE connected pipeline.',
        `5. At most one incoming edge for: ${singleInput.join(', ')}.`,
        ...requirementLines.map((line, i) => `${6 + i}. ${line}`),
        `${6 + requirementLines.length}. Include at least one ANALYSIS card.`,
        `${7 + requirementLines.length}. Use at most ${MAX_NODES} nodes and ${MAX_EDGES} edges.`,
        `${8 + requirementLines.length}. Never include configuration or runtime data: no repositories, system names, URLs, ` +
            'model names, credentials, ids, coordinates, positions or status. Only the fields in the schema.',
        '',
        'OUTPUT SCHEMA:',
        '{"candidates":[{"specVersion":1,"title":"short title","summary":"one or two sentences",' +
            '"rationale":"why this fits the goal","nodes":[{"key":"lowercase_key","cardType":"CARD_TYPE"}],' +
            '"edges":[{"from":"key","to":"key"}]}]}',
        'Node keys are short lowercase words (letters, digits, _ or -) and unique within a candidate.',
        '',
        'Return EXACTLY THREE candidates for the user\'s goal:',
        '- one FOCUSED: the minimal pipeline that serves the goal;',
        '- one BALANCED: the focused pipeline plus the most useful related analysis;',
        '- one COMPREHENSIVE: a broader pipeline covering more related analyses.',
        'The three candidates must use different ANALYSIS cards, not just different titles.',
        'If AridNova cannot serve the goal at all, return {"candidates":[],"unsupportedReason":"..."}.',
        '',
        'EXAMPLES OF A SINGLE CANDIDATE IN THE REQUIRED FORMAT:',
        ...examples,
    ];

    if (variant === 'v2') {
        // Tuning iteration: same catalog facts, restated from the target's point of view
        // (derived from allowedTargets, not hand-written) plus an explicit self-check.
        const incomingLines = catalog.cards
            .map((target) => ({
                target: target.cardType,
                sources: catalog.cards.filter((s) => s.allowedTargets.includes(target.cardType)).map((s) => s.cardType),
            }))
            .filter((entry) => entry.sources.length > 0)
            .map((entry) => `- ${entry.target} can only receive edges from: ${entry.sources.join(', ')}`);
        lines.push(
            '',
            'INCOMING EDGES (the same rules seen from each target card):',
            ...incomingLines,
            '',
            'BEFORE ANSWERING, CHECK EVERY EDGE: the "to" card must be listed for the "from" card in ALLOWED CONNECTIONS. ' +
                'If not, insert the missing intermediate card or remove the edge.'
        );
    }
    return lines.join('\n');
};

// ---------------------------------------------------------------------------------------------
// Ollama client (Node http; no fetch/axios in Jest 27's node environment)
// ---------------------------------------------------------------------------------------------

interface OllamaChatResult {
    content: string;
    wallMs: number;
    doneReason: string | null;
    totalDurationMs: number | null;
    loadDurationMs: number | null;
    promptEvalCount: number | null;
    promptEvalMs: number | null;
    evalCount: number | null;
    evalMs: number | null;
    /** Length of message.thinking for reasoning models (thinking tokens are included in evalCount). */
    thinkingChars: number | null;
    error: string | null;
}

const request = (method: string, urlPath: string, body?: unknown): Promise<{ status: number; text: string }> =>
    new Promise((resolve, reject) => {
        const url = new URL(urlPath, BASE_URL);
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const req = http.request(
            {
                method,
                hostname: url.hostname.replace(/^\[|\]$/g, ''),
                port: url.port,
                path: url.pathname,
                headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
                timeout: TIMEOUT_MS,
            },
            (res) => {
                let text = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    text += chunk;
                });
                res.on('end', () => resolve({ status: res.statusCode || 0, text }));
            }
        );
        req.on('timeout', () => req.destroy(new Error(`timeout after ${TIMEOUT_MS} ms`)));
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });

const nsToMs = (ns: unknown): number | null => (typeof ns === 'number' ? Math.round(ns / 1e6) : null);

const chat = async (messages: { role: string; content: string }[], jsonMode: boolean): Promise<OllamaChatResult> => {
    const started = Date.now();
    try {
        const { status, text } = await request('POST', '/api/chat', {
            model: MODEL,
            messages,
            stream: false,
            ...(jsonMode ? { format: 'json' } : {}),
            keep_alive: '30m',
            options: { temperature: TEMPERATURE, num_predict: NUM_PREDICT, num_ctx: NUM_CTX },
        });
        const wallMs = Date.now() - started;
        if (status !== 200) {
            return { content: '', wallMs, doneReason: null, totalDurationMs: null, loadDurationMs: null, promptEvalCount: null, promptEvalMs: null, evalCount: null, evalMs: null, thinkingChars: null, error: `HTTP ${status}: ${text.slice(0, 200)}` };
        }
        const body = JSON.parse(text);
        return {
            content: body?.message?.content ?? '',
            wallMs,
            doneReason: body?.done_reason ?? null,
            totalDurationMs: nsToMs(body?.total_duration),
            loadDurationMs: nsToMs(body?.load_duration),
            promptEvalCount: typeof body?.prompt_eval_count === 'number' ? body.prompt_eval_count : null,
            promptEvalMs: nsToMs(body?.prompt_eval_duration),
            evalCount: typeof body?.eval_count === 'number' ? body.eval_count : null,
            evalMs: nsToMs(body?.eval_duration),
            thinkingChars: typeof body?.message?.thinking === 'string' ? body.message.thinking.length : null,
            error: null,
        };
    } catch (e: any) {
        return { content: '', wallMs: Date.now() - started, doneReason: null, totalDurationMs: null, loadDurationMs: null, promptEvalCount: null, promptEvalMs: null, evalCount: null, evalMs: null, thinkingChars: null, error: String(e?.message || e) };
    }
};

// ---------------------------------------------------------------------------------------------
// TEMPORARY evaluator (spike only; P60-M1-002/003 will replace it)
// ---------------------------------------------------------------------------------------------

interface SpecLike {
    nodes: { key: string; cardType: string }[];
    edges: { from: string; to: string }[];
}

interface CandidateEvaluation {
    index: number;
    shapeOk: boolean;
    shapeIssues: string[];
    ignoredFields: string[];
    issues: string[]; // semantic rule codes
    /** Reporting detail for ILLEGAL_CONNECTION / INPUT_REQUIREMENT_UNMET (same rules, no extra checks). */
    illegalEdges: string[];
    unmetRequirements: string[];
    valid: boolean;
    analysisSet: string | null;
    signature: string | null;
    cardTypes: string[];
}

/** Mirrors the planned backend extractor: strip fences, take the first balanced top-level object. */
const extractJsonObject = (text: string): { parsed: unknown; direct: boolean } | null => {
    try {
        return { parsed: JSON.parse(text), direct: true };
    } catch {
        // fall through to tolerant extraction
    }
    const stripped = text.replace(/```(?:json)?/gi, '');
    const start = stripped.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    for (let i = start; i < stripped.length; i += 1) {
        const ch = stripped[i];
        if (inString) {
            if (ch === '\\') i += 1;
            else if (ch === '"') inString = false;
        } else if (ch === '"') inString = true;
        else if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                try {
                    return { parsed: JSON.parse(stripped.slice(start, i + 1)), direct: false };
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
};

const ALLOWED_CANDIDATE_FIELDS = new Set(['specVersion', 'title', 'summary', 'rationale', 'nodes', 'edges']);

const checkShape = (raw: unknown): { spec: SpecLike | null; issues: string[]; ignoredFields: string[] } => {
    const issues: string[] = [];
    const ignoredFields: string[] = [];
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { spec: null, issues: ['NOT_OBJECT'], ignoredFields };
    const obj = raw as Record<string, unknown>;
    Object.keys(obj).filter((k) => !ALLOWED_CANDIDATE_FIELDS.has(k)).forEach((k) => ignoredFields.push(k));
    if (!Array.isArray(obj.nodes)) issues.push('NODES_NOT_ARRAY');
    if (!Array.isArray(obj.edges)) issues.push('EDGES_NOT_ARRAY');
    if (typeof obj.title !== 'string' || !obj.title.trim()) issues.push('MISSING_TITLE');
    if (issues.some((i) => i.endsWith('NOT_ARRAY'))) return { spec: null, issues, ignoredFields };

    const nodes: SpecLike['nodes'] = [];
    (obj.nodes as unknown[]).forEach((n) => {
        if (n && typeof n === 'object' && typeof (n as any).key === 'string' && typeof (n as any).cardType === 'string') {
            Object.keys(n as object).filter((k) => k !== 'key' && k !== 'cardType').forEach((k) => ignoredFields.push(`node.${k}`));
            nodes.push({ key: (n as any).key, cardType: (n as any).cardType });
            if (!KEY_PATTERN.test((n as any).key)) issues.push('BAD_NODE_KEY');
        } else {
            issues.push('BAD_NODE_SHAPE');
        }
    });
    const edges: SpecLike['edges'] = [];
    (obj.edges as unknown[]).forEach((e) => {
        if (e && typeof e === 'object' && typeof (e as any).from === 'string' && typeof (e as any).to === 'string') {
            edges.push({ from: (e as any).from, to: (e as any).to });
        } else {
            issues.push('BAD_EDGE_SHAPE');
        }
    });
    return { spec: issues.length === 0 ? { nodes, edges } : null, issues, ignoredFields };
};

interface SemanticEvaluation {
    issues: string[];
    illegalEdges: string[];
    unmetRequirements: string[];
}

const evaluateSemantics = (spec: SpecLike, catalog: PipelineCapabilityCatalog): SemanticEvaluation => {
    const issues = new Set<string>();
    const illegalEdges: string[] = [];
    const unmetRequirements: string[] = [];
    const cardByType = new Map(catalog.cards.map((c) => [c.cardType as string, c]));
    const typeOf = new Map<string, string>();
    spec.nodes.forEach((n) => {
        if (typeOf.has(n.key)) issues.add('DUPLICATE_NODE_KEY');
        typeOf.set(n.key, n.cardType);
        if (!cardByType.has(n.cardType)) issues.add('UNKNOWN_CARD_TYPE');
    });
    if (spec.nodes.length < 2 || spec.nodes.length > MAX_NODES || spec.edges.length > MAX_EDGES) issues.add('SIZE_LIMIT');

    const seen = new Set<string>();
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();
    spec.edges.forEach((e) => {
        if (!typeOf.has(e.from) || !typeOf.has(e.to)) {
            issues.add('EDGE_UNKNOWN_NODE');
            return;
        }
        if (e.from === e.to) issues.add('SELF_LOOP');
        const id = `${e.from}>${e.to}`;
        if (seen.has(id)) issues.add('DUPLICATE_EDGE');
        seen.add(id);
        const source = cardByType.get(typeOf.get(e.from) as string);
        if (source && !source.allowedTargets.includes(typeOf.get(e.to) as CardType)) {
            issues.add('ILLEGAL_CONNECTION');
            illegalEdges.push(`${typeOf.get(e.from)}->${typeOf.get(e.to)}`);
        }
        incoming.set(e.to, [...(incoming.get(e.to) || []), e.from]);
        outgoing.set(e.from, [...(outgoing.get(e.from) || []), e.to]);
    });

    const inputKeys = spec.nodes.filter((n) => catalog.inputCardTypes.includes(n.cardType as CardType)).map((n) => n.key);
    if (inputKeys.length === 0) issues.add('MISSING_INPUT');
    inputKeys.forEach((k) => {
        if (!(outgoing.get(k) || []).length) issues.add('INPUT_WITHOUT_OUTPUT');
    });

    spec.nodes.forEach((n) => {
        const card = cardByType.get(n.cardType);
        if (!card) return;
        const ups = (incoming.get(n.key) || []).map((k) => typeOf.get(k));
        if (!card.isInput && ups.length === 0) issues.add('MISSING_UPSTREAM');
        const req = card.inputRequirement;
        if (!req) return;
        if (req.maxIncoming !== undefined && ups.length > req.maxIncoming) {
            issues.add('INPUT_REQUIREMENT_UNMET');
            unmetRequirements.push(`${n.cardType} maxIncoming ${req.maxIncoming}`);
        }
        req.requiresAllOf?.forEach((group) => {
            if (!ups.some((t) => t !== undefined && (group as string[]).includes(t))) {
                issues.add('INPUT_REQUIREMENT_UNMET');
                unmetRequirements.push(`${n.cardType} needs ${group.join('|')}`);
            }
        });
        if (req.exactUpstreamCount && ups.filter((t) => t === req.exactUpstreamCount!.type).length !== req.exactUpstreamCount.count) {
            issues.add('INPUT_REQUIREMENT_UNMET');
            unmetRequirements.push(`${n.cardType} needs exactly ${req.exactUpstreamCount.count} ${req.exactUpstreamCount.type}`);
        }
    });

    // Reachability from inputs and weak connectivity.
    const reached = new Set<string>(inputKeys);
    const queue = [...inputKeys];
    while (queue.length) {
        const k = queue.shift() as string;
        (outgoing.get(k) || []).forEach((t) => {
            if (!reached.has(t)) {
                reached.add(t);
                queue.push(t);
            }
        });
    }
    if (spec.nodes.some((n) => !reached.has(n.key))) issues.add('UNREACHABLE_NODE');

    if (spec.nodes.length > 0) {
        const undirected = new Map<string, string[]>();
        spec.edges.forEach((e) => {
            undirected.set(e.from, [...(undirected.get(e.from) || []), e.to]);
            undirected.set(e.to, [...(undirected.get(e.to) || []), e.from]);
        });
        const comp = new Set<string>([spec.nodes[0].key]);
        const q = [spec.nodes[0].key];
        while (q.length) {
            const k = q.shift() as string;
            (undirected.get(k) || []).forEach((t) => {
                if (!comp.has(t)) {
                    comp.add(t);
                    q.push(t);
                }
            });
        }
        if (comp.size !== new Set(spec.nodes.map((n) => n.key)).size) issues.add('NOT_CONNECTED');
    }

    if (!spec.nodes.some((n) => cardByType.get(n.cardType)?.isAnalysis)) issues.add('NO_ANALYSIS_CARD');
    return { issues: Array.from(issues).sort(), illegalEdges, unmetRequirements };
};

const analysisSetOf = (spec: SpecLike, catalog: PipelineCapabilityCatalog): string => {
    const analysis = new Set(catalog.cards.filter((c) => c.isAnalysis).map((c) => c.cardType as string));
    return Array.from(new Set(spec.nodes.map((n) => n.cardType).filter((t) => analysis.has(t)))).sort().join('+');
};

const signatureOf = (spec: SpecLike): string => {
    const typeOf = new Map(spec.nodes.map((n) => [n.key, n.cardType]));
    const nodes = spec.nodes.map((n) => n.cardType).sort().join(',');
    const edges = spec.edges.map((e) => `${typeOf.get(e.from)}>${typeOf.get(e.to)}`).sort().join(',');
    return `${nodes}|${edges}`;
};

interface ResponseEvaluation {
    jsonDirect: boolean;
    jsonExtracted: boolean;
    candidatesArray: boolean;
    candidateCount: number;
    shapeOkCount: number;
    unsupportedReason: string | null;
    candidates: CandidateEvaluation[];
}

const evaluateResponse = (content: string, catalog: PipelineCapabilityCatalog): ResponseEvaluation => {
    const extracted = extractJsonObject(content);
    const result: ResponseEvaluation = {
        jsonDirect: Boolean(extracted?.direct),
        jsonExtracted: Boolean(extracted),
        candidatesArray: false,
        candidateCount: 0,
        shapeOkCount: 0,
        unsupportedReason: null,
        candidates: [],
    };
    const root = extracted?.parsed as any;
    if (!root || typeof root !== 'object') return result;
    if (typeof root.unsupportedReason === 'string') result.unsupportedReason = root.unsupportedReason;
    if (!Array.isArray(root.candidates)) return result;
    result.candidatesArray = true;
    result.candidateCount = root.candidates.length;
    result.candidates = root.candidates.map((raw: unknown, index: number): CandidateEvaluation => {
        const shape = checkShape(raw);
        if (!shape.spec) {
            return { index, shapeOk: false, shapeIssues: shape.issues, ignoredFields: shape.ignoredFields, issues: [], illegalEdges: [], unmetRequirements: [], valid: false, analysisSet: null, signature: null, cardTypes: [] };
        }
        const { issues, illegalEdges, unmetRequirements } = evaluateSemantics(shape.spec, catalog);
        return {
            index,
            shapeOk: true,
            shapeIssues: [],
            ignoredFields: shape.ignoredFields,
            issues,
            illegalEdges,
            unmetRequirements,
            valid: issues.length === 0,
            analysisSet: analysisSetOf(shape.spec, catalog),
            signature: signatureOf(shape.spec),
            cardTypes: shape.spec.nodes.map((n) => n.cardType),
        };
    });
    result.shapeOkCount = result.candidates.filter((c) => c.shapeOk).length;
    return result;
};

/** Distinct valid candidates by analysis-card set (the planned P60-M1-004 rule). */
const distinctValid = (candidates: CandidateEvaluation[]): CandidateEvaluation[] => {
    const seenSets = new Set<string>();
    return candidates.filter((c) => {
        if (!c.valid || c.analysisSet === null || seenSets.has(c.analysisSet)) return false;
        seenSets.add(c.analysisSet);
        return true;
    });
};

const percentile = (values: number[], p: number): number | null => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

// ---------------------------------------------------------------------------------------------
// Experiment
// ---------------------------------------------------------------------------------------------

interface RunRecord {
    id: string;
    phase: 'main' | 'control' | 'retry';
    goal: string;
    rep: number;
    jsonMode: boolean;
    call: OllamaChatResult;
    evaluation: ResponseEvaluation;
    distinctValidCount: number;
    usableSet: boolean;
    retry?: { call: OllamaChatResult; evaluation: ResponseEvaluation; combinedDistinctValid: number; usableAfterRetry: boolean };
}

describeLive('P60-M1-014 live local-model feasibility', () => {
    jest.setTimeout(4 * 60 * 60 * 1000);

    it('measures the configured Ollama model against the real capability catalog', async () => {
        const catalog = buildPipelineCapabilityCatalog();
        const systemPrompt = buildSystemPrompt(catalog, PROMPT_VARIANT);
        const version = await request('GET', '/api/version');
        const ollamaVersion = JSON.parse(version.text).version;

        const userMessage = (goal: string) => `Analysis goal: "${goal}"\nReturn the JSON object now.`;
        const ask = (goal: string, jsonMode: boolean) =>
            chat([{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage(goal) }], jsonMode);

        // Warm-up (loads the model; not counted).
        const warmup = await ask(GOALS.G2, true);

        const plan: { phase: 'main' | 'control'; goal: string; reps: number; jsonMode: boolean }[] =
            PLAN === 'g1'
                ? [{ phase: 'main', goal: 'G1', reps: 5, jsonMode: true }]
                : [
                      { phase: 'main', goal: 'G1', reps: 5, jsonMode: true },
                      { phase: 'main', goal: 'G2', reps: 3, jsonMode: true },
                      { phase: 'main', goal: 'G3', reps: 3, jsonMode: true },
                      { phase: 'main', goal: 'G4', reps: 3, jsonMode: true },
                      { phase: 'main', goal: 'G5', reps: 3, jsonMode: true },
                      { phase: 'control', goal: 'G1', reps: 2, jsonMode: false },
                  ];

        const runs: RunRecord[] = [];
        for (const step of plan) {
            for (let rep = 1; rep <= step.reps; rep += 1) {
                // eslint-disable-next-line no-await-in-loop
                const call = await ask(GOALS[step.goal], step.jsonMode);
                const evaluation = evaluateResponse(call.content, catalog);
                const distinct = distinctValid(evaluation.candidates);
                const record: RunRecord = {
                    id: `${step.phase}-${step.goal}-${rep}`,
                    phase: step.phase,
                    goal: step.goal,
                    rep,
                    jsonMode: step.jsonMode,
                    call,
                    evaluation,
                    distinctValidCount: distinct.length,
                    usableSet: distinct.length >= 3,
                };

                // Bounded retry probe (one retry) for G1 main runs without a usable set,
                // following the planned P60-M1-006 algorithm: keep accepted, send rejection codes.
                if (step.phase === 'main' && step.goal === 'G1' && !record.usableSet) {
                    const accepted = distinct.map((c) => c.cardTypes.join(' -> '));
                    const feedback = Array.from(
                        new Set([
                            ...evaluation.candidates.flatMap((c) => [...c.issues, ...c.shapeIssues]),
                            ...(evaluation.jsonExtracted ? [] : ['INVALID_JSON']),
                            ...(evaluation.candidatesArray ? [] : ['NO_CANDIDATES_ARRAY']),
                        ])
                    );
                    const retryPrompt =
                        `Your previous answer did not give three valid, different pipelines. Problems found: ` +
                        `${feedback.length ? feedback.join(', ') : 'too few distinct candidates'}. ` +
                        (accepted.length
                            ? `These valid candidates are already accepted, do not repeat them (cards): ${accepted.join(' | ')}. `
                            : '') +
                        'Return a JSON object with exactly three NEW candidates for the same goal that follow every rule.';
                    // eslint-disable-next-line no-await-in-loop
                    const retryCall = await chat(
                        [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userMessage(GOALS.G1) },
                            { role: 'assistant', content: call.content },
                            { role: 'user', content: retryPrompt },
                        ],
                        true
                    );
                    const retryEval = evaluateResponse(retryCall.content, catalog);
                    const combined = distinctValid([...distinct, ...retryEval.candidates]);
                    record.retry = {
                        call: retryCall,
                        evaluation: retryEval,
                        combinedDistinctValid: combined.length,
                        usableAfterRetry: combined.length >= 3,
                    };
                }

                runs.push(record);
                // eslint-disable-next-line no-console
                console.log(
                    `[${record.id}] wall=${call.wallMs}ms json=${evaluation.jsonDirect ? 'direct' : evaluation.jsonExtracted ? 'extracted' : 'NO'} ` +
                        `cands=${evaluation.candidateCount} shapeOk=${evaluation.shapeOkCount} distinctValid=${record.distinctValidCount} ` +
                        `issues=${JSON.stringify(evaluation.candidates.map((c) => c.issues.concat(c.shapeIssues)))} done=${call.doneReason} ` +
                        `promptTok=${call.promptEvalCount} outTok=${call.evalCount}${call.error ? ` ERROR=${call.error}` : ''}` +
                        (record.retry
                            ? ` | retry wall=${record.retry.call.wallMs}ms distinctAfter=${record.retry.combinedDistinctValid} ` +
                              `retryIssues=${JSON.stringify(record.retry.evaluation.candidates.map((c) => c.issues.concat(c.shapeIssues)))}`
                            : '')
                );
            }
        }

        // ---- Summary against the frozen early thresholds ----
        const main = runs.filter((r) => r.phase === 'main');
        const g1 = main.filter((r) => r.goal === 'G1');
        const mainCalls = [...main.map((r) => r.call), ...main.flatMap((r) => (r.retry ? [r.retry.call] : []))];
        const wall = mainCalls.map((c) => c.wallMs);
        const promptTokens = mainCalls.map((c) => c.promptEvalCount).filter((v): v is number => v !== null);
        const issueCounts: Record<string, number> = {};
        [...main.flatMap((r) => r.evaluation.candidates), ...main.flatMap((r) => r.retry?.evaluation.candidates ?? [])].forEach((c) => {
            [...c.issues, ...c.shapeIssues].forEach((code) => {
                issueCounts[code] = (issueCounts[code] || 0) + 1;
            });
        });

        const mainCandidates = [...main.flatMap((r) => r.evaluation.candidates), ...main.flatMap((r) => r.retry?.evaluation.candidates ?? [])];
        const countBy = (items: string[]) =>
            Object.entries(items.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item]: (acc[item] || 0) + 1 }), {}))
                .sort((a, b) => b[1] - a[1])
                .map(([item, count]) => `${item} x${count}`);
        const planningTotals = main.map((r) => r.call.wallMs + (r.retry ? r.retry.call.wallMs : 0));

        const summary = {
            catalogVersion: catalog.catalogVersion,
            ollamaBaseUrl: BASE_URL,
            ollamaVersion,
            model: MODEL,
            settings: { numCtx: NUM_CTX, numPredict: NUM_PREDICT, temperature: TEMPERATURE, promptVariant: PROMPT_VARIANT, plan: PLAN },
            systemPromptChars: systemPrompt.length,
            // Cold start is isolated in the uncounted warm-up call; all measured calls below are warm.
            warmup: { wallMs: warmup.wallMs, loadDurationMs: warmup.loadDurationMs, promptEvalCount: warmup.promptEvalCount, doneReason: warmup.doneReason },
            mainRuns: main.length,
            jsonParseRate: main.filter((r) => r.evaluation.jsonExtracted).length / Math.max(1, main.length),
            jsonDirectRate: main.filter((r) => r.evaluation.jsonDirect).length / Math.max(1, main.length),
            candidateVolumeRate: main.filter((r) => r.evaluation.shapeOkCount >= 3).length / Math.max(1, main.length),
            usableFirstAttemptRate: main.filter((r) => r.usableSet).length / Math.max(1, main.length),
            g1UsableWithinOneRetry: g1.filter((r) => r.usableSet || r.retry?.usableAfterRetry).length,
            g1Runs: g1.length,
            perGoalUsable: Object.keys(GOALS).map((g) => ({
                goal: g,
                runs: main.filter((r) => r.goal === g).length,
                usable: main.filter((r) => r.goal === g && r.usableSet).length,
                meanDistinctValid:
                    main.filter((r) => r.goal === g).reduce((s, r) => s + r.distinctValidCount, 0) /
                    Math.max(1, main.filter((r) => r.goal === g).length),
            })),
            perCallWallMs: { n: wall.length, p50: percentile(wall, 50), p95: percentile(wall, 95), max: wall.length ? Math.max(...wall) : null },
            promptTokens: { max: promptTokens.length ? Math.max(...promptTokens) : null, numCtx: NUM_CTX, maxUsage: promptTokens.length ? Math.max(...promptTokens) / NUM_CTX : null },
            truncatedByLength: mainCalls.filter((c) => c.doneReason === 'length').length,
            callErrors: mainCalls.filter((c) => c.error).map((c) => c.error),
            semanticAndShapeIssueCounts: issueCounts,
            illegalEdgeCounts: countBy(mainCandidates.flatMap((c) => c.illegalEdges)),
            unmetRequirementCounts: countBy(mainCandidates.flatMap((c) => c.unmetRequirements)),
            totalPlanningMs: { n: planningTotals.length, p50: percentile(planningTotals, 50), p95: percentile(planningTotals, 95), max: planningTotals.length ? Math.max(...planningTotals) : null },
            g1Reps: g1.map((r) => {
                const first = r.evaluation.candidates;
                const retryCands = r.retry?.evaluation.candidates ?? [];
                const all = [...first, ...retryCands];
                const validAll = all.filter((c) => c.valid);
                const distinctAll = distinctValid(all);
                return {
                    rep: r.rep,
                    jsonParsed: r.evaluation.jsonExtracted,
                    rawCandidates: r.evaluation.candidateCount,
                    validBeforeRetry: first.filter((c) => c.valid).length,
                    distinctBeforeRetry: r.distinctValidCount,
                    retryUsed: Boolean(r.retry),
                    retryJsonParsed: r.retry ? r.retry.evaluation.jsonExtracted : null,
                    retryRawCandidates: r.retry ? r.retry.evaluation.candidateCount : null,
                    validAfterRetry: validAll.length,
                    distinctValidAfterRetry: distinctAll.length,
                    equivalentValidDropped: validAll.length - distinctAll.length,
                    usableExactlyThree: distinctAll.length >= 3,
                    unknownCardErrors: all.filter((c) => c.issues.includes('UNKNOWN_CARD_TYPE')).length,
                    illegalConnectionErrors: all.filter((c) => c.issues.includes('ILLEGAL_CONNECTION')).length,
                    requirementErrors: all.filter((c) => c.issues.some((i) => ['INPUT_REQUIREMENT_UNMET', 'MISSING_UPSTREAM', 'MISSING_INPUT', 'UNREACHABLE_NODE'].includes(i))).length,
                    attempt1WallMs: r.call.wallMs,
                    retryWallMs: r.retry ? r.retry.call.wallMs : null,
                    totalPlanningMs: r.call.wallMs + (r.retry ? r.retry.call.wallMs : 0),
                    attempt1: { promptEvalCount: r.call.promptEvalCount, evalCount: r.call.evalCount, totalDurationMs: r.call.totalDurationMs, doneReason: r.call.doneReason, thinkingChars: r.call.thinkingChars },
                    retry: r.retry
                        ? { promptEvalCount: r.retry.call.promptEvalCount, evalCount: r.retry.call.evalCount, totalDurationMs: r.retry.call.totalDurationMs, doneReason: r.retry.call.doneReason, thinkingChars: r.retry.call.thinkingChars }
                        : null,
                };
            }),
            ignoredFieldCount: main.reduce((s, r) => s + r.evaluation.candidates.reduce((t, c) => t + c.ignoredFields.length, 0), 0),
            control: runs
                .filter((r) => r.phase === 'control')
                .map((r) => ({ id: r.id, jsonDirect: r.evaluation.jsonDirect, jsonExtracted: r.evaluation.jsonExtracted, shapeOk: r.evaluation.shapeOkCount, distinctValid: r.distinctValidCount, wallMs: r.call.wallMs })),
        };

        const file = path.join(
            RESULTS_DIR,
            `p60-m1-014-${MODEL.replace(/[^a-z0-9.-]/gi, '_')}-${PROMPT_VARIANT}-${PLAN}-${Date.now()}.json`
        );
        fs.writeFileSync(file, JSON.stringify({ summary, systemPrompt, runs }, null, 2));
        // eslint-disable-next-line no-console
        console.log(`P60-M1-014 SUMMARY ${JSON.stringify(summary, null, 2)}\nRaw results: ${file}`);

        expect(summary.catalogVersion).toMatch(/^pcat-/);
        expect(main.length).toBeGreaterThan(0);
    });
});

// =============================================================================================
// P60-M1-016 — Intent-selection feasibility (Revision 7)
// =============================================================================================
// The model receives only the catalog's analysis capabilities and returns three intent profiles
// (focused / balanced / comprehensive), each naming analysis capability IDs. It is never shown
// edges, requirements, templates or a graph schema. The evaluator below is TEMPORARY spike code
// written against the planned P60-M1-015 contract; it is not production parsing.

const INTENT_TIERS = ['focused', 'balanced', 'comprehensive'];
const MAX_ANALYSIS_PER_OPTION = 6;
const GRAPH_OR_CONFIG_FIELDS = ['nodes', 'edges', 'connections', 'prerequisites', 'inputs', 'config', 'id', 'x', 'y', 'position'];

/**
 * Relevance rubric, fixed before any live run. A measurement aid, not a product rule.
 * The focused profile is "relevant" when it contains every required group, where a group is
 * satisfied by any one of its capabilities.
 */
const RELEVANCE_RUBRIC: Record<string, { description: string; requiredGroups: CardType[][] }> = {
    G1: {
        description: 'System Visualization plus at least one authorization-related analysis',
        requiredGroups: [
            ['VISUALIZATION'],
            ['FORMAL_VERIFY', 'FORMAL_VIZ', 'SCENARIO_GENERATE', 'VERIFICATION_COMPARISON', 'AEGIS', 'PROMPT_GENERATE', 'TEST_GENERATE', 'TEST_EXECUTOR'],
        ],
    },
    G2: { description: 'System Visualization', requiredGroups: [['VISUALIZATION']] },
    G3: {
        description: 'Authorization test generation/execution',
        requiredGroups: [['SCENARIO_GENERATE', 'PROMPT_GENERATE', 'TEST_GENERATE', 'TEST_EXECUTOR']],
    },
    G4: {
        description: 'A risk or security analysis',
        requiredGroups: [['AEGIS', 'FORMAL_VERIFY', 'FORMAL_VIZ', 'VERIFICATION_COMPARISON']],
    },
    G5: {
        description: 'A cross-version comparison (Policy Drift or Change Impact)',
        requiredGroups: [['SECURITY_REGRESSION', 'CHANGE_IMPACT']],
    },
};

/**
 * v1: first measured prompt. v2: the single bounded tuning iteration allowed by Decision B. It
 * targets the causes observed in v1 (misspelled IDs, focused options covering only part of a
 * compound goal, version-comparison capabilities chosen for single-version goals). It uses only
 * catalog data (each capability's category); the catalog itself is unchanged.
 */
export const buildIntentSystemPrompt = (catalog: PipelineCapabilityCatalog, variant: string = 'v1'): string => {
    const capabilities = catalog.cards
        .filter((c) => c.isAnalysis)
        .map((c) =>
            variant === 'v2'
                ? `- ${c.cardType} ("${c.title}", category: ${c.category}): ${c.purpose} Produces: ${c.outcome}`
                : `- ${c.cardType} ("${c.title}"): ${c.purpose} Produces: ${c.outcome}`
        );
    const versionCategories = Array.from(
        new Set(catalog.cards.filter((c) => c.isAnalysis && c.category === 'Version Control').map((c) => c.category))
    );
    const v2Rules =
        variant === 'v2'
            ? [
                  'Copy capability IDs exactly, character for character, from the list above.',
                  'The focused option must cover every part of the goal: if the goal asks for two things, include a capability for each.',
                  ...versionCategories.map(
                      (category) =>
                          `Capabilities in the "${category}" category compare two versions or snapshots of a system; ` +
                          'choose them only when the goal is about versions, snapshots, or changes.'
                  ),
                  'Keep each title under 60 characters.',
              ]
            : [];
    return [
        'You help users of AridNova, a microservice analysis toolkit, choose which analyses to run.',
        'Respond with ONE JSON object and nothing else.',
        '',
        'ANALYSIS CAPABILITIES (use these IDs exactly):',
        ...capabilities,
        '',
        "Return EXACTLY THREE options for the user's goal, one for each tier:",
        '- "focused": the fewest capabilities that directly serve the goal;',
        '- "balanced": the focused capabilities plus the most useful related analysis;',
        '- "comprehensive": a broader set of related analyses.',
        'Each option must use a different set of capabilities.',
        `Use at most ${MAX_ANALYSIS_PER_OPTION} capabilities per option.`,
        'List analysis capability IDs only. Do NOT list data sources, inputs, intermediate or prerequisite steps, ' +
            'nodes, edges, connections, configuration, repositories, IDs or positions. AridNova adds all wiring and ' +
            'prerequisites automatically.',
        ...v2Rules,
        '',
        'OUTPUT SCHEMA:',
        '{"version":1,"options":[{"tier":"focused","title":"short title","rationale":"one sentence: why this fits the goal",' +
            '"analysisCardTypes":["CAPABILITY_ID"]}]}',
        'If AridNova cannot serve the goal at all, return {"version":1,"options":[],"unsupportedReason":"..."}.',
    ].join('\n');
};

interface IntentOptionEvaluation {
    index: number;
    tier: string | null;
    title: string | null;
    rationale: string | null;
    rawIds: string[];
    analysisIds: string[]; // known analysis IDs, de-duplicated, catalog order
    unknownIds: string[];
    nonAnalysisIds: string[];
    graphOrConfigFields: string[];
    issues: string[]; // strict option issues
    strictValid: boolean;
    tolerantValid: boolean; // non-analysis known IDs dropped (planned P60-M1-015 policy)
}

interface IntentResponseEvaluation {
    jsonParsed: boolean;
    optionsArray: boolean;
    version: unknown;
    optionCount: number;
    unsupportedReason: string | null;
    options: IntentOptionEvaluation[];
    setIssues: string[];
    strictPass: boolean;
    tolerantPass: boolean;
    emittedIds: number;
    knownAnalysisIds: number;
}

const evaluateIntentResponse = (content: string, catalog: PipelineCapabilityCatalog): IntentResponseEvaluation => {
    const order = catalog.cards.map((c) => c.cardType as string);
    const analysis = new Set(catalog.cards.filter((c) => c.isAnalysis).map((c) => c.cardType as string));
    const known = new Set(order);
    const extracted = extractJsonObject(content);
    const root = extracted?.parsed as any;
    const result: IntentResponseEvaluation = {
        jsonParsed: Boolean(extracted),
        optionsArray: Boolean(root && Array.isArray(root.options)),
        version: root?.version,
        optionCount: root && Array.isArray(root.options) ? root.options.length : 0,
        unsupportedReason: typeof root?.unsupportedReason === 'string' ? root.unsupportedReason : null,
        options: [],
        setIssues: [],
        strictPass: false,
        tolerantPass: false,
        emittedIds: 0,
        knownAnalysisIds: 0,
    };
    if (!result.optionsArray) return result;

    result.options = (root.options as unknown[]).map((raw, index): IntentOptionEvaluation => {
        const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
        const issues: string[] = [];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) issues.push('NOT_OBJECT');
        const tier = typeof o.tier === 'string' ? o.tier : null;
        if (!tier || !INTENT_TIERS.includes(tier)) issues.push('BAD_TIER');
        const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : null;
        if (!title || title.length > 60) issues.push('BAD_TITLE');
        const rationale = typeof o.rationale === 'string' ? o.rationale.trim() : null;
        if (rationale !== null && rationale.length > 400) issues.push('RATIONALE_TOO_LONG');
        const rawIds = Array.isArray(o.analysisCardTypes) ? (o.analysisCardTypes as unknown[]).map(String) : [];
        if (!Array.isArray(o.analysisCardTypes)) issues.push('NO_CAPABILITY_ARRAY');
        const unknownIds = rawIds.filter((id) => !known.has(id));
        const nonAnalysisIds = rawIds.filter((id) => known.has(id) && !analysis.has(id));
        const analysisIds = order.filter((id) => analysis.has(id) && rawIds.includes(id));
        if (unknownIds.length) issues.push('UNKNOWN_CAPABILITY');
        if (nonAnalysisIds.length) issues.push('NON_ANALYSIS_CAPABILITY');
        if (analysisIds.length === 0) issues.push('EMPTY_SET');
        if (analysisIds.length > MAX_ANALYSIS_PER_OPTION) issues.push('TOO_MANY_CAPABILITIES');
        const graphOrConfigFields = Object.keys(o).filter((k) => GRAPH_OR_CONFIG_FIELDS.includes(k));
        const tolerantIssues = issues.filter((i) => i !== 'NON_ANALYSIS_CAPABILITY');
        return {
            index,
            tier,
            title,
            rationale,
            rawIds,
            analysisIds,
            unknownIds,
            nonAnalysisIds,
            graphOrConfigFields,
            issues,
            strictValid: issues.length === 0,
            tolerantValid: tolerantIssues.length === 0,
        };
    });
    result.emittedIds = result.options.reduce((s, o) => s + o.rawIds.length, 0);
    result.knownAnalysisIds = result.options.reduce((s, o) => s + o.rawIds.filter((id) => analysis.has(id)).length, 0);

    if (result.optionCount !== 3) result.setIssues.push('WRONG_OPTION_COUNT');
    if (result.version !== 1) result.setIssues.push('BAD_VERSION');
    const tiers = result.options.map((o) => o.tier);
    INTENT_TIERS.forEach((t) => {
        const n = tiers.filter((x) => x === t).length;
        if (n === 0) result.setIssues.push('MISSING_TIER');
        if (n > 1) result.setIssues.push('DUPLICATE_TIER');
    });
    const sets = result.options.map((o) => o.analysisIds.join('+'));
    if (new Set(sets).size !== sets.length) result.setIssues.push('DUPLICATE_SET');
    result.setIssues = Array.from(new Set(result.setIssues));

    const setOk = result.setIssues.length === 0;
    result.strictPass = result.jsonParsed && setOk && result.options.every((o) => o.strictValid);
    result.tolerantPass = result.jsonParsed && setOk && result.options.every((o) => o.tolerantValid);
    return result;
};

const isRelevant = (goal: string, ids: string[]): boolean =>
    RELEVANCE_RUBRIC[goal].requiredGroups.every((group) => group.some((id) => ids.includes(id)));

interface IntentRunRecord {
    id: string;
    goal: string;
    rep: number;
    call: OllamaChatResult;
    evaluation: IntentResponseEvaluation;
    retry?: { call: OllamaChatResult; evaluation: IntentResponseEvaluation };
    passFirst: boolean;
    passAfterRetry: boolean;
    passVia: 'first' | 'retry' | 'merged' | null;
    focusedIds: string[] | null;
    focusedRelevant: boolean | null;
    anyOptionRelevant: boolean;
    totalPlanningMs: number;
}

describeIntentLive('P60-M1-016 live intent-selection feasibility / P60-M1-011 release qualification', () => {
    jest.setTimeout(2 * 60 * 60 * 1000);

    it('measures intent selection (P60-M1-016) or qualifies the finished planning path (P60-M1-011, LIVE_LLM_TASK=release)', async () => {
        if (TASK === 'release') {
            // eslint-disable-next-line no-console
            await runReleaseQualification({ baseUrl: CHATBOT_BASE_URL, goals: GOALS, reps: 5, resultsDir: RESULTS_DIR, log: (line) => console.log(line) });
            return;
        }
        const catalog = buildPipelineCapabilityCatalog();
        const systemPrompt = buildIntentSystemPrompt(catalog, PROMPT_VARIANT);
        const version = await request('GET', '/api/version');
        const ollamaVersion = JSON.parse(version.text).version;
        const userMessage = (goal: string) => `Analysis goal: "${goal}"\nReturn the JSON object now.`;

        // Warm-up (loads the model; not counted).
        const warmup = await chat([{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage(GOALS.G2) }], true);

        const plan = [
            { goal: 'G1', reps: 5 },
            { goal: 'G2', reps: 3 },
            { goal: 'G3', reps: 3 },
            { goal: 'G4', reps: 3 },
            { goal: 'G5', reps: 3 },
        ];
        const runs: IntentRunRecord[] = [];
        for (const step of plan) {
            for (let rep = 1; rep <= step.reps; rep += 1) {
                const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage(GOALS[step.goal]) }];
                // eslint-disable-next-line no-await-in-loop
                const call = await chat(messages, true);
                const evaluation = evaluateIntentResponse(call.content, catalog);
                const record: IntentRunRecord = {
                    id: `intent-${step.goal}-${rep}`,
                    goal: step.goal,
                    rep,
                    call,
                    evaluation,
                    passFirst: evaluation.strictPass,
                    passAfterRetry: evaluation.strictPass,
                    passVia: evaluation.strictPass ? 'first' : null,
                    focusedIds: null,
                    focusedRelevant: null,
                    anyOptionRelevant: false,
                    totalPlanningMs: call.wallMs,
                };

                let finalOptions = evaluation.strictPass ? evaluation.options : [];
                if (!evaluation.strictPass) {
                    // One bounded retry for malformed / unknown / duplicate intents (planned P60-M1-006 rule).
                    const accepted = evaluation.options.filter((o) => o.strictValid);
                    const feedback = Array.from(
                        new Set([
                            ...(evaluation.jsonParsed ? [] : ['INVALID_JSON']),
                            ...(evaluation.optionsArray ? [] : ['NO_OPTIONS_ARRAY']),
                            ...evaluation.setIssues,
                            ...evaluation.options.flatMap((o) => o.issues),
                        ])
                    );
                    const unknown = Array.from(new Set(evaluation.options.flatMap((o) => [...o.unknownIds, ...o.nonAnalysisIds])));
                    const retryPrompt =
                        `Your previous answer was not usable. Problems: ${feedback.join(', ') || 'unknown'}.` +
                        (unknown.length ? ` These IDs are not analysis capabilities and must not be used: ${unknown.join(', ')}.` : '') +
                        (accepted.length ? ` Valid sets you already gave: ${accepted.map((o) => `[${o.analysisIds.join(', ')}]`).join(' ')}.` : '') +
                        ' Return the complete JSON object again with exactly three options (focused, balanced, comprehensive), ' +
                        'each with a different set of capability IDs from the list.';
                    // eslint-disable-next-line no-await-in-loop
                    const retryCall = await chat([...messages, { role: 'assistant', content: call.content }, { role: 'user', content: retryPrompt }], true);
                    const retryEval = evaluateIntentResponse(retryCall.content, catalog);
                    record.retry = { call: retryCall, evaluation: retryEval };
                    record.totalPlanningMs += retryCall.wallMs;
                    if (retryEval.strictPass) {
                        record.passAfterRetry = true;
                        record.passVia = 'retry';
                        finalOptions = retryEval.options;
                    } else {
                        // Merge rule (planned P60-M1-004): distinct strictly valid sets from both attempts;
                        // tiers may be relabelled by code, so only distinctness and count matter here.
                        const merged: IntentOptionEvaluation[] = [];
                        [...accepted, ...retryEval.options.filter((o) => o.strictValid)].forEach((o) => {
                            if (!merged.some((m) => m.analysisIds.join('+') === o.analysisIds.join('+'))) merged.push(o);
                        });
                        if (merged.length >= 3) {
                            record.passAfterRetry = true;
                            record.passVia = 'merged';
                            finalOptions = merged.slice(0, 3);
                        }
                    }
                }

                const focused = finalOptions.find((o) => o.tier === 'focused') ?? finalOptions[0];
                record.focusedIds = focused ? focused.analysisIds : null;
                record.focusedRelevant = focused ? isRelevant(step.goal, focused.analysisIds) : null;
                record.anyOptionRelevant = finalOptions.some((o) => isRelevant(step.goal, o.analysisIds));
                runs.push(record);

                // eslint-disable-next-line no-console
                console.log(
                    `[${record.id}] wall=${call.wallMs}ms json=${evaluation.jsonParsed} options=${evaluation.optionCount} ` +
                        `strict=${evaluation.strictPass} tolerant=${evaluation.tolerantPass} setIssues=${JSON.stringify(evaluation.setIssues)} ` +
                        `opts=${JSON.stringify(evaluation.options.map((o) => ({ t: o.tier, ids: o.rawIds, iss: o.issues })))} ` +
                        `promptTok=${call.promptEvalCount} outTok=${call.evalCount} done=${call.doneReason}${call.error ? ` ERROR=${call.error}` : ''}` +
                        (record.retry
                            ? ` | retry wall=${record.retry.call.wallMs}ms strict=${record.retry.evaluation.strictPass} ` +
                              `setIssues=${JSON.stringify(record.retry.evaluation.setIssues)} ` +
                              `opts=${JSON.stringify(record.retry.evaluation.options.map((o) => ({ t: o.tier, ids: o.rawIds, iss: o.issues })))}`
                            : '') +
                        ` => pass=${record.passAfterRetry} via=${record.passVia} focused=${JSON.stringify(record.focusedIds)} relevant=${record.focusedRelevant}`
                );
            }
        }

        const allCalls = [...runs.map((r) => r.call), ...runs.flatMap((r) => (r.retry ? [r.retry.call] : []))];
        const allEvals = [...runs.map((r) => r.evaluation), ...runs.flatMap((r) => (r.retry ? [r.retry.evaluation] : []))];
        const wall = allCalls.map((c) => c.wallMs);
        const totals = runs.map((r) => r.totalPlanningMs);
        const countBy = (items: string[]) =>
            Object.entries(items.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item]: (acc[item] || 0) + 1 }), {}))
                .sort((a, b) => b[1] - a[1])
                .map(([item, count]) => `${item} x${count}`);
        const emitted = runs.reduce((s, r) => s + r.evaluation.emittedIds, 0);
        const knownAnalysis = runs.reduce((s, r) => s + r.evaluation.knownAnalysisIds, 0);

        const summary = {
            task: 'intent',
            catalogVersion: catalog.catalogVersion,
            analysisCapabilities: catalog.cards.filter((c) => c.isAnalysis).length,
            ollamaBaseUrl: BASE_URL,
            ollamaVersion,
            model: MODEL,
            settings: { jsonMode: true, numCtx: NUM_CTX, numPredict: NUM_PREDICT, temperature: TEMPERATURE, promptVariant: PROMPT_VARIANT },
            systemPromptChars: systemPrompt.length,
            relevanceRubric: Object.fromEntries(Object.entries(RELEVANCE_RUBRIC).map(([g, r]) => [g, r.description])),
            warmup: { wallMs: warmup.wallMs, loadDurationMs: warmup.loadDurationMs, promptEvalCount: warmup.promptEvalCount },
            runs: runs.length,
            structuredOutputRate: runs.filter((r) => r.evaluation.jsonParsed && r.evaluation.optionsArray && r.evaluation.optionCount === 3).length / runs.length,
            knownAnalysisIdRate: emitted ? knownAnalysis / emitted : null,
            strictFirstAttemptRate: runs.filter((r) => r.passFirst).length / runs.length,
            tolerantFirstAttemptRate: runs.filter((r) => r.evaluation.tolerantPass).length / runs.length,
            passAfterRetryRate: runs.filter((r) => r.passAfterRetry).length / runs.length,
            g1PassAfterRetry: `${runs.filter((r) => r.goal === 'G1' && r.passAfterRetry).length}/${runs.filter((r) => r.goal === 'G1').length}`,
            focusedRelevanceRate: runs.filter((r) => r.focusedRelevant).length / runs.length,
            anyOptionRelevanceRate: runs.filter((r) => r.anyOptionRelevant).length / runs.length,
            perGoal: Object.keys(GOALS).map((g) => {
                const gr = runs.filter((r) => r.goal === g);
                return {
                    goal: g,
                    runs: gr.length,
                    passFirst: gr.filter((r) => r.passFirst).length,
                    passAfterRetry: gr.filter((r) => r.passAfterRetry).length,
                    focusedRelevant: gr.filter((r) => r.focusedRelevant).length,
                };
            }),
            retriesUsed: runs.filter((r) => r.retry).length,
            unknownIds: countBy(allEvals.flatMap((e) => e.options.flatMap((o) => o.unknownIds))),
            nonAnalysisIds: countBy(allEvals.flatMap((e) => e.options.flatMap((o) => o.nonAnalysisIds))),
            optionIssues: countBy(allEvals.flatMap((e) => e.options.flatMap((o) => o.issues))),
            setIssues: countBy(allEvals.flatMap((e) => e.setIssues)),
            graphOrConfigFieldsEmitted: countBy(allEvals.flatMap((e) => e.options.flatMap((o) => o.graphOrConfigFields))),
            perCallWallMs: { n: wall.length, p50: percentile(wall, 50), p95: percentile(wall, 95), max: wall.length ? Math.max(...wall) : null },
            totalPlanningMs: { n: totals.length, p50: percentile(totals, 50), p95: percentile(totals, 95), max: Math.max(...totals) },
            promptTokensMax: Math.max(...allCalls.map((c) => c.promptEvalCount ?? 0)),
            outputTokensMax: Math.max(...allCalls.map((c) => c.evalCount ?? 0)),
            truncatedByLength: allCalls.filter((c) => c.doneReason === 'length').length,
            callErrors: allCalls.filter((c) => c.error).map((c) => c.error),
        };

        const file = path.join(RESULTS_DIR, `p60-m1-016-intent-${MODEL.replace(/[^a-z0-9.-]/gi, '_')}-${PROMPT_VARIANT}-${Date.now()}.json`);
        fs.writeFileSync(file, JSON.stringify({ summary, systemPrompt, runs }, null, 2));
        // eslint-disable-next-line no-console
        console.log(`P60-M1-016 SUMMARY ${JSON.stringify(summary, null, 2)}\nRaw results: ${file}`);

        expect(summary.catalogVersion).toMatch(/^pcat-/);
        expect(runs.length).toBe(17);
    });
});

// Keeps the file a valid test suite when the live run is skipped.
describe('P60-M1-016 intent harness (offline)', () => {
    it('builds the intent prompt from analysis capabilities only, with no graph structure', () => {
        const catalog = buildPipelineCapabilityCatalog();
        const prompt = buildIntentSystemPrompt(catalog);
        const analysisIds = catalog.cards.filter((c) => c.isAnalysis).map((c) => c.cardType);
        const otherIds = catalog.cards.filter((c) => !c.isAnalysis).map((c) => c.cardType);
        expect(analysisIds.filter((id) => !prompt.includes(id))).toEqual([]);
        expect(otherIds.filter((id) => prompt.includes(id))).toEqual([]);
        expect(prompt).not.toContain('ALLOWED CONNECTIONS');
        expect(prompt).not.toContain('"edges"');
        expect(prompt).not.toContain('"nodes"');
        expect(prompt).toContain('EXACTLY THREE');
    });

    it('evaluates intent responses strictly against the catalog', () => {
        const catalog = buildPipelineCapabilityCatalog();
        const good = JSON.stringify({
            version: 1,
            options: [
                { tier: 'focused', title: 'A', rationale: 'r', analysisCardTypes: ['VISUALIZATION'] },
                { tier: 'balanced', title: 'B', rationale: 'r', analysisCardTypes: ['VISUALIZATION', 'FORMAL_VERIFY'] },
                { tier: 'comprehensive', title: 'C', rationale: 'r', analysisCardTypes: ['VISUALIZATION', 'FORMAL_VERIFY', 'AEGIS'] },
            ],
        });
        expect(evaluateIntentResponse(good, catalog).strictPass).toBe(true);

        const bad = JSON.parse(good);
        bad.options[0].analysisCardTypes = ['SYSTEM_INPUT', 'VISUALIZATION'];
        bad.options[1].analysisCardTypes = ['VECTOR_GENERATE'];
        const evaluated = evaluateIntentResponse(JSON.stringify(bad), catalog);
        expect(evaluated.strictPass).toBe(false);
        expect(evaluated.options[0].nonAnalysisIds).toEqual(['SYSTEM_INPUT']);
        expect(evaluated.options[0].tolerantValid).toBe(true);
        expect(evaluated.options[1].issues).toEqual(expect.arrayContaining(['UNKNOWN_CAPABILITY', 'EMPTY_SET']));

        const duplicate = JSON.parse(good);
        duplicate.options[2].analysisCardTypes = ['FORMAL_VERIFY', 'VISUALIZATION'];
        expect(evaluateIntentResponse(JSON.stringify(duplicate), catalog).setIssues).toContain('DUPLICATE_SET');
    });
});

// Keeps the file a valid test suite when the live run is skipped.
describe('P60-M1-014 live harness (offline)', () => {
    it('builds its prompt from the real catalog without network access', () => {
        const catalog = buildPipelineCapabilityCatalog();
        const prompt = buildSystemPrompt(catalog, 'v1');
        catalog.cards.forEach((card) => expect(prompt).toContain(card.cardType));
        expect(prompt).toContain('EXACTLY THREE');
        EXAMPLE_TEMPLATE_IDS.forEach((id) => {
            const example = catalog.examples.find((e) => e.templateId === id);
            expect(example).toBeDefined();
            expect(prompt).toContain(JSON.stringify(example?.nodes));
        });
    });
});
