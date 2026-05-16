export const MobileWarning = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-slate-200 p-6 text-center">
            <svg className="w-20 h-20 text-slate-500 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            
            <h1 className="text-3xl font-bold text-white mb-4">
                Larger Screen Required
            </h1>
            
            <p className="text-slate-400 max-w-md text-lg leading-relaxed">
                This platform features complex node-based pipelines and 3D architectural visualizations. 
                <br /><br />
                For the optimal experience, please open this application on a <strong>tablet, laptop, or desktop</strong>.
            </p>
        </div>
    );
};