import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { VerificationResponse } from '../../services/api';
import getData from '../../parsers/getData'; 
import GraphWrapper from '../graph/GraphWrapper'; 
import { showError } from '../../utils/notifications';

const RoleBadge = ({ mask }: { mask: number }) => {
    let label = "Unknown";
    let color = "bg-gray-500 border-gray-400";

    // 1=Unauth, 2=User, 4=Admin, 6=User+Admin, 7=Any Auth
    switch (mask) {
        case 0: label = "None"; color = "bg-slate-600 border-slate-500"; break;
        case 1: label = "Unauthenticated"; color = "bg-gray-500 border-gray-400"; break;
        case 2: label = "User"; color = "bg-blue-600 border-blue-400"; break;
        case 4: label = "Admin"; color = "bg-purple-600 border-purple-400"; break;
        case 6: label = "User + Admin"; color = "bg-indigo-600 border-indigo-400"; break;
        case 7: label = "Any Authenticated"; color = "bg-cyan-600 border-cyan-400"; break;
        default: label = `Mask ${mask}`; break;
    }

    return (
        <div className={`flex flex-col items-center justify-center w-32 py-1.5 rounded-lg border shadow-sm ${color} bg-opacity-20`}>
             <span className="text-[10px] opacity-70 uppercase tracking-widest font-bold mb-0.5">Role {mask}</span>
             <span className="text-xs font-bold text-white text-center px-1 leading-tight">{label}</span>
        </div>
    );
};

// ----------------------------------------------------------------------
// Main Page Component
// ----------------------------------------------------------------------
const VerificationResultPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    
    // Retrieve data passed from the Landing Page
    const result = location.state?.result as VerificationResponse;
    const systemInfo = location.state?.systemInfo;
    const fromPipeline = location.state?.fromPipeline; 

    // View State: 'results' or 'graph'
    const [viewMode, setViewMode] = useState<'results' | 'graph'>('results');
    
    // Graph State (Required for GraphWrapper interactivity)
    const graphRef = useRef<any>();
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [isHighLevelExpanded, setIsHighLevelExpanded] = useState(false);
    const [focusNode, setFocusNode] = useState(null);
    const [search, setSearch] = useState("");
    const [trackNodes, setTrackNodes] = useState<any[]>([]);

    // Process Graph Data
    const graphData = useMemo(() => {
        if (!systemInfo?.ir) return null;
        try {
            return getData(systemInfo.ir, undefined);
        } catch (e) {
            showError("Could not generate graph from IR.");
            return null;
        }
    }, [systemInfo]);

    const handleBack = () => {
        if (fromPipeline) {
            navigate('/pipeline');
        } else {
            navigate('/');
        }
    };

    // Safety check if user navigates here directly without state
    if (!result) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center flex-col text-white gap-4">
                <h1 className="text-2xl font-bold">No Verification Results</h1>
                <p className="text-slate-400">Please run verification from the dashboard first.</p>
                <button onClick={() => navigate('/')} className="px-6 py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-500 transition-colors">
                    Return Home
                </button>
            </div>
        );
    }

    const isSat = result.status === "SAT";

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col">
            
            {/* Header / Navbar */}
            <div className="bg-slate-800/50 border-b border-slate-700 p-4 sticky top-0 z-50 backdrop-blur-md">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <button onClick={handleBack} className="text-slate-400 hover:text-white flex items-center gap-2 text-sm font-bold transition-colors">
                            ← Back {fromPipeline ? 'to Pipeline' : ''}
                        </button>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            Verification: {systemInfo?.systemName}
                            <span className={`text-sm px-2 py-0.5 rounded border ${isSat ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-red-500/20 text-red-400 border-red-500/50'}`}>
                                {result.status}
                            </span>
                        </h1>
                    </div>

                    {/* VIEW TOGGLE - Only show if UNSAT (Graph is most useful for debugging failures) */}
                    {!isSat && (
                        <div className="bg-slate-900/80 p-1 rounded-lg border border-slate-600 flex gap-1">
                            <button
                                onClick={() => setViewMode('results')}
                                className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${
                                    viewMode === 'results' 
                                    ? 'bg-slate-700 text-white shadow' 
                                    : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                List View
                            </button>
                            <button
                                onClick={() => setViewMode('graph')}
                                className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${
                                    viewMode === 'graph' 
                                    ? 'bg-red-600 text-white shadow shadow-red-500/20' 
                                    : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                3D Graph Analysis
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 relative h-full">
                
                {/* MODE A: RESULTS LIST */}
                {viewMode === 'results' && (
                    <div className="p-6 md:p-10 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
                        
                        {/* Left Column: Logs */}
                        <div className="lg:col-span-1 flex flex-col gap-6">
                             <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden flex flex-col h-[600px] shadow-xl">
                                <div className="bg-slate-900/50 p-4 border-b border-slate-700">
                                    <h3 className="font-bold text-slate-300">Solver Logs</h3>
                                </div>
                                <div className="flex-1 bg-black p-4 font-mono text-xs overflow-y-auto custom-scrollbar">
                                    {result.logs.map((log, i) => (
                                        <div key={i} className="mb-1 text-emerald-400/90 border-b border-slate-800/30 pb-1 break-words">
                                            {log}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Suggestions or Success */}
                        <div className="lg:col-span-2">
                        {isSat ? (
                            <div className="h-full bg-green-900/10 border border-green-500/20 rounded-3xl p-12 text-center flex flex-col items-center justify-center shadow-2xl">
                                <div className="w-32 h-32 bg-green-500 rounded-full flex items-center justify-center mb-8 shadow-2xl shadow-green-500/30 animate-pulse-slow">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h2 className="text-4xl font-extrabold text-white mb-4">Policy Consistent</h2>
                                <p className="text-green-200 text-xl max-w-lg leading-relaxed">
                                    The authorization policy is consistent and no violations were found.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-6">
                                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex items-center gap-4">
                                    <div className="p-3 bg-red-500/20 rounded-full text-red-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">Policy Inconsistent</h3>
                                        <p className="text-red-200 text-sm">The optimizer found {result.suggestions.length} constraint violations. Apply the suggestions below to fix the policy.</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {result.suggestions.map((sugg, idx) => (
                                        <div key={idx} className="bg-slate-800 rounded-xl border border-slate-700 p-6 shadow-lg hover:shadow-2xl hover:border-slate-600 transition-all duration-300 relative overflow-hidden group">
                                            
                                            {/* Colored Side Bar */}
                                            <div className={`absolute top-0 left-0 w-1.5 h-full ${
                                                sugg.endpoint_name.includes('GET') ? 'bg-blue-500' :
                                                sugg.endpoint_name.includes('POST') ? 'bg-green-500' :
                                                sugg.endpoint_name.includes('DELETE') ? 'bg-red-500' : 'bg-orange-500'
                                            }`}></div>

                                            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between pl-4">
                                                
                                                {/* Left: Endpoint Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <span className={`text-xs font-black px-2 py-1 rounded uppercase tracking-wide
                                                            ${sugg.endpoint_name.includes('GET') ? 'bg-blue-900/50 text-blue-300 border border-blue-500/30' :
                                                            sugg.endpoint_name.includes('POST') ? 'bg-green-900/50 text-green-300 border border-green-500/30' :
                                                            sugg.endpoint_name.includes('DELETE') ? 'bg-red-900/50 text-red-300 border border-red-500/30' : 
                                                            'bg-orange-900/50 text-orange-300 border border-orange-500/30'}`}>
                                                            {sugg.endpoint_name.split(' ')[0]}
                                                        </span>
                                                        <span className="font-mono text-sm text-white truncate font-medium">
                                                            {sugg.endpoint_name.split(' ').slice(1).join(' ')}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-slate-400 leading-relaxed">{sugg.description}</p>
                                                </div>

                                                {/* Right: Transformation Arrow */}
                                                <div className="flex items-center gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-700 shrink-0">
                                                    <RoleBadge mask={sugg.current_role_mask} />
                                                    
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                                    </svg>

                                                    <RoleBadge mask={sugg.suggested_role_mask} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        </div>
                    </div>
                )}

                {/* MODE B: 3D GRAPH VISUALIZATION */}
                {viewMode === 'graph' && graphData && (
                    <div className="absolute inset-0 w-full h-full bg-slate-900">
                        <div className="absolute top-4 left-4 z-10 bg-slate-800/90 backdrop-blur border border-slate-600 p-4 rounded-xl shadow-2xl max-w-xs pointer-events-none select-none">
                            <h3 className="text-red-400 font-bold mb-2 flex items-center gap-2">
                                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                                UNSAT Suggestions
                            </h3>
                            <p className="text-xs text-slate-300 mb-4">
                                Red nodes represent endpoints that violate authorization policy consistency.
                                <br/>Labels show [Current → Suggested] roles.
                            </p>
                            <div className="text-xs text-slate-500 border-t border-slate-700 pt-2">
                                Drag to rotate • Scroll to zoom <br/> Double click nodes to expand
                            </div>
                        </div>

                        <GraphWrapper
                            width={window.innerWidth}
                            height={window.innerHeight - 80} // approximate header height
                            graphRef={graphRef}
                            graphData={graphData}
                            verificationSuggestions={result.suggestions} 
                            
                            // Interactive State Props
                            expandedNodes={expandedNodes}
                            setExpandedNodes={setExpandedNodes}
                            isHighLevelExpanded={isHighLevelExpanded}
                            focusNode={focusNode}
                            search={search}
                            trackNodes={trackNodes}

                            // Defaults
                            threshold={8}
                            setInitCoords={() => {}}
                            setInitRotation={() => {}}
                            is3d={true}
                            antiPattern={false}
                            colorMode="dark-default"
                            defNodeColor={false}
                            setDefNodeColor={() => {}}
                            setGraphData={() => {}}
                            isDarkMode={true}
                            selectedAntiPattern="none"
                            endpointCalls={[]}
                            trackChanges={false}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default VerificationResultPage;