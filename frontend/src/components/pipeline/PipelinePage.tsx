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
import { SystemInputCard } from './cards/SystemInputCard';
import { ComponentGenerateCard } from './cards/ComponentGenerateCard';
import { ComponentHolderCard } from './cards/ComponentHolder';
import { IRHolderCard } from './cards/IRHolderCard';
import { FormalVerifyCard } from './cards/FormalVerifyCard';
import { UploadIRCard } from './cards/UploadIRCard';
import { FormalVizCard } from './cards/FormalVizCard';
import { VisualizationCard } from './cards/VisualizationCard';
import { AegisCard } from './cards/AegisCard';
import { TestExecutorCard } from './cards/TestExecutorCard';
import { TestGenerateCard } from './cards/TestGenerateCard';
import { PromptGenerateCard } from './cards/PromptGenerateCard';
import { ScenarioGenerateCard } from './cards/ScenarioGenerateCard';
import { PipelineCanvas } from './canvas/PipelineCanvas';

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

    const handleLinkClick = (id: string, type: string) => {
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
            if (allowedTargets.includes(type as CardType)) {
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
            case 'COMPONENT_GENERATE': return <ComponentGenerateCard node={node} updateNodeData={updateNodeData} />;
            case 'COMPONENT_HOLDER': return <ComponentHolderCard node={node} />;
            case 'UPLOAD_IR': return <UploadIRCard node={node} updateNodeData={updateNodeData} />;
            case 'IR_HOLDER': return <IRHolderCard node={node} />;
            case 'FORMAL_VERIFY': return <FormalVerifyCard node={node} />;
            case 'SCENARIO_GENERATE': return (
                    <ScenarioGenerateCard 
                        node={node} 
                        updateNodeData={updateNodeData} 
                    />
                );
            case 'PROMPT_GENERATE': return (
                    <PromptGenerateCard 
                        node={node} 
                        nodes={nodes} 
                        connections={connections} 
                        updateNodeData={updateNodeData}
                        runFromNode={runFromNode}
                    />
                );
            case 'TEST_GENERATE': return (
                    <TestGenerateCard 
                        node={node} 
                        nodes={nodes} 
                        connections={connections} 
                        updateNodeData={updateNodeData}
                        runFromNode={runFromNode}
                    />
                );
            case 'VISUALIZATION': return <VisualizationCard node={node} />;
            case 'AEGIS': return <AegisCard node={node} />;
            case 'FORMAL_VIZ': return <FormalVizCard node={node} />;
            case 'TEST_EXECUTOR': return (
                    <TestExecutorCard 
                        node={node} 
                        nodes={nodes} 
                        connections={connections} 
                        updateNodeData={updateNodeData} 
                    />
                );
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
                             <span className="text-yellow-400 font-bold animate-pulse flex items-center gap-2">
                                <div className="flex items-center justify-center w-5 h-5"> 
                                    <svg 
                                        className="w-4 h-4 overflow-visible" 
                                        fill="none" 
                                        viewBox="0 0 24 24" 
                                        stroke="currentColor"
                                        style={{ strokeWidth: '2.5px' }}
                                    >
                                        <path 
                                            strokeLinecap="round" 
                                            strokeLinejoin="round" 
                                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" 
                                        />
                                    </svg>
                                </div>
                                <span className="leading-none">Select Target Node</span>
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
                            className={`
                                px-5 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-3
                                ${isRunning 
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:translate-y-0.5'}
                            `}
                        >
                            {isRunning ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    <span>Processing...</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                                        <path d="M10 8L16 12L10 16V8Z" fill="currentColor"/>
                                    </svg>
                                    <span>Run Pipeline</span>
                                </>
                            )}
                        </button>

                        <div className="absolute top-full right-0 mt-2 w-max pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 bg-slate-800 text-slate-300 text-[10px] py-1 px-2 rounded border border-slate-700">
                            Execute current graph
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
                <PipelineCanvas
                    canvasRef={canvasRef}
                    scale={scale}
                    offset={offset}
                    nodes={nodes}
                    connections={connections}
                    isLinking={isLinking}
                    setIsPanning={setIsPanning}
                    handleCanvasDragOver={handleCanvasDragOver}
                    handleCanvasDrop={handleCanvasDrop}
                    handleWheel={handleWheel}
                    handleCanvasMouseDown={handleCanvasMouseDown}
                    handleCanvasMouseMove={handleCanvasMouseMove}
                    deleteConnection={deleteConnection}
                    handleNodeDragStart={handleNodeDragStart}
                    runFromNode={runFromNode}
                    handleLinkClick={handleLinkClick}
                    deleteNode={deleteNode}
                    renderCardContent={renderCardContent}
                />
            </div>
        </div>
    );
};

export default PipelinePage;