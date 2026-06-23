import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NodeData } from '../models'; 

interface VisualizationCardProps {
    node: NodeData;
}

export const VisualizationCard: React.FC<VisualizationCardProps> = ({ node }) => {
    const navigate = useNavigate();

    const hasData = (node.data.timelineIRs && node.data.timelineIRs.length > 0) || 
                    !!node.data.payload?.irJson || 
                    !!node.data.systemInfo?.ir;

    const handleLaunch = () => {
        const irArray = node.data.timelineIRs || [node.data.payload?.irJson || node.data.systemInfo?.ir];
        navigate('/graph-visualize', { 
            state: { 
                irData: irArray, 
                fromPipeline: true,
                overwriteTimeline: true 
            } 
        });
    };

    return (
        <button 
            disabled={!hasData}
            onClick={(e) => {
                e.stopPropagation(); 
                handleLaunch();
            }} 
            onTouchEnd={(e) => {
                if (!hasData) return;
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
