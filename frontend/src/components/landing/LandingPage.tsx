import React, { useState } from 'react';
import IRFileUpload from '../IRFileUpload'; 
import RepositoryForm from './RepositoryForm';
import { showError } from '../../utils/notifications';

interface Props {
    onIRLoaded: (irData: any) => void;
}

const LandingPage: React.FC<Props> = ({ onIRLoaded }) => {
    const [activeTab, setActiveTab] = useState<'upload' | 'repo'>('upload');
    const [loading, setLoading] = useState(false);

    // Wrapper to handle the file object from IRFileUpload
    const handleFileSelect = async (file: File) => {
        setLoading(true);
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            onIRLoaded(json);
        } catch (error: any) {
            showError(`Failed to parse JSON file: ${error.message}`);
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mb-6"></div>
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-violet-400">
                    Generating Graph...
                </h2>
                <p className="text-slate-400 mt-2">Parsing system architecture</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl"></div>
            </div>

            <div className="relative z-10 w-full max-w-2xl p-8 bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl">
                <h1 className="text-4xl font-extrabold text-center mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-violet-400 to-blue-400 animated-gradient">
                    CIMET IR VISUALIZER
                </h1>
                <p className="text-slate-400 text-center mb-8">
                    Visualize microservice architecture from JSON or Repository
                </p>

                {/* Tab Switcher */}
                <div className="flex p-1 bg-slate-900/60 rounded-xl mb-6 border border-slate-700/50">
                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                            activeTab === 'upload' 
                                ? 'bg-slate-700 text-white shadow-lg' 
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                        }`}
                    >
                        Upload JSON File
                    </button>
                    <button
                        onClick={() => setActiveTab('repo')}
                        className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                            activeTab === 'repo' 
                                ? 'bg-slate-700 text-white shadow-lg' 
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                        }`}
                    >
                        Import from Repository
                    </button>
                </div>

                {/* Content Area */}
                <div className="min-h-[300px] flex items-center justify-center">
                    {activeTab === 'upload' ? (
                        <div className="w-full">
                            <IRFileUpload onFileSelect={handleFileSelect} fullscreen />
                        </div>
                    ) : (
                        <RepositoryForm onIRLoaded={onIRLoaded} setLoading={setLoading} />
                    )}
                </div>
            </div>
        </div>
    );
};

export default LandingPage;