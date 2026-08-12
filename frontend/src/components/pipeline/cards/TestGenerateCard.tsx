import React from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { NodeData } from '../models';

interface TestGenerateCardProps {
    node: NodeData;
    nodes: NodeData[];
    connections: any[]; 
    updateNodeData: (id: string, newData: Partial<NodeData['data']>) => void;
    runFromNode: (id: string) => void;
}

export const TestGenerateCard: React.FC<TestGenerateCardProps> = ({ node, nodes, connections, updateNodeData, runFromNode }) => {
    const promptNode = nodes.find(n => 
        n.type === 'PROMPT_GENERATE' && 
        connections.some(c => c.source === n.id && c.target === node.id)
    );

    const availablePrompts = promptNode?.data.promptPayload?.prompts?.length || 0;
    const targetLanguage = promptNode?.data.language || 'java'; 
    const hasTests = !!node.data.testSuitePayload;
    const selectedLlm = node.data.selectedLlm || 'gpt-5-mini';

    // Helper to update dropdown state locally
    const handleLlmChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        updateNodeData(node.id, { selectedLlm: e.target.value });
    };

    return (
        <div className="mt-2 space-y-3">
            {/* LLM Selection Dropdown */}
            <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    {/* AI Sparkles Icon */}
                    <svg className="w-3 h-3 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    Select LLM Engine
                </label>
                
                <div className="relative group">
                    <select 
                        value={selectedLlm}
                        onChange={handleLlmChange}
                        onClick={(e) => e.stopPropagation()}
                        onTouchEnd={(e) => { e.stopPropagation(); }}
                        disabled={node.status === 'running'}
                        className="w-full appearance-none bg-slate-900/80 border border-slate-700 hover:border-slate-500 rounded-lg py-2 pl-3 pr-8 text-xs font-medium text-slate-200 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all cursor-pointer shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <option value="gpt-5-mini">OpenAI GPT-5-mini</option>
                        <option value="gpt-5-turbo">OpenAI GPT-5 Turbo</option>
                        <option value="claude-3-5-sonnet">Anthropic Claude 3.5 Sonnet</option>
                        <option value="claude-3-opus">Anthropic Claude 3 Opus</option>
                        <option value="llama-3-70b">Meta Llama 3 70B</option>
                        <option value="llama3.2">Internal SLM (Ollama llama3.2)</option>
                    </select>
                    
                    {/* Custom sleek arrow overlay */}
                    <div className={`absolute inset-y-0 right-0 flex items-center px-2.5 pointer-events-none transition-colors ${node.status === 'running' ? 'text-slate-600' : 'text-slate-500 group-hover:text-purple-400'}`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                        </svg>
                    </div>
                </div>
            </div>

            {!hasTests ? (
                <div className="space-y-2">
                    <div className="text-center py-2 px-3 border border-dashed border-slate-700 bg-slate-800/30 rounded-lg">
                        <span className="text-[10px] text-slate-400 italic">
                            {availablePrompts > 0 
                                ? `${availablePrompts} prompts ready for execution` 
                                : "Connect to Prompts Card"}
                        </span>
                    </div>
                    <button 
                        disabled={availablePrompts === 0 || node.status === 'running'}
                        onClick={(e) => {
                            e.stopPropagation();
                            runFromNode(node.id);
                        }}
                        onTouchEnd={(e) => {
                            if (node.status === 'running') return; 
                            e.preventDefault();
                            e.stopPropagation();
                            runFromNode(node.id);
                        }}
                        className={`
                            w-full py-2 text-xs rounded font-bold transition-all flex items-center justify-center gap-2
                            ${availablePrompts > 0 
                                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg' 
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
                        Execute LLM
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="p-3 bg-slate-950 border border-purple-500/30 rounded-lg text-center">
                        <div className="text-[10px] text-purple-400 font-bold uppercase tracking-widest mb-1">Generated</div>
                        <div className="text-xs text-white">
                            {node.data.testSuitePayload?.tests?.length || 0} {targetLanguage === 'curl' ? 'Bash Scripts' : targetLanguage.toUpperCase() + ' Test Classes'} 
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <button 
                            onClick={async (e) => {
                                e.stopPropagation();

                                const tests = node.data.testSuitePayload?.tests || [];
                                if (tests.length === 0) return;

                                // 1. Create a new zip instance
                                const zip = new JSZip();
                                const folder = zip.folder(`test_suite_${selectedLlm}`);
                                
                                let ext = 'java';
                                let prefix = 'SecurityTest_';
                                if (targetLanguage === 'python') {
                                    ext = 'py';
                                    prefix = 'test_';
                                } else if (targetLanguage === 'curl') {
                                    ext = 'sh';
                                    prefix = 'test_';
                                }

                                // 2. Add each test to the zip as a .java file
                                tests.forEach((test, index) => {
                                    const safeName = (test.scenario_id || `scenario_${index}`).replace(/[^a-zA-Z0-9]/g, '_');
                                    const filename = `${prefix}${safeName}.${ext}`;
                                    folder?.file(filename, test.test_code);
                                });

                                // 3. Generate the zip blob and trigger download
                                try {
                                    const blob = await zip.generateAsync({ type: "blob" });
                                    saveAs(blob, `test_suite_${selectedLlm}_${Date.now()}.zip`);
                                } catch (error) {
                                    console.error("Failed to generate zip file", error);
                                }
                            }}
                            onTouchEnd={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                const tests = node.data.testSuitePayload?.tests || [];
                                if (tests.length === 0) return;

                                // 1. Create a new zip instance
                                const zip = new JSZip();
                                const folder = zip.folder(`test_suite_${selectedLlm}`);
                                
                                let ext = 'java';
                                let prefix = 'SecurityTest_';
                                if (targetLanguage === 'python') {
                                    ext = 'py';
                                    prefix = 'test_';
                                } else if (targetLanguage === 'curl') {
                                    ext = 'sh';
                                    prefix = 'test_';
                                }

                                // 2. Add each test to the zip as a .java file
                                tests.forEach((test, index) => {
                                    const safeName = (test.scenario_id || `scenario_${index}`).replace(/[^a-zA-Z0-9]/g, '_');
                                    const filename = `${prefix}${safeName}.${ext}`;
                                    folder?.file(filename, test.test_code);
                                });

                                // 3. Generate the zip blob and trigger download
                                try {
                                    const blob = await zip.generateAsync({ type: "blob" });
                                    saveAs(blob, `test_suite_${selectedLlm}_${Date.now()}.zip`);
                                } catch (error) {
                                    console.error("Failed to generate zip file", error);
                                }
                            }}
                            className="w-full py-1.5 text-[10px] bg-purple-600 hover:bg-purple-500 text-white rounded font-bold shadow transition-all"
                        >
                            Download Test Suite (.zip)
                        </button>
                        <button 
                            disabled={node.status === 'running'}
                            onClick={(e) => {
                                e.stopPropagation();
                                runFromNode(node.id);
                            }}
                            onTouchEnd={(e) => {
                                if (node.status === 'running') return; 
                                e.preventDefault();
                                e.stopPropagation();
                                runFromNode(node.id);
                            }}
                            className="w-full py-1.5 text-[10px] border border-purple-800 text-purple-500 hover:bg-purple-900/20 rounded font-bold transition-all"
                        >
                            {node.status === 'running' ? 'Executing...' : 'Regenerate Tests'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
