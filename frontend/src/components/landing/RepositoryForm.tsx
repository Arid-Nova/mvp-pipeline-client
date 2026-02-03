import React, { useState } from 'react';
import { fetchIRFromRepo, RepositoryInput } from '../../services/api';

interface Props {
    onIRLoaded: (irData: any) => void;
    setLoading: (loading: boolean) => void;
}

// Local interface for form state
interface RepoEntry {
    url: string;
    branch: string;
    commitID: string;
}

const RepositoryForm: React.FC<Props> = ({ onIRLoaded, setLoading }) => {
    const [systemName, setSystemName] = useState('');
    
    // Initialize with one empty repository entry
    const [repositories, setRepositories] = useState<RepoEntry[]>([
        { url: '', branch: 'master', commitID: '' }
    ]);

    const handleAddRepo = () => {
        setRepositories([...repositories, { url: '', branch: 'master', commitID: '' }]);
    };

    const handleRemoveRepo = (index: number) => {
        const newRepos = repositories.filter((_, i) => i !== index);
        setRepositories(newRepos);
    };

    const handleRepoChange = (index: number, field: keyof RepoEntry, value: string) => {
        const newRepos = [...repositories];
        newRepos[index] = { ...newRepos[index], [field]: value };
        setRepositories(newRepos);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Map local state to API structure
        const payload: RepositoryInput = {
            systemName: systemName,
            systemRepositories: repositories.map(repo => ({
                repoBranchPair: {
                    repositoryURL: repo.url,
                    branchName: repo.branch
                },
                // Only include commitID if provided
                ...(repo.commitID ? { commitID: repo.commitID } : {})
            }))
        };

        try {
            const irJson = await fetchIRFromRepo(payload);
            onIRLoaded(irJson); 
        } catch (error) {
            setLoading(false);
            // Error handling is managed inside fetchIRFromRepo via notifications
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-2xl text-white mt-6">
            
            {/* Global System Name */}
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                <label className="block text-sm font-bold text-blue-300 mb-1">System Name</label>
                <input 
                    required
                    type="text" 
                    value={systemName}
                    onChange={(e) => setSystemName(e.target.value)}
                    placeholder="e.g. train-ticket-system"
                    className="w-full px-4 py-2 rounded-lg bg-slate-900/50 border border-slate-600 focus:border-blue-500 outline-none transition"
                />
            </div>

            {/* Dynamic Repository List */}
            <div className="max-h-[400px] overflow-y-auto pr-2 flex flex-col gap-3 custom-scrollbar">
                {repositories.map((repo, index) => (
                    <div key={index} className="relative p-4 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:border-slate-600 transition-all">
                        
                        {/* Header for this entry */}
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Repository #{index + 1}
                            </span>
                            
                            {repositories.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => handleRemoveRepo(index)}
                                    className="text-red-400 hover:text-red-300 transition-colors p-1"
                                    title="Remove Repository"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            )}
                        </div>

                        {/* Inputs Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* URL - Full Width on Mobile, spans 2 cols on Desktop */}
                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-slate-300 mb-1">Repository URL</label>
                                <input 
                                    required
                                    type="url" 
                                    value={repo.url}
                                    onChange={(e) => handleRepoChange(index, 'url', e.target.value)}
                                    placeholder="https://github.com/..."
                                    className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900/50 border border-slate-600 focus:border-blue-500 outline-none transition"
                                />
                            </div>

                            {/* Branch */}
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Branch</label>
                                <input 
                                    type="text" 
                                    value={repo.branch}
                                    onChange={(e) => handleRepoChange(index, 'branch', e.target.value)}
                                    className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900/50 border border-slate-600 focus:border-blue-500 outline-none transition"
                                />
                            </div>

                            {/* Commit ID */}
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">Commit ID (Optional)</label>
                                <input 
                                    type="text" 
                                    value={repo.commitID}
                                    onChange={(e) => handleRepoChange(index, 'commitID', e.target.value)}
                                    placeholder="Latest"
                                    className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900/50 border border-slate-600 focus:border-blue-500 outline-none transition"
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Actions Area */}
            <div className="flex gap-3 mt-2">
                <button
                    type="button"
                    onClick={handleAddRepo}
                    className="flex-1 py-2.5 rounded-xl border border-dashed border-slate-500 text-slate-400 hover:text-white hover:border-slate-300 hover:bg-slate-800 transition-all text-sm font-semibold flex items-center justify-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
                    </svg>
                    Add Another Repository
                </button>

                <button 
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-blue-900/20 text-sm"
                >
                    Generate Graph
                </button>
            </div>
        </form>
    );
};

export default RepositoryForm;