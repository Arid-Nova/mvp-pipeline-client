import React from 'react';
import { saveAs } from 'file-saver';
import { NodeData } from '../models'; 

interface ComponentHolderCardProps {
    node: NodeData;
}

export const ComponentHolderCard: React.FC<ComponentHolderCardProps> = ({ node }) => {
    return (
        <div className="mt-2 space-y-2">
                {node.data.componentPayload? (
                <>
                    <div className="p-2 bg-slate-950 border border-slate-700 rounded mb-2 flex flex-col gap-1 text-center">
                        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Components & Endpoints</span>
                        <span className="font-mono text-xs text-orange-400 break-all">
                            Identified
                        </span>
                    </div>

                    <button 
                        onClick={() => {
                            const blob = new Blob([JSON.stringify(node.data.componentPayload?.components, null, 2)], {type: "application/json"});
                            saveAs(blob, "components.json");
                        }}
                        className="w-full py-1.5 text-xs bg-orange-600 hover:bg-orange-500 text-white rounded font-medium shadow transition-colors flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Download Components
                    </button>
                    
                    <button 
                        onClick={() => {
                            const blob = new Blob([JSON.stringify(node.data.componentPayload?.endpoints, null, 2)], {type: "application/json"});
                            saveAs(blob, "endpoints.json");
                        }}
                        className="w-full py-1.5 text-xs bg-rose-600 hover:bg-rose-500 text-white rounded font-medium shadow transition-colors flex items-center justify-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Download Endpoints
                    </button>
                </>
                ) : <span className="text-xs text-slate-500 italic block text-center py-2">Waiting for Component Generation...</span>}
        </div>
    );
};