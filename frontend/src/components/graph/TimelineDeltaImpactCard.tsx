import React, { useState, useEffect, useMemo } from 'react';
import { fetchChangeImpact, generateChangeImpactInsights } from '../../services/api'; 
import { calculateMatrixData } from '../../utils/changeImpactUtils'; 

interface TimelineDeltaImpactCardProps {
    currentInstance: number;
    graphTimeline: Array<any>;
    isHistoryVisible?: boolean;
}

type TabType = 'overview' | 'topology' | 'heatmap' | 'ai';

export const TimelineDeltaImpactCard: React.FC<TimelineDeltaImpactCardProps> = ({
    currentInstance,
    graphTimeline,
    isHistoryVisible = false,
}) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    
    const [isLoading, setIsLoading] = useState(false);
    const [impactPayload, setImpactPayload] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [aiInsight, setAiInsight] = useState<string | null>(null);

    const currentIR = graphTimeline[currentInstance];
    const prevIR = currentInstance > 0 ? graphTimeline[currentInstance - 1] : null;

    useEffect(() => {
        // Celaring the stale AI state
        setAiInsight(null);

        if (!prevIR || !currentIR) {
            setImpactPayload(null);
            return;
        }

        let isStale = false;
        const abortController = new AbortController();

        const fetchImpact = async () => {
            setIsLoading(true);
            setError(null);

            if (activeTab === 'ai') setActiveTab('overview');

            try {
                const systemName = prevIR.name || currentIR.name || prevIR.systemName || "train-ticket";

                // Bulletproof Commit Extractor
                const extractRepositories = (ir: any) => {
                    const uniqueRepos = new Map();

                    const addRepo = (repoUrl: string, commitId: string, branch?: string) => {
                        if (repoUrl && commitId) {
                            const key = `${repoUrl}-${commitId}`;
                            if (!uniqueRepos.has(key)) {
                                uniqueRepos.set(key, {
                                    repoBranchPair: { repositoryURL: repoUrl, branchName: branch || "master" },
                                    commitID: commitId
                                });
                            }
                        }
                    };

                    if (!ir) return [];

                    if (ir.metadata) {
                        if (Array.isArray(ir.metadata) && ir.metadata.length > 0) {
                            ir.metadata.forEach((m: any) => addRepo(m.repoUrl || m.repositoryURL, m.commitId || m.commitID, m.branch || m.branchName));
                        } else if (typeof ir.metadata === 'object') {
                            addRepo(ir.metadata.repoUrl || ir.metadata.repositoryURL, ir.metadata.commitId || ir.metadata.commitID, ir.metadata.branch || ir.metadata.branchName);
                        }
                        if (uniqueRepos.size > 0) return Array.from(uniqueRepos.values());
                    }

                    if (ir.commitID || ir.commitId) {
                        addRepo(ir.repositoryURL || ir.repoUrl, ir.commitID || ir.commitId, ir.branchName || ir.branch);
                        if (uniqueRepos.size > 0) return Array.from(uniqueRepos.values());
                    }

                    if (ir.microservices && Array.isArray(ir.microservices)) {
                        ir.microservices.forEach((ms: any) => {
                            addRepo(ms.repositoryURL || ms.repoUrl || ir.repositoryURL, ms.commitID || ms.commitId, ms.branchName || ms.branch || "master");
                        });
                    }

                    return Array.from(uniqueRepos.values());
                };

                const deltaInput = {
                    id: prevIR.id || prevIR._id || "delta-req",
                    systemName: systemName,
                    systemRepositories: extractRepositories(prevIR),
                    comparingRepositories: extractRepositories(currentIR)
                };

                const result = await fetchChangeImpact(deltaInput);

                if (isStale) return;

                const changes = result.changes || [];
                const affectedSet = new Set<string>();
                changes.forEach((c: any) => {
                    if (c.path) {
                        const parts = c.path.split('/');
                        if (parts.length > 1 && parts[1].startsWith('ts-')) {
                            affectedSet.add(parts[1]);
                        } else if (parts.length > 2 && parts[2].startsWith('ts-')) {
                            affectedSet.add(parts[2]);
                        }
                    }
                });

                setImpactPayload({
                    rawResponse: result,
                    targetedServices: Array.from(affectedSet)
                });

            } catch (err: any) {
                if (isStale) return;
                console.error("Failed to fetch change impact", err);
                if (err.name !== "AbortError") {
                    setError("Failed to calculate architectural impact between these versions.");
                }
            } finally {
                if (!isStale) {
                    setIsLoading(false);
                }
            }
        };

        fetchImpact();

        return () => {
            isStale = true;
            abortController.abort();
        };
    }, [currentInstance, currentIR, prevIR]);

    const targetedServices = impactPayload?.targetedServices || [];

    const matrixData = useMemo(() => {
        if (!impactPayload || !currentIR) return { services: [], links: {}, impacts: {}, riskFactors: {}, centralities: {} };
        return calculateMatrixData(impactPayload.rawResponse, currentIR, targetedServices);
    }, [impactPayload, currentIR, targetedServices]);

    // Identical UI Helpers from ChangeImpactCard.tsx
    const formatSvcName = (name: string) => {
        if (!name) return '';
        return name.replace(/^(ts-|ms-|app-)/i, '').replace(/(-service|-api)$/i, '');
    };

    const getLinkStyle = (state: string) => {
        switch (state) {
            case 'added': return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400';
            case 'removed': return 'bg-rose-500/20 border-rose-500/50 text-rose-400 hover:shadow-[0_0_12px_rgba(244,63,94,0.5)]';
            case 'changed': return 'bg-amber-500/20 border-amber-500/50 text-amber-400 hover:shadow-[0_0_12px_rgba(245,158,11,0.5)]';
            case 'maintained': return 'bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-600/50';
            default: return 'bg-slate-800/30 border-transparent border-dashed';
        }
    };

    const getStatusTextColor = (state: string) => {
        switch (state) {
            case 'added': return 'text-emerald-400';
            case 'removed': return 'text-rose-400';
            case 'changed': return 'text-amber-400';
            case 'maintained': return 'text-slate-300';
            default: return 'text-slate-500';
        }
    };

    const getImpactColor = (score: number) => {
        if (score === 0) return 'bg-slate-800/30';
        if (score < 0.3) return 'bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:shadow-[0_0_10px_rgba(59,130,246,0.3)]';
        if (score < 0.6) return 'bg-amber-500/40 border border-amber-500/50 text-amber-200 hover:shadow-[0_0_10px_rgba(245,158,11,0.4)]';
        if (score < 0.8) return 'bg-orange-500/60 border border-orange-500/70 text-white hover:shadow-[0_0_10px_rgba(249,115,22,0.5)]';
        return 'bg-rose-600/80 border border-rose-400 text-white shadow-[0_0_10px_rgba(225,29,72,0.5)] hover:shadow-[0_0_15px_rgba(225,29,72,0.8)]'; 
    };

    const changes = impactPayload?.rawResponse?.changes || [];
    let addedCount = 0; let deletedCount = 0; let modifiedCount = 0;
    changes.forEach((c: any) => {
        if (c.changeType === 'ADD') addedCount++;
        if (c.changeType === 'DELETE') deletedCount++;
        if (c.changeType === 'MODIFY') modifiedCount++;
        
        if (c.componentDeltas) {
            c.componentDeltas.forEach((cd: any) => {
                if (cd.changeType === 'ADD') addedCount++;
                if (cd.changeType === 'DELETE') deletedCount++;
                if (cd.changeType === 'MODIFY') modifiedCount++;
            });
        }
    });

    const handleGenerateAI = async () => {
        setIsGeneratingAI(true);
        setAiInsight(null); 
        try {
            const serializableRiskFactors: Record<string, string[]> = {};
            Object.keys(matrixData.riskFactors).forEach(svc => {
                serializableRiskFactors[svc] = Array.from(matrixData.riskFactors[svc]);
            });

            const criticalImpacts: Array<{source: string, target: string, status: string, riskScore: number}> = [];
            matrixData.services.forEach(source => {
                matrixData.services.forEach(target => {
                    const score = matrixData.impacts[source][target] || 0;
                    if (score > 0.7) { 
                        criticalImpacts.push({ source, target, status: matrixData.links[source][target], riskScore: Number(score.toFixed(2)) });
                    }
                });
            });

            const payload = {
                metrics: { added: addedCount, modified: modifiedCount, deleted: deletedCount },
                affectedServices: matrixData.services,
                riskFactors: serializableRiskFactors,
                criticalImpacts: criticalImpacts.sort((a, b) => b.riskScore - a.riskScore) 
            };

            const responseData = await generateChangeImpactInsights(payload);
            setAiInsight(responseData.insight || responseData.message || "Analysis complete.");

        } catch {
            setAiInsight("Unfortunately, the AI Insight generation failed.");
        } finally {
            setIsGeneratingAI(false);
        }
    };

    if (!graphTimeline || graphTimeline.length === 0) return null;

    const versionLabel = `Version ${currentInstance + 1}`;
    const previousLabel = currentInstance > 0 ? `Version ${currentInstance}` : null;

    return (
        <div className={`fixed right-6 z-40 w-96 sm:w-[500px] font-sans select-none pointer-events-auto transition-all duration-500 ease-in-out ${isHistoryVisible ? 'bottom-48' : 'bottom-6'}`}>
            <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-4 shadow-2xl text-white transition-all duration-300">
                
                <div className="flex items-center justify-between border-b border-slate-700/60 pb-3 mb-3">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-sky-400">
                            {previousLabel ? `${previousLabel} ➔ ${versionLabel}` : 'Baseline Architecture'}
                        </span>
                        <h3 className="text-sm font-semibold truncate max-w-[200px] text-slate-100">
                            Change Impact Analysis
                        </h3>
                    </div>
                    <button 
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800/50 transition-colors"
                    >
                        {isMinimized ? '▲' : '▼'}
                    </button>
                </div>

                {!isMinimized && (
                    <div className="space-y-3 animate-fadeIn">
                        {!prevIR ? (
                            <div className="text-[12px] text-center text-emerald-400 font-medium bg-emerald-500/10 rounded-lg py-4 border border-emerald-500/20">
                                Initial Version Established. <br/> Drag the slider to compare versions.
                            </div>
                        ) : isLoading ? (
                            <div className="flex justify-center items-center py-6 text-sky-400 text-sm animate-pulse">
                                Calculating architectural impact...
                            </div>
                        ) : error ? (
                            <div className="text-[12px] text-center text-rose-400 font-medium bg-rose-500/10 rounded-lg py-4 border border-rose-500/20">
                                {error}
                            </div>
                        ) : impactPayload && (
                            <div className="flex flex-col animate-in slide-in-from-top-2 duration-300">
                                
                                {/* Tabs */}
                                <div className="flex border-b border-slate-700/50 bg-slate-900/80 rounded-t-lg overflow-hidden mb-3">
                                    {(['overview', 'topology', 'heatmap', 'ai'] as TabType[]).map((tab) => (
                                        <button 
                                            key={tab}
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveTab(tab); }}
                                            className={`flex-1 py-2 text-[10px] font-bold tracking-widest uppercase transition-colors ${activeTab === tab ? 'text-orange-400 border-b-2 border-orange-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            {tab === 'ai' ? 'AI Insights' : tab}
                                        </button>
                                    ))}
                                </div>

                                {/* Container mirroring ChangeImpactCard expanded view */}
                                <div className="h-[350px] flex flex-col gap-4 min-h-0" onWheel={(e) => e.stopPropagation()}>
                                    
                                    {/* OVERVIEW TAB */}
                                    {activeTab === 'overview' && (
                                        <div className="flex flex-col gap-4 animate-in fade-in duration-200 h-full min-h-0">
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/20 flex flex-col items-center justify-center">
                                                    <div className="text-[10px] text-emerald-400/80 uppercase font-bold tracking-widest mb-1">New Additions</div>
                                                    <div className="text-3xl font-black text-emerald-400">{addedCount}</div>
                                                </div>
                                                <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20 flex flex-col items-center justify-center">
                                                    <div className="text-[10px] text-amber-400/80 uppercase font-bold tracking-widest mb-1">Modifications</div>
                                                    <div className="text-3xl font-black text-amber-400">{modifiedCount}</div>
                                                </div>
                                                <div className="bg-rose-500/10 rounded-lg p-3 border border-rose-500/20 flex flex-col items-center justify-center">
                                                    <div className="text-[10px] text-rose-400/80 uppercase font-bold tracking-widest mb-1">Deletions</div>
                                                    <div className="text-3xl font-black text-rose-500">{deletedCount}</div>
                                                </div>
                                            </div>
                                            <div className="flex-1 bg-slate-800/40 rounded-lg p-3 border border-slate-700/50 flex flex-col min-h-[120px]">
                                                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-2">Impacted Services ({matrixData.services.length})</div>
                                                <div className="flex flex-wrap gap-2 overflow-y-auto custom-scrollbar pr-2 pb-2">
                                                    {matrixData.services.map((svc: string) => (
                                                        <span key={svc} className="text-[10px] px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-300 shadow-sm">
                                                            {formatSvcName(svc)}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* TOPOLOGY TAB (Link Dependency Matrix) */}
                                    {activeTab === 'topology' && (
                                        <div className="flex flex-col h-full animate-in fade-in duration-200 min-h-0">
                                            <div className="text-[10px] text-slate-400 text-center uppercase tracking-widest mb-2 shrink-0">Service Dependency Matrix</div>
                                            <div className="flex-1 overflow-auto custom-scrollbar bg-slate-900/30 rounded-lg border border-slate-700/50 relative">
                                                <div className="min-w-max p-4 pb-24 pr-12">
                                                    
                                                    <div className="flex mb-1 sticky top-0 z-20 bg-slate-900/90 backdrop-blur-sm pt-2">
                                                        <div className="w-24 shrink-0 sticky left-0 z-30 bg-slate-900/90 backdrop-blur-sm"></div>
                                                        <div className="flex gap-1.5">
                                                            {matrixData.services.map(target => (
                                                                <div key={target} className="w-6 relative h-20">
                                                                    <span 
                                                                        className="absolute bottom-2 left-1/2 origin-bottom-left -rotate-45 text-[9px] text-slate-400 font-mono whitespace-nowrap select-none tracking-tight" 
                                                                        title={target}
                                                                    >
                                                                        {formatSvcName(target)}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {matrixData.services.map((source) => (
                                                        <div key={source} className="flex items-center mb-1.5">
                                                            <div className="w-24 shrink-0 text-right pr-3 sticky left-0 z-10 bg-slate-900/90 backdrop-blur-sm h-6 flex items-center justify-end border-r border-slate-700/50 mr-1">
                                                                <span className="text-[9px] text-slate-300 font-mono truncate block w-full select-none" title={source}>
                                                                    {formatSvcName(source)}
                                                                </span>
                                                            </div>
                                                            
                                                            <div className="flex gap-1.5">
                                                                {matrixData.services.map((target) => {
                                                                    const status = matrixData.links[source][target];
                                                                    return (
                                                                        <div 
                                                                            key={`${source}-${target}`}
                                                                            className={`relative group w-6 h-6 shrink-0 rounded border flex items-center justify-center cursor-help transition-all duration-200 hover:scale-110 hover:z-20 ${getLinkStyle(status)}`}
                                                                        >
                                                                            {status !== 'none' && <div className="w-1.5 h-1.5 rounded-full bg-current opacity-60 shadow-sm" />}
                                                                            
                                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 flex flex-col gap-1.5">
                                                                                <div className="flex items-center justify-between border-b border-slate-700 pb-1">
                                                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Dependency</span>
                                                                                    <span className={`text-[9px] font-black uppercase tracking-wider ${getStatusTextColor(status)}`}>
                                                                                        {status}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="flex flex-col bg-slate-900/50 rounded p-1.5 border border-slate-700/50">
                                                                                    <div className="flex items-center gap-1.5 text-[9px] mb-0.5">
                                                                                        <span className="text-slate-500 w-6">From:</span>
                                                                                        <span className="text-slate-200 font-mono truncate">{formatSvcName(source)}</span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-1.5 text-[9px]">
                                                                                        <span className="text-slate-500 w-6">To:</span>
                                                                                        <span className="text-slate-200 font-mono truncate">{formatSvcName(target)}</span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex justify-center gap-4 mt-4 shrink-0 text-[9px] font-bold text-slate-500 uppercase">
                                                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded border border-emerald-500/50 bg-emerald-500/20"></div>Added Link</div>
                                                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded border border-rose-500/50 bg-rose-500/20"></div>Removed Link</div>
                                                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded border border-amber-500/50 bg-amber-500/20"></div>Modified Link</div>
                                                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded border border-slate-600 bg-slate-700/50"></div>No Link Change</div>
                                            </div>
                                        </div>
                                    )}

                                    {/* HEATMAP TAB (Cascading Impact Matrix) */}
                                    {activeTab === 'heatmap' && (
                                        <div className="flex flex-col h-full animate-in fade-in duration-200 min-h-0">
                                            <div className="text-[10px] text-slate-400 text-center uppercase tracking-widest mb-2 shrink-0">Cascading Impact Matrix</div>
                                            <div className="flex-1 overflow-auto custom-scrollbar bg-slate-900/30 rounded-lg border border-slate-700/50 relative">
                                                <div className="min-w-max p-4 pb-24 pr-12">
                                                    
                                                    <div className="flex mb-1 sticky top-0 z-20 bg-slate-900/90 backdrop-blur-sm pt-2">
                                                        <div className="w-24 shrink-0 sticky left-0 z-30 bg-slate-900/90 backdrop-blur-sm"></div>
                                                        <div className="flex gap-1.5">
                                                            {matrixData.services.map(target => (
                                                                <div key={target} className="w-6 relative h-20">
                                                                    <span 
                                                                        className="absolute bottom-2 left-1/2 origin-bottom-left -rotate-45 text-[9px] text-slate-400 font-mono whitespace-nowrap select-none tracking-tight" 
                                                                        title={target}
                                                                    >
                                                                        {formatSvcName(target)}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {matrixData.services.map((source) => (
                                                        <div key={source} className="flex items-center mb-1.5">
                                                            <div className="w-24 shrink-0 text-right pr-3 sticky left-0 z-10 bg-slate-900/90 backdrop-blur-sm h-6 flex items-center justify-end border-r border-slate-700/50 mr-1">
                                                                <span className="text-[9px] text-slate-300 font-mono truncate block w-full select-none" title={source}>
                                                                    {formatSvcName(source)}
                                                                </span>
                                                            </div>
                                                            
                                                            <div className="flex gap-1.5">
                                                                {matrixData.services.map((target) => {
                                                                    const score = matrixData.impacts[source][target] || 0;
                                                                    const risks = Array.from(matrixData.riskFactors[target] || []);
                                                                    
                                                                    return (
                                                                        <div 
                                                                            key={`${source}-${target}`}
                                                                            className={`relative group w-6 h-6 shrink-0 rounded cursor-help transition-all duration-200 hover:scale-110 hover:z-20 ${getImpactColor(score)} flex items-center justify-center`}
                                                                        >
                                                                            {score > 0 && <span className="text-[8px] font-bold opacity-80 drop-shadow-md">{score.toFixed(1)}</span>}
                                                                            
                                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 flex flex-col gap-1.5">
                                                                                <div className="flex items-center justify-between border-b border-slate-700 pb-1 mb-0.5">
                                                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Blast Radius Risk</span>
                                                                                    <span className={`text-[10px] font-black ${score > 0.7 ? 'text-rose-400' : score > 0.4 ? 'text-amber-400' : 'text-blue-400'}`}>
                                                                                        {score.toFixed(2)}
                                                                                    </span>
                                                                                </div>
                                                                                
                                                                                <div className="text-[9px] text-slate-300 leading-tight">
                                                                                    Changes in <span className="font-mono text-orange-300">{formatSvcName(target)}</span> impact caller <span className="font-mono text-orange-300">{formatSvcName(source)}</span>.
                                                                                </div>
                                                                                
                                                                                {risks.length > 0 && score > 0 && (
                                                                                    <div className="mt-1 p-1.5 bg-slate-900/50 rounded border border-slate-700/50 flex flex-col gap-1">
                                                                                        <span className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">Target Risk Factors:</span>
                                                                                        <div className="flex flex-wrap gap-1">
                                                                                            {risks.map(r => (
                                                                                                <span key={r} className="text-[8px] px-1 py-0.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded">
                                                                                                    {r}
                                                                                                </span>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-center mt-4 px-12 shrink-0">
                                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Low Risk</span>
                                                <div className="h-1.5 flex-1 mx-4 rounded-full bg-gradient-to-r from-slate-800 via-amber-500/50 to-rose-600 shadow-inner"></div>
                                                <span className="text-[9px] font-bold text-rose-500 uppercase tracking-widest">Critical</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* AI TAB */}
                                    {activeTab === 'ai' && (
                                        <div className="flex flex-col h-full animate-in fade-in duration-200 min-h-0">
                                            {!aiInsight ? (
                                                <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-slate-800/30 rounded-lg border border-dashed border-slate-600 p-4">
                                                    <div className="text-center text-xs text-slate-400 max-w-sm">
                                                        Run an AI analysis to interpret the blast radius matrices, detect hidden structural risks, and generate remediation strategies.
                                                    </div>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleGenerateAI(); }}
                                                        disabled={isGeneratingAI}
                                                        className="px-4 py-2 mt-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded shadow-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                                                    >
                                                        {isGeneratingAI ? (
                                                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                                        ) : (
                                                            <span className="text-base">✨</span>
                                                        )}
                                                        {isGeneratingAI ? 'Running AI Analysis...' : 'Generate AI Risk Assessment'}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex-1 bg-orange-900/10 border border-orange-500/20 rounded-lg p-4 text-xs text-orange-100/90 leading-relaxed shadow-inner overflow-y-auto custom-scrollbar">
                                                    <div className="flex items-center justify-between mb-3 border-b border-orange-500/20 pb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-orange-400 text-lg">✨</span>
                                                            <span className="font-bold text-orange-300 uppercase tracking-widest text-[11px]">AI Risk Assessment</span>
                                                        </div>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); setAiInsight(null); }} 
                                                            className="text-[10px] text-orange-500 hover:text-orange-300 uppercase font-bold tracking-widest">
                                                            Reset
                                                        </button>
                                                    </div>
                                                    <p className="mb-2 text-[13px]">{aiInsight}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};