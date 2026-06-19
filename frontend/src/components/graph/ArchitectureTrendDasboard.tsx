import React, { useMemo, useState, useEffect } from 'react';
import { fetchChangeImpact } from '../../services/api';

interface ArchitectureTrendDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    graphTimeline: Array<any>;
}

type TabType = 'overview' | 'impact' | 'coupling' | 'forecasting' | 'composition';

export const ArchitectureTrendDashboard: React.FC<ArchitectureTrendDashboardProps> = ({ isOpen, onClose, graphTimeline }) => {
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [selectedMetric, setSelectedMetric] = useState<'nodes' | 'edges' | 'coupling' | 'affected'>('nodes');
    
    const [deltaMetrics, setDeltaMetrics] = useState<any[]>([]);
    const [isLoadingDeltas, setIsLoadingDeltas] = useState(false);

    // 1. IR EXTRACTION
    const computedMetrics = useMemo(() => {
        if (!graphTimeline || graphTimeline.length === 0) return [];

        return graphTimeline.map((rawIr, index) => {
            const ir = rawIr?.payload?.irJson || rawIr?.data?.payload?.irJson || rawIr?.systemInfo?.ir || rawIr;
            
            const nodesArray = ir.nodes || ir.microservices || ir.components || ir.services || [];
            let edgesArray = ir.links || ir.edges || ir.connections || ir.dependencies || [];
            
            if (edgesArray.length === 0 && nodesArray.length > 0) {
                const derivedEdges = new Set<string>();
                const knownServices = nodesArray.map((n: any) => n.name || n.nodeName || n.id).filter(Boolean);

                nodesArray.forEach((sourceNode: any) => {
                    const sourceName = sourceNode.name || sourceNode.nodeName || sourceNode.id;
                    if (!sourceName) return;

                    const rawString = JSON.stringify(sourceNode);
                    knownServices.forEach((targetName: string) => {
                        if (sourceName !== targetName && rawString.includes(targetName)) {
                            derivedEdges.add(`${sourceName}___${targetName}`);
                        }
                    });
                });

                edgesArray = Array.from(derivedEdges).map(edgeStr => {
                    const [source, target] = edgeStr.split('___');
                    return { source, target };
                });
            }

            const nodes = nodesArray.length;
            const edges = edgesArray.length;
            const coupling = nodes > 0 ? Number((edges / nodes).toFixed(2)) : 0;
            const maxPossibleEdges = nodes * (nodes - 1);
            const density = maxPossibleEdges > 0 ? Number((edges / maxPossibleEdges).toFixed(3)) : 0;

            let hubsCount = 0;
            let leafCount = 0;
            
            if (nodes > 0 && edges > 0) {
                const degreeMap: Record<string, number> = {};
                nodesArray.forEach((n: any) => { degreeMap[n.nodeName || n.name || n.id] = 0; });
                
                edgesArray.forEach((l: any) => {
                    const src = l.source?.id || l.source || l.sourceName || '';
                    const tgt = l.target?.id || l.target || l.targetName || '';
                    if (degreeMap[src] !== undefined) degreeMap[src]++;
                    if (degreeMap[tgt] !== undefined) degreeMap[tgt]++;
                });

                const degrees = Object.values(degreeMap);
                const avgDegree = degrees.reduce((a, b) => a + b, 0) / (nodes || 1);
                
                degrees.forEach(deg => {
                    if (deg > avgDegree * 1.5) hubsCount++;
                    if (deg <= 1) leafCount++;
                });
            }

            return {
                version: `V${index + 1}`,
                commit: (ir.commitID || ir.commitId || rawIr.commitID || `synth-${index}`).substring(0, 7),
                nodes,
                edges,
                coupling,
                density,
                hubsCount,
                leafCount,
                internalCount: Math.max(0, nodes - (hubsCount + leafCount)),
                rawNodes: nodesArray 
            };
        });
    }, [graphTimeline]);

    // 2. BATCH FETCH OF CHANGE IMPACT API
    useEffect(() => {
        if (!isOpen || graphTimeline.length < 2) return;
        
        let isMounted = true;

        const fetchAllDeltas = async () => {
            setIsLoadingDeltas(true);
            const results = new Array(graphTimeline.length).fill({ affected: 0, changes: 0 });
            
            const extractRepositories = (rawIr: any) => {
                const uniqueRepos = new Map();
                const addRepo = (r: string, c: string, b?: string) => {
                    if (r && c) uniqueRepos.set(`${r}-${c}`, { repoBranchPair: { repositoryURL: r, branchName: b || "master" }, commitID: c });
                };
                const ir = rawIr?.payload?.irJson || rawIr?.data?.payload?.irJson || rawIr?.systemInfo?.ir || rawIr;
                if (!ir) return [];

                if (ir.metadata) {
                    const meta = Array.isArray(ir.metadata) ? ir.metadata : [ir.metadata];
                    meta.forEach((m: any) => addRepo(m.repoUrl || m.repositoryURL, m.commitId || m.commitID, m.branch || m.branchName));
                } 
                if (ir.commitID || ir.commitId) {
                    addRepo(ir.repositoryURL || ir.repoUrl, ir.commitID || ir.commitId, ir.branchName || ir.branch);
                }
                const nodesArray = ir.microservices || ir.nodes || ir.components || ir.services || [];
                if (Array.isArray(nodesArray)) {
                    nodesArray.forEach((ms: any) => {
                        addRepo(
                            ms.repositoryURL || ms.repoUrl || ir.repositoryURL || ir.repoUrl, 
                            ms.commitID || ms.commitId || ir.commitID || ir.commitId, 
                            ms.branchName || ms.branch || ir.branchName || ir.branch || "master"
                        );
                    });
                }
                return Array.from(uniqueRepos.values());
            };

            for (let i = 1; i < graphTimeline.length; i++) {
                if (!isMounted) break;

                const prev = graphTimeline[i - 1];
                const curr = graphTimeline[i];
                const sysName = prev.name || curr.name || prev.systemName || "system";
                
                const deltaInput = {
                    id: prev.id || prev._id || `req-${i}`,
                    systemName: sysName,
                    systemRepositories: extractRepositories(prev),
                    comparingRepositories: extractRepositories(curr)
                };

                try {
                    const res = await fetchChangeImpact(deltaInput);
                    const changes = res?.changes || res?.data?.changes || (Array.isArray(res) ? res : []);
                    const affectedSet = new Set<string>();
                    
                    changes.forEach((c: any) => {
                        if (c.path) {
                            const parts = c.path.split('/');
                            if (parts.length > 1) affectedSet.add(parts[1]);
                        }
                    });
                    
                    results[i] = { affected: affectedSet.size, changes: changes.length };
                } catch (error) {
                    results[i] = { affected: 0, changes: 0 };
                }
            }

            if (isMounted) {
                setDeltaMetrics(results);
                setIsLoadingDeltas(false);
            }
        };

        fetchAllDeltas();
        return () => { isMounted = false; };
    }, [isOpen, graphTimeline]);

    // 3. COMBINE METRICS
    const fullMetrics = useMemo(() => {
        return computedMetrics.map((m, i) => ({
            ...m,
            deltaLabel: i === 0 ? 'Baseline' : `V${i} → V${i+1}`,
            affected: deltaMetrics[i]?.affected || 0,
            fileChanges: deltaMetrics[i]?.changes || 0,
            riskScore: Number((m.coupling * (deltaMetrics[i]?.affected || 1)).toFixed(2))
        }));
    }, [computedMetrics, deltaMetrics]);

    // 4. PREDICTIVE FORECASTING
    const forecastData = useMemo(() => {
        if (fullMetrics.length < 1) return [];
        const history = fullMetrics.map((m, i) => ({ x: i, y: m[selectedMetric] || 0 }));
        const n = history.length;
        let projectedValues = [];
        
        if (n >= 2) {
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
            history.forEach(pt => { sumX += pt.x; sumY += pt.y; sumXY += pt.x * pt.y; sumXX += pt.x * pt.x; });
            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
            const intercept = (sumY - slope * sumX) / n;

            for (let i = 0; i < 3; i++) {
                projectedValues.push({ version: `V${n + i + 1} (F)`, value: Math.max(0, slope * (n + i) + intercept), isForecast: true });
            }
        }
        return [
            ...fullMetrics.map(m => ({ version: m.version, value: m[selectedMetric] || 0, isForecast: false })),
            ...projectedValues
        ];
    }, [fullMetrics, selectedMetric]);

    if (!isOpen) return null;

    const latest = fullMetrics[fullMetrics.length - 1];

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 font-sans">
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}></div>

            {/* Adjusted height to max-h-[85vh] so it's not needlessly tall, and optimized width */}
            <div className="relative w-full max-w-7xl max-h-[85vh] bg-slate-900 border border-slate-700 shadow-2xl rounded-xl flex flex-col overflow-hidden text-slate-200">
                
                {/* Header: More compact padding (p-5) and slightly larger text */}
                <div className="flex flex-col sm:flex-row justify-between items-center px-6 py-4 border-b border-slate-800 bg-slate-900/80 z-10">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
                            <Icons.Activity className="w-6 h-6 text-indigo-400" />
                            Architecture Intelligence
                        </h2>
                        <div className="flex items-center gap-3 mt-1">
                            <p className="text-slate-400 text-sm">Analyzed {graphTimeline.length} pipeline iterations</p>
                            {isLoadingDeltas && (
                                <span className="text-xs uppercase font-semibold text-orange-400/90 flex items-center gap-1.5 bg-orange-400/10 px-2 py-0.5 rounded border border-orange-400/20">
                                    <Icons.Refresh className="w-3.5 h-3.5 animate-spin" /> Fetching Deltas
                                </span>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700/50 shadow-inner">
                        {(['overview', 'impact', 'coupling', 'forecasting', 'composition'] as TabType[]).map((tab) => (
                            <button 
                                key={tab} 
                                onClick={() => setActiveTab(tab)} 
                                className={`px-5 py-2 text-sm font-semibold capitalize rounded-md transition-colors ${ 
                                    activeTab === tab 
                                        ? 'bg-slate-700 text-white shadow-sm' 
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50' 
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                    
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-rose-500/20 hover:border-rose-500/30 rounded-lg transition-all border border-transparent">
                        <Icons.Close className="w-6 h-6" />
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-900">
                    
                    {/* KPI Stat Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        <KPICard 
                            title="Microservices" 
                            value={latest?.nodes} 
                            Icon={Icons.Box} 
                            color="text-sky-400" 
                            tooltip="Total number of independently deployable services or core nodes in the current architecture."
                        />
                        <KPICard 
                            title="Dependencies" 
                            value={latest?.edges} 
                            Icon={Icons.Network} 
                            color="text-indigo-400" 
                            tooltip="Total number of inter-service dependencies and API calls across the system."
                        />
                        <KPICard 
                            title="Coupling Factor" 
                            value={latest?.coupling} 
                            Icon={Icons.Scale} 
                            color="text-orange-400" 
                            tooltip="Average dependencies per service. Higher values indicate tighter, more fragile coupling. (Target < 2.5)"
                        />
                        <KPICard 
                            title="Total Affected" 
                            value={fullMetrics.reduce((a, b) => a + b.affected, 0)} 
                            Icon={Icons.Activity} 
                            color="text-rose-400" 
                            tooltip="Cumulative count of services structurally impacted by code modifications across the entire timeline."
                        />
                        <KPICard 
                            title="Risk Score" 
                            value={latest?.riskScore} 
                            Icon={Icons.Alert} 
                            color="text-amber-400" 
                            tooltip={
                                <div className="flex flex-col gap-2 text-center">
                                    <span className="text-slate-300 leading-tight">
                                        Compound vulnerability metric evaluating architectural volatility.
                                    </span>
                                    
                                    {/* The Simplified Equation */}
                                    <div className="bg-slate-900/80 p-1.5 rounded border border-slate-700/80 font-mono text-[10px] text-orange-300 text-center shadow-inner my-0.5">
                                        Risk = Coupling × Affected Nodes
                                    </div>
                                    
                                    {/* How to interpret the number */}
                                    <div className="flex flex-col gap-1.5 mt-1 border-t border-slate-600/50 pt-2">
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> Stable</span>
                                            <span className="font-mono text-emerald-400">&lt; 5.0</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div> Moderate</span>
                                            <span className="font-mono text-amber-400">5 - 15</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div> Critical</span>
                                            <span className="font-mono text-rose-400">&gt; 15.0</span>
                                        </div>
                                    </div>
                                </div>
                            }
                        />
                    </div>

                    {activeTab === 'overview' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <ChartCard 
                                title="Growth vs Dependencies"
                                tooltip={
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-slate-200 font-semibold mb-1">Architectural Scaling</span>
                                        <span>Compares raw microservice count against inter-service dependencies.</span>
                                        <span className="text-orange-300 bg-orange-400/10 p-1.5 rounded mt-1 border border-orange-400/20">
                                            If dependencies grow exponentially while nodes grow linearly, the system is becoming dangerously entangled.
                                        </span>
                                    </div>
                                }
                                action={
                                    <div className="flex gap-4 text-xs font-bold text-slate-400">
                                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#38bdf8]"></div> Nodes</div>
                                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#6366f1]"></div> Dependencies</div>
                                    </div>
                                }
                            >
                                <SVGAreaChart data={fullMetrics} keys={['nodes', 'edges']} colors={['#38bdf8', '#6366f1']} />
                            </ChartCard>
                            
                            <ChartCard 
                                title="Accumulated Structural Risk"
                                tooltip={
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-slate-200 font-semibold mb-1">Timeline Risk Drift</span>
                                        <span>Tracks the compound risk index across pipeline versions.</span>
                                        <div className="mt-1 flex flex-col gap-1 border-t border-slate-600 pt-1.5">
                                            <span className="text-emerald-400">↘ Down: Decoupling success</span>
                                            <span className="text-rose-400">↗ Up: Accumulating technical debt</span>
                                        </div>
                                    </div>
                                }
                                action={
                                    <div className="flex gap-4 text-xs font-bold text-slate-400">
                                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]"></div> Risk Index</div>
                                    </div>
                                }
                            >
                                <SVGLineChart data={fullMetrics} dataKey="riskScore" color="#f59e0b" fill="#f59e0b10" />
                            </ChartCard>
                        </div>
                    )}

                    {activeTab === 'impact' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <ChartCard 
                                title="Impact Velocity (Affected Nodes)"
                                tooltip={
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-slate-200 font-semibold mb-1">Blast Radius Tracking</span>
                                        <span>Counts the number of services structurally disturbed in each version jump.</span>
                                        <span className="text-sky-300 mt-1">High spikes represent massive cross-cutting architectural changes.</span>
                                    </div>
                                }
                            >
                                <SVGBarChart data={fullMetrics} dataKey="affected" color="#f43f5e" />
                            </ChartCard>
                            
                            <ChartCard 
                                title="Code Churn Magnitude"
                                tooltip={
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-slate-200 font-semibold mb-1">Raw File Modifications</span>
                                        <span>The total sum of files added, deleted, or modified between versions.</span>
                                        <span className="text-sky-300 mt-1">Correlate this with Impact Velocity to see if small code changes cause disproportionately large architectural ripples.</span>
                                    </div>
                                }
                            >
                                <SVGBarChart data={fullMetrics} dataKey="fileChanges" color="#10b981" />
                            </ChartCard>
                        </div>
                    )}

                    {activeTab === 'coupling' && (
                        <ChartCard 
                            title="System Coupling Distribution"
                            tooltip={
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-slate-200 font-semibold mb-1">Sprawl Factor Analysis</span>
                                    <span>Visualizes the exact coupling average for each historical release.</span>
                                    <span className="text-rose-300 bg-rose-400/10 p-1.5 rounded mt-1 border border-rose-400/20">
                                        Any iteration that crosses the Danger Threshold (2.5) indicates more synchronous, tightly bound services prone to cascading failures.
                                    </span>
                                </div>
                            }
                        >
                            <div className="h-64"><SVGStickChart data={fullMetrics} /></div>
                        </ChartCard>
                    )}

                    {activeTab === 'forecasting' && (
                        <ChartCard 
                            title="Linear Regression Forecasting"
                            tooltip={
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-slate-200 font-semibold mb-1">AI Predictive Horizons</span>
                                    <span>Uses least-squares linear regression on historical telemetry to plot the next 3 projected architectural states.</span>
                                    <div className="mt-1 border-t border-slate-600 pt-1.5 text-[10px] font-mono text-indigo-300">
                                        y = mx + b (where m is architectural velocity)
                                    </div>
                                </div>
                            }
                            action={
                                <div className="flex gap-1.5 bg-slate-800 p-1 rounded-md border border-slate-700">
                                    {(['nodes', 'edges', 'coupling', 'affected'] as const).map(m => (
                                        <button key={m} onClick={() => setSelectedMetric(m)} className={`px-3 py-1 text-xs uppercase font-bold rounded transition-colors ${selectedMetric === m ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>{m}</button>
                                    ))}
                                </div>
                            }
                        >
                            <div className="h-64"><SVGForecastLineChart data={forecastData} /></div>
                        </ChartCard>
                    )}

                    {activeTab === 'composition' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className="lg:col-span-1 flex flex-col h-full">
                                <ChartCard 
                                    title="Role Distribution"
                                    tooltip={
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-slate-200 font-semibold mb-1">Topological Node Roles</span>
                                            <span>Categorizes microservices based on their dependency weight.</span>
                                            <div className="mt-1 flex flex-col gap-1.5 border-t border-slate-600 pt-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                                                    <span className="text-slate-300"><b>Hubs:</b> High fan-in/out. Risk of bottlenecks.</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-sky-400"></div>
                                                    <span className="text-slate-300"><b>Core:</b> Standard internal routing nodes.</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                                    <span className="text-slate-300"><b>Endpoints:</b> Isolated or edge service leafs.</span>
                                                </div>
                                            </div>
                                        </div>
                                    }
                                >
                                    <div className="flex-1 flex flex-col items-center justify-center gap-6 pt-2">
                                        <div className="w-48 h-48">
                                            <SVGDoughnutChart values={[latest?.hubsCount, latest?.internalCount, latest?.leafCount]} colors={['#f43f5e', '#38bdf8', '#10b981']} />
                                        </div>
                                        <div className="flex flex-col gap-3 text-sm font-semibold text-slate-300 w-full px-2">
                                            <div className="flex justify-between items-center bg-slate-800/80 px-3 py-2 rounded-lg"><span className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]"></div> Hubs</span> <span className="text-rose-400 text-lg">{latest?.hubsCount}</span></div>
                                            <div className="flex justify-between items-center bg-slate-800/80 px-3 py-2 rounded-lg"><span className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]"></div> Core</span> <span className="text-sky-400 text-lg">{latest?.internalCount}</span></div>
                                            <div className="flex justify-between items-center bg-slate-800/80 px-3 py-2 rounded-lg"><span className="flex items-center gap-2.5"><div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div> Endpoints</span> <span className="text-emerald-400 text-lg">{latest?.leafCount}</span></div>
                                        </div>
                                    </div>
                                </ChartCard>
                            </div>

                            <div className="lg:col-span-2 flex flex-col h-full">
                                <ChartCard 
                                    title="Diagnostic Audit Log"
                                    tooltip={
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-slate-200 font-semibold mb-1">Historical Ledger</span>
                                            <span>A raw breakdown of calculated impact telemetry for every version jump.</span>
                                            <span className="text-sky-300 bg-sky-400/10 p-1.5 rounded mt-1 border border-sky-400/20">
                                                Use this tabular data to identify exact commits where coupling spiked or the blast radius expanded dangerously.
                                            </span>
                                        </div>
                                    }
                                >
                                    <div className="absolute inset-0 overflow-y-auto pr-2 custom-scrollbar">
                                        <table className="w-full text-left text-sm text-slate-300">
                                            <thead className="sticky top-0 bg-slate-800 shadow-sm z-10">
                                                <tr className="text-slate-400 border-b border-slate-700">
                                                    <th className="py-3 px-3 font-semibold rounded-tl-lg">Version</th>
                                                    <th className="py-3 px-3 font-semibold">Affected Nodes</th>
                                                    <th className="py-3 px-3 font-semibold">Risk Factor</th>
                                                    <th className="py-3 px-3 font-semibold rounded-tr-lg">Coupling</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/50">
                                                {fullMetrics.map((row, i) => (
                                                    <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                                                        <td className="py-3 px-3 font-semibold text-white">{row.deltaLabel || row.version}</td>
                                                        <td className="py-3 px-3 text-rose-400 font-mono">{row.affected}</td>
                                                        <td className="py-3 px-3 text-amber-400 font-mono">{row.riskScore}</td>
                                                        <td className="py-3 px-3 text-indigo-400 font-mono">{row.coupling}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </ChartCard>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/* UI HELPER COMPONENTS & ICONS */

const Icons = {
    Box: (props: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>,
    Network: (props: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>,
    Scale: (props: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 14h18"></path><path d="M4 14l3-9 3 9"></path><path d="M14 14l3-9 3 9"></path><path d="M12 2v20"></path><path d="M8 22h8"></path></svg>,
    Activity: (props: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>,
    Alert: (props: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
    Close: (props: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>,
    Refresh: (props: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
};

const ChartCard = ({ title, children, action, tooltip }: any) => (
    <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-5 flex flex-col shadow-sm">
        <div className="flex justify-between items-center mb-4">
            <div className="group relative flex items-center cursor-help z-50">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 border-b border-slate-500/50 border-dashed pb-0.5">
                    {title}
                </h3>
                
                {/* Chart Tooltip */}
                {tooltip && (
                    <div className="absolute top-full left-0 mt-3 w-64 p-3 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 -translate-y-1 group-hover:translate-y-0 z-[100] text-xs text-slate-300 font-medium leading-relaxed normal-case tracking-normal">
                        <div className="absolute bottom-full left-6 border-4 border-transparent border-b-slate-600"></div>
                        {tooltip}
                    </div>
                )}
            </div>
            
            {action}
        </div>
        <div className="flex-1 w-full relative min-h-[220px] z-0">{children}</div>
    </div>
);

const KPICard = ({ title, value, Icon, color, sub, tooltip }: any) => (
    <div className="group relative bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:bg-slate-800/60 transition-colors hover:z-50">
        
        {tooltip && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-56 p-2.5 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 -translate-y-1 group-hover:translate-y-0 z-[100] text-[11px] text-slate-300 font-medium leading-relaxed text-center normal-case tracking-normal">
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-slate-600"></div>
                {tooltip}
            </div>
        )}

        <div className="flex justify-between items-start mb-2 cursor-help">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-500/50 border-dashed pb-0.5">
                {title}
            </span>
            <Icon className={`w-5 h-5 opacity-80 ${color}`} />
        </div>
        
        <div className={`text-4xl font-bold ${color} tracking-tight mt-1`}>{value || 0}</div>
        {sub && <span className="text-xs text-slate-500 mt-2 font-medium">{sub}</span>}
    </div>
);

/* RESPONSIVE SVG CHARTS */

const SVGAreaChart = ({ data, keys, colors }: any) => {
    if (!data || data.length === 0) return null;
    const padding = 35, width = 600, height = 240;
    const maxVal = Math.max(...data.flatMap((d: any) => keys.map((k: any) => d[k])), 5);
    const xStep = (width - padding * 2) / Math.max(data.length - 1, 1);

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            {[0, 0.5, 1].map(p => <line key={p} x1={padding} y1={padding + p * (height - padding * 2)} x2={width - padding} y2={padding + p * (height - padding * 2)} stroke="#334155" strokeDasharray="4 4" opacity={0.6} />)}
            {keys.map((key: string, kIdx: number) => {
                const pts = data.map((d: any, i: number) => ({ x: padding + i * xStep, y: height - padding - (d[key] / maxVal) * (height - padding * 2) }));
                const dPath = pts.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                const areaPath = `${dPath} L ${pts[pts.length - 1].x} ${height - padding} L ${pts[0].x} ${height - padding} Z`;
                return (
                    <g key={kIdx}>
                        <path d={areaPath} fill={colors[kIdx]} opacity={0.15} />
                        <path d={dPath} fill="none" stroke={colors[kIdx]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                        {pts.map((p: any, i: number) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#0f172a" stroke={colors[kIdx]} strokeWidth={2} />)}
                    </g>
                );
            })}
            {data.map((d: any, i: number) => <text key={i} x={padding + i * xStep} y={height - 10} fill="#94a3b8" fontSize={11} fontWeight="500" textAnchor="middle">{d.version}</text>)}
        </svg>
    );
};

const SVGBarChart = ({ data, dataKey, color }: any) => {
    if (!data || data.length === 0) return null;
    const padding = 35, width = 600, height = 240;
    const maxVal = Math.max(...data.map((d: any) => d[dataKey]), 1);
    const barWidth = 24;
    const xStep = (width - padding * 2) / Math.max(data.length - 1, 1);

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            {[0, 0.5, 1].map(p => <line key={p} x1={padding} y1={padding + p * (height - padding * 2)} x2={width - padding} y2={padding + p * (height - padding * 2)} stroke="#334155" strokeDasharray="4 4" opacity={0.6} />)}
            {data.map((d: any, i: number) => {
                const x = padding + i * xStep;
                const barHeight = (d[dataKey] / maxVal) * (height - padding * 2);
                return (
                    <g key={i} className="group cursor-default">
                        <rect x={x - barWidth/2} y={height - padding - barHeight} width={barWidth} height={Math.max(barHeight, 2)} fill={color} opacity={0.8} rx={3} className="hover:opacity-100 transition-opacity" />
                        <text x={x} y={height - padding - barHeight - 8} fill={color} fontSize={11} fontWeight="bold" textAnchor="middle" className="opacity-0 group-hover:opacity-100 transition-opacity">{d[dataKey]}</text>
                        <text x={x} y={height - 10} fill="#94a3b8" fontSize={11} fontWeight="500" textAnchor="middle">{d.deltaLabel || d.version}</text>
                    </g>
                );
            })}
        </svg>
    );
};

const SVGLineChart = ({ data, dataKey, color, fill }: any) => {
    if (!data || data.length === 0) return null;
    const padding = 35, width = 600, height = 240;
    const maxVal = Math.max(...data.map((d: any) => d[dataKey]), 1);
    const xStep = (width - padding * 2) / Math.max(data.length - 1, 1);
    const pts = data.map((d: any, i: number) => ({ x: padding + i * xStep, y: height - padding - (d[dataKey] / maxVal) * (height - padding * 2) }));
    const dPath = pts.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${dPath} L ${pts[pts.length - 1].x} ${height - padding} L ${pts[0].x} ${height - padding} Z`;

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            {[0, 0.5, 1].map(p => <line key={p} x1={padding} y1={padding + p * (height - padding * 2)} x2={width - padding} y2={padding + p * (height - padding * 2)} stroke="#334155" strokeDasharray="4 4" opacity={0.6} />)}
            <path d={areaPath} fill={fill} />
            <path d={dPath} fill="none" stroke={color} strokeWidth={2.5} />
            {pts.map((p: any, i: number) => (
                <g key={i}>
                    <circle cx={p.x} cy={p.y} r={4.5} fill="#0f172a" stroke={color} strokeWidth={2} />
                    <text x={p.x} y={p.y - 12} fill="#fff" fontSize={11} fontWeight="600" textAnchor="middle" className="opacity-90">{data[i][dataKey]}</text>
                    <text x={p.x} y={height - 10} fill="#94a3b8" fontSize={11} fontWeight="500" textAnchor="middle">{data[i].version}</text>
                </g>
            ))}
        </svg>
    );
};

const SVGStickChart = ({ data }: any) => {
    if (!data || data.length === 0) return null;
    const padding = 40, width = 1100, height = 250;
    const maxVal = Math.max(...data.map((d: any) => d.coupling), 4);
    const xStep = (width - padding * 2) / Math.max(data.length - 1, 1);

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
            <line x1={padding} y1={height - padding - (2.5 / maxVal) * (height - padding * 2)} x2={width - padding} y2={height - padding - (2.5 / maxVal) * (height - padding * 2)} stroke="#f43f5e" strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
            <text x={width - padding} y={height - padding - (2.5 / maxVal) * (height - padding * 2) - 8} fill="#f43f5e" fontSize={11} fontWeight="600" textAnchor="end" opacity={0.9}>THRESHOLD (2.5)</text>
            {data.map((d: any, i: number) => {
                const x = padding + i * xStep, topY = height - padding - (d.coupling / maxVal) * (height - padding * 2);
                return (
                    <g key={i} className="group">
                        <line x1={x} y1={height - padding} x2={x} y2={topY} stroke={d.coupling > 2.5 ? '#f43f5e' : '#f59e0b'} strokeWidth={4} strokeLinecap="round" opacity={0.9} />
                        <circle cx={x} cy={topY} r={6} fill={d.coupling > 2.5 ? '#f43f5e' : '#f59e0b'} className="group-hover:r-[8px] transition-all" />
                        <text x={x} y={topY - 14} fill="#fff" fontSize={12} fontWeight="bold" textAnchor="middle" className="opacity-0 group-hover:opacity-100 transition-opacity">{d.coupling}</text>
                        <text x={x} y={height - 15} fill="#94a3b8" fontSize={11} fontWeight="500" textAnchor="middle">{d.version}</text>
                    </g>
                );
            })}
        </svg>
    );
};

const SVGForecastLineChart = ({ data }: { data: any[] }) => {
    if (!data || data.length === 0) return null;
    const padding = 40, width = 1100, height = 250;
    const maxVal = Math.max(...data.map((d: any) => d.value), 5);
    const xStep = (width - padding * 2) / Math.max(data.length - 1, 1);
    
    interface ForecastPoint { x: number; y: number; isF: boolean; }

    const pts: ForecastPoint[] = data.map((d: any, i: number): ForecastPoint => ({ 
        x: padding + i * xStep, 
        y: height - padding - (d.value / maxVal) * (height - padding * 2), 
        isF: d.isForecast 
    }));
    
    const histD = pts.filter((p: ForecastPoint) => !p.isF).map((p: ForecastPoint, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const forcD = pts.filter((p: ForecastPoint, i: number) => p.isF || (i > 0 && !pts[i-1].isF)).map((p: ForecastPoint, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
            {[0, 0.25, 0.5, 0.75, 1].map(p => <line key={p} x1={padding} y1={padding + p * (height - padding * 2)} x2={width - padding} y2={padding + p * (height - padding * 2)} stroke="#334155" strokeDasharray="4 4" opacity={0.4} />)}
            {histD && <path d={histD} fill="none" stroke="#6366f1" strokeWidth={2.5} />}
            {forcD && <path d={forcD} fill="none" stroke="#f97316" strokeWidth={2.5} strokeDasharray="6 4" opacity={0.9} />}
            {pts.map((p: ForecastPoint, i: number) => (
                <g key={i}>
                    <circle cx={p.x} cy={p.y} r={4.5} fill="#0f172a" stroke={p.isF ? '#f97316' : '#6366f1'} strokeWidth={2} />
                    <text x={p.x} y={p.y - 12} fill="#fff" fontSize={11} fontWeight="600" textAnchor="middle" className="opacity-90">{data[i].value.toFixed(1)}</text>
                    <text x={p.x} y={height - 12} fill="#94a3b8" fontSize={11} fontWeight="500" textAnchor="middle">{data[i].version}</text>
                </g>
            ))}
        </svg>
    );
};

const SVGDoughnutChart = ({ values, colors }: any) => {
    const total = values.reduce((a: number, b: number) => a + (b || 0), 0);
    if (total === 0) return null;
    let acc = 0;
    return (
        <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90">
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="#1e293b" strokeWidth={4.5} />
            {values.map((v: number, i: number) => {
                if (!v) return null;
                const pct = (v / total) * 100, offset = 100 - acc;
                acc += pct;
                return <circle key={i} cx="21" cy="21" r="15.915" fill="none" stroke={colors[i]} strokeWidth={4.5} strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={offset} strokeLinecap="round" />;
            })}
        </svg>
    );
};