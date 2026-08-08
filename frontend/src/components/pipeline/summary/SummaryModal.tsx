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
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (isOpen && !isSummarizing) {
            setCurrentIndex(0);
        }
    }, [isOpen, isSummarizing]);

    if (!isOpen) return null;

    const handleNext = () => {
        if (currentIndex < summarySteps.length - 1) {
            setCurrentIndex((prev) => prev + 1);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex((prev) => prev - 1);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.8)] w-full max-w-3xl flex flex-col overflow-hidden text-slate-200">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800/80 flex justify-between items-center bg-slate-900/50 shrink-0">
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

                {/* Body Container */}
                <div className="flex flex-col flex-1 min-h-[300px] bg-slate-900/30">
                    {isSummarizing ? (
                        <div className="flex flex-col items-center justify-center flex-1 py-20 text-slate-400 space-y-4">
                            <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-xs text-teal-400/90 font-medium animate-pulse">
                                Synthesizing architectural insights...
                            </p>
                        </div>
                    ) : summarySteps.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center py-20">
                            <p className="text-center text-xs text-slate-500">No summary data available for this execution run.</p>
                        </div>
                    ) : (
                        <>
                            {/* Sliding Carousel Area */}
                            <div className="relative overflow-hidden w-full flex-1 flex items-center p-6">
                                <div 
                                    className="flex w-full transition-transform duration-500 ease-in-out"
                                    style={{ transform: `translateX(-${currentIndex * 100}%)` }}
                                >
                                    {summarySteps.map((step, index) => (
                                        <div key={index} className="w-full shrink-0 px-2 flex justify-center">
                                            <div className="w-full max-w-2xl bg-slate-800/20 border border-slate-700/50 rounded-xl p-6 relative">
                                                
                                                {/* Step Indicator Badge */}
                                                <div className="absolute -top-3 -left-3 bg-teal-500/20 border border-teal-500/50 text-teal-400 text-[10px] font-bold px-3 py-1 rounded-full shadow-lg backdrop-blur-md">
                                                    STEP {index + 1}
                                                </div>

                                                <div className="text-[10px] font-bold text-teal-400/80 tracking-wider uppercase mb-2 ml-1">
                                                    {step.branchNames && step.branchNames.length > 0 
                                                        ? `Path: ${step.branchNames.join(' ⭢ ')}` 
                                                        : 'Execution Path'}
                                                </div>
                                                
                                                <h4 className="font-semibold text-slate-100 text-lg mb-4">{step.title}</h4>
                                                
                                                <div className="text-sm text-slate-300 leading-relaxed bg-slate-950/40 p-4 rounded-lg border border-slate-800/80 shadow-inner">
                                                    {step.description}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Static Chatbot Callout (Always visible beneath the current slide) */}
                            <div className="px-8 pb-6 shrink-0">
                                <div className="flex gap-4 border-l-2 border-dashed border-slate-700 pl-4 relative ml-2">
                                    <div className="absolute -left-[9px] top-3 w-4 h-4 rounded-full bg-slate-900 border-2 border-slate-600"></div>
                                    <div className="w-full">
                                        <h4 className="font-semibold text-slate-400 text-sm flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                            </svg>
                                            Have more specific questions?
                                        </h4>
                                        <div className="text-xs text-slate-400 mt-2 leading-relaxed bg-slate-900/50 p-3 rounded-lg border border-slate-800/50 border-dashed">
                                            For deep dives into specific payloads or code contexts, open the <strong className="text-teal-500">chatbot</strong> panel and ask directly!
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="px-6 py-4 border-t border-slate-800/80 bg-slate-900 flex justify-between items-center shrink-0">
                    
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handlePrev}
                            disabled={isSummarizing || currentIndex === 0 || summarySteps.length === 0}
                            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 text-xs font-medium rounded transition-colors flex items-center gap-1"
                        >
                            <span>&larr;</span> Prev
                        </button>
                        
                        {!isSummarizing && summarySteps.length > 0 && (
                            <span className="text-xs text-slate-500 font-medium font-mono">
                                {currentIndex + 1} / {summarySteps.length}
                            </span>
                        )}

                        <button 
                            onClick={handleNext}
                            disabled={isSummarizing || currentIndex === summarySteps.length - 1 || summarySteps.length === 0}
                            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-200 text-xs font-medium rounded transition-colors flex items-center gap-1"
                        >
                            Next <span>&rarr;</span>
                        </button>
                    </div>

                    <button 
                        onClick={onClose}
                        className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium rounded transition-colors shadow-lg shadow-teal-900/20"
                    >
                        Close
                    </button>
                </div>

            </div>
        </div>
    );
};