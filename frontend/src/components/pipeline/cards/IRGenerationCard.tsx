import React from 'react';
import { NodeData } from '../models';

interface Props {
    node: NodeData;
}

export const IRGenerationCard: React.FC<Props> = ({ node }) => {
    // 1. IDLE STATE: Waiting for upstream connection/run
    if (node.status === 'idle') {
        return (
            <div className="mt-2 text-center p-3 border border-dashed border-slate-700 bg-slate-800/50 rounded-lg">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Link to a System Source</span>
            </div>
        );
    }

    // 2. RUNNING STATE: Fetching from endpoint
    if (node.status === 'running') {
        return (
            <div className="mt-2 flex flex-col items-center justify-center p-4 border border-blue-500/20 bg-blue-900/10 rounded-lg">
                <div className="relative flex items-center justify-center w-6 h-6 mb-2">
                    <div className="absolute inset-0 border-t-2 border-blue-500 rounded-full animate-spin"></div>
                </div>
                <span className="text-[9px] font-bold text-center uppercase tracking-widest text-blue-400">
                    Generating Base IR...
                </span>
            </div>
        );
    }

    // 3. COMPLETED STATE: Display Stats
    const payload = node.data.payload;
    if (!payload) return null;

    const repoCount = payload.metadata?.length || 0;
    
    // Safely extract the microservices count from the IR JSON based on the new schema.
    const ir = payload.irJson || {};
    let microservicesCount = 0;
    
    if (Array.isArray(ir.microservices)) {
        microservicesCount = ir.microservices.length;
    } else if (ir.components) {
        microservicesCount = Object.keys(ir.components).length;
    } else if (ir.services) {
        microservicesCount = Object.keys(ir.services).length;
    }

    return (
        <div className="mt-2 p-2.5 bg-slate-900/60 rounded-xl border border-blue-500/30 space-y-3 relative">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-700/50 pb-1.5">
                <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    IR Generated
                </h4>
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[8px] text-emerald-400 font-bold tracking-wider uppercase">
                    Success
                </span>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/50 flex flex-col justify-center">
                    <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Microservices</div>
                    <div className="text-[11px] font-black text-blue-300 truncate">
                        {microservicesCount > 0 ? microservicesCount : 'N/A'}
                    </div>
                </div>
                <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/50 flex flex-col justify-center">
                    <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Repos Parsed</div>
                    <div className="text-[11px] font-black text-blue-300">{repoCount}</div>
                </div>
            </div>
        </div>
    );
};