import React, { useState } from 'react';
import { NodeData } from '../models';

interface Props {
    node: NodeData;
}

export const SecurityRegressionCard: React.FC<Props> = ({ node }) => {
    const [expandedTab, setExpandedTab] = useState<'INTRODUCED' | 'RESOLVED' | 'PERSISTENT' | null>(null);

    const payload = node.data.regressionPayload;

    if (node.status === 'idle' || node.status === 'running') {
        return (
            <div className="flex flex-col items-center justify-center p-5 h-full text-slate-500">
                {node.status === 'running' ? (
                    <div className="relative flex items-center justify-center w-8 h-8 mb-3">
                        <div className="absolute inset-0 border-t-2 border-rose-500 rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <svg className="w-6 h-6 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                )}
                <span className="text-[10px] font-bold text-center uppercase tracking-widest text-slate-400">
                    {node.status === 'running' ? 'Diffing Verification Trees...' : 'Link 2 Verification Runs'}
                </span>
            </div>
        );
    }

    if (!payload) return null;

    const renderList = (items: any[], colorContext: string) => {
        if (items.length === 0) return <div className="text-[10px] text-slate-500 italic p-2">None found.</div>;
        return (
            <ul className="space-y-1.5 mt-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {items.map((s: any, idx: number) => (
                    <li key={idx} className={`p-1.5 bg-slate-950/50 border rounded text-[9px] ${colorContext}`}>
                        <div className="font-mono font-bold break-all mb-0.5">{s.id}</div>
                        <div className="opacity-70 leading-tight">{s.description}</div>
                    </li>
                ))}
            </ul>
        );
    };

    return (
        <div className="p-2 space-y-3 relative">
            {/* Stats Overview */}
            <div className="grid grid-cols-3 gap-2">
                {/* Resolved (Fixed) */}
                <button 
                    onClick={() => setExpandedTab(expandedTab === 'RESOLVED' ? null : 'RESOLVED')}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${expandedTab === 'RESOLVED' ? 'bg-emerald-900/30 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-slate-900/80 border-slate-700/50 hover:border-emerald-500/50'}`}
                >
                    <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Fixed</div>
                    <div className="text-sm font-black text-emerald-400">{payload.resolved.length}</div>
                </button>

                {/* Persistent (Tech Debt) */}
                <button 
                    onClick={() => setExpandedTab(expandedTab === 'PERSISTENT' ? null : 'PERSISTENT')}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${expandedTab === 'PERSISTENT' ? 'bg-amber-900/30 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]' : 'bg-slate-900/80 border-slate-700/50 hover:border-amber-500/50'}`}
                >
                    <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Unchanged</div>
                    <div className="text-sm font-black text-amber-400">{payload.persistent.length}</div>
                </button>

                {/* Introduced (Regression) */}
                <button 
                    onClick={() => setExpandedTab(expandedTab === 'INTRODUCED' ? null : 'INTRODUCED')}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${expandedTab === 'INTRODUCED' ? 'bg-rose-900/30 border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.2)]' : 'bg-slate-900/80 border-slate-700/50 hover:border-rose-500/50'}`}
                >
                    <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">New Vulns</div>
                    <div className="text-sm font-black text-rose-400">{payload.introduced.length}</div>
                </button>
            </div>

            {/* Drilldown Views */}
            {expandedTab === 'RESOLVED' && (
                <div className="bg-emerald-900/10 border border-emerald-500/20 rounded p-2">
                    <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest border-b border-emerald-500/20 pb-1">Vulnerabilities Resolved</div>
                    {renderList(payload.resolved, "border-emerald-500/20 text-emerald-200")}
                </div>
            )}
            
            {expandedTab === 'PERSISTENT' && (
                <div className="bg-amber-900/10 border border-amber-500/20 rounded p-2">
                    <div className="text-[9px] font-bold text-amber-400 uppercase tracking-widest border-b border-amber-500/20 pb-1">Technical Debt (Unchanged)</div>
                    {renderList(payload.persistent, "border-amber-500/20 text-amber-200")}
                </div>
            )}

            {expandedTab === 'INTRODUCED' && (
                <div className="bg-rose-900/10 border border-rose-500/20 rounded p-2">
                    <div className="text-[9px] font-bold text-rose-400 uppercase tracking-widest border-b border-rose-500/20 pb-1">Regressions Detected</div>
                    {renderList(payload.introduced, "border-rose-500/20 text-rose-200")}
                </div>
            )}
        </div>
    );
};