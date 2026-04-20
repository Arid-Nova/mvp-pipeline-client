import React from 'react';
import { NodeData } from '../models';

interface Props {
    node: NodeData;
}

export const VerificationComparisonCard: React.FC<Props> = ({ node }) => {
    const stats = node.data.comparisonResult;

    if (node.status === 'idle' || node.status === 'running') {
        return (
            <div className="flex flex-col items-center justify-center p-5 h-full text-slate-500">
                {node.status === 'running' ? (
                    <div className="relative flex items-center justify-center w-10 h-10 mb-3">
                        <div className="absolute inset-0 border-t-2 border-sky-500 rounded-full animate-spin"></div>
                        <div className="absolute inset-2 border-r-2 border-indigo-500 rounded-full animate-spin-reverse"></div>
                    </div>
                ) : (
                    <svg className="w-8 h-8 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                )}
                <span className="text-[10px] font-bold text-center uppercase tracking-widest text-slate-400">
                    {node.status === 'running' ? 'Computing Variance...' : 'Awaiting Graph Data'}
                </span>
            </div>
        );
    }

    if (!stats) return null;

    // SVG Donut Chart Math
    const radius = 34; 
    const circumference = 2 * Math.PI * radius;
    const safeRate = Math.min(Math.max(stats.inconsistencyRate, 0), 100);
    const strokeDashoffset = circumference - (safeRate / 100) * circumference;

    return (
        <>
            {node.status === 'completed' && (
                <style>{`
                    [data-id="${node.id}"] pre,
                    [data-id="${node.id}"] .bg-black,
                    [data-id="${node.id}"] [class*="log"],
                    [data-node-id="${node.id}"] pre,
                    [data-node-id="${node.id}"] .bg-black,
                    [data-node-id="${node.id}"] [class*="log"] {
                        display: none !important;
                    }
                `}</style>
            )}

            {/* Replaced space-y-5 with gap-3 to keep spacing tight and exact */}
            <div className="p-3 pt-2 flex flex-col gap-3 relative">
                
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-700/50 pb-2">
                    <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                        Variance Analysis
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400 font-bold tracking-wider uppercase">
                        Complete
                    </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                    {/* Left: Stat Blocks */}
                    <div className="flex-1 flex flex-col gap-2">
                        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-700/50 flex justify-between items-center group hover:border-purple-500/50 transition-colors">
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold group-hover:text-purple-400 transition-colors">Formal Flags</div>
                            <div className="text-lg font-black text-slate-200">{stats.totalSuggestions}</div>
                        </div>
                        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-700/50 flex justify-between items-center group hover:border-indigo-500/50 transition-colors">
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold group-hover:text-indigo-400 transition-colors">Inconsistencies</div>
                            <div className="text-lg font-black text-slate-200">{stats.totalScenarios}</div>
                        </div>
                    </div>

                    {/* Right: SVG Radial Progress Chart */}
                    <div className="relative flex flex-col items-center justify-center shrink-0">
                        <svg className="w-[88px] h-[88px] transform -rotate-90">
                            {/* Background Track */}
                            <circle
                                cx="44" cy="44" r={radius}
                                stroke="currentColor" strokeWidth="7" fill="transparent"
                                className="text-slate-800"
                            />
                            {/* Colored Progress Ring */}
                            <circle
                                cx="44" cy="44" r={radius}
                                stroke="url(#gradient)" strokeWidth="7" fill="transparent"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                className="transition-all duration-1000 ease-out"
                            />
                            {/* Gradient Definition */}
                            <defs>
                                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#a855f7" /> {/* purple-500 */}
                                    <stop offset="100%" stopColor="#0ea5e9" /> {/* sky-500 */}
                                </linearGradient>
                            </defs>
                        </svg>
                        {/* Centered Percentage Text */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-sky-400">
                                {Math.round(safeRate)}%
                            </span>
                            <span className="text-[7px] text-slate-500 uppercase tracking-widest mt-0.5">Overlap</span>
                        </div>
                    </div>
                </div>

                {/* Footer Insight */}
                <div className="bg-gradient-to-r from-sky-500/10 to-purple-500/10 p-2.5 rounded-lg border border-sky-500/20">
                    <div className="flex items-start gap-2">
                        <svg className="w-3.5 h-3.5 text-sky-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="text-[10px] text-slate-400 leading-snug">
                            <strong className="text-sky-300">{stats.mappedCoverage}</strong> formal flags successfully translated into executable vulnerability scenarios.
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};