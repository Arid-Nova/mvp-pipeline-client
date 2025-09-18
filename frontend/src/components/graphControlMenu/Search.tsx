import React from "react";

type Props = {
    graphRef: any;
    search: string;
    setSearch: React.Dispatch<React.SetStateAction<string>>;
    graphData: any;
};
const Search: React.FC<Props> = ({
    graphRef,
    search,
    setSearch,
    graphData,
}) => {
    const nodes = graphData.nodes.map((node: any) =>
        node.nodeName.toLowerCase()
    );

    const handleInput = (e: any) => {
        graphRef.current.refresh();
        setSearch(e.target.value);
    };

    return (
        <div className="mb-3 flex flex-col w-full items-center justify-center text-white">
    <h4 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        Search Nodes
    </h4>
    <input
        id="search"
        type="text"
        className="block w-full px-3 py-2.5 text-sm font-normal rounded-xl transition ease-in-out
           bg-slate-700/50 text-slate-200 border border-slate-600
           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
           placeholder-slate-400"
        value={search}
        placeholder="Type query"
        onInput={handleInput}
        list="nodeOptions"
        autoComplete="off"
    />
    <datalist id="nodeOptions">
        {graphData.nodes.map((node: any) => (
            <option key={node.nodeName}>{node.nodeName}</option>
        ))}
    </datalist>
</div>
    );
};

export default Search;
