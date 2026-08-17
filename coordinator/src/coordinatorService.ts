import axios from 'axios';
import zlib from 'zlib';

const API_URLS = {
    SESSION: process.env.SESSION_API_URL || 'http://localhost:8080',
    IR: process.env.IR_API_URL || 'http://localhost:8080',
    COMPONENT: process.env.COMPONENT_API_URL || 'http://localhost:8060',
    VECTOR: process.env.VECTOR_API_URL || 'http://localhost:8050',
    ANALYSIS: process.env.ANALYSIS_API_URL || 'http://localhost:8040',
    VERIFY: process.env.VERIFY_API_URL || 'http://localhost:9000',
    TEST: process.env.TEST_API_URL || 'http://localhost:8030',
    AEGIS: process.env.AEGIS_API_URL || 'http://localhost:8900'
};

export class PipelineCoordinator {
    private nodesMap: Map<string, any> = new Map();
    private connections: any[] = [];
    private sessionId: string;

    constructor(sessionId: string) {
        this.sessionId = sessionId;
    }

    async fetchAndDecompressSession() {
        try {
            console.log(`Fetching session ${this.sessionId}...`);
            const fileResponse = await axios.get(`${API_URLS.SESSION}/sessions/${this.sessionId}/canvas`, {
                responseType: 'arraybuffer'
            });

            // Using NodeJS zlib instead of DecompressionStream
            const decompressedBuffer = zlib.gunzipSync(fileResponse.data);
            const canvasData = JSON.parse(decompressedBuffer.toString('utf-8'));

            // Initialize the runtime state map
            this.connections = canvasData.connections || [];
            (canvasData.nodes || []).forEach((node: any) => {
                this.nodesMap.set(node.id, { ...node, status: 'idle', logs: [] });
            });

            return true;
        } catch (error) {
            console.error(`Failed to load session ${this.sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Stateful logger to mimic UI's setNodes updates
     */
    private updateStatus(id: string, status: string, log: string, dataUpdate?: any) {
        const node = this.nodesMap.get(id);
        if (!node) return;

        node.status = status;
        if (log) node.logs.push(log);
        if (dataUpdate) {
            node.data = { ...node.data, ...dataUpdate };
        }
        this.nodesMap.set(id, node);
        console.log(`[Node: ${node.type}] -> ${status}: ${log}`);
    }

    /**
     * Port of runPipeline() from PipelinePage.tsx
     */
    async execute() {
        await this.fetchAndDecompressSession();
        console.log(`Starting execution for session ${this.sessionId}`);

        // Find Start Nodes[cite: 9]
        const inputNodes = Array.from(this.nodesMap.values()).filter(
            n => n.type === 'SYSTEM_INPUT' || n.type === 'UPLOAD_IR'
        );

        for (const node of inputNodes) {
            this.updateStatus(node.id, 'running', 'Starting input processing...');
            let payload: any = null;

            if (node.type === 'SYSTEM_INPUT') {
                const reposToProcess = node.data.repositories;
                if (!node.data.systemName || !reposToProcess || reposToProcess.length === 0) {
                    this.updateStatus(node.id, 'failed', 'System Name and Repositories required.');
                    continue;
                }
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

            if (payload) {
                await this.processNextNodes(node.id, payload);
            }
        }
    }

    /**
     * Port of processNextNodes() from PipelinePage.tsx
     */
    async processNextNodes(sourceId: string, payload: any) {
        const outgoing = this.connections.filter(c => c.source === sourceId);

        for (const conn of outgoing) {
            const targetNode = this.nodesMap.get(conn.target);
            if (!targetNode) continue;

            this.updateStatus(targetNode.id, 'running', 'Receiving data...');

            try {
                if (targetNode.type === 'MULTI_REPO') {
                    if (payload.type !== 'SYSTEM_PAYLOAD') throw new Error("Expected System Source");
                    
                    const input = {
                        systemName: payload.systemName,
                        systemRepositories: payload.repositories.map((repo: any) => ({
                            repoBranchPair: { repositoryURL: repo.repoUrl, branchName: repo.branch || "master" },
                            commitID: repo.commitId
                        }))
                    };

                    this.updateStatus(targetNode.id, 'running', 'Generating Base IR...');
                    const irResponse = await axios.post(`${API_URLS.IR}/ir/create`, input); 
                    
                    const nextPayload = {
                        irJson: irResponse.data,
                        systemName: payload.systemName,
                        metadata: payload.repositories
                    };
                    
                    this.updateStatus(targetNode.id, 'completed', 'IR generated.', { payload: nextPayload });
                    await this.processNextNodes(targetNode.id, nextPayload);
                }
                else if (targetNode.type === 'COMPONENT_GENERATE') {
                    // Replicating Roles Logic
                    const rolesToProcess = targetNode.data.rolePriorities || [{ role: 'ROLE_ADMIN', priority: 1 }];
                    const rolePriorityMap: Record<string, number> = {};
                    rolesToProcess.forEach((r: any) => { if (r.role) rolePriorityMap[r.role] = r.priority; });

                    const reqBody = {
                        systemName: payload.systemName,
                        systemRepositories: payload.repositories.map((repo: any) => ({
                            repoBranchPair: { repositoryURL: repo.repoUrl, branchName: repo.branch || "master" }
                        })),
                        rolePriority: rolePriorityMap,
                        defaultRolePriority: 50
                    };

                    this.updateStatus(targetNode.id, 'running', 'Calling Component API...');
                    const rawResponse = await axios.post(`${API_URLS.COMPONENT}/component/create`, reqBody);
                    
                    // Note: Skipping decompressPayload here assuming microservices speak raw JSON internally
                    const generatedComponents = {
                        id: rawResponse.data.id,
                        componentIndex: rawResponse.data.componentIndex,
                        endpointIndex: rawResponse.data.endpointIndex
                    };

                    const authVectors = await axios.post(`${API_URLS.VECTOR}/vectors/generate-all`, { indexId: generatedComponents.id });

                    const nextPayload = {
                        irJson: generatedComponents,
                        systemName: payload.systemName,
                        metadata: payload.repositories,
                        additional: authVectors.data
                    };

                    this.updateStatus(targetNode.id, 'completed', 'Components generated.', { payload: nextPayload });
                    await this.processNextNodes(targetNode.id, nextPayload);
                }
                else if (targetNode.type === 'COMPONENT_HOLDER') {
                    const rawJson = payload.irJson;
                    const compPayload = {
                        id: rawJson.id,
                        authvecid: payload.additional._id,
                        endpoints: rawJson.endpointIndex?.endpoints || {},
                        components: rawJson.componentIndex?.components || {}
                    };

                    this.updateStatus(targetNode.id, 'completed', 'Components Stored.', { componentPayload: compPayload });
                    await this.processNextNodes(targetNode.id, payload);
                }
                else if (targetNode.type === 'FORMAL_VERIFY') {
                    const input = {
                        systemName: payload.systemName,
                        repos: payload.metadata.map((repo: any) => ({
                            repoURL: repo.repoUrl || "",
                            branch: repo.branch || "master",
                            commitId: repo.commitId || "HEAD"
                        })),
                        ir_id: payload.irJson['id'],
                    };

                    this.updateStatus(targetNode.id, 'running', 'Verifying...');
                    const result = await axios.post(`${API_URLS.VERIFY}/verify`, input);
                    
                    this.updateStatus(targetNode.id, 'completed', 'Verification Done.', { verificationResult: result.data });
                    
                    const downstreamPackage = {
                        result: result.data,
                        systemInfo: { systemName: payload.systemName, ir: payload.irJson }
                    };
                    await this.processNextNodes(targetNode.id, downstreamPackage); 
                }
                // --- Complex Node Logic (Change Impact, Regression, etc) ---
                else if (targetNode.type === 'CHANGE_IMPACT') {
                    // Logic adaptation: Instead of setTimeout(), we synchronously check state from our map
                    const baseNode = Array.from(this.nodesMap.values()).find(n => 
                        (n.type === 'MULTI_REPO' || n.type === 'IR_HOLDER') && 
                        this.connections.some(c => c.source === n.id && c.target === targetNode.id)
                    );
                    const targetInputNode = Array.from(this.nodesMap.values()).find(n => 
                        n.type === 'SYSTEM_INPUT' && 
                        this.connections.some(c => c.source === n.id && c.target === targetNode.id)
                    );

                    if (!baseNode || !targetInputNode) {
                        this.updateStatus(targetNode.id, 'failed', "Missing Inputs");
                        continue;
                    }
                    if (baseNode.status !== 'completed' || targetInputNode.status !== 'completed') {
                        this.updateStatus(targetNode.id, 'running', 'Awaiting upstream completion...');
                        continue;
                    }

                    this.updateStatus(targetNode.id, 'running', 'Analyzing Codebase Delta...');
                    const deltaInput = {
                        id: baseNode.data.payload.irJson?.id || "delta-req",
                        systemName: baseNode.data.payload.systemName,
                        systemRepositories: baseNode.data.payload.metadata.map((m: any) => ({
                            repoBranchPair: { repositoryURL: m.repoUrl, branchName: m.branch }
                        })),
                        comparingRepositories: targetInputNode.data.repositories.map((m: any) => ({
                            repoBranchPair: { repositoryURL: m.repoUrl, branchName: m.branch }
                        }))
                    };

                    const result = await axios.post(`${API_URLS.IR}/ir/delta`, deltaInput); // Assuming unzipped response
                    
                    this.updateStatus(targetNode.id, 'completed', 'Impact Analysis Complete.', {
                        changeImpactPayload: result.data
                    });
                    
                    await this.processNextNodes(targetNode.id, { ...payload, changeImpactPayload: result.data });
                }
                else {
                    // Catch-all for basic pass-through nodes (IR_HOLDER, VISUALIZATION, etc.)
                    this.updateStatus(targetNode.id, 'completed', `Processed node ${targetNode.type}`, { payload });
                    await this.processNextNodes(targetNode.id, payload);
                }
            } catch (err: any) {
                this.updateStatus(targetNode.id, 'failed', `Error: ${err.message}`);
            }
        }
    }
}