import React, { useState } from 'react'; 
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
    const [activeTemplate, setActiveTemplate] = useState(PIPELINE_TEMPLATES[0]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-[960px] max-w-[95vw] h-[480px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header Section */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg shadow-inner">
                            <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-md font-semibold text-white tracking-wide">Pipeline Library</h2>
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

                {/* Split Row Content */}
                <div className="flex flex-1 min-h-0 bg-slate-950/50">
                    
                    {/* LEFT COLUMN */}
                    <div className="w-1/2 p-4 overflow-y-auto border-r border-slate-800 space-y-2.5 custom-scrollbar h-full">
                        {PIPELINE_TEMPLATES.map(template => (
                            <button
                                key={template.id}
                                onClick={() => {
                                    onSelectTemplate(template.id);
                                    onClose(); 
                                }}
                                onMouseEnter={() => setActiveTemplate(template)}
                                className={`w-full text-left p-3 border rounded-xl transition-all duration-300 group relative overflow-hidden flex gap-3 items-center shadow-sm ${
                                    activeTemplate?.id === template.id 
                                        ? 'bg-slate-800 border-indigo-500/60 shadow-md' 
                                        : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/80 hover:border-slate-600'
                                }`}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/0 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                
                                {/* Icon */}
                                <div className="p-1 shrink-0 transition-transform duration-200 group-hover:scale-105 text-slate-400">
                                    {template.icon}
                                </div>
                                
                                {/* Text Content */}
                                <div className="flex-1 min-w-0">
                                    <h3 className={`text-[12px] font-bold mb-0.5 tracking-wide uppercase truncate transition-colors ${
                                        activeTemplate?.id === template.id ? 'text-indigo-300' : 'text-slate-200 group-hover:text-indigo-300'
                                    }`}>{template.name}</h3>
                                    <p className="text-[11px] text-slate-400 leading-tight group-hover:text-slate-300 transition-colors line-clamp-2">{template.description}</p>
                                </div>

                                {/* Action Arrow */}
                                <div className={`shrink-0 transition-all transform duration-300 pr-1 ${
                                    activeTemplate?.id === template.id ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-3 group-hover:opacity-100 group-hover:translate-x-0'
                                }`}>
                                    <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-full border border-indigo-500/30">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="w-1/2 p-4 bg-slate-900/40 flex flex-col justify-between h-full">
                        {activeTemplate ? (
                            <div className="flex flex-col h-full animate-in fade-in duration-300 justify-between">
                                {/* Preview Header */}
                                <div className="space-y-1 shrink-0">
                                    <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 inline-block">
                                        Pipeline Preview
                                    </span>
                                    <h4 className="text-[13px] font-bold text-slate-200 tracking-wide truncate">
                                        {activeTemplate.name}
                                    </h4>
                                </div>

                                <div className="flex-1 min-h-0 my-2 flex items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80 shadow-inner p-0.5">
                                    <img 
                                        // @ts-ignore
                                        src={`/library/${activeTemplate.gif || 'changeimpact.gif'}`} 
                                        alt={`${activeTemplate.name} Preview`} 
                                        className="max-w-full max-h-full object-contain block rounded-lg" 
                                        key={activeTemplate.id} 
                                    />
                                </div>

                                {/* Preview Description Footer */}
                                <div className="p-2.5 bg-slate-950/40 border border-slate-800 rounded-lg shrink-0">
                                    <p className="text-[11px] text-slate-400 leading-normal">
                                        Generates <span className="text-slate-300 font-medium">{activeTemplate.nodes?.length || 0} structural blueprint nodes</span> with pre-wired architecture mapping.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-500 text-[11px]">
                                Hover over a pipeline template to see a live preview.
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};