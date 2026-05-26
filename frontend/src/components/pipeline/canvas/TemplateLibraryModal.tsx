import React from 'react'; 
import { PIPELINE_TEMPLATES } from '../configs/PipelineTemplates';

interface TemplateLibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectTemplate: (templateId: string) => void;
}

export const TemplateLibraryModal: React.FC<TemplateLibraryModalProps> = ({ 
    isOpen, 
    onClose, 
    onSelectTemplate 
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-[600px] max-w-[90vw] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg shadow-inner">
                            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg text-white tracking-wide">Pipeline Library</h2>
                            <p className="text-[11px] text-slate-400 font-medium">Select a pre-configured pipeline to jumpstart your analysis.</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="text-slate-500 hover:text-white hover:bg-slate-800 p-2 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* List of Templates */}
                <div className="p-5 bg-slate-950/50 overflow-y-auto max-h-[60vh]">
                    <div className="space-y-3">
                        {PIPELINE_TEMPLATES.map(template => (
                            <button
                                key={template.id}
                                onClick={() => {
                                    onSelectTemplate(template.id);
                                    onClose(); 
                                }}
                                className="w-full text-left p-4 bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800 hover:border-indigo-500/50 rounded-xl transition-all duration-300 group relative overflow-hidden flex gap-4 items-center shadow-sm hover:shadow-lg"
                            >
                                {/* Hover highlight background */}
                                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/0 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                
                                {/* Icon */}
                                <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl group-hover:border-indigo-500/30 group-hover:shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all shrink-0">
                                    {template.icon}
                                </div>
                                
                                {/* Text Content */}
                                <div className="flex-1">
                                    <h3 className="text-[13px] font-bold text-slate-200 group-hover:text-indigo-300 mb-1 tracking-wide uppercase transition-colors">{template.name}</h3>
                                    <p className="text-[11px] text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors">{template.description}</p>
                                </div>

                                {/* Action Arrow */}
                                <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0 duration-300 pr-2">
                                    <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-full border border-indigo-500/30">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};