import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NodeData } from '../models'; 

interface VisualizationCardProps {
    node: NodeData;
}

export const VisualizationCard: React.FC<VisualizationCardProps> = ({ node }) => {
    const navigate = useNavigate();

    const handleLaunch = () => {
        navigate('/graph-visualize', { 
            state: { 
                irData: node.data.payload?.irJson, 
                fromPipeline: true 
            } 
        });
    };

    return (
        <button 
            disabled={!node.data.payload?.irJson} 
            onClick={(e) => {
                e.stopPropagation(); 
                handleLaunch();
            }} 
            onTouchEnd={(e) => {
                if (!node.data.payload?.irJson) return; 
                e.preventDefault();
                e.stopPropagation();
                handleLaunch();
            }}
            className="mt-2 w-full py-1.5 text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium shadow transition-colors"
        >
            Launch Visualizer
        </button>
    );
};
