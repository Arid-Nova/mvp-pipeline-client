import React, { useEffect, useState } from 'react';
import { fetchIRVersions, getSystemVersionMetadata } from '../../services/api';

interface VersionManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    systemName: string;
    onSave: (version: string) => Promise<void>;
    isSaving: boolean;
}

export const VersionManagerModal: React.FC<VersionManagerModalProps> = ({ isOpen, onClose, systemName, onSave, isSaving }) => {
    const [versionInput, setVersionInput] = useState('');
    const [suggestedVersions, setSuggestedVersions] = useState<string[]>([]);
    const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
    
    const [allHistoryData, setAllHistoryData] = useState<any[]>([]);
    const [historyPage, setHistoryPage] = useState(0);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    
    const ITEMS_PER_PAGE = 5;
    const datalistId = "modal-version-suggestions";

    useEffect(() => {
        if (!isOpen) return;

        const loadData = async () => {
            // 1. Fetch Suggestions
            setIsLoadingSuggestion(true);
            const meta = await getSystemVersionMetadata(systemName);
            if (meta && meta.suggestedVersions && meta.suggestedVersions.length > 0) {
                setSuggestedVersions(meta.suggestedVersions);
                setVersionInput(meta.suggestedVersions[0]); 
            }
            setIsLoadingSuggestion(false);

            // 2. Fetch History
            setIsLoadingHistory(true);
            try {
                const data = await fetchIRVersions(systemName);
                if (data) {
                    setAllHistoryData(data);
                    setHistoryPage(0);
                }
            } catch (error) {
                console.error(error);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (/^\d+\.\d+\.\d+$/.test(versionInput)) {
            await onSave(versionInput);
            onClose();
        }
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 rounded-lg">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-lg shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-800/50">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Manage Version</h3>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-white outline-none">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="p-4 flex flex-col gap-4">
                    {/* ASSIGNMENT FORM */}
                    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                        <label className="text-[10px] uppercase text-amber-500 font-bold tracking-wider">
                            Assign New Version
                        </label>
                        <div className="flex items-center gap-2">
                            <input 
                                type="text" 
                                list={datalistId}
                                value={versionInput}
                                onChange={(e) => setVersionInput(e.target.value.replace(/[^0-9.]/g, ''))}
                                disabled={isLoadingSuggestion || isSaving}
                                pattern="^\d+\.\d+\.\d+$"
                                title="Must be strictly numbers and dots (e.g. 1.0.0)"
                                className={`bg-slate-800 border text-sm text-white rounded px-3 py-1.5 min-w-0 flex-1 outline-none transition-colors disabled:opacity-50 ${
                                    versionInput && !/^\d+\.\d+\.\d+$/.test(versionInput)
                                        ? 'border-red-500/50 focus:border-red-500'
                                        : 'border-slate-600 focus:border-yellow-500'
                                }`}
                                placeholder={isLoadingSuggestion ? "Loading suggestions..." : "e.g. 1.0.0"}
                            />
                            <datalist id={datalistId}>
                                {suggestedVersions.map((v) => <option key={v} value={v} />)}
                            </datalist>

                            <button
                                type="submit"
                                disabled={isLoadingSuggestion || isSaving || !/^\d+\.\d+\.\d+$/.test(versionInput)}
                                className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded transition-colors disabled:opacity-50 outline-none flex items-center justify-center w-16"
                            >
                                {isSaving ? '...' : 'Save'}
                            </button>
                        </div>
                    </form>

                    <div className="h-px w-full bg-slate-800"></div>

                    {/* HISTORY LIST */}
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
                                    onClick={() => setVersionInput(item.version)}
                                    className="flex justify-between items-center bg-slate-800/50 p-2 rounded border border-slate-700/50 cursor-pointer hover:bg-slate-800 hover:border-slate-600 transition-all"
                                >
                                    <span className="text-xs font-mono text-teal-400 font-medium">v{item.version}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Unknown Date'}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* PAGINATION */}
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