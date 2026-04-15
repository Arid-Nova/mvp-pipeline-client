import React from 'react';
import { NodeData } from '../models';

interface SystemInputCardProps {
    node: NodeData;
    updateNodeData: (id: string, newData: Partial<NodeData['data']>) => void;
}

export const SystemInputCard: React.FC<SystemInputCardProps> = ({ node, updateNodeData }) => {
    const repositories = node.data.repositories || [{ repoUrl: '', branch: 'master', commitId: '' }];
        const updateRepo = (index: number, field: string, value: string) => {
            const newRepos = [...repositories];
            newRepos[index] = { ...newRepos[index], [field]: value };
            
            const legacyData = index === 0 ? { [field]: value } : {};
            updateNodeData(node.id, { ...legacyData, repositories: newRepos });
        };

        // --- CSV Parser ---
        const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                if (!text) return;

                const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                
                const parsedRepos: { repoUrl: string, branch: string, commitId: string }[] = [];
                
                lines.forEach((line, i) => {
                    const parts = line.split(',');
                    
                    // Skipping the first row if it looks like a header row instead of a URL
                    if (i === 0 && !line.includes('/') && !line.includes('http') && line.toLowerCase().includes('url')) {
                        return;
                    }
                    
                    // Only push if there is at least a URL
                    if (parts.length >= 1 && parts[0].trim()) {
                        parsedRepos.push({
                            repoUrl: parts[0].trim(),
                            branch: parts[1]?.trim() || 'master',
                            commitId: parts[2]?.trim() || ''
                        });
                    }
                });

                if (parsedRepos.length > 0) {
                    const currentRepos = repositories.filter(r => r.repoUrl.trim() !== '');
                    updateNodeData(node.id, { repositories: [...currentRepos, ...parsedRepos] });
                }
            };
            reader.readAsText(file);
            
            // Reseting the input so the user can upload the same file again if they deleted it by mistake
            event.target.value = '';
        };

        return (
            <div className="space-y-3 mt-2">
                <input 
                    type="text" placeholder="System Name" value={node.data.systemName || ''}
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none"
                    onChange={(e) => updateNodeData(node.id, { systemName: e.target.value })}
                />
                
                <div className="space-y-3 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                    {repositories.map((repo, index) => (
                        <div key={`repo-${index}`} className="p-2 border border-slate-800 bg-slate-900 rounded">
                            
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">
                                    Repository {index + 1}
                                </span>

                                {repositories.length > 1 && (
                                    <button 
                                        onClick={() => updateNodeData(node.id, { repositories: repositories.filter((_, i) => i !== index) })} 
                                        className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors text-xs font-bold -mt-1 -mr-1"
                                        title="Remove Repository"
                                    >✕</button>
                                )}
                            </div>
                            
                            {/* INPUTS CONTAINER */}
                            <div className="space-y-2">
                                <input type="text" placeholder="Repository URL" value={repo.repoUrl || ''} className="w-full text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none" onChange={(e) => updateRepo(index, 'repoUrl', e.target.value)} />
                                <div className="flex gap-1">
                                    <input type="text" placeholder="Branch (master)" value={repo.branch || ''} className="w-1/2 text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none" onChange={(e) => updateRepo(index, 'branch', e.target.value)} />
                                    <input type="text" placeholder="Commit (Latest)" value={repo.commitId || ''} className="w-1/2 text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none" onChange={(e) => updateRepo(index, 'commitId', e.target.value)} />
                                </div>
                            </div>

                        </div>
                    ))}
                </div>

                {/* ACTION BUTTONS */}
                <div className="flex items-center gap-2 mt-3">
                    <button 
                        onClick={() => updateNodeData(node.id, { repositories: [...repositories, { repoUrl: '', branch: 'master', commitId: '' }] })} 
                        className="group relative flex-1 py-1.5 text-[10px] font-bold tracking-wider uppercase text-blue-400 border border-dashed border-blue-800 rounded hover:bg-blue-900/30 transition-colors"
                    >
                        + Add Repo

                        {/* ADD REPO TOOLTIP */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[150px] bg-slate-800 border border-slate-700 shadow-xl rounded p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-[100] normal-case tracking-normal text-left font-normal">
                            <p className="text-[10px] text-slate-200 font-bold mb-1 border-b border-slate-700 pb-1">Manual Entry</p>
                            <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
                                Add a new row to manually specify another repository.
                            </p>
                            {/* Arrow */}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-800"></div>
                        </div>
                    </button>
                    
                    <span className="text-[10px] text-slate-500 font-bold uppercase">or</span>
                    
                    <label className="group relative flex-1 py-1.5 text-[10px] font-bold tracking-wider uppercase text-teal-400 border border-dashed border-teal-800 rounded hover:bg-teal-900/30 transition-colors cursor-pointer text-center flex items-center justify-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        CSV Upload
                        <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />

                        {/* TOOLTIP */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[180px] bg-slate-800 border border-slate-700 shadow-xl rounded p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-[100] normal-case tracking-normal text-left font-normal">
                            <p className="text-[10px] text-slate-200 font-bold mb-1 border-b border-slate-700 pb-1">Expected CSV Columns:</p>
                            <ol className="text-[9px] text-slate-400 list-decimal pl-3 space-y-0.5">
                                <li><span className="text-teal-400">URL</span> <span className="text-slate-500">(Required)</span></li>
                                <li><span className="text-slate-300">Branch</span> <span className="text-slate-500">(Optional)</span></li>
                                <li><span className="text-slate-300">Commit ID</span> <span className="text-slate-500">(Optional)</span></li>
                            </ol>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-800"></div>
                        </div>
                    </label>
                </div>
            </div>
        );
};