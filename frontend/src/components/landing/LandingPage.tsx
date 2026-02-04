import React, { useState } from 'react';
import IRFileUpload from '../IRFileUpload'; 
import RepositoryForm from './RepositoryForm';
import VerificationCard from './VerificationCard'; // New Component
import { showError } from '../../utils/notifications';

interface Props {
    onIRLoaded: (irData: any) => void;
}

const LandingPage: React.FC<Props> = ({ onIRLoaded }) => {
    // Top level mode: 'visualize' OR 'verify'
    const [mode, setMode] = useState<'visualize' | 'verify'>('visualize');
    
    // Sub-tabs for Visualizer
    const [vizTab, setVizTab] = useState<'upload' | 'repo'>('upload');
    const [loading, setLoading] = useState(false);

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
                    Processing...
                </h2>
                <p className="text-slate-400 mt-2">
                    {mode === 'verify' ? "Running formal verification solver..." : "Parsing system architecture..."}
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 relative overflow-hidden font-sans">
             {/* Background Blob Decoration */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className={`absolute transition-all duration-1000 top-1/4 ${mode==='visualize'?'left-1/4 bg-blue-500/10':'left-3/4 bg-emerald-500/10'} w-96 h-96 rounded-full blur-3xl`}></div>
                <div className={`absolute transition-all duration-1000 bottom-1/4 ${mode==='visualize'?'right-1/4 bg-violet-500/10':'right-3/4 bg-teal-500/10'} w-96 h-96 rounded-full blur-3xl`}></div>
            </div>

            {/* MAIN CARD CONTAINER */}
            <div className="relative z-10 w-full max-w-5xl bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                
                {/* Header / Switcher */}
                <div className="flex border-b border-slate-700/50">
                    <button 
                        onClick={() => setMode('visualize')}
                        className={`flex-1 py-6 text-lg font-bold uppercase tracking-wider transition-all duration-300
                        ${mode === 'visualize' 
                            ? 'bg-slate-800/80 text-blue-400 border-b-4 border-blue-500' 
                            : 'bg-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
                    >
                        CIMET IR Visualizer
                    </button>
                    <button 
                        onClick={() => setMode('verify')}
                        className={`flex-1 py-6 text-lg font-bold uppercase tracking-wider transition-all duration-300
                        ${mode === 'verify' 
                            ? 'bg-slate-800/80 text-emerald-400 border-b-4 border-emerald-500' 
                            : 'bg-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
                    >
                        Formal Verification
                    </button>
                </div>

                {/* Content Body */}
                <div className="p-8 min-h-[500px] transition-all duration-500">
                    
                    {/* CARD 1: VISUALIZER */}
                    {mode === 'visualize' && (
                        <div className="animate-in fade-in slide-in-from-left-4 duration-300 h-full flex flex-col items-center">
                            <div className="flex p-1 bg-slate-900/60 rounded-xl mb-8 border border-slate-700/50 w-full max-w-md">
                                <button onClick={() => setVizTab('upload')}
                                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${vizTab === 'upload' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                                    Upload JSON
                                </button>
                                <button onClick={() => setVizTab('repo')}
                                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${vizTab === 'repo' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                                    Import Repository
                                </button>
                            </div>
                            
                            <div className="w-full max-w-3xl flex-1 flex flex-col justify-center">
                                {vizTab === 'upload' ? (
                                    <IRFileUpload onFileSelect={handleFileSelect} fullscreen={true} />
                                ) : (
                                    <RepositoryForm onIRLoaded={onIRLoaded} setLoading={setLoading} />
                                )}
                            </div>
                        </div>
                    )}

                    {/* CARD 2: VERIFICATION */}
                    {mode === 'verify' && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300 h-full">
                            <div className="h-full flex flex-col">
                                <p className="text-slate-400 text-center mb-8">
                                    Verify whether the microservice authorization policy is consistent across the system.
                                </p>
                                <VerificationCard setLoading={setLoading} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LandingPage;