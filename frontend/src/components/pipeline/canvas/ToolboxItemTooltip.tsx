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
    return createPortal(
        <div
            className={`hidden md:flex flex-col gap-4 fixed w-80 pointer-events-none z-[9999] bg-slate-900/40 backdrop-blur-xl rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] border border-white/10 p-5 transition-opacity duration-200 ease-in-out ${
                isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
            }`}
            style={{
                top: position.top,
                left: position.left
            }}
        >
            <div className="absolute top-5 -left-[11px] w-[12px] h-[24px]">
                <svg viewBox="0 0 12 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 0L0 12L12 24V0Z" className="fill-slate-900/80" />
                    <path d="M12 0L0 12L12 24" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" />
                </svg>
            </div>

            {/* Header Section */}
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <svg className="w-5 h-5 text-teal-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                
                <div className="text-sm font-semibold bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent tracking-wide">
                    {title}
                </div>
            </div>

            <div className="flex flex-col gap-5 mt-1">
                {/* Purpose Section */}
                <div className="relative pl-3.5 border-l-2 border-blue-500/40">
                    <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest drop-shadow-sm">
                            Purpose
                        </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-light">
                        {purpose}
                    </p>
                </div>

                {/* Outcome Section */}
                <div className="relative pl-3.5 border-l-2 border-emerald-500/40">
                    <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest drop-shadow-sm">
                            Expected Outcome
                        </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-light">
                        {outcome}
                    </p>
                </div>
            </div>
        </div>,
        document.body 
    );
};