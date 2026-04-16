import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NodeData } from '../models';

interface TestExecutorCardProps {
    node: NodeData;
    nodes: NodeData[];
    connections: any[]; 
    updateNodeData: (id: string, newData: Partial<NodeData['data']>) => void;
}

export const TestExecutorCard: React.FC<TestExecutorCardProps> = ({ node, nodes, connections, updateNodeData }) => {
    const navigate = useNavigate();

    const testNode = nodes.find(n => 
        n.type === 'TEST_GENERATE' && 
        connections.some(c => c.source === n.id && c.target === node.id)
    );
    
    const promptNode = nodes.find(n => 
        n.type === 'PROMPT_GENERATE' && 
        testNode && 
        connections.some(c => c.source === n.id && c.target === testNode.id)
    );

    const roleSet = new Set<string>();

    const componentNode = nodes.find(n => n.type === 'COMPONENT_GENERATE');
    if (componentNode?.data.rolePriorities) {
        componentNode.data.rolePriorities.forEach((r: any) => roleSet.add(r.role));
    }

    const scenarioNode = nodes.find(n => n.type === 'SCENARIO_GENERATE');
    if (scenarioNode?.data.scenarioPayload?.scenarios) {
        scenarioNode.data.scenarioPayload.scenarios.forEach((s: any) => {
            if (Array.isArray(s.allowed_roles)) {
                s.allowed_roles.forEach((r: string) => roleSet.add(r));
            }
            if (Array.isArray(s.denied_roles)) {
                s.denied_roles.forEach((r: string) => roleSet.add(r));
            }
        });
    }

    const systemRoles = Array.from(roleSet);

    // Setup variables
    const tests = testNode?.data.testSuitePayload?.tests || [];
    const hasTests = tests.length > 0;
    const targetLanguage = promptNode?.data.language || 'java';
    const targetUrl = node.data.targetUrl || 'http://localhost:1234';

    return (
        <div className="mt-2 space-y-3">
            <div className="text-[10px] text-slate-400 leading-relaxed">
                Passes generated tests to the interactive executor environment.
            </div>

            {/* Target URL Input */}
            <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                    Target System URL
                </label>
                <input 
                    type="text"
                    value={targetUrl}
                    onChange={(e) => updateNodeData(node.id, { targetUrl: e.target.value })}
                    placeholder="e.g. http://localhost:1234"
                    className="w-full bg-slate-900/80 border border-slate-700 hover:border-slate-500 rounded-lg py-2 px-3 text-xs font-mono text-slate-200 outline-none focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500 transition-all shadow-inner"
                />
            </div>

            {!hasTests ? (
                <div className="space-y-2">
                    <div className="text-center py-2 px-3 border border-dashed border-slate-700 bg-slate-800/30 rounded-lg">
                        <span className="text-[10px] text-slate-400 italic">
                            Connect to a completed Test Generator first
                        </span>
                    </div>
                    <button 
                        disabled
                        className="w-full py-2 text-xs rounded font-bold transition-all flex items-center justify-center gap-2 bg-slate-800 text-slate-500 cursor-not-allowed"
                    >
                        Launch Executor
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    {/* Status Box */}
                    <div className="p-3 bg-slate-950 border border-fuchsia-500/30 rounded-lg flex flex-col items-center">
                        <div className="text-[10px] text-fuchsia-400 font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse shadow-[0_0_5px_rgba(217,70,239,0.5)]"></div>
                            Ready
                        </div>
                        <div className="text-xs text-white text-center mb-1">
                            <span className="font-bold text-fuchsia-300">{tests.length}</span> {targetLanguage.toUpperCase()} tests loaded
                        </div>
                    </div>

                    {/* Launch Button */}
                    <button 
                        onClick={() => {
                            navigate('/executor', { 
                                state: { 
                                    tests: tests, 
                                    language: targetLanguage,
                                    targetUrl: targetUrl,
                                    roles: systemRoles 
                                } 
                            });
                        }}
                        className="w-full py-2 text-xs bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded font-bold shadow-[0_0_15px_rgba(217,70,239,0.3)] hover:shadow-[0_0_20px_rgba(217,70,239,0.5)] transition-all flex items-center justify-center gap-2"
                    >
                        Launch Test Executor
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
};