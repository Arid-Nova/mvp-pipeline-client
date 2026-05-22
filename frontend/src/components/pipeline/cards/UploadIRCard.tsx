import React from 'react';
import { NodeData } from '../models'; 
import { InlineDropzone } from './InlineDropZone';

interface UploadIRCardProps {
    node: NodeData;
    updateNodeData: (id: string, newData: Partial<NodeData['data']>) => void;
}

export const UploadIRCard: React.FC<UploadIRCardProps> = ({ node, updateNodeData }) => {
    return (
        <div className="mt-2">
            {node.data.payload?.irJson ? (
                <div className="w-full min-h-[96px] flex flex-col items-center justify-center border border-emerald-500/30 bg-emerald-900/10 rounded-lg p-2">
                    <div className="text-emerald-400 font-bold text-sm mb-1">✓ JSON Ready</div>
                    <div className="text-emerald-600 text-xs font-mono break-all text-center max-h-8 overflow-hidden">{node.data.payload?.systemName || node.data?.systemName}</div>
                    <button 
                        onClick={(e) => {
                            e.stopPropagation(); 
                            updateNodeData(node.id, { payload: undefined });
                        }}
                        onTouchEnd={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            updateNodeData(node.id, { payload: undefined });
                        }}
                        className="mt-2 text-[10px] underline text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        Replace File
                    </button>
                </div>
            ) : (
                <InlineDropzone onFileSelect={async (f) => {
                    try {
                        const text = await f.text();
                        const json = JSON.parse(text);
                        updateNodeData(node.id, {
                            payload: { 
                                irJson: json, 
                                systemName: f.name,
                                metadata: [{ repoUrl: 'Local', branch: 'main', commitId: 'HEAD' }]
                            }
                        });
                    } catch(e) {
                        alert("Invalid JSON File");
                    }
                }} />
            )}
        </div>
    );
};