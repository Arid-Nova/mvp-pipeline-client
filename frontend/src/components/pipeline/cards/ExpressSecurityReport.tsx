import React, { useState } from 'react';
import { createPortal } from 'react-dom';

export const ExpressSecurityReport: React.FC<{ report: any; onClose: () => void }> = ({ report, onClose }) => {
    const [query, setQuery] = useState('');
    const [tab, setTab] = useState<'findings' | 'endpoints'>('findings');
    const findings: any[] = Array.isArray(report.findings) ? report.findings : [];
    const endpoints: any[] = Array.isArray(report.endpoints) ? report.endpoints : [];
    const rows = (tab === 'findings' ? findings : endpoints).filter(row =>
        `${row.method || ''} ${row.path || ''} ${row.title || ''} ${row.ruleId || ''} ${row.location?.file || ''}`
            .toLowerCase().includes(query.toLowerCase()));
    const download = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'aridnova-express-security.json';
        link.click();
        URL.revokeObjectURL(url);
    };
    return createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4"
            onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="express-security-title"
                className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-xl border border-slate-600 bg-slate-900 p-6 text-slate-100"
                onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 id="express-security-title" className="text-xl font-semibold">Express security analysis</h2>
                        <p className="mt-1 text-sm text-amber-300">{report.status === 'complete' ? 'Declared source checks complete' : 'Partial source analysis'} · runtime behavior is assessed separately</p>
                    </div>
                    <button autoFocus onClick={onClose} className="rounded border border-slate-600 px-3 py-1">Close</button>
                </div>
                <p className="my-4 text-sm text-slate-300">
                    {endpoints.length} endpoint records · {findings.length} findings and review candidates.
                    Unobserved or unresolved checks do not establish public access, a vulnerability, or security correctness.
                </p>
                <div className="mb-4 flex flex-wrap gap-2">
                    <button onClick={() => setTab('findings')} aria-pressed={tab === 'findings'}
                        className={`rounded px-3 py-2 ${tab === 'findings' ? 'bg-blue-700' : 'bg-slate-700'}`}>Findings</button>
                    <button onClick={() => setTab('endpoints')} aria-pressed={tab === 'endpoints'}
                        className={`rounded px-3 py-2 ${tab === 'endpoints' ? 'bg-blue-700' : 'bg-slate-700'}`}>Endpoint checks and paths</button>
                    <button onClick={download} className="rounded border border-slate-600 px-3 py-2">Download report</button>
                    <input aria-label="Filter security results" placeholder="Filter by route, file, or rule" value={query}
                        onChange={event => setQuery(event.target.value)} className="min-w-[240px] flex-1 rounded bg-slate-800 px-3 py-2" />
                </div>
                {rows.length === 0 && <p className="py-4 text-slate-300">No records match this view. This is not a security pass.</p>}
                <div className="space-y-2">
                    {rows.slice(0, 100).map((row, index) => <details key={row.id || row.endpointId || index} className="rounded border border-slate-700 p-3">
                        <summary className="cursor-pointer break-words">
                            <span className="font-medium">{tab === 'findings' ? row.title || row.ruleId : `${row.method || ''} ${row.path || '(unresolved route)'}`}</span>
                            <span className="ml-2 text-xs text-slate-300">{tab === 'findings'
                                ? `${row.severity || 'unrated'} · ${row.classification || 'review-candidate'}`
                                : `Authentication: ${row.authentication?.status || 'unknown'} · ${row.roleChecks?.length || 0} role checks · ${row.ownershipChecks?.length || 0} ownership checks`}</span>
                        </summary>
                        <p className="mt-2 text-xs text-slate-400">{row.location?.file}{row.location?.line ? `:${row.location.line}` : ''}</p>
                        {row.recommendation && <p className="my-2 text-sm">{row.recommendation}</p>}
                        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-950 p-3 text-xs">
                            {JSON.stringify(tab === 'findings' ? row.evidence : {
                                middlewareChain: row.middlewareChain, authentication: row.authentication,
                                roleChecks: row.roleChecks, ownershipChecks: row.ownershipChecks,
                                executionPaths: row.executionPaths, dataOperations: row.dataOperations, policyModel: row.policyModel,
                                reachability: row.reachability, effectivePaths: row.effectivePaths, analysisCoverage: row.analysisCoverage
                            }, null, 2)}
                        </pre>
                    </details>)}
                </div>
                {rows.length > 100 && <p className="mt-3 text-sm text-slate-400">Showing the first 100 matches. Filter further or download all records.</p>}
                <details className="mt-5 border-t border-slate-700 pt-3">
                    <summary className="cursor-pointer">Coverage and limitations</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-300">{JSON.stringify({ capabilities: report.capabilities, applicationAssembly: report.applicationAssembly, coverage: report.coverage, scope: report.scope, limitations: report.limitations }, null, 2)}</pre>
                </details>
            </section>
        </div>, document.body
    );
};
