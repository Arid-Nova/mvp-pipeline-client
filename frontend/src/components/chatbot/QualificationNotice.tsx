import React from 'react';
import { ChatbotResponse } from "../../services/types";

export const QualificationNotice: React.FC<{ response: ChatbotResponse }> = ({ response }) => {
    const flags = response.flags || [];
    const notices: Array<{ tone: "rose" | "amber" | "slate"; text: string }> = [];

    if (flags.includes("model_unavailable")) notices.push({ tone: "rose", text: "Chatbot runtime is unavailable. Responses may be incomplete until runtime recovers." });
    if (flags.includes("insufficient_evidence")) notices.push({ tone: "rose", text: "Insufficient evidence for this claim in the active scope." });
    if (flags.includes("citation_validation_failed")) notices.push({ tone: "rose", text: "Citation validation failed. Some claims were downgraded or filtered." });
    if (flags.includes("partial")) notices.push({ tone: "amber", text: "Only partial evidence sources are available." });
    if (flags.includes("truncated_context")) notices.push({ tone: "amber", text: "Evidence context was truncated due to budget limits." });
    if (flags.includes("stale_context")) notices.push({ tone: "amber", text: "Active context may be stale relative to latest analysis artifacts." });

    if (notices.length === 0) return null;

    const renderIcon = (tone: string) => {
        if (tone === "rose") {
            return (
                <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        }
        if (tone === "amber") {
            return (
                <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            );
        }
        return (
            <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        );
    };

    return (
        <div className="flex flex-col gap-2 w-full" data-testid="qualification-notice">
            {/* Header */}
            <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400/80 uppercase tracking-widest">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Qualifications
            </div>
            
            {/* Notice Cards */}
            <div className="flex flex-col gap-1.5 w-full">
                {notices.map((notice, idx) => (
                    <div
                        key={`${notice.text}-${idx}`}
                        className={`flex items-start gap-2.5 text-[10.5px] rounded-xl px-3 py-2.5 border w-full leading-relaxed backdrop-blur-sm transition-all ${
                            notice.tone === "rose" 
                                ? "bg-rose-500/10 border-rose-500/20 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.1)]"
                            : notice.tone === "amber" 
                                ? "bg-amber-500/10 border-amber-500/20 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                            : "bg-slate-500/10 border-slate-500/20 text-slate-300"
                        }`}
                    >
                        {renderIcon(notice.tone)}
                        <span className="font-medium">{notice.text}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default QualificationNotice;