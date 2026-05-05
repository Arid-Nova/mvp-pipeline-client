import React, { useState, useRef, useEffect } from 'react';
import { saveGitHubToken, deleteGitHubToken, checkGitHubTokenStatus } from '../../../services/api';

import { useNavigate } from 'react-router-dom';

const BrandSection = () => {
    const navigate = useNavigate();

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
    clearPipeline: () => void;
    runPipeline: () => void;
}

export const PipelineHeader: React.FC<PipelineHeaderProps> = ({
    isLinking,
    nodesCount,
    isRunning,
    clearPipeline,
    runPipeline
}) => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [tokenInput, setTokenInput] = useState('');
    const [showWarning, setShowWarning] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);

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
        <div className="h-16 border-b border-slate-700 bg-slate-800 flex items-center justify-between px-6 z-20 shadow-md">
            {/* Left Side: Brand and Navigation */}
            <BrandSection />

            {/* Right Side: Status and Controls */}
            <div className="flex items-center gap-4">
                <StatusIndicators isLinking={isLinking} />
                {nodesCount > 0 && (
                    <button 
                        onClick={clearPipeline}
                        disabled={isRunning}
                        className="text-xs text-slate-500 hover:text-red-400 transition-colors mr-2"
                    >
                        Clear All
                    </button>
                )}

                {/* --- Settings Cogwheel & Dropdown --- */}
                <div className="relative" ref={settingsRef}>
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
                                        onClick={handleDeleteToken}
                                        className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors flex-shrink-0"
                                    >
                                        Delete
                                    </button>
                                    
                                    <button 
                                        onClick={handleSaveToken}
                                        disabled={!tokenInput.trim()}
                                        className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors shadow-md"
                                    >
                                        Set Token
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="relative group flex items-center">
                    <button 
                        onClick={runPipeline}
                        disabled={isRunning || nodesCount === 0}
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
    );
};

