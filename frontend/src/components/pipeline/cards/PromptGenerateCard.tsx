import React from 'react';
import { saveAs } from 'file-saver';
import { NodeData } from '../models'; 

interface PromptGenerateCardProps {
    node: NodeData;
    nodes: NodeData[];
    connections: any[]; 
    updateNodeData: (id: string, newData: Partial<NodeData['data']>) => void;
    runFromNode: (id: string) => void;
}

export const PromptGenerateCard: React.FC<PromptGenerateCardProps> = ({ node, nodes, connections, updateNodeData, runFromNode }) => {
    // 1. Extract and check for existence safely
    const prompts = node.data.promptPayload?.prompts;
    const hasPrompts = Array.isArray(prompts) && prompts.length > 0;

    // 2. Look for the upstream scenario node for the counter
    const scenarioNode = nodes.find(n => 
        n.type === 'SCENARIO_GENERATE' && 
        connections.some(c => c.source === n.id && c.target === node.id)
    );
    const selectedCount = scenarioNode?.data.selectedScenarios?.length || 0;

    return (
        <div className="mt-2 space-y-3">
            <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Target Language
                </label>
                <div className="relative group">
                    <select
                        value={node.data.language || 'java'}
                        onChange={(e) => updateNodeData(node.id, { language: e.target.value })}
                        className="w-full appearance-none bg-slate-900/80 border border-slate-700 hover:border-slate-500 rounded-lg py-2 pl-3 pr-8 text-xs font-medium text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all cursor-pointer shadow-inner"
                    >
                        <option value="java">Java (JUnit + MockMvc)</option>
                        <option value="python">Python (Pytest + Requests)</option>
                        <option value="curl">cURL (Bash Scripts)</option>
                    </select>
                    
                    <div className="absolute inset-y-0 right-0 flex items-center px-2.5 pointer-events-none text-slate-500 group-hover:text-emerald-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                        </svg>
                    </div>
                </div>
            </div>

            {!hasPrompts ? (
                <div className="space-y-2">
                    <div className="text-center py-2 px-3 border border-dashed border-slate-700 bg-slate-800/30 rounded-lg">
                        <span className="text-[10px] text-slate-400 italic">
                            {selectedCount > 0 
                                ? `${selectedCount} scenarios selected` 
                                : "Select scenarios above first"}
                        </span>
                    </div>
                    <button 
                        disabled={selectedCount === 0 || node.status === 'running'}
                        onClick={() => runFromNode(node.id)}
                        className={`
                            w-full py-2 text-xs rounded font-bold transition-all flex items-center justify-center gap-2
                            ${selectedCount > 0 
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg' 
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'}
                        `}
                    >
                        {node.status === 'running' ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        )}
                        Generate Prompts
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="p-3 bg-slate-950 border border-emerald-500/30 rounded-lg text-center">
                        <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mb-1">Status</div>
                        <div className="text-xs text-white">
                            {prompts?.length || 0} Prompts Ready
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <button 
                            onClick={() => {
                                // Safeguard using optional chaining and a fallback
                                const dataToSave = node.data.promptPayload ?? { prompts: [] };
                                const blob = new Blob(
                                    [JSON.stringify(dataToSave, null, 2)], 
                                    { type: "application/json" }
                                );
                                saveAs(blob, `prompts_${Date.now()}.json`);
                            }}
                            className="w-full py-1.5 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold shadow transition-all"
                        >
                            Download JSON
                        </button>
                        <button 
                            disabled={node.status === 'running'}
                            onClick={() => runFromNode(node.id)}
                            className="w-full py-1.5 text-[10px] border border-emerald-800 text-emerald-500 hover:bg-emerald-900/20 rounded font-bold transition-all"
                        >
                            {node.status === 'running' ? 'Updating...' : 'Regenerate'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};