import React, { useEffect, useState } from 'react';
import { fetchIRVersions, getSystemVersionMetadata } from '../../services/api';

interface VersionManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    systemName: string;
    onSave: (version: string, description: string) => Promise<void>;
    isSaving: boolean;
}

export const VersionManagerModal: React.FC<VersionManagerModalProps> = ({ isOpen, onClose, systemName, onSave, isSaving }) => {
    const [step, setStep] = useState<'input' | 'confirm'>('input');
    
    const [versionInput, setVersionInput] = useState('');
    const [descriptionInput, setDescriptionInput] = useState('');
    const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);

    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestedVersions, setSuggestedVersions] = useState<string[]>([]);
    
    const [allHistoryData, setAllHistoryData] = useState<any[]>([]);
    const [historyPage, setHistoryPage] = useState(0);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    
    const ITEMS_PER_PAGE = 5;

    useEffect(() => {
        if (!isOpen) {
            setStep('input');
            setDescriptionInput('');
            return;
        }

        const loadData = async () => {
            setIsLoadingSuggestion(true);
            const meta = await getSystemVersionMetadata(systemName);
            if (meta && meta.suggestedVersions && meta.suggestedVersions.length > 0) {
                setSuggestedVersions(meta.suggestedVersions);
                setVersionInput(meta.suggestedVersions[0]); 
            }
            setIsLoadingSuggestion(false);

            setIsLoadingHistory(true);
            try {
                const data = await fetchIRVersions(systemName);
                if (data) {
                    setAllHistoryData(data);
                    setHistoryPage(0);
                }
            } catch (error) {
                // console.error(error);
            } finally {
                setIsLoadingHistory(false);
            }
        };

        loadData();
    }, [isOpen, systemName]);

    if (!isOpen) return null;

    const totalPages = Math.max(1, Math.ceil(allHistoryData.length / ITEMS_PER_PAGE));
    const currentPaginatedData = allHistoryData.slice(
        historyPage * ITEMS_PER_PAGE, 
        (historyPage + 1) * ITEMS_PER_PAGE
    );

    // Initial button or form enter submission
    const handleNextStep = (e: React.FormEvent) => {
        e.preventDefault();
        if (/^\d+\.\d+\.\d+$/.test(versionInput)) {
            setStep('confirm'); 
        }
    };

    // Final confirmation
    const handleFinalSubmit = async () => {
        await onSave(versionInput, descriptionInput);
        onClose();
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 rounded-lg">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header view */}
                <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-800/50">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                        {step === 'input' ? 'Manage Version' : 'Confirm Version'}
                    </h3>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-white outline-none">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="p-4 flex flex-col gap-4">
                    {step === 'input' ? (
                        <form onSubmit={handleNextStep} className="flex flex-col gap-2">
                            <label className="text-[10px] uppercase text-amber-500 font-bold tracking-wider">
                                Assign New Version
                            </label>
                            
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 relative">
                                    <div className="relative flex-1">
                                        <input 
                                            type="text" 
                                            value={versionInput}
                                            onChange={(e) => setVersionInput(e.target.value.replace(/[^0-9.]/g, ''))}
                                            onFocus={() => setShowSuggestions(true)}
                                            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                                            disabled={isLoadingSuggestion || isSaving}
                                            className={`bg-slate-800 border text-sm text-white rounded pl-3 pr-7 h-9 min-w-0 w-full outline-none transition-all disabled:opacity-50 ${
                                                versionInput.length > 0 && !/^\d+\.\d+\.\d+$/.test(versionInput)
                                                    ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500' 
                                                    : 'border-slate-600 focus:border-amber-500'
                                            }`}
                                            placeholder={isLoadingSuggestion ? "Loading suggestions..." : "e.g. 1.0.0"}
                                        />

                                        {!isLoadingSuggestion && suggestedVersions.length > 0 && (
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                                <svg className={`w-3 h-3 transition-transform duration-200 ${showSuggestions ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        )}

                                        {showSuggestions && suggestedVersions.length > 0 && (
                                            <div className="absolute left-0 right-0 top-full mt-1 bg-slate-950 border border-slate-700 rounded-md shadow-2xl z-[150] max-h-36 overflow-y-auto custom-scrollbar divide-y divide-slate-800/50">
                                                <div className="text-[8px] uppercase text-slate-500 font-bold tracking-wider p-1.5 bg-slate-900/60 select-none">
                                                    Suggested Options
                                                </div>
                                                {suggestedVersions.map((v) => (
                                                    <button
                                                        key={v}
                                                        type="button"
                                                        onMouseDown={() => setVersionInput(v)}
                                                        className={`w-full text-left px-2.5 py-1.5 text-xs transition-colors block ${
                                                            versionInput === v 
                                                                ? 'bg-amber-500/10 text-amber-400 font-medium' 
                                                                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                                        }`}
                                                    >
                                                        v{v}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoadingSuggestion || isSaving || !/^\d+\.\d+\.\d+$/.test(versionInput)}
                                        className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-3 h-9 rounded transition-colors disabled:opacity-50 outline-none flex items-center justify-center w-16 shrink-0"
                                    >
                                        Save
                                    </button>
                                </div>

                                {versionInput.length > 0 && !/^\d+\.\d+\.\d+$/.test(versionInput) && (
                                    <div className="flex items-center gap-1 mt-0.5 text-red-400 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <span className="text-[10px] font-medium">Must be e.g., 1.0.0</span>
                                    </div>
                                )}
                            </div>
                        </form>
                    ) : (
                        <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-right-3 duration-200">
                            <div className="bg-slate-950 border border-slate-800 rounded p-3 text-center">
                                <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider block mb-1">Target Version Selected</span>
                                <span className="text-xl font-mono text-amber-400 font-bold">v{versionInput}</span>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                                    Description <span className="text-slate-500 lowercase">(optional)</span>
                                </label>
                                <textarea
                                    value={descriptionInput}
                                    onChange={(e) => setDescriptionInput(e.target.value)}
                                    placeholder="Enter notes for reference..."
                                    rows={3}
                                    className="bg-slate-800 border border-slate-600 text-xs text-white rounded p-2 outline-none resize-none focus:border-yellow-500 transition-colors"
                                />
                            </div>

                            <div className="flex items-center gap-2 mt-1">
                                <button
                                    type="button"
                                    onClick={() => setStep('input')}
                                    className="flex-1 border border-slate-600 hover:bg-slate-800 text-slate-300 text-xs font-bold py-2 rounded transition-colors"
                                >
                                    Back
                                </button>
                                <button
                                    type="button"
                                    onClick={handleFinalSubmit}
                                    disabled={isSaving}
                                    className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold py-2 rounded transition-colors flex items-center justify-center"
                                >
                                    {isSaving ? 'Saving...' : 'Confirm'}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="h-px w-full bg-slate-800"></div>

                    {/* HISTORY LIST PANELS */}
                    <div className="flex flex-col gap-2 min-h-[140px]">
                        <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">
                            Version History
                        </span>
                        {isLoadingHistory ? (
                            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">Loading history...</div>
                        ) : currentPaginatedData.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">No version history found.</div>
                        ) : (
                            currentPaginatedData.map((item, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => {
                                        if (step === 'input') setVersionInput(item.version);
                                    }}
                                    className="flex justify-between items-center bg-slate-800/50 p-2 rounded border border-slate-700/50 cursor-pointer hover:bg-slate-800 hover:border-slate-600 transition-all"
                                >
                                    <div className="relative group/tooltip">
                                        <span className={`text-xs font-mono text-teal-400 font-medium tracking-wide transition-all ${
                                            item.description 
                                                ? 'border-b border-dashed border-teal-400/60 cursor-help pb-0.5' 
                                                : ''
                                        }`}>
                                            v{item.version}
                                        </span>
                                        
                                        {item.description && (
                                            <div className="absolute left-0 bottom-full mb-2 hidden group-hover/tooltip:block w-56 p-2 bg-slate-950 border border-slate-700 text-[11px] text-slate-300 rounded shadow-2xl z-50 pointer-events-none break-words animate-in fade-in slide-in-from-bottom-1 duration-150">
                                                <p className="font-bold text-[9px] uppercase tracking-wider text-slate-500 mb-1">
                                                    Snapshot Info:
                                                </p>
                                                {item.description}
                                            </div>
                                        )}
                                    </div>

                                    <span className="text-[10px] text-slate-400 font-mono">
                                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Unknown Date'}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* PAGINATION CONTROLS */}
                <div className="flex items-center justify-between p-2 bg-slate-950 border-t border-slate-800">
                    <button 
                        type="button"
                        disabled={historyPage === 0 || isLoadingHistory} 
                        onClick={() => setHistoryPage(p => p - 1)}
                        className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded disabled:opacity-50 transition-colors outline-none"
                    >
                        Prev
                    </button>
                    <span className="text-[10px] text-slate-500 select-none">Page {historyPage + 1} of {totalPages}</span>
                    <button 
                        type="button"
                        disabled={historyPage >= totalPages - 1 || isLoadingHistory} 
                        onClick={() => setHistoryPage(p => p + 1)}
                        className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded disabled:opacity-50 transition-colors outline-none"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
};