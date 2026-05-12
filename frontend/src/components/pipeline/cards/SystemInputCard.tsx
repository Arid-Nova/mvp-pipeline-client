import React, { useEffect, useRef, useState } from 'react';
import { NodeData } from '../models';
import { importOrganization, fetchRepoMetadata } from '../../../services/api';
import { RepoData } from '../../../services/types';
import { BranchDropdown } from './BranchDropdown';
import { parseGithubRepoUrl, canonicalizeGithubUrl } from '../../../utils/githubUrl';

type FetchStatus = 'idle' | 'loading' | 'ok' | 'error';

interface SystemInputCardProps {
    node: NodeData;
    updateNodeData: (id: string, newData: Partial<NodeData['data']>) => void;
}

export const SystemInputCard: React.FC<SystemInputCardProps> = ({ node, updateNodeData }) => {
    const [mode, setMode] = useState<'manual' | 'org'>('manual');
    const [orgUrl, setOrgUrl] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // --- State for the Review Screen ---
    const [reviewedSystemName, setReviewedSystemName] = useState('');
    const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
    const [branchSelections, setBranchSelections] = useState<Record<string, string>>({});

    const repositories = node.data.repositories || [{ repoUrl: '', branch: 'master', commitId: '' }];
    const orgData = node.data.orgImportData;

    // Per-row auto-fetch state — local only, does not persist to node.data
    const [fetchStatus, setFetchStatus] = useState<Record<number, FetchStatus>>({});
    const [fetchError, setFetchError] = useState<Record<number, string | null>>({});
    const [detailsOpen, setDetailsOpen] = useState<Record<number, boolean>>({});
    // Track last URL we successfully fetched per row so blurring twice doesn't refetch
    const lastFetchedUrlRef = useRef<Record<number, string>>({});

    useEffect(() => {
        if (orgData) {
            setReviewedSystemName(orgData.proposedSystemName);
            const initialSelected = new Set<string>();
            const initialBranches: Record<string, string> = {};
            
            // Pre-checking the relevant repos
            orgData.relevantRepos.forEach(r => {
                initialSelected.add(r.url);
                initialBranches[r.url] = r.branch;
            });
            
            // Setting default branches for suggested repos 
            orgData.suggestedRepos.forEach(r => {
                initialBranches[r.url] = r.branch;
            });
            
            setSelectedUrls(initialSelected);
            setBranchSelections(initialBranches);
        }
    }, [orgData]);
    
    const updateRepo = (index: number, field: string, value: string) => {
        const newRepos = [...repositories];
        newRepos[index] = { ...newRepos[index], [field]: value };

        const legacyData = index === 0 ? { [field]: value } : {};
        updateNodeData(node.id, { ...legacyData, repositories: newRepos });
    };

    // Fetch GitHub metadata for a repo row. Triggered by the explicit Import button.
    // Soft-fills branch/commit/systemName only when the user hasn't already provided values.
    const handleFetchMetadata = async (index: number) => {
        const url = (repositories[index]?.repoUrl || '').trim();
        if (!url) return;

        const parsed = parseGithubRepoUrl(url);
        if (!parsed) {
            setFetchStatus(prev => ({ ...prev, [index]: 'error' }));
            setFetchError(prev => ({ ...prev, [index]: 'Not a valid GitHub repository URL.' }));
            setDetailsOpen(prev => ({ ...prev, [index]: true }));
            return;
        }

        if (lastFetchedUrlRef.current[index] === url && fetchStatus[index] === 'ok') return;

        setFetchStatus(prev => ({ ...prev, [index]: 'loading' }));
        setFetchError(prev => ({ ...prev, [index]: null }));

        try {
            const metadata = await fetchRepoMetadata(url);

            const current = repositories[index] || { repoUrl: '', branch: 'master', commitId: '' };
            const canonicalUrl = metadata.repoUrl || canonicalizeGithubUrl(url);

            const branchUntouched = !current.branch || current.branch === 'master';
            const commitUntouched = !current.commitId;

            const updatedRepo = {
                ...current,
                repoUrl: canonicalUrl,
                branch: branchUntouched ? metadata.defaultBranch : current.branch,
                commitId: commitUntouched ? metadata.latestCommit : current.commitId,
            };

            const newRepos = [...repositories];
            newRepos[index] = updatedRepo;

            const patch: Partial<NodeData['data']> = { repositories: newRepos };
            if (index === 0) {
                // Mirror updateRepo's legacy back-fill for row 0
                (patch as any).repoUrl = updatedRepo.repoUrl;
                (patch as any).branch = updatedRepo.branch;
                (patch as any).commitId = updatedRepo.commitId;
                if (!node.data.systemName) {
                    patch.systemName = metadata.name;
                }
            }

            updateNodeData(node.id, patch);

            lastFetchedUrlRef.current[index] = canonicalUrl;
            setFetchStatus(prev => ({ ...prev, [index]: 'ok' }));
        } catch (err: any) {
            setFetchStatus(prev => ({ ...prev, [index]: 'error' }));
            setFetchError(prev => ({ ...prev, [index]: err?.message || 'Failed to fetch repository metadata.' }));
            setDetailsOpen(prev => ({ ...prev, [index]: true }));
        }
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

    // --- Organization Analyzer ---
    const handleAnalyzeOrg = async () => {
        if (!orgUrl.trim()) {
            setError("Please enter a valid GitHub Organization URL.");
            return;
        }
        setIsAnalyzing(true);
        setError(null);
        try {
            const response = await importOrganization(orgUrl);
            updateNodeData(node.id, { orgImportData: response });
        } catch (err: any) {
            setError(err.message || "Failed to analyze organization. Ensure your settings token is valid.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const toggleRepoSelection = (url: string) => {
        const newSet = new Set(selectedUrls);
        if (newSet.has(url)) newSet.delete(url);
        else newSet.add(url);
        setSelectedUrls(newSet);
    };

    const handleConfirmSelection = () => {
        if (!orgData) return;
        
        const allRepos = [...orgData.relevantRepos, ...orgData.suggestedRepos];
        const finalRepos = allRepos
            .filter(r => selectedUrls.has(r.url))
            .map(r => {
                const selectedBranch = branchSelections[r.url] || r.branch;  
                const actualCommitSha = r.commitMap?.[selectedBranch] ?? '';

                return {
                    repoUrl: r.url,
                    branch: selectedBranch,
                    commitId: actualCommitSha 
                };
            });
            
        updateNodeData(node.id, {
            systemName: reviewedSystemName,
            repositories: finalRepos,
            orgImportData: undefined 
        });
        
        setMode('manual'); 
    };

    // Helper to render a repo row in the review screen
    const renderRepoRow = (repo: RepoData, isPreChecked: boolean) => {
        const isSelected = selectedUrls.has(repo.url);
        
        return (
            <div 
                key={repo.url} 
                onClick={() => toggleRepoSelection(repo.url)}
                className={`flex items-center gap-2 p-2 border rounded mb-1.5 cursor-pointer transition-all duration-200 ${
                    isSelected 
                        ? 'border-purple-500/50 bg-purple-900/20 shadow-[0_0_10px_rgba(168,85,247,0.1)]' 
                        : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/80'
                }`}
            >
                <div className={`flex-shrink-0 w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center transition-colors ${
                    isSelected 
                        ? 'bg-purple-500 border-purple-500 text-white' 
                        : 'border-slate-600 bg-slate-800/50'
                }`}>
                    {isSelected && (
                        <svg 
                            className="w-2.5 h-2.5" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24" 
                            aria-hidden="true"
                        >
                            <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth={3.5} 
                                d="M5 13l4 4L19 7" 
                            />
                        </svg>
                    )}
                </div>
                
                <div className="flex-1 min-w-0">
                    <p className={`text-[10px] truncate transition-colors ${isSelected ? 'text-purple-300 font-bold' : 'text-slate-300'}`} title={repo.url}>
                        {repo.url.split('/').slice(-1)[0].replace('.git', '')}
                    </p>
                </div>
                
                <BranchDropdown 
                    repoUrl={repo.url}
                    currentBranch={branchSelections[repo.url] || repo.branch}
                    branches={repo.branches || [repo.branch]}
                    isSelected={isSelected}
                    onSelect={(val) => setBranchSelections(prev => ({ ...prev, [repo.url]: val }))}
                />
            </div>
        );
    };

    return (
        <div className="space-y-3 mt-2">
            <div className="flex bg-slate-900/80 rounded p-1 border border-slate-700/50">
                <button 
                    onClick={() => setMode('manual')}
                    className={`flex-1 text-[9px] font-bold tracking-wider uppercase py-1.5 rounded transition-colors ${mode === 'manual' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Manual Entry
                </button>
                <button 
                    onClick={() => setMode('org')}
                    className={`flex-1 text-[9px] font-bold tracking-wider uppercase py-1.5 rounded transition-colors ${mode === 'org' ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Import Org
                </button>
            </div>

            {mode === 'manual' ? (
                <>
                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                        {repositories.map((repo, index) => {
                            const isOpen = detailsOpen[index] === true;
                            const status = fetchStatus[index] || 'idle';
                            const isMultiRepo = repositories.length > 1;

                            return (
                                <div key={`repo-${index}`} className={isMultiRepo ? "p-2 border border-slate-800 bg-slate-900 rounded" : ""}>

                                    {isMultiRepo && (
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">
                                                Repository {index + 1}
                                            </span>
                                            <button
                                                onClick={() => updateNodeData(node.id, { repositories: repositories.filter((_, i) => i !== index) })}
                                                className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors text-xs font-bold -mt-1 -mr-1"
                                                title="Remove Repository"
                                            >✕</button>
                                        </div>
                                    )}

                                    {!isMultiRepo && (
                                        <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-0.5">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.17c-3.34.72-4.04-1.41-4.04-1.41-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.31-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.58A12.01 12.01 0 0024 12c0-6.63-5.37-12-12-12z" />
                                            </svg>
                                            Repository URL
                                        </label>
                                    )}

                                    <div className="space-y-2">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="e.g., https://github.com/FudanSELab/train-ticket"
                                                value={repo.repoUrl || ''}
                                                className={`w-full text-xs bg-slate-950 border rounded p-1.5 pr-7 outline-none transition-colors ${
                                                    status === 'error'
                                                        ? 'border-red-500/60 focus:border-red-500'
                                                        : status === 'ok'
                                                            ? 'border-emerald-600/50 focus:border-emerald-500'
                                                            : 'border-slate-700 focus:border-blue-500'
                                                }`}
                                                onChange={(e) => updateRepo(index, 'repoUrl', e.target.value)}
                                            />
                                            {status === 'ok' && (
                                                <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => handleFetchMetadata(index)}
                                            disabled={!repo.repoUrl?.trim() || status === 'loading'}
                                            className={`w-full py-1.5 text-[10px] font-bold tracking-wider uppercase rounded border transition-all flex items-center justify-center gap-1.5 ${
                                                status === 'loading'
                                                    ? 'border-slate-700 bg-slate-800/40 text-slate-500 cursor-wait'
                                                    : !repo.repoUrl?.trim()
                                                        ? 'border-slate-800 bg-slate-900/40 text-slate-600 cursor-not-allowed'
                                                        : status === 'ok'
                                                            ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-900/30'
                                                            : 'border-blue-700/60 bg-blue-900/20 text-blue-300 hover:bg-blue-800/30'
                                            }`}
                                        >
                                            {status === 'loading' ? (
                                                <>
                                                    <div className="w-3 h-3 border-2 border-blue-500/40 border-t-blue-400 rounded-full animate-spin" />
                                                    Importing...
                                                </>
                                            ) : status === 'ok' ? (
                                                <>Re-fetch from GitHub</>
                                            ) : (
                                                <>Import Repository</>
                                            )}
                                        </button>

                                        {status === 'error' && fetchError[index] && (
                                            <p className="text-[9px] text-red-400 leading-snug">{fetchError[index]}</p>
                                        )}

                                        {(status === 'ok' || status === 'error' || isOpen) && (
                                            <div className="space-y-2 pt-1 animate-in fade-in duration-200">
                                                {index === 0 && (
                                                    <input
                                                        type="text"
                                                        placeholder="System Name"
                                                        value={node.data.systemName || ''}
                                                        className="w-full text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none"
                                                        onChange={(e) => updateNodeData(node.id, { systemName: e.target.value })}
                                                    />
                                                )}
                                                <div className="flex gap-1">
                                                    <input type="text" placeholder="Branch" value={repo.branch || ''} className="w-1/2 text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none" onChange={(e) => updateRepo(index, 'branch', e.target.value)} />
                                                    <input type="text" placeholder="Commit (Latest)" value={repo.commitId || ''} className="w-1/2 text-xs bg-slate-950 border border-slate-700 rounded p-1.5 focus:border-blue-500 outline-none" onChange={(e) => updateRepo(index, 'commitId', e.target.value)} />
                                                </div>
                                            </div>
                                        )}

                                        {status === 'idle' && repo.repoUrl && !isOpen && (
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={() => setDetailsOpen(prev => ({ ...prev, [index]: true }))}
                                                    className="text-[9px] uppercase tracking-wider font-bold text-slate-500 hover:text-slate-300 transition-colors"
                                                >
                                                    Enter branch / commit manually
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                </div>
                            );
                        })}
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
                </>
            ) : (
                /* ORGANIZATION IMPORT UI */
                <div className="space-y-4 pt-1">
                    {orgData ? (
                        /* --- REVIEW SCREEN --- */
                        <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                            
                            {/* Proposed System Name */}
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">
                                    System Name
                                </label>
                                <input 
                                    type="text" 
                                    value={reviewedSystemName}
                                    onChange={(e) => setReviewedSystemName(e.target.value)}
                                    className="w-full text-xs bg-slate-900/80 border border-slate-700/80 rounded-md py-2 px-2.5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none text-slate-100 transition-all shadow-inner"
                                />
                            </div>

                            {/* Repositories List */}
                            <div className="max-h-[190px] overflow-y-auto pr-1.5 custom-scrollbar space-y-4">
                                
                                {/* Relevant Repos */}
                                <div>
                                    <div className="flex items-center justify-between sticky top-0 bg-slate-900/60 backdrop-blur-md py-2 z-10 border-b border-slate-700/50 mb-2">
                                        <h4 className="text-[9px] font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            Relevant
                                        </h4>
                                        <span className="text-[8px] font-bold bg-teal-500/10 text-teal-300 px-1.5 py-0.5 rounded-full border border-teal-500/20">
                                            {orgData.relevantRepos.length}
                                        </span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {orgData.relevantRepos.map(repo => renderRepoRow(repo, true))}
                                        {orgData.relevantRepos.length === 0 && <p className="text-[9px] text-slate-500 italic px-1">No core microservices found.</p>}
                                    </div>
                                </div>

                                {/* Suggested Repos */}
                                <div>
                                    <div className="flex items-center justify-between sticky top-0 bg-slate-900/60 backdrop-blur-md py-2 z-10 border-b border-slate-700/50 mb-2">
                                        <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                            Suggested
                                        </h4>
                                        <span className="text-[8px] font-bold bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded-full border border-slate-600/50">
                                            {orgData.suggestedRepos.length}
                                        </span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {orgData.suggestedRepos.map(repo => renderRepoRow(repo, false))}
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 pt-3 border-t border-slate-700/50">
                                <button 
                                    onClick={() => updateNodeData(node.id, { orgImportData: undefined })} 
                                    className="flex-1 py-2 text-[9px] font-bold tracking-wider uppercase text-slate-400 bg-slate-800/50 hover:bg-slate-700 hover:text-slate-200 border border-slate-700 rounded-md transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={handleConfirmSelection}
                                    disabled={selectedUrls.size === 0}
                                    className="flex-[2] py-2 text-[9px] font-bold tracking-wider uppercase text-white bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:border disabled:border-slate-700 disabled:cursor-not-allowed rounded-md transition-all shadow-md shadow-purple-900/20 flex items-center justify-center gap-1.5"
                                >
                                    <span>Confirm Selection</span>
                                    <span className="bg-black/20 px-1.5 py-0.5 rounded text-[8px]">{selectedUrls.size}</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* --- ORG INPUT SCREEN --- */
                        <div className="space-y-4 animate-in fade-in duration-300">
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider ml-0.5">
                                    <svg className="w-3 h-3 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                                    </svg>
                                    Organization URL
                                </label>
                                <input 
                                    type="text" 
                                    placeholder="e.g., https://github.com/Arid-Nova" 
                                    value={orgUrl}
                                    onChange={(e) => setOrgUrl(e.target.value)}
                                    className="w-full text-xs bg-slate-900/80 border border-slate-700/80 rounded-md py-2 px-2.5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none text-slate-100 transition-all shadow-inner"
                                    disabled={isAnalyzing}
                                />
                            </div>

                            {error && (
                                <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-md">
                                    <svg className="w-3.5 h-3.5 text-rose-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <p className="text-[10px] text-rose-300/90 leading-tight">{error}</p>
                                </div>
                            )}
                            
                            <button 
                                onClick={handleAnalyzeOrg}
                                disabled={isAnalyzing || !orgUrl.trim()}
                                className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:border disabled:border-slate-700 disabled:text-slate-500 text-white text-[10px] font-bold tracking-wider uppercase rounded-md transition-all shadow-md shadow-purple-900/20 flex items-center justify-center gap-2"
                            >
                                {isAnalyzing ? (
                                    <>
                                        <svg className="animate-spin h-3.5 w-3.5 text-purple-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Analyzing Organization
                                    </>
                                ) : (
                                    "Extract Microservices"
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};