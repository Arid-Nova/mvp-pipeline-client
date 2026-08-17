"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineCoordinator = void 0;
const api_1 = require("./utilities/api");
const utils_1 = require("./utilities/utils");
class PipelineCoordinator {
    nodesMap = new Map();
    connections = [];
    sessionId;
    constructor(sessionId) {
        this.sessionId = sessionId;
    }
    async fetchAndDecompressSession() {
        try {
            console.log(`Fetching session ${this.sessionId}...`);
            const canvasData = await api_1.api.fetchSessionCanvas(this.sessionId);
            this.connections = canvasData.connections || [];
            (canvasData.nodes || []).forEach((node) => {
                this.nodesMap.set(node.id, { ...node, status: 'idle', logs: [] });
            });
            return true;
        }
        catch (error) {
            console.error(`Failed to load session ${this.sessionId}:`, error);
            throw error;
        }
    }
    updateStatus(id, status, log, dataUpdate) {
        const node = this.nodesMap.get(id);
        if (!node)
            return;
        node.status = status;
        if (log)
            node.logs.push(log);
        if (dataUpdate) {
            node.data = { ...node.data, ...dataUpdate };
        }
        this.nodesMap.set(id, node);
        console.log(`[Node: ${node.type}] -> ${status}: ${log}`);
    }
    async execute() {
        await this.fetchAndDecompressSession();
        console.log(`Starting execution for session ${this.sessionId}`);
        try {
            // Find Start Nodes
            const inputNodes = Array.from(this.nodesMap.values()).filter(n => n.type === 'SYSTEM_INPUT' || n.type === 'UPLOAD_IR');
            for (const node of inputNodes) {
                this.updateStatus(node.id, 'running', 'Starting input processing...');
                let payload = null;
                if (node.type === 'SYSTEM_INPUT') {
                    const reposToProcess = node.data.repositories;
                    if (!node.data.systemName || !reposToProcess || reposToProcess.length === 0) {
                        this.updateStatus(node.id, 'failed', 'System Name and Repositories required.');
                        continue;
                    }
                    // Package up the repo details and pass them downstream!
                    payload = {
                        type: 'SYSTEM_PAYLOAD',
                        systemName: node.data.systemName,
                        repositories: reposToProcess
                    };
                    this.updateStatus(node.id, 'completed', 'System source ready.', { payload });
                }
                else if (node.type === 'UPLOAD_IR') {
                    if (!node.data.payload?.irJson) {
                        this.updateStatus(node.id, 'failed', 'No File Uploaded');
                        continue;
                    }
                    // For uploaded files, we default the metadata if not present (handled in Upload IR card)
                    payload = {
                        irJson: node.data.payload.irJson,
                        metadata: node.data.payload.metadata || [{
                                systemName: "Uploaded System",
                                repoUrl: "Local Upload",
                                branch: "master",
                                commitId: "HEAD"
                            }]
                    };
                    this.updateStatus(node.id, 'completed', 'File ready.', { payload });
                }
                // 2. PROPAGATE
                if (payload) {
                    await this.processNextNodes(node.id, payload);
                }
            }
        }
        catch (error) {
            console.log(`An error occured during input handling: `, error);
        }
    }
    async processNextNodes(sourceId, payload) {
        const outgoing = this.connections.filter(c => c.source === sourceId);
        for (const conn of outgoing) {
            const targetNode = this.nodesMap.get(conn.target);
            if (!targetNode)
                continue;
            this.updateStatus(targetNode.id, 'running', 'Receiving data...');
            try {
                if (targetNode.type === 'MULTI_REPO') {
                    if (payload.type !== 'SYSTEM_PAYLOAD')
                        throw new Error("Expected System Source");
                    const input = {
                        systemName: payload.systemName,
                        systemRepositories: payload.repositories.map((repo) => ({
                            repoBranchPair: { repositoryURL: repo.repoUrl, branchName: repo.branch || "master" },
                            commitID: repo.commitId
                        }))
                    };
                    this.updateStatus(targetNode.id, 'running', 'Generating Base IR...');
                    const irResponse = await api_1.api.fetchIR(input);
                    const nextPayload = {
                        irJson: irResponse.data,
                        systemName: payload.systemName,
                        metadata: payload.repositories
                    };
                    this.updateStatus(targetNode.id, 'completed', 'IR generated.', { payload: nextPayload });
                    await this.processNextNodes(targetNode.id, nextPayload);
                }
                if (targetNode.type === 'COMPONENT_GENERATE') {
                    const rolesToProcess = targetNode.data.rolePriorities || [{ role: 'ROLE_ADMIN', priority: 1 }, { role: 'ROLE_USER', priority: 10 }];
                    const rolePriorityMap = {};
                    rolesToProcess.forEach((r) => { if (r.role)
                        rolePriorityMap[r.role] = r.priority; });
                    const reqBody = {
                        systemName: payload.systemName,
                        systemRepositories: payload.repositories.map((repo) => ({
                            repoBranchPair: { repositoryURL: repo.repoUrl, branchName: repo.branch || "master" },
                            commitID: repo.commitId || undefined
                        })),
                        rolePriority: rolePriorityMap,
                        defaultRolePriority: 50
                    };
                    this.updateStatus(targetNode.id, 'running', 'Calling Component API...');
                    // Retrieves the components and endpoints
                    const rawResponse = await api_1.api.generateComponents(reqBody);
                    const generatedComponents = {
                        id: rawResponse.id,
                        componentIndex: (0, utils_1.decompressPayload)(rawResponse.componentIndex),
                        endpointIndex: (0, utils_1.decompressPayload)(rawResponse.endpointIndex)
                    };
                    // Retrieves the authorization vectors
                    const authVectors = await api_1.api.generateVectors(generatedComponents.id);
                    const nextPayload = {
                        irJson: generatedComponents,
                        systemName: payload.systemName,
                        metadata: payload.repositories,
                        additional: authVectors
                    };
                    this.updateStatus(targetNode.id, 'completed', 'Components generated.', { payload: nextPayload });
                    await this.processNextNodes(targetNode.id, nextPayload);
                }
                if (targetNode.type === 'COMPONENT_HOLDER') {
                    const rawJson = payload.irJson;
                    // Safely extract the data based on the sample.json structure
                    const extractedId = rawJson.id || "Unknown ID";
                    const endpointsData = rawJson.endpointIndex?.endpoints || rawJson.endpoints || {};
                    const componentsData = rawJson.componentIndex?.components || rawJson.components || {};
                    // Extracting the authorization vectors if they exist
                    const authVectors = payload.additional;
                    const compPayload = {
                        id: extractedId,
                        authvecid: authVectors._id,
                        endpoints: endpointsData,
                        components: componentsData
                    };
                    this.updateStatus(targetNode.id, 'completed', 'Components Stored.', { componentPayload: compPayload });
                    await this.processNextNodes(targetNode.id, payload);
                }
                if (targetNode.type === 'IR_HOLDER') {
                    if (!payload.irJson)
                        throw new Error("Invalid input: Expected IR JSON");
                    this.updateStatus(targetNode.id, 'completed', 'IR Stored.', { payload: payload });
                    await this.processNextNodes(targetNode.id, payload);
                }
                // TODO: Need to update this block to actually run the generated tests.
                // Currently, these are manually run by the user. 
                // The user is expected to set AuthTokens and the staging target.
                if (targetNode.type === 'TEST_EXECUTOR') {
                    const generatedTests = payload?.testSuitePayload?.tests;
                    if (!generatedTests || generatedTests.length === 0) {
                        throw new Error("No tests found to execute. Please ensure the 'Test Generation' step ran successfully.");
                    }
                    this.updateStatus(targetNode.id, 'completed', `Received ${generatedTests.length} tests. Ready for execution.`, {
                        tests: generatedTests,
                        executionStarted: false
                    });
                }
                if (targetNode.type === 'FORMAL_VERIFY') {
                    const input = {
                        systemName: payload.systemName,
                        repos: payload.metadata.map((repo) => ({
                            repoURL: repo.repoUrl || "",
                            branch: repo.branch || "master",
                            commitId: repo.commitId || "HEAD"
                        })),
                        ir_id: payload.irJson['id'],
                    };
                    this.updateStatus(targetNode.id, 'running', 'Verifying...');
                    const result = await api_1.api.verifySystem(input);
                    this.updateStatus(targetNode.id, 'completed', 'Verification Done.', { verificationResult: result.data });
                    const downstreamPackage = {
                        result: result.data,
                        systemInfo: { systemName: payload.systemName, ir: payload.irJson }
                    };
                    await this.processNextNodes(targetNode.id, downstreamPackage);
                }
                else if (targetNode.type === 'SCENARIO_GENERATE') {
                    const nodesArray = Array.from(this.nodesMap.values());
                    // 1. Look back up the graph to find the connected COMPONENT_HOLDER
                    const componentHolderNode = nodesArray.find(n => n.type === 'COMPONENT_HOLDER' &&
                        this.connections.some(c => c.source === n.id && c.target === targetNode.id));
                    // 2. Look back up the graph to find the connected FORMAL_VERIFY (if any)
                    const formalVerifyNode = nodesArray.find(n => n.type === 'FORMAL_VERIFY' &&
                        this.connections.some(c => c.source === n.id && c.target === targetNode.id));
                    // 3. Look back up the graph to find the connected CHANGE_IMPACT (if any)
                    const changeNode = nodesArray.find(n => n.type === 'CHANGE_IMPACT' &&
                        this.connections.some(c => c.source === n.id && c.target === targetNode.id));
                    const endpoints = componentHolderNode?.data.componentPayload?.endpoints;
                    if (!endpoints) {
                        throw new Error("No endpoints found. Please connect a COMPONENT HOLDER to this card and ensure it has run.");
                    }
                    // --- FILTERING LOGIC ---
                    let endpointsToProcess = Object.entries(endpoints);
                    const suggestions = formalVerifyNode?.data.verificationResult?.suggestions;
                    // Filter 1: If Formal Verify is connected and has results, filter the endpoints
                    if (suggestions && suggestions.length > 0) {
                        const allowedSignatures = new Set(suggestions.map((s) => s.id));
                        endpointsToProcess = endpointsToProcess.filter(([id, ep]) => {
                            const signature = `${ep.physicalServiceName}.${ep.controllerClass}.${ep.methodName}`;
                            return allowedSignatures.has(signature);
                        });
                    }
                    let targetedServices = undefined;
                    if (changeNode) {
                        if (changeNode.status !== 'completed') {
                            this.updateStatus(targetNode.id, 'running', 'Awaiting Changes...');
                            // Use continue instead of return to allow sibling connections to process
                            continue;
                        }
                        targetedServices = changeNode.data.targetedServices;
                        if (targetedServices && targetedServices.length > 0) {
                            endpointsToProcess = endpointsToProcess.filter(([id, ep]) => {
                                return targetedServices.includes(ep.serviceName);
                            });
                        }
                    }
                    // Setting up status messages
                    let statusMsg = `Generating scenarios for ${endpointsToProcess.length} endpoints`;
                    if (targetedServices)
                        statusMsg += ` (Regression Testing)`;
                    if (suggestions && suggestions.length > 0)
                        statusMsg += ` (FV Filtered)`;
                    this.updateStatus(targetNode.id, 'running', statusMsg + '...');
                    // Actually retrieving the scenarios from the API
                    const indexId = componentHolderNode?.data.componentPayload?.id;
                    const authVecId = componentHolderNode?.data.componentPayload?.authvecid;
                    const scenarioJson = await api_1.api.generateScenarios(indexId, authVecId);
                    const scenarios = [];
                    // Loop over the filtered array
                    for (const [id, ep] of endpointsToProcess) {
                        let scenario_id = `scn_${id}`;
                        const scenario = scenarioJson.scenarios.find((s) => s.scenario_id === scenario_id);
                        if (scenario) {
                            scenarios.push(scenario);
                        }
                    }
                    const scenarioPayload = {
                        vectorId: `vector_${Date.now()}`,
                        scenarios: scenarios
                    };
                    this.updateStatus(targetNode.id, 'completed', `Generated ${scenarios.length} scenarios.`, {
                        scenarioPayload,
                        selectedScenarios: scenarios.map(s => s.scenario_id),
                        targetedServices
                    });
                    // Pass the combined payload downstream
                    await this.processNextNodes(targetNode.id, { ...payload, scenarioPayload });
                }
                if (targetNode.type === 'TEST_GENERATE') {
                    const nodesArray = Array.from(this.nodesMap.values());
                    // Find upstream prompt node
                    const promptNode = nodesArray.find(n => n.type === 'PROMPT_GENERATE' &&
                        this.connections.some(c => c.source === n.id && c.target === targetNode.id));
                    const prompts = promptNode?.data.promptPayload?.prompts;
                    if (!prompts || prompts.length === 0) {
                        throw new Error("No prompts available. Please generate prompts first.");
                    }
                    const selectedLlm = targetNode.data.selectedLlm || 'gpt-5-mini';
                    this.updateStatus(targetNode.id, 'running', `Sending ${prompts.length} prompts to ${selectedLlm}...`);
                    const data = await api_1.api.generateTestSuites(selectedLlm, prompts);
                    this.updateStatus(targetNode.id, 'completed', 'Test Suite Generated Successfully.', {
                        testSuitePayload: data
                    });
                    await this.processNextNodes(targetNode.id, { ...payload, testSuitePayload: data });
                }
                if (targetNode.type === 'PROMPT_GENERATE') {
                    const nodesArray = Array.from(this.nodesMap.values());
                    const scenarioNode = nodesArray.find(n => n.type === 'SCENARIO_GENERATE' &&
                        this.connections.some(c => c.source === n.id && c.target === targetNode.id));
                    if (!scenarioNode) {
                        throw new Error("Missing connection: Please connect a Scenario Generation card.");
                    }
                    // Extract and validate data
                    const selectedIds = scenarioNode.data?.selectedScenarios || [];
                    const targetLanguage = targetNode.data?.language || 'java';
                    if (selectedIds.length === 0) {
                        throw new Error("No scenarios selected. Please check scenarios in the previous card.");
                    }
                    // Initiate Generation
                    this.updateStatus(targetNode.id, 'running', `Generating prompts for ${selectedIds.length} scenarios...`);
                    const data = await api_1.api.generatePrompts(selectedIds, targetLanguage);
                    // Mark Complete
                    this.updateStatus(targetNode.id, 'completed', 'Prompts Generated Successfully.', {
                        promptPayload: data
                    });
                    // Trigger Next Nodes
                    await this.processNextNodes(targetNode.id, { ...payload, promptPayload: data });
                }
                if (targetNode.type === 'AEGIS') {
                    if (!payload.irJson)
                        throw new Error("Invalid input: Expected IR JSON");
                    this.updateStatus(targetNode.id, 'running', 'Analyzing in Background...');
                    // Constructing payload for Neuro-Symbolic Engine
                    // This is a temporary construct until AEGIS is really ready for multi-repo
                    const enginePayload = {
                        branch: payload.metadata[0]?.branch,
                        repoUrl: payload.metadata[0]?.repoUrl,
                        ir_id: payload.irJson['id']
                    };
                    // Call the Python/Engine API
                    api_1.api.analyzeAegis(enginePayload)
                        .then(async (response) => {
                        if (!response.ok) {
                            throw new Error(`Engine Status: ${response.status}`);
                        }
                        console.error('Aegis analysis is successful:');
                        this.updateStatus(targetNode.id, 'completed', 'Analysis Complete. Click to View.', { payload: payload });
                    })
                        .catch((error) => {
                        console.error('Aegis background analysis failed:', error);
                        this.updateStatus(targetNode.id, 'error', `Analysis Failed: ${error.message}`);
                    });
                }
                if (targetNode.type === 'VERIFICATION_COMPARISON') {
                    const nodesArray = Array.from(this.nodesMap.values());
                    const verifyNode = nodesArray.find(n => n.type === 'FORMAL_VERIFY' &&
                        this.connections.some(c => c.source === n.id && c.target === targetNode.id));
                    const scenarioNode = nodesArray.find(n => n.type === 'SCENARIO_GENERATE' &&
                        this.connections.some(c => c.source === n.id && c.target === targetNode.id));
                    if (!verifyNode || !scenarioNode) {
                        this.updateStatus(targetNode.id, 'failed', "Link BOTH 'Formal Verification' and 'Scenario Generation' cards.");
                        continue;
                    }
                    if (verifyNode.status !== 'completed' || scenarioNode.status !== 'completed') {
                        this.updateStatus(targetNode.id, 'running', 'Awaiting upstream completion...');
                        continue;
                    }
                    this.updateStatus(targetNode.id, 'running', 'Calculating Statistics...');
                    try {
                        const suggestions = verifyNode.data?.verificationResult?.suggestions || [];
                        const allScenarios = scenarioNode.data?.scenarioPayload?.scenarios || [];
                        const inconsistentScenarios = allScenarios.filter((s) => s.policy_inconsistencies && s.policy_inconsistencies.length > 0);
                        const mappedSuggestions = suggestions.filter((sug) => {
                            return inconsistentScenarios.some((s) => {
                                const scenarioSignature = `${s.method} ${s.endpoint}`;
                                return sug.endpoint_name === scenarioSignature;
                            });
                        });
                        const stats = {
                            totalSuggestions: suggestions.length,
                            totalScenarios: inconsistentScenarios.length,
                            mappedCoverage: mappedSuggestions.length,
                            inconsistencyRate: suggestions.length > 0 ? (mappedSuggestions.length / suggestions.length) * 100 : 0
                        };
                        this.updateStatus(targetNode.id, 'completed', 'Comparison Generated.', { comparisonResult: stats });
                        await this.processNextNodes(targetNode.id, { ...payload, comparisonResult: stats });
                    }
                    catch (error) {
                        this.updateStatus(targetNode.id, 'failed', error.message || "Failed to calculate comparison statistics.");
                    }
                }
                if (targetNode.type === 'CHANGE_IMPACT') {
                    const baseNode = Array.from(this.nodesMap.values()).find(n => (n.type === 'MULTI_REPO' || n.type === 'IR_HOLDER') &&
                        this.connections.some(c => c.source === n.id && c.target === targetNode.id));
                    const targetInputNode = Array.from(this.nodesMap.values()).find(n => n.type === 'SYSTEM_INPUT' &&
                        this.connections.some(c => c.source === n.id && c.target === targetNode.id));
                    if (!baseNode || !targetInputNode) {
                        this.updateStatus(targetNode.id, 'failed', "Missing Inputs");
                        continue;
                    }
                    if (baseNode.status !== 'completed' || targetInputNode.status !== 'completed') {
                        this.updateStatus(targetNode.id, 'running', 'Awaiting upstream completion...');
                        continue;
                    }
                    this.updateStatus(targetNode.id, 'running', 'Analyzing Codebase Delta...');
                    const baseMeta = baseNode.data.payload.metadata || [];
                    const targetMeta = targetInputNode.data.repositories || [];
                    const systemName = baseNode.data.payload.systemName || targetInputNode.data.systemName || "train-ticket";
                    const deltaInput = {
                        id: baseNode.data.payload.irJson?.id || "delta-req",
                        systemName: systemName,
                        systemRepositories: baseMeta.map((m) => ({
                            repoBranchPair: { repositoryURL: m.repoUrl, branchName: m.branch },
                            commitID: m.commitId
                        })),
                        comparingRepositories: targetMeta.map((m) => ({
                            repoBranchPair: { repositoryURL: m.repoUrl, branchName: m.branch },
                            commitID: m.commitId
                        }))
                    };
                    const result = await api_1.api.analyzeDelta(deltaInput);
                    const changes = result.changes || [];
                    const affectedSet = new Set();
                    changes.forEach((c) => {
                        const parts = c.path.split('/');
                        if (parts.length > 1 && parts[1].startsWith('ts-')) {
                            affectedSet.add(parts[1]);
                        }
                        else if (parts.length > 2 && parts[2].startsWith('ts-')) {
                            affectedSet.add(parts[2]);
                        }
                    });
                    this.updateStatus(targetNode.id, 'completed', 'Impact Analysis Complete.', {
                        changeImpactPayload: result.data,
                        targetedServices: Array.from(affectedSet)
                    });
                    await this.processNextNodes(targetNode.id, { ...payload, changeImpactPayload: result });
                }
                if (targetNode.type === 'SECURITY_REGRESSION') {
                    const nodesArray = Array.from(this.nodesMap.values());
                    const fvNodes = nodesArray.filter(n => n.type === 'FORMAL_VERIFY' &&
                        this.connections.some(c => c.source === n.id && c.target === targetNode.id));
                    if (fvNodes.length !== 2) {
                        this.updateStatus(targetNode.id, 'failed', 'Requires exactly two Formal Verification inputs.');
                        continue;
                    }
                    // Sort by Y-coordinate to establish Base vs PR. 
                    // Uses optional chaining fallback in case coordinates are nested in a position object.
                    const [baseNode, prNode] = fvNodes.sort((a, b) => (a.position?.y ?? a.y ?? 0) - (b.position?.y ?? b.y ?? 0));
                    const baseResult = baseNode.data?.verificationResult;
                    const prResult = prNode.data?.verificationResult;
                    if (!baseResult || !prResult) {
                        this.updateStatus(targetNode.id, 'running', 'Awaiting both Verifications to finish...');
                        continue;
                    }
                    this.updateStatus(targetNode.id, 'running', 'Calculating Security Drift...');
                    try {
                        const baseSugs = baseResult.suggestions || [];
                        const targetSugs = prResult.suggestions || [];
                        // Extremely safe Array diffing to prevent infinite loops
                        const persistent = baseSugs.filter((b) => targetSugs.some((t) => t.id === b.id));
                        const resolved = baseSugs.filter((b) => !targetSugs.some((t) => t.id === b.id));
                        const introduced = targetSugs.filter((t) => !baseSugs.some((b) => b.id === t.id));
                        const regressionPayload = {
                            baseCount: baseSugs.length,
                            targetCount: targetSugs.length,
                            resolved,
                            introduced,
                            persistent
                        };
                        this.updateStatus(targetNode.id, 'completed', `Found ${introduced.length} regressions.`, {
                            regressionPayload
                        });
                        await this.processNextNodes(targetNode.id, { ...payload, regressionPayload });
                    }
                    catch (error) {
                        this.updateStatus(targetNode.id, 'failed', error.message || "Failed to calculate drift.");
                    }
                }
                else {
                    // Catch-all for basic pass-through nodes (VISUALIZATION, etc.) 
                    // which are only relevant to the front end visualziation.
                    this.updateStatus(targetNode.id, 'completed', `Processed node ${targetNode.type}`, { payload });
                    await this.processNextNodes(targetNode.id, payload);
                }
            }
            catch (err) {
                this.updateStatus(targetNode.id, 'failed', `Error: ${err.message}`);
            }
        }
    }
}
exports.PipelineCoordinator = PipelineCoordinator;
