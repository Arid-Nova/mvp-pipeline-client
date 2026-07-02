import Search from "./Search";
import getData from "../../parsers/getData";
import GraphButtonMenu from "./GraphButtons";
import compareChanges from "../../parsers/getChanges";
import CollapsibleSection from "../generic/CollapsibleSection";

type Props = {
    graphRef: any;
    search: string[];
    setSearch: React.Dispatch<React.SetStateAction<string[]>>;
    value: number;
    setValue: React.Dispatch<React.SetStateAction<number>>;
    graphData: any;
    setGraphData: any;
    initCoords: any;
    initRotation: any;
    is3d: any;
    setIs3d: any;
    isDark: boolean;
    setIsDark: React.Dispatch<React.SetStateAction<boolean>>;
    trackChanges: boolean;
    setTrackChanges: React.Dispatch<React.SetStateAction<boolean>>;

    antiPattern: boolean;
    setAntiPattern: React.Dispatch<React.SetStateAction<boolean>>;
    selectedAntiPattern: string;
    setSelectedAntiPattern: React.Dispatch<React.SetStateAction<string>>;

    currentInstance: any;
    graphTimeline: any;
    isExpandedAll: boolean;
    setIsExpandedAll: React.Dispatch<React.SetStateAction<boolean>>;
    isHighLevelExpanded: boolean;
    setIsHighLevelExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * A menu to be able to do all sorts of things with the force graph.
 *
 * @param {Object} props The props passed to this object
 * @param {React.MutableRefObject<ForceGraphMethods>} props.graphRef Reference to the internal force graph to access methods/camera
 * @returns {JSX.Element} The menu for the graph
 */
const GraphMenu: React.FC<Props> = ({
    graphRef,
    search,
    setSearch,
    value,
    setValue,
    graphData,
    setGraphData,
    initCoords,
    initRotation,
    is3d,
    setIs3d,
    isDark,
    setIsDark,
    trackChanges,
    setTrackChanges,
    antiPattern,
    setAntiPattern,
    selectedAntiPattern,
    setSelectedAntiPattern,
    currentInstance,
    graphTimeline,
    isExpandedAll,
    setIsExpandedAll,
    isHighLevelExpanded,
    setIsHighLevelExpanded,
}) => {
    return (
        <div className="tour-graph-menu absolute top-16 left-4 z-50 flex flex-col gap-2.5 bg-slate-900/80 text-white rounded-xl p-3 shadow-xl backdrop-blur-md transition-all duration-300 w-1/6 min-w-[260px]">
            
            {/* Header with title */}
            <div className="flex items-center justify-between px-1 pb-1">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2 animated-gradient-dark">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 18H7.5m9-12h3.75m-3.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0m-3.75 0H7.5m9 12h3.75m-3.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 18H7.5" />
                    </svg>
                    Settings
                </h2>
            </div>

            {/* 1. Appearance & Tracking */}
            <CollapsibleSection title="Appearance & Tracking" defaultOpen={false}>
                {/* Theme Switch */}
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
                        {isDark ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-purple-400">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75 9.75 9.75 0 018.25 6a9.718 9.718 0 01.748-3.752 9.75 9.75 0 1012.754 12.754z" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-yellow-400">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-6.364-.386l1.591-1.591M3 12H5.25m-.386-6.364l1.591 1.591M16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                            </svg>
                        )}
                        <strong>Theme:</strong> {isDark ? 'Dark' : 'Light'}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            defaultChecked={isDark}
                            className="sr-only peer"
                            onClick={() => setIsDark(!isDark)}
                        />
                        <div className="w-11 h-6 bg-yellow-400 rounded-full peer peer-focus:ring-2 peer-focus:ring-purple-400 transition-colors duration-300 peer-checked:bg-purple-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full after:duration-300"></div>
                    </label>
                </div>

                {/* Changes Switch */}
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
                        {trackChanges ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-green-400">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-red-400">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        )}
                        <strong>Changes:</strong> {trackChanges ? 'Yes' : 'No'}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            defaultChecked={trackChanges}
                            className="sr-only peer"
                            onClick={() => {
                                let newTrackChanges = !trackChanges;
                                setTrackChanges(newTrackChanges);
                                if (newTrackChanges && currentInstance !== 0) {
                                    setGraphData(compareChanges(graphTimeline[currentInstance - 1], graphTimeline[currentInstance]));
                                } else {
                                    setGraphData(getData(graphTimeline[currentInstance]));
                                }
                            }}
                        />
                        <div className="w-11 h-6 bg-red-500 rounded-full peer peer-focus:ring-2 peer-focus:ring-green-400 transition-colors duration-300 peer-checked:bg-green-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full after:duration-300"></div>
                    </label>
                </div>
            </CollapsibleSection>

            {/* 2. Layout & View */}
            <CollapsibleSection title="Layout & View" defaultOpen={false}>
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
                        {isHighLevelExpanded ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-teal-400">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6.75 9.75h10.5M10.5 15h3" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-teal-400">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6.75 9.75h10.5M10.5 15h3M15 9l6 6m0-6l-6 6" />
                            </svg>
                        )}
                        <strong>Entity View:</strong> {isHighLevelExpanded ? 'On' : 'Off'}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isHighLevelExpanded}
                            className="sr-only peer"
                            onChange={() => setIsHighLevelExpanded(!isHighLevelExpanded)}
                        />
                        <div className="w-11 h-6 bg-slate-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-teal-400 transition-colors duration-300 peer-checked:bg-teal-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full after:duration-300"></div>
                    </label>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
                        {isExpandedAll ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-sky-400">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L4.5 4.5M9 15v4.5M9 15H4.5M9 15l-4.5 4.5M15 9V4.5M15 9h4.5M15 9l4.5-4.5M15 15v4.5M15 15h4.5M15 15l4.5 4.5" />
                            </svg>
                        )}
                        <strong>Expand All:</strong> {isExpandedAll ? 'On' : 'Off'}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isExpandedAll}
                            className="sr-only peer"
                            onChange={() => setIsExpandedAll(!isExpandedAll)}
                        />
                        <div className="w-11 h-6 bg-slate-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-sky-400 transition-colors duration-300 peer-checked:bg-sky-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full after:duration-300"></div>
                    </label>
                </div>
            </CollapsibleSection>

            {/* 2. Anti-Patterns */}
            <CollapsibleSection title="Anti-Patterns" defaultOpen={false}>
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-300">
                            <strong>Highlight:</strong> {antiPattern ? 'Active' : 'Off'}
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={antiPattern}
                                className="sr-only peer"
                                onChange={(e) => setAntiPattern(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-slate-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-red-400 transition-colors duration-300 peer-checked:bg-red-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full after:duration-300"></div>
                        </label>
                    </div>

                    {antiPattern && (
                        <div className="relative animate-fade-in">
                            <select 
                                value={selectedAntiPattern} 
                                onChange={(e) => setSelectedAntiPattern(e.target.value)}
                                className="w-full appearance-none bg-slate-700/80 border border-slate-600 text-sm rounded-lg px-3 py-2.5 text-slate-200 outline-none transition-all duration-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/40 hover:bg-slate-600 cursor-pointer shadow-sm"
                            >
                                <option value="none">None</option>
                                <option value="ALL">Show All Anti-Patterns</option>
                                <option value="GOD_SERVICE">God Service (Megaservice)</option>
                                <option value="SHARED_DB">Shared Database</option>
                                <option value="CHATTY_SERVICE">Chatty Services</option>
                                <option value="CYCLIC_DEPENDENCY">Cyclic Dependencies</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                </svg>
                            </div>
                        </div>
                    )}
                </div>
            </CollapsibleSection>

            {/* 4. Search Nodes */}
            <CollapsibleSection title="Search Microservices" defaultOpen={false}>
                <Search
                    graphRef={graphRef}
                    search={search}
                    setSearch={setSearch}
                    graphData={graphData}
                />
            </CollapsibleSection>

            {/* 5. Actions & Export */}
            <CollapsibleSection title="Actions & Export" defaultOpen={false}>
                <GraphButtonMenu
                    graphRef={graphRef}
                    graphData={graphData}
                    setGraphData={setGraphData}
                    initCoords={initCoords}
                    initRotation={initRotation}
                    is3d={is3d}
                />
            </CollapsibleSection>

        </div>
    );
};

export default GraphMenu;
