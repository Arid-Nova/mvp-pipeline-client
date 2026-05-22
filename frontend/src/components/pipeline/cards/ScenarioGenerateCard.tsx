import React, { useState } from 'react';
import { NodeData } from '../models'; 

interface ScenarioGenerateCardProps {
    node: NodeData;
    updateNodeData: (id: string, newData: Partial<NodeData['data']>) => void;
}

export const ScenarioGenerateCard: React.FC<ScenarioGenerateCardProps> = ({ node, updateNodeData }) => {
    // Add this state for the services toggle
    const [showAllServices, setShowAllServices] = useState(false);

    const scPayload = node.data.scenarioPayload;
    const selectedScenarios = node.data.selectedScenarios || [];
    const isExpanded = node.data.isExpanded || false;
    
    // Filtering States 
    const filterEndpointText = node.data.filterEndpointText || '';
    const filterShowInconsistenciesOnly = node.data.filterShowInconsistenciesOnly || false;

    if (!scPayload) {
        return (
            <div className="mt-2 text-center p-3 border border-dashed border-slate-700 bg-slate-800/50 rounded-lg">
                <span className="text-xs text-slate-400 italic">Waiting for Component Generation...</span>
            </div>
        );
    }

    // Filtering Logic
    const displayedScenarios = scPayload.scenarios.filter((s: any) => {
        const matchesText = s.endpoint.toLowerCase().includes(filterEndpointText.toLowerCase());
        const matchesInconsistencies = filterShowInconsistenciesOnly 
            ? (s.policy_inconsistencies && s.policy_inconsistencies.length > 0) 
            : true;
        return matchesText && matchesInconsistencies;
    });

    // Helpers for regression testing
    const services = node.data.targetedServices || [];
    const maxVisible = 4;
    const visibleServices = showAllServices ? services : services.slice(0, maxVisible);
    const hiddenCount = services.length - maxVisible;

    // Updated to respect active filters
    const setAllScenarios = (selected: boolean) => {
        const targetScenarios = isExpanded ? displayedScenarios : scPayload.scenarios;
        let newSelected = [...selectedScenarios];
        
        if (selected) {
            const targetIds = targetScenarios.map((s: any) => s.scenario_id);
            newSelected = Array.from(new Set([...newSelected, ...targetIds]));
        } else {
            const targetIds = new Set(targetScenarios.map((s: any) => s.scenario_id));
            newSelected = newSelected.filter(id => !targetIds.has(id));
        }
        
        updateNodeData(node.id, { selectedScenarios: newSelected });
    };

    const toggleScenario = (id: string) => {
        const newSelected = selectedScenarios.includes(id)
            ? selectedScenarios.filter(s => s !== id)
            : [...selectedScenarios, id];
        updateNodeData(node.id, { selectedScenarios: newSelected });
    };

    const toggleExpand = (e: React.MouseEvent) => {
        e.stopPropagation(); 
        updateNodeData(node.id, { isExpanded: !isExpanded });
    };

    // Filter handlers
    const handleFilterTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        updateNodeData(node.id, { filterEndpointText: e.target.value });
    };
    
    const handleFilterInconsistenciesChange = () => {
        updateNodeData(node.id, { filterShowInconsistenciesOnly: !filterShowInconsistenciesOnly });
    };

    return (
        <div className="mt-2 space-y-2">
            {/* Regression Testing Alert */}
            {node.data.targetedServices && node.data.targetedServices.length > 0 && (
                <div className="mb-2 p-2 bg-amber-900/20 border border-amber-500/30 rounded-lg flex items-start gap-2">
                    <svg className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <div>
                        <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                            Regression Testing Active
                        </div>
                        <div className="text-[9px] text-amber-200/70 leading-snug mt-0.5">
                            Targeting <strong>{node.data.targetedServices.length}</strong> modified microservices.
                        </div>
                        
                        {/* Collapsible changed impacted services list */}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                            {visibleServices.map((svc: string) => (
                                <span key={svc} className="text-[8px] px-1 py-0.5 bg-amber-950 border border-amber-500/20 rounded text-amber-300">
                                    {svc}
                                </span>
                            ))}
                            
                            {/* Toggle Button */}
                            {!showAllServices && hiddenCount > 0 && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation(); 
                                        setShowAllServices(true);
                                    }}
                                    onTouchEnd={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowAllServices(true);
                                    }}
                                    className="text-[8px] px-1.5 py-0.5 text-amber-500/70 hover:text-amber-400 font-bold transition-colors"
                                >
                                    +{hiddenCount} more
                                </button>
                            )}
                            {showAllServices && hiddenCount > 0 && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowAllServices(false);
                                    }}
                                    onTouchEnd={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowAllServices(false);
                                    }}
                                    className="text-[8px] px-1.5 py-0.5 text-amber-500/70 hover:text-amber-400 font-bold transition-colors"
                                >
                                    Show less
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-1 mb-2">
                <div className="flex items-center justify-between">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        Generated Scenarios
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-indigo-400 font-bold" title="Selected / Total">
                            {selectedScenarios.length} / {scPayload.scenarios.length}
                            {isExpanded && displayedScenarios.length !== scPayload.scenarios.length && (
                                <span className="text-slate-500 ml-1">({displayedScenarios.length} visible)</span>
                            )}
                        </span>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation()
                                toggleExpand(e);
                            }}
                            onTouchEnd={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                updateNodeData(node.id, { isExpanded: !isExpanded });
                            }}
                            className="px-1.5 py-0.5 text-[9px] bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors font-bold shadow flex items-center gap-1"
                        >
                            {isExpanded ? (
                                <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 14h6m0 0v6m0-6l-7 7m17-11h-6m0 0V4m0 6l7-7M4 10h6m0 0V4m0 6l-7-7m17 11h-6m0 0v6m0-6l7 7" /></svg> Minimize</>
                            ) : (
                                <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg> Expand</>
                            )}
                        </button>
                    </div>
                </div>

                {/* FILTER BAR */}
                {isExpanded && (
                    <div className="flex items-center gap-2 mt-1 mb-1 p-1.5 bg-slate-900/60 rounded border border-slate-700/50">
                        <input 
                            type="text"
                            placeholder="Filter by endpoint..."
                            value={filterEndpointText}
                            onChange={handleFilterTextChange}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        <label className={`flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded border transition-colors ${filterShowInconsistenciesOnly ? 'bg-rose-950/40 border-rose-500/50' : 'bg-slate-950 border-slate-700 hover:border-slate-500'}`}>
                            <input 
                                type="checkbox"
                                checked={filterShowInconsistenciesOnly}
                                onChange={handleFilterInconsistenciesChange}
                                className="accent-rose-500"
                            />
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${filterShowInconsistenciesOnly ? 'text-rose-400' : 'text-slate-500'}`}>
                                Inconsistencies Only
                            </span>
                        </label>
                    </div>
                )}
                
                {/* Select All / Deselect All Controls */}
                <div className="flex gap-3 mt-1">
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            setAllScenarios(true);
                        }}
                        onTouchEnd={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setAllScenarios(true);
                        }}
                        className="text-[9px] text-indigo-400 hover:text-indigo-300 transition-colors uppercase font-bold tracking-tighter underline decoration-indigo-800 underline-offset-2"
                    >
                        Select All {isExpanded && "Visible"}
                    </button>
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            setAllScenarios(false);
                        }}
                        onTouchEnd={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setAllScenarios(false);
                        }}
                        className="text-[9px] text-slate-500 hover:text-rose-400 transition-colors uppercase font-bold tracking-tighter underline decoration-slate-800 underline-offset-2"
                    >
                        Deselect All {isExpanded && "Visible"}
                    </button>
                </div>
            </div>
            
            {/* Scrollable Checkbox List (Iterates over displayedScenarios) */}
            <div className={`space-y-2 overflow-y-auto pr-1 custom-scrollbar transition-all duration-300 ${isExpanded ? 'max-h-[600px]' : 'max-h-48'}`}>
                {displayedScenarios.length === 0 ? (
                    <div className="text-center py-4 text-[10px] text-slate-500 italic">
                        No scenarios match your filters.
                    </div>
                ) : displayedScenarios.map((s: any) => (
                    <label 
                        key={s.scenario_id} 
                        onClick={(e) => {
                            e.stopPropagation(); 
                            toggleScenario(s.scenario_id);
                        }}
                        onTouchEnd={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleScenario(s.scenario_id);
                        }}
                        className={`
                            flex items-start gap-3 p-3 bg-slate-950 border rounded cursor-pointer transition-all
                            ${selectedScenarios.includes(s.scenario_id) ? 'border-indigo-500/50 bg-indigo-900/10' : 'border-slate-800 hover:border-slate-700'}
                        `}
                    >
                        <input 
                            type="checkbox" 
                            checked={selectedScenarios.includes(s.scenario_id)}
                            onChange={() => toggleScenario(s.scenario_id)}
                            className="mt-0.5 accent-indigo-500 rounded border-slate-700"
                        />
                        <div className="flex flex-col w-full min-w-0">
                            {/* HEADER: Method and Endpoint */}
                            <div className="flex items-start gap-2">
                                <span className={`mt-0.5 text-[9px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap ${s.method === 'GET' ? 'bg-blue-900/50 text-blue-400' : s.method === 'POST' ? 'bg-green-900/50 text-green-400' : s.method === 'DELETE' ? 'bg-red-900/50 text-red-400' : s.method === 'PUT' ? 'bg-amber-900/50 text-amber-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                                    {s.method}
                                </span>
                                <span className={`text-[11px] font-mono font-semibold ${isExpanded ? 'whitespace-normal break-all text-slate-200' : 'truncate text-slate-300'}`} title={s.endpoint}>
                                    {s.endpoint}
                                </span>
                            </div>
                            
                            {/* EXPECTED OUTCOME */}
                            <span className={`text-[10px] text-slate-400 mt-1 ${isExpanded ? 'whitespace-normal' : 'truncate'}`}>
                                {s.expected_outcome}
                            </span>

                            {/* EXPANDED DETAILS */}
                            {isExpanded && (
                                <div className="mt-3 flex flex-col gap-2.5 text-[10px] border-t border-slate-800/80 pt-3">
                                    
                                    {/* Top Meta Info */}
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                        <div><span className="text-slate-500 font-bold uppercase tracking-wider">Service:</span> <span className="text-slate-300 font-mono ml-1">{s.service_name}</span></div>
                                        {s.scenario_category && (
                                            <div><span className="text-slate-500 font-bold uppercase tracking-wider">Category:</span> <span className="text-indigo-300 ml-1">{s.scenario_category}</span></div>
                                        )}
                                    </div>

                                    {/* Auth, Tags & Sensitivity Badges */}
                                    <div className="flex flex-wrap gap-1.5">
                                        {s.sensitivity_type && (
                                            <span className="bg-slate-800 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide">
                                                Sensitivity: {s.sensitivity_type}
                                            </span>
                                        )}
                                        {s.handles_pii && (
                                            <span className="bg-amber-900/20 border border-amber-700/50 text-amber-400 px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                HANDLES PII
                                            </span>
                                        )}
                                        {(s.max_depth > 0 || s.total_calls > 1) && (
                                            <span className="bg-slate-800 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-[9px] font-bold">
                                                Chain Depth: {s.max_depth} (Calls: {s.total_calls})
                                            </span>
                                        )}
                                    </div>

                                    {/* Roles & Status Matrix Grid */}
                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                        {/* Allowed Roles */}
                                        <div className="bg-slate-900/60 p-2 rounded border border-slate-800/50">
                                            <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider mb-1.5 block">Allowed Roles</span>
                                            <div className="flex flex-wrap gap-1">
                                                {s.allowed_roles?.length > 0 ? s.allowed_roles.map((r: string) => (
                                                    <span key={r} className="bg-emerald-900/20 border border-emerald-800/50 text-emerald-400 px-1.5 py-0.5 rounded font-mono text-[9px]">{r}</span>
                                                )) : <span className="text-slate-600 italic">No Restriction</span>}
                                            </div>
                                        </div>

                                        {/* Denied / Expected Statuses */}
                                        <div className="bg-slate-900/60 p-2 rounded border border-slate-800/50">
                                            <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider mb-1.5 block">Expected Status Matrix</span>
                                            <div className="flex flex-col gap-1">
                                                {s.expected_status_by_role && Object.keys(s.expected_status_by_role).length > 0 ? (
                                                    Object.entries(s.expected_status_by_role).map(([role, status]) => (
                                                        <div key={role} className="flex justify-between items-center text-[9px] font-mono">
                                                            <span className="text-slate-400">{role}</span>
                                                            <span className={String(status).startsWith('2') ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                                                {status as string}
                                                            </span>
                                                        </div>
                                                    ))
                                                ) : <span className="text-slate-600 italic">No matrix available</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Policy Inconsistencies Alert */}
                                    {s.policy_inconsistencies && s.policy_inconsistencies.length > 0 && (
                                        <div className="bg-rose-950/20 border border-rose-900/40 p-2 rounded mt-1">
                                            <span className="text-rose-400 font-bold uppercase text-[9px] tracking-wider flex items-center gap-1.5 mb-1.5">
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                Policy Inconsistencies Detected
                                            </span>
                                            <ul className="space-y-1.5">
                                                {s.policy_inconsistencies.map((inc: any, idx: number) => (
                                                    <li key={idx} className="bg-rose-950/40 border border-rose-900/50 p-1.5 rounded flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="bg-rose-900/80 text-rose-100 px-1 py-0.5 rounded text-[8px] font-bold tracking-wider">
                                                                {inc.role || 'UNKNOWN ROLE'}
                                                            </span>
                                                            <span className="text-rose-300 text-[9px] font-bold">
                                                                {inc.type}
                                                            </span>
                                                        </div>
                                                        <span className="text-rose-200/70 text-[8px] font-mono break-words leading-tight mt-0.5">
                                                            {inc.details?.reason 
                                                                ? inc.details.reason 
                                                                : `Upstream/Downstream mismatch detected affecting: ${inc.details?.downstream_endpoint?.split(':')[0] || 'Unknown Service'}`
                                                            }
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* ID Footer */}
                                    <div className="text-slate-600 font-mono text-[8px] mt-1 break-all">
                                        ID: {s.scenario_id}
                                    </div>
                                </div>
                            )}
                        </div>
                    </label>
                ))}
            </div>
        </div>
    );
};
