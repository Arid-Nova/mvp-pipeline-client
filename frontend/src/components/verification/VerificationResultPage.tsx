import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { VerificationResponse } from '../../services/types';
import getData from '../../parsers/getData'; 
import { FormalTour } from './tour/FormalTour';
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
    const regressionPayload = location.state?.regressionPayload;
    const fromPipeline = location.state?.fromPipeline; 

    // View State: 'results' or 'graph'
    const [viewMode, setViewMode] = useState<'results' | 'graph'>('results');
    
    // Graph State (Required for GraphWrapper interactivity)
    const graphRef = useRef<any>();
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [isHighLevelExpanded, setIsHighLevelExpanded] = useState(false);
    const [focusNode, setFocusNode] = useState(null);
    const [search, setSearch] = useState<string[]>([]);
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

    const [isTourRunning, setIsTourRunning] = useState(false);

    useEffect(() => {
        const handleStartTour = () => setIsTourRunning(true);
        window.addEventListener('trigger-formal-tour', handleStartTour);
        return () => window.removeEventListener('trigger-formal-tour', handleStartTour);
    }, []);

    // Safety check if user navigates here directly without state
    if (!result) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center flex-col text-white gap-4">
                <h1 className="text-2xl font-bold">No Verification Results</h1>
                <p className="text-slate-400">Please run verification from the dashboard first.</p>
                <button 
                    onClick={(e) => {
                        e.stopPropagation(); 
                        navigate('/');
                    }}
                    onTouchEnd={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate('/');
                    }}
                    className="px-6 py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-500 transition-colors">
                    Return Home
                </button>
            </div>
        );
    }

    const isSat = result.status === "SAT";
    const hasRegression = !!regressionPayload;

    const renderSuggestionCard = (sugg: any, idx: number, diffType?: 'INTRODUCED' | 'RESOLVED' | 'PERSISTENT') => {
        let borderClass = "border-slate-700";
        
        if (diffType === 'INTRODUCED') {
            borderClass = "border-rose-500/50 shadow-rose-900/20";
        } else if (diffType === 'RESOLVED') {
            borderClass = "border-emerald-500/50 shadow-emerald-900/20 opacity-80";
        } else if (diffType === 'PERSISTENT') {
            borderClass = "border-amber-500/50 shadow-amber-900/20";
        }

        const currentMask = sugg.current_role_mask ?? sugg.upstream_auth_mask;
        const suggestedMask = sugg.suggested_role_mask ?? sugg.downstream_auth_mask;
        
        const endpointName = sugg.endpoint_name || sugg.id || "UNKNOWN ENDPOINT";
        const isGet = endpointName.includes('GET');
        const isPost = endpointName.includes('POST');
        const isDelete = endpointName.includes('DELETE');

        return (
            <div key={idx} className={`bg-slate-800 rounded-xl border ${borderClass} p-6 shadow-lg hover:shadow-2xl transition-all duration-300 relative overflow-hidden group`}>
                <div className={`absolute top-0 left-0 w-1.5 h-full ${
                    isGet ? 'bg-blue-500' :
                    isPost ? 'bg-green-500' :
                    isDelete ? 'bg-red-500' : 'bg-orange-500'
                }`}></div>

                <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between pl-4 pt-2 md:pt-0">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 pr-20">
                            <span className={`text-xs font-black px-2 py-1 rounded uppercase tracking-wide
                                ${isGet ? 'bg-blue-900/50 text-blue-300 border border-blue-500/30' :
                                isPost ? 'bg-green-900/50 text-green-300 border border-green-500/30' :
                                isDelete ? 'bg-red-900/50 text-red-300 border border-red-500/30' : 
                                'bg-orange-900/50 text-orange-300 border border-orange-500/30'}`}>
                                {endpointName.split(' ')[0]}
                            </span>
                            <span className="font-mono text-sm text-white truncate font-medium">
                                {endpointName.split(' ').slice(1).join(' ')}
                            </span>
                        </div>
                        <p className="text-sm text-slate-400 leading-relaxed pr-16 md:pr-0">{sugg.description}</p>
                    </div>

                    {/* DYNAMIC TRANSFORMATION UI */}
                    {diffType === 'RESOLVED' ? (
                        <div className="flex items-center gap-3 bg-emerald-900/20 p-4 rounded-xl border border-emerald-500/30 shrink-0">
                            <div className="flex items-center gap-2 text-emerald-400">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span className="text-sm font-bold uppercase tracking-wider">Fix Applied / Not Needed</span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-700 shrink-0">
                            <RoleBadge mask={currentMask} />
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${diffType === 'PERSISTENT' ? 'text-amber-500' : 'text-slate-500 animate-pulse'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                            </svg>
                            <RoleBadge mask={suggestedMask} />
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col">
            <FormalTour run={isTourRunning} 
                setActiveTab={setViewMode}
                onFinish={() => setIsTourRunning(false)} 
            />

            {/* Header / Navbar */}
            <div className="bg-slate-800/50 border-b border-slate-700 p-4 sticky top-0 z-50 backdrop-blur-md">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    
                    {/* LEFT SIDE: Back Button & Title */}
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={(e) => {
                                e.stopPropagation(); 
                                handleBack();
                            }} 
                            onTouchEnd={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleBack();
                            }}
                            className="text-slate-400 hover:text-white flex items-center gap-2 text-sm font-bold transition-colors"
                        >
                            ← Back {fromPipeline ? 'to Pipeline' : ''}
                        </button>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            {hasRegression ? "Regression Analysis:" : "Verification:"} {systemInfo?.systemName}
                            <span className={`text-sm px-2 py-0.5 rounded border ${isSat ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-red-500/20 text-red-400 border-red-500/50'}`}>
                                {hasRegression ? "DIFF COMPLETE" : result.status}
                            </span>
                        </h1>
                    </div>

                    {/* RIGHT SIDE: Tour Button & View Toggle Grouped Together */}
                    <div className="flex items-center gap-4">
                        
                        {/* Tour Button */}
                        <div className="relative group flex items-center">
                            <button 
                                onClick={() => window.dispatchEvent(new Event('trigger-formal-tour'))}
                                className="px-3 py-2 bg-transparent hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-white rounded-lg flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider transition-all shadow-sm"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.48 8.52l-2.072 6.215a1 1 0 01-.634.634l-6.215 2.072a1 1 0 01-1.268-1.268l2.072-6.215a1 1 0 01.634-.634l6.215-2.072a1 1 0 011.268 1.268z" />
                                </svg>
                                Tour
                            </button>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1 text-[10px] font-mono tracking-wide bg-slate-800 border border-slate-700 text-slate-300 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none shadow-xl z-50">
                                Feature Guide
                            </div>
                        </div>

                        {/* VIEW TOGGLE - Only show if UNSAT */}
                        {(!isSat || hasRegression) && (
                            <div className="bg-slate-900/80 p-1 rounded-lg border border-slate-600 flex gap-1">
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setViewMode('results');
                                    }} 
                                    onTouchEnd={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setViewMode('results');
                                    }}
                                    className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${viewMode === 'results' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                                    List View
                                </button>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation(); 
                                        setViewMode('graph');
                                    }} 
                                    onTouchEnd={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setViewMode('graph');
                                    }}
                                    className={`tour-formal-graph px-4 py-1.5 text-sm font-bold rounded-md transition-all ${viewMode === 'graph' ? 'bg-red-600 text-white shadow shadow-red-500/20' : 'text-slate-400 hover:text-white'}`}>
                                    3D Graph Analysis
                                </button>
                            </div>
                        )}
                        
                    </div>
                </div>
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 relative h-full">
                
                {/* MODE A: RESULTS LIST */}
                {viewMode === 'results' && (
                    <div className="p-6 md:p-10 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
                        
                        {/* Left Column: Logs */}
                        <div className="lg:col-span-1 flex flex-col gap-6">
                             <div className="tour-formal-sidebar bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden flex flex-col h-[600px] shadow-xl">
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
                        <div className="lg:col-span-2 tour-formal-violations">
                            {hasRegression ? (
                                <div className="flex flex-col gap-6">
                                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-6 flex items-center gap-4">
                                        <div className="p-3 bg-indigo-500/20 rounded-full text-indigo-400">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-white">Security Regression Diff</h3>
                                            <p className="text-indigo-200 text-sm">Comparing current branch against baseline verification.</p>
                                        </div>
                                    </div>
                                    
                                    {(() => {
                                        const introduced = regressionPayload.introduced || regressionPayload.introduced_vulnerabilities || [];
                                        const persistent = regressionPayload.persistent || regressionPayload.persistent_vulnerabilities || [];
                                        const resolved = regressionPayload.resolved || regressionPayload.resolved_vulnerabilities || [];

                                        return (
                                            <>
                                                {introduced.length > 0 && (
                                                    <div className="space-y-4 mt-6">
                                                        <h4 className="text-rose-400 font-bold border-b border-rose-500/30 pb-2 flex justify-between">
                                                            <span>New Policy Recommendations</span>
                                                            <span className="bg-rose-500/20 px-2 rounded-full">{introduced.length}</span>
                                                        </h4>
                                                        {introduced.map((sugg: any, idx: number) => renderSuggestionCard(sugg, idx, 'INTRODUCED'))}
                                                    </div>
                                                )}

                                                {persistent.length > 0 && (
                                                    <div className="space-y-4 mt-8">
                                                        <h4 className="text-amber-400 font-bold border-b border-amber-500/30 pb-2 flex justify-between">
                                                            <span>Persistent Policy Change Recommendations</span>
                                                            <span className="bg-amber-500/20 px-2 rounded-full">{persistent.length}</span>
                                                        </h4>
                                                        {persistent.map((sugg: any, idx: number) => renderSuggestionCard(sugg, idx, 'PERSISTENT'))}
                                                    </div>
                                                )}

                                                {resolved.length > 0 && (
                                                    <div className="space-y-4 mt-8">
                                                        <h4 className="text-emerald-400 font-bold border-b border-emerald-500/30 pb-2 flex justify-between">
                                                            <span>Resolved (No Longer Needed / Fixed)</span>
                                                            <span className="bg-emerald-500/20 px-2 rounded-full">{resolved.length}</span>
                                                        </h4>
                                                        {resolved.map((sugg: any, idx: number) => renderSuggestionCard(sugg, idx, 'RESOLVED'))}
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            ) : isSat ? (
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
                                            <p className="text-red-200 text-sm">The optimizer found {result.suggestions.length} constraint violations.</p>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        {result.suggestions.map((sugg, idx) => renderSuggestionCard(sugg, idx))}
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
                        </div>
                        <GraphWrapper
                            width={window.innerWidth}
                            height={window.innerHeight - 80}
                            graphRef={graphRef}
                            graphData={graphData}
                            verificationSuggestions={result.suggestions} 
                            
                            // Interactive State Props
                            regressionPayload={regressionPayload}
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