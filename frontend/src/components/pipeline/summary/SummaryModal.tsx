import React, { useState, useEffect } from 'react';

const AnimatedPipelineIcon: React.FC = () => {
    const [step, setStep] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setStep((prev) => (prev + 1) % 6);
        }, 500); 
        
        return () => clearInterval(interval);
    }, []);

    const activeNode = "bg-teal-400 text-slate-900 border-teal-300 shadow-[0_0_10px_rgba(45,212,191,0.8)] scale-110";
    const inactiveNode = "bg-slate-800/80 text-teal-600 border-teal-900/50 shadow-inner scale-100";

    return (
        <div className="flex items-center gap-1.5 p-1.5 bg-slate-900/50 shadow-inner shrink-0">
            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all duration-300 ${
                step >= 0 && step !== 5 ? activeNode : inactiveNode
            }`}>
                1
            </div>
            
            <div className="relative w-3 h-1 bg-slate-800 rounded-full overflow-hidden shadow-inner">
                <div className={`absolute inset-0 bg-teal-400 transition-transform duration-300 ease-out ${
                    step >= 1 && step !== 5 ? 'translate-x-0' : '-translate-x-full'
                }`} />
            </div>

            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all duration-300 ${
                step >= 2 && step !== 5 ? activeNode : inactiveNode
            }`}>
                2
            </div>

            <div className="relative w-3 h-1 bg-slate-800 rounded-full overflow-hidden shadow-inner">
                <div className={`absolute inset-0 bg-teal-400 transition-transform duration-300 ease-out ${
                    step >= 3 && step !== 5 ? 'translate-x-0' : '-translate-x-full'
                }`} />
            </div>

            <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all duration-300 ${
                step >= 4 && step !== 5 ? activeNode : inactiveNode
            }`}>
                3
            </div>

        </div>
    );
};

export interface SummaryStep {
    title: string;
    description: string;
    branchNames?: string[];
}

interface SummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    isSummarizing: boolean;
    summarySteps: SummaryStep[];
}

export const SummaryModal: React.FC<SummaryModalProps> = ({ 
    isOpen, 
    onClose, 
    isSummarizing, 
    summarySteps 
}) => {

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.8)] w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden text-slate-200">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800/80 flex justify-between items-center bg-slate-900/50">
                    <div className="flex items-center gap-4">
                        <AnimatedPipelineIcon />
                        <div>
                            <h3 className="text-base font-bold text-slate-100">Step-by-Step Analysis</h3>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 p-1.5 rounded-lg transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 bg-slate-900/30 space-y-6">
                    {isSummarizing ? (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-400 space-y-4">
                            <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-xs text-teal-400/90 font-medium animate-pulse">
                                Synthesizing non-linear execution paths...
                            </p>
                        </div>
                    ) : summarySteps.length === 0 ? (
                        <p className="text-center text-xs text-slate-500 py-8">No summary data available for this execution run.</p>
                    ) : (
                        summarySteps.map((step, index) => (
                            <div key={index} className="flex gap-4 border-l-2 border-teal-500/40 pl-4 relative ml-2">
                                {/* Timeline Dot */}
                                <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-900 border-2 border-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.6)]"></div>
                                
                                <div className="w-full">
                                    {/* Branch Tag */}
                                    <div className="text-[10px] font-bold text-teal-400 tracking-wider uppercase mb-1">
                                        {step.branchNames && step.branchNames.length > 0 
                                            ? `Path: ${step.branchNames.join(' ⭢ ')}` 
                                            : `Step ${index + 1}`}
                                    </div>
                                    
                                    <h4 className="font-semibold text-slate-200 text-sm">{step.title}</h4>
                                    
                                    {/* Content Card */}
                                    <div className="text-xs text-slate-300 mt-2 leading-relaxed bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80">
                                        {step.description}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-slate-800/80 bg-slate-900/80 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded transition-colors"
                    >
                        Close
                    </button>
                </div>

            </div>
        </div>
    );
};