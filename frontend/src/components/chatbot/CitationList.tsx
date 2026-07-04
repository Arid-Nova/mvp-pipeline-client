import React, { useState } from "react";
import { CitationItem } from "../../services/types";

export const CitationList: React.FC<{ citations: CitationItem[] }> = ({ citations }) => {
    const [expanded, setExpanded] = useState<Record<number, boolean>>({});
    const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

    const toggle = (idx: number) => setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }));

    const truncateSnippet = (text?: string, max = 220): string => {
        if (!text) return "No evidence snippet available.";
        return text.length <= max ? text : `${text.trim().slice(0, max)}...`;
    };

    const subjectLabel = (citation: CitationItem): string => {
        const values = [citation.serviceName, citation.entityName, citation.endpointPath, citation.artifactName]
            .filter((v) => Boolean(v && v.trim()));
        return values.length > 0 ? values[0] as string : "n/a";
    };

    const copyDetails = async (citation: CitationItem, idx: number) => {
        const text = `artifactType: ${citation.artifactType || "n/a"}\nartifactId: ${citation.artifactId || "n/a"}\nsubject: ${subjectLabel(citation)}\nsourcePath: ${citation.sourcePath || "n/a"}\nsourceEndpoint: ${citation.sourceEndpoint || "n/a"}\nversion: ${citation.version || "n/a"}\ncommitId: ${citation.commitId || "n/a"}\ntimestamp: ${citation.timestamp || "n/a"}\nlocationHint: ${citation.locationHint || "n/a"}\nsnippet: ${truncateSnippet(citation.summary)}`;
        
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            setCopiedIdx(idx);
            setTimeout(() => setCopiedIdx(null), 2000);
        }
    };

    if (citations.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 w-full" data-testid="citation-list">
            {/* Standardized Header */}
            <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400/80 uppercase tracking-widest">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Evidence Citations
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[9px] border border-white/10">
                    {citations.length}
                </span>
            </div>
            
            <ul className="space-y-2 w-full">
                {citations.map((citation, idx) => {
                    const isExpanded = expanded[idx];
                    const isCopied = copiedIdx === idx;

                    return (
                        <li key={`${citation.artifactId}-${idx}`} className="bg-slate-900/60 rounded-xl overflow-hidden border border-white/5 w-full transition-all hover:border-white/10 shadow-sm">
                            <div className="p-3 flex justify-between items-start gap-3">
                                <div className="flex flex-col min-w-0 flex-1 cursor-pointer" onClick={() => toggle(idx)}>
                                    <div className="font-semibold text-slate-200 text-[11.5px] truncate flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)] shrink-0" />
                                        <span className="text-cyan-100">{citation.artifactType || "UNKNOWN"}</span> 
                                        <span className="text-slate-600 font-normal">/</span> 
                                        <span className="text-slate-300 truncate">{citation.artifactId || "n/a"}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 truncate mt-1 pl-3.5 flex items-center gap-1.5">
                                        <svg className="w-3 h-3 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                        </svg>
                                        {subjectLabel(citation)}
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-1 shrink-0 bg-slate-950/50 rounded-lg p-0.5 border border-white/5">
                                    <button
                                        type="button"
                                        title="Copy citation details"
                                        data-testid={`citation-copy-${idx}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            copyDetails(citation, idx);
                                        }}
                                        className={`p-1.5 rounded-md transition-all ${isCopied ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                                    >
                                        {isCopied ? (
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                            </svg>
                                        ) : (
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        title={isExpanded ? "Collapse" : "Expand"}
                                        data-testid={`citation-toggle-${idx}`}
                                        onClick={() => toggle(idx)}
                                        className={`p-1.5 rounded-md transition-all ${isExpanded ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                                    >
                                        <svg className={`w-3.5 h-3.5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            
                            <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out border-t border-white/5 bg-slate-950/40 ${
                                isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 border-transparent'
                            }`}>
                                <div className="overflow-hidden">
                                    <div id={`citation-details-${idx}`} data-testid={`citation-details-${idx}`} className="p-3 space-y-3 w-full">
                                        <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-[10.5px] w-full">
                                            <span className="text-slate-500 font-semibold text-right">Path:</span>
                                            <span className="text-slate-300 break-all">{citation.sourcePath || "n/a"}</span>
                                            <span className="text-slate-500 font-semibold text-right">Endpoint:</span>
                                            <span className="text-slate-300 break-all">{citation.sourceEndpoint || "n/a"}</span>
                                            <span className="text-slate-500 font-semibold text-right">Version:</span>
                                            <span className="text-slate-300">{citation.version || "n/a"}</span>
                                            <span className="text-slate-500 font-semibold text-right">Commit ID:</span>
                                            <span className="text-slate-400 font-mono bg-slate-800/50 px-1 py-0.5 rounded border border-white/5 w-fit">{citation.commitId || "n/a"}</span>
                                            <span className="text-slate-500 font-semibold text-right">Timestamp:</span>
                                            <span className="text-slate-300">{citation.timestamp || "n/a"}</span>
                                            <span className="text-slate-500 font-semibold text-right">Location:</span>
                                            <span className="text-slate-300">{citation.locationHint || "n/a"}</span>
                                        </div>
                                        <div className="pt-2 mt-2 w-full">
                                            <div className="text-[9px] text-slate-500 uppercase font-bold mb-1.5 tracking-wider flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                                </svg>
                                                Evidence Snippet
                                            </div>
                                            <pre data-testid={`citation-snippet-${idx}`} className="text-[10px] whitespace-pre-wrap break-words text-slate-300 font-mono leading-relaxed bg-black/40 p-3 rounded-lg border border-slate-700/50 shadow-inner overflow-x-auto custom-scrollbar">
                                                {truncateSnippet(citation.summary)}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

export default CitationList;