import React, { useState, useMemo } from "react";

type Props = {
    graphRef: any;
    search: string[];
    setSearch: React.Dispatch<React.SetStateAction<string[]>>;
    graphData: any;
};
const Search: React.FC<Props> = ({
    graphRef,
    search,
    setSearch,
    graphData,
}) => {
    const [inputValue, setInputValue] = useState("");

    const updateSearch = (newSearchArray: string[]) => {
        setSearch(newSearchArray);
        if (graphRef && graphRef.current) {
            graphRef.current.refresh();
        }
    };

    const availableNodes = useMemo(() => {
        if (!graphData || !graphData.nodes) return [];
        return Array.from(new Set(
            graphData.nodes.map((node: any) => node.nodeName || node.id || "")
        )).filter(Boolean) as string[];
    }, [graphData]);

    const suggestions = useMemo(() => {
        const trimmed = inputValue.trim().toLowerCase();
        if (!trimmed) return [];
        
        return availableNodes
            .filter(node => 
                node.toLowerCase().includes(trimmed) && 
                !search.includes(node) 
            )
            .slice(0, 10); 
    }, [inputValue, availableNodes, search]);

    return (
        <div className="mb-3 flex flex-col w-full text-white">
            <h4 className="text-base font-semibold text-white mb-2 flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                Search
            </h4>
            
            <div className="relative w-full">
                <div className="max-h-[80px] overflow-y-auto min-h-[42px] p-1.5 bg-slate-700/50 border border-slate-600 rounded-xl flex flex-wrap items-center gap-1.5 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 transition-all">    
                    {/* Active search chips */}
                    {search.map((term, index) => (
                        <span 
                            key={index} 
                            className="flex items-center gap-1 px-2 py-1 bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-md text-xs font-medium shrink-0"
                        >
                            {term}
                            <button
                                onClick={() => updateSearch(search.filter(t => t !== term))}
                                className="hover:text-white hover:bg-sky-500/50 rounded-full p-0.5 transition-colors"
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </span>
                    ))}

                    {/* The invisible input for typing new terms */}
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ',') {
                                e.preventDefault();
                                const trimmed = inputValue.trim();
                                if (trimmed && !search.includes(trimmed)) {
                                    updateSearch([...search, trimmed]);
                                }
                                setInputValue("");
                            } else if (e.key === 'Backspace' && inputValue === '' && search.length > 0) {
                                updateSearch(search.slice(0, -1));
                            }
                        }}
                        placeholder={search.length === 0 ? "Type & press Enter..." : ""}
                        className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-200 placeholder-slate-400 outline-none px-1"
                    />
                </div>

                {/* The Suggestion Dropdown Menu */}
                {suggestions.length > 0 && (
                    <ul className="absolute z-50 left-0 right-0 top-[calc(100%+4px)] bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                        {suggestions.map((suggestion, idx) => (
                            <li 
                                key={idx}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    updateSearch([...search, suggestion]);
                                    setInputValue("");
                                }}
                                className="px-3 py-2 text-sm text-slate-300 hover:bg-sky-500 hover:text-white cursor-pointer transition-colors border-b border-slate-700/50 last:border-0"
                            >
                                {suggestion}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            
            {search.length > 0 && (
                <div className="w-full flex justify-end mt-1">
                    <button 
                        onClick={() => updateSearch([])}
                        className="text-[10px] text-slate-400 hover:text-rose-400 font-medium tracking-wide transition-colors"
                    >
                        Clear All Filters
                    </button>
                </div>
            )}
        </div>
    );
};

export default Search;
