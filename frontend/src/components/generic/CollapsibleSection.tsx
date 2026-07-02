import { useState } from "react";

type Props = {
    title: string;
    defaultOpen?: boolean
    children: React.ReactNode
};

const CollapsibleSection: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, defaultOpen = false, children }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="flex flex-col w-full border border-slate-700/50 rounded-lg overflow-hidden bg-slate-800/30">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between px-3 py-2.5 bg-slate-800/80 hover:bg-slate-700/80 transition-colors w-full outline-none z-10"
            >
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">{title}</span>
                <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            
            <div 
                className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                    isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                }`}
            >
                <div className="overflow-hidden">
                    <div className={`p-3 flex flex-col gap-4 border-t border-slate-700/50 bg-slate-900/20 transition-opacity duration-300 delay-75 ${
                        isOpen ? 'opacity-100' : 'opacity-0'
                    }`}>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CollapsibleSection;