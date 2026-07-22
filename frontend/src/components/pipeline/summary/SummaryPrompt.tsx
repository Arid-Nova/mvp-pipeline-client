import React from 'react';

interface SummaryPromptProps {
    isOpen: boolean;
    onDismiss: () => void;
    onAccept: () => void;
}

export const SummaryPrompt: React.FC<SummaryPromptProps> = ({ 
    isOpen, 
    onDismiss, 
    onAccept 
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed bottom-36 right-6 z-[100] animate-fade-in-down">
            <div className="bg-slate-900 border border-teal-500/50 shadow-[0_0_15px_rgba(20,184,166,0.2)] rounded-lg p-4 flex flex-col gap-3 max-w-sm">
                
                {/* Header & Icon */}
                <div className="flex items-start gap-3">
                    <div className="bg-teal-900/50 p-2 rounded-full text-teal-400 shrink-0">
                        {/* Analytics/Sparkles SVG Icon */}
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-200">Execution Complete</h4>
                        <p className="text-xs text-slate-400 mt-1">
                            Would you like to run a <strong className="text-teal-400">step-by-step</strong> analysis to summarize results across all pipeline branches?
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end items-center mt-1 text-xs font-medium">
                    <div className="flex gap-2">
                        <button 
                            onClick={onDismiss}
                            onTouchEnd={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onDismiss();
                            }}
                            className="px-3 py-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                        >
                            Dismiss
                        </button>
                        <button 
                            onClick={onAccept}
                            onTouchEnd={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onAccept();
                            }}
                            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded transition-colors shadow-lg shadow-teal-900/50"
                        >
                            Summarize Results
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};