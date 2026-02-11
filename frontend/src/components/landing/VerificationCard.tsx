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
    const [repoURL, setRepoURL] = useState('');
    const [branch, setBranch] = useState('master');
    const [commitID, setCommitID] = useState('');
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!irJson) {
            showError("Please upload the IR JSON file.");
            return;
        }

        setLoading(true);

        const payload: VerificationInput = {
            systemName,
            repoURL,
            branch,
            commitId: commitID || "HEAD",
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
                <div>
                    <input required type="url" value={repoURL} onChange={(e) => setRepoURL(e.target.value)}
                        placeholder="Repository URL"
                        className="w-full px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-600 focus:border-emerald-500 outline-none transition" />
                </div>
                <div className="flex gap-4">
                    <input type="text" value={branch} onChange={(e) => setBranch(e.target.value)}
                        placeholder="Branch (default: master)"
                        className="flex-1 px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-600 focus:border-emerald-500 outline-none transition" />
                    <input type="text" value={commitID} onChange={(e) => setCommitID(e.target.value)}
                        placeholder="Commit ID"
                        className="flex-1 px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-600 focus:border-emerald-500 outline-none transition" />
                </div>
                
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