import React from 'react';
import { ChatbotHealthResponse } from "../../services/types";

export const RuntimeStatus: React.FC<{
    health: ChatbotHealthResponse | null;
    loading: boolean;
    error: string | null;
}> = ({ health, loading, error }) => {
    const baseClasses = "flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800/50 border border-white/5";

    if (loading) {
        return (
            <div className={baseClasses}>
                <svg className="w-2.5 h-2.5 text-cyan-500 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.212 8H18" />
                </svg>
                <span className="text-[9px] font-medium text-slate-400">Connecting</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20" title={error}>
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="text-[9px] font-medium text-rose-400">Offline</span>
            </div>
        );
    }

    if (!health) return null;

    const isHealthy = health.status === "healthy";
    const isDegraded = health.status === "degraded";

    const dotColor = isHealthy ? "bg-emerald-400" : isDegraded ? "bg-amber-400" : "bg-rose-400";
    const textColor = isHealthy ? "text-emerald-400" : isDegraded ? "text-amber-400" : "text-rose-400";
    const statusText = isHealthy ? "Online" : isDegraded ? "Degraded" : "Offline";

    return (
        <div className={baseClasses} title={`Status: ${health.status}`}>
            <span className="relative flex h-1.5 w-1.5 shrink-0">
                {(isHealthy || isDegraded) && (
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${dotColor}`}></span>
                )}
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColor}`}></span>
            </span>
            <span className={`text-[9px] font-medium ${textColor}`}>
                {statusText}
            </span>
        </div>
    );
};

export default RuntimeStatus;