import type { ChatbotWorkflowEvidence } from "../../services/types";
import type { CardType, NodeData } from "./models";

const MAX_EVIDENCE_RECORDS = 24;
const MAX_SUMMARY_CHARS = 2200;

const RESULT_PATHS: Partial<Record<CardType, string[]>> = {
    COMPONENT_HOLDER: ["componentPayload"],
    FORMAL_VERIFY: ["verificationResult"],
    AEGIS: ["securityReport", "payload.aegisResult", "payload.securityReport"],
    CHANGE_IMPACT: ["changeImpactPayload"],
    SECURITY_REGRESSION: ["regressionPayload"],
    SCENARIO_GENERATE: ["scenarioPayload"],
    VERIFICATION_COMPARISON: ["comparisonResult"],
    PROMPT_GENERATE: ["promptPayload"],
    TEST_GENERATE: ["testSuitePayload"],
    TEST_EXECUTOR: ["testExecutionSummary"],
    FORMAL_VIZ: ["verificationResult", "regressionPayload"],
};

interface CompactLimits {
    maxDepth: number;
    maxArrayItems: number;
    maxObjectFields: number;
    maxStringChars: number;
}

const NORMAL_LIMITS: CompactLimits = {
    maxDepth: 4,
    maxArrayItems: 8,
    maxObjectFields: 16,
    maxStringChars: 240,
};

const TIGHT_LIMITS: CompactLimits = {
    maxDepth: 3,
    maxArrayItems: 4,
    maxObjectFields: 8,
    maxStringChars: 120,
};

/**
 * Projects completed result cards into bounded evidence summaries. Raw IR, source code, logs,
 * and arbitrary card configuration are intentionally excluded; the backend still receives IR
 * separately so its IR mapper can produce service/endpoint evidence without putting raw IR in
 * the model prompt.
 */
export function deriveWorkflowEvidence(nodes: NodeData[]): ChatbotWorkflowEvidence[] {
    return nodes
        .filter((node) => node.status === "completed")
        .map(toWorkflowEvidence)
        .filter((item): item is ChatbotWorkflowEvidence => item !== null)
        .slice(-MAX_EVIDENCE_RECORDS);
}

function toWorkflowEvidence(node: NodeData): ChatbotWorkflowEvidence | null {
    const paths = RESULT_PATHS[node.type];
    if (!paths?.length) return null;

    const data = node.data as unknown as Record<string, unknown>;
    const selected: Record<string, unknown> = {};
    for (const path of paths) {
        const value = readPath(data, path);
        if (hasMaterializedValue(value)) selected[path.replace(/\./g, "_")] = value;
    }
    if (Object.keys(selected).length === 0) return null;

    let summary = JSON.stringify(compactValue(selected, NORMAL_LIMITS)) ?? "{}";
    if (summary.length > MAX_SUMMARY_CHARS) {
        summary = JSON.stringify(compactValue(selected, TIGHT_LIMITS)) ?? "{}";
    }
    if (summary.length > MAX_SUMMARY_CHARS) return null;

    const targetedServices = data.targetedServices;
    const serviceName = typeof data.serviceName === "string"
        ? data.serviceName
        : Array.isArray(targetedServices) && targetedServices.length === 1 && typeof targetedServices[0] === "string"
            ? targetedServices[0]
            : undefined;

    return {
        cardId: node.id,
        cardType: node.type,
        summary,
        ...(serviceName ? { serviceName } : {}),
    };
}

function readPath(source: Record<string, unknown>, path: string): unknown {
    let value: unknown = source;
    for (const part of path.split(".")) {
        if (!value || typeof value !== "object") return undefined;
        value = (value as Record<string, unknown>)[part];
    }
    return value;
}

function hasMaterializedValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
}

function compactValue(value: unknown, limits: CompactLimits, depth = 0, ancestors = new Set<object>()): unknown {
    if (typeof value === "string") {
        const normalized = value.replace(/\s+/g, " ").trim();
        return normalized.length <= limits.maxStringChars
            ? normalized
            : `${normalized.slice(0, limits.maxStringChars - 14)}… [trimmed]`;
    }
    if (value === null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value !== "object") return String(value);
    if (ancestors.has(value)) return "[circular value omitted]";
    if (depth >= limits.maxDepth) return Array.isArray(value) ? `[array with ${value.length} items]` : "[nested object omitted]";

    const nextAncestors = new Set<object>(ancestors);
    nextAncestors.add(value);
    if (Array.isArray(value)) {
        const items = value.slice(0, limits.maxArrayItems)
            .map((item) => compactValue(item, limits, depth + 1, nextAncestors));
        if (value.length > limits.maxArrayItems) items.push({ omittedItems: value.length - limits.maxArrayItems });
        return items;
    }

    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !/^(?:code|raw|.*(?:source.?code|test.?code|code.?snippet|stack.?trace))$/i.test(key));
    const compacted: Record<string, unknown> = {};
    for (const [key, child] of entries.slice(0, limits.maxObjectFields)) {
        compacted[key] = compactValue(child, limits, depth + 1, nextAncestors);
    }
    if (entries.length > limits.maxObjectFields) {
        compacted.omittedFields = entries.length - limits.maxObjectFields;
    }
    return compacted;
}
