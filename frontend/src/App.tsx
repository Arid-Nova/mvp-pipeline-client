import React, { useEffect, useRef, useState } from "react";
import { Routes, Route } from "react-router-dom";

import VerificationResultPage from "./components/verification/VerificationResultPage";
import {Notification, setNotificationCallback, showError, showSuccess} from "./utils/notifications"
import getData from "./parsers/getData";
import { setupAxios, setupLogger } from "./utils/axiosSetup";

import NotificationToast from "./components/generic/NotificationToast";
import LandingPage from "./components/landing/LandingPage";
import IRFileUpload from "./components/IRFileUpload";
import Footer from "./components/generic/Footer";

import PipelinePage from "./components/pipeline/PipelinePage";
import GraphMenu from "./components/graphControlMenu/GraphMenu";
import TrackNodeMenu from "./components/generic/TrackNodeMenu";
import Instructions from "./components/generic/Instructions";
import ErrorBoundary from "./components/graph/ErrorBoundary";
import GraphWrapper from "./components/graph/GraphWrapper";
import Menu from "./components/graph/RightClickNodeMenu";
import { InfoBox } from "./components/graph/NodeInfoBox";
import GraphMode from "./components/graphMode/GraphMode";
import TimeSlider from "./components/graph/TimeSlider";
import FilterBox from "./utils/page.js";
import NewPage from "./utils/node.js";

setupLogger();
setupAxios();

function App(data: any) {
    const graphRef = useRef();
    const ref = useRef<HTMLDivElement>(null);

    // State Management
    const [search, setSearch] = useState("");
    const [value, setValue] = useState(8);
    const [initCoords, setInitCoords] = useState(null);
    const [initRotation, setInitRotation] = useState(null);

    // Graph Data State
    // const [graphData, setGraphData] = useState<{ graphName: string; nodes: { nodeName: any; nodeType: string; }[]; links: any[]; gitCommitId: any; } | null>(null);
    const [graphData, setGraphData] = useState<any>(null);
    const [graphName, setGraphName] = useState("test");
    const [graphTimeline, setGraphTimeline] = useState<any[]>([]);
    const [currentInstance, setCurrentInstance] = useState<number | undefined>(undefined);
    const [trackChanges, setTrackChanges] = useState(true);
    const [trackNodes, setTrackNodes] = useState([]);
    const [focusNode, setFocusNode] = useState();
    
    // Visual Settings
    const [is3d, setIs3d] = useState(true);
    const [isDark, setIsDark] = useState(true);
    const [color, setColor] = useState("dark-default");
    const [defNodeColor, setDefNodeColor] = useState(false);

    // Anti-Pattern State
    const [antiPattern, setAntiPattern] = useState(false);
    const [selectedAntiPattern, setSelectedAntiPattern] = useState("none");
    const [max, setMax] = useState(6);
    
    // Expansion states
    const [expandedNodes, setExpandedNodes] = useState(new Set<string>());
    const [isHighLevelExpanded, setIsHighLevelExpanded] = useState(false); 
    const [isExpandedAll, setIsExpandedAll] = useState(false);

    // Notification state
    const [notification, setNotification] = useState<Notification | null>(null);

    // Global error Handel for mitigating all unhandled errors. 
    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            event.preventDefault();
            showError("A temporary graph interaction error occurred.");
            // Forcing a state update here to try and recover the graph
            // setGraphData(prevData => ({ ...prevData }));
        };

        window.addEventListener('error', handleError);

        // Cleaning up the listener when the component unmounts.
        return () => {
            window.removeEventListener('error', handleError);
        };
    }, []); 

    // Set up notification callback when component mounts
    useEffect(() => {
        setNotificationCallback((notificationData: Notification) => {
            setNotification(notificationData);
        });
    }, []);

    useEffect(() => {
        if (!graphData || !Array.isArray(graphData.nodes)) {
            setExpandedNodes(new Set());
            return;
        } 

        try {
            const allMicroserviceIds = graphData.nodes
                .filter((node: any) => node.nodeType === 'microservice')
                .map((node: any) => node.nodeName);

            if (isExpandedAll || isHighLevelExpanded) {
                // If EITHER toggle is on, expand all microservices
                setExpandedNodes(new Set(allMicroserviceIds));
            } else {
                // If BOTH are off, clear all expansions
                setExpandedNodes(new Set());
            }
        } catch (error: any){
            showError('Error processing graph data for expansion.');
            setExpandedNodes(new Set()); 
        }
    }, [isExpandedAll, isHighLevelExpanded, graphData]);

    useEffect(() => {
        if (isExpandedAll) {
            setIsHighLevelExpanded(false);
        }
    }, [isExpandedAll]);

    useEffect(() => {
        if (isHighLevelExpanded) {
            setIsExpandedAll(false);
        }
    }, [isHighLevelExpanded]);


    // Handlers
    const handleIRLoaded = (irJson: any) => {
        try {
            if (!irJson.commitID) {
                console.warn("Missing commitID in IR Data, generating fallback.");
                irJson.commitID = "unknown-" + new Date().getTime(); 
            }

            // Process the raw IR JSON into Graph Data
            const processedData = getData(irJson, undefined);
        
            if (processedData) {
                setGraphData(processedData);
                setGraphTimeline(prev => {
                    const exists = prev.some(item => item.commitID === irJson.commitID);
                    if (exists) return prev;
                    return [...prev, irJson];
                });
                
                // Initialize timeline if this is the first upload
                if (typeof currentInstance === "undefined") {
                    setCurrentInstance(0);
                }
                showSuccess('Graph data loaded successfully!');
            } else {
                showError('Data parsing failed: Invalid format.');
            }
        } catch (error: any) {
            showError(`Failed to process data: ${error.message}`);
        }
    };

    const onFileUpload = async (file: File) => {
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            handleIRLoaded(json);
        } catch (error: any) {
            showError(`Failed to read file: ${error.message}`);
        }
    };

    // Render Helper
    const renderLandingPage = () => (
        <div className="min-h-screen bg-gray-900 relative flex flex-col">
            <LandingPage onIRLoaded={handleIRLoaded} />
            <Footer />
        </div>
    );

    const renderMainGraph = () => (
        <div className={`max-w-full min-h-screen max-h-screen overflow-clip ${isDark ? `bg-gray-900` : `bg-gray-100`}`} ref={ref}>
            <ErrorBoundary setNotification={setNotification}>
                {/* 1. Mode Toggle (Top Left) */}
                <GraphMode
                    value={value}
                    setValue={setValue}
                    antiPattern={antiPattern}
                    setAntiPattern={setAntiPattern}
                    selectedAntiPattern={selectedAntiPattern}
                    setSelectedAntiPattern={setSelectedAntiPattern}
                    graphData={graphData}
                    currentInstance={currentInstance}
                    graphTimeline={graphTimeline}
                />
                
                {/* 2. Microservice Filter List (Left Sidebar) */}
                <FilterBox
                    key={`${currentInstance ?? 0}-${trackChanges}`}
                    graphData={graphData}
                    currentInstance={currentInstance ?? 0}
                    graphTimeline={graphTimeline}
                    trackChanges={trackChanges}
                />

                {/* 3. Helper Components */}
                {/* Removed inline IRFileUpload here, as we have a landing page now */}
                <Instructions />
            
                {/* 4. Graph Controls (Top Right) */}
                <GraphMode
                    value={value}
                    setValue={setValue}
                    antiPattern={antiPattern}
                    setAntiPattern={setAntiPattern}
                    selectedAntiPattern={selectedAntiPattern}
                    setSelectedAntiPattern={setSelectedAntiPattern}
                    graphData={graphData}
                    currentInstance={currentInstance ?? 0}
                    graphTimeline={graphTimeline}
                />

                <FilterBox
                    key={`${currentInstance}-${trackChanges}`}
                    graphData={graphData} 
                    currentInstance={currentInstance}
                    graphTimeline={graphTimeline}
                    trackChanges={trackChanges}
                ></FilterBox>

                <IRFileUpload onFileSelect={onFileUpload} />

                <Instructions />

                <GraphMenu
                    graphRef={graphRef}
                    search={search}
                    setSearch={setSearch}
                    value={value}
                    setValue={setValue}
                    graphData={graphData}
                    setGraphData={setGraphData}
                    initCoords={initCoords}
                    initRotation={initRotation}
                    is3d={is3d}
                    setIs3d={setIs3d}
                    isDark={isDark}
                    setIsDark={setIsDark}
                    trackChanges={trackChanges}
                    setTrackChanges={setTrackChanges}
                    antiPattern={antiPattern}
                    selectedAntiPattern={selectedAntiPattern}
                    currentInstance={currentInstance}
                    graphTimeline={graphTimeline}
                    isExpandedAll={isExpandedAll}
                    setIsExpandedAll={setIsExpandedAll} 
                    isHighLevelExpanded={isHighLevelExpanded}
                    setIsHighLevelExpanded={setIsHighLevelExpanded}
                />

                {/* 5. The Main Graph Canvas */}
                <GraphWrapper
                    height={ref?.current?.clientHeight ?? 735}
                    width={ref?.current?.clientWidth ?? 1710}
                    search={search}
                    threshold={value}
                    graphRef={graphRef}
                    graphData={graphData}
                    setInitCoords={setInitCoords}
                    setInitRotation={setInitRotation}
                    is3d={is3d}
                    antiPattern={antiPattern}
                    colorMode={color}
                    defNodeColor={defNodeColor}
                    setDefNodeColor={setDefNodeColor}
                    setGraphData={setGraphData}
                    isDarkMode={isDark}
                    selectedAntiPattern={selectedAntiPattern}
                    trackNodes={trackNodes}
                    focusNode={focusNode}
                    endpointCalls={[]}
                    trackChanges={trackChanges}
                    expandedNodes={expandedNodes}
                    setExpandedNodes={setExpandedNodes}
                    isHighLevelExpanded={isHighLevelExpanded}
                />
            
                {/* 6. Context Menus & Info Boxes */}
                <Menu trackNodes={trackNodes} setTrackNodes={setTrackNodes} />
                <InfoBox
                    graphData={graphData}
                    focusNode={focusNode}
                    setFocusNode={setFocusNode}
                />

                {/* 7. Bottom Timeline Controls */}
                <div className="flex flex-row items-center justify-center w-full">
                    {graphTimeline.length > 0 && 
                     typeof currentInstance === 'number' && 
                     graphTimeline[currentInstance] && (
                        <TimeSlider
                            max={max}
                            setGraphData={setGraphData}
                            graphTimeline={graphTimeline}
                            currentInstance={currentInstance ?? 0}
                            setCurrentInstance={setCurrentInstance}
                            setDefNodeColor={setDefNodeColor}
                            trackChanges={trackChanges}
                        />
                    )}
                </div>
                <TrackNodeMenu
                    trackNodes={trackNodes}
                    setTrackNodes={setTrackNodes}
                    graphData={graphData}
                    graphTimeline={graphTimeline}
                    currentInstance={currentInstance ?? 0}
                />
            </ErrorBoundary>
        </div>
    );

    // --- Main Render ---
    return (
        <>
            <Routes>
                <Route 
                    path="/" 
                    element={
                        (typeof currentInstance === "undefined" || !graphData) 
                            ? renderLandingPage() 
                            : renderMainGraph()
                    } 
                />
                <Route path="/node" element={<NewPage />} />
                <Route path="/verification-results" element={<VerificationResultPage />} />
                <Route path="/pipeline" element={<PipelinePage/>}/>
            </Routes>

            {/* Toast is outside Routes to persist during navigation/state changes */}
            <NotificationToast 
                notification={notification} 
                onClose={() => setNotification(null)} 
            />
        </>
    );

    // useEffect(() => { 
    //     if (!graphData || !graphData.nodes) return;

    //     try {
    //         if (isExpandedAll) {
    //         // If toggled ON, find all microservice IDs and expand them
    //         const allMicroserviceIds = graphData.nodes
    //             .filter((node) => node.nodeType === 'microservice')
    //             .map((node) => node.nodeName);
            
    //         setExpandedNodes(new Set(allMicroserviceIds));
    //     } else {
    //         // If toggled OFF, clear all expansions
    //         setExpandedNodes(new Set());
    //     }
    //     } catch (error: any) {
    //         showError('Error updating expanded nodes');
    //     }
    // }, [isExpandedAll, graphData?.nodes]);

    // const onFileUpload = async (file: File) => {
    //     try {
    //         const data = await file.text();
    //         let ir = JSON.parse(data);

    //         const processedData = getData(ir, undefined);
        
    //         if (processedData) {
    //             setGraphData(processedData);
    //             setGraphTimeline(prev => [...prev, ir]);
    //             if (typeof currentInstance === "undefined") {
    //                 setCurrentInstance(0);
    //             }
    //             showSuccess('IR file parsed successfully!');
    //         } else showError('File validation failed.');
    //     } catch (error: any) {
    //         showError(`Failed to process JSON: ${error.message}`);
    //         return;
    //     }
    // }

    // if (typeof currentInstance == "undefined" || !graphTimeline) {
    //     return (
    //         <BrowserRouter>
    //             <div className="min-h-screen bg-gray-100 relative flex flex-col">
    //                 {/* Main content area */}
    //                 <div className="flex-1 flex flex-col items-center justify-center relative z-10 -mt-96" >
    //                     <h1 className="text-5xl font-extrabold mb-6 animated-gradient">
    //                         CIMET IR VISUALIZER
    //                     </h1>

    //                     <div className="relative z-10 mt-10">
    //                         <Routes>
    //                         <Route
    //                             path="/"
    //                             element={<IRFileUpload onFileSelect={onFileUpload} fullscreen />}
    //                         />
    //                         </Routes>
    //                     </div>
    //                 </div>

    //                 {/* Toast floats independently */}
    //                 <NotificationToast
    //                 notification={notification}
    //                 onClose={() => setNotification(null)}
    //                 />

    //                 {/* Footer stays at bottom */}
    //                 <Footer />
    //             </div>
    //         </BrowserRouter>
    //     )
    // }
    // return (
    //    <BrowserRouter >
    //     <Routes>
    //       <Route path="/" element=  
        
    //     {<div className={`max-w-full min-h-screen max-h-screen overflow-clip ${isDark ? `bg-gray-900` : `bg-gray-100`}`} ref={ref}>
    //         <ErrorBoundary setNotification={setNotification}>
    //             {/* Upper left mode toggle */}
    //             <GraphMode
    //                 value={value}
    //                 setValue={setValue}
    //                 antiPattern={antiPattern}
    //                 setAntiPattern={setAntiPattern}
    //                 selectedAntiPattern={selectedAntiPattern}
    //                 setSelectedAntiPattern={setSelectedAntiPattern}
    //                 graphData={graphData}
    //                 currentInstance={currentInstance}
    //                 graphTimeline={graphTimeline}
    //             />*
                
    //             {/*Filter box contianing a list of all visable microservices. Uses the currentInstance of trackChanges variables as keys for when to update the box */}
    //             <FilterBox
    //                 key={`${currentInstance}-${trackChanges}`}
    //                 graphData={graphData} 
    //                 currentInstance={currentInstance}
    //                 graphTimeline={graphTimeline}
    //                 trackChanges={trackChanges}
    //             ></FilterBox>

    //             <IRFileUpload onFileSelect={onFileUpload} />

    //             <Instructions />
            
    //             {/* Graph Menu on upper right with buttons */}
    //             <GraphMenu
    //                 graphRef={graphRef}
    //                 search={search}
    //                 setSearch={setSearch}
    //                 value={value}
    //                 setValue={setValue}
    //                 graphData={graphData}
    //                 setGraphData={setGraphData}
    //                 initCoords={initCoords}
    //                 initRotation={initRotation}
    //                 is3d={is3d}
    //                 setIs3d={setIs3d}
    //                 isDark={isDark}
    //                 setIsDark={setIsDark}
    //                 trackChanges={trackChanges}
    //                 setTrackChanges={setTrackChanges}
    //                 antiPattern={antiPattern}
    //                 selectedAntiPattern={selectedAntiPattern}
    //                 currentInstance={currentInstance}
    //                 graphTimeline={graphTimeline}
    //                 isExpandedAll={isExpandedAll}
    //                 setIsExpandedAll={setIsExpandedAll} 
    //                 isHighLevelExpanded={isHighLevelExpanded}
    //                 setIsHighLevelExpanded={setIsHighLevelExpanded}
    //             />
    //             {/* Graph object itself, contained within a wrapper to toggle 2d-3d */}
            
    //             <GraphWrapper
    //                 height={ref?.current?.clientHeight ?? 735}
    //                 width={ref?.current?.clientWidth ?? 1710}
    //                 search={search}
    //                 threshold={value}
    //                 graphRef={graphRef}
    //                 graphData={graphData}
    //                 setInitCoords={setInitCoords}
    //                 setInitRotation={setInitRotation}
    //                 is3d={is3d}
    //                 antiPattern={antiPattern}
    //                 colorMode={color}
    //                 defNodeColor={defNodeColor}
    //                 setDefNodeColor={setDefNodeColor}
    //                 setGraphData={setGraphData}
    //                 isDarkMode={isDark}
    //                 selectedAntiPattern={selectedAntiPattern}
    //                 trackNodes={trackNodes}
    //                 focusNode={focusNode}
    //                 endpointCalls={[]}
    //                 trackChanges={trackChanges}
    //                 expandedNodes={expandedNodes}
    //                 setExpandedNodes={setExpandedNodes}
    //                 isHighLevelExpanded={isHighLevelExpanded}
    //             />
            
    //             <Menu trackNodes={trackNodes} setTrackNodes={setTrackNodes} />

    //             {/* left click node pop up box */}
    //             <InfoBox
    //                 graphData={graphData}
    //                 focusNode={focusNode}
    //                 setFocusNode={setFocusNode}
    //             />
    //             {/* Bottom left "color by" box */}
    //             {/* {!antiPattern ? (
    //                 <ColorSelector
    //                     value={value}
    //                     setValue={setValue}
    //                     color={color}
    //                     setColor={setColor}
    //                     isDarkMode={isDark}
    //                 />
    //             ) : (
    //                 <></>
    //             )} */}

    //             <div className="flex flex-row items-center justify-center w-full">
    //                 {/* Timeline slider on bottom of the screen */}
    //                 <TimeSlider
    //                     max={max}
    //                     setGraphData={setGraphData}
    //                     graphTimeline={graphTimeline}
    //                     currentInstance={currentInstance}
    //                     setCurrentInstance={setCurrentInstance}
    //                     setDefNodeColor={setDefNodeColor}
    //                     trackChanges={trackChanges}
    //                 />
    //             </div>
    //             <TrackNodeMenu
    //                 trackNodes={trackNodes}
    //                 setTrackNodes={setTrackNodes}
    //                 graphData={graphData}
    //                 graphTimeline={graphTimeline}
    //                 currentInstance={currentInstance}
    //             />
    //         </ErrorBoundary>
    //     </div>}
    //     /> 
    //     <Route path="/node" element={<NewPage/>}/>
    //     </Routes>

    //     <NotificationToast 
    //         notification={notification} 
    //         onClose={() => setNotification(null)} 
    //     />

    //     </BrowserRouter>
    // );
}


export default App;
