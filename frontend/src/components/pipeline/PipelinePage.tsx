import React from 'react';
import { useNavigate } from 'react-router-dom';

const PipelinePage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-slate-900 text-white p-8">
            <button 
                onClick={() => navigate('/')}
                className="mb-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
                Back to Dashboard
            </button>
            
            <div className="max-w-7xl mx-auto">
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-12 text-center">
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
                    <h1 className="text-3xl font-bold text-white mb-4">Pipeline Visualization</h1>
                    <p className="text-slate-400 max-w-lg mx-auto">
                        This feature is currently under construction. Once configured, you will be able to visualize and manage your workflows using our microservice analysis and visualization tools.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PipelinePage;