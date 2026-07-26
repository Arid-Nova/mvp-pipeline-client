import React from 'react';
import { ChatbotHealthResponse } from "../../services/types";

export const RuntimeStatus: React.FC<{
    health: ChatbotHealthResponse | null;
    loading: boolean;
    error: string | null;
}> = ({ health, loading, error }) => {
    const containerClasses = "inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full border bg-slate-900/50 shadow-inner w-fit transition-all";

    if (loading) {
        return (
            <div className={`${containerClasses} border-white/5`}>
                <svg className="w-2.5 h-2.5 text-cyan-500 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.212 8H18" />
                </svg>
                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-px">Connecting</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`${containerClasses} border-rose-500/20 bg-rose-500/10`}>
                <span className="relative flex h-1 w-1">
                  <span className="relative inline-flex rounded-full h-1 w-1 bg-rose-500"></span>
                </span>
                <span className="text-[8px] text-rose-400 font-bold uppercase tracking-widest mt-px truncate max-w-[120px]" title={error}>
                    Offline
                </span>
            </div>
        );
    }

    if (!health) {
        return (
            <div className={`${containerClasses} border-slate-700/50`}>
                <span className="w-1 h-1 rounded-full bg-slate-600 shrink-0" />
                <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-px">Unknown</span>
            </div>
        );
    }

    const isHealthy = health.status === "healthy";
    const isDegraded = health.status === "degraded";

    const dotColor = isHealthy ? "bg-emerald-400" : isDegraded ? "bg-amber-400" : "bg-rose-400";
    const glowColor = isHealthy ? "bg-emerald-400/40" : isDegraded ? "bg-amber-400/40" : "bg-rose-400/40";
    const textColor = isHealthy ? "text-emerald-400" : isDegraded ? "text-amber-400" : "text-rose-400";
    const statusText = isHealthy ? "Online" : isDegraded ? "Degraded" : "Offline";

    return (
        <div className={`${containerClasses} border-white/5 hover:bg-slate-900/80 hover:border-white/10 group cursor-default`}>
            {/* Live Connection Indicator */}
            <div className="flex items-center gap-1" title={`Status: ${health.status}`}>
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                    {isHealthy && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${glowColor}`}></span>}
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColor}`}></span>
                </span>
                <span className={`text-[8px] font-bold uppercase tracking-widest mt-px ${textColor}`}>
                    {statusText}
                </span>
            </div>

            {/* Vertical Divider */}
            <div className="w-[1px] h-2.5 bg-white/10 group-hover:bg-white/20 transition-colors" />

            {/* AI Model & Provider Info */}
            <div className="flex items-center gap-1 text-[8.5px] font-medium truncate">
                <svg className="w-2 h-2 text-cyan-400/70 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
                </svg>
                <span className="truncate flex items-center">
                    <span className="text-slate-400">{health.provider}</span>
                    <span className="text-slate-600 font-normal mx-0.5">/</span>
                    <span className="text-slate-300 font-mono text-[8px] mt-px">{health.model}</span>
                </span>
            </div>
        </div>
    );
};

export default RuntimeStatus;