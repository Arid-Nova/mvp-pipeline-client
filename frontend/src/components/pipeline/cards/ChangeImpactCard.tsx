import React from 'react';
import { saveAs } from 'file-saver';
import { NodeData } from '../models';

interface Props {
    node: NodeData;
}

export const ChangeImpactCard: React.FC<Props> = ({ node }) => {
    const payload = node.data.changeImpactPayload;
    const targetedServices = node.data.targetedServices || [];

    if (node.status === 'idle' || node.status === 'running') {
        return (
            <div className="flex flex-col items-center justify-center p-5 h-full text-slate-500">
                {node.status === 'running' ? (
                    <div className="relative flex items-center justify-center w-8 h-8 mb-3">
                        <div className="absolute inset-0 border-t-2 border-orange-500 rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <svg className="w-6 h-6 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                    </svg>
                )}
                <span className="text-[10px] font-bold text-center uppercase tracking-widest text-slate-400">
                    {node.status === 'running' ? 'Calculating Delta...' : 'Link Base IR & Target Input'}
                </span>
            </div>
        );
    }

    if (!payload) return null;

    const changes = payload.changes || [];
    const added = changes.filter((c: any) => c.changeType === 'ADD').length;
    const deleted = changes.filter((c: any) => c.changeType === 'DELETE').length;
    const modified = changes.filter((c: any) => c.changeType === 'MODIFY').length;

    const downloadDelta = () => {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        saveAs(blob, "change_impact_delta.json");
    };

    return (
        <div className="p-3 pt-2 flex flex-col gap-3 relative">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
                <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                    Blast Radius
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400 font-bold tracking-wider uppercase">
                    Calculated
                </span>
            </div>

            {/* Change Metrics */}
            <div className="flex gap-2">
                <div className="flex-1 bg-slate-900/80 p-2 rounded-lg border border-slate-700/50 text-center">
                    <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Added</div>
                    <div className="text-sm font-black text-emerald-400">+{added}</div>
                </div>
                <div className="flex-1 bg-slate-900/80 p-2 rounded-lg border border-slate-700/50 text-center">
                    <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Modified</div>
                    <div className="text-sm font-black text-amber-400">~{modified}</div>
                </div>
                <div className="flex-1 bg-slate-900/80 p-2 rounded-lg border border-slate-700/50 text-center">
                    <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Deleted</div>
                    <div className="text-sm font-black text-rose-400">-{deleted}</div>
                </div>
            </div>

            {/* Targeted Services Snippet */}
            <div className="bg-orange-900/10 border border-orange-500/20 p-2 rounded-lg flex flex-col gap-1.5">
                <div className="text-[9px] text-orange-400 uppercase tracking-wider font-bold">
                    Affected Services ({targetedServices.length})
                </div>
                <div className="flex flex-wrap gap-1">
                    {targetedServices.slice(0, 4).map((svc: string) => (
                        <span key={svc} className="text-[8px] px-1 py-0.5 bg-orange-950/50 border border-orange-500/30 rounded text-orange-200">
                            {svc}
                        </span>
                    ))}
                    {targetedServices.length > 4 && (
                        <span className="text-[8px] px-1 py-0.5 bg-slate-800 rounded text-slate-400">
                            +{targetedServices.length - 4} more
                        </span>
                    )}
                </div>
            </div>

            {/* Action */}
            <button 
                onClick={downloadDelta}
                className="w-full py-1.5 text-[10px] bg-orange-600 hover:bg-orange-500 text-white rounded font-bold shadow transition-colors"
            >
                Download JSON Delta
            </button>
        </div>
    );
};