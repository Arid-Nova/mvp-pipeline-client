import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { verifySystem, VerificationInput } from '../../services/api';
import IRFileUpload from '../IRFileUpload';
import { showSuccess, showError } from '../../utils/notifications';

interface Props {
    setLoading: (loading: boolean) => void;
}

const VerificationCard: React.FC<Props> = ({ setLoading }) => {
    const navigate = useNavigate();
    
    const [systemName, setSystemName] = useState('');
    const [repositories, setRepositories] = useState([{ repoUrl: '', branch: 'master', commitId: '' }]);
    const [irJson, setIrJson] = useState<any>(null);

    const handleFileSelect = async (file: File) => {
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            setIrJson(json);
            showSuccess("IR File attached successfully!");
        } catch (error) {
            showError("Invalid JSON file.");
        }
    };

    const updateRepo = (index: number, field: string, value: string) => {
        const newRepos = [...repositories];
        newRepos[index] = { ...newRepos[index], [field]: value };
        setRepositories(newRepos);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!irJson) {
            showError("Please upload the IR JSON file.");
            return;
        }

        if (repositories.some(r => !r.repoUrl.trim())) {
            showError("Please provide a valid URL for all repositories.");
            return;
        }

        setLoading(true);

        const payload: VerificationInput = {
            systemName,
            repos: repositories.map(r => ({
                repoURL: r.repoUrl,
                branch: r.branch || 'master',
                commitId: r.commitId || "HEAD"
            })),
            ir: irJson
        };

        try {
            const result = await verifySystem(payload);
            setLoading(false);
            // Navigate to results page with data in state
            navigate('/verification-results', { state: { result, systemInfo: payload } });
        } catch (error) {
            setLoading(false);
        }
    };

    return (
        <div className="w-full h-full flex flex-col md:flex-row gap-8 p-2">
            {/* Left Column: Form Inputs */}
            <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-5 text-white">
                <div>
                    <label className="block text-sm font-bold text-emerald-400 mb-2 uppercase tracking-wide">System Details</label>
                    <input required type="text" value={systemName} onChange={(e) => setSystemName(e.target.value)}
                        placeholder="System Name (e.g. train-ticket)"
                        className="w-full px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-600 focus:border-emerald-500 outline-none transition" />
                </div>
                
                {/* MULTI-REPO UI BLOCK */}
                <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {repositories.map((repo, index) => (
                        <div key={`repo-${index}`} className="p-3 bg-slate-900/40 border border-slate-700/50 rounded-xl space-y-3 relative">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    Repository {index + 1}
                                </span>
                                {repositories.length > 1 && (
                                    <button 
                                        type="button"
                                        onClick={() => setRepositories(repositories.filter((_, i) => i !== index))}
                                        className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors text-sm"
                                    >✕</button>
                                )}
                            </div>
                            
                            <input required type="url" value={repo.repoUrl} onChange={(e) => updateRepo(index, 'repoUrl', e.target.value)}
                                placeholder="Repository URL"
                                className="w-full px-4 py-2 text-sm rounded-lg bg-slate-950/50 border border-slate-600 focus:border-emerald-500 outline-none transition" />
                            
                            <div className="flex gap-3">
                                <input type="text" value={repo.branch} onChange={(e) => updateRepo(index, 'branch', e.target.value)}
                                    placeholder="Branch (master)"
                                    className="flex-1 px-4 py-2 text-sm rounded-lg bg-slate-950/50 border border-slate-600 focus:border-emerald-500 outline-none transition" />
                                <input type="text" value={repo.commitId} onChange={(e) => updateRepo(index, 'commitId', e.target.value)}
                                    placeholder="Commit (Latest)"
                                    className="flex-1 px-4 py-2 text-sm rounded-lg bg-slate-950/50 border border-slate-600 focus:border-emerald-500 outline-none transition" />
                            </div>
                        </div>
                    ))}
                </div>

                <button 
                    type="button" 
                    onClick={() => setRepositories([...repositories, { repoUrl: '', branch: 'master', commitId: '' }])}
                    className="w-full py-2 border border-dashed border-emerald-700/50 text-emerald-500 rounded-xl hover:bg-emerald-500/10 transition-colors text-xs font-bold uppercase tracking-widest"
                >
                    + Add Repository
                </button>
                {/* END MULTI-REPO UI BLOCK */}
                
                <div className="mt-auto pt-4">
                    <button type="submit" 
                        className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-emerald-900/30 transform hover:scale-[1.02]">
                        RUN VERIFICATION
                    </button>
                </div>
            </form>

            {/* Right Column: File Upload */}
            <div className="flex-1 flex flex-col">
                <label className="block text-sm font-bold text-emerald-400 mb-2 uppercase tracking-wide">Upload IR JSON</label>
                <div className="flex-1 min-h-[250px] relative">
                    <IRFileUpload onFileSelect={handleFileSelect} fullscreen={true} />
                    
                    {irJson && (
                        <div className="absolute top-2 right-2 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                            ✓ FILE LOADED
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VerificationCard;