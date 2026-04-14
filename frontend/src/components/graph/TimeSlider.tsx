import React, { useState } from "react";
import compareChanges from "../../parsers/getChanges";
import getData from "../../parsers/getData";

//*
// The time slide is what controller which commit is shown on the visualization
// It contains a few key parameters, setGraphTimeline, which can be used to update the commits available to the user
// setGraphData which is used to update the actual data being shown on the graph,
// graphTimeline which is an array of everyting on the timeline. Currently each array element contains the entire dictionary of an IR file
// currentInstance which is the index of the currently selected item on the timeline
// setCurrentInstance is called whenever the timeline is moved
// trackChanges is a toggle in the top right corner of the website which allows you to see the difference between the selected commit and the previous commit. This determines if getChanges() or getData() are called
// 
// */

type Props = {
    max: number;
    setGraphData: any;
    graphTimeline: Array<any>;
    currentInstance: any;
    setCurrentInstance: any;
    setDefNodeColor: any;
    trackChanges: any;
};

const TimeSlider: React.FC<Props> = ({
    max,
    setGraphData,
    graphTimeline,
    currentInstance,
    setCurrentInstance,
    setDefNodeColor,
    trackChanges,
}) => {
    // Original state for the slider's value is unchanged.
    const [value, setValue] = useState(0);
    
    // UI state for the expand/collapse feature.
    const [isExpanded, setIsExpanded] = useState(false);

    // Original handleChange function is unchanged.
    const handleChange = (e: any) => {
        setValue(e.target.value);
        setCurrentInstance(parseInt(e.target.value));
        if (trackChanges && (e.target.value != 0)) {
            setGraphData(compareChanges(graphTimeline[e.target.value - 1], graphTimeline[e.target.value]))
        } else {
            setGraphData(getData(graphTimeline[e.target.value]));
        }
        setDefNodeColor(false);
    };

    const formatEpoch = (epoch: any) => {
        if (!epoch) return "Not Found";
        
        const num = Number(epoch);
        if (isNaN(num)) return "Invalid Date";
        
        const date = new Date(num < 10000000000 ? num * 1000 : num);
        
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Return null if there's no data to prevent errors.
    if (!graphTimeline || graphTimeline.length === 0) {
        return null;
    }

    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 w-5/6 max-w-4xl">
            <div className="bg-slate-800/70 text-white rounded-xl p-4 shadow-lg backdrop-blur-none transition-all duration-300">
                
                {/* Header with title and collapse/expand button */}
                <div className="relative mb-3">
                    <label htmlFor="steps-range" className="font-semibold text-xl animated-gradient-dark block text-center w-full">
                        Commit Timeline
                    </label>
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)} 
                        className="absolute right-0 top-1/2 transform -translate-y-1/2 p-1 rounded-full hover:bg-slate-700/50 transition-color"
                        aria-label={isExpanded ? "Collapse timeline details" : "Expand timeline details"}
                    >
                    <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className={`h-5 w-5 transition-transform duration-300 ${isExpanded ? '' : 'rotate-180 animate-bounce-subtle'}`} 
                        viewBox="0 0 20 20" 
                        fill="currentColor"
                    >
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    </button>
                </div>
                
                {/* Restyled slider input */}
                <input
                    id="steps-range"
                    type="range"
                    min="0"
                    max={graphTimeline.length - 1}
                    value={value}
                    onChange={handleChange}
                    step="1"
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer
                                bg-gradient-to-r from-gray-800/30 to-white/30
                                accent-indigo-600
                                hover:opacity-90
                                "
                    style={{
                        backgroundSize: '100% 100%',
                    }}
                />
                
                {/* Collapsible details container */}
                <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-40 mt-4' : 'max-h-0'}`}>
                    <div className="flex flex-col text-sm font-mono text-slate-300">
                        <div className="font-semibold text-base font-sans text-white">
                            Iteration {parseInt(String(value)) + 1}
                        </div>
                        {graphTimeline[currentInstance] && (
                            <>
                                {/* <div>
                                    Commit #{graphTimeline[currentInstance].commitID.substring(0, 7)}
                                </div> */}
                                <div>
                                    Created: {formatEpoch(graphTimeline[currentInstance].metadata?.createDate)}
                                </div>
                                <div>
                                    Modified: {formatEpoch(graphTimeline[currentInstance].metadata?.modifyDate)}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TimeSlider;
