import React, { useEffect, useState } from 'react';
import { fetchIRVersions, deleteIR } from '../../services/api';

interface VersionSelectorModalProps {
    isOpen: boolean;
    systemName: string;
    onClose: () => void;
    onLoadSpecificVersions: (selectedIds: string[]) => void;
}

const VersionSelectorModal: React.FC<VersionSelectorModalProps> = ({ isOpen, systemName, onClose, onLoadSpecificVersions }) => {
    const [versions, setVersions] = useState<{ id: string, version: string, createdAt?: any, description?: string; }[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);

    // Tracking the ID of the IR currently being deleted
    const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
    // Tracking the ID of the IR pending user confirmation
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && systemName) {
            setIsLoading(true);
            fetchIRVersions(systemName)
                .then(res => setVersions(res))
                .catch(err => console.error("Failed to fetch snapshots!"))
                .finally(() => setIsLoading(false));
        } else {
            setVersions([]);
            setSelectedIds(new Set());
        }
    }, [isOpen, systemName]);

    if (!isOpen) return null;

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    // Deleting versioned IRs with confirmation
    const handleDeleteClick = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDeleteConfirmId(id);
    };

    const confirmDelete = async () => {
        if (!deleteConfirmId) return;
        
        const id = deleteConfirmId;
        setDeleteConfirmId(null); 
        setIsDeletingId(id);      

        try {
            await deleteIR(id);
            
            setVersions(prev => prev.filter(v => v.id !== id));
            
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
        } catch (err) {
            // console.error("Failed to delete snapshot:", err);
        } finally {
            setIsDeletingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="relative bg-slate-900 border border-teal-500/50 shadow-[0_0_25px_rgba(20,184,166,0.15)] rounded-xl p-6 flex flex-col gap-4 w-full max-w-md overflow-hidden">
                
                {deleteConfirmId && (
                    <div className="absolute inset-0 z-[210] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm animate-fade-in">
                        <div className="bg-slate-800 border border-red-500/50 shadow-[0_0_25px_rgba(239,68,68,0.15)] rounded-xl p-5 flex flex-col gap-3 w-10/12 text-center">
                            <div className="mx-auto flex items-center justify-center w-10 h-10 rounded-full bg-red-500/20 mb-1">
                                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h4 className="text-base font-bold text-slate-200">Delete Snapshot?</h4>
                            <p className="text-xs text-slate-400 mb-2">Are you sure you want to permanently delete this snapshot? This action cannot be undone.</p>
                            
                            <div className="flex gap-3 mt-2">
                                <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors">
                                    Cancel
                                </button>
                                <button onClick={confirmDelete} className="flex-1 px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded transition-colors shadow-lg shadow-red-900/50">
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <h3 className="text-lg font-bold text-slate-200 border-b border-slate-700/50 pb-2">
                    Select Snapshots for <span className="text-teal-400">{systemName}</span>
                </h3>

                {isLoading ? (
                    <div className="text-slate-400 text-sm py-4 text-center">Loading snapshots...</div>
                ) : (
                    <div className="flex flex-col gap-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                        {versions.length === 0 ? (
                            <div className="text-slate-500 text-sm italic text-center">No snapshots found.</div>
                        ) : (
                            versions.map((v, index) => (
                                <label 
                                    key={v.id} 
                                    className="group flex items-center justify-between p-2 hover:bg-slate-800/50 rounded cursor-pointer transition-colors border border-transparent hover:border-slate-700/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.has(v.id)}
                                            onChange={() => toggleSelection(v.id)}
                                            className="w-4 h-4 accent-teal-500 cursor-pointer bg-slate-800 border-slate-600 rounded"
                                            disabled={isDeletingId === v.id || deleteConfirmId !== null}
                                        />
                                        <div className="relative group/tooltip flex items-center">
                                            <span className={`font-mono text-sm transition-all ${
                                                isDeletingId === v.id 
                                                    ? 'text-slate-500 line-through'
                                                    : v.description 
                                                        ? 'text-teal-400 font-medium border-b border-dashed border-teal-400/60 cursor-help pb-0.5' 
                                                        : 'text-slate-300'
                                            }`}>
                                                Snapshot {v.version}
                                            </span>
                                            
                                            {v.description && (
                                                <div className={`absolute left-0 hidden group-hover/tooltip:block w-56 p-2 bg-slate-950 border border-slate-700 text-[11px] text-slate-300 rounded shadow-2xl z-[100] pointer-events-none break-words animate-in fade-in duration-150 ${
                                                    index === 0 
                                                        ? 'top-full mt-2 slide-in-from-top-1' 
                                                        : 'bottom-full mb-2 slide-in-from-bottom-1'
                                                }`}>
                                                    <p className="font-bold text-[9px] uppercase tracking-wider text-slate-500 mb-1">
                                                        Info:
                                                    </p>
                                                    {v.description}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-4">
                                        {v.createdAt && (
                                            <span className="text-xs text-slate-500">
                                                {new Date(v.createdAt).toLocaleDateString()}
                                            </span>
                                        )}
                                        
                                        <button
                                            onClick={(e) => handleDeleteClick(e, v.id)}
                                            disabled={isDeletingId === v.id || deleteConfirmId !== null}
                                            className="text-slate-500 hover:text-red-400 hover:bg-red-400/10 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                                            title="Delete Snapshot"
                                        >
                                            {isDeletingId === v.id ? (
                                                <svg className="w-4 h-4 animate-spin text-red-400" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </label>
                            ))
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-800">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors" disabled={deleteConfirmId !== null}>
                        Cancel
                    </button>
                    <button 
                        onClick={() => onLoadSpecificVersions(Array.from(selectedIds))}
                        disabled={selectedIds.size === 0 || deleteConfirmId !== null}
                        className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded transition-colors shadow-lg shadow-teal-900/50"
                    >
                        Load Selected ({selectedIds.size})
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VersionSelectorModal;