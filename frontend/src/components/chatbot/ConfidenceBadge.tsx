import React from 'react';
import { ChatbotConfidence } from "../../services/types";

export const ConfidenceBadge: React.FC<{ confidence?: ChatbotConfidence }> = ({ confidence }) => {
    const value = confidence || "LOW";

    const config: Record<string, { classes: string; icon: React.ReactNode; label?: string }> = {
        HIGH: {
            classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]",
            icon: (
                <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
            )
        },
        MEDIUM: {
            classes: "bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]",
            icon: (
                <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            )
        },
        INSUFFICIENT_EVIDENCE: {
            classes: "bg-rose-500/10 text-rose-400 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.15)]",
            icon: (
                <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            label: "INSUFFICIENT DATA" 
        },
        LOW: {
            classes: "bg-slate-500/10 text-slate-400 border-slate-500/30",
            icon: (
                <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18 12H6" />
                </svg>
            )
        }
    };

    const current = config[value] || config.LOW;

    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[9px] uppercase tracking-widest font-bold shrink-0 transition-all ${current.classes}`}>
            {current.icon}
            {current.label || value}
        </span>
    );
};

export default ConfidenceBadge;