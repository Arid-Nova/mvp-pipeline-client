import type { Connection, NodeData, TestExecutionSummary } from "./models";
import type { ChatbotContext } from "../../services/types";
import intentModelJson from "./intent/intent_ds_models.json";
import { deriveWorkflowEvidence } from "./workflowEvidence";
import { AridnovaIntentReasoner, NormalizedGraph } from "./intent/intentReasoner";

type BranchContextScope = Pick<ChatbotContext,
    "systemName" | "irId" | "indexId" | "commitId" | "selectedService" | "selectedEndpoint" | "workflowEvidence" | "irPayload">;

interface CompletedBranch {
    nodes: NodeData[];
    distances: Map<string, number>;
}

export interface GuidedQuestionChoice {
    id: string;
    label: string;
    focus: string;
    scope?: Pick<ChatbotContext,
        "systemName" | "irId" | "indexId" | "commitId" | "selectedService" | "selectedEndpoint" | "workflowEvidence" | "irPayload">;
}

export interface GuidedQuestionSuggestion {
    intentId: string;
    contextKey?: string;
    title: string;
    clarifier: string;
    choices: GuidedQuestionChoice[];
    buildQuestion: (choice: GuidedQuestionChoice) => string;
}

interface QuestionDefinition {
    title: string;
    clarifier: string;
    question: string;
}

const QUESTION_DEFINITIONS: Record<string, QuestionDefinition> = {
    architecture_reconstruction: {
        title: "Explain the system architecture",
        clarifier: "Would a system-wide overview or a focused service view be more useful?",
        question: "Explain the architecture represented by the active IR and cite the supporting evidence.",
    },
    snapshot_import: {
        title: "Inspect the imported snapshot",
        clarifier: "What part of this snapshot should I focus on?",
        question: "Summarize the selected snapshot using the available architecture evidence.",
    },
    component_extraction: {
        title: "Review extracted components",
        clarifier: "Would you prefer an overview or a service-specific view?",
        question: "Explain the extracted components and their relationship to the selected system.",
    },
    architecture_visualization: {
        title: "Interpret the architecture view",
        clarifier: "Should I focus on the whole system or a specific service?",
        question: "Interpret the architecture visualization using the available evidence.",
    },
    formal_policy_verification: {
        title: "Understand the verification result",
        clarifier: "What would you like to understand first?",
        question: "Explain the formal verification result and its supporting findings.",
    },
    formal_results_visualization: {
        title: "Review formal findings",
        clarifier: "Should I focus on the overall result or a specific service?",
        question: "Summarize the formal verification findings shown in the result view.",
    },
    latent_risk_assessment: {
        title: "Prioritize security risks",
        clarifier: "Would you like a system-wide summary or a service-focused explanation?",
        question: "Explain the highest-priority security risks and why they matter.",
    },
    change_impact_analysis: {
        title: "Understand change impact",
        clarifier: "Should I summarize all impact or focus on one affected service?",
        question: "Summarize the change impact and the evidence supporting it.",
    },
    policy_drift_comparison: {
        title: "Compare policy drift",
        clarifier: "Which comparison view is most useful?",
        question: "Compare the policy verification results and explain the drift findings.",
    },
    security_scenario_generation: {
        title: "Review generated security scenarios",
        clarifier: "Would you like a scenario overview or a service-focused review?",
        question: "Summarize the generated security scenarios and their source evidence.",
    },
    verification_scenario_comparison: {
        title: "Compare verification and scenarios",
        clarifier: "Should I focus on agreement, inconsistencies, or coverage gaps?",
        question: "Compare the formal findings with the generated scenarios.",
    },
    llm_prompt_preparation: {
        title: "Review the prepared analysis prompt",
        clarifier: "Would you like the prompt structure or its scenario coverage explained?",
        question: "Explain how the prepared prompt represents the generated scenarios.",
    },
    test_suite_generation: {
        title: "Review the generated test suite",
        clarifier: "Should I focus on coverage or the most important test cases?",
        question: "Summarize the generated test suite and its coverage of the selected scenarios.",
    },
    test_execution: {
        title: "Understand test execution results",
        clarifier: "Would a run summary or a failure-focused review help more?",
        question: "Summarize the test execution results and explain any failures.",
    },
    impact_guided_regression_testing: {
        title: "Review impact-guided regression tests",
        clarifier: "Should I focus on impacted services, failures, or coverage?",
        question: "Explain how the executed regression tests cover the identified change impact.",
    },
    parallel_integrated_assurance: {
        title: "Compare the analysis results",
        clarifier: "Would you like agreements, disagreements, or an overall assurance summary?",
        question: "Compare the completed analysis branches and identify their agreements and gaps.",
    },
};

const COMPLETED_OUTPUTS: Record<string, Array<{ type: string; key?: string }>> = {
    architecture_reconstruction: [{ type: "IR_HOLDER", key: "payload.irJson" }],
    snapshot_import: [{ type: "IR_HOLDER", key: "payload.irJson" }, { type: "UPLOAD_IR", key: "payload.irJson" }],
    component_extraction: [{ type: "COMPONENT_HOLDER", key: "componentPayload" }],
    architecture_visualization: [{ type: "VISUALIZATION" }],
    formal_policy_verification: [{ type: "FORMAL_VERIFY", key: "verificationResult" }],
    formal_results_visualization: [{ type: "FORMAL_VIZ" }],
    latent_risk_assessment: [{ type: "AEGIS", key: "payload.aegisResult" }, { type: "AEGIS", key: "securityReport" }],
    change_impact_analysis: [{ type: "CHANGE_IMPACT", key: "changeImpactPayload" }],
    policy_drift_comparison: [{ type: "SECURITY_REGRESSION", key: "regressionPayload" }],
    security_scenario_generation: [{ type: "SCENARIO_GENERATE", key: "scenarioPayload" }],
    verification_scenario_comparison: [{ type: "VERIFICATION_COMPARISON", key: "comparisonResult" }],
    llm_prompt_preparation: [{ type: "PROMPT_GENERATE", key: "promptPayload" }],
    test_suite_generation: [{ type: "TEST_GENERATE", key: "testSuitePayload" }],
    test_execution: [],
    impact_guided_regression_testing: [
        { type: "CHANGE_IMPACT", key: "changeImpactPayload" },
        { type: "SCENARIO_GENERATE", key: "scenarioPayload" },
        { type: "TEST_EXECUTOR", key: "tests" },
    ],
};

const ASSURANCE_BRANCHES = ["FORMAL_VERIFY", "AEGIS", "CHANGE_IMPACT", "VISUALIZATION"];
const nodeDataIdentity = new WeakMap<object, number>();
let nextNodeDataIdentity = 1;

const reasoner = AridnovaIntentReasoner.fromJson(JSON.stringify(intentModelJson), {
    configurationMatcher: matchConfigurationRequirements,
    highConflictThreshold: 0.8,
});

export function deriveWorkflowQuestionSuggestions(
    nodes: NodeData[],
    connections: Connection[],
): GuidedQuestionSuggestion[] {
    if (!nodes.length) return [];

    const result = reasoner.evaluate({
        nodes: nodes.map(toReasonerNode),
        edges: connections.map(({ source, target }) => ({ source, target })),
    });
    if (!result.graphValid) return [];

    const estimates = result.estimates
        .filter((estimate) => estimate.status === "scored" && Boolean(QUESTION_DEFINITIONS[estimate.intentId]))
        .filter((estimate) => isResultReady(estimate.intentId, nodes))
        .sort((left, right) =>
            (right.pignisticProbability?.present ?? 0) - (left.pignisticProbability?.present ?? 0)
            || left.intentId.localeCompare(right.intentId))
        .slice(0, 3);

    const suggestions: GuidedQuestionSuggestion[] = [];
    for (const estimate of estimates) {
        const branch = buildCompletedBranch(estimate.intentId, nodes, connections);
        if (branch.nodes.length === 0) continue;

        const definition = QUESTION_DEFINITIONS[estimate.intentId];
        const branchScope = buildBranchScope(branch);
        suggestions.push({
            intentId: estimate.intentId,
            contextKey: [
                ...branch.nodes.map((node) => `${node.id}:${objectReferenceToken(node.data)}`),
                branchScope.systemName ?? "",
                branchScope.irId ?? "",
                branchScope.indexId ?? "",
                branchScope.commitId ?? "",
            ].join("|"),
            title: definition.title,
            clarifier: definition.clarifier,
            choices: buildFocusChoices(branch.nodes, branchScope),
            buildQuestion: (choice: GuidedQuestionChoice) =>
                `${definition.question} Focus on ${choice.focus}.`,
        });
    }
    return suggestions;
}

/** Stable key for intent inputs; canvas coordinates are excluded and completed branch data identity is included. */
export function workflowQuestionSuggestionSignature(
    nodes: NodeData[],
    connections: Connection[],
): string {
    const readinessPaths: Array<{ type: string; key: string }> = [];
    Object.keys(COMPLETED_OUTPUTS).forEach((intentId) => {
        COMPLETED_OUTPUTS[intentId].forEach(({ type, key }) => {
            if (!key) return;
            const path = `${type}|${key}`;
            if (!readinessPaths.some((candidate) => `${candidate.type}|${candidate.key}` === path)) {
                readinessPaths.push({ type, key });
            }
        });
    });

    const graphNodes = nodes.map((node) => {
        const data = node.data as unknown as Record<string, unknown>;
        const readiness: Record<string, boolean> = {};
        readinessPaths.forEach(({ type, key }) => {
            if (node.type === type) readiness[key] = hasMaterializedValue(readPath(data, key));
        });
        if (node.type === "TEST_EXECUTOR") {
            readiness.tests = Array.isArray(data.tests) && data.tests.length > 0;
            readiness.testExecutionComplete = isCompletedTestExecutionSummary(data.testExecutionSummary);
        }
        return {
            id: node.id,
            type: node.type,
            completed: node.status === "completed",
            reasonerData: toReasonerNode(node).data,
            readiness,
        };
    }).sort((left, right) => left.id.localeCompare(right.id));

    const graphEdges = connections
        .map(({ source, target }) => `${source}\u0000${target}`)
        .sort();
    const focusChoiceIds = buildFocusChoices(nodes, {}).map((choice) => choice.id);
    const completedBranchNodeIds = new Set<string>();
    Object.keys(QUESTION_DEFINITIONS).forEach((intentId) => {
        if (!isResultReady(intentId, nodes)) return;
        buildCompletedBranch(intentId, nodes, connections).nodes.forEach((node) => completedBranchNodeIds.add(node.id));
    });
    const branchDataReferences = nodes
        .filter((node) => completedBranchNodeIds.has(node.id))
        .map((node) => [node.id, objectReferenceToken(node.data)]);
    return JSON.stringify({ graphNodes, graphEdges, focusChoiceIds, branchDataReferences });
}

function objectReferenceToken(value: object): number {
    const existing = nodeDataIdentity.get(value);
    if (existing !== undefined) return existing;
    const token = nextNodeDataIdentity++;
    nodeDataIdentity.set(value, token);
    return token;
}

function isResultReady(intentId: string, nodes: NodeData[]): boolean {
    if (intentId === "parallel_integrated_assurance") {
        return ASSURANCE_BRANCHES.filter((type) => nodes.some((node) => isCompletedOutput(node, type))).length >= 2;
    }

    if (intentId === "verification_scenario_comparison") {
        return hasCompletedOutput(nodes, "FORMAL_VERIFY", "verificationResult")
            && hasCompletedOutput(nodes, "SCENARIO_GENERATE", "scenarioPayload")
            && hasCompletedOutput(nodes, "VERIFICATION_COMPARISON", "comparisonResult");
    }

    if (intentId === "impact_guided_regression_testing") {
        return COMPLETED_OUTPUTS[intentId]
            .filter(({ type }) => type !== "TEST_EXECUTOR")
            .every(({ type, key }) => hasCompletedOutput(nodes, type, key))
            && hasExecutedTests(nodes);
    }

    if (intentId === "test_execution") {
        return hasExecutedTests(nodes);
    }

    return (COMPLETED_OUTPUTS[intentId] ?? []).some(({ type, key }) => hasCompletedOutput(nodes, type, key));
}

function toReasonerNode(node: NodeData): { id: string; type: string; data: Record<string, unknown> } {
    const data = node.data as unknown as Record<string, unknown>;
    const payload = data.payload as Record<string, unknown> | undefined;
    const irJson = payload?.irJson as Record<string, unknown> | undefined;
    const projectedPayload = irJson?.id ? { irJson: { id: irJson.id } } : undefined;
    const versionReferences = collectNodeVersionReferences(data, payload, irJson);
    return {
        id: node.id,
        type: node.type,
        data: {
            ...(typeof data.irId === "string" ? { irId: data.irId } : {}),
            ...(projectedPayload ? { payload: projectedPayload } : {}),
            ...(versionReferences.length ? { versionReferences } : {}),
        },
    };
}

function collectNodeVersionReferences(
    data: Record<string, unknown>,
    payload?: Record<string, unknown>,
    irJson?: Record<string, unknown>,
): string[] {
    const repositorySnapshot = repositorySnapshotReference(data.repositories)
        ?? repositorySnapshotReference(payload?.metadata);
    if (repositorySnapshot) return [repositorySnapshot];

    const irReference = typeof data.irId === "string" && data.irId.trim()
        ? data.irId.trim()
        : typeof irJson?.id === "string" && irJson.id.trim()
            ? irJson.id.trim()
            : undefined;
    return irReference ? [`ir:${irReference}`] : [];
}

function repositorySnapshotReference(value: unknown): string | undefined {
    if (!Array.isArray(value)) return undefined;
    const repositories = value.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const record = entry as Record<string, unknown>;
        const repository = typeof record.repoUrl === "string"
            ? record.repoUrl
            : typeof record.repositoryURL === "string"
                ? record.repositoryURL
                : "";
        const branch = typeof record.branch === "string"
            ? record.branch
            : typeof record.branchName === "string"
                ? record.branchName
                : "";
        const commit = typeof record.commitId === "string"
            ? record.commitId
            : typeof record.commitID === "string"
                ? record.commitID
                : "";
        return commit.trim() ? [`${repository.trim()}|${branch.trim()}|${commit.trim()}`] : [];
    }).sort();
    if (!repositories.length) return undefined;

    const snapshot = repositories.join(";");
    let hash = 2166136261;
    for (let index = 0; index < snapshot.length; index++) {
        hash = Math.imul(hash ^ snapshot.charCodeAt(index), 16777619);
    }
    return `snapshot:${(hash >>> 0).toString(16)}`;
}

function hasCompletedOutput(nodes: NodeData[], type: string, key?: string): boolean {
    return nodes.some((node) => isCompletedOutput(node, type, key));
}

function isCompletedOutput(node: NodeData, type: string, key?: string): boolean {
    if (node.type !== type || node.status !== "completed") return false;
    if (!key) return true;

    const data = node.data as unknown as Record<string, unknown>;
    return hasMaterializedValue(readPath(data, key));
}

function readPath(source: Record<string, unknown>, path: string): unknown {
    let value: unknown = source;
    for (const segment of path.split(".")) {
        if (!value || typeof value !== "object") return undefined;
        value = (value as Record<string, unknown>)[segment];
    }
    return value;
}

function hasMaterializedValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
}

function hasExecutedTests(nodes: NodeData[]): boolean {
    return nodes.some((node) => {
        if (node.type !== "TEST_EXECUTOR" || node.status !== "completed") return false;
        const data = node.data as unknown as Record<string, unknown>;
        return Array.isArray(data.tests)
            && data.tests.length > 0
            && isCompletedTestExecutionSummary(data.testExecutionSummary);
    });
}

export function isCompletedTestExecutionSummary(value: unknown): value is TestExecutionSummary {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const summary = value as Record<string, unknown>;
    if (summary.completed !== true || typeof summary.totalTests !== "number"
        || !Number.isFinite(summary.totalTests) || summary.totalTests <= 0) {
        return false;
    }
    return ["passedTests", "failedTests", "skippedTests", "errorTests"].every((field) =>
        typeof summary[field] === "number"
        && Number.isFinite(summary[field])
        && (summary[field] as number) >= 0);
}

function completedOutputRoots(intentId: string, nodes: NodeData[]): NodeData[] {
    const roots = new Map<string, NodeData>();
    const addRoots = (type: string, key?: string) => {
        nodes.forEach((node) => {
            const completed = type === "TEST_EXECUTOR"
                ? hasExecutedTests([node])
                : isCompletedOutput(node, type, key);
            if (completed) roots.set(node.id, node);
        });
    };

    if (intentId === "parallel_integrated_assurance") {
        ASSURANCE_BRANCHES.forEach((type) => addRoots(type));
    } else if (intentId === "test_execution") {
        addRoots("TEST_EXECUTOR");
    } else {
        (COMPLETED_OUTPUTS[intentId] ?? []).forEach(({ type, key }) => addRoots(type, key));
    }
    return Array.from(roots.values());
}

function buildCompletedBranch(intentId: string, nodes: NodeData[], connections: Connection[]): CompletedBranch {
    const roots = completedOutputRoots(intentId, nodes);
    const upstreamByTarget = new Map<string, string[]>();
    connections.forEach(({ source, target }) => {
        const upstream = upstreamByTarget.get(target) ?? [];
        upstream.push(source);
        upstreamByTarget.set(target, upstream);
    });

    const distances = new Map<string, number>();
    const queue: string[] = [];
    roots.forEach((root) => {
        if (distances.has(root.id)) return;
        distances.set(root.id, 0);
        queue.push(root.id);
    });
    for (let index = 0; index < queue.length; index++) {
        const nodeId = queue[index];
        const distance = distances.get(nodeId) ?? 0;
        (upstreamByTarget.get(nodeId) ?? []).forEach((sourceId) => {
            if (distances.has(sourceId)) return;
            distances.set(sourceId, distance + 1);
            queue.push(sourceId);
        });
    }

    return {
        nodes: nodes.filter((node) => node.status === "completed" && distances.has(node.id)),
        distances,
    };
}

function buildBranchScope(branch: CompletedBranch): BranchContextScope {
    const irCandidates = branch.nodes.flatMap((node) => {
        const data = node.data as unknown as Record<string, unknown>;
        const payload = data.payload as Record<string, unknown> | undefined;
        const rawIrJson = payload?.irJson;
        if (!rawIrJson || typeof rawIrJson !== "object" || Array.isArray(rawIrJson)) return [];
        const irJson = rawIrJson as Record<string, unknown>;
        if (!hasMaterializedValue(irJson)) return [];
        const metadataEntries = payload?.metadata;
        const metadata = Array.isArray(metadataEntries) && metadataEntries[0] && typeof metadataEntries[0] === "object"
            ? metadataEntries[0] as Record<string, unknown>
            : undefined;
        return [{
            node,
            distance: branch.distances.get(node.id) ?? Number.MAX_SAFE_INTEGER,
            irJson,
            systemName: firstNonEmptyString(data.systemName, payload?.systemName, metadata?.systemName, irJson.systemName),
            irId: firstNonEmptyString(data.irId, irJson.id),
            commitId: firstNonEmptyString(metadata?.commitId, metadata?.commitID, irJson.commitId, irJson.commitID),
        }];
    }).sort((left, right) =>
        left.distance - right.distance
        || irSourcePriority(left.node.type) - irSourcePriority(right.node.type)
        || left.node.id.localeCompare(right.node.id));

    const componentHolder = branch.nodes
        .filter((node) => node.type === "COMPONENT_HOLDER")
        .sort((left, right) =>
            (branch.distances.get(left.id) ?? Number.MAX_SAFE_INTEGER)
            - (branch.distances.get(right.id) ?? Number.MAX_SAFE_INTEGER)
            || left.id.localeCompare(right.id))
        .find((node) => {
            const data = node.data as unknown as Record<string, unknown>;
            const componentPayload = data.componentPayload as Record<string, unknown> | undefined;
            return typeof componentPayload?.id === "string" && componentPayload.id.trim().length > 0;
        });
    const componentData = componentHolder?.data as unknown as Record<string, unknown> | undefined;
    const componentPayload = componentData?.componentPayload as Record<string, unknown> | undefined;
    const selectedIr = irCandidates[0];

    return {
        systemName: selectedIr?.systemName
            ?? firstBranchSystemName(branch.nodes, branch.distances),
        irId: selectedIr?.irId,
        indexId: typeof componentPayload?.id === "string" ? componentPayload.id : undefined,
        commitId: selectedIr?.commitId,
        selectedService: undefined,
        selectedEndpoint: undefined,
        workflowEvidence: deriveWorkflowEvidence(branch.nodes),
        irPayload: selectedIr?.irJson,
    };
}

function firstBranchSystemName(nodes: NodeData[], distances: Map<string, number>): string | undefined {
    return nodes
        .filter((node) => node.type === "SYSTEM_INPUT")
        .sort((left, right) =>
            (distances.get(left.id) ?? Number.MAX_SAFE_INTEGER)
            - (distances.get(right.id) ?? Number.MAX_SAFE_INTEGER)
            || left.id.localeCompare(right.id))
        .map((node) => (node.data as unknown as Record<string, unknown>).systemName)
        .find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
    return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function irSourcePriority(type: string): number {
    if (type === "IR_HOLDER") return 0;
    if (type === "UPLOAD_IR") return 1;
    return 2;
}

function buildFocusChoices(nodes: NodeData[], branchScope: BranchContextScope): GuidedQuestionChoice[] {
    const choices: GuidedQuestionChoice[] = [{
        id: "workflow-overview",
        label: "Overall result",
        focus: "the overall workflow result",
        scope: branchScope,
    }];

    const serviceNames = extractServiceNames(nodes).slice(0, 4);
    serviceNames.forEach((serviceName) => choices.push({
        id: `service:${serviceName}`,
        label: serviceName,
        focus: `service ${serviceName}`,
        scope: { ...branchScope, selectedService: serviceName },
    }));

    const endpoints = extractEndpoints(nodes).slice(0, 3);
    endpoints.forEach(({ serviceName, method, path }) => choices.push({
        id: `endpoint:${serviceName}:${method}:${path}`,
        label: `${method} ${path}`,
        focus: `${method} ${path} in service ${serviceName}`,
        scope: { ...branchScope, selectedService: serviceName, selectedEndpoint: path },
    }));

    return choices;
}

function extractServiceNames(nodes: NodeData[]): string[] {
    const values: string[] = [];
    for (const node of nodes) {
        const data = node.data as unknown as Record<string, unknown>;
        const payload = data.payload as Record<string, unknown> | undefined;
        const irJson = payload?.irJson as Record<string, unknown> | undefined;
        const microservices = irJson?.microservices;
        if (!Array.isArray(microservices)) continue;
        for (const service of microservices) {
            if (service && typeof service === "object") {
                const name = (service as Record<string, unknown>).name;
                if (typeof name === "string" && name.trim() && values.indexOf(name.trim()) < 0) {
                    values.push(name.trim());
                }
            }
        }
    }
    return values.sort((left, right) => left.localeCompare(right));
}

function extractEndpoints(nodes: NodeData[]): Array<{ serviceName: string; method: string; path: string }> {
    const values = new Map<string, { serviceName: string; method: string; path: string }>();
    for (const node of nodes) {
        const data = node.data as unknown as Record<string, unknown>;
        const payload = data.payload as Record<string, unknown> | undefined;
        const irJson = payload?.irJson as Record<string, unknown> | undefined;
        const microservices = irJson?.microservices;
        if (!Array.isArray(microservices)) continue;
        for (const service of microservices) {
            if (!service || typeof service !== "object") continue;
            const serviceRecord = service as Record<string, unknown>;
            const serviceName = typeof serviceRecord.name === "string" ? serviceRecord.name.trim() : "";
            const controllers = serviceRecord.controllers;
            if (!serviceName || !Array.isArray(controllers)) continue;
            for (const controller of controllers) {
                if (!controller || typeof controller !== "object") continue;
                const methods = (controller as Record<string, unknown>).methods;
                if (!Array.isArray(methods)) continue;
                for (const method of methods) {
                    if (!method || typeof method !== "object") continue;
                    const methodRecord = method as Record<string, unknown>;
                    const httpMethod = typeof methodRecord.httpMethod === "string" ? methodRecord.httpMethod.toUpperCase() : "";
                    const path = typeof methodRecord.url === "string" ? methodRecord.url : "";
                    if (httpMethod && path) values.set(`${serviceName}|${httpMethod}|${path}`, { serviceName, method: httpMethod, path });
                }
            }
        }
    }
    const endpoints: Array<{ serviceName: string; method: string; path: string }> = [];
    values.forEach((endpoint) => endpoints.push(endpoint));
    return endpoints.sort((left, right) =>
        left.serviceName.localeCompare(right.serviceName) || left.path.localeCompare(right.path) || left.method.localeCompare(right.method));
}

function matchConfigurationRequirements(
    requirements: string[],
    graph: NormalizedGraph,
): boolean | undefined {
    return requirements.every((requirement) => {
        if (requirement === "two distinct snapshot or version references") {
            return collectVersionReferences(graph).size >= 2;
        }
        return false;
    });
}

function collectVersionReferences(graph: NormalizedGraph): Set<string> {
    const references = new Set<string>();
    for (const node of graph.nodes) {
        const raw = node.raw as Record<string, unknown>;
        const data = raw.data as Record<string, unknown> | undefined;
        if (!data) continue;
        if (Array.isArray(data.versionReferences)) {
            data.versionReferences.forEach((reference) => addVersionReference(references, reference));
            continue;
        }
        addVersionReference(references, data.irId);
        const payload = data.payload as Record<string, unknown> | undefined;
        const irJson = payload?.irJson as Record<string, unknown> | undefined;
        addVersionReference(references, irJson?.id);
    }
    return references;
}

function addVersionReference(target: Set<string>, value: unknown): void {
    if (typeof value === "string" && value.trim()) target.add(value.trim());
}
