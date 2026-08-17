import React, { useState, useRef, useEffect } from 'react';
import { 
    saveGitHubToken, 
    deleteGitHubToken, 
    checkGitHubTokenStatus, 
    getAvailableSessions, 
    deleteSession
} from '../../../services/api';

import { useNavigate } from 'react-router-dom';

const BrandSection = ({ sessionName, hasUnsavedChanges }: { sessionName?: string; hasUnsavedChanges: boolean }) => {
    const navigate = useNavigate();

    const displayTitle = sessionName ? sessionName.split('-').slice(0, 2).join(' ') : '';

    return (
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
                <h1 className="font-bold text-2xl tracking-[0.2em] uppercase bg-clip-text text-transparent bg-gradient-to-br from-white via-slate-400 to-teal-500">
                    CONDUIT
                </h1>
                
                {/* Divider */}
                <span className="text-slate-600 font-light text-2xl mx-1 mb-1">|</span>
                
                {/* Subtitle or Session Name */}
                <div className="tour-session-status flex flex-col mt-1">
                    {sessionName ? (
                        <div className="flex items-center gap-2">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[13px] font-semibold text-slate-400 tracking-wider uppercase leading-none">
                                    Microservice Analysis Toolkit
                                </span>
                                <span className="text-[9px] font-medium text-slate-500 tracking-widest uppercase leading-none">
                                    By AridNova
                                </span>
                            </div>

                            <span className="text-slate-600 font-light text-2xl mx-1 mb-1">|</span>
                            
                            <span className="text-[13px] font-bold text-slate-200 tracking-wider uppercase" title={sessionName}>
                                {displayTitle}
                            </span>
                            {hasUnsavedChanges ? (
                                <span className="hidden md:inline-block bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] px-1.5 py-0.5 rounded-sm uppercase tracking-widest font-semibold transition-colors duration-300">
                                    Unsaved
                                </span>
                            ) : (
                                <span className="inline-block bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[9px] px-1.5 py-0.5 rounded-sm uppercase tracking-widest font-semibold transition-colors duration-300">
                                    Saved
                                </span>
                            )}
                        </div>
                    ) : (
                        <span className="text-[13px] font-semibold text-slate-400 tracking-wider uppercase">
                            Microservice Analysis Toolkit
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

const StatusIndicators = ({ isLinking }: { isLinking: boolean | string | null }) => {
    return (
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
    );
};

interface PipelineHeaderProps {
    isLinking: boolean | string | null;
    nodesCount: number; 
    isRunning: boolean;
    sessionName?: string;
    sessionId: string | null;
    hasUnsavedChanges: boolean;
    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
    clearPipeline: () => void;
    runPipeline: () => void;
    stopPipeline: () => void;
    onLoad: (sessionId: string) => Promise<void>;
    onSave: (name: string, isSaveAs: boolean) => Promise<void>;
}

export const PipelineHeader: React.FC<PipelineHeaderProps> = ({
    isLinking,
    nodesCount,
    isRunning,
    sessionName,
    sessionId,
    hasUnsavedChanges,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onSave,
    onLoad,
    clearPipeline,
    runPipeline,
    stopPipeline
}) => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [tokenInput, setTokenInput] = useState('');
    const [showWarning, setShowWarning] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);

    // Session Saving States
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [editSessionName, setEditSessionName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Session Loading States
    const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
    const [sessionsList, setSessionsList] = useState<any[]>([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    // LLM Configuration States
    const [llmProvider, setLlmProvider] = useState<'internal' | 'local' | 'external'>(() => {
        return (localStorage.getItem('llm_provider') as 'internal' | 'local' | 'external') || 'internal';
    });
    const [llmUri, setLlmUri] = useState(() => localStorage.getItem('llm_uri') || '');
    const [llmToken, setLlmToken] = useState(() => localStorage.getItem('llm_token') || '');
    const [llmSaved, setLlmSaved] = useState(false);

    const handleSaveLlmConfig = () => {
        localStorage.setItem('llm_provider', llmProvider);
        localStorage.setItem('llm_uri', llmUri);
        localStorage.setItem('llm_token', llmToken);
        setLlmSaved(true);
        setTimeout(() => setLlmSaved(false), 3000);
    };

    // Session Hadlers
    const handleQuickSave = async () => {
        setIsSaving(true);
        await onSave(sessionName || 'Untitled Session', !sessionId);
        setIsSaving(false);
    };

    const handleSaveAsSubmit = async () => {
        if (!editSessionName.trim()) return;
        setIsSaving(true);
        await onSave(editSessionName.trim(), true);
        setIsSaving(false);
        setIsSaveModalOpen(false);
    };

    const openSaveAsModal = () => {
        setEditSessionName(sessionName || '');
        setIsSaveModalOpen(true);
    };

    const fetchSessionsPage = async (page: number) => {
        setIsLoadingSessions(true);
        try {
            const data = await getAvailableSessions(page, 10); 
            setSessionsList(data.sessions);
            setCurrentPage(data.currentPage);
            setTotalPages(data.totalPages);
        } catch (error) {
            console.error("Failed to fetch sessions", error);
        } finally {
            setIsLoadingSessions(false);
        }
    };

    const openLoadModal = async () => {
        setIsLoadModalOpen(true);
        setIsSettingsOpen(false);
        fetchSessionsPage(0);
    };

    const handleSessionSelect = async (id: string) => {
        setIsLoadModalOpen(false);
        await onLoad(id);
    };

    const handleDeleteSession = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation(); 
        
        if (window.confirm(`Are you sure you want to delete the session "${name}"? This cannot be undone.`)) {
            setIsLoadingSessions(true);
            try {
                await deleteSession(id);
                await fetchSessionsPage(currentPage); 
            } catch (error) {
                console.error("Failed to delete session", error);
            } finally {
                setIsLoadingSessions(false);
            }
        }
    };

    // Checking token availability
    useEffect(() => {
        const verifyToken = async () => {
            if (sessionStorage.getItem('skipped_github_token')) return;

            const hasToken = await checkGitHubTokenStatus();
            if (!hasToken) {
                setIsSettingsOpen(true);
                setShowWarning(true);
                sessionStorage.setItem('skipped_github_token', 'true');
            }
        };
        verifyToken();
    }, []);

    // Close dropdown if user clicks outside of it
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setIsSettingsOpen(false);
                setShowWarning(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSaveToken = async () => {
        if (!tokenInput.trim()) return;
        
        try {
            await saveGitHubToken(tokenInput.trim());
            
            console.log("Token successfully updated on backend");
            setTokenInput(''); 
            setIsSettingsOpen(false);
            setShowWarning(false);
        } catch{
            console.error("Failed to save/update token");
        }
    };

    const handleDeleteToken = async () => {
        try {
            await deleteGitHubToken();
            console.log("Token successfully deleted removed!");
            setIsSettingsOpen(false);
            setShowWarning(false);
        } catch {
            console.error("Failed to delete token");
        }
    };

    const handleSkip = () => {
        setIsSettingsOpen(false);
        setShowWarning(false);
    };

    return (
        <div className="tour-pipeline-header h-16 border-b border-slate-700 bg-slate-800 flex items-center justify-between px-6 z-20 shadow-md">
            {/* Left Side: Brand and Navigation */}
            <BrandSection sessionName={sessionName} hasUnsavedChanges={hasUnsavedChanges}/>

            {/* Right Side: Status and Controls */}
            <div className="flex items-center gap-4">
                <StatusIndicators isLinking={isLinking} />

                {nodesCount > 0 && (
                    <button 
                        onClick={clearPipeline}
                        disabled={isRunning}
                        className="text-xs text-slate-500 hover:text-red-400 active:text-red-500 transition-all mr-2 px-3 py-1.5 bg-red-500/0 hover:bg-red-500/10 active:bg-red-500/20 rounded-md touch-manipulation disabled:opacity-50 disabled:pointer-events-none"
                    >
                        Clear All
                    </button>
                )}

                {/* --- Undo and Redo --- */}
                <div className="tour-undo-redo flex items-center gap-2 border-l border-slate-700 pl-4 ml-2">
                    <button
                        onClick={onUndo}
                        disabled={!canUndo}
                        className="p-2 bg-slate-800 border border-slate-600 text-slate-200 hover:text-white hover:bg-slate-700 hover:border-slate-500 shadow-sm rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Undo (Ctrl+Z)"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                    </button>

                    <button
                        onClick={onRedo}
                        disabled={!canRedo}
                        className="p-2 bg-slate-800 border border-slate-600 text-slate-200 hover:text-white hover:bg-slate-700 hover:border-slate-500 shadow-sm rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Redo (Ctrl+Y)"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
                        </svg>
                    </button>
                </div>

                {/* --- Settings Cogwheel & Dropdown --- */}
                <div className="tour-settings-button relative" ref={settingsRef}>
                    <button 
                        onClick={() => {
                            setIsSettingsOpen(!isSettingsOpen)
                            setShowWarning(false);
                        }}
                        className={`p-2 rounded-lg transition-all duration-200 border ${
                            isSettingsOpen 
                                ? 'bg-slate-700 text-purple-400 border-purple-500/50 shadow-inner' 
                                : 'bg-slate-800 text-slate-400 border-transparent hover:bg-slate-700 hover:text-slate-200'
                        }`}
                        title="Settings"
                    >
                        <svg className={`w-5 h-5 transition-transform duration-500 ${isSettingsOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>

                    {/* Settings Dropdown Box */}
                    {isSettingsOpen && (
                        <div className="absolute right-0 top-full mt-2 w-72 bg-slate-800/95 backdrop-blur-md border border-slate-600 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                            <div className="p-4 space-y-4">

                                {/* Session Saving Settings */}
                                <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
                                   <svg className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 21v-8H7v8" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3v5h8V3" />
                                    </svg>
                                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Session</h3>
                                </div>

                                <div className="grid grid-cols-3 gap-2 pb-2">
                                    <button 
                                        onClick={handleQuickSave}
                                        disabled={isSaving}
                                        className="col-span-1 py-2 bg-slate-900 border border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed gap-1.5"
                                    >
                                        Save
                                    </button>
                                    
                                    <button 
                                        onClick={openSaveAsModal}
                                        disabled={isSaving}
                                        className="col-span-1 py-2 bg-slate-900 border border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Save As
                                    </button>
                                    
                                    <button 
                                        onClick={openLoadModal}
                                        disabled={isSaving}
                                        className="col-span-1 py-2 bg-slate-900 border border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Load
                                    </button>
                                </div>
                                
                                {/* GitHub Token Settings */}
                                <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
                                    <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                    </svg>
                                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Authentication</h3>
                                </div>

                                {showWarning && (
                                    <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-lg flex gap-2 items-start">
                                        <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <p className="text-[10px] text-amber-200 leading-tight">
                                            A GitHub token is necessary for accessing private repositories and bypassing API rate limits.
                                        </p>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Set GitHub Token</label>
                                    <input 
                                        type="password" 
                                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                                        value={tokenInput}
                                        onChange={(e) => setTokenInput(e.target.value)}
                                        className="w-full text-xs bg-slate-900 border border-slate-700 rounded-md p-2 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none text-slate-200 font-mono shadow-inner transition-all"
                                    />
                                    <p className="text-[9px] text-slate-500 leading-tight pt-1">
                                        For security, existing tokens are never displayed. Entering a new token will overwrite the old one.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 pt-2">
                                    {showWarning ? (
                                        <button 
                                            onClick={handleSkip}
                                            className="px-3 py-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors flex-shrink-0"
                                        >
                                            Skip
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={handleDeleteToken}
                                            className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors flex-shrink-0"
                                        >
                                            Delete
                                        </button>
                                    )}
                                    
                                    <button 
                                        onClick={handleSaveToken}
                                        disabled={!tokenInput.trim()}
                                        className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors shadow-md"
                                    >
                                        Set Token
                                    </button>
                                </div>
                                
                                {/* LLM Configuration */}
                                <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
                                    <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">AI Configuration</h3>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Select Provider</label>
                                    <div className="flex flex-col gap-1.5">
                                        {[
                                            { value: 'internal', label: 'Internal SLM', desc: 'Use built-in secure model' },
                                            { value: 'local', label: 'Local LLM', desc: 'Model running on your local environment' },
                                            { value: 'external', label: 'External LLM', desc: 'Cloud-based API' },
                                        ].map(option => (
                                            <button
                                                key={option.value}
                                                onClick={() => setLlmProvider(option.value as 'internal' | 'local' | 'external')}
                                                className={`w-full text-left px-3 py-2 rounded-md border text-[10px] transition-all ${
                                                    llmProvider === option.value
                                                        ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-300'
                                                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
                                                }`}
                                            >
                                                <span className="font-bold uppercase tracking-wider">{option.label}</span>
                                                <span className="block text-slate-500 mt-0.5">{option.desc}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {llmProvider !== 'internal' && (
                                        <div className="space-y-1.5 pt-1">
                                            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">URI</label>
                                            <input
                                                type="text"
                                                placeholder="https://api.example.com/v1"
                                                value={llmUri}
                                                onChange={(e) => setLlmUri(e.target.value)}
                                                className="w-full text-xs bg-slate-900 border border-slate-700 rounded-md p-2 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none text-slate-200 font-mono shadow-inner transition-all"
                                            />
                                            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Access Token</label>
                                            <input
                                                type="password"
                                                placeholder="sk-xxxxxxxxxxxxxxxxxxxx"
                                                value={llmToken}
                                                onChange={(e) => setLlmToken(e.target.value)}
                                                className="w-full text-xs bg-slate-900 border border-slate-700 rounded-md p-2 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none text-slate-200 font-mono shadow-inner transition-all"
                                            />
                                        </div>
                                    )}

                                    <button
                                        onClick={handleSaveLlmConfig}
                                        className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors shadow-md mt-1"
                                    >
                                        Save Configuration
                                    </button>
                                    {llmSaved && (
                                        <p className="text-[10px] text-cyan-400 text-center mt-1 animate-pulse">
                                            ✓ Configuration saved!
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
                                    <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Help/Documentation</h3>
                                </div>
                                <div>
                                    <button 
                                        onClick={() => { 
                                            window.dispatchEvent(new Event('trigger-pipeline-tour'));
                                            setIsSettingsOpen(false);
                                        }} 
                                        className="w-full py-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white hover:border-slate-500 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm group"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                        </svg>
                                        Start a Tour
                                    </button>

                                    <span className="block h-1" />

                                    {/* Video Demos Playlist */}
                                    <a 
                                        href="https://www.youtube.com/playlist?list=PL-wbcL0lihjDzvWDNHR4oFr7-7eNr-uf6"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full py-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white hover:border-slate-500 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm group text-center"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z"/>
                                        </svg>
                                        Watch Video Demos
                                    </a>

                                    <span className="block h-1" />

                                    {/* Documentation Guide */}
                                    <a 
                                        href="https://docs.google.com/document/d/1TRfHll6ZbzoHfdcWFsw98wXIGXO_ji32/edit?pli=1"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full py-2 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white hover:border-slate-500 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm group text-center"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                        </svg>
                                        Read Documentation
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="tour-run-pipeline relative group flex items-center">
                    {isRunning ? (
                        /* Stop Pipeline*/
                        <button 
                            onClick={stopPipeline} 
                            className="px-5 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-3 bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 hover:border-rose-500 shadow-lg shadow-rose-900/20 active:translate-y-0.5 animate-pulse"
                        >
                            {/* Spinning Indicator */}
                            <svg className="animate-spin h-4 w-4 text-rose-400 group-hover:text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                            </svg>
                            <span>Stop Pipeline</span>
                        </button>
                    ) : (
                        /* Run Pipeline */
                        <button 
                            onClick={runPipeline}
                            disabled={nodesCount === 0}
                            className={`
                                px-5 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-3
                                ${nodesCount === 0 
                                    ? 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed shadow-none' 
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:translate-y-0.5'}
                            `}
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                                <path d="M10 8L16 12L10 16V8Z" fill="currentColor"/>
                            </svg>
                            <span>Run Pipeline</span>
                        </button>
                    )}

                    {/* Tooltip description */}
                    <div className="absolute top-full right-0 mt-2 w-max pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 bg-slate-900/90 text-slate-300 text-[10px] py-1 px-2 rounded border border-slate-700 backdrop-blur-sm shadow-xl">
                        {isRunning ? "Force terminate all ongoing background tasks" : "Execute current graph"}
                    </div>
                </div>
            </div>
            
            {isSaveModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 w-96 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h2 className="text-lg font-bold text-white mb-1">Save Session As</h2>
                        <p className="text-xs text-slate-400 mb-4">Save your current workspace for later use.</p>
                        
                        <input 
                            type="text" 
                            value={editSessionName}
                            onChange={(e) => setEditSessionName(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-md p-2.5 text-sm text-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50 outline-none mb-5 transition-all"
                            placeholder="Session Name"
                            autoFocus
                        />
                        
                        <div className="flex gap-3 justify-end">
                            <button 
                                onClick={() => setIsSaveModalOpen(false)}
                                className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveAsSubmit}
                                disabled={!editSessionName.trim() || isSaving}
                                className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-md transition-colors shadow-md flex items-center gap-2"
                            >
                                {isSaving ? "Saving..." : "Save Session"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isLoadModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 w-[450px] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
                        
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h2 className="text-lg font-bold text-white mb-1">Load Session</h2>
                                <p className="text-xs text-slate-400">Select a saved workspace to restore.</p>
                            </div>
                            <button onClick={() => setIsLoadModalOpen(false)} className="text-slate-400 hover:text-white p-1 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        {/* Session List */}
                        <div className="flex-1 overflow-y-auto pr-2 space-y-2 min-h-[200px]">
                            {isLoadingSessions ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3">
                                    <svg className="animate-spin h-6 w-6 text-teal-500" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    <span className="text-xs font-medium uppercase tracking-wider">Loading sessions...</span>
                                </div>
                            ) : sessionsList.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-xs text-slate-500">
                                    No saved sessions found.
                                </div>
                            ) : (
                                sessionsList.map((session) => (
                                    <button
                                        key={session.id}
                                        onClick={() => handleSessionSelect(session.id)}
                                        className="w-full text-left p-3 rounded-lg bg-slate-900 border border-slate-700 hover:border-teal-500/50 hover:bg-slate-800 transition-all group flex justify-between items-center"
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-200 group-hover:text-teal-400 transition-colors">
                                                {session.name}
                                            </span>
                                            <span className="text-[10px] text-slate-500 mt-0.5 font-mono">
                                                {new Date(session.updated_at).toLocaleString()}
                                            </span>
                                        </div>
                                        
                                        {/* Actions Container */}
                                        <div className="flex items-center space-x-3">
                                            {/* Delete Button */}
                                            <div 
                                                onClick={(e) => handleDeleteSession(e, session.id, session.name)}
                                                className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-slate-800 rounded transition-colors opacity-0 group-hover:opacity-100"
                                                title="Delete Session"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </div>
                                            
                                            {/* Load Arrow */}
                                            <svg className="w-4 h-4 text-slate-600 group-hover:text-teal-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Pagination Footer */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
                                <button
                                    onClick={() => fetchSessionsPage(currentPage - 1)}
                                    disabled={currentPage === 0 || isLoadingSessions}
                                    className="px-3 py-1.5 bg-slate-900 border border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Previous
                                </button>
                                
                                <span className="text-xs text-slate-500 font-mono">
                                    Page {currentPage + 1} of {totalPages}
                                </span>
                                
                                <button
                                    onClick={() => fetchSessionsPage(currentPage + 1)}
                                    disabled={currentPage >= totalPages - 1 || isLoadingSessions}
                                    className="px-3 py-1.5 bg-slate-900 border border-slate-700 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Next
                                </button>
                            </div>
                        )}
                        
                    </div>
                </div>
            )}
        </div>
    );
};

