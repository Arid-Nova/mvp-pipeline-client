import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { saveAs } from 'file-saver';
import { fetchIRFromRepo, verifySystem, RepositoryInput, VerificationInput, VerificationResponse } from '../../services/api';

// --- TYPES ---

type CardType = 
    | 'MULTI_REPO' 
    | 'UPLOAD_IR' 
    | 'IR_HOLDER' 
    | 'FORMAL_VERIFY' 
    | 'VISUALIZATION' 
    | 'AEGIS' 
    | 'FORMAL_VIZ';

interface PipelinePayload {
    irJson: any;
    metadata: {
        systemName: string;
        repoUrl: string;
        branch: string;
        commitId: string;
    };
}

interface NodeData {
    id: string;
    type: CardType;
    x: number;
    y: number;
    data: {
        systemName?: string;
        repoUrl?: string;
        branch?: string;
        commit?: string;
        payload?: PipelinePayload; 
        verificationResult?: VerificationResponse;
        systemInfo?: {
            systemName: string;
            ir: any;
        };
    };
    status: 'idle' | 'running' | 'completed' | 'failed';
    logs: string[];
}

interface Connection {
    id: string;
    source: string;
    target: string;
}

// --- CONFIGURATION ---

const CATEGORIES: Record<string, CardType[]> = {
    "Input": ['MULTI_REPO', 'UPLOAD_IR'],
    "Intermediate Results": ['IR_HOLDER'],
    "Processes": ['FORMAL_VERIFY'],
    "Visualization": ['VISUALIZATION', 'AEGIS', 'FORMAL_VIZ']
};

const CARD_CONFIG: Record<CardType, { title: string; color: string; icon: JSX.Element; description: string }> = {
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
    IR_HOLDER: { 
        title: "IR Card", 
        color: "border-yellow-500 bg-yellow-900/20", 
        description: "Stores and exposes IR JSON",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
    },
    FORMAL_VERIFY: { 
        title: "Formal Verification", 
        color: "border-purple-500 bg-purple-900/20", 
        description: "Run system verification",
        icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
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
    MULTI_REPO: ['IR_HOLDER', 'FORMAL_VERIFY'],
    UPLOAD_IR: ['IR_HOLDER'],
    IR_HOLDER: ['FORMAL_VERIFY', 'VISUALIZATION', 'AEGIS'],
    FORMAL_VERIFY: ['FORMAL_VIZ'],
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
        const x = e.clientX - rect.left - 150; 
        const y = e.clientY - rect.top - 50;

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
            const inputNodes = nodes.filter(n => n.type === 'MULTI_REPO' || n.type === 'UPLOAD_IR');
            
            for (const node of inputNodes) {
                updateStatus(node.id, 'running', 'Starting input processing...');
                let payload: PipelinePayload | null = null;
                
                // 1. EXECUTE INPUT NODES
                if (node.type === 'MULTI_REPO') {
                    if (!node.data.repoUrl || !node.data.systemName) {
                        updateStatus(node.id, 'failed', 'System Name and Repository URL are required.');
                        continue;
                    }
                    
                    try {
                        const input: RepositoryInput = {
                            systemName: node.data.systemName,
                            systemRepositories: [{
                                repoBranchPair: {
                                    repositoryURL: node.data.repoUrl,
                                    branchName: node.data.branch || "master"
                                },
                                commitID: node.data.commit
                            }]
                        };

                        updateStatus(node.id, 'running', 'Fetching from API...');
                        const ir = await fetchIRFromRepo(input);
                        
                        payload = {
                            irJson: ir,
                            metadata: {
                                systemName: node.data.systemName,
                                repoUrl: node.data.repoUrl,
                                branch: node.data.branch || "master",
                                commitId: node.data.commit || "HEAD"
                            }
                        };
                        updateStatus(node.id, 'completed', 'IR generated successfully.', { payload });

                    } catch (error: any) {
                        updateStatus(node.id, 'failed', `API Error: ${error.message}`);
                        continue;
                    }
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
                else if (targetNode.type === 'VISUALIZATION') {
                    // Expects IR
                    const irPayload = payload as PipelinePayload;
                    if(!irPayload.irJson) throw new Error("Invalid input for Visualization");

                    updateStatus(targetNode.id, 'completed', 'Ready to Visualize.', { payload: irPayload });
                }
                else if (targetNode.type === 'AEGIS') {
                    updateStatus(targetNode.id, 'completed', 'Ready for Aegis.');
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
            case 'MULTI_REPO':
                return (
                    <div className="space-y-2 mt-2">
                         <input 
                            type="text" 
                            placeholder="System Name"
                            value={node.data.systemName || ''}
                            className="w-full text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none"
                            onChange={(e) => {
                                setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, systemName: e.target.value }} : n));
                            }}
                        />
                        <input 
                            type="text" 
                            placeholder="Repository URL"
                            value={node.data.repoUrl || ''}
                            className="w-full text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none"
                            onChange={(e) => {
                                setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, repoUrl: e.target.value }} : n));
                            }}
                        />
                        <div className="flex gap-1">
                            <input 
                                type="text" 
                                placeholder="Branch (master)" 
                                value={node.data.branch || ''}
                                className="w-1/2 text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none" 
                                onChange={(e) => {
                                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, branch: e.target.value }} : n));
                                }}
                            />
                            <input 
                                type="text" 
                                placeholder="Commit (Latest)" 
                                value={node.data.commit || ''}
                                className="w-1/2 text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none" 
                                onChange={(e) => {
                                    setNodes(nodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, commit: e.target.value }} : n));
                                }}
                            />
                        </div>
                    </div>
                );
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
                        disabled={!node.data.payload?.irJson}
                        className="mt-2 w-full py-1.5 text-xs bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded font-medium shadow transition-colors"
                        onClick={() => alert("Redirecting to Aegis System...")}
                    >
                        Launch Aegis
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
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        Back
                    </button>
                    <h1 className="font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
                        Custom Microservice System Analysis Pipeline Builder
                    </h1>
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
                    <button 
                        onClick={runPipeline}
                        disabled={isRunning || nodes.length === 0}
                        className={`px-6 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 font-bold shadow-lg shadow-emerald-900/20 hover:scale-105 transition-all ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isRunning ? (
                             <span className="flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                                Processing...
                             </span>
                        ) : 'Run Pipeline'}
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Toolbox */}
                <div className="w-64 bg-slate-800 border-r border-slate-700 p-4 overflow-y-auto z-10 shadow-xl">
                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 tracking-wider">Components</h3>
                    <div className="space-y-6">
                        {Object.entries(CATEGORIES).map(([category, types]) => (
                            <div key={category}>
                                <h4 className="text-[10px] font-bold text-indigo-400 uppercase mb-2 px-1 tracking-wider border-b border-indigo-500/20 pb-1">
                                    {category}
                                </h4>
                                <div className="space-y-3">
                                    {types.map((type) => {
                                        const config = CARD_CONFIG[type];
                                        return (
                                            <div 
                                                key={type}
                                                onClick={() => addNode(type)}
                                                className={`p-3 rounded-xl border border-slate-700 bg-slate-700/30 hover:bg-slate-700 hover:border-slate-500 cursor-pointer transition-all flex items-center gap-3 group`}
                                            >
                                                <div className={`${config.color.split(' ')[1]} p-2 rounded-lg text-slate-200 shadow-sm`}>
                                                    {config.icon}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-sm text-slate-200">{config.title}</div>
                                                    <div className="text-[10px] text-slate-400 leading-tight">{config.description}</div>
                                                </div>
                                                <div className="ml-auto opacity-0 group-hover:opacity-100 text-indigo-400 text-lg font-bold">+</div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Canvas */}
                <div 
                    ref={canvasRef}
                    className="flex-1 relative bg-slate-900 overflow-hidden"
                    style={{ 
                        backgroundImage: 'radial-gradient(#334155 1px, transparent 1px)', 
                        backgroundSize: '24px 24px' 
                    }}
                    onDragOver={handleCanvasDragOver}
                    onDrop={handleCanvasDrop}
                >
                    {/* Connections Layer */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
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
                                        <span className="font-bold text-sm text-white">{config.title}</span>
                                    </div>
                                    <div className="flex gap-1">
                                        <button 
                                            title="Link to..."
                                            onClick={() => handleLinkClick(node.id, node.type)}
                                            className={`p-1.5 rounded-lg transition-colors ${isLinking === node.id ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-white/10 text-slate-400 hover:text-white'}`}
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                            </svg>
                                        </button>
                                        <button 
                                            onClick={() => deleteNode(node.id)}
                                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
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
        </div>
    );
};

export default PipelinePage;