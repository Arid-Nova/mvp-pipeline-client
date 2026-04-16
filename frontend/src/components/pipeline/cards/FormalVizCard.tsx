import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NodeData } from '../models';

interface FormalVizCardProps {
    node: NodeData;
}

export const FormalVizCard: React.FC<FormalVizCardProps> = ({ node }) => {
    const navigate = useNavigate();
    
    return (
            <button 
            disabled={!node.data.verificationResult}
            onClick={() => navigate('/verification-results', { 
                state: { 
                    result: node.data.verificationResult,
                    systemInfo: node.data.systemInfo,
                    fromPipeline: true 
                } 
            })}
            className="mt-2 w-full py-1.5 text-xs bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white rounded font-medium shadow transition-colors"
        >
            View Results
        </button>
    );
};