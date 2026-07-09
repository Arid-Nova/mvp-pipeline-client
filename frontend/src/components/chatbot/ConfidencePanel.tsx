import React from 'react';
import { ChatbotResponse } from "../../services/types";
import ConfidenceBadge from "./ConfidenceBadge";

const ConfidencePanel: React.FC<{ response: ChatbotResponse }> = ({ response }) => {
    const hasReasons = response.confidenceReasons && response.confidenceReasons.length > 0;
    const hasRationale = !!response.confidenceRationale;

    if (!hasRationale && !hasReasons) {
        return (
            <div className="flex items-center gap-2.5" data-testid="confidence-panel">
                <span className="text-[9px] font-bold text-slate-400/80 uppercase tracking-widest">Confidence</span>
                <ConfidenceBadge confidence={response.confidence} />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 w-full" data-testid="confidence-panel">
            <div className="flex items-center gap-2.5">
                <span className="text-[9px] font-bold text-slate-400/80 uppercase tracking-widest">Confidence Analysis</span>
                <ConfidenceBadge confidence={response.confidence} />
            </div>
            
            {/* Analysis Block */}
            <div className="flex flex-col gap-2.5 bg-slate-900/40 p-3.5 rounded-xl border border-white/5 shadow-inner w-full">
                {hasRationale && (
                    <div className="text-[11.5px] text-slate-200 leading-relaxed font-medium">
                        {response.confidenceRationale}
                    </div>
                )}
                
                {hasReasons && (
                    <div className={`flex items-start gap-2 text-[10.5px] text-slate-400 ${hasRationale ? "pt-2.5 border-t border-white/5" : ""}`}>
                        <svg className="w-3.5 h-3.5 shrink-0 text-slate-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span className="leading-relaxed">
                            <span className="font-semibold text-slate-300">Key Factors:</span> {response.confidenceReasons!.join(", ")}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConfidencePanel;