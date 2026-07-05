import React, { useEffect, useState } from 'react';
import { saveAs } from 'file-saver';
import { NodeData } from '../models';
import { getSystemVersionMetadata, updateIRVersion } from '../../../services/api';

interface IRHolderCardProps {
    node: NodeData;
}

interface IRHolderCardProps {
    node: NodeData;
}

export const IRHolderCard: React.FC<IRHolderCardProps> = ({ node }) => {
    const irJson = node.data.payload?.irJson;
    
    const [savedVersion, setSavedVersion] = useState<string | null>(irJson?.version || null);
    
    const [versionInput, setVersionInput] = useState<string>('');
    const [suggestedVersions, setSuggestedVersions] = useState<string[]>([]);
    const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setSavedVersion(irJson?.version || null);
    }, [irJson?.id, irJson?.ir_id]); 

    useEffect(() => {
        if (irJson && !savedVersion) {
            const fetchSuggestions = async () => {
                setIsLoadingSuggestion(true);
                const systemName = irJson.systemName || node.data.payload?.systemName;
                
                if (systemName) {
                    const meta = await getSystemVersionMetadata(systemName);
                    if (meta && meta.suggestedVersions && meta.suggestedVersions.length > 0) {
                        setSuggestedVersions(meta.suggestedVersions);
                        setVersionInput(meta.suggestedVersions[0]); 
                    } else {
                        setSuggestedVersions(['1.0.0']); 
                        setVersionInput('1.0.0');
                    }
                } else {
                    setSuggestedVersions(['1.0.0']);
                    setVersionInput('1.0.0');
                }
                setIsLoadingSuggestion(false);
            };
            fetchSuggestions();
        }
    }, [irJson, savedVersion, node.data.payload?.systemName]);

    const handleSaveVersion = async () => {
        const targetId = irJson?.id || irJson?.ir_id; 
        
        if (!targetId || !versionInput.trim()) return;
        
        setIsSaving(true);
        try {
            await updateIRVersion(targetId, versionInput);
            irJson.version = versionInput;
            setSavedVersion(versionInput);
            // Should update node data as well
        } catch (error) {
            // console.error("Failed to save new version.");
        } finally {
            setIsSaving(false);
        }
    };

    const datalistId = `version-suggestions-${irJson?.id || 'new'}`;

    return (
        <div className="mt-2 flex flex-col gap-2">
            {irJson ? (
                <>
                    {/* Version Display / Editor */}
                    <div className="flex items-center justify-between bg-slate-900/50 border border-slate-700/50 rounded p-2">
                        {savedVersion ? (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Version</span>
                                <span className="text-xs font-mono text-yellow-400 font-medium">v{savedVersion}</span>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1.5 w-full animate-in fade-in duration-300">
                                <span className="text-[10px] uppercase text-amber-500 font-bold tracking-wider">
                                    Assign Version
                                </span>
                                
                                <form 
                                    onSubmit={(e) => {
                                        e.preventDefault(); 
                                        if (/^\d+\.\d+\.\d+$/.test(versionInput)) {
                                            handleSaveVersion();
                                        }
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <input 
                                        type="text" 
                                        list={datalistId}
                                        value={versionInput}
                                        onChange={(e) => {
                                            const filteredValue = e.target.value.replace(/[^0-9.]/g, '');
                                            setVersionInput(filteredValue);
                                        }}
                                        disabled={isLoadingSuggestion || isSaving}
                                        pattern="^\d+\.\d+\.\d+$"
                                        title="Must be strictly numbers and dots (e.g. 1.0.0)"
                                        className={`bg-slate-800 border text-xs text-white rounded px-2 py-1 min-w-0 flex-1 outline-none transition-colors disabled:opacity-50 ${
                                            versionInput && !/^\d+\.\d+\.\d+$/.test(versionInput)
                                                ? 'border-red-500/50 focus:border-red-500'
                                                : 'border-slate-600 focus:border-yellow-500'
                                        }`}
                                        placeholder="e.g. 1.0.0"
                                    />
                                    
                                    {/* Suggestions */}
                                    <datalist id={datalistId}>
                                        {suggestedVersions.map((version) => (
                                            <option key={version} value={version} />
                                        ))}
                                    </datalist>

                                    <button
                                        type="submit"
                                        // Disabling the button unless it matches the 3-part number format
                                        disabled={isLoadingSuggestion || isSaving || !/^\d+\.\d+\.\d+$/.test(versionInput)}
                                        title="Save Version"
                                        className="flex items-center justify-center w-7 h-7 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors disabled:opacity-50 shrink-0 outline-none"
                                    >
                                        {isSaving ? (
                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>

                    {/* Download Button */}
                    <button 
                        onClick={(e) => {
                            e.stopPropagation(); 
                            const blob = new Blob([JSON.stringify(irJson, null, 2)], {type: "application/json"});
                            saveAs(blob, `pipeline_ir_${savedVersion || 'unversioned'}.json`);
                        }}
                        onTouchEnd={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const blob = new Blob([JSON.stringify(irJson, null, 2)], {type: "application/json"});
                            saveAs(blob, `pipeline_ir_${savedVersion || 'unversioned'}.json`);
                        }}
                        className="w-full py-1.5 text-xs bg-yellow-600 hover:bg-yellow-500 text-white rounded font-medium shadow transition-colors"
                    >
                        Download JSON
                    </button>
                </>
            ) : (
                <span className="text-xs text-slate-500 italic">Waiting for input...</span>
            )}
        </div>
    );
}