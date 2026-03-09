import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { fetchIRFromRepo, verifySystem, RepositoryInput, VerificationInput } from '../../services/api';
import { CardType, SystemPayload, ComponentPayload, PipelinePayload, NodeData, Connection, ScenarioItem, ScenarioPayload} from './models'
import CanvasFooter from '../generic/CanvasFooter';

// --- CONFIGURATION ---

const CATEGORIES: Record<string, CardType[]> = {
    "Input": ['SYSTEM_INPUT', 'UPLOAD_IR'],
    "Generators": ['MULTI_REPO', 'COMPONENT_GENERATE'],
    "Intermediate Results": ['IR_HOLDER', 'COMPONENT_HOLDER'],
    "Processes": ['FORMAL_VERIFY', 'SCENARIO_GENERATE', 'PROMPT_GENERATE', 'TEST_GENERATE'],
    "Visualization": ['VISUALIZATION', 'FORMAL_VIZ', 'AEGIS']
};

const CARD_CONFIG: Record<CardType, { title: string; color: string; icon: JSX.Element; description: string }> = {
    SYSTEM_INPUT: { 
        title: "System Source", 
        color: "border-blue-500 bg-blue-900/20", 
        description: "Define GIT repositories",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
    },
    MULTI_REPO: { 
        title: "Generate IR", 
        color: "border-blue-500 bg-blue-900/20", 
        description: "Generate IR from GIT repository",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
    },
    UPLOAD_IR: { 
        title: "Upload IR", 
        color: "border-blue-500 bg-blue-900/20", 
        description: "Upload local JSON file",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
    },
    COMPONENT_GENERATE: { 
        title: "Get Components", 
        color: "border-teal-500 bg-teal-900/20", 
        description: "Extract components",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
    },
    IR_HOLDER: { 
        title: "IR Card", 
        color: "border-yellow-500 bg-yellow-900/20", 
        description: "Stores and exposes IR JSON",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
    },
    COMPONENT_HOLDER: { 
        title: "Component Card", 
        color: "border-orange-500 bg-orange-900/20", 
        description: "Stores Components & Endpoints",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
    },
    FORMAL_VERIFY: { 
        title: "Formal Verification", 
        color: "border-purple-500 bg-purple-900/20", 
        description: "Run system verification",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
    },
    SCENARIO_GENERATE: { 
        title: "Scenario Generation", 
        color: "border-indigo-500 bg-indigo-900/20", 
        description: "Generate RBAC Test Scenarios",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
    },
    PROMPT_GENERATE: { 
        title: "LLM Prompter", 
        color: "border-emerald-500 bg-emerald-900/20", 
        description: "Prepares LLM prompts for scenarios",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
    },
    TEST_GENERATE: { 
        title: "Test Suite Generation", 
        color: "border-purple-500 bg-purple-900/20", 
        description: "Generate Tests via LLM",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M12 15a3 3 0 100-6 3 3 0 000 6z" /></svg>
    },
    VISUALIZATION: { 
        title: "IR Visualization", 
        color: "border-green-500 bg-green-900/20", 
        description: "Launch graph visualizer",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
    },
    AEGIS: { 
        title: "Aegis", 
        color: "border-red-500 bg-red-900/20", 
        description: "Launch Aegis engine",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
    },
    FORMAL_VIZ: { 
        title: "Verification Visualization", 
        color: "border-pink-500 bg-pink-900/20", 
        description: "View verification results",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    }
};

const VALID_CONNECTIONS: Record<CardType, CardType[]> = {
    SYSTEM_INPUT: ['MULTI_REPO', 'COMPONENT_GENERATE'],
    MULTI_REPO: ['IR_HOLDER', 'FORMAL_VERIFY'],
    UPLOAD_IR: ['IR_HOLDER'],
    COMPONENT_GENERATE: ['COMPONENT_HOLDER'],
    COMPONENT_HOLDER: ['SCENARIO_GENERATE'],
    IR_HOLDER: ['FORMAL_VERIFY', 'VISUALIZATION', 'AEGIS'],
    SCENARIO_GENERATE: ['PROMPT_GENERATE'],
    PROMPT_GENERATE: ['TEST_GENERATE'],
    TEST_GENERATE: [],
    FORMAL_VERIFY: ['FORMAL_VIZ', 'SCENARIO_GENERATE'],
    VISUALIZATION: [], 
    AEGIS: [],        
    FORMAL_VIZ: []    
};

// --- HELPER COMPONENT FOR INLINE UPLOAD ---
const InlineDropzone = ({ onFileSelect }: { onFileSelect: (file: File) => void }) => {
    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles[0]) onFileSelect(acceptedFiles[0]);
    }, [onFileSelect]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        maxFiles: 1,
        accept: { 'application/json': ['.json'] }
    });

    return (
        <div {...getRootProps()} className={`
            w-full h-24 border border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all
            ${isDragActive ? 'border-blue-400 bg-blue-500/20' : 'border-slate-600 hover:border-blue-400 hover:bg-slate-800/50 bg-slate-900/30'}
        `}>
            <input {...getInputProps()} />
            {isDragActive ? (
                <p className="text-blue-400 text-xs font-bold animate-pulse">Drop JSON here...</p>
            ) : (
                <>
                    <svg className="w-6 h-6 text-slate-500 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-slate-400 text-[10px] text-center">Drag & drop IR JSON<br/><span className="text-[9px] text-slate-500 opacity-70">or click to browse</span></p>
                </>
            )}
        </div>
    );
};

// --- MAIN COMPONENT ---

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
        const newNode: NodeData = {
            id,
            type,
            x: 50 + nodes.length * 20,
            y: 50 + nodes.length * 20,
            data: { branch: 'master' },
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
                    const reposToProcess = node.data.repositories || [{ repoUrl: node.data.repoUrl, branch: node.data.branch, commit: node.data.commit }];
                    
                    if (!node.data.systemName || reposToProcess.length === 0 || !reposToProcess[0].repoUrl) {
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
                        metadata: node.data.payload.metadata || {
                            systemName: "Uploaded System",
                            repoUrl: "Local Upload",
                            branch: "master",
                            commitId: "HEAD"
                        }
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
                            commitID: repo.commit || undefined
                        }))
                    };

                    updateStatus(targetNode.id, 'running', 'Generating Base IR...');
                    const ir = await fetchIRFromRepo(input);
                    
                    const nextPayload: PipelinePayload = {
                        irJson: ir,
                        metadata: {
                            systemName: sysPayload.systemName,
                            repoUrl: sysPayload.repositories[0].repoUrl || "",
                            branch: sysPayload.repositories[0].branch || "master",
                            commitId: sysPayload.repositories[0].commit || "HEAD"
                        }
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
                            commitID: repo.commit || undefined
                        })),
                        rolePriority: rolePriorityMap,
                        defaultRolePriority: 50
                    };

                    updateStatus(targetNode.id, 'running', 'Calling Component API...');
                    const response = await fetch('http://localhost:8060/component/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(reqBody)
                    });

                    if (!response.ok) throw new Error(`API error ${response.status}`);
                    const generatedIr = await response.json();

                    const nextPayload: PipelinePayload = {
                        irJson: generatedIr,
                        metadata: {
                            systemName: sysPayload.systemName,
                            repoUrl: sysPayload.repositories[0].repoUrl || "",
                            branch: sysPayload.repositories[0].branch || "master",
                            commitId: sysPayload.repositories[0].commit || "HEAD"
                        }
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

                    const compPayload: ComponentPayload = {
                        id: extractedId,
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
                        systemName: irPayload.metadata.systemName,
                        repoURL: irPayload.metadata.repoUrl,
                        branch: irPayload.metadata.branch,
                        commitId: irPayload.metadata.commitId,
                        ir: irPayload.irJson
                    };

                    updateStatus(targetNode.id, 'running', 'Verifying...');
                    const result = await verifySystem(input);
                    
                    updateStatus(targetNode.id, 'completed', 'Verification Done.', { verificationResult: result });
                    
                    // Bundle the result with the system info needed for visualization
                    const downstreamPackage = {
                        result: result,
                        systemInfo: {
                            systemName: irPayload.metadata.systemName,
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

                    const scenarios: ScenarioItem[] = [];

                    // Loop over the filtered array
                    for (const [id, ep] of endpointsToProcess) {
                        const endpointObj = ep as any;
                        const allowedRoles = endpointObj.authorization?.requiredRoles || [];

                        scenarios.push({
                            scenario_id: `scn_${id}`,
                            method: endpointObj.httpMethod || 'GET',
                            endpoint: endpointObj.fullUri || 'Unknown',
                            allowed_roles: allowedRoles,
                            expected_outcome: 'BASELINE_PASS'
                        });

                        if (endpointObj.authentication?.required) {
                            scenarios.push({
                                scenario_id: `scn_auth_${id}`,
                                method: endpointObj.httpMethod || 'GET',
                                endpoint: endpointObj.fullUri || 'Unknown',
                                allowed_roles: allowedRoles,
                                expected_outcome: 'ROLE_BASED_ACCESS'
                            });
                        }
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
                    // Expects IR
                    const irPayload = payload as PipelinePayload;
                    if(!irPayload.irJson) throw new Error("Invalid input for Visualization");

                    updateStatus(targetNode.id, 'completed', 'Ready to Visualize.', { payload: irPayload });
                }
                else if (targetNode.type === 'AEGIS') {
                    // Type Guard
                    const irPayload = payload as PipelinePayload;
                    if (!irPayload.irJson) throw new Error("Invalid input: Expected IR JSON");

                    updateStatus(targetNode.id, 'running', 'Analyzing with Aegis Engine...');

                    // Construct payload for the Neuro-Symbolic Engine
                    // Matches the format used in LandingPage.tsx
                    const enginePayload = {
                        branch: irPayload.metadata.branch,
                        repoUrl: irPayload.metadata.repoUrl,
                        ir: irPayload.irJson
                    };

                    // Call the Python/Engine API
                    const response = await fetch('http://localhost:8900/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(enginePayload)
                    });

                    if (!response.ok) {
                        throw new Error(`Engine Status: ${response.status}`);
                    }

                    // Mark complete and pass payload through so the button has access to metadata
                    updateStatus(targetNode.id, 'completed', 'Analysis Complete. Click to View.', { payload: irPayload });
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
            case 'SYSTEM_INPUT': {
                const repositories = node.data.repositories || [{ repoUrl: node.data.repoUrl || '', branch: node.data.branch || 'master', commit: node.data.commit || '' }];

                const updateRepo = (index: number, field: string, value: string) => {
                    const newRepos = [...repositories];
                    newRepos[index] = { ...newRepos[index], [field]: value };
                    const legacyData = index === 0 ? { [field]: value } : {};
                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, ...legacyData, repositories: newRepos } } : n));
                };

                return (
                    <div className="space-y-3 mt-2">
                        <input 
                            type="text" placeholder="System Name" value={node.data.systemName || ''}
                            className="w-full text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none"
                            onChange={(e) => setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, systemName: e.target.value }} : n))}
                        />
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                            {repositories.map((repo, index) => (
                                <div key={`repo-${index}`} className="space-y-2 p-2 border border-slate-800 bg-slate-900 rounded relative">
                                    {repositories.length > 1 && (
                                        <button onClick={() => setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, repositories: repositories.filter((_, i) => i !== index) } } : n))} className="absolute top-1 right-2 text-slate-500 hover:text-red-500 text-xs font-bold">✕</button>
                                    )}
                                    <input type="text" placeholder="Repository URL" value={repo.repoUrl || ''} className="w-full text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none pr-6" onChange={(e) => updateRepo(index, 'repoUrl', e.target.value)} />
                                    <div className="flex gap-1">
                                        <input type="text" placeholder="Branch (master)" value={repo.branch || ''} className="w-1/2 text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none" onChange={(e) => updateRepo(index, 'branch', e.target.value)} />
                                        <input type="text" placeholder="Commit (Latest)" value={repo.commit || ''} className="w-1/2 text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none" onChange={(e) => updateRepo(index, 'commit', e.target.value)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, repositories: [...repositories, { repoUrl: '', branch: 'master', commit: '' }] } } : n))} className="w-full py-1.5 text-xs text-blue-400 border border-dashed border-blue-800 rounded hover:bg-blue-900/30 transition-colors">
                            + Add Repository
                        </button>
                    </div>
                );
            }
            case 'MULTI_REPO':
                return (
                    <div className="mt-2 text-center p-3 border border-dashed border-slate-700 bg-slate-800/50 rounded-lg">
                        <span className="text-xs text-slate-400 italic">Link to a System Source</span>
                    </div>
                );
            case 'COMPONENT_GENERATE': {
                const rolePriorities = node.data.rolePriorities || [{ role: 'ROLE_ADMIN', priority: 1 }, { role: 'ROLE_USER', priority: 10 }];

                const updateRole = (index: number, field: string, value: string) => {
                    const newRoles = [...rolePriorities];
                    newRoles[index] = { ...newRoles[index], [field]: field === 'priority' ? parseInt(value) || 0 : value };
                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, rolePriorities: newRoles } } : n));
                };

                return (
                    <div className="space-y-3 mt-2">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Role Priorities</div>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                            {rolePriorities.map((role, index) => (
                                <div key={`role-${index}`} className="flex gap-1 items-center relative">
                                    <input type="text" placeholder="ROLE_NAME" value={role.role} className="w-2/3 text-[10px] bg-slate-950 border border-slate-700 rounded p-1 focus:border-teal-500 outline-none font-mono" onChange={(e) => updateRole(index, 'role', e.target.value.toUpperCase())} />
                                    <input type="number" placeholder="Pri" value={role.priority} className="w-1/3 text-[10px] bg-slate-950 border border-slate-700 rounded p-1 focus:border-teal-500 outline-none text-center" onChange={(e) => updateRole(index, 'priority', e.target.value)} />
                                    {rolePriorities.length > 1 && (
                                        <button onClick={() => setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, rolePriorities: rolePriorities.filter((_, i) => i !== index) } } : n))} className="text-slate-500 hover:text-red-500 text-xs font-bold px-1">✕</button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, rolePriorities: [...rolePriorities, { role: 'ROLE_NEW', priority: 50 }] } } : n))} className="w-full py-1 text-[10px] text-teal-400 border border-dashed border-teal-800 rounded hover:bg-teal-900/30 transition-colors">
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
                                    <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Component Index ID</span>
                                    <span className="font-mono text-xs text-orange-400 break-all">
                                        {node.data.componentPayload.id}
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
                                <div className="text-emerald-600 text-xs font-mono break-all text-center max-h-8 overflow-hidden">{node.data.payload.metadata.systemName}</div>
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
                                        data: { ...n.data, payload: { irJson: json, metadata: { systemName: f.name, repoUrl: 'Local', branch: 'main', commitId: 'HEAD' }}} 
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

                if (!scPayload) {
                    return (
                        <div className="mt-2 text-center p-3 border border-dashed border-slate-700 bg-slate-800/50 rounded-lg">
                            <span className="text-xs text-slate-400 italic">Waiting for Component Generation...</span>
                        </div>
                    );
                }

                const setAllScenarios = (selected: boolean) => {
                    const newSelected = selected ? scPayload.scenarios.map((s: any) => s.scenario_id) : [];
                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, selectedScenarios: newSelected } } : n));
                };

                const toggleScenario = (id: string) => {
                    const newSelected = selectedScenarios.includes(id)
                        ? selectedScenarios.filter(s => s !== id)
                        : [...selectedScenarios, id];
                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, selectedScenarios: newSelected } } : n));
                };

                return (
                    <div className="mt-2 space-y-2">
                        <div className="flex flex-col gap-1 mb-2">
                            <div className="flex items-center justify-between">
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    Generated Scenarios
                                </div>
                                <div className="text-[10px] text-indigo-400 font-bold">
                                    {selectedScenarios.length} / {scPayload.scenarios.length}
                                </div>
                            </div>
                            
                            {/* NEW: Select All / Deselect All Controls */}
                            <div className="flex gap-3 mt-1">
                                <button 
                                    onClick={() => setAllScenarios(true)}
                                    className="text-[9px] text-indigo-400 hover:text-indigo-300 transition-colors uppercase font-bold tracking-tighter underline decoration-indigo-800 underline-offset-2"
                                >
                                    Select All
                                </button>
                                <button 
                                    onClick={() => setAllScenarios(false)}
                                    className="text-[9px] text-slate-500 hover:text-rose-400 transition-colors uppercase font-bold tracking-tighter underline decoration-slate-800 underline-offset-2"
                                >
                                    Deselect All
                                </button>
                            </div>
                        </div>
                        
                        {/* Scrollable Checkbox List */}
                        <div className="space-y-1 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                            {scPayload.scenarios.map((s: ScenarioItem) => (
                                <label 
                                    key={s.scenario_id} 
                                    className={`
                                        flex items-start gap-2 p-2 bg-slate-950 border rounded cursor-pointer transition-all
                                        ${selectedScenarios.includes(s.scenario_id) ? 'border-indigo-500/50 bg-indigo-900/10' : 'border-slate-800 hover:border-slate-700'}
                                    `}
                                >
                                    <input 
                                        type="checkbox" 
                                        checked={selectedScenarios.includes(s.scenario_id)}
                                        onChange={() => toggleScenario(s.scenario_id)}
                                        className="mt-0.5 accent-indigo-500 rounded border-slate-700"
                                    />
                                    <div className="flex flex-col overflow-hidden w-full">
                                        <div className="flex items-center gap-1">
                                            <span className={`text-[8px] px-1 rounded font-bold ${s.method === 'GET' ? 'bg-blue-900/50 text-blue-400' : s.method === 'POST' ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                                                {s.method}
                                            </span>
                                            <span className="text-[10px] font-mono text-slate-300 truncate" title={s.endpoint}>
                                                {s.endpoint}
                                            </span>
                                        </div>
                                        <span className="text-[9px] text-slate-500 mt-0.5 truncate italic">
                                            {s.expected_outcome}
                                        </span>
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
                        onClick={() => navigate('/', { state: { irData: node.data.payload?.irJson, fromPipeline: true } })} 
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
                            const meta = node.data.payload?.metadata;
                            if (!meta) return;
                            const params = new URLSearchParams({
                                commitID: meta.commitId
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
                        {/* Abstract Node/Network Icon for Cloudhub */}
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-lg shadow-cyan-500/20">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                            </svg>
                        </div>
                        
                        {/* Brand Name */}
                        <h1 className="font-black text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-cyan-400 to-teal-400">
                            CloudHub
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
                                            absolute w-80 rounded-xl border backdrop-blur-md transition-all duration-200
                                            ${config.color} 
                                            ${isSource ? 'ring-2 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.3)]' : 'ring-1 ring-white/10 shadow-2xl'}
                                            ${node.status === 'running' ? 'ring-2 ring-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]' : ''}
                                            ${node.status === 'failed' ? 'ring-2 ring-red-500 bg-red-900/40' : ''}
                                        `}
                                        style={{ left: node.x, top: node.y, zIndex: 10 }}
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