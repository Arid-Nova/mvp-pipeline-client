import React from 'react';

interface DemoWarningModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const DemoWarningModal: React.FC<DemoWarningModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
            <div className="bg-slate-900 border border-amber-500/30 w-full max-w-lg rounded-2xl shadow-[0_0_40px_-10px_rgba(245,158,11,0.15)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                
                {/* Header*/}
                <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-gradient-to-r from-amber-500/10 to-transparent">
                    <div className="flex items-center gap-3 text-amber-500">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <h3 className="text-base font-bold uppercase tracking-widest text-amber-500">
                            Demo Version Notice
                        </h3>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors outline-none">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                
                <div className="p-6 flex flex-col gap-5 text-sm text-slate-300 leading-relaxed">
                    <p className="text-base">
                        You are currently using the <strong className="text-white font-semibold">public demo version</strong> of AridNova. 
                    </p>
                    
                    <div className="flex items-start gap-3 bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 text-amber-200/90 shadow-inner">
                        <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <p>
                            Please <strong className="text-amber-400 font-bold">do not use private, proprietary, or organizational repositories</strong> for analysis in this environment. We highly recommend using open-source, publicly available repositories to explore the tool's features.
                        </p>
                    </div>
                    
                    <p className="text-xs text-slate-400 bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
                        AridNova does not take responsibility for the exposure of private code processed through this public demonstration instance.
                    </p>

                    <div className="flex flex-wrap gap-6 mt-1 text-xs font-medium">
                        <a href="/privacy-policy" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-amber-500 hover:text-amber-400 transition-colors group">
                            Privacy Policy
                            <svg className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </a>
                        <a href="/data-compliance" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-amber-500 hover:text-amber-400 transition-colors group">
                            Data & Compliance
                            <svg className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </a>
                    </div>
                </div>

                <div className="p-5 bg-slate-950/80 border-t border-slate-800 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold px-8 py-2.5 rounded-lg transition-all shadow-[0_0_15px_-3px_rgba(245,158,11,0.3)] hover:shadow-[0_0_20px_-3px_rgba(245,158,11,0.5)] outline-none transform active:scale-95"
                    >
                        I Understand & Agree
                    </button>
                </div>
            </div>
        </div>
    );
};