import React from 'react';
import { createPortal } from 'react-dom';

interface ToolboxItemTooltipProps {
    title: string;
    purpose: string;
    outcome: string;
    isOpen: boolean;
    position: {
        top: number;
        left: number;
    };
}

export const ToolboxItemTooltip: React.FC<ToolboxItemTooltipProps> = ({
    title,
    purpose,
    outcome,
    isOpen,
    position
}) => {
    if (!isOpen) return null;

    return createPortal(
        <div
            className="hidden md:block fixed w-80 pointer-events-none z-[9999] bg-slate-950 text-slate-300 rounded-xl shadow-xl border border-slate-700 p-4"
            style={{
                top: position.top,
                left: position.left
            }}
        >
            <div className="text-xs font-bold text-slate-100 mb-3">
                {title}
            </div>

            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                Purpose
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {purpose}
            </p>

            <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mt-3">
                Expected Outcome
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {outcome}
            </p>
        </div>,
        document.body
    );
};