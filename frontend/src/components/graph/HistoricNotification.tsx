import React from 'react';

interface HistoryNotificationProps {
    show: boolean;
    systemName: string;
    onDismiss: () => void;
    onLoad: () => void;
}

const HistoryNotification: React.FC<HistoryNotificationProps> = ({ 
    show, 
    systemName, 
    onDismiss, 
    onLoad 
}) => {
    if (!show) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[100] animate-fade-in-down">
            <div className="bg-slate-900 border border-teal-500/50 shadow-[0_0_15px_rgba(20,184,166,0.2)] rounded-lg p-4 flex flex-col gap-3 max-w-sm">
                <div className="flex items-start gap-3">
                    <div className="bg-teal-900/50 p-2 rounded-full text-teal-400">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-slate-200">Historical Data Found</h4>
                        <p className="text-xs text-slate-400 mt-1">
                            We found previous IR snapshots for <strong className="text-teal-400">{systemName}</strong> in the database. Would you like to load them into the timeline?
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 justify-end mt-1 text-xs font-medium">
                    <button 
                        onClick={onDismiss}
                        className="px-3 py-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                    >
                        Dismiss
                    </button>
                    <button 
                        onClick={onLoad}
                        className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded transition-colors shadow-lg shadow-teal-900/50"
                    >
                        Load History
                    </button>
                </div>
            </div>
        </div>
    );
};

export default HistoryNotification;