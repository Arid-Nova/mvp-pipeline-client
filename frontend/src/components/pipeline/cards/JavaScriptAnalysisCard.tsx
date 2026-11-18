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
    return <div className="space-y-2 text-xs" onMouseDown={e => e.stopPropagation()}>
        <p className="text-amber-200">{result?.analysis === 'source-language-capability' ? 'Source capability' : result?.analysis === 'javascript-system-change' ? 'JavaScript change analysis' : 'JavaScript policy analysis'}: {result?.status || 'ready'}. Coverage and expected-policy conformance are separate results.</p>
        {node.type === 'FORMAL_VERIFY' && result?.status !== 'unsupported' && <label className="block">Load maintainer-reviewed policy JSON
            <input type="file" accept="application/json,.json" onChange={async e => {
                try { const file = e.target.files?.[0]; if (!file) return; if (file.size > 1024 * 1024) throw new Error('Policy file exceeds 1 MiB.');
                    const policy = JSON.parse(await file.text()); if (policy.schemaVersion !== 1 || !Array.isArray(policy.components)) throw new Error('Invalid policy document.');
                    updateNodeData(node.id, { expectedPolicy: policy }); setError('');
                } catch (failure: any) { setError(failure.message); }
            }} />
        </label>}
        {node.type === 'TEST_EXECUTOR' && <label className="block">Isolated fixture set ID
            <input aria-label="Isolated fixture set ID" value={node.data.fixtureSet || ''} onChange={e => updateNodeData(node.id, { fixtureSet: e.target.value })}
                className="mt-1 w-full rounded bg-slate-800 p-2" placeholder="Configured by the server operator" />
        </label>}
        {error && <p role="alert" className="text-red-300">{error}</p>}
        {result && <div className="flex gap-2"><button onClick={() => setExpanded(!expanded)} className="rounded bg-blue-700 px-2 py-1">{expanded ? 'Hide' : 'View'} report</button>
            <button onClick={download} className="rounded bg-slate-700 px-2 py-1">Download JSON</button></div>}
        {expanded && <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-2">{JSON.stringify(result, null, 2)}</pre>}
    </div>;
};
