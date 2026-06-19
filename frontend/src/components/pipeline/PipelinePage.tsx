import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
    fetchIRFromRepo, 
    verifySystem, 
    createComponent,
    generateAuthVectors,
    generateScenarios,
    generatePrompts,
    generateTestSuites,
    analyzeAegis,
    fetchChangeImpact,
    saveSession,
    loadSession,
    recordUserFeedback
} from '../../services/api';
import { canonicalizeGithubUrl } from '../../utils/githubUrl';
import { track, PipelineEvent } from '../../analytics/posthog';
import { PIPELINE_TEMPLATES } from './configs/PipelineTemplates';
import { RepositoryInput, VerificationInput } from '../../services/types';
import { CardType, SystemPayload, ComponentPayload, PipelinePayload, NodeData, Connection, ScenarioPayload} from './models';

// Configuration and Constants
import {CATEGORIES, VALID_CONNECTIONS} from './pipelineConfig'
import sessionDictionary from '../../utils/sessionDictionary.json';

// Card Components
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
import { IRGenerationCard } from './cards/IRGenerationCard';
import { VerificationComparisonCard } from './cards/VerificationComparisonCard';

// Canvas Components
import { FeedbackModal } from './canvas/FeedbackModal';
import { PipelineCanvas } from './canvas/PipelineCanvas';
import { ToolboxSidebar } from './canvas/ToolboxSideBar';
import { PipelineHeader } from './canvas/PiplelineHeader';
import { ChangeImpactCard } from './cards/ChangeImpactCard';
import { SecurityRegressionCard } from './cards/SecurityRegressionCard';
import { Notification as ToastNotification } from '../../utils/notifications';
import NotificationToast from '../generic/NotificationToast';

// Tour Component
import { PipelineTour } from './tour/PipelineTour';
import { TemplateLibraryModal } from './canvas/TemplateLibraryModal';

import { decompressPayload } from '../../utils/decompress';

// In-browser cache to avoid data resetting
let inMemoryPipelineCache: { 
    nodes: NodeData[], 
    connections: Connection[], 
    sessionName: string,
    sessionId: string | null
} | null = null;

const PipelinePage: React.FC = () => {
    // Pipeline Tour State
    const [runTour, setRunTour] = useState(false);

    // Zoom and Pan State
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);

    // Zoom constants
    const MIN_SCALE = 0.2;
    const MAX_SCALE = 2;
    const ZOOM_SENSITIVITY = 0.001;

    // Notification States
    const [notification, setNotification] = useState<ToastNotification | null>(null);

    // Feedback State
    const [showFeedback, setShowFeedback] = useState(false);

    // History States (Undo/Redo)
    const [history, setHistory] = useState<{nodes: NodeData[], connections: Connection[]}[]>([{ nodes: [], connections: [] }]);
    const [historyIndex, setHistoryIndex] = useState(0);

    // Named Session State
    const [sessionName, setSessionName] = useState<string>(() => {
        if (inMemoryPipelineCache) return inMemoryPipelineCache.sessionName;
        return sessionStorage.getItem('pipeline_session_name') || '';
    });
    
    const [sessionId, setSessionId] = useState<string | null>(() => {
        if (inMemoryPipelineCache) return inMemoryPipelineCache.sessionId;
        return sessionStorage.getItem('pipeline_session_id');
    });

    const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
    const lastSavedStateRef = useRef<string>('');

    useEffect(() => {
        lastSavedStateRef.current = JSON.stringify({ nodes, connections });
    }, []);

    // Names Session Management 
    useEffect(() => {
        const generateSessionName = (): string => {
            const { adjectives, nouns } = sessionDictionary;
            
            const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
            const noun = nouns[Math.floor(Math.random() * nouns.length)];
            const date = new Date().toISOString().split('T')[0]; 
            
            return `${adj}-${noun}-${date}`;
        };

        if (!sessionName) {
            setSessionName(generateSessionName());
        }
    }, [sessionName]);

    const handleSaveSession = async (newName: string, isSaveAs: boolean = false) => {
        try {
            const canvasData = {
                nodes: nodes,               
                connections: connections,  
                viewport: {
                    scale: scale,           
                    offset: offset          
                },
                ui: {
                    expandedCategories: expandedCategories 
                }
            };

            const targetSessionId = isSaveAs ? undefined : (sessionId || undefined);
            const newSessionId = await saveSession(newName, canvasData, targetSessionId);
            
            setSessionName(newName);
            setSessionId(newSessionId);

            lastSavedStateRef.current = JSON.stringify({ nodes, connections });
            setHasUnsavedChanges(false);

            track(PipelineEvent.SESSION_SAVED, {
                isSaveAs,
                nodeCount: nodes.length,
                connectionCount: connections.length,
            });

            setNotification({
                type: 'success',
                message: 'Session saved successfully!',
                duration: 5000
            });
        } catch {
            setNotification({
                type: 'error',
                message: 'Failed to save session.',
                duration: 5000
            });   
        }
    };

    const handleLoadSession = async (targetSessionId: string) => {
        try {
            const sessionData = await loadSession(targetSessionId);

            const { name, canvas_data } = sessionData;
            
            // Setting the session identity
            setSessionName(name);
            setSessionId(targetSessionId);
            
            // Restoring Canvas State
            if (canvas_data.nodes) setNodes(canvas_data.nodes);
            if (canvas_data.connections) setConnections(canvas_data.connections);
            
            // Restoreing Viewport states
            if (canvas_data.ui?.expandedCategories)
                setExpandedCategories(canvas_data.ui.expandedCategories);

            lastSavedStateRef.current = JSON.stringify({ 
                nodes: canvas_data.nodes || [], 
                connections: canvas_data.connections || [] 
            });
            setHasUnsavedChanges(false);

            track(PipelineEvent.SESSION_LOADED, {
                nodeCount: (canvas_data.nodes || []).length,
                connectionCount: (canvas_data.connections || []).length,
            });

            setNotification({
                type: 'success',
                message: `Workspace loaded successfully!`,
                duration: 5000
            });
        } catch (error) {
            console.error("Failed to load session:", error);
            setNotification({
                type: 'error',
                message: 'Failed to load session data.',
                duration: 5000
            });   
        }
    };

    // Tour Trigger from App
    useEffect(() => {
        if (sessionStorage.getItem('trigger_pipeline_tour') === 'true') {
            setRunTour(true);
        }

        const handleTriggerTour = () => {
            setRunTour(true);
        };

        window.addEventListener('trigger-pipeline-tour', handleTriggerTour);
        return () => {
            window.removeEventListener('trigger-pipeline-tour', handleTriggerTour);
        };
    }, []);

    const handleTourFinish = () => {
        setRunTour(false);
        sessionStorage.removeItem('trigger_pipeline_tour');

        document.body.style.pointerEvents = 'auto';
        document.body.style.overflow = 'auto';
    };

    // Feedback from the user
    useEffect(() => {
        // Check if the user has already dealt with the feedback prompt
        if (localStorage.getItem('pipeline_feedback_handled') === 'true') {
            return;
        }

        let activeTimeMs = 0;
        let lastActivityTime = Date.now();
        // const TARGET_ACTIVE_TIME = 15; // 15 miliseconds for testing
        const TARGET_ACTIVE_TIME = 15 * 60 * 1000; // 15 minutes 

        // Function to ping activity
        const recordActivity = () => {
            lastActivityTime = Date.now();
        };

        // Listeners for active usage
        window.addEventListener('mousemove', recordActivity);
        window.addEventListener('keydown', recordActivity);
        window.addEventListener('click', recordActivity);

        // Check time accumulation every second
        const interval = setInterval(() => {
            const now = Date.now();
            // If the user interacted within the last 60 seconds, consider them "active"
            if (now - lastActivityTime < 60000) {
                activeTimeMs += 1000;
                
                if (activeTimeMs >= TARGET_ACTIVE_TIME) {
                    setShowFeedback(true);
                    clearInterval(interval); 
                }
            }
        }, 1000);

        return () => {
            clearInterval(interval);
            window.removeEventListener('mousemove', recordActivity);
            window.removeEventListener('keydown', recordActivity);
            window.removeEventListener('click', recordActivity);
        };
    }, []);

    const handleFeedbackSubmit = async (rating: number, comment: string) => {
        try {
            await recordUserFeedback({
                rating: rating,
                comments: comment
            });
            console.log("Feedback successfully submitted.");
        } catch (error) {
            console.error("Failed to submit feedback:", error);
        } finally {
            localStorage.setItem('pipeline_feedback_handled', 'true');
            setShowFeedback(false);
        }
    };

    const handleFeedbackSkip = () => {
        localStorage.setItem('pipeline_feedback_handled', 'true');
        setShowFeedback(false);
    };

    // History of Actions handling for Undo and Redo operations
    const MAX_HISTORY_STATES = 10;

    const saveHistory = useCallback((newNodes: NodeData[], newConnections: Connection[]) => {
        const newState = {
            nodes: newNodes.map(node => ({ ...node })),
            connections: newConnections.map(conn => ({ ...conn }))
        };

        setHistory(prev => {
            const slicedHistory = prev.slice(0, historyIndex + 1);
            const nextHistory = [...slicedHistory, newState];
           
            if (nextHistory.length > MAX_HISTORY_STATES) {
                return nextHistory.slice(nextHistory.length - MAX_HISTORY_STATES);
            }        
            return nextHistory;
        });

        setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY_STATES - 1));
    }, [historyIndex]);

    const handleUndo = useCallback(() => {
        if (historyIndex > 0) {
            const prevIndex = historyIndex - 1;
            setHistoryIndex(prevIndex);
            setNodes(history[prevIndex].nodes);
            setConnections(history[prevIndex].connections);
            track(PipelineEvent.UNDO);
        }
    }, [history, historyIndex]);

    const handleRedo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const nextIndex = historyIndex + 1;
            setHistoryIndex(nextIndex);
            setNodes(history[nextIndex].nodes);
            setConnections(history[nextIndex].connections);
            track(PipelineEvent.REDO);
        }
    }, [history, historyIndex]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            ) {
                return;
            }

            // Detecting Mac vs Windows for the modifier key
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const isCtrlOrCmd = isMac ? event.metaKey : event.ctrlKey;

            if (isCtrlOrCmd && event.key.toLowerCase() === 'z' && !event.shiftKey) {
                event.preventDefault(); 
                handleUndo();
            }
            
            if (
                (isCtrlOrCmd && event.key.toLowerCase() === 'z' && event.shiftKey) ||
                (isCtrlOrCmd && event.key.toLowerCase() === 'y')
            ) {
                event.preventDefault(); 
                handleRedo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo, handleRedo]);

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

    // --- Requesting Notification Permission ---
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);
    
    // --- PERSISTENCE LOGIC ---
    // Initialize from session storage if available
    const [nodes, setNodes] = useState<NodeData[]>(() => {
        if (inMemoryPipelineCache) return inMemoryPipelineCache.nodes;

        try {
            const savedNodes = sessionStorage.getItem('pipeline_nodes');
            return savedNodes ? JSON.parse(savedNodes) : [];
        } catch (e) {
            console.warn("Failed to load pipeline state", e);
            return [];
        }
    });
    
    const [connections, setConnections] = useState<Connection[]>(() => {
        if (inMemoryPipelineCache) return inMemoryPipelineCache.connections;

        try {
            const savedConns = sessionStorage.getItem('pipeline_connections');
            return savedConns ? JSON.parse(savedConns) : [];
        } catch (e) {
            return [];
        }
    });

    const nodesRef = useRef(nodes);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);

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
        inMemoryPipelineCache = { nodes, connections, sessionName, sessionId };

        const currentStateStr = JSON.stringify({ nodes, connections });
        if (currentStateStr !== lastSavedStateRef.current) {
            setHasUnsavedChanges(true);
        } else {
            setHasUnsavedChanges(false);
        }

        try {
            sessionStorage.setItem('pipeline_session_name', sessionName);
            if (sessionId) {
                sessionStorage.setItem('pipeline_session_id', sessionId);
            } else {
                sessionStorage.removeItem('pipeline_session_id');
            }

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
    }, [nodes, connections, sessionName, sessionId]);

    const clearPipeline = () => {
        if(window.confirm("Are you sure you want to clear the pipeline? This cannot be undone.")) {
            track(PipelineEvent.CLEARED, { nodeCount: nodes.length });
            setNodes([]);
            setConnections([]);
            setSessionName(''); 
            setSessionId(null);
            
            saveHistory([], []);
            inMemoryPipelineCache = null;
            sessionStorage.removeItem('pipeline_nodes');
            sessionStorage.removeItem('pipeline_connections');
        }
    };

    // Preconfigured pipelines
    const applyTemplate = (templateId: string) => {
        const template = PIPELINE_TEMPLATES.find(t => t.id === templateId);
        if (!template) return;

        if (nodes.length > 0) {
            const confirm = window.confirm("Applying a template will clear your current canvas. Continue?");
            if (!confirm) return;
        }

        const idMapping: Record<string, string> = {};
        const newNodes: NodeData[] = [];

        template.nodes.forEach(tNode => {
            const freshId = Math.random().toString(36).substr(2, 9);
            idMapping[tNode.tempId] = freshId;

            newNodes.push({
                id: freshId,
                type: tNode.type,
                x: tNode.x,
                y: tNode.y,
                data: {},
                status: 'idle',
                logs: []
            });
        });

        const newConnections: Connection[] = template.connections.map(tConn => ({
            id: Math.random().toString(36).substr(2, 9),
            source: idMapping[tConn.sourceTempId],
            target: idMapping[tConn.targetTempId]
        }));

        setNodes(newNodes);
        setConnections(newConnections);

        // Resetting the viewport
        setScale(1);
        setOffset({ x: 0, y: 0 });

        saveHistory(newNodes, newConnections);

        track(PipelineEvent.TEMPLATE_APPLIED, {
            templateId: template.id,
            templateName: template.name,
            nodeCount: newNodes.length,
        });
        
        setNotification({
            type: 'success',
            message: `Workspace Loaded!`,
            duration: 3000
        });
    };

    const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false);

    // Pipeline Execution States
    const [isLinking, setIsLinking] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);

    // Pipeline Stoppage States     
    const abortControllerRef = useRef<AbortController | null>(null);
    const killSwitchRef = useRef<boolean>(false);

    // Dragging state
    const [dragNodeId, setDragNodeId] = useState<string | null>(null);
    const [touchDragNodeId, setTouchDragNodeId] = useState<string | null>(null);

    // Canvas dragging states 
    const lastTouchRef = useRef<{x: number, y: number} | null>(null);
    const pinchDistanceRef = useRef<number | null>(null);

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
        saveHistory([...nodes, newNode], connections);

        track(PipelineEvent.CARD_ADDED, { cardType: type });
    };

    const deleteNode = (id: string) => {
        const deleted = nodes.find(n => n.id === id);
        const updatedNodes = nodes.filter(n => n.id !== id);
        const updatedConnections = connections.filter(c => c.source !== id && c.target !== id);

        setNodes(updatedNodes);
        setConnections(updatedConnections);

        saveHistory(updatedNodes, updatedConnections);

        track(PipelineEvent.CARD_DELETED, { cardType: deleted?.type });
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

        const updatedNodes = nodes.map(n => n.id === dragNodeId ? { ...n, x, y } : n);

        setNodes(updatedNodes);
        setDragNodeId(null);

        saveHistory(updatedNodes, connections);
    };

    // Same functions above but for touch events
    const handleNodeTouchStart = useCallback((e: React.TouchEvent, id: string) => {
        setTouchDragNodeId(id);
    }, []);

    const handleCanvasTouchMove = useCallback((e: React.TouchEvent) => {
        if (e.cancelable) e.preventDefault();

        if (e.touches.length === 2) {
            if (pinchDistanceRef.current !== null) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const currentDistance = Math.sqrt(dx * dx + dy * dy);
                
                // Scale change
                const distanceDelta = currentDistance - pinchDistanceRef.current;
                const scaleChange = distanceDelta * 0.005; 
                setScale(prev => Math.min(Math.max(prev + scaleChange, MIN_SCALE), MAX_SCALE));
                
                pinchDistanceRef.current = currentDistance;
            }
            return;
        } 

        // The user is panning the background canvas
        if (isPanning && lastTouchRef.current && e.touches.length === 1) {
            const touch = e.touches[0];
            const dx = touch.clientX - lastTouchRef.current.x;
            const dy = touch.clientY - lastTouchRef.current.y;
            
            setOffset(prev => ({
                x: prev.x + dx,
                y: prev.y + dy
            }));
            
            lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
            return; 
        }

        // The user is dragging a card
        if (!touchDragNodeId || !canvasRef.current) return;

        const touch = e.touches[0];
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (touch.clientX - rect.left - offset.x) / scale - 150; 
        const y = (touch.clientY - rect.top - offset.y) / scale - 50;

        setNodes(prev => prev.map(n => n.id === touchDragNodeId ? { ...n, x, y } : n));
    }, [isPanning, touchDragNodeId, offset, scale]);

    const handleCanvasTouchEnd = useCallback((e: React.TouchEvent) => {
        if (e.touches.length < 2) {
            pinchDistanceRef.current = null;
        }

        if (e.touches.length === 1) {
            // User lifted one finger but left the other down -> switch back to panning smoothly
            lastTouchRef.current = { 
                x: e.touches[0].clientX, 
                y: e.touches[0].clientY 
            };
        } else if (e.touches.length === 0) {
            // All fingers lifted
            setIsPanning(false);
            lastTouchRef.current = null;
        }

        if (!touchDragNodeId) return;
        
        saveHistory(nodes, connections);
        setTouchDragNodeId(null);
    }, [touchDragNodeId, nodes, connections, saveHistory]);

    // -- Canvas Dragging and Panning for touch devices --
    const handleCanvasTouchStart = useCallback((e: React.TouchEvent) => {
        if ((e.target as HTMLElement).id === 'canvas-grid' || (e.target as HTMLElement).closest('#canvas-grid')) {   
            if (e.touches.length === 2) {
                // Two fingers down -> Zoom in/out
                setIsPanning(false);
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                pinchDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
                
            } else if (e.touches.length === 1) {
                // One finger down -> Panning
                setIsPanning(true);
                lastTouchRef.current = { 
                    x: e.touches[0].clientX, 
                    y: e.touches[0].clientY 
                };
            }
        }
    }, []);


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
                    track(PipelineEvent.LINK_CREATED, {
                        sourceType: sourceNode.type,
                        targetType: type,
                    });
                }
            }
            // else {
            //     alert(`Invalid Connection! ${sourceNode.type} can only connect to: ${allowedTargets.join(', ')}`);
            // }
            setIsLinking(null);
        }
    };

    const deleteConnection = (connId: string) => {
        const updatedConnections = connections.filter(c => c.id !== connId);

        setConnections(updatedConnections);

        saveHistory(nodes, updatedConnections);

        track(PipelineEvent.LINK_DELETED);
    };

    // --- Execution Logic ---
    const runFromNode = async (nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        killSwitchRef.current = false;
        abortControllerRef.current = new AbortController();

        setIsRunning(true);

        const runStartedAt = Date.now();
        let runStatus = 'completed';
        track(PipelineEvent.NODE_RUN_STARTED, { cardType: node.type });

        const updateStatus = (id: string, status: NodeData['status'], log: string, data?: any) => {
            setNodes(prev => prev.map(n => {
                if (n.id === id) {
                    const evaluatedData = typeof data === 'function' ? data(n.data) : data;
                    return { 
                        ...n, 
                        status, 
                        logs: [...n.logs, log],
                        data: evaluatedData ? { ...n.data, ...evaluatedData } : n.data 
                    };
                }
                return n;
            }));
        };

        try {
            if (node.type === 'VISUALIZATION') {
                const upstreamEdges = connections.filter(c => c.target === nodeId);
                let collectedIRs: any[] = [];
                
                upstreamEdges.forEach(edge => {
                    const unode = nodes.find(n => n.id === edge.source);
                    const ir = unode?.data?.payload?.irJson || unode?.data?.systemInfo?.ir;
                    if (ir) {
                        collectedIRs.push(JSON.parse(JSON.stringify(ir)));
                    }
                });

                if (collectedIRs.length > 0) {
                    updateStatus(nodeId, 'completed', `Stacked ${collectedIRs.length} system versions!`, {
                        timelineIRs: collectedIRs,
                        payload: { irJson: collectedIRs[collectedIRs.length - 1] }
                    });
                } else {
                    updateStatus(nodeId, 'failed', 'No upstream IR data found.');
                    runStatus = 'failed';
                }
                return; 
            }

            // We need to provide the payload from the UPSTREAM node
            const upstreamConnection = connections.find(c => c.target === nodeId);
            const upstreamNode = nodes.find(n => n.id === upstreamConnection?.source);

            // SYSTEM_INPUT nodes don't persist a `data.payload`; their output
            // is synthesized from `data.systemName` + `data.repositories`. Build
            // that here so running a downstream card directly (without first
            // running the whole pipeline) still gets a valid SystemPayload.
            let payload: any;
            if (upstreamNode?.type === 'SYSTEM_INPUT') {
                const reposToProcess = upstreamNode.data.repositories;
                if (!upstreamNode.data.systemName || !reposToProcess || reposToProcess.length === 0) {
                    updateStatus(nodeId, 'failed', 'Upstream System Source needs a System Name and at least one repository.');
                    runStatus = 'failed';
                    return;
                }
                payload = {
                    type: 'SYSTEM_PAYLOAD',
                    systemName: upstreamNode.data.systemName,
                    repositories: reposToProcess,
                } as SystemPayload;
            } else {
                payload = upstreamNode?.data.payload || {};
            }

            // Execute the specific node logic
            await processNextNodes(upstreamNode?.id || '', payload, updateStatus, {
                signal: abortControllerRef.current.signal,
                killSwitch: killSwitchRef
            });
        } catch (error: any) {
            if (error.name === 'AbortError') {
            updateStatus(nodeId, 'idle', 'Pipeline stopped by user.');
            runStatus = 'stopped';
            } else {
                updateStatus(nodeId, 'failed', error.message);
                runStatus = 'failed';
            }
        } finally {
            setIsRunning(false);
            track(PipelineEvent.NODE_RUN_COMPLETED, {
                cardType: node.type,
                status: runStatus,
                durationMs: Date.now() - runStartedAt,
            });
        }
    };

    const runPipeline = async () => {
        setIsRunning(true);

        const runStartedAt = Date.now();
        let runStatus = 'completed';
        track(PipelineEvent.RUN_STARTED, {
            nodeCount: nodes.length,
            connectionCount: connections.length,
        });
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
            runStatus = e?.name === 'AbortError' ? 'stopped' : 'failed';
            alert("Pipeline Error: " + e.message);
        } finally {
            setIsRunning(false);
            track(PipelineEvent.RUN_COMPLETED, {
                nodeCount: nodes.length,
                connectionCount: connections.length,
                status: runStatus,
                durationMs: Date.now() - runStartedAt,
            });
        }
    };

    // processNextNodes accepts 'any' because it handles both PipelinePayload (IR) and Verification Packages
    const processNextNodes = async (
        sourceId: string, 
        payload: any, 
        updateStatus: Function,
        options?: { signal: AbortSignal, killSwitch: React.MutableRefObject<boolean> }
    ) => {
        const outgoing = connections.filter(c => c.source === sourceId);
        
        for (const conn of outgoing) {
            if (options?.killSwitch?.current) {
                console.log("Pipeline execution halted by user.");
                break; 
            }

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
                            repoBranchPair: { repositoryURL: canonicalizeGithubUrl(repo.repoUrl), branchName: repo.branch || "master" },
                            commitID: repo.commitId || undefined
                        }))
                    };

                    updateStatus(targetNode.id, 'running', 'Generating Base IR...');
                    const ir = await fetchIRFromRepo(input, { signal: options?.signal });
                    
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
                    await processNextNodes(targetNode.id, nextPayload, updateStatus, options);
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
                    const rawResponse = await createComponent(reqBody, { signal: options?.signal });
                    const generatedComponents = {
                        id: rawResponse.id,
                        componentIndex: decompressPayload(rawResponse.componentIndex),
                        endpointIndex: decompressPayload(rawResponse.endpointIndex)
                    };

                    // Retrieves the authorization vectors
                    const authVectors = await generateAuthVectors(generatedComponents.id, { signal: options?.signal })

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
                    await processNextNodes(targetNode.id, nextPayload, updateStatus, options);
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
                    
                    await processNextNodes(targetNode.id, incomingPayload, updateStatus, options);
                }

                if (targetNode.type === 'IR_HOLDER') {
                    // Type Guard: Expects IR
                    const irPayload = payload as PipelinePayload;
                    if (!irPayload.irJson) throw new Error("Invalid input: Expected IR JSON");

                    updateStatus(targetNode.id, 'completed', 'IR Stored.', { payload: irPayload });
                    await processNextNodes(targetNode.id, irPayload, updateStatus, options);
                } 
                if (targetNode.type === 'TEST_EXECUTOR') {
                    const generatedTests = payload?.testSuitePayload?.tests;

                    if (!generatedTests || generatedTests.length === 0) {
                        throw new Error("No tests found to execute. Please ensure the 'Test Generation' step ran successfully.");
                    }

                    updateStatus(
                        targetNode.id, 
                        'completed', 
                        `Received ${generatedTests.length} tests. Ready for execution.`, 
                        { 
                            tests: generatedTests,
                            executionStarted: false 
                        }
                    );
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
                        ir_id: irPayload.irJson['id'],
                    }

                    updateStatus(targetNode.id, 'running', 'Verifying...');
                    const result = await verifySystem(input, { signal: options?.signal });
                    
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
                    await processNextNodes(targetNode.id, downstreamPackage, updateStatus, options); 
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

                    // 3. Look back up the graph to find the connected CHANGE_IMPACT (if any)
                    const changeNode = nodes.find(n => 
                        n.type === 'CHANGE_IMPACT' && 
                        connections.some(c => c.source === n.id && c.target === targetNode.id)
                    );

                    const endpoints = componentHolderNode?.data.componentPayload?.endpoints;
                    
                    if (!endpoints) {
                        throw new Error("No endpoints found. Please connect a COMPONENT HOLDER to this card and ensure it has run.");
                    }

                    // --- FILTERING LOGIC ---
                    let endpointsToProcess = Object.entries(endpoints);
                    const suggestions = formalVerifyNode?.data.verificationResult?.suggestions;

                    // Filter 1: If Formal Verify is connected and has results, filter the endpoints
                    if (suggestions && suggestions.length > 0) {
                        const allowedSignatures = new Set(suggestions.map((s: any) => s.id));

                        endpointsToProcess = endpointsToProcess.filter(([id, ep]: [string, any]) => {
                            const signature = `${ep.physicalServiceName}.${ep.controllerClass}.${ep.methodName}`;
                            return allowedSignatures.has(signature);
                        });
                    }

                    let targetedServices: string[] | undefined = undefined;
                    if (changeNode) {
                        if (changeNode.status !== 'completed') {
                            updateStatus(targetNode.id, 'running', 'Awaiting Changes...');
                            return;
                        }
                        
                        targetedServices = changeNode.data.targetedServices;
                        if (targetedServices && targetedServices.length > 0) {
                            endpointsToProcess = endpointsToProcess.filter(([id, ep]: [string, any]) => {
                                return targetedServices!.includes(ep.serviceName); 
                            });
                        }
                    }

                    // Setting up status messages
                    let statusMsg = `Generating scenarios for ${endpointsToProcess.length} endpoints`;
                    if (targetedServices) statusMsg += ` (Regression Testing)`;
                    if (suggestions && suggestions.length > 0) statusMsg += ` (FV Filtered)`;
                    updateStatus(targetNode.id, 'running', statusMsg + '...');

                    // Actually retrueving the scnarios from the API
                    const indexId = componentHolderNode?.data.componentPayload?.id;
                    const authVecId = componentHolderNode?.data.componentPayload?.authvecid;

                    let scenarioJson = await generateScenarios(indexId, authVecId, { signal: options?.signal });

                    const scenarios: any[] = [];

                    // Loop over the filtered array
                    for (const [id, ep] of endpointsToProcess) {
                        let scenario_id = `scn_${id}`;
                        const scenario = scenarioJson.scenarios.find((s: any) => s.scenario_id === scenario_id);
                        if (scenario) { 
                            scenarios.push(scenario);
                        }
                    }

                    const scenarioPayload: ScenarioPayload = { 
                        vectorId: `vector_${Date.now()}`,
                        scenarios: scenarios
                    };
                    
                    updateStatus(targetNode.id, 'completed', `Generated ${scenarios.length} scenarios.`, {
                        scenarioPayload,
                        selectedScenarios: scenarios.map(s => s.scenario_id),
                        targetedServices
                    });

                    await processNextNodes(targetNode.id, { ...payload, scenarioPayload }, updateStatus, options);
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

                    const data = await generateTestSuites(selectedLlm, prompts, { signal: options?.signal }); // Assumes { status: "success", tests: [...] }
                    
                    updateStatus(targetNode.id, 'completed', 'Test Suite Generated Successfully.', { 
                        testSuitePayload: data 
                    });

                    await processNextNodes(targetNode.id, { ...payload, testSuitePayload: data }, updateStatus, options);
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

                    const data = await generatePrompts(selectedIds, targetLanguage, { signal: options?.signal }); // Assuming { prompts: [...] }
                    
                    updateStatus(targetNode.id, 'completed', 'Prompts Generated Successfully.', { 
                        promptPayload: data 
                    });

                    await processNextNodes(targetNode.id, { ...payload, promptPayload: data }, updateStatus, options);
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

                    let finalIrJson: any = null;
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

                    updateStatus(targetNode.id, 'completed', statusMessage, (latestData: any) => {
                        const existingArray = latestData?.timelineIRs || [];
                        return {
                            payload: vizPayload,
                            timelineIRs: [...existingArray, JSON.parse(JSON.stringify(finalIrJson))]
                        };
                    });

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
                        ir_id: irPayload.irJson['id']
                    };

                    // Call the Python/Engine API
                    analyzeAegis(enginePayload, { signal: options?.signal })
                    .then(async (response) => {
                        if (options?.killSwitch?.current) return;

                        if (!response.ok) {
                            throw new Error(`Engine Status: ${response.status}`);
                        }
                        
                        // UI State Update
                        updateStatus(targetNode.id, 'completed', 'Analysis Complete. Click to View.', { payload: irPayload });

                        // Triggering the custom notification
                        setNotification({
                            type: 'success',
                            message: 'Aegis Analysis Complete!',
                            duration: 5000
                        });

                        // Triggering Browser Notification
                        if (document.hidden && Notification.permission === 'granted') {
                            new Notification('Aegis Analysis Complete', {
                                body: 'You can now view the results!',
                                icon: '/health.ico' 
                            });
                        }
                    })
                    .catch((error) => {
                        console.error('Aegis background analysis failed:', error);
                        updateStatus(targetNode.id, 'error', `Analysis Failed: ${error.message}`);
                    });
                }
                else if (targetNode.type === 'FORMAL_VIZ') {
                    // Use the deadlock fix to safely get state
                    setTimeout(() => {
                        if (options?.killSwitch?.current) return;

                        const liveNodes = nodesRef.current || nodes;
                        
                        const verifyNode = liveNodes.find(n => n.type === 'FORMAL_VERIFY' && connections.some(c => c.source === n.id && c.target === targetNode.id));
                        const regressionNode = liveNodes.find(n => n.type === 'SECURITY_REGRESSION' && connections.some(c => c.source === n.id && c.target === targetNode.id));

                        if (!verifyNode) {
                            updateStatus(targetNode.id, 'failed', "Please connect a Formal Verify base card.");
                            return;
                        }

                        const regressionStillRunning = regressionNode && regressionNode.status !== 'completed' && !payload?.regressionPayload;

                        if (verifyNode.status !== 'completed' || regressionStillRunning) {
                            updateStatus(targetNode.id, 'running', 'Awaiting upstream completion...');
                            return;
                        }

                        let systemInfo = verifyNode.data.systemInfo;

                        if (!systemInfo || !systemInfo.ir) {
                            let rawIr = null;
                            let sysName = "default-system";

                            const verifyParentConn = connections.find(c => c.target === verifyNode.id);
                            if (verifyParentConn) {
                                const parentNode = liveNodes.find(n => n.id === verifyParentConn.source);
                                if (parentNode && parentNode.data.payload) {
                                    rawIr = parentNode.data.payload.irJson || parentNode.data.payload;
                                    sysName = parentNode.data.payload.systemName || sysName;
                                }
                            }

                            if (!rawIr) {
                                const baseNode = liveNodes.find(n => (n.type === 'MULTI_REPO' || n.type === 'IR_HOLDER' || n.type === 'COMPONENT_GENERATE' || n.type === 'COMPONENT_HOLDER') && connections.some(c => c.source === n.id && c.target === targetNode.id));
                                if (baseNode && baseNode.data.payload) {
                                    rawIr = baseNode.data.payload.irJson || baseNode.data.payload;
                                    sysName = baseNode.data.payload.systemName || sysName;
                                }
                            }

                            if (rawIr) {
                                systemInfo = {
                                    systemName: sysName,
                                    ir: rawIr
                                };
                            }
                        }

                        updateStatus(targetNode.id, 'completed', regressionNode ? 'Ready for Diff Visualization' : 'Ready for Visualization', { 
                            verificationResult: verifyNode.data.verificationResult,
                            systemInfo: systemInfo, 
                            regressionPayload: regressionNode?.data.regressionPayload
                        });
                    }, 50);
                }
                else if (targetNode.type === 'VERIFICATION_COMPARISON') {
                    setTimeout(async () => {
                        if (options?.killSwitch?.current) return;

                        const liveNodes = nodesRef.current || nodes;

                        const verifyNode = liveNodes.find(n => n.type === 'FORMAL_VERIFY' 
                            && connections.some(c => c.source === n.id && c.target === targetNode.id));
                        
                            const scenarioNode = liveNodes.find(n => n.type === 'SCENARIO_GENERATE' 
                            && connections.some(c => c.source === n.id && c.target === targetNode.id));

                        if (!verifyNode || !scenarioNode) {
                            updateStatus(targetNode.id, 'failed', "Link BOTH 'Formal Verification' and 'Scenario Generation' cards.");
                            return;
                        }

                        if (verifyNode.status !== 'completed' || scenarioNode.status !== 'completed') {
                            updateStatus(targetNode.id, 'running', 'Awaiting upstream completion...');
                            return;
                        }

                        updateStatus(targetNode.id, 'running', 'Calculating Statistics...');

                        try {
                            const suggestions = verifyNode.data.verificationResult?.suggestions || [];
                            const allScenarios = scenarioNode.data.scenarioPayload?.scenarios || [];

                            const inconsistentScenarios = allScenarios.filter((s: any) => 
                                s.policy_inconsistencies && s.policy_inconsistencies.length > 0
                            );

                            const mappedSuggestions = suggestions.filter((sug: any) => {
                                return inconsistentScenarios.some((s: any) => {
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

                            updateStatus(targetNode.id, 'completed', 'Comparison Generated.', { comparisonResult: stats });

                            await processNextNodes(targetNode.id, { ...payload, comparisonResult: stats }, updateStatus, options);

                        } catch (error: any) {
                            updateStatus(targetNode.id, 'failed', error.message || "Failed to calculate comparison statistics.");
                        }
                    }, 50);
                }
                else if (targetNode.type === 'CHANGE_IMPACT') {
                    setTimeout(async () => {
                        if (options?.killSwitch?.current) return;

                        const liveNodes = nodesRef.current || nodes;

                        const baseNode = liveNodes.find(n => (n.type === 'MULTI_REPO' || n.type === 'IR_HOLDER') 
                            && connections.some(c => c.source === n.id && c.target === targetNode.id));
                        
                            const targetInputNode = liveNodes.find(n => n.type === 'SYSTEM_INPUT' 
                            && connections.some(c => c.source === n.id && c.target === targetNode.id));

                        if (!baseNode || !targetInputNode) {
                            updateStatus(targetNode.id, 'failed', "Missing Inputs: Please connect a Base IR (Generate IR / IR Holder) AND a Target Commit (System Source) to calculate Delta.");
                            return;
                        }

                        // Checking if IR generation is complete
                        if (baseNode.status !== 'completed' || !baseNode.data.payload) {
                            updateStatus(targetNode.id, 'running', 'Awaiting Base IR completion...');
                            return;
                        }
                        
                        // Checking if the comparator details are available
                        if (targetInputNode.status !== 'completed' || !targetInputNode.data.repositories || targetInputNode.data.repositories.length === 0) {
                            updateStatus(targetNode.id, 'running', 'Retrieving comparator details...');
                            return;
                        }

                        updateStatus(targetNode.id, 'running', 'Analyzing Codebase Delta...');

                        try {
                            const baseMeta = baseNode.data.payload.metadata || [];
                            const targetMeta = targetInputNode.data.repositories || [];
                            const systemName = baseNode.data.payload.systemName || targetInputNode.data.systemName || "train-ticket";

                            const deltaInput = {
                                id: baseNode.data.payload.irJson?.id || "delta-req",
                                systemName: systemName,
                                systemRepositories: baseMeta.map((m: any) => ({
                                    repoBranchPair: { repositoryURL: m.repoUrl, branchName: m.branch },
                                    commitID: m.commitId
                                })),
                                comparingRepositories: targetMeta.map((m: any) => ({
                                    repoBranchPair: { repositoryURL: m.repoUrl, branchName: m.branch },
                                    commitID: m.commitId
                                }))
                            };

                            const result = await fetchChangeImpact(deltaInput, { signal: options?.signal });

                            const changes = result.changes || [];
                            const affectedSet = new Set<string>();
                            changes.forEach((c: any) => {
                                const parts = c.path.split('/');
                                if (parts.length > 1 && parts[1].startsWith('ts-')) {
                                    affectedSet.add(parts[1]);
                                } else if (parts.length > 2 && parts[2].startsWith('ts-')) {
                                    affectedSet.add(parts[2]);
                                }
                            });

                            updateStatus(targetNode.id, 'completed', 'Impact Analysis Complete.', {
                                changeImpactPayload: result,
                                targetedServices: Array.from(affectedSet) 
                            });
                            
                            // Trigger downstream cards now that this is complete
                            await processNextNodes(targetNode.id, { ...payload, changeImpactPayload: result }, updateStatus, options);
                        } catch (error: any) {
                            // Deliberatly ignoring this message.
                            if(error.message !== 'Delta API error') 
                                updateStatus(targetNode.id, 'failed', error.message);
                        }
                    }, 50);
                }
                else if (targetNode.type === 'SECURITY_REGRESSION') {
                    setTimeout(async () => {
                        if (options?.killSwitch?.current) return;

                        const liveNodes = nodesRef.current || nodes;

                        const fvNodes = liveNodes.filter(n => 
                            n.type === 'FORMAL_VERIFY' && 
                            connections.some(c => c.source === n.id && c.target === targetNode.id)
                        );

                        if (fvNodes.length !== 2) return;

                        const [baseNode, prNode] = fvNodes.sort((a, b) => a.y - b.y);

                        const baseResult = baseNode.data.verificationResult;
                        const prResult = prNode.data.verificationResult;

                        // If still missing after the flush, one is genuinely still running
                        if (!baseResult || !prResult) {
                            updateStatus(targetNode.id, 'running', 'Awaiting both Verifications to finish...');
                            return;
                        }

                        updateStatus(targetNode.id, 'running', 'Calculating Security Drift...');

                        try {
                            const baseSugs = baseResult.suggestions || [];
                            const targetSugs = prResult.suggestions || [];

                            // Extremely safe Array diffing to prevent infinite loops
                            const persistent = baseSugs.filter((b: any) => targetSugs.some((t: any) => t.id === b.id));
                            const resolved = baseSugs.filter((b: any) => !targetSugs.some((t: any) => t.id === b.id));
                            const introduced = targetSugs.filter((t: any) => !baseSugs.some((b: any) => b.id === t.id));

                            const regressionPayload = {
                                baseCount: baseSugs.length,
                                targetCount: targetSugs.length,
                                resolved,
                                introduced,
                                persistent
                            };

                            updateStatus(targetNode.id, 'completed', `Found ${introduced.length} regressions.`, { 
                                regressionPayload 
                            });
                            await processNextNodes(targetNode.id, { ...payload, regressionPayload }, updateStatus, options);
                        } catch (error: any) {
                            updateStatus(targetNode.id, 'failed', error.message || "Failed to calculate drift.");
                        }
                    }, 50);
                }

            } catch (err: any) {
                if (err.name === 'AbortError') {
                    updateStatus(targetNode.id, 'idle', 'Pipeline stopped by user.');
                } else {
                    updateStatus(targetNode.id, 'failed', `Error: ${err.message}`);
                }
            }
        }
    };

    const stopPipeline = useCallback(() => {
            killSwitchRef.current = true;
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            setIsRunning(false);
            track(PipelineEvent.RUN_STOPPED);
        }, []);

    // --- Renderers ---
    const renderCardContent = (node: NodeData) => {
        switch (node.type) {
            case 'SYSTEM_INPUT': return <SystemInputCard node={node} updateNodeData={updateNodeData} />;
            case 'MULTI_REPO': return <IRGenerationCard node={node} />;
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
            case 'VERIFICATION_COMPARISON': return <VerificationComparisonCard node={node} />;
            case 'CHANGE_IMPACT': return <ChangeImpactCard node={node} updateNodeData={updateNodeData}/>;
            case 'SECURITY_REGRESSION': return <SecurityRegressionCard node={node} />;
            default: return null;
        }
    }

    return (
        <div className="h-screen bg-slate-900 text-white flex flex-col font-sans overflow-hidden">
            <NotificationToast 
                notification={notification} 
                onClose={() => setNotification(null)} 
            />

            {runTour && <PipelineTour run={runTour} onFinish={handleTourFinish} />}
            
            {/* Header */}
            <PipelineHeader 
                isLinking={isLinking}
                nodesCount={nodes.length}
                isRunning={isRunning}
                sessionName={sessionName}
                sessionId={sessionId}  
                hasUnsavedChanges={hasUnsavedChanges}
                onLoad={handleLoadSession}
                clearPipeline={clearPipeline}
                runPipeline={runPipeline}
                stopPipeline={stopPipeline}
                onSave={handleSaveSession} 
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={historyIndex > 0}
                canRedo={historyIndex < history.length - 1}      
            />
            
            <div className="flex flex-1 overflow-hidden">
                {/* Toolbox */}
                <ToolboxSidebar 
                    expandedCategories={expandedCategories}
                    toggleCategory={toggleCategory}
                    addNode={addNode}
                    clearPipeline={clearPipeline}
                    openTemplateModal={() => {
                        track(PipelineEvent.TEMPLATE_LIBRARY_OPENED);
                        setIsTemplateLibraryOpen(true);
                    }}
                />

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
                    onTouchMove={handleCanvasTouchMove}
                    onTouchEnd={handleCanvasTouchEnd}
                    onTouchCancel={handleCanvasTouchEnd}
                    handleNodeTouchStart={handleNodeTouchStart}
                    handleCanvasTouchStart={handleCanvasTouchStart}
                />

                {/* Feedback Modal */}
                <FeedbackModal 
                    isOpen={showFeedback} 
                    onClose={handleFeedbackSkip} 
                    onSubmit={handleFeedbackSubmit} 
                />

                {/* Template Library */}
                <TemplateLibraryModal
                    isOpen={isTemplateLibraryOpen}
                    onClose={() => setIsTemplateLibraryOpen(false)}
                    onSelectTemplate={applyTemplate}
                />
            </div>
        </div>
    );
};

export default PipelinePage;