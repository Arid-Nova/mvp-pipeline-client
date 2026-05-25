import React from 'react';
import { useNavigate } from 'react-router-dom'; 
import { CATEGORIES, CARD_CONFIG } from '../pipelineConfig'; 
import { CardType } from '../models';

interface ToolboxSidebarProps {
    expandedCategories: Record<string, boolean>;
    toggleCategory: (category: string) => void;
    addNode: (type: CardType) => void;
    clearPipeline: () => void;
}

export const ToolboxSidebar: React.FC<ToolboxSidebarProps> = ({
    expandedCategories,
    toggleCategory,
    addNode,
    clearPipeline
}) => {
    const navigate = useNavigate();

    return (
        <div className="tour-toolbox-sidebar w-72 h-full border-r border-white/10 bg-slate-900/50 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-900/80">
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Toolbox</h2>
                <div className="tour-clear-pipeline relative group flex items-center">
                    <button 
                        onClick={clearPipeline} 
                        className="text-[10px] text-rose-400 hover:text-rose-300 transition-colors uppercase font-bold"
                    >
                        Clear
                    </button>
                    <div className="absolute top-full right-0 mt-2 w-max pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 bg-slate-800 text-slate-300 text-[11px] font-medium py-1.5 px-2.5 rounded-md shadow-xl border border-slate-700/50 tracking-normal normal-case">
                        Clear the constructed pipeline
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                {Object.entries(CATEGORIES).map(([category, types]) => (
                    <div key={category} className="space-y-3">
                        {/* Category Header (Clickable) */}
                        <button 
                            onClick={() => toggleCategory(category)}
                            className="w-full flex items-center justify-between group"
                        >
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-tighter group-hover:text-slate-300 transition-colors">
                                {category}
                            </h3>
                            <div className={`transition-transform duration-200 ${expandedCategories[category] ? 'rotate-180' : ''}`}>
                                <svg className="w-3 h-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </button>

                        {/* Collapsible Content */}
                        {expandedCategories[category] && (
                            <div className="grid gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                {types.map(type => {
                                    const config = CARD_CONFIG[type];
                                    return (
                                        <button
                                            key={type}
                                            onClick={() => addNode(type)}
                                            className="w-full p-3 rounded-xl bg-slate-800/40 border border-white/5 hover:border-blue-500/50 hover:bg-slate-800 transition-all text-left group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="text-slate-400 group-hover:text-blue-400 transition-colors">
                                                    {React.cloneElement(config.icon, { className: 'w-5 h-5' })}
                                                </div>
                                                <div>
                                                    <div className="text-xs font-bold text-slate-200">{config.title}</div>
                                                    <div className="text-[9px] text-slate-500 leading-tight mt-0.5">{config.description}</div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="tour-explore-preview p-4 border-t border-white/10 bg-slate-900/80 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.3)] z-10">
                <button 
                    onClick={() => navigate('/explore')}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20 hover:border-blue-400/50 hover:bg-blue-500/20 transition-all flex items-center justify-center gap-2 group"
                >
                    <svg className="w-4 h-4 text-blue-400 group-hover:text-cyan-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span className="text-xs font-bold text-blue-400 group-hover:text-cyan-300 transition-colors uppercase tracking-widest">
                        Preview Features
                    </span>
                </button>
            </div>
        </div>
    );
};
