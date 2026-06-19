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
    
    // API State
    const [deltaMetrics, setDeltaMetrics] = useState<any[]>([]);
    const [isLoadingDeltas, setIsLoadingDeltas] = useState(false);

    // 1. BULLETPROOF IR EXTRACTION (Recursive Deep-Crawler)
    const computedMetrics = useMemo(() => {
        if (!graphTimeline || graphTimeline.length === 0) return [];

        return graphTimeline.map((rawIr, index) => {
            const ir = rawIr?.payload?.irJson || rawIr?.data?.payload?.irJson || rawIr?.systemInfo?.ir || rawIr;
            
            const nodesArray = ir.nodes || ir.microservices || ir.components || ir.services || [];
            let edgesArray = ir.links || ir.edges || ir.connections || ir.dependencies || [];
            
            // 🛡️ THE BRUTE-FORCE CRAWLER: Zero-schema dependency hunting
            if (edgesArray.length === 0 && nodesArray.length > 0) {
                const derivedEdges = new Set<string>();

                // Step 1: Collect an exact list of every microservice name in the ecosystem
                const knownServices = nodesArray
                    .map((n: any) => n.name || n.nodeName || n.id)
                    .filter(Boolean);

                // Step 2: Scan every single node's entire JSON footprint
                nodesArray.forEach((sourceNode: any) => {
                    const sourceName = sourceNode.name || sourceNode.nodeName || sourceNode.id;
                    if (!sourceName) return;

                    // Serialize the entire AST/Config of this microservice into a searchable string
                    const rawString = JSON.stringify(sourceNode);

                    knownServices.forEach((targetName: string) => {
                        // If the source mentions the target anywhere (e.g., in a RestTemplate URL 
                        // like "http://ts-auth-service:12345/"), it is an architectural dependency!
                        if (sourceName !== targetName && rawString.includes(targetName)) {
                            derivedEdges.add(`${sourceName}___${targetName}`);
                        }
                    });
                });

                // Convert our deduplicated Set back into standard edge objects
                edgesArray = Array.from(derivedEdges).map(edgeStr => {
                    const [source, target] = edgeStr.split('___');
                    return { source, target };
                });
            }

            const nodes = nodesArray.length;
            const edges = edgesArray.length;
            
            // Re-calculate the architecture metrics now that we have edges!
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

    // 2. BATCH FETCH CHANGE IMPACT API
    useEffect(() => {
        if (!isOpen || graphTimeline.length < 2) return;
        
        let isMounted = true;

        const fetchAllDeltas = async () => {
            setIsLoadingDeltas(true);
            const results = new Array(graphTimeline.length).fill({ affected: 0, changes: 0 });
            
            // 🛡️ Bulletproof Repository Extractor
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

            // 🛡️ FIX: Run sequentially instead of Promise.all. 
            // This prevents the backend race condition WITHOUT mutating the database ID!
            for (let i = 1; i < graphTimeline.length; i++) {
                if (!isMounted) break;

                const prev = graphTimeline[i - 1];
                const curr = graphTimeline[i];
                const sysName = prev.name || curr.name || prev.systemName || "system";
                
                const deltaInput = {
                    id: prev.id || prev._id || `req-${i}`, // Use the REAL ID so the backend doesn't reject it
                    systemName: sysName,
                    systemRepositories: extractRepositories(prev),
                    comparingRepositories: extractRepositories(curr)
                };

                try {
                    const res = await fetchChangeImpact(deltaInput);
                    
                    // Safely extract the changes array
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
                    console.error(`Failed to fetch delta for V${i} -> V${i+1}:`, error);
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

    // 3. COMBINE METRICS WITH DELTAS
    const fullMetrics = useMemo(() => {
        return computedMetrics.map((m, i) => ({
            ...m,
            deltaLabel: i === 0 ? 'Baseline' : `V${i} → V${i+1}`,
            affected: deltaMetrics[i]?.affected || 0,
            fileChanges: deltaMetrics[i]?.changes || 0,
            riskScore: Number((m.coupling * (deltaMetrics[i]?.affected || 1)).toFixed(2)) // Custom Risk Metric
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
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={onClose}></div>

            <div className="relative w-full max-w-[95vw] lg:max-w-[85vw] h-[92vh] bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl flex flex-col overflow-hidden text-slate-100">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-center p-5 border-b border-slate-800 bg-slate-950/60 shadow-md z-10">
                    <div>
                        <h2 className="text-2xl font-black tracking-wide bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
                            Architecture Intelligence Center
                        </h2>
                        <div className="flex items-center gap-3 mt-1">
                            <p className="text-slate-400 text-xs">Analyzed {graphTimeline.length} Versions</p>
                            {isLoadingDeltas && <span className="text-xs text-orange-400 animate-pulse border border-orange-500/30 px-2 py-0.5 rounded bg-orange-500/10">⚙️ Processing API Deltas...</span>}
                        </div>
                    </div>
                    
                    <div className="flex bg-slate-800/80 border border-slate-700/80 rounded-xl p-1 shadow-inner">
                        {(['overview', 'impact', 'coupling', 'forecasting', 'composition'] as TabType[]).map((tab) => (
                            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-[11px] font-bold tracking-widest uppercase rounded-lg transition-all ${ activeTab === tab ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200' }`}>
                                {tab}
                            </button>
                        ))}
                    </div>
                    
                    <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition-all border border-slate-700/50">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-900/50">
                    
                    {/* Top KPI Stats */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        <KPICard title="Total Microservices" value={latest?.nodes} icon="📦" color="text-sky-400" />
                        <KPICard title="System Dependencies" value={latest?.edges} icon="🔗" color="text-indigo-400" />
                        <KPICard title="Coupling Factor" value={latest?.coupling} icon="⚖️" color="text-orange-400" />
                        <KPICard title="Cumulative Affected" value={fullMetrics.reduce((a, b) => a + b.affected, 0)} icon="🔥" color="text-rose-400" sub="across all versions" />
                        <KPICard title="Structural Risk Score" value={latest?.riskScore} icon="⚠️" color="text-amber-400" />
                    </div>

                    {activeTab === 'overview' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ChartCard title="Structural Growth vs Dependencies">
                                <div className="flex justify-center gap-6 text-[10px] uppercase font-bold text-slate-400 mb-2 mt-[-10px]">
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#38bdf8]"></div> Total Nodes</div>
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#6366f1]"></div> Total Dependencies</div>
                                </div>
                                <SVGAreaChart data={fullMetrics} keys={['nodes', 'edges']} colors={['#38bdf8', '#6366f1']} />
                            </ChartCard>
                            
                            <ChartCard title="Risk Accumulation Trend">
                                <div className="flex justify-center gap-6 text-[10px] uppercase font-bold text-slate-400 mb-2 mt-[-10px]">
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#f59e0b] shadow-[0_0_8px_#f59e0b]"></div> Structural Risk Score</div>
                                </div>
                                <SVGLineChart data={fullMetrics} dataKey="riskScore" color="#f59e0b" fill="#f59e0b20" />
                            </ChartCard>
                        </div>
                    )}

                    {activeTab === 'impact' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ChartCard title="Impact Velocity (Affected Services per Version)">
                                <SVGBarChart data={fullMetrics} dataKey="affected" color="#f43f5e" />
                            </ChartCard>

                            <ChartCard title="File Change Magnitude (Churn Rate)">
                                <SVGBarChart data={fullMetrics} dataKey="fileChanges" color="#10b981" />
                            </ChartCard>
                        </div>
                    )}

                    {activeTab === 'coupling' && (
                        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-6">System Coupling Distribution Matrix</h3>
                            <div className="h-72"><SVGStickChart data={fullMetrics} /></div>
                        </div>
                    )}

                    {activeTab === 'forecasting' && (
                        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">AI Linear Forecasting Models</h3>
                                <div className="flex gap-2 bg-slate-900 p-1 rounded-lg">
                                    {(['nodes', 'edges', 'coupling', 'affected'] as const).map(m => (
                                        <button key={m} onClick={() => setSelectedMetric(m)} className={`px-3 py-1 text-xs uppercase font-bold rounded ${selectedMetric === m ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'}`}>{m}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="h-72"><SVGForecastLineChart data={forecastData} /></div>
                        </div>
                    )}

                    {activeTab === 'composition' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <ChartCard title="Topological Risk Roles (Latest Version)">
                                <div className="flex flex-col sm:flex-row items-center justify-around h-full py-6">
                                    <div className="w-48 h-48">
                                        <SVGDoughnutChart values={[latest?.hubsCount, latest?.internalCount, latest?.leafCount]} colors={['#f43f5e', '#38bdf8', '#10b981']} />
                                    </div>
                                    <div className="flex flex-col gap-4 text-sm font-bold font-mono">
                                        <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-rose-500 shadow-[0_0_10px_#f43f5e]"></div> Critical Hubs: {latest?.hubsCount}</div>
                                        <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-sky-400 shadow-[0_0_10px_#38bdf8]"></div> Core Nodes: {latest?.internalCount}</div>
                                        <div className="flex items-center gap-3"><div className="w-4 h-4 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></div> Endpoints: {latest?.leafCount}</div>
                                    </div>
                                </div>
                            </ChartCard>

                            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 flex flex-col">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-4">Version Diagnostics Log</h3>
                                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                    <table className="w-full text-left text-[11px] text-slate-300 font-mono">
                                        <thead className="bg-slate-900/80 sticky top-0">
                                            <tr className="text-slate-500 uppercase tracking-wider">
                                                <th className="p-3">Ver</th>
                                                <th className="p-3 text-rose-400">Affected</th>
                                                <th className="p-3 text-orange-400">Risk</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {fullMetrics.map((row, i) => (
                                                <tr key={i} className="hover:bg-slate-800 transition-colors">
                                                    <td className="p-3 font-bold text-white">{row.version}</td>
                                                    <td className="p-3 text-rose-300">{row.affected} svcs</td>
                                                    <td className="p-3 text-orange-300">{row.riskScore}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/* ==========================================================================
   UI HELPER COMPONENTS
   ========================================================================== */
const KPICard = ({ title, value, icon, color, sub }: any) => (
    <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-5 flex flex-col justify-between shadow-lg">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</span>
        <div className="flex items-baseline gap-3 mt-3">
            <span className={`text-4xl font-black ${color} tracking-tighter`}>{value || 0}</span>
            <span className="text-xl opacity-80">{icon}</span>
        </div>
        {sub && <span className="text-[10px] text-slate-500 mt-2 uppercase">{sub}</span>}
    </div>
);

const ChartCard = ({ title, children }: any) => (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 flex flex-col shadow-lg">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-6">{title}</h3>
        <div className="flex-1 w-full relative min-h-[250px]">{children}</div>
    </div>
);

/* ==========================================================================
   PURE RESPONSIVE SVG CHARTS
   ========================================================================== */

// DUAL AREA CHART
const SVGAreaChart = ({ data, keys, colors }: any) => {
    if (!data || data.length === 0) return null;
    const padding = 30, width = 600, height = 220;
    const maxVal = Math.max(...data.flatMap((d: any) => keys.map((k: any) => d[k])), 5);
    const xStep = (width - padding * 2) / Math.max(data.length - 1, 1);

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            {[0, 0.5, 1].map(p => <line key={p} x1={padding} y1={padding + p * (height - padding * 2)} x2={width - padding} y2={padding + p * (height - padding * 2)} stroke="#334155" strokeDasharray="4 4" />)}
            {keys.map((key: string, kIdx: number) => {
                const pts = data.map((d: any, i: number) => ({ x: padding + i * xStep, y: height - padding - (d[key] / maxVal) * (height - padding * 2) }));
                const dPath = pts.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                const areaPath = `${dPath} L ${pts[pts.length - 1].x} ${height - padding} L ${pts[0].x} ${height - padding} Z`;
                return (
                    <g key={kIdx}>
                        <path d={areaPath} fill={colors[kIdx]} opacity={0.15} />
                        <path d={dPath} fill="none" stroke={colors[kIdx]} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                        {pts.map((p: any, i: number) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#0f172a" stroke={colors[kIdx]} strokeWidth={2} />)}
                    </g>
                );
            })}
            {data.map((d: any, i: number) => <text key={i} x={padding + i * xStep} y={height - 10} fill="#94a3b8" fontSize={10} textAnchor="middle">{d.version}</text>)}
        </svg>
    );
};

// BAR CHART
const SVGBarChart = ({ data, dataKey, color }: any) => {
    if (!data || data.length === 0) return null;
    const padding = 30, width = 600, height = 220;
    const maxVal = Math.max(...data.map((d: any) => d[dataKey]), 1);
    const barWidth = 24;
    const xStep = (width - padding * 2) / Math.max(data.length - 1, 1);

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            {[0, 0.5, 1].map(p => <line key={p} x1={padding} y1={padding + p * (height - padding * 2)} x2={width - padding} y2={padding + p * (height - padding * 2)} stroke="#334155" strokeDasharray="4 4" />)}
            {data.map((d: any, i: number) => {
                const x = padding + i * xStep;
                const barHeight = (d[dataKey] / maxVal) * (height - padding * 2);
                return (
                    <g key={i} className="group">
                        <rect x={x - barWidth/2} y={height - padding - barHeight} width={barWidth} height={Math.max(barHeight, 2)} fill={color} opacity={0.8} rx={4} className="hover:opacity-100 transition-opacity" />
                        <text x={x} y={height - padding - barHeight - 8} fill={color} fontSize={10} fontWeight="bold" textAnchor="middle" className="opacity-0 group-hover:opacity-100">{d[dataKey]}</text>
                        <text x={x} y={height - 10} fill="#94a3b8" fontSize={10} textAnchor="middle">{d.deltaLabel || d.version}</text>
                    </g>
                );
            })}
        </svg>
    );
};

// LINE CHART
const SVGLineChart = ({ data, dataKey, color, fill }: any) => {
    if (!data || data.length === 0) return null;
    const padding = 30, width = 600, height = 220;
    const maxVal = Math.max(...data.map((d: any) => d[dataKey]), 1);
    const xStep = (width - padding * 2) / Math.max(data.length - 1, 1);
    const pts = data.map((d: any, i: number) => ({ x: padding + i * xStep, y: height - padding - (d[dataKey] / maxVal) * (height - padding * 2) }));
    const dPath = pts.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = `${dPath} L ${pts[pts.length - 1].x} ${height - padding} L ${pts[0].x} ${height - padding} Z`;

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            <path d={areaPath} fill={fill} />
            <path d={dPath} fill="none" stroke={color} strokeWidth={3} />
            {pts.map((p: any, i: number) => (
                <g key={i}>
                    <circle cx={p.x} cy={p.y} r={5} fill="#0f172a" stroke={color} strokeWidth={2} />
                    <text x={p.x} y={p.y - 12} fill="#fff" fontSize={10} textAnchor="middle">{data[i][dataKey]}</text>
                    <text x={p.x} y={height - 10} fill="#94a3b8" fontSize={10} textAnchor="middle">{data[i].version}</text>
                </g>
            ))}
        </svg>
    );
};

// STICK CHART
const SVGStickChart = ({ data }: any) => {
    if (!data || data.length === 0) return null;
    const padding = 40, width = 1100, height = 240;
    const maxVal = Math.max(...data.map((d: any) => d.coupling), 4);
    const xStep = (width - padding * 2) / Math.max(data.length - 1, 1);

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
            <line x1={padding} y1={height - padding - (2.5 / maxVal) * (height - padding * 2)} x2={width - padding} y2={height - padding - (2.5 / maxVal) * (height - padding * 2)} stroke="#f43f5e" strokeWidth={1} strokeDasharray="6 4" />
            <text x={width - padding} y={height - padding - (2.5 / maxVal) * (height - padding * 2) - 6} fill="#f43f5e" fontSize={10} fontWeight="bold" textAnchor="end">DANGER THRESHOLD (2.5)</text>
            {data.map((d: any, i: number) => {
                const x = padding + i * xStep, topY = height - padding - (d.coupling / maxVal) * (height - padding * 2);
                return (
                    <g key={i}>
                        <line x1={x} y1={height - padding} x2={x} y2={topY} stroke={d.coupling > 2.5 ? '#f43f5e' : '#f59e0b'} strokeWidth={4} strokeLinecap="round" />
                        <circle cx={x} cy={topY} r={8} fill={d.coupling > 2.5 ? '#f43f5e' : '#f59e0b'} />
                        <text x={x} y={topY - 15} fill="#fff" fontSize={12} fontWeight="bold" textAnchor="middle">{d.coupling}</text>
                        <text x={x} y={height - 15} fill="#94a3b8" fontSize={10} textAnchor="middle">{d.version}</text>
                    </g>
                );
            })}
        </svg>
    );
};

// FORECAST LINE CHART
const SVGForecastLineChart = ({ data }: { data: any[] }) => {
    if (!data || data.length === 0) return null;
    const padding = 40, width = 1100, height = 240;
    const maxVal = Math.max(...data.map((d: any) => d.value), 5);
    const xStep = (width - padding * 2) / Math.max(data.length - 1, 1);
    
    // Explicitly define the coordinates data model for strict types
    interface ForecastPoint {
        x: number;
        y: number;
        isF: boolean;
    }

    const pts: ForecastPoint[] = data.map((d: any, i: number): ForecastPoint => ({ 
        x: padding + i * xStep, 
        y: height - padding - (d.value / maxVal) * (height - padding * 2), 
        isF: d.isForecast 
    }));
    
    const histD = pts
        .filter((p: ForecastPoint) => !p.isF)
        .map((p: ForecastPoint, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
        .join(' ');
        
    const forcD = pts
        .filter((p: ForecastPoint, i: number) => p.isF || (i > 0 && !pts[i-1].isF))
        .map((p: ForecastPoint, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
        .join(' ');

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
            {histD && <path d={histD} fill="none" stroke="#6366f1" strokeWidth={3} />}
            {forcD && <path d={forcD} fill="none" stroke="#f97316" strokeWidth={3} strokeDasharray="8 6" />}
            {pts.map((p: ForecastPoint, i: number) => (
                <g key={i}>
                    <circle cx={p.x} cy={p.y} r={5} fill="#0f172a" stroke={p.isF ? '#f97316' : '#6366f1'} strokeWidth={2} />
                    <text x={p.x} y={p.y - 12} fill="#fff" fontSize={10} textAnchor="middle">{data[i].value.toFixed(1)}</text>
                    <text x={p.x} y={height - 10} fill="#94a3b8" fontSize={10} textAnchor="middle">{data[i].version}</text>
                </g>
            ))}
        </svg>
    );
};

// DOUGHNUT CHART
const SVGDoughnutChart = ({ values, colors }: any) => {
    const total = values.reduce((a: number, b: number) => a + (b || 0), 0);
    if (total === 0) return null;
    let acc = 0;
    return (
        <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90">
            <circle cx="21" cy="21" r="15.915" fill="none" stroke="#1e293b" strokeWidth={5} />
            {values.map((v: number, i: number) => {
                if (!v) return null;
                const pct = (v / total) * 100, offset = 100 - acc;
                acc += pct;
                return <circle key={i} cx="21" cy="21" r="15.915" fill="none" stroke={colors[i]} strokeWidth={5} strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={offset} strokeLinecap="round" />;
            })}
        </svg>
    );
};