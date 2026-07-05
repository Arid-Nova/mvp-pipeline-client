import React, { useEffect, useMemo, useState } from "react";
import { ChatbotContext } from "../../services/types";
import { useChatbotState } from "./useChatbotState";
import ChatComposer from "./ChatComposer";
import ChatMessage from "./ChatMessage";
import RuntimeStatus from "./RuntimeStatus";

interface ChatbotPanelProps {
    activeContext?: ChatbotContext;
}

const getContextEntries = (context?: ChatbotContext): Array<{ label: string; value: string }> => {
    if (!context) return [];
    const entries: Array<{ label: string; value: string | undefined }> = [
        { label: "System", value: context.systemName },
        { label: "IR", value: context.irId },
        { label: "Index", value: context.indexId },
        { label: "Run", value: context.runId },
        { label: "Commit", value: context.commitId },
        { label: "Service", value: context.selectedService },
        { label: "Endpoint", value: context.selectedEndpoint }
    ];
    return entries
        .filter((entry): entry is { label: string; value: string } => Boolean(entry.value && entry.value.trim()))
        .map((entry) => ({ label: entry.label, value: entry.value }));
};

const ChatbotPanel: React.FC<ChatbotPanelProps> = ({ activeContext }) => {  
    const [input, setInput] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [minSpin, setMinSpin] = useState(false);
    // const [isContextExpanded, setIsContextExpanded] = useState(false);
    
    const contextEntries = useMemo(() => getContextEntries(activeContext), [activeContext]);
    const {
        messages, loading, error, health, healthLoading, healthError,
        refreshLoading, refreshResult, refreshError, localStaleContext,
        sendQuestion, retryLastFailed, clearConversation, refreshHealth, refreshContext, canRetry
    } = useChatbotState(contextEntries.length > 0 ? activeContext : undefined);

    useEffect(() => { refreshHealth(); }, [refreshHealth]);
    useEffect(() => { if (isOpen) refreshHealth(); }, [isOpen, refreshHealth]);

    const onSubmit = async () => {
        const question = input.trim();
        if (!question || loading) return;
        await sendQuestion(question);
        setInput("");
    };

    return (
        <>
            {/* Floating Action Button (FAB) */}
            <div className="fixed bottom-16 right-8 z-[130] group flex items-center justify-center">

                {/* Tooltip */}
                {!isOpen && (
                    <div className="absolute right-full mr-4 pointer-events-none opacity-0 group-hover:opacity-100 group-hover:-translate-x-1 translate-x-1 transition-all duration-300 ease-out w-max max-w-[220px]">
                        <div className="bg-slate-800/90 backdrop-blur-md text-slate-200 text-[11.5px] leading-relaxed font-medium px-4 py-2.5 rounded-xl border border-white/10 shadow-xl shadow-black/20">
                            Ask the live AI assistant anything about the system architecture!
                            
                            <div className="absolute top-1/2 -right-1 -translate-y-1/2 border-[5px] border-transparent border-l-white/10" />
                            <div className="absolute top-1/2 -right-[3px] -translate-y-1/2 border-[5px] border-transparent border-l-slate-800/90" />
                        </div>
                    </div>
                )}

                {/* FAB */}
                <button
                    data-testid="chatbot-toggle"
                    onClick={() => setIsOpen((prev) => !prev)}
                    className={`w-14 h-14 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.4)] border transition-all duration-300 hover:scale-105 flex items-center justify-center relative ${
                        isOpen 
                            ? "bg-slate-800 text-slate-300 border-white/10 hover:bg-slate-700 rotate-90" 
                            : "bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400/30 rotate-0"
                    }`}
                >
                    {isOpen ? (
                        <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    ) : (
                        <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Main Chatbot Panel */}
            {isOpen && (
                <div 
                    data-testid="chatbot-panel" 
                    className={`fixed bottom-36 right-8 z-[120] w-[420px] max-w-[90vw] h-[640px] max-h-[75vh] bg-slate-950/50 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_16px_60px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden transition-all duration-300 ease-out origin-bottom-right ${
                        isOpen
                            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                            : "opacity-0 scale-90 translate-y-8 pointer-events-none"
                    }`}
                    >
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-white/5 bg-transparent shrink-0 w-full flex items-center justify-between">
                        
                        {/* Left Side: Icon, Title, and Status */}
                        <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0 shadow-sm">
                                <svg className="w-5 h-5 text-cyan-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                </svg>
                            </div>
                            
                            {/* Title & Status */}
                            <div className="flex flex-col gap-1 min-w-0">
                                <h2 className="text-[14px] font-bold text-slate-100 tracking-wide truncate leading-none mt-0.5 flex items-center gap-1.5">
                                    AI Assistant
                                </h2>
                                <RuntimeStatus health={health} loading={healthLoading} error={healthError} />
                            </div>
                        </div>
                        
                        {/* Right Side: Scope information since it is auto-refreshing */}
                        {activeContext?.runId ? (
                            <div 
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/40 border border-white/5 shrink-0 max-w-[140px]"
                                title={`Active Context: ${activeContext.runId}`}
                            >
                                <span className="relative flex h-1.5 w-1.5 shrink-0">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                </span>
                                <span className="text-[10px] font-mono text-slate-300 truncate tracking-wide">
                                    {activeContext.runId}
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center px-3 py-1.5 rounded-xl bg-slate-900/50 border border-white/5 shrink-0">
                                <span className="text-[10px] font-medium text-slate-500 tracking-wide italic">
                                    No active run
                                </span>
                            </div>
                        )}

                        {/* Right Side: Scope Toggle */}
                        {/* <button
                            onClick={() => setIsContextExpanded(!isContextExpanded)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all border shrink-0 ${
                                isContextExpanded || contextEntries.length > 0 
                                    ? "bg-cyan-950/40 text-cyan-400 border-cyan-800/40 hover:bg-cyan-900/40" 
                                    : "bg-slate-800/30 text-slate-400 border-white/5 hover:bg-slate-800/50"
                            }`}
                        >
                            <span>Scope</span>
                            <span className={`flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[9px] ${
                                contextEntries.length > 0 ? "bg-cyan-500/20 text-cyan-200" : "bg-white/10 text-slate-300"
                            }`}>
                                {contextEntries.length}
                            </span>
                            <svg className={`w-3.5 h-3.5 transition-transform duration-300 ml-0.5 ${isContextExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button> */}
                    </div>

                    {/* Animated Context Drawer */}
                    {/* <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out border-b border-white/5 ${
                        isContextExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 border-transparent'
                    }`}>
                        <div className="overflow-hidden bg-black/15 w-full shadow-inner">
                            <div className="p-5 max-h-[180px] overflow-y-auto custom-scrollbar space-y-4">
                                <div data-testid="chatbot-active-context" className="w-full">
                                    {contextEntries.length === 0 ? (
                                        <div className="flex items-center gap-2 text-slate-500 italic text-xs">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            No active analysis context.
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2 w-full">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Scope</span>
                                            <div className="flex flex-wrap gap-2 w-full">
                                                {contextEntries.map((entry) => (
                                                    <div key={entry.label} className="flex items-center gap-2 bg-slate-900/40 border border-slate-800/30 rounded-md px-2.5 py-1.5 max-w-full shadow-sm">
                                                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider shrink-0">{entry.label}</span>
                                                        <span className="text-[11px] text-slate-200 font-mono truncate min-w-0">{entry.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                {localStaleContext && (
                                    <div data-testid="chatbot-local-stale" className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 w-full leading-relaxed">
                                        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <span>Context may be stale. Refresh retrieval context before asking architecture/dependency questions.</span>
                                    </div>
                                )}
                                {refreshError && (
                                    <div data-testid="chatbot-refresh-error" className="flex items-start gap-2 text-[11px] text-rose-400 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 w-full break-words">
                                        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span>{refreshError}</span>
                                    </div>
                                )}
                                {refreshResult && (
                                    <div data-testid="chatbot-refresh-result" className="text-[11px] text-slate-400 bg-slate-800/50 p-3 rounded-lg border border-white/5 leading-relaxed w-full">
                                        Refresh {refreshResult.success ? "succeeded" : "completed with issues"}.
                                        {" "}Counts: {Object.entries(refreshResult.refreshedArtifactCountsByType || {})
                                            .map(([type, count]) => `${type}:${count}`)
                                            .join(", ") || "none"}.
                                        {refreshResult.unavailableProviders?.length > 0 && (
                                            <div className="mt-1.5 text-amber-500/80">Unavailable providers: {refreshResult.unavailableProviders.join("; ")}.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div> */}

                    {/* Chat Messages Area */}
                    <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-2 custom-scrollbar bg-slate-900/50 shadow-inner">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 shadow-[0_0_20px_rgba(34,211,238,0.05)] flex items-center justify-center text-cyan-500/70 mb-1">
                                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                </div>
                                
                                <div className="text-2xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-600 to-blue-400">
                                    Hi there!
                                </div>
                                
                                <div className="text-[13px] text-slate-400 leading-relaxed max-w-[240px]">
                                    Ask me any question about your system. <br/>
                                    <span className="text-slate-500">Responses are grounded in your latest analysis results.</span>
                                </div>
                            </div>
                        ) : (
                            messages.map((message, idx) => (
                                <ChatMessage key={`${message.role}-${idx}`} message={message} />
                            ))
                        )}

                        {error && (
                            <div data-testid="chatbot-error" className="flex items-center gap-2 text-xs text-rose-300 border border-rose-700/40 rounded-lg p-3 bg-rose-950/80 shrink-0 mt-2">
                                <svg className="w-4 h-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>{error}</span>
                            </div>
                        )}
                        
                        {loading && (
                            <div className="flex items-center py-2 shrink-0 pl-2 animate-in fade-in duration-200">
                                <div className="flex items-center gap-1.5 bg-slate-800/30 border border-white/5 rounded-full px-3 py-1 text-slate-400 text-[11px] font-medium shadow-sm">
                                    <span>Assistant is typing</span>
                                    
                                    {/* Bouncing Dots */}
                                    <div className="flex items-center gap-0.5 ml-0.5 mt-0.5">
                                        <span 
                                            className="w-1 h-1 rounded-full bg-cyan-400/80 animate-bounce" 
                                            style={{ animationDelay: '0ms', animationDuration: '1s' }} 
                                        />
                                        <span 
                                            className="w-1 h-1 rounded-full bg-cyan-400/80 animate-bounce" 
                                            style={{ animationDelay: '150ms', animationDuration: '1s' }} 
                                        />
                                        <span 
                                            className="w-1 h-1 rounded-full bg-cyan-400/80 animate-bounce" 
                                            style={{ animationDelay: '300ms', animationDuration: '1s' }} 
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Toolbar / Utilities Bar */}
                    <div className="px-5 py-2.5 flex justify-between items-center bg-slate-900/20 border-t border-white/5 shrink-0 w-full backdrop-blur-sm">
                        <div className="flex items-center gap-1">
                            <button
                                data-testid="chatbot-clear"
                                onClick={clearConversation}
                                className="group flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 px-2.5 py-1.5 rounded-lg transition-all duration-200"
                            >
                                <svg className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Clear
                            </button>
                            
                            {/* Manual refresh only when there was an error or the context is stale */}
                            {(refreshError || localStaleContext) && (
                                <button
                                    data-testid="chatbot-refresh-context"
                                    onClick={() => {
                                        setMinSpin(true);
                                        setTimeout(() => setMinSpin(false), 1000);
                                        refreshContext();
                                    }}
                                    disabled={refreshLoading || minSpin}
                                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-500/80 hover:text-amber-300 hover:bg-amber-500/10 px-2.5 py-1.5 rounded-lg disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-200"
                                >
                                    {(refreshLoading || minSpin) ? (
                                        <svg className="w-3.5 h-3.5 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : (
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4.64 9.36a9 9 0 0114.72 0M19.36 14.64a9 9 0 01-14.72 0" />
                                        </svg>
                                    )}
                                    
                                    {(refreshLoading || minSpin) ? "Retrying..." : "Retry Sync"}
                                </button>
                            )}
                        </div>
                        
                        <button
                            data-testid="chatbot-retry"
                            onClick={retryLastFailed}
                            disabled={!canRetry}
                            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-500/80 hover:text-cyan-300 hover:bg-cyan-500/10 px-2.5 py-1.5 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-200"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                            Retry Last
                        </button>
                    </div>

                    {/* Message Composer */}
                    <ChatComposer
                        value={input}
                        onChange={setInput}
                        onSubmit={onSubmit}
                        disabled={loading}
                    />
                </div>
            )}
        </>
    );
};

export default ChatbotPanel;