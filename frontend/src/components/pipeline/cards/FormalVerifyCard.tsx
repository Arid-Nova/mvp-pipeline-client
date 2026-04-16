import React from 'react';
import { saveAs } from 'file-saver';
import { NodeData } from '../models'; 

interface FormalVerifyCardProps {
    node: NodeData;
}

export const FormalVerifyCard: React.FC<FormalVerifyCardProps> = ({ node }) => {
    return (
        <div className="mt-2">
                {node.data.verificationResult ? (
                <button 
                    onClick={() => {
                        const blob = new Blob([JSON.stringify(node.data.verificationResult, null, 2)], {type: "application/json"});
                        saveAs(blob, "verification_result.json");
                    }}
                    className="w-full py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded font-medium shadow transition-colors"
                >
                    Download Result
                </button>
                ) : <span className="text-xs text-slate-500 italic">Waiting for IR...</span>}
        </div>
    );
};