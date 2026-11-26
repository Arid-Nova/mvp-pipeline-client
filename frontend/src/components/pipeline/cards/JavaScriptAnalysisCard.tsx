import React, { useState } from 'react';
import { NodeData } from '../models';

export const JavaScriptAnalysisCard: React.FC<{ node: NodeData; updateNodeData: (id: string, data: any) => void }> = ({ node, updateNodeData }) => {
    const [expanded, setExpanded] = useState(false);
    const [error, setError] = useState('');
    const result = node.data.javascriptAnalysis;
    const download = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `aridnova-${node.type.toLowerCase()}.json`; link.click(); URL.revokeObjectURL(url);
    };
    
    return (
        <div className="space-y-2.5 text-xs" onMouseDown={e => e.stopPropagation()}>
            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-200 leading-snug">
                <span className="font-bold uppercase tracking-wider text-amber-300">
                    {result?.analysis === 'source-language-capability'
                        ? 'Source capability'
                        : result?.analysis === 'javascript-system-change'
                            ? 'JavaScript change analysis'
                            : 'JavaScript policy analysis'}
                </span>
                <span className="mx-1.5 text-amber-500/60">·</span>
                <span className="font-mono">{result?.status || 'Ready'}</span>
                <p className="mt-1 text-amber-200/80">
                    Coverage and expected-policy conformance are separate results.
                </p>
            </div>

            {node.type === 'FORMAL_VERIFY' && result?.status !== 'unsupported' && (
                <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-0.5">
                        Load maintainer-reviewed policy JSON
                    </label>
                    <input
                        type="file"
                        accept="application/json,.json"
                        className="block w-full text-[10px] text-slate-400 bg-slate-950 border border-slate-700 rounded p-1 cursor-pointer file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-slate-700 file:bg-slate-800 file:text-[10px] file:font-bold file:uppercase file:tracking-wider file:text-slate-200 hover:file:bg-slate-700 file:transition-colors file:cursor-pointer"
                        onChange={async e => {
                            try {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (file.size > 1024 * 1024) throw new Error('Policy file exceeds 1 MiB.');
                                const policy = JSON.parse(await file.text());
                                if (policy.schemaVersion !== 1 || !Array.isArray(policy.components)) {
                                    throw new Error('Invalid policy document.');
                                }
                                updateNodeData(node.id, { expectedPolicy: policy });
                                setError('');
                            } catch (failure: any) {
                                setError(failure.message);
                            }
                        }}
                    />
                </div>
            )}

            {node.type === 'TEST_EXECUTOR' && (
                <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-0.5">
                        Isolated fixture set ID
                    </label>
                    <input
                        aria-label="Isolated fixture set ID"
                        value={node.data.fixtureSet || ''}
                        onChange={e => updateNodeData(node.id, { fixtureSet: e.target.value })}
                        className="w-full text-xs text-slate-100 bg-slate-950 border border-slate-700 rounded p-1.5 outline-none focus:border-blue-500 transition-colors"
                        placeholder="Configured by the server operator"
                    />
                </div>
            )}

            {error && (
                <p role="alert" className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
                    {error}
                </p>
            )}

            {result && (
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setExpanded(!expanded)}
                        className="flex-1 px-2.5 py-1.5 text-[10px] font-bold tracking-wider uppercase rounded border border-blue-700/60 bg-blue-900/20 text-blue-300 hover:bg-blue-800/30 transition-colors"
                    >
                        {expanded ? 'Hide' : 'View'} Report
                    </button>
                    <button
                        type="button"
                        onClick={download}
                        className="flex-1 px-2.5 py-1.5 text-[10px] font-bold tracking-wider uppercase rounded border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 hover:text-slate-100 transition-colors"
                    >
                        Download JSON
                    </button>
                </div>
            )}

            {expanded && (
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 border border-slate-800 p-2 font-mono text-[10px] text-slate-300 custom-scrollbar">
                    {JSON.stringify(result, null, 2)}
                </pre>
            )}
        </div>
    );
};
