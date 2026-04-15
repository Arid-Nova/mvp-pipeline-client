import React from 'react';
import { saveAs } from 'file-saver';
import { NodeData } from '../models';

interface IRHolderCardProps {
    node: NodeData;
}

export const IRHolderCard: React.FC<IRHolderCardProps> = ({ node }) => {
    return (
        <div className="mt-2">
                {node.data.payload?.irJson ? (
                <button 
                    onClick={() => {
                        const blob = new Blob([JSON.stringify(node.data.payload?.irJson, null, 2)], {type: "application/json"});
                        saveAs(blob, "pipeline_ir.json");
                    }}
                    className="w-full py-1.5 text-xs bg-yellow-600 hover:bg-yellow-500 text-white rounded font-medium shadow transition-colors"
                >
                    Download JSON
                </button>
                ) : <span className="text-xs text-slate-500 italic">Waiting for input...</span>}
        </div>
    );
}