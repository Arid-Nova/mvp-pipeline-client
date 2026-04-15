import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { fetchIRFromRepo, verifySystem, RepositoryInput, VerificationInput } from '../../services/api';
import { CardType, SystemPayload, ComponentPayload, PipelinePayload, NodeData, Connection, ScenarioPayload} from './models'
import CanvasFooter from '../generic/CanvasFooter';

// Components
import {CATEGORIES, CARD_CONFIG, VALID_CONNECTIONS} from './pipelineConfig'
import { InlineDropzone } from './sub/InlineDropZone';
import { SystemInputCard } from './sub/SystemInputCard';

const PipelinePage: React.FC = () => {
    const navigate = useNavigate();

    // Zoom and Pan State
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);

    // Zoom constants
    const MIN_SCALE = 0.2;
    const MAX_SCALE = 2;
    const ZOOM_SENSITIVITY = 0.001;

    // Zoom handling
    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = -e.deltaY * ZOOM_SENSITIVITY;
            setScale(prev => Math.min(Math.max(prev + delta, MIN_SCALE), MAX_SCALE));
        } else {
            // Normal scroll pans the canvas
            setOffset(prev => ({
                x: prev.x - e.deltaX,
                y: prev.y - e.deltaY
            }));
        }
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        // Pan with Middle Mouse or Space + Left Click
        if (e.button === 1 || (e.button === 0 && (e.target as HTMLElement).id === 'canvas-grid')) {
            setIsPanning(true);
        }
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            setOffset(prev => ({
                x: prev.x + e.movementX,
                y: prev.y + e.movementY
            }));
        }
    };

    // --- Reequesting Notification Permission ---
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);
    
    // --- PERSISTENCE LOGIC ---
    // Initialize from session storage if available
    const [nodes, setNodes] = useState<NodeData[]>(() => {
        try {
            const savedNodes = sessionStorage.getItem('pipeline_nodes');
            return savedNodes ? JSON.parse(savedNodes) : [];
        } catch (e) {
            console.warn("Failed to load pipeline state", e);
            return [];
        }
    });
    
    const [connections, setConnections] = useState<Connection[]>(() => {
        try {
            const savedConns = sessionStorage.getItem('pipeline_connections');
            return savedConns ? JSON.parse(savedConns) : [];
        } catch (e) {
            return [];
        }
    });

    // --- COLLAPSIBLE SIDEBAR FOR ADDING NODES --- //
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() => {
        const initial: Record<string, boolean> = {};
        Object.keys(CATEGORIES).forEach(cat => initial[cat] = true);
        return initial;
    });

    const toggleCategory = (category: string) => {
        setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
    };

    useEffect(() => {
        try {
            const nodesToSave = nodes.map(node => {
                // Create a shallow copy of data
                const cleanData = { ...node.data };

                // Strip heavy payloads before saving to avoid QuotaExceededError
                if (cleanData.payload) {
                    cleanData.payload = {
                        ...cleanData.payload,
                        irJson: null // Don't persist IR JSON
                    };
                }
                if (cleanData.verificationResult) {
                    cleanData.verificationResult = undefined; // Don't persist results
                }
                if (cleanData.systemInfo) {
                    cleanData.systemInfo = undefined; // Don't persist context
                }
                if (cleanData.componentPayload) {
                    cleanData.componentPayload = { 
                        ...cleanData.componentPayload, 
                        components: null, 
                        endpoints: null
                    };
                }

                // If we strip data, we should reset status if it was 'completed' 
                // so the user knows they need to re-run/re-upload on refresh.
                let cleanStatus = node.status;
                if (node.type === 'UPLOAD_IR' || node.type === 'MULTI_REPO') {
                    // Inputs need to stay 'idle' if data is missing
                    if (node.status === 'completed') cleanStatus = 'idle';
                }

                return {
                    ...node,
                    data: cleanData,
                    status: cleanStatus
                };
            });

            sessionStorage.setItem('pipeline_nodes', JSON.stringify(nodesToSave));
            sessionStorage.setItem('pipeline_connections', JSON.stringify(connections));
        } catch (e) {
            console.warn("Failed to save pipeline state to session storage:", e);
        }
    }, [nodes, connections]);

    const clearPipeline = () => {
        if(window.confirm("Are you sure you want to clear the pipeline? This cannot be undone.")) {
            setNodes([]);
            setConnections([]);
            sessionStorage.removeItem('pipeline_nodes');
            sessionStorage.removeItem('pipeline_connections');
        }
    };
    // -------------------------

    const [isLinking, setIsLinking] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    
    // Dragging state
    const [dragNodeId, setDragNodeId] = useState<string | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // --- Actions ---

    const addNode = (type: CardType) => {
        const id = Math.random().toString(36).substr(2, 9);
        
        let newX = 100;
        let newY = 100;

        if (canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            
            const viewportCenterX = rect.width / 2;
            const viewportCenterY = rect.height / 2;

            newX = (viewportCenterX - offset.x) / scale - 150;
            newY = (viewportCenterY - offset.y) / scale - 100;
        }

        const stackingOffset = (nodes.length % 6) * 20;

        const newNode: NodeData = {
            id,
            type,
            x: newX + stackingOffset,
            y: newY + stackingOffset,
            data: {},
            status: 'idle',
            logs: []
        };
        
        setNodes(prev => [...prev, newNode]);
    };

    const deleteNode = (id: string) => {
        setNodes(nodes.filter(n => n.id !== id));
        setConnections(connections.filter(c => c.source !== id && c.target !== id));
    };

    const updateNodeData = useCallback((id: string, newData: Partial<NodeData['data']>) => {
        setNodes(prevNodes => 
            prevNodes.map(node => 
                node.id === id 
                    ? { ...node, data: { ...node.data, ...newData } } 
                    : node
            )
        );
    }, []);

    const handleNodeDragStart = (e: React.DragEvent, id: string) => {
        setDragNodeId(id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleCanvasDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleCanvasDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (!dragNodeId || !canvasRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        
        // Adjust coordinates for Scale and Offset
        const x = (e.clientX - rect.left - offset.x) / scale - 150; 
        const y = (e.clientY - rect.top - offset.y) / scale - 50;

        setNodes(nodes.map(n => n.id === dragNodeId ? { ...n, x, y } : n));
        setDragNodeId(null);
    };

    // --- Linking Logic ---

    const handleLinkClick = (id: string, type: CardType) => {
        if (!isLinking) {
            setIsLinking(id);
        } else {
            if (isLinking === id) {
                setIsLinking(null);
                return;
            }

            const sourceNode = nodes.find(n => n.id === isLinking);
            if (!sourceNode) return;

            const allowedTargets = VALID_CONNECTIONS[sourceNode.type];
            if (allowedTargets.includes(type)) {
                if (!connections.some(c => c.source === isLinking && c.target === id)) {
                    setConnections([...connections, { 
                        id: Math.random().toString(36), 
                        source: isLinking, 
                        target: id 
                    }]);
                }
            } else {
                alert(`Invalid Connection! ${sourceNode.type} can only connect to: ${allowedTargets.join(', ')}`);
            }
            setIsLinking(null);
        }
    };

    const deleteConnection = (connId: string) => {
        setConnections(connections.filter(c => c.id !== connId));
    };

    // --- Execution Logic ---
    const runFromNode = async (nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        setIsRunning(true);
        
        const updateStatus = (id: string, status: NodeData['status'], log: string, data?: any) => {
            setNodes(prev => prev.map(n => n.id === id ? { 
                ...n, 
                status, 
                logs: [...n.logs, log],
                data: data ? { ...n.data, ...data } : n.data 
            } : n));
        };

        try {
            // We need to provide the payload from the UPSTREAM node
            const upstreamConnection = connections.find(c => c.target === nodeId);
            const upstreamNode = nodes.find(n => n.id === upstreamConnection?.source);
            
            // Reconstruct the payload from upstream data
            const payload: any = upstreamNode?.data.payload || {};
            
            // Execute the specific node logic
            await processNextNodes(upstreamNode?.id || '', payload, updateStatus);
        } catch (error: any) {
            updateStatus(nodeId, 'failed', error.message);
        } finally {
            setIsRunning(false);
        }
    };

    const runPipeline = async () => {
        setIsRunning(true);
        // Reset logs but keep data
        const updatedNodes = nodes.map(n => ({ ...n, status: 'idle' as const, logs: [] }));
        setNodes(updatedNodes);

        const updateStatus = (id: string, status: any, log?: string, dataUpdate?: any) => {
            setNodes(prev => prev.map(n => {
                if (n.id === id) {
                    return {
                        ...n,
                        status: status,
                        logs: log ? [...n.logs, log] : n.logs,
                        data: dataUpdate ? { ...n.data, ...dataUpdate } : n.data
                    };
                }
                return n;
            }));
        };

        try {
            // Find Start Nodes
            const inputNodes = nodes.filter(n => n.type === 'SYSTEM_INPUT' || n.type === 'UPLOAD_IR');
            
            for (const node of inputNodes) {
                updateStatus(node.id, 'running', 'Starting input processing...');
                let payload: any | null = null;
                
                // 1. EXECUTE INPUT NODES
                if (node.type === 'SYSTEM_INPUT') {
                    const reposToProcess = node.data.repositories;
                    
                    if (!node.data.systemName || !reposToProcess || reposToProcess.length === 0) {
                        updateStatus(node.id, 'failed', 'System Name and at least one Repository URL are required.');
                        continue;
                    }
                    
                    // Package up the repo details and pass them downstream!
                    payload = {
                        type: 'SYSTEM_PAYLOAD',
                        systemName: node.data.systemName,
                        repositories: reposToProcess
                    } as SystemPayload;
                    
                    updateStatus(node.id, 'completed', 'System source ready.', { payload });
                }
                else if (node.type === 'UPLOAD_IR') {
                    if (!node.data.payload?.irJson) {
                        updateStatus(node.id, 'failed', 'No File Uploaded');
                        continue;
                    }
                    // For uploaded files, we default the metadata if not present
                    payload = {
                        irJson: node.data.payload.irJson,
                        metadata: node.data.payload.metadata || [{
                            systemName: "Uploaded System",
                            repoUrl: "Local Upload",
                            branch: "master",
                            commitId: "HEAD"
                        }]
                    };
                    updateStatus(node.id, 'completed', 'File ready.', { payload });
                }

                // 2. PROPAGATE
                if (payload) {
                    await processNextNodes(node.id, payload, updateStatus);
                }
            }

        } catch (e: any) {
            console.error(e);
            alert("Pipeline Error: " + e.message);
        } finally {
            setIsRunning(false);
        }
    };

    // processNextNodes accepts 'any' because it handles both PipelinePayload (IR) and Verification Packages
    const processNextNodes = async (sourceId: string, payload: any, updateStatus: Function) => {
        const outgoing = connections.filter(c => c.source === sourceId);
        
        for (const conn of outgoing) {
            const targetNode = nodes.find(n => n.id === conn.target);
            if (!targetNode) continue;

            updateStatus(targetNode.id, 'running', `Receiving data...`);
            
            try {
                if (targetNode.type === 'MULTI_REPO') {
                    if (payload.type !== 'SYSTEM_PAYLOAD') throw new Error("Expected System Source");
                    const sysPayload = payload as SystemPayload;

                    const input: RepositoryInput = {
                        systemName: sysPayload.systemName,
                        systemRepositories: sysPayload.repositories.map(repo => ({
                            repoBranchPair: { repositoryURL: repo.repoUrl, branchName: repo.branch || "master" },
                            commitID: repo.commitId || undefined
                        }))
                    };

                    updateStatus(targetNode.id, 'running', 'Generating Base IR...');
                    const ir = await fetchIRFromRepo(input);
                    
                    const nextPayload: PipelinePayload = {
                        irJson: ir,
                        systemName: sysPayload.systemName,
                        metadata: sysPayload.repositories.map(repo => ({
                            repoUrl: repo.repoUrl || "",
                            branch: repo.branch || "master",
                            commitId: repo.commitId || "HEAD"
                        }))
                    };
                    updateStatus(targetNode.id, 'completed', 'IR generated.', { payload: nextPayload });
                    await processNextNodes(targetNode.id, nextPayload, updateStatus);
                }
                else if (targetNode.type === 'COMPONENT_GENERATE') {
                    if (payload.type !== 'SYSTEM_PAYLOAD') throw new Error("Expected System Source");
                    const sysPayload = payload as SystemPayload;

                    const rolesToProcess = targetNode.data.rolePriorities || [{ role: 'ROLE_ADMIN', priority: 1 }, { role: 'ROLE_USER', priority: 10 }];
                    const rolePriorityMap: Record<string, number> = {};
                    rolesToProcess.forEach(r => { if (r.role) rolePriorityMap[r.role] = r.priority; });

                    const reqBody = {
                        systemName: sysPayload.systemName,
                        systemRepositories: sysPayload.repositories.map(repo => ({
                            repoBranchPair: { repositoryURL: repo.repoUrl, branchName: repo.branch || "master" },
                            commitID: repo.commitId || undefined
                        })),
                        rolePriority: rolePriorityMap,
                        defaultRolePriority: 50
                    };

                    updateStatus(targetNode.id, 'running', 'Calling Component API...');
                    
                    // Retrieves the components and endpoints
                    const response = await fetch('http://localhost:8060/component/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(reqBody)
                    });

                    if (!response.ok) throw new Error(`API error ${response.status}`);
                    const generatedComponents = await response.json();

                    // Retrieves the authorization vectors
                    const authVectorsResponse = await fetch('http://localhost:8050/vectors/generate-all', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ indexId: generatedComponents.id }) 
                    });

                    if (!authVectorsResponse.ok) throw new Error(`API error ${authVectorsResponse.status}`);
                    const authVectors = await authVectorsResponse.json();

                    const nextPayload: PipelinePayload = {
                        irJson: generatedComponents,
                        systemName: sysPayload.systemName,
                        metadata: sysPayload.repositories.map(repo => ({
                            repoUrl: repo.repoUrl || "",
                            branch: repo.branch || "master",
                            commitId: repo.commitId || "HEAD"
                        })),
                        additional: authVectors
                    };

                    updateStatus(targetNode.id, 'completed', 'Components generated.', { payload: nextPayload });
                    await processNextNodes(targetNode.id, nextPayload, updateStatus);
                }
                else if (targetNode.type === 'COMPONENT_HOLDER') {
                    // Type Guard: Expects payload from COMPONENT_GENERATE
                    const incomingPayload = payload as PipelinePayload;
                    if (!incomingPayload.irJson) throw new Error("Invalid input: Expected Component JSON");

                    const rawJson = incomingPayload.irJson;
                    
                    // Safely extract the data based on the sample.json structure
                    const extractedId = rawJson.id || "Unknown ID";
                    const endpointsData = rawJson.endpointIndex?.endpoints || rawJson.endpoints || {};
                    const componentsData = rawJson.componentIndex?.components || rawJson.components || {};

                    // Extracting the authorization vectors if they exist
                    const authVectors = incomingPayload.additional;
                    
                    const compPayload: ComponentPayload = {
                        id: extractedId,
                        authvecid: authVectors._id,
                        endpoints: endpointsData,
                        components: componentsData
                    };

                    updateStatus(targetNode.id, 'completed', 'Components Stored.', { componentPayload: compPayload });
                    
                    await processNextNodes(targetNode.id, incomingPayload, updateStatus);
                }
                if (targetNode.type === 'IR_HOLDER') {
                    // Type Guard: Expects IR
                    const irPayload = payload as PipelinePayload;
                    if (!irPayload.irJson) throw new Error("Invalid input: Expected IR JSON");

                    updateStatus(targetNode.id, 'completed', 'IR Stored.', { payload: irPayload });
                    await processNextNodes(targetNode.id, irPayload, updateStatus);
                } 
                else if (targetNode.type === 'FORMAL_VERIFY') {
                    // Type Guard: Expects IR
                    const irPayload = payload as PipelinePayload;
                    if (!irPayload.irJson) throw new Error("No IR Data received");
                    

                    const input: VerificationInput = {
                        systemName: irPayload.systemName,
                        repos: irPayload.metadata.map(repo => ({
                            repoURL: repo.repoUrl || "",
                            branch: repo.branch || "master",
                            commitId: repo.commitId || "HEAD"
                        })),
                        ir: irPayload.irJson
                    }

                    updateStatus(targetNode.id, 'running', 'Verifying...');
                    const result = await verifySystem(input);
                    
                    updateStatus(targetNode.id, 'completed', 'Verification Done.', { verificationResult: result });
                    
                    // Bundle the result with the system info needed for visualization
                    const downstreamPackage = {
                        result: result,
                        systemInfo: {
                            systemName: irPayload.systemName,
                            ir: irPayload.irJson
                        }
                    };

                    // PASS RESULT DOWNSTREAM
                    await processNextNodes(targetNode.id, downstreamPackage, updateStatus); 
                }
                else if (targetNode.type === 'SCENARIO_GENERATE') {
                    // 1. Look back up the graph to find the connected COMPONENT_HOLDER
                    const componentHolderNode = nodes.find(n => 
                        n.type === 'COMPONENT_HOLDER' && 
                        connections.some(c => c.source === n.id && c.target === targetNode.id)
                    );

                    // 2. Look back up the graph to find the connected FORMAL_VERIFY (if any)
                    const formalVerifyNode = nodes.find(n => 
                        n.type === 'FORMAL_VERIFY' && 
                        connections.some(c => c.source === n.id && c.target === targetNode.id)
                    );

                    const endpoints = componentHolderNode?.data.componentPayload?.endpoints;
                    
                    if (!endpoints) {
                        throw new Error("No endpoints found. Please connect a COMPONENT_HOLDER to this card and ensure it has run.");
                    }

                    // --- FILTERING LOGIC ---
                    let endpointsToProcess = Object.entries(endpoints);
                    const suggestions = formalVerifyNode?.data.verificationResult?.suggestions;

                    // If Formal Verify is connected and has results, filter the endpoints
                    if (suggestions && suggestions.length > 0) {
                        const allowedSignatures = new Set(suggestions.map((s: any) => s.id));

                        endpointsToProcess = endpointsToProcess.filter(([id, ep]: [string, any]) => {
                            const signature = `${ep.physicalServiceName}.${ep.controllerClass}.${ep.methodName}`;
                            const isMatch = allowedSignatures.has(signature);

                            return isMatch;
                        });

                        updateStatus(targetNode.id, 'running', `Filtered to ${endpointsToProcess.length} endpoints based on Verification suggestions...`);
                    } else {
                        updateStatus(targetNode.id, 'running', `Generating scenarios for all ${endpointsToProcess.length} endpoints...`);
                    }
                    

                    // Actually retrueving the scnarios from the API
                    const indexId = componentHolderNode?.data.componentPayload?.id;
                    const authVecId = componentHolderNode?.data.componentPayload?.authvecid;

                    const actualScenarios = await fetch('http://localhost:8040/scenarios/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(
                            {   
                                index_id: indexId,
                                vectors_id: authVecId
                            }
                        ) 
                    });

                    if (!actualScenarios.ok) throw new Error(`API error ${actualScenarios.status}`);
                    let scenarioJson = await actualScenarios.json();

                    const scenarios: any[] = [];

                    // Loop over the filtered array
                    for (const [id, ep] of endpointsToProcess) {
                        let scenario_id = `scn_${id}`;
                        const scenario = scenarioJson.scenarios.find((s: any) => s.scenario_id === scenario_id);
                        scenarios.push(scenario)
                    }

                    const scenarioPayload: ScenarioPayload = { 
                        vectorId: `vector_${Date.now()}`,
                        scenarios: scenarios
                    };
                    
                    updateStatus(targetNode.id, 'completed', `Generated ${scenarios.length} scenarios.`, {
                        scenarioPayload,
                        selectedScenarios: scenarios.map(s => s.scenario_id) 
                    });

                    await processNextNodes(targetNode.id, { ...payload, scenarioPayload }, updateStatus);
                }
                else if (targetNode.type === 'TEST_GENERATE') {
                    // Find upstream prompt node
                    const promptNode = nodes.find(n => 
                        n.type === 'PROMPT_GENERATE' && 
                        connections.some(c => c.source === n.id && c.target === targetNode.id)
                    );

                    const prompts = promptNode?.data.promptPayload?.prompts;

                    if (!prompts || prompts.length === 0) {
                        throw new Error("No prompts available. Please generate prompts first.");
                    }

                    const selectedLlm = targetNode.data.selectedLlm || 'gpt-4o-mini'; 
                    updateStatus(targetNode.id, 'running', `Sending ${prompts.length} prompts to ${selectedLlm}...`);

                    const response = await fetch('http://localhost:8030/testsuites/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            llm_model: selectedLlm,
                            prompts: prompts 
                        })
                    });

                    if (!response.ok) throw new Error(`Test Generation API error: ${response.status}`);
                    
                    const data = await response.json(); // Assumes { status: "success", tests: [...] }
                    
                    updateStatus(targetNode.id, 'completed', 'Test Suite Generated Successfully.', { 
                        testSuitePayload: data 
                    });

                    await processNextNodes(targetNode.id, { ...payload, testSuitePayload: data }, updateStatus);
                }
                else if (targetNode.type === 'PROMPT_GENERATE') {
                    const scenarioNode = nodes.find(n => 
                        n.type === 'SCENARIO_GENERATE' && 
                        connections.some(c => c.source === n.id && c.target === targetNode.id)
                    );

                    const selectedIds = scenarioNode?.data.selectedScenarios || [];
                    const targetLanguage = targetNode.data.language || 'java';

                    if (selectedIds.length === 0) {
                        throw new Error("No scenarios selected. Please check scenarios in the previous card.");
                    }

                    updateStatus(targetNode.id, 'running', `Generating prompts for ${selectedIds.length} scenarios...`);

                    const response = await fetch('http://localhost:8040/scenarios/prompts/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scenario_ids: selectedIds, language: targetLanguage })
                    });

                    if (!response.ok) throw new Error(`Prompt API error: ${response.status}`);
                    
                    const data = await response.json(); // Assuming { prompts: [...] }
                    
                    updateStatus(targetNode.id, 'completed', 'Prompts Generated Successfully.', { 
                        promptPayload: data 
                    });

                    await processNextNodes(targetNode.id, { ...payload, promptPayload: data }, updateStatus);
                }
                else if (targetNode.type === 'VISUALIZATION') {
                    // 1. Look at the FRESH payload passed directly from the node that just triggered this
                    const incomingIr = (payload as any)?.irJson;
                    const incomingSystemName = (payload as any)?.systemName;

                    // 2. Look up the graph for settled state (nodes that finished previously)
                    const irNode = nodes.find(n => n.type === 'IR_HOLDER' && 
                        connections.some(c => c.source === n.id && c.target === targetNode.id)
                    );
                    const systemInputNode = nodes.find(n => 
                        n.type === 'SYSTEM_INPUT' && 
                        connections.some(c => c.source === n.id && c.target === targetNode.id)
                    );

                    const graphIrPayload = irNode?.data?.payload;
                    const graphSystemPayload = systemInputNode?.data?.payload as SystemPayload | undefined;

                    // 3. Merge them! Prefer the fresh incoming payload, fallback to graph state
                    const actualIrJson = incomingIr || graphIrPayload?.irJson;
                    const actualSystemName = incomingSystemName || graphSystemPayload?.systemName;

                    let finalIrJson = null;
                    let statusMessage = '';

                    if (actualIrJson) {
                        // Priority 1: Use IR from IR Holder (either fresh or from state)
                        finalIrJson = { ...actualIrJson };
                        statusMessage = 'Primary IR loaded.';

                        if (actualSystemName) {
                            finalIrJson.name = actualSystemName;
                            statusMessage = `Primary IR loaded. History linked for ${finalIrJson.name}`;
                        }
                    } 
                    else if (actualSystemName) {
                        // Priority 2: Fetching using system name (either fresh or from state)
                        finalIrJson = {
                            name: actualSystemName,
                            commitID: "historic-fetch-only-" + Date.now(),
                            microservices: []
                        };
                        statusMessage = `Fetched IR History.`;
                    } 
                    else {
                        throw new Error("Missing input data.");
                    }

                    const vizPayload: PipelinePayload = {
                        ...(payload as PipelinePayload || {}),
                        irJson: finalIrJson
                    };

                    updateStatus(targetNode.id, 'completed', statusMessage, { payload: vizPayload });

                    // Old logic without historic data fetching.
                    // const irPayload = payload as PipelinePayload;
                    // if(!irPayload.irJson) throw new Error("Invalid input for Visualization");
                    // updateStatus(targetNode.id, 'completed', 'Ready to Visualize.', { payload: irPayload });
                }
                else if (targetNode.type === 'AEGIS') {
                    // Type Guard
                    const irPayload = payload as PipelinePayload;
                    if (!irPayload.irJson) throw new Error("Invalid input: Expected IR JSON");

                    updateStatus(targetNode.id, 'running', 'Analyzing in Background...');

                    // Constructing payload for Neuro-Symbolic Engine
                    // This is a temporary construct until AEGIS is really ready for multi-repo
                    const enginePayload = {
                        branch: irPayload.metadata[0]?.branch,
                        repoUrl: irPayload.metadata[0]?.repoUrl,
                        ir: irPayload.irJson
                    };

                    // Call the Python/Engine API
                    fetch('http://localhost:8900/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(enginePayload)
                    })
                    .then(async (response) => {
                        if (!response.ok) {
                            throw new Error(`Engine Status: ${response.status}`);
                        }
                        
                        // UI State Update
                        updateStatus(targetNode.id, 'completed', 'Analysis Complete. Click to View.', { payload: irPayload });

                        // Triggering Browser Notification
                        if (Notification.permission === 'granted') {
                            new Notification('Aegis Analysis Complete', {
                                body: 'You can now view the results!',
                                icon: '/health.ico' 
                            });
                        } else {
                            alert('Aegis Analysis Complete! You can now view the results.');
                        }
                    })
                    .catch((error) => {
                        console.error('Aegis background analysis failed:', error);
                        updateStatus(targetNode.id, 'error', `Analysis Failed: ${error.message}`);
                    });
                }
                else if (targetNode.type === 'FORMAL_VIZ') {
                    // Expects Combined Result Packet from FORMAL_VERIFY
                    const { result, systemInfo } = payload;
                    
                    if(!result || (!result.status && !result.suggestions)) throw new Error("Invalid input: Expected Verification Result");

                    updateStatus(targetNode.id, 'completed', 'Results Ready.', { 
                        verificationResult: result,
                        systemInfo: systemInfo
                    });
                }

            } catch (err: any) {
                updateStatus(targetNode.id, 'failed', `Error: ${err.message}`);
            }
        }
    };

    // --- Renderers ---

    const renderCardContent = (node: NodeData) => {
        switch (node.type) {
            case 'SYSTEM_INPUT': return <SystemInputCard node={node} updateNodeData={updateNodeData} />;
            case 'MULTI_REPO':
                return (
                    <div className="mt-2 text-center p-3 border border-dashed border-slate-700 bg-slate-800/50 rounded-lg">
                        <span className="text-xs text-slate-400 italic">Link to a System Source</span>
                    </div>
                );
            case 'COMPONENT_GENERATE': {
                const rolePriorities = node.data.rolePriorities || [
                    { role: 'ADMIN', priority: 1 }, 
                    { role: 'USER', priority: 10 }
                ];

                // Calculating the priorities within a 1-10 scale based on position
                const recalculatePriorities = (rolesArray: any[]) => {
                    const n = rolesArray.length;
                    if (n === 0) return [];
                    if (n === 1) return [{ ...rolesArray[0], priority: 1 }];
                    
                    return rolesArray.map((r, i) => ({
                        ...r,
                        priority: Math.round(1 + (i / (n - 1)) * 9)
                    }));
                };

                // Saving to React Flow Node State
                const saveRoles = (newRoles: any[]) => {
                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, rolePriorities: newRoles } } : n));
                };

                const updateRoleName = (index: number, value: string) => {
                    const newRoles = [...rolePriorities];
                    newRoles[index].role = value.toUpperCase().replace(/^ROLE_/i, '');
                    saveRoles(newRoles);
                };

                const addRole = () => {
                    saveRoles(recalculatePriorities([...rolePriorities, { role: '', priority: 0 }]));
                };

                const removeRole = (index: number) => {
                    saveRoles(recalculatePriorities(rolePriorities.filter((_: any, i: number) => i !== index)));
                };

                // Fliping the priorites feature
                const reverseRoles = () => {
                    const reversed = [...rolePriorities].reverse();
                    saveRoles(recalculatePriorities(reversed));
                };

                // Facilitating drag and drop of roles into their desired priority
                const handleDragStart = (e: React.DragEvent, index: number) => {
                    e.stopPropagation(); 
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', index.toString());
                };

                const handleDrop = (e: React.DragEvent, targetIndex: number) => {
                    e.preventDefault();
                    e.stopPropagation(); 
                    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                    if (sourceIndex === targetIndex || isNaN(sourceIndex)) return;

                    const newRoles = [...rolePriorities];
                    const [movedItem] = newRoles.splice(sourceIndex, 1);
                    newRoles.splice(targetIndex, 0, movedItem);
                    
                    saveRoles(recalculatePriorities(newRoles));
                };

                return (
                    <div className="space-y-3 mt-2">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-1">
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Role Priority</div>
                            <div className="flex items-center gap-2">
                                <span className="text-[8px] text-slate-500 uppercase tracking-wider" title="Top = Highest Priority">Top=High</span>
                                <button 
                                    onClick={reverseRoles}
                                    className="text-[9px] flex items-center gap-1 text-slate-400 hover:text-teal-400 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-teal-700/50 px-1.5 py-0.5 rounded transition-all"
                                    title="Flip Order"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                    </svg>
                                    Flip Priority
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                            {rolePriorities.map((role: any, index: number) => (
                                <div 
                                    key={`role-${index}`} 
                                    className="nodrag flex gap-1.5 items-center relative group bg-slate-950 border border-slate-700 rounded focus-within:border-teal-500 overflow-hidden transition-colors cursor-grab active:cursor-grabbing"
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(e) => handleDrop(e, index)}
                                >
                                    {/* Drag Handle */}
                                    <div className="px-1.5 py-1 text-slate-600 hover:text-teal-400 flex items-center justify-center bg-slate-900 border-r border-slate-700" title="Drag to reorder">
                                        <svg className="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
                                    </div>
                                    
                                    {/* Role Input with Prefix */}
                                    <span className="text-[9px] font-mono text-slate-500 select-none ml-1 pointer-events-none">
                                        ROLE_
                                    </span>
                                    <input 
                                        type="text" 
                                        placeholder="ADMIN" 
                                        value={role.role} 
                                        // Added nodrag here as well to ensure text selection works
                                        className="nodrag w-full text-[10px] bg-transparent py-1 pr-1 outline-none font-mono text-teal-400 placeholder:text-slate-700 cursor-text" 
                                        onChange={(e) => updateRoleName(index, e.target.value)} 
                                    />

                                    {/* Remove Role Button */}
                                    <button 
                                        onClick={() => removeRole(index)} 
                                        className={`text-slate-600 hover:text-red-400 text-xs font-bold px-2 transition-opacity ${rolePriorities.length > 1 ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 pointer-events-none'}`}
                                        title="Remove Role"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                        
                        {/* Add Role Button */}
                        <button 
                            onClick={addRole} 
                            className="w-full py-1 text-[10px] text-teal-400 border border-dashed border-teal-800 rounded hover:bg-teal-900/30 transition-colors"
                        >
                            + Add Role
                        </button>
                    </div>
                );
            }
            case 'COMPONENT_HOLDER': {
                return (
                    <div className="mt-2 space-y-2">
                         {node.data.componentPayload? (
                            <>
                                <div className="p-2 bg-slate-950 border border-slate-700 rounded mb-2 flex flex-col gap-1 text-center">
                                    <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Components & Endpoints</span>
                                    <span className="font-mono text-xs text-orange-400 break-all">
                                        Identified
                                    </span>
                                </div>

                                <button 
                                    onClick={() => {
                                        const blob = new Blob([JSON.stringify(node.data.componentPayload?.components, null, 2)], {type: "application/json"});
                                        saveAs(blob, "components.json");
                                    }}
                                    className="w-full py-1.5 text-xs bg-orange-600 hover:bg-orange-500 text-white rounded font-medium shadow transition-colors flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    Download Components
                                </button>
                                
                                <button 
                                    onClick={() => {
                                        const blob = new Blob([JSON.stringify(node.data.componentPayload?.endpoints, null, 2)], {type: "application/json"});
                                        saveAs(blob, "endpoints.json");
                                    }}
                                    className="w-full py-1.5 text-xs bg-rose-600 hover:bg-rose-500 text-white rounded font-medium shadow transition-colors flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    Download Endpoints
                                </button>
                            </>
                         ) : <span className="text-xs text-slate-500 italic block text-center py-2">Waiting for Component Generation...</span>}
                    </div>
                );
            } 
            case 'UPLOAD_IR':
                return (
                    <div className="mt-2">
                        {node.data.payload?.irJson ? (
                            <div className="w-full min-h-[96px] flex flex-col items-center justify-center border border-emerald-500/30 bg-emerald-900/10 rounded-lg p-2">
                                <div className="text-emerald-400 font-bold text-sm mb-1">✓ JSON Ready</div>
                                <div className="text-emerald-600 text-xs font-mono break-all text-center max-h-8 overflow-hidden">{node.data.payload?.systemName || node.data?.systemName}</div>
                                <button 
                                    onClick={() => setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, payload: undefined } } : n))}
                                    className="mt-2 text-[10px] underline text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    Replace File
                                </button>
                            </div>
                        ) : (
                            <InlineDropzone onFileSelect={async (f) => {
                                try {
                                    const text = await f.text();
                                    const json = JSON.parse(text);
                                    setNodes(nodes.map(n => n.id === node.id ? { 
                                        ...n, 
                                        data: { ...n.data, payload: { irJson: json, systemName: f.name,metadata: [{ repoUrl: 'Local', branch: 'main', commitId: 'HEAD' }]}} 
                                    } : n));
                                } catch(e) {
                                    alert("Invalid JSON File");
                                }
                            }} />
                        )}
                    </div>
                );
            case 'IR_HOLDER':
                return (
                    <div className="mt-2">
                         {node.data.payload?.irJson ? (
                            <button 
                                onClick={() => {
                                    const blob = new Blob([JSON.stringify(node.data.payload?.irJson, null, 2)], {type: "application/json"});
                                    saveAs(blob, "pipeline_ir.json");
                                }}
                                className="w-full py-1.5 text-xs bg-yellow-600 hover:bg-yellow-500 text-white rounded font-medium shadow transition-colors"
                            >
                                Download JSON
                            </button>
                         ) : <span className="text-xs text-slate-500 italic">Waiting for input...</span>}
                    </div>
                );
            case 'FORMAL_VERIFY':
                return (
                    <div className="mt-2">
                         {node.data.verificationResult ? (
                            <button 
                                onClick={() => {
                                    const blob = new Blob([JSON.stringify(node.data.verificationResult, null, 2)], {type: "application/json"});
                                    saveAs(blob, "verification_result.json");
                                }}
                                className="w-full py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded font-medium shadow transition-colors"
                            >
                                Download Result
                            </button>
                         ) : <span className="text-xs text-slate-500 italic">Waiting for IR...</span>}
                    </div>
                );
            case 'SCENARIO_GENERATE': {
                const scPayload = node.data.scenarioPayload;
                const selectedScenarios = node.data.selectedScenarios || [];
                const isExpanded = node.data.isExpanded || false;
                
                // Filtering States 
                const filterEndpointText = node.data.filterEndpointText || '';
                const filterShowInconsistenciesOnly = node.data.filterShowInconsistenciesOnly || false;

                if (!scPayload) {
                    return (
                        <div className="mt-2 text-center p-3 border border-dashed border-slate-700 bg-slate-800/50 rounded-lg">
                            <span className="text-xs text-slate-400 italic">Waiting for Component Generation...</span>
                        </div>
                    );
                }

                // Filtering Logic
                const displayedScenarios = scPayload.scenarios.filter((s: any) => {
                    const matchesText = s.endpoint.toLowerCase().includes(filterEndpointText.toLowerCase());
                    const matchesInconsistencies = filterShowInconsistenciesOnly 
                        ? (s.policy_inconsistencies && s.policy_inconsistencies.length > 0) 
                        : true;
                    return matchesText && matchesInconsistencies;
                });

                // Updated to respect active filters
                const setAllScenarios = (selected: boolean) => {
                    const targetScenarios = isExpanded ? displayedScenarios : scPayload.scenarios;
                    let newSelected = [...selectedScenarios];
                    
                    if (selected) {
                        const targetIds = targetScenarios.map((s: any) => s.scenario_id);
                        newSelected = Array.from(new Set([...newSelected, ...targetIds]));
                    } else {
                        const targetIds = new Set(targetScenarios.map((s: any) => s.scenario_id));
                        newSelected = newSelected.filter(id => !targetIds.has(id));
                    }
                    
                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, selectedScenarios: newSelected } } : n));
                };

                const toggleScenario = (id: string) => {
                    const newSelected = selectedScenarios.includes(id)
                        ? selectedScenarios.filter(s => s !== id)
                        : [...selectedScenarios, id];
                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, selectedScenarios: newSelected } } : n));
                };

                const toggleExpand = (e: React.MouseEvent) => {
                    e.stopPropagation(); 
                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, isExpanded: !isExpanded } } : n));
                };

                // Filter handlers
                const handleFilterTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, filterEndpointText: e.target.value } } : n));
                };
                
                const handleFilterInconsistenciesChange = () => {
                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, filterShowInconsistenciesOnly: !filterShowInconsistenciesOnly } } : n));
                };

                return (
                    <div className="mt-2 space-y-2">
                        <div className="flex flex-col gap-1 mb-2">
                            <div className="flex items-center justify-between">
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    Generated Scenarios
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-indigo-400 font-bold" title="Selected / Total">
                                        {selectedScenarios.length} / {scPayload.scenarios.length}
                                        {isExpanded && displayedScenarios.length !== scPayload.scenarios.length && (
                                            <span className="text-slate-500 ml-1">({displayedScenarios.length} visible)</span>
                                        )}
                                    </span>
                                    <button 
                                        onClick={toggleExpand}
                                        className="px-1.5 py-0.5 text-[9px] bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors font-bold shadow flex items-center gap-1"
                                    >
                                        {isExpanded ? (
                                            <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 14h6m0 0v6m0-6l-7 7m17-11h-6m0 0V4m0 6l7-7M4 10h6m0 0V4m0 6l-7-7m17 11h-6m0 0v6m0-6l7 7" /></svg> Minimize</>
                                        ) : (
                                            <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg> Expand</>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* FILTER BAR */}
                            {isExpanded && (
                                <div className="flex items-center gap-2 mt-1 mb-1 p-1.5 bg-slate-900/60 rounded border border-slate-700/50">
                                    <input 
                                        type="text"
                                        placeholder="Filter by endpoint..."
                                        value={filterEndpointText}
                                        onChange={handleFilterTextChange}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                    <label className={`flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded border transition-colors ${filterShowInconsistenciesOnly ? 'bg-rose-950/40 border-rose-500/50' : 'bg-slate-950 border-slate-700 hover:border-slate-500'}`}>
                                        <input 
                                            type="checkbox"
                                            checked={filterShowInconsistenciesOnly}
                                            onChange={handleFilterInconsistenciesChange}
                                            className="accent-rose-500"
                                        />
                                        <span className={`text-[9px] font-bold uppercase tracking-wider ${filterShowInconsistenciesOnly ? 'text-rose-400' : 'text-slate-500'}`}>
                                            Inconsistencies Only
                                        </span>
                                    </label>
                                </div>
                            )}
                            
                            {/* Select All / Deselect All Controls */}
                            <div className="flex gap-3 mt-1">
                                <button 
                                    onClick={() => setAllScenarios(true)}
                                    className="text-[9px] text-indigo-400 hover:text-indigo-300 transition-colors uppercase font-bold tracking-tighter underline decoration-indigo-800 underline-offset-2"
                                >
                                    Select All {isExpanded && "Visible"}
                                </button>
                                <button 
                                    onClick={() => setAllScenarios(false)}
                                    className="text-[9px] text-slate-500 hover:text-rose-400 transition-colors uppercase font-bold tracking-tighter underline decoration-slate-800 underline-offset-2"
                                >
                                    Deselect All {isExpanded && "Visible"}
                                </button>
                            </div>
                        </div>
                        
                        {/* Scrollable Checkbox List (Iterates over displayedScenarios) */}
                        <div className={`space-y-2 overflow-y-auto pr-1 custom-scrollbar transition-all duration-300 ${isExpanded ? 'max-h-[600px]' : 'max-h-48'}`}>
                            {displayedScenarios.length === 0 ? (
                                <div className="text-center py-4 text-[10px] text-slate-500 italic">
                                    No scenarios match your filters.
                                </div>
                            ) : displayedScenarios.map((s: any) => (
                                <label 
                                    key={s.scenario_id} 
                                    className={`
                                        flex items-start gap-3 p-3 bg-slate-950 border rounded cursor-pointer transition-all
                                        ${selectedScenarios.includes(s.scenario_id) ? 'border-indigo-500/50 bg-indigo-900/10' : 'border-slate-800 hover:border-slate-700'}
                                    `}
                                >
                                    <input 
                                        type="checkbox" 
                                        checked={selectedScenarios.includes(s.scenario_id)}
                                        onChange={() => toggleScenario(s.scenario_id)}
                                        className="mt-0.5 accent-indigo-500 rounded border-slate-700"
                                    />
                                    <div className="flex flex-col w-full min-w-0">
                                        {/* HEADER: Method and Endpoint */}
                                        <div className="flex items-start gap-2">
                                            <span className={`mt-0.5 text-[9px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap ${s.method === 'GET' ? 'bg-blue-900/50 text-blue-400' : s.method === 'POST' ? 'bg-green-900/50 text-green-400' : s.method === 'DELETE' ? 'bg-red-900/50 text-red-400' : s.method === 'PUT' ? 'bg-amber-900/50 text-amber-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                                                {s.method}
                                            </span>
                                            <span className={`text-[11px] font-mono font-semibold ${isExpanded ? 'whitespace-normal break-all text-slate-200' : 'truncate text-slate-300'}`} title={s.endpoint}>
                                                {s.endpoint}
                                            </span>
                                        </div>
                                        
                                        {/* EXPECTED OUTCOME */}
                                        <span className={`text-[10px] text-slate-400 mt-1 ${isExpanded ? 'whitespace-normal' : 'truncate'}`}>
                                            {s.expected_outcome}
                                        </span>

                                        {/* EXPANDED DETAILS */}
                                        {isExpanded && (
                                            <div className="mt-3 flex flex-col gap-2.5 text-[10px] border-t border-slate-800/80 pt-3">
                                                
                                                {/* Top Meta Info */}
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                                    <div><span className="text-slate-500 font-bold uppercase tracking-wider">Service:</span> <span className="text-slate-300 font-mono ml-1">{s.service_name}</span></div>
                                                    {s.scenario_category && (
                                                        <div><span className="text-slate-500 font-bold uppercase tracking-wider">Category:</span> <span className="text-indigo-300 ml-1">{s.scenario_category}</span></div>
                                                    )}
                                                </div>

                                                {/* Auth, Tags & Sensitivity Badges */}
                                                <div className="flex flex-wrap gap-1.5">
                                                    {s.sensitivity_type && (
                                                        <span className="bg-slate-800 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide">
                                                            Sensitivity: {s.sensitivity_type}
                                                        </span>
                                                    )}
                                                    {s.handles_pii && (
                                                        <span className="bg-amber-900/20 border border-amber-700/50 text-amber-400 px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1">
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                            HANDLES PII
                                                        </span>
                                                    )}
                                                    {(s.max_depth > 0 || s.total_calls > 1) && (
                                                        <span className="bg-slate-800 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                                            Chain Depth: {s.max_depth} (Calls: {s.total_calls})
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Roles & Status Matrix Grid */}
                                                <div className="grid grid-cols-2 gap-2 mt-1">
                                                    {/* Allowed Roles */}
                                                    <div className="bg-slate-900/60 p-2 rounded border border-slate-800/50">
                                                        <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider mb-1.5 block">Allowed Roles</span>
                                                        <div className="flex flex-wrap gap-1">
                                                            {s.allowed_roles?.length > 0 ? s.allowed_roles.map((r: string) => (
                                                                <span key={r} className="bg-emerald-900/20 border border-emerald-800/50 text-emerald-400 px-1.5 py-0.5 rounded font-mono text-[9px]">{r}</span>
                                                            )) : <span className="text-slate-600 italic">No Restriction</span>}
                                                        </div>
                                                    </div>

                                                    {/* Denied / Expected Statuses */}
                                                    <div className="bg-slate-900/60 p-2 rounded border border-slate-800/50">
                                                        <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider mb-1.5 block">Expected Status Matrix</span>
                                                        <div className="flex flex-col gap-1">
                                                            {s.expected_status_by_role && Object.keys(s.expected_status_by_role).length > 0 ? (
                                                                Object.entries(s.expected_status_by_role).map(([role, status]) => (
                                                                    <div key={role} className="flex justify-between items-center text-[9px] font-mono">
                                                                        <span className="text-slate-400">{role}</span>
                                                                        <span className={String(status).startsWith('2') ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                                                            {status as string}
                                                                        </span>
                                                                    </div>
                                                                ))
                                                            ) : <span className="text-slate-600 italic">No matrix available</span>}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Policy Inconsistencies Alert */}
                                                {s.policy_inconsistencies && s.policy_inconsistencies.length > 0 && (
                                                    <div className="bg-rose-950/20 border border-rose-900/40 p-2 rounded mt-1">
                                                        <span className="text-rose-400 font-bold uppercase text-[9px] tracking-wider flex items-center gap-1.5 mb-1.5">
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                            </svg>
                                                            Policy Inconsistencies Detected
                                                        </span>
                                                        <ul className="space-y-1.5">
                                                            {s.policy_inconsistencies.map((inc: any, idx: number) => (
                                                                <li key={idx} className="bg-rose-950/40 border border-rose-900/50 p-1.5 rounded flex flex-col gap-0.5">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="bg-rose-900/80 text-rose-100 px-1 py-0.5 rounded text-[8px] font-bold tracking-wider">
                                                                            {inc.role || 'UNKNOWN ROLE'}
                                                                        </span>
                                                                        <span className="text-rose-300 text-[9px] font-bold">
                                                                            {inc.type}
                                                                        </span>
                                                                    </div>
                                                                    <span className="text-rose-200/70 text-[8px] font-mono break-words leading-tight mt-0.5">
                                                                        {inc.details?.reason 
                                                                            ? inc.details.reason 
                                                                            : `Upstream/Downstream mismatch detected affecting: ${inc.details?.downstream_endpoint?.split(':')[0] || 'Unknown Service'}`
                                                                        }
                                                                    </span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {/* ID Footer */}
                                                <div className="text-slate-600 font-mono text-[8px] mt-1 break-all">
                                                    ID: {s.scenario_id}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                );
            }
            case 'PROMPT_GENERATE': {
                // 1. Extract and check for existence safely
                const prompts = node.data.promptPayload?.prompts;
                const hasPrompts = Array.isArray(prompts) && prompts.length > 0;

                // 2. Look for the upstream scenario node for the counter
                const scenarioNode = nodes.find(n => 
                    n.type === 'SCENARIO_GENERATE' && 
                    connections.some(c => c.source === n.id && c.target === node.id)
                );
                const selectedCount = scenarioNode?.data.selectedScenarios?.length || 0;

                return (
                    <div className="mt-2 space-y-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                </svg>
                                Target Language
                            </label>
                            <div className="relative group">
                                <select
                                    value={node.data.language || 'java'}
                                    onChange={(e) => updateNodeData(node.id, { language: e.target.value })}
                                    className="w-full appearance-none bg-slate-900/80 border border-slate-700 hover:border-slate-500 rounded-lg py-2 pl-3 pr-8 text-xs font-medium text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all cursor-pointer shadow-inner"
                                >
                                    <option value="java">Java (JUnit + MockMvc)</option>
                                    <option value="python">Python (Pytest + Requests)</option>
                                    <option value="curl">cURL (Bash Scripts)</option>
                                </select>
                                
                                <div className="absolute inset-y-0 right-0 flex items-center px-2.5 pointer-events-none text-slate-500 group-hover:text-emerald-400 transition-colors">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        {!hasPrompts ? (
                            <div className="space-y-2">
                                <div className="text-center py-2 px-3 border border-dashed border-slate-700 bg-slate-800/30 rounded-lg">
                                    <span className="text-[10px] text-slate-400 italic">
                                        {selectedCount > 0 
                                            ? `${selectedCount} scenarios selected` 
                                            : "Select scenarios above first"}
                                    </span>
                                </div>
                                <button 
                                    disabled={selectedCount === 0 || node.status === 'running'}
                                    onClick={() => runFromNode(node.id)}
                                    className={`
                                        w-full py-2 text-xs rounded font-bold transition-all flex items-center justify-center gap-2
                                        ${selectedCount > 0 
                                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg' 
                                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'}
                                    `}
                                >
                                    {node.status === 'running' ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                    )}
                                    Generate Prompts
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="p-3 bg-slate-950 border border-emerald-500/30 rounded-lg text-center">
                                    <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mb-1">Status</div>
                                    <div className="text-xs text-white">
                                        {prompts?.length || 0} Prompts Ready
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={() => {
                                            // Safeguard using optional chaining and a fallback
                                            const dataToSave = node.data.promptPayload ?? { prompts: [] };
                                            const blob = new Blob(
                                                [JSON.stringify(dataToSave, null, 2)], 
                                                { type: "application/json" }
                                            );
                                            saveAs(blob, `prompts_${Date.now()}.json`);
                                        }}
                                        className="w-full py-1.5 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold shadow transition-all"
                                    >
                                        Download JSON
                                    </button>
                                    <button 
                                        disabled={node.status === 'running'}
                                        onClick={() => runFromNode(node.id)}
                                        className="w-full py-1.5 text-[10px] border border-emerald-800 text-emerald-500 hover:bg-emerald-900/20 rounded font-bold transition-all"
                                    >
                                        {node.status === 'running' ? 'Updating...' : 'Regenerate'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            }
            case 'TEST_GENERATE': {
                const promptNode = nodes.find(n => 
                    n.type === 'PROMPT_GENERATE' && 
                    connections.some(c => c.source === n.id && c.target === node.id)
                );
                const availablePrompts = promptNode?.data.promptPayload?.prompts?.length || 0;
                const targetLanguage = promptNode?.data.language || 'java'; 
                const hasTests = !!node.data.testSuitePayload;
                const selectedLlm = node.data.selectedLlm || 'gpt-4o-mini';

                // Helper to update dropdown state locally
                const handleLlmChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
                    setNodes(nodes.map(n => n.id === node.id ? { 
                        ...n, 
                        data: { ...n.data, selectedLlm: e.target.value } 
                    } : n));
                };

                return (
                    <div className="mt-2 space-y-3">
                        {/* LLM Selection Dropdown */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                {/* AI Sparkles Icon */}
                                <svg className="w-3 h-3 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                </svg>
                                Select LLM Engine
                            </label>
                            
                            <div className="relative group">
                                <select 
                                    value={selectedLlm}
                                    onChange={handleLlmChange}
                                    disabled={node.status === 'running'}
                                    className="w-full appearance-none bg-slate-900/80 border border-slate-700 hover:border-slate-500 rounded-lg py-2 pl-3 pr-8 text-xs font-medium text-slate-200 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all cursor-pointer shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <option value="gpt-4o-mini">OpenAI GPT-4o-mini</option>
                                    <option value="gpt-4-turbo">OpenAI GPT-4 Turbo</option>
                                    <option value="claude-3-5-sonnet">Anthropic Claude 3.5 Sonnet</option>
                                    <option value="claude-3-opus">Anthropic Claude 3 Opus</option>
                                    <option value="llama-3-70b">Meta Llama 3 70B</option>
                                </select>
                                
                                {/* Custom sleek arrow overlay */}
                                <div className={`absolute inset-y-0 right-0 flex items-center px-2.5 pointer-events-none transition-colors ${node.status === 'running' ? 'text-slate-600' : 'text-slate-500 group-hover:text-purple-400'}`}>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        {!hasTests ? (
                            <div className="space-y-2">
                                <div className="text-center py-2 px-3 border border-dashed border-slate-700 bg-slate-800/30 rounded-lg">
                                    <span className="text-[10px] text-slate-400 italic">
                                        {availablePrompts > 0 
                                            ? `${availablePrompts} prompts ready for execution` 
                                            : "Connect to Prompts Card"}
                                    </span>
                                </div>
                                <button 
                                    disabled={availablePrompts === 0 || node.status === 'running'}
                                    onClick={() => runFromNode(node.id)}
                                    className={`
                                        w-full py-2 text-xs rounded font-bold transition-all flex items-center justify-center gap-2
                                        ${availablePrompts > 0 
                                            ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg' 
                                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'}
                                    `}
                                >
                                    {node.status === 'running' ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                    )}
                                    Execute LLM
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="p-3 bg-slate-950 border border-purple-500/30 rounded-lg text-center">
                                    <div className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mb-1">Generated</div>
                                    <div className="text-xs text-white">
                                        {node.data.testSuitePayload?.tests?.length || 0} {targetLanguage === 'curl' ? 'Bash Scripts' : targetLanguage.toUpperCase() + ' Test Classes'} 
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={async () => {
                                            const tests = node.data.testSuitePayload?.tests || [];
                                            if (tests.length === 0) return;

                                            // 1. Create a new zip instance
                                            const zip = new JSZip();
                                            const folder = zip.folder(`test_suite_${selectedLlm}`);
                                            
                                            let ext = 'java';
                                            let prefix = 'SecurityTest_';
                                            if (targetLanguage === 'python') {
                                                ext = 'py';
                                                prefix = 'test_';
                                            } else if (targetLanguage === 'curl') {
                                                ext = 'sh';
                                                prefix = 'test_';
                                            }

                                            // 2. Add each test to the zip as a .java file
                                            tests.forEach((test, index) => {
                                                const safeName = (test.scenario_id || `scenario_${index}`).replace(/[^a-zA-Z0-9]/g, '_');
                                                const filename = `${prefix}${safeName}.${ext}`;
                                                folder?.file(filename, test.test_code);
                                            });

                                            // 3. Generate the zip blob and trigger download
                                            try {
                                                const blob = await zip.generateAsync({ type: "blob" });
                                                saveAs(blob, `test_suite_${selectedLlm}_${Date.now()}.zip`);
                                            } catch (error) {
                                                console.error("Failed to generate zip file", error);
                                            }
                                        }}
                                        className="w-full py-1.5 text-[10px] bg-purple-600 hover:bg-purple-500 text-white rounded font-bold shadow transition-all"
                                    >
                                        Download Test Suite (.zip)
                                    </button>
                                    <button 
                                        disabled={node.status === 'running'}
                                        onClick={() => runFromNode(node.id)}
                                        className="w-full py-1.5 text-[10px] border border-purple-800 text-purple-500 hover:bg-purple-900/20 rounded font-bold transition-all"
                                    >
                                        {node.status === 'running' ? 'Executing...' : 'Regenerate Tests'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            }
            case 'VISUALIZATION':
                return (
                     <button 
                        disabled={!node.data.payload?.irJson} 
                        onClick={() => navigate('/graph-visualize', { state: { irData: node.data.payload?.irJson, fromPipeline: true } })} 
                        className="mt-2 w-full py-1.5 text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium shadow transition-colors"
                    >
                        Launch Visualizer
                    </button>
                );
            case 'AEGIS':
                return (
                    <button 
                        disabled={!node.data.payload?.irJson || node.status !== 'completed'}
                        className={`
                            mt-2 w-full py-1.5 text-xs text-white rounded font-medium shadow transition-colors
                            ${node.status === 'completed' 
                                ? 'bg-red-600 hover:bg-red-500' 
                                : 'bg-slate-700 opacity-50 cursor-not-allowed'}
                        `}
                        onClick={() => {
                            const meta = node.data.payload?.irJson.id;
                            if (!meta) return;
                            const params = new URLSearchParams({
                                id: meta
                            }).toString();

                            window.open(`http://localhost:5600/visualize?${params}`);
                        }}
                    >
                        {node.status === 'running' ? 'Analyzing...' : 'Launch Aegis'}
                    </button>
                );
            case 'FORMAL_VIZ':
                 return (
                     <button 
                        disabled={!node.data.verificationResult}
                        onClick={() => navigate('/verification-results', { 
                            state: { 
                                result: node.data.verificationResult,
                                systemInfo: node.data.systemInfo,
                                fromPipeline: true 
                            } 
                        })}
                        className="mt-2 w-full py-1.5 text-xs bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white rounded font-medium shadow transition-colors"
                    >
                        View Results
                    </button>
                );
            case 'TEST_EXECUTOR': {
                const testNode = nodes.find(n => 
                    n.type === 'TEST_GENERATE' && 
                    connections.some(c => c.source === n.id && c.target === node.id)
                );
                
                const promptNode = nodes.find(n => 
                    n.type === 'PROMPT_GENERATE' && 
                    testNode && 
                    connections.some(c => c.source === n.id && c.target === testNode.id)
                );

                const roleSet = new Set<string>();

                const componentNode = nodes.find(n => n.type === 'COMPONENT_GENERATE');
                if (componentNode?.data.rolePriorities) {
                    componentNode.data.rolePriorities.forEach((r: any) => roleSet.add(r.role));
                }

                const scenarioNode = nodes.find(n => n.type === 'SCENARIO_GENERATE');
                if (scenarioNode?.data.scenarioPayload?.scenarios) {
                    scenarioNode.data.scenarioPayload.scenarios.forEach((s: any) => {
                        if (Array.isArray(s.allowed_roles)) {
                            s.allowed_roles.forEach((r: string) => roleSet.add(r));
                        }
                        if (Array.isArray(s.denied_roles)) {
                            s.denied_roles.forEach((r: string) => roleSet.add(r));
                        }
                    });
                }

                const systemRoles = Array.from(roleSet);

                // Setup variables
                const tests = testNode?.data.testSuitePayload?.tests || [];
                const hasTests = tests.length > 0;
                const targetLanguage = promptNode?.data.language || 'java';
                const targetUrl = node.data.targetUrl || 'http://localhost:1234';

                return (
                    <div className="mt-2 space-y-3">
                        <div className="text-[10px] text-slate-400 leading-relaxed">
                            Passes generated tests to the interactive executor environment.
                        </div>

                        {/* Target URL Input */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <svg className="w-3 h-3 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                </svg>
                                Target System URL
                            </label>
                            <input 
                                type="text"
                                value={targetUrl}
                                onChange={(e) => updateNodeData(node.id, { targetUrl: e.target.value })}
                                placeholder="e.g. http://localhost:1234"
                                className="w-full bg-slate-900/80 border border-slate-700 hover:border-slate-500 rounded-lg py-2 px-3 text-xs font-mono text-slate-200 outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition-all shadow-inner"
                            />
                        </div>

                        {!hasTests ? (
                            <div className="space-y-2">
                                <div className="text-center py-2 px-3 border border-dashed border-slate-700 bg-slate-800/30 rounded-lg">
                                    <span className="text-[10px] text-slate-400 italic">
                                        Connect to a completed Test Generator first
                                    </span>
                                </div>
                                <button 
                                    disabled
                                    className="w-full py-2 text-xs rounded font-bold transition-all flex items-center justify-center gap-2 bg-slate-800 text-slate-500 cursor-not-allowed"
                                >
                                    Launch Executor
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {/* Status Box */}
                                <div className="p-3 bg-slate-950 border border-fuchsia-500/30 rounded-lg flex flex-col items-center">
                                    <div className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse shadow-[0_0_5px_rgba(217,70,239,0.5)]"></div>
                                        Ready
                                    </div>
                                    <div className="text-xs text-white text-center mb-1">
                                        <span className="font-bold text-fuchsia-300">{tests.length}</span> {targetLanguage.toUpperCase()} tests loaded
                                    </div>
                                </div>

                                {/* Launch Button */}
                                <button 
                                    onClick={() => {
                                        navigate('/executor', { 
                                            state: { 
                                                tests: tests, 
                                                language: targetLanguage,
                                                targetUrl: targetUrl,
                                                roles: systemRoles 
                                            } 
                                        });
                                    }}
                                    className="w-full py-2 text-xs bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded font-bold shadow-[0_0_15px_rgba(217,70,239,0.3)] hover:shadow-[0_0_20px_rgba(217,70,239,0.5)] transition-all flex items-center justify-center gap-2"
                                >
                                    Launch Test Executor
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>
                );
            }
            default: return null;
        }
    }

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col font-sans overflow-hidden">
            {/* Header */}
            <div className="h-16 border-b border-slate-700 bg-slate-800 flex items-center justify-between px-6 z-20 shadow-md">
                <div className="flex items-center gap-6">
                    {/* Styled Back Button */}
                    <button 
                        onClick={() => navigate('/')} 
                        className="group flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-400 bg-slate-800/50 hover:bg-slate-700 hover:text-white rounded-lg border border-slate-700/50 hover:border-slate-600 transition-all shadow-sm"
                    >
                        <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back
                    </button>
                    
                    {/* Title Section */}
                    <div className="flex items-center gap-3">
                        
                        {/* AridNova Custom Logo: "The Stellar Network" */}
                        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 via-violet-500 to-cyan-500 shadow-xl shadow-cyan-500/30 border border-white/10 group">
                            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                
                                {/* Outer Hexagon (Rotating slowly like a network hub) */}
                                <path 
                                    className="origin-center animate-[spin_12s_linear_infinite]" 
                                    strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                                    d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" 
                                />
                                
                                {/* Inner Nova Star (Pulsing to represent the active core) */}
                                <path 
                                    className="animate-pulse origin-center" 
                                    strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                    d="M12 7l1.5 3.5 3.5 1.5-3.5 1.5L12 17l-1.5-3.5-3.5-1.5 3.5-1.5L12 7z" 
                                />
                                
                                {/* Data Pipeline Connections (Pulsing out of sync with the star) */}
                                <path 
                                    className="animate-pulse origin-center" 
                                    style={{ animationDelay: '500ms' }}
                                    strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} opacity={0.5} 
                                    d="M12 3v4M20 7.5l-3 1.5M20 16.5l-3-1.5M12 21v-4M4 16.5l3-1.5M4 7.5l3 1.5" 
                                />
                            </svg>
                        </div>
                        
                        {/* Brand Name */}
                        <h1 className="font-black text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-cyan-400 to-teal-400">
                            AridNova
                        </h1>
                        
                        {/* Divider */}
                        <span className="text-slate-600 font-light text-2xl mx-1 mb-1">|</span>
                        
                        {/* Subtitle */}
                        <span className="text-[13px] font-semibold text-slate-400 tracking-wider uppercase mt-1">
                            Microservice Analysis Pipeline Creator
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                        {isLinking ? (
                             <span className="text-yellow-400 font-bold animate-pulse flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /></svg>
                                Select Target Node
                             </span>
                        ) : (
                            <>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500"></span> Drag cards</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> Link nodes</span>
                            </>
                        )}
                    </div>
                    {nodes.length > 0 && (
                        <button 
                            onClick={clearPipeline}
                            disabled={isRunning}
                            className="text-xs text-slate-500 hover:text-red-400 transition-colors mr-2"
                        >
                            Clear All
                        </button>
                    )}
                    <div className="relative group flex items-center">
                        <button 
                            onClick={runPipeline}
                            disabled={isRunning || nodes.length === 0}
                            className={`px-6 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 font-bold shadow-lg shadow-emerald-900/20 hover:scale-105 transition-all ${isRunning ? 'opacity-50 cursor-not-allowed hover:scale-100' : ''}`}
                        >
                            {isRunning ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    Processing...
                                </span>
                            ) : 'Run Pipeline'}
                        </button>
                        <div className="absolute top-full right-0 mt-2 w-max pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 bg-slate-800 text-slate-300 text-[11px] font-medium py-1.5 px-2.5 rounded-md shadow-xl border border-slate-700/50 normal-case tracking-normal">
                            Execute the created pipeline graph
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Toolbox */}
                <div className="w-72 border-r border-white/10 bg-slate-900/50 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-900/80">
                        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Toolbox</h2>
                        <div className="relative group flex items-center">
                            <button 
                                onClick={clearPipeline} 
                                className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors uppercase font-bold"
                            >
                                Clear
                            </button>
                            <div className="absolute top-full right-0 mt-2 w-max pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 bg-slate-800 text-slate-300 text-[11px] font-medium py-1.5 px-2.5 rounded-md shadow-xl border border-slate-700/50 tracking-normal normal-case">
                                Clear the constructed pipeline
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                        {Object.entries(CATEGORIES).map(([category, types]) => (
                            <div key={category} className="space-y-3">
                                {/* Category Header (Clickable) */}
                                <button 
                                    onClick={() => toggleCategory(category)}
                                    className="w-full flex items-center justify-between group"
                                >
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-tighter group-hover:text-slate-300 transition-colors">
                                        {category}
                                    </h3>
                                    <div className={`transition-transform duration-200 ${expandedCategories[category] ? 'rotate-180' : ''}`}>
                                        <svg className="w-3 h-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </button>

                                {/* Collapsible Content */}
                                {expandedCategories[category] && (
                                    <div className="grid gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                        {types.map(type => {
                                            const config = CARD_CONFIG[type];
                                            return (
                                                <button
                                                    key={type}
                                                    onClick={() => addNode(type)}
                                                    className="w-full p-3 rounded-xl bg-slate-800/40 border border-white/5 hover:border-blue-500/50 hover:bg-slate-800 transition-all text-left group"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="text-slate-400 group-hover:text-blue-400 transition-colors">
                                                            {React.cloneElement(config.icon, { className: 'w-5 h-5' })}
                                                        </div>
                                                        <div>
                                                            <div className="text-xs font-bold text-slate-200">{config.title}</div>
                                                            <div className="text-[9px] text-slate-500 leading-tight mt-0.5">{config.description}</div>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="p-4 border-t border-white/10 bg-slate-900/80 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.3)] z-10">
                        <button 
                            onClick={() => navigate('/explore')}
                            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20 hover:border-blue-400/50 hover:bg-blue-500/20 transition-all flex items-center justify-center gap-2 group"
                        >
                            <svg className="w-4 h-4 text-blue-400 group-hover:text-cyan-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span className="text-xs font-bold text-blue-400 group-hover:text-cyan-300 transition-colors uppercase tracking-widest">
                                Preview Features
                            </span>
                        </button>
                    </div>
                </div>

                {/* Canvas */}
                <div 
                    ref={canvasRef}
                    className="flex-1 relative overflow-hidden bg-slate-950 cursor-grab active:cursor-grabbing"
                    onDragOver={handleCanvasDragOver}
                    onDrop={handleCanvasDrop}
                    onWheel={handleWheel}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={() => setIsPanning(false)}
                    onMouseLeave={() => setIsPanning(false)}
                >
                    <div 
                        id="canvas-grid"
                        className="absolute inset-0 opacity-20 pointer-events-auto"
                        style={{
                            backgroundImage: `radial-gradient(circle, #475569 1px, transparent 1px)`,
                            backgroundSize: `${20 * scale}px ${20 * scale}px`,
                            backgroundPosition: `${offset.x}px ${offset.y}px`
                        }}
                    />

                    {/* Transformation Layer */}
                    <div 
                        style={{ 
                            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                            transformOrigin: '0 0'
                        }}
                        className="absolute inset-0 pointer-events-none"
                    >
                        <div className="pointer-events-auto">
                            {/* Connections Layer */}
                            <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 overflow-visible">
                                {connections.map(conn => {
                                    const start = nodes.find(n => n.id === conn.source);
                                    const end = nodes.find(n => n.id === conn.target);
                                    if (!start || !end) return null;
                                    
                                    const startX = start.x + 160; 
                                    const startY = start.y + 60;
                                    const endX = end.x;
                                    const endY = end.y + 60;

                                    return (
                                        <g key={conn.id}>
                                            <path 
                                                d={`M ${startX} ${startY} C ${startX + 80} ${startY}, ${endX - 80} ${endY}, ${endX} ${endY}`}
                                                stroke="#64748b" 
                                                strokeWidth="2" 
                                                fill="none" 
                                                strokeDasharray="8,4"
                                                className="animate-[dash_30s_linear_infinite]"
                                            />
                                            <circle cx={(startX + endX)/2} cy={(startY+endY)/2} r="8" fill="#1e293b" stroke="#ef4444" strokeWidth={1} className="pointer-events-auto cursor-pointer hover:fill-red-900" onClick={() => deleteConnection(conn.id)} />
                                            <text x={(startX + endX)/2} y={(startY+endY)/2} dy="3" textAnchor="middle" fill="#ef4444" fontSize="10" className="pointer-events-none font-bold">×</text>
                                        </g>
                                    );
                                })}
                                <style>{`@keyframes dash { to { stroke-dashoffset: -1000; } }`}</style>
                            </svg>

                            {/* Nodes Layer */}
                            {nodes.map(node => {
                                const config = CARD_CONFIG[node.type];
                                const isSource = isLinking === node.id;
                                
                                return (
                                    <div
                                        key={node.id}
                                        draggable
                                        onDragStart={(e) => handleNodeDragStart(e, node.id)}
                                        className={`
                                            absolute rounded-xl border backdrop-blur-md transition-all duration-300 ease-in-out
                                            ${node.data?.isExpanded ? 'w-[650px]' : 'w-80'}
                                            ${config.color} 
                                            ${isSource ? 'ring-2 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.3)]' : 'ring-1 ring-white/10 shadow-2xl'}
                                            ${node.status === 'running' ? 'ring-2 ring-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]' : ''}
                                            ${node.status === 'failed' ? 'ring-2 ring-red-500 bg-red-900/40' : ''}
                                        `}
                                        style={{ left: node.x, top: node.y, zIndex: node.data?.isExpanded ? 50 : 10 }}
                                    >
                                        {/* Card Header */}
                                        <div className="p-3 border-b border-white/10 flex items-center justify-between bg-slate-900/60 rounded-t-xl cursor-move handle">
                                            <div className="flex items-center gap-2">
                                                {config.icon}
                                                <span className="font-bold text-sm text-white tracking-tight">{config.title}</span>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                {/* Run Button */}
                                                {node.status !== 'running' && (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            runFromNode(node.id);
                                                        }}
                                                        className="p-2 rounded-full hover:bg-green-500/20 text-slate-400 hover:text-green-400 transition-all border border-transparent hover:border-green-500/30 active:scale-90 group/run flex items-center justify-center"
                                                        title="Run this step"
                                                    >
                                                        {/* Large, Rounded-Corner Play Icon */}
                                                        <svg 
                                                            className="w-7 h-7 fill-current ml-1" 
                                                            viewBox="0 0 24 24" 
                                                            xmlns="http://www.w3.org/2000/svg"
                                                        >
                                                            <path 
                                                                d="M8.5 6.1C7.8 5.7 7 6.2 7 7V17c0 .8.8 1.3 1.5.9l8.6-5c.7-.4.7-1.4 0-1.8l-8.6-5z" 
                                                                stroke="currentColor"
                                                                strokeWidth="1.5"
                                                                strokeLinejoin="round" 
                                                            />
                                                        </svg>
                                                    </button>
                                                )}

                                                {/* Link Button */}
                                                <button 
                                                    title="Link to..."
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleLinkClick(node.id, node.type);
                                                    }}
                                                    className={`p-1.5 rounded-lg transition-colors ${isLinking === node.id ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10 text-slate-400 hover:text-white'}`}
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                                    </svg>
                                                </button>

                                                {/* Delete Button */}
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        deleteNode(node.id);
                                                    }}
                                                    className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Card Body */}
                                        <div className="p-4 bg-slate-900/90 rounded-b-xl min-h-[100px]">
                                            <p className="text-[10px] text-slate-400 mb-2 uppercase tracking-wider font-bold">{config.description}</p>
                                            
                                            {renderCardContent(node)}

                                            {/* Logs */}
                                            {node.logs.length > 0 && (
                                                <div className="mt-3 pt-2 border-t border-slate-700/50 max-h-24 overflow-y-auto dark-scrollbar bg-black/20 rounded p-2">
                                                    {node.logs.map((log, i) => (
                                                        <div key={i} className="text-[10px] font-mono text-slate-300 truncate">
                                                            <span className="text-indigo-400 mr-1">›</span>{log}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                        </div>
                    </div>

                    <CanvasFooter scale={scale} />
                </div>
            </div>
        </div>
    );
};

export default PipelinePage;