import React, { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";

import VerificationResultPage from "./components/verification/VerificationResultPage";
import {Notification, setNotificationCallback, showError, showSuccess} from "./utils/notifications"
import getData from "./parsers/getData";
import { setupAxios, setupLogger } from "./utils/axiosSetup";

import { checkHistoricalIRs, fetchHistoricalIRs, 
    startUserSession, endUserSession, checkEndedSessionsExists } from './services/api';

import NotificationToast from "./components/generic/NotificationToast";
import LandingPage from "./components/landing/LandingPage";
import IRFileUpload from "./components/IRFileUpload";
import Footer from "./components/generic/Footer";

import HistoryNotification from './components/graph/HistoricNotification';
import { MobileWarning } from "./components/generic/MobileWarning";
import PipelinePage from "./components/pipeline/PipelinePage";
import ExecutorPage from "./components/executor/ExecutorPage";
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

// Mobile compatibility setting
import { polyfill } from "mobile-drag-drop";

setupLogger();
setupAxios();

polyfill({
    dragImageCenterOnTouch: true 
});

window.addEventListener('touchmove', function() {}, {passive: false});


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
    const [isMobile, setIsMobile] = useState(false);
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

    // Historic IR state
    const [historyPrompt, setHistoryPrompt] = useState<{ show: boolean, systemName: string }>({ show: false, systemName: '' });

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

    // Small Screen handling
    useEffect(() => {
        const checkScreenSize = () => {
            // Checks if smaller than tablet/iPad size
            setIsMobile(window.innerWidth < 1024);
        };

        checkScreenSize();
        window.addEventListener('resize', checkScreenSize);
        return () => window.removeEventListener('resize', checkScreenSize);
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

    // Background Check for historic IRs
    useEffect(() => {
        const systemName = graphData?.name || 
            (typeof currentInstance === 'number' && graphTimeline ? graphTimeline[currentInstance]?.name : undefined);
        
        if (systemName && (!graphTimeline || graphTimeline.length <= 1)) {
            checkHistoricalIRs(systemName).then((hasHistory) => {
                if (hasHistory) {
                    setHistoryPrompt({ show: true, systemName });
                }
            });
        }
    }, [graphData, currentInstance, graphTimeline]);

    // Handlers
    // Load the historical IRs
    const handleLoadHistory = async () => {
        try {
            setHistoryPrompt(prev => ({ ...prev, show: false })); 
            
            // Fetching historical IRs
            const historyData = await fetchHistoricalIRs(historyPrompt.systemName);
            
            setGraphTimeline(prevTimeline => {
                const currentTimeline = prevTimeline || [];
                
                // Creating a Set of existing commitIDs to prevent duplicates
                const existingIds = new Set(currentTimeline.map(item => item.commitID)); 
                
                // Cleaning and filtering historical items
                const newHistoricalItems = historyData.filter(ir => {
                    if (!ir.commitID) {
                        ir.commitID = "unknown-" + Math.random(); 
                    }
                    return !existingIds.has(ir.commitID);
                });

                return [...newHistoricalItems, ...currentTimeline];
            });

            setCurrentInstance(prevIndex => {
                if (typeof prevIndex === 'number') {
                    const currentTimeline = graphTimeline || [];
                    const existingIds = new Set(currentTimeline.map(item => item.commitID));
                    const addedCount = historyData.filter(ir => !existingIds.has(ir.commitID)).length;
                    
                    return prevIndex + addedCount;
                }
                return prevIndex;
            });
            
            showSuccess(`Successfully loaded ${historyData.length} historical records!`);

        } catch (error) {
            console.error(error);
            showError(`Error occurred while loading historical records!`);
        }
    };

    const navigate = useNavigate();
    const location = useLocation();

    // User's browser sessions with the pipeline
    // Recording start of a session
    useEffect(() => {
        if (location.pathname === '/pipeline' && !sessionStorage.getItem('active_session_id')) {
            const initSession = async () => {
                const browserInfo = navigator.userAgent; 
                const resolution = `${window.screen.width}x${window.screen.height}`; 
                
                const sessionId = await startUserSession(browserInfo, resolution);   
                if (sessionId) {
                    sessionStorage.setItem('active_session_id', sessionId);
                }

                // Checking if there are no ended sessions to trigger tour.
                const hasEndedSessions = await checkEndedSessionsExists();
                if (!hasEndedSessions) {
                    // triggerTour(); 
                }
            };
            initSession();
        }
    }, [location.pathname]);

    // Recording end of a session on tab close
    useEffect(() => {
        const handleTabClose = () => {
            const sessionId = sessionStorage.getItem('active_session_id');
            console.log(`[Session Check] Tab closing/navigating away. Ending session: ${sessionId}`);
            
            if (sessionId) {
                endUserSession(sessionId);
                sessionStorage.removeItem('active_session_id');
            }
        };

        window.addEventListener('pagehide', handleTabClose);
        return () => {
            window.removeEventListener('pagehide', handleTabClose);
        };
    }, []);


    // IR uploading handle
    useEffect(() => {
        if (location.state && location.state.irData) {
            handleIRLoaded(location.state.irData);
            window.history.replaceState({}, document.title);
        }
    }, [location.state]); 

    // Manually uploading a IR (not from history)
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
                if (location.pathname === '/graph-visualize') {
                    navigate('/graph-visualize', { replace: true, state: {} });
                } else {
                    navigate('/graph-visualize');
                }
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

    const handleResetTimeline = () => {
        if (graphTimeline && graphTimeline.length > 0 && typeof currentInstance === 'number') {
            const currentIR = graphTimeline[currentInstance];
            
            setGraphTimeline([currentIR]);
            setCurrentInstance(0);
            
            const processedData = getData(currentIR, undefined);
            if (processedData) {
                setGraphData(processedData);
            }
            
            showSuccess("Timeline reset to the current IR.");
        }
    };

    // Render Helper
    const renderLandingPage = () => (
        <div className="min-h-screen bg-gray-900 relative flex flex-col">
            <LandingPage onIRLoaded={handleIRLoaded} />
            <Footer />
        </div>
    );

    const renderMainGraph = () => {
        if (!graphData) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 via-violet-500 to-cyan-500 shadow-xl shadow-cyan-500/30 border border-white/10 flex items-center justify-center animate-pulse mb-6">
                         <svg className="w-7 h-7 text-white animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ animationDuration: '3s' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-slate-300 tracking-wider uppercase">
                        {location.state?.irData ? 'Parsing Pipeline Data...' : 'Waiting for Data...'}
                    </h2>
                </div>
            );
        }
        
        return (
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

                <IRFileUpload 
                    onFileSelect={onFileUpload} 
                    onReset={handleResetTimeline}
                />

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
                    setAntiPattern={setAntiPattern}
                    setSelectedAntiPattern={setSelectedAntiPattern}
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
    )};

    // --- Warning to Recommend using in larger screens ---
    if (isMobile) {
        return <MobileWarning />;
    }

    // --- Main Render ---
    return (
        <>
            <Routes>
                <Route path="/" element={<Navigate to="/pipeline" replace />} />
                <Route path="/explore" element={renderLandingPage()} />
                <Route path="/graph-visualize" element={renderMainGraph()} />
                <Route path="/node" element={<NewPage />} />
                <Route path="/verification-results" element={<VerificationResultPage />} />
                <Route path="/pipeline" element={<PipelinePage/>}/>
                <Route path="/executor" element={<ExecutorPage/>}/>
            </Routes>

            {/* Toast is outside Routes to persist during navigation/state changes */}
            <NotificationToast 
                notification={notification} 
                onClose={() => setNotification(null)} 
            />

            {/* Historical IR availability notification */}
            <HistoryNotification 
                show={historyPrompt.show}
                systemName={historyPrompt.systemName}
                onDismiss={() => setHistoryPrompt({ show: false, systemName: '' })}
                onLoad={handleLoadHistory}
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
