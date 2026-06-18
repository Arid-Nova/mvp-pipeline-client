import React, { useState, useEffect, useMemo } from 'react';
import { fetchChangeImpact, generateChangeImpactInsights } from '../../services/api'; 
import { calculateMatrixData } from '../../utils/changeImpactUtils'; 

interface TimelineDeltaImpactCardProps {
    currentInstance: number;
    graphTimeline: Array<any>;
}

type TabType = 'overview' | 'topology' | 'heatmap' | 'ai';

export const TimelineDeltaImpactCard: React.FC<TimelineDeltaImpactCardProps> = ({
    currentInstance,
    graphTimeline,
}) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    
    // API State
    const [isLoading, setIsLoading] = useState(false);
    const [impactPayload, setImpactPayload] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    // AI Insights States
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [aiInsight, setAiInsight] = useState<string | null>(null);

    const currentIR = graphTimeline[currentInstance];
    const prevIR = currentInstance > 0 ? graphTimeline[currentInstance - 1] : null;

    // Trigger backend impact calculation when the slider hops versions
    useEffect(() => {
        if (!prevIR || !currentIR) {
            setImpactPayload(null);
            return;
        }

        const fetchImpact = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const systemName = prevIR.name || currentIR.name;

                const extractRepositories = (ir: any) => {
                    if (!ir || !ir.microservices || !Array.isArray(ir.microservices)) return [];
                    
                    const uniqueRepos = new Map();
                    ir.microservices.forEach((ms: any) => {
                        if (ms.repositoryURL && ms.commitID) {
                            const key = `${ms.repositoryURL}-${ms.commitID}`;
                            if (!uniqueRepos.has(key)) {
                                uniqueRepos.set(key, {
                                    repoBranchPair: { 
                                        repositoryURL: ms.repositoryURL, 
                                        branchName: ms.metadata?.branchName || ms.metadata?.branch || "master" 
                                    },
                                    commitID: ms.commitID
                                });
                            }
                        }
                    });
                    return Array.from(uniqueRepos.values());
                };

                const deltaInput = {
                    id: prevIR.id || "delta-req",
                    systemName: systemName,
                    systemRepositories: extractRepositories(prevIR),
                    comparingRepositories: extractRepositories(currentIR)
                };

                const result = await fetchChangeImpact(deltaInput);

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
                console.error("Failed to fetch change impact", err);
                if (err.name !== "AbortError") {
                    setError("Failed to calculate architectural impact between these versions.");
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchImpact();
    }, [currentInstance, currentIR, prevIR]);

    const matrixData = useMemo(() => {
        if (!impactPayload) return { services: [], links: {}, impacts: {}, riskFactors: {}, centralities: {} };
        return calculateMatrixData(
            impactPayload.rawResponse, 
            currentIR, 
            impactPayload.targetedServices
        );
    }, [impactPayload, currentIR]);

    const handleGenerateAI = async () => {
        if (!impactPayload) return;
        setIsGeneratingAI(true);
        try {
            const insight = await generateChangeImpactInsights(impactPayload);
            setAiInsight(insight);
            setActiveTab('ai');
        } catch (err) {
            console.error("Failed to generate AI insights", err);
        } finally {
            setIsGeneratingAI(false);
        }
    };

    if (!graphTimeline || graphTimeline.length === 0) return null;

    const versionLabel = `Version ${currentInstance + 1}`;
    const previousLabel = currentInstance > 0 ? `Version ${currentInstance}` : null;

    return (
        <div className="absolute bottom-24 right-6 z-40 w-80 sm:w-96 font-sans select-none pointer-events-auto">
            <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-4 shadow-2xl text-white transition-all duration-300">
                
                {/* Header */}
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

                {/* Minimized / Baseline / Loading / Error States */}
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
                        ) : (
                            <>
                                {/* Tabs Navigation */}
                                <div className="flex space-x-1 border-b border-slate-700/60 pb-2">
                                    {(['overview', 'topology', 'heatmap', 'ai'] as TabType[]).map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition-colors ${
                                                activeTab === tab 
                                                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' 
                                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                            }`}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>

                                {/* Tab Content */}
                                <div className="mt-3 text-sm text-slate-300 min-h-[120px]">
                                    {activeTab === 'overview' && (
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-2 gap-2 text-center">
                                                <div className="bg-slate-800/50 rounded p-2">
                                                    <div className="text-lg text-emerald-400 font-bold">{matrixData.services.length}</div>
                                                    <div className="text-[10px] uppercase text-slate-500">Services Impacted</div>
                                                </div>
                                                <div className="bg-slate-800/50 rounded p-2">
                                                    <div className="text-lg text-amber-400 font-bold">{Object.keys(matrixData.links).length}</div>
                                                    <div className="text-[10px] uppercase text-slate-500">Links Affected</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {activeTab === 'topology' && (
                                        <div className="max-h-32 overflow-y-auto custom-scrollbar text-xs space-y-1">
                                            {matrixData.services.length > 0 ? matrixData.services.map((svc: string, i: number) => (
                                                <div key={i} className="bg-slate-800/40 p-1.5 rounded">{svc}</div>
                                            )) : <div>No direct topology shifts detected.</div>}
                                        </div>
                                    )}

                                    {activeTab === 'heatmap' && (
                                        <div className="text-xs">
                                            <span className="text-slate-400">Risk Severity Mapping:</span>
                                            {/* Render your heatmap data from matrixData.riskFactors here */}
                                            <div className="mt-2 bg-gradient-to-r from-emerald-500/20 via-amber-500/20 to-rose-500/20 h-4 rounded w-full"></div>
                                        </div>
                                    )}

                                    {activeTab === 'ai' && (
                                        <div className="flex flex-col h-full">
                                            {!aiInsight ? (
                                                <button 
                                                    onClick={handleGenerateAI}
                                                    disabled={isGeneratingAI}
                                                    className="w-full py-3 mt-2 rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 font-bold text-xs uppercase tracking-widest transition-all"
                                                >
                                                    {isGeneratingAI ? 'Analyzing Matrix...' : 'Generate AI Insight'}
                                                </button>
                                            ) : (
                                                <div className="max-h-32 overflow-y-auto text-xs leading-relaxed text-slate-200">
                                                    {aiInsight}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};