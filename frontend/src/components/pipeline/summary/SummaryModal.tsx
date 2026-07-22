import React from 'react';

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

export const SummaryModal: React.FC<SummaryModalProps> = ({ isOpen, onClose, isSummarizing, summarySteps }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden text-gray-900">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="text-lg font-bold text-slate-800">Execution Analysis</h3>
                    <button 
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors font-bold"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 bg-white">
                    {isSummarizing ? (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-500 space-y-4">
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="animate-pulse">Analyzing execution paths and aggregating results...</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {summarySteps.length === 0 ? (
                                <p className="text-center text-gray-500">No summary data available.</p>
                            ) : (
                                summarySteps.map((step, index) => (
                                    <div key={index} className="flex gap-4 border-l-2 border-blue-200 pl-4 relative ml-2">
                                        <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-blue-500 shadow-sm border-2 border-white"></div>
                                        <div>
                                            <div className="text-xs font-bold text-blue-600 mb-1 tracking-wide uppercase">
                                                {step.branchNames && step.branchNames.length > 0 
                                                    ? `Path: ${step.branchNames.join(' ⭢ ')}` 
                                                    : `Step ${index + 1}`}
                                            </div>
                                            <h4 className="font-semibold text-gray-800 text-md">{step.title}</h4>
                                            <p className="text-sm text-gray-600 mt-2 leading-relaxed bg-gray-50 p-3 rounded-md border border-gray-100">
                                                {step.description}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};