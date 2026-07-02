import React, { useEffect, useState } from 'react';
import { fetchIRVersions } from '../../services/api';

interface VersionSelectorModalProps {
    isOpen: boolean;
    systemName: string;
    onClose: () => void;
    onLoadSpecificVersions: (selectedIds: string[]) => void;
}

const VersionSelectorModal: React.FC<VersionSelectorModalProps> = ({ isOpen, systemName, onClose, onLoadSpecificVersions }) => {
    const [versions, setVersions] = useState<{ id: string, version: string, createdAt?: any }[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);

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

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-teal-500/50 shadow-[0_0_25px_rgba(20,184,166,0.15)] rounded-xl p-6 flex flex-col gap-4 w-full max-w-md">
                
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
                            versions.map(v => (
                                <label key={v.id} className="flex items-center justify-between p-2 hover:bg-slate-800/50 rounded cursor-pointer transition-colors border border-transparent hover:border-slate-700/50">
                                    <div className="flex items-center gap-3">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.has(v.id)}
                                            onChange={() => toggleSelection(v.id)}
                                            className="w-4 h-4 accent-teal-500 cursor-pointer bg-slate-800 border-slate-600 rounded"
                                        />
                                        <span className="text-slate-300 font-mono text-sm">Snapshot {v.version}</span>
                                    </div>
                                    
                                    {v.createdAt && (
                                        <span className="text-xs text-slate-500">
                                            {new Date(v.createdAt).toLocaleDateString()}
                                        </span>
                                    )}
                                </label>
                            ))
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-800">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors">
                        Cancel
                    </button>
                    <button 
                        onClick={() => onLoadSpecificVersions(Array.from(selectedIds))}
                        disabled={selectedIds.size === 0}
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