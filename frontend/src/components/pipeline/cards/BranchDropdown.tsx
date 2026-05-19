import React from "react";

export const BranchDropdown = ({ 
    repoUrl, 
    currentBranch, 
    branches, 
    onSelect, 
    isSelected 
}: { 
    repoUrl: string, currentBranch: string, branches: string[], onSelect: (val: string) => void, isSelected: boolean 
}) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOpen = (e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation(); 
        setIsOpen(!isOpen);
    };

    const handleSelect = (e: React.MouseEvent | React.TouchEvent, branch: string) => {
        e.stopPropagation();
        onSelect(branch);
        setIsOpen(false);
    };

    return (
        <div ref={dropdownRef} className="relative">
            {/* The Trigger Button */}
            <div 
                onClick={(e) => toggleOpen(e)}
                onTouchEnd={(e) => {
                    e.preventDefault(); 
                    toggleOpen(e);
                }}
                className={`flex items-center justify-between w-28 text-[10px] border rounded px-2 py-1.5 outline-none cursor-pointer transition-all duration-200 ${
                    isSelected 
                        ? 'bg-purple-900/30 border-purple-500/50 text-purple-200 shadow-sm' 
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
                }`}
            >
                <span className="truncate pr-2">{currentBranch}</span>
                {/* Custom Chevron Icon */}
                <svg 
                    className={`w-3 h-3 flex-shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-purple-400' : ''}`} 
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>

            {/* The Custom Options List */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-40 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-md shadow-xl z-[100] max-h-48 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150 origin-top-right">
                    <div className="py-1">
                        {branches.length > 0 ? (
                            branches.map(b => (
                                <div 
                                    key={b}
                                    onClick={(e) => handleSelect(e, b)}
                                    onTouchEnd={(e) => {
                                        e.preventDefault(); 
                                        handleSelect(e, b);
                                        e.stopPropagation();
                                    }}
                                    className={`flex items-center justify-between px-3 py-1.5 text-[10px] cursor-pointer transition-colors ${
                                        currentBranch === b 
                                            ? 'bg-purple-500/10 text-purple-300 font-medium' 
                                            : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
                                    }`}
                                >
                                    <span className="truncate pr-2">{b}</span>
                                    
                                    {/* Selected Checkmark Indicator */}
                                    {currentBranch === b && (
                                        <svg className="w-3 h-3 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="px-3 py-2 text-[10px] text-slate-500 italic">No branches</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};