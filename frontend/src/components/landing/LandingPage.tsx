import React, { useState, useEffect } from 'react';
import IRFileUpload from '../IRFileUpload'; 
import RepositoryForm from './RepositoryForm';
import { useNavigate, useLocation } from 'react-router-dom';
import VerificationCard from './VerificationCard'; 
import { showError } from '../../utils/notifications';
import { AEGIS_API, aegisDashboardURL } from '../../utils/axiosSetup';

interface Props {
    onIRLoaded: (irData: any) => void;
}

const LandingPage: React.FC<Props> = ({ onIRLoaded }) => {
    // Top level mode: 'visualize' OR 'verify'
    const [mode, setMode] = useState<'visualize' | 'verify' | 'aegis' | 'pipeline'>('visualize');
    const navigate = useNavigate();
    const location = useLocation();
    
    // Sub-tabs for Visualizer
    const [vizTab, setVizTab] = useState<'upload' | 'repo'>('upload');
    const [loading, setLoading] = useState(false);

    // Aegis specific state
    const [aegisRepoUrl, setAegisRepoUrl] = useState('');
    const [aegisBranch, setAegisBranch] = useState('');

    // Check for incoming IR data from Pipeline
    useEffect(() => {
        if (location.state && location.state.irData) {
            console.log("IR Data received from navigation state", location.state.irData);
            onIRLoaded(location.state.irData);
            // Clear state to prevent loop on refresh
            window.history.replaceState({}, document.title);
        }
    }, [location.state, onIRLoaded]);

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

    const handleAegisUpload = async (file: File) => {
        if (!aegisRepoUrl || !aegisBranch) {
            showError("Please specify both Repository URL and Branch Name.");
            return;
        }

        setLoading(true);
        try {
            const text = await file.text();
            const irJson = JSON.parse(text); 

            // Construct the specific payload wrapper for Aegis
            const payload = {
                branch: aegisBranch,
                repoUrl: aegisRepoUrl,
                ir: irJson
            };

            try {
                await AEGIS_API.post('/analyze', payload);
                window.location.href = `${aegisDashboardURL()}/visualize?commitID=${encodeURIComponent(irJson.commitID)}`;
            } catch (err: any) {
                throw new Error(`Engine returned status ${err.response?.status ?? 'unknown'}`);
            }

        } catch (error: any) {
            showError(`Aegis Analysis Failed: ${error.message}`);
            setLoading(false); 
        }
    };

    const getLoadingText = () => {
        if (mode === 'verify') return "Running formal verification solver...";
        if (mode === 'aegis') return "Aegis engine analyzing introspection data...";
        return "Parsing system architecture...";
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mb-6"></div>
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-violet-400">
                    Processing...
                </h2>
                <p className="text-slate-400 mt-2">
                    {getLoadingText()}
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 relative overflow-hidden font-sans">
             {/* Background Blob Decoration */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className={`absolute transition-all duration-1000 top-1/4 w-96 h-96 rounded-full blur-3xl
                    ${mode === 'visualize' ? 'left-1/4 bg-blue-500/10' : 
                      mode === 'verify' ? 'left-3/4 bg-emerald-500/10' : 
                      'left-1/2 bg-amber-500/10' }
                `}></div>
                <div className={`absolute transition-all duration-1000 bottom-1/4 w-96 h-96 rounded-full blur-3xl
                    ${mode === 'visualize' ? 'right-1/4 bg-violet-500/10' : 
                      mode === 'verify' ? 'right-3/4 bg-teal-500/10' : 
                      'right-1/2 bg-rose-500/10'}
                `}></div>
            </div>

            {/* GLOBAL TITLE */}
            <div className="relative z-10 flex items-center justify-center gap-4 mb-12 drop-shadow-lg px-4">
                
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 via-violet-500 to-cyan-500 shadow-xl shadow-cyan-500/30 border border-white/10 group">
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        
                        {/* Outer Hexagon (Rotating slowly like a network hub) */}
                        <path 
                            className="origin-center animate-[spin_12s_linear_infinite]" 
                            strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                            d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" 
                        />
                        
                        {/* Inner Nova Star (Pulsing to represent the active core) */}
                        <path 
                            className="animate-pulse origin-center" 
                            strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M12 7l1.5 3.5 3.5 1.5-3.5 1.5L12 17l-1.5-3.5-3.5-1.5 3.5-1.5L12 7z" 
                        />
                        
                        {/* Data Pipeline Connections (Pulsing out of sync with the star) */}
                        <path 
                            className="animate-pulse origin-center" 
                            style={{ animationDelay: '500ms' }}
                            strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} opacity={0.5} 
                            d="M12 3v4M20 7.5l-3 1.5M20 16.5l-3-1.5M12 21v-4M4 16.5l3-1.5M4 7.5l3 1.5" 
                        />
                    </svg>
                </div>

                <h1 className="text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-400 to-teal-400">
                    AridNova
                </h1>
                
                <span className="text-slate-600 font-light text-5xl mx-2 mb-2">|</span>
                
                <h2 className="text-3xl font-extrabold text-slate-400 tracking-tight mt-2">
                    Analysis Toolkit Explorer
                </h2>
                
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
                        IR Visualizer
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
                    <button 
                        onClick={() => setMode('aegis')}
                        className={`flex-1 py-6 text-lg font-bold uppercase tracking-wider transition-all duration-300
                        ${mode === 'aegis' 
                            ? 'bg-slate-800/80 text-amber-400 border-b-4 border-amber-500' 
                            : 'bg-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
                    >
                        Aegis
                    </button>
                    <button 
                        onClick={() => setMode('pipeline')}
                        className={`flex-1 py-6 text-lg font-bold uppercase tracking-wider transition-all duration-300
                        ${mode === 'pipeline' 
                            ? 'bg-slate-800/80 text-indigo-400 border-b-4 border-indigo-500' 
                            : 'bg-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
                    >
                        Create Pipeline
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
                                    Import Repositories
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

                    {/* CARD 3: AEGIS */}
                    {mode === 'aegis' && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300 h-full flex flex-col items-center flex-1">
                            <div className="text-center mb-10 max-w-2xl">
                                <h3 className="text-2xl font-semibold text-amber-400 mb-2">Neuro-Symbolic Introspection Engine</h3>
                                <p className="text-slate-400">
                                    Upload an Intermediate Representation to detect latent vulnerabilities via the Aegis engine.
                                </p>
                            </div>
                            
                            <div className="w-full max-w-3xl mb-10 flex flex-col gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-bold text-slate-300">Repository URL</label>
                                    <input 
                                        type="text" 
                                        className="bg-slate-900/60 border border-slate-600 text-white rounded-lg p-3 focus:border-amber-500 focus:outline-none transition-colors w-full"
                                        placeholder="https://github.com/..."
                                        value={aegisRepoUrl}
                                        onChange={(e) => setAegisRepoUrl(e.target.value)}
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-bold text-slate-300">Branch Name</label>
                                    <input 
                                        type="text" 
                                        className="bg-slate-900/60 border border-slate-600 text-white rounded-lg p-3 focus:border-amber-500 focus:outline-none transition-colors w-full"
                                        placeholder="master"
                                        value={aegisBranch}
                                        onChange={(e) => setAegisBranch(e.target.value)}
                                    />
                                </div>
                            </div>
                            
                            <div className="w-full max-w-3xl flex-1 flex flex-col justify-center">
                                <IRFileUpload 
                                    onFileSelect={handleAegisUpload} 
                                    fullscreen={true}
                                />
                            </div>
                        </div>
                    )}

                    {/* CARD 4: PIPELINE */}
                     {mode === 'pipeline' && (
                        <div className="animate-in fade-in slide-in-from-right-4 duration-300 h-full flex flex-col items-center flex-1 justify-center">
                             <div className="text-center mb-10 max-w-2xl">
                                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-indigo-500/20 text-indigo-400 mb-6">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="h-10 w-10"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth={1.5}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        {/* Pipeline stages */}
                                        <circle cx="4" cy="12" r="2" />
                                        <circle cx="12" cy="12" r="2" />
                                        <circle cx="20" cy="12" r="2" />

                                        {/* Connections */}
                                        <line x1="6" y1="12" x2="10" y2="12" />
                                        <line x1="14" y1="12" x2="18" y2="12" />
                                    </svg>
                                </div>
                                <h3 className="text-2xl font-semibold text-indigo-400 mb-2">Create Your Pipeline</h3>
                                <p className="text-slate-400 mb-8">
                                    Create your own microservice system analysis pipeline using our toolkit.
                                </p>
                                
                                <button 
                                    onClick={() => navigate('/pipeline')}
                                    className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-900/30 transform hover:scale-[1.02] transition-all flex items-center gap-2 mx-auto"
                                >
                                    <span>Launch Pipeline Wizard</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LandingPage;