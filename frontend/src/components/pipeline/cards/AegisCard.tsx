import React, { useState } from 'react';
import { NodeData } from '../models'; 
import { ExpressSecurityReport } from './ExpressSecurityReport';

interface AegisCardProps {
    node: NodeData;
}

export const AegisCard: React.FC<AegisCardProps> = ({ node }) => {
    const [showSecurity, setShowSecurity] = useState(false);
    if (node.data.securityReport) {
        return <>
            <button disabled={node.status !== 'completed'} className="mt-2 w-full rounded bg-blue-700 px-3 py-2 text-xs text-white disabled:opacity-50"
                onClick={event => { event.stopPropagation(); setShowSecurity(true); }}>View Express security</button>
            {showSecurity && <ExpressSecurityReport report={node.data.securityReport} onClose={() => setShowSecurity(false)} />}
        </>;
    }
    return (
        <button 
            disabled={!node.data.payload?.irJson || node.status !== 'completed'}
            className={`
                mt-2 w-full py-1.5 text-xs text-white rounded font-medium shadow transition-colors
                ${node.status === 'completed' 
                    ? 'bg-red-600 hover:bg-red-500' 
                    : 'bg-slate-700 opacity-50 cursor-not-allowed'}
            `}
            onClick={(e) => {
                e.stopPropagation();
                const meta = node.data.payload?.irJson.id;
                if (!meta) return;
                const params = new URLSearchParams({
                    id: meta
                }).toString();

                window.open(`http://localhost:5600/visualize?${params}`);
            }}
            onTouchEnd={(e) => {
                if (!node.data.payload?.irJson || node.status !== 'completed') return;
                e.preventDefault(); 
                e.stopPropagation();
                
                const meta = node.data.payload?.irJson.id;
                if (!meta) return;
                const params = new URLSearchParams({
                    id: meta
                }).toString();

                window.open(`http://localhost:5600/visualize?${params}`);
            }}
        >
            {node.status === 'running' ? 'Analyzing...' : 'Launch Aegis'}
        </button>
    );
};
