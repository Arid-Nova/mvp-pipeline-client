import React from 'react';

interface CanvasFooterProps {
    scale: number;
}

const CanvasFooter: React.FC<CanvasFooterProps> = ({ scale }) => {
    const currentYear = new Date().getFullYear();

    return (
        <div className="absolute bottom-4 right-4 flex items-center gap-4 z-10 pointer-events-none">
            {/* Transparent Copyright Text */}
            <div className="text-[10px] font-semibold text-white/20 tracking-wider uppercase select-none">
                © {currentYear} CloudHubs Research Group at University of Arizona
            </div>
            
            {/* Zoom Indicator */}
            <div className="bg-slate-900/80 border border-white/10 px-3 py-1.5 rounded-full text-[10px] font-mono text-slate-400 shadow-lg pointer-events-auto">
                {Math.round(scale * 100)}%
            </div>
        </div>
    );
};

export default CanvasFooter;