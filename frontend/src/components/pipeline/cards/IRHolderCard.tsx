import React, { useEffect, useState } from 'react';
import { saveAs } from 'file-saver';
import { NodeData } from '../models';
import { VersionManagerModal } from '../VersionManagerModal';
import { getSystemVersionMetadata, updateIRVersion } from '../../../services/api';

interface IRHolderCardProps {
    node: NodeData;
}

interface IRHolderCardProps {
    node: NodeData;
}

export const IRHolderCard: React.FC<IRHolderCardProps> = ({ node }) => {
    const irJson = node.data.payload?.irJson;
    const systemName = irJson?.systemName || node.data.payload?.systemName;
    
    const [savedVersion, setSavedVersion] = useState<string | null>(irJson?.version || null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setSavedVersion(irJson?.version || null);
    }, [irJson?.id, irJson?.ir_id]); 

    const handleSaveVersion = async (version: string, description?: string) => {
        setIsSaving(true);
        try {
            const id = irJson?.id || irJson?.ir_id || node.id;
            await updateIRVersion(id, version, description);
            setSavedVersion(version);
        
            if (irJson) irJson.version = version;
            if (node.data.payload?.irJson) node.data.payload.irJson.version = version;
        } catch (error) {
            // console.error("Failed to save version", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-2 w-full mt-2 relative">
            {irJson ? (
                <>
                    {/* Version Display */}
                    <div className="flex items-center justify-between bg-slate-900/80 border border-slate-700 rounded-md p-2.5 shadow-sm">
                        {savedVersion ? (
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-2 w-2 rounded-full bg-teal-500"></span>
                                    <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                                        Assigned
                                    </span>
                                    <span className="text-sm font-mono text-teal-400 font-bold bg-teal-500/10 border border-teal-500/30 px-2 py-0.5 rounded">
                                        v{savedVersion}
                                    </span>
                                </div>
                                
                                <button 
                                    onClick={() => setIsModalOpen(true)} 
                                    className="text-[10px] text-slate-400 hover:text-amber-400 transition-colors flex items-center gap-1 outline-none"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                    Edit
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-2">
                                    {/* Warning indicator */}
                                    <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                                    <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                                        Unversioned
                                    </span>
                                </div>

                                <button 
                                    onClick={() => setIsModalOpen(true)}
                                    className="text-[10px] bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded transition-colors shadow-sm outline-none font-bold tracking-wide"
                                >
                                    Assign Version
                                </button>
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
                        className="w-full py-1.5 text-xs bg-yellow-600 hover:bg-yellow-500 text-white rounded font-medium shadow transition-colors"
                    >
                        Download JSON
                    </button>
                </>
            ) : (
                <span className="text-xs text-slate-500 italic">Waiting for input...</span>
            )}

            {/* Version Manager Modal */}
            {systemName && (
                <VersionManagerModal 
                    isOpen={isModalOpen} 
                    onClose={() => setIsModalOpen(false)} 
                    systemName={systemName}
                    onSave={handleSaveVersion}
                    isSaving={isSaving}
                />
            )}
        </div>
    );
}