import React, { useMemo } from 'react';

interface ArchitectureTrendDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    graphTimeline: Array<any>;
}

export const ArchitectureTrendDashboard: React.FC<ArchitectureTrendDashboardProps> = ({ isOpen, onClose, graphTimeline }) => {
    
    const trendData = useMemo(() => {
        if (!graphTimeline || graphTimeline.length === 0) return [];

        return graphTimeline.map((ir, index) => {
            // Robust extraction depending on how your IR represents nodes and edges
            const nodes = ir.nodes?.length || ir.microservices?.length || ir.components?.length || 0;
            const edges = ir.links?.length || ir.edges?.length || ir.connections?.length || 0;
            
            // Coupling factor: Average number of dependencies per service
            const coupling = nodes > 0 ? Number((edges / nodes).toFixed(2)) : 0;

            return {
                version: `V${index + 1}`,
                date: ir.metadata?.modifyDate || ir.metadata?.[0]?.modifyDate,
                nodes,
                edges,
                coupling
            };
        });
    }, [graphTimeline]);

    if (!isOpen) return null;

    // Helper to calculate max values for chart scaling
    const maxNodes = Math.max(...trendData.map(d => d.nodes), 1);
    const maxEdges = Math.max(...trendData.map(d => d.edges), 1);
    const maxCoupling = Math.max(...trendData.map(d => d.coupling), 1);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8">
            {/* Dark Overlay */}
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose}></div>

            {/* Dashboard Modal */}
            <div className="relative w-full max-w-7xl h-[90vh] bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl flex flex-col overflow-hidden">
                
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-900/50">
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-wide">Architectural Evolution Trends</h2>
                        <p className="text-slate-400 text-sm mt-1">Analyzing metrics across {graphTimeline.length} pipeline iterations</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-300 rounded-lg transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Dashboard Content (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    
                    {/* Trend 1: Service Growth (Nodes) */}
                    <TrendSection 
                        title="Service Footprint (Total Nodes/Microservices)" 
                        color="bg-cyan-500" 
                        data={trendData} 
                        dataKey="nodes" 
                        maxValue={maxNodes} 
                    />

                    {/* Trend 2: Dependency Sprawl (Edges) */}
                    <TrendSection 
                        title="Dependency Sprawl (Total Connections)" 
                        color="bg-indigo-500" 
                        data={trendData} 
                        dataKey="edges" 
                        maxValue={maxEdges} 
                    />

                    {/* Trend 3: Architectural Coupling */}
                    <TrendSection 
                        title="System Coupling Factor (Dependencies per Node)" 
                        color="bg-orange-500" 
                        data={trendData} 
                        dataKey="coupling" 
                        maxValue={maxCoupling} 
                        isFloat 
                    />

                </div>
            </div>
        </div>
    );
};

// Internal helper component to render a bar chart row
const TrendSection = ({ title, color, data, dataKey, maxValue, isFloat = false }: any) => {
    return (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-slate-200 mb-6">{title}</h3>
            
            <div className="flex items-end h-48 gap-2 sm:gap-4 w-full">
                {data.map((item: any, idx: number) => {
                    const heightPercent = maxValue > 0 ? (item[dataKey] / maxValue) * 100 : 0;
                    
                    return (
                        <div key={idx} className="relative flex flex-col items-center flex-1 group h-full justify-end">
                            {/* Tooltip */}
                            <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950 text-white text-xs py-1 px-2 rounded pointer-events-none z-10 whitespace-nowrap">
                                {item.version}: {item[dataKey]}
                            </div>
                            
                            {/* Bar */}
                            <div 
                                className={`w-full max-w-[40px] ${color} rounded-t-md opacity-80 group-hover:opacity-100 transition-all duration-300`}
                                style={{ height: `${Math.max(heightPercent, 2)}%` }} 
                            ></div>
                            
                            {/* X-Axis Label */}
                            <div className="mt-3 text-[10px] sm:text-xs text-slate-400 font-mono">
                                {item.version}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};