import React from 'react';
import { Joyride, Step, EventData } from 'react-joyride';
import { ConduitTourTooltip } from './ConduitTourTooltip';

interface GraphTourProps {
    run: boolean;
    onFinish: () => void;
}

export const GraphTour: React.FC<GraphTourProps> = ({ run, onFinish }) => {   
    const steps: Step[] = [
        {
            target: 'body',
            content: (
                <div>
                    <h2 className="text-sm font-bold tracking-wider uppercase text-slate-200 mb-1">
                        Microservice Architecture Visualization
                    </h2>
                    <p className="text-[13px] text-slate-300 leading-relaxed font-medium mt-2">
                        Welcome to the 3D Architecture Visualization. This interactive environment lets you explore your entire distributed microservice topology.
                    </p>
                </div>
            ),
            placement: 'center',
            skipBeacon: true
        },
        {
            target: '.tour-graph-menu',
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-2">
                        Control Panel
                    </h3>
                    <div className="text-[12px] text-slate-400">
                        <span className="block mb-2">Use this menu to:</span>
                        
                        <ul className="list-disc pl-4 space-y-1.5 marker:text-slate-500">
                            <li><strong className="text-slate-300 font-semibold">Change theme:</strong> switch between light and dark modes.</li>
                            <li><strong className="text-slate-300 font-semibold">Highlight changes:</strong> view differences between current and previous architecture snapshots.</li>
                            <li><strong className="text-slate-300 font-semibold">Highlight anti-patterns:</strong> toggle highlights of structural vulnerabilities.</li>
                            <li><strong className="text-slate-300 font-semibold">Adjust detail:</strong> show or hide specific types of information (show all entities or show all underlying dependencies).</li>
                            <li><strong className="text-slate-300 font-semibold">Search:</strong> find specific services or endpoints.</li>
                            <li><strong className="text-slate-300 font-semibold">Export:</strong> save the current view as an image or data file.</li>
                            <li><strong className="text-slate-300 font-semibold">Reset:</strong> return the view to its default position.</li>
                        </ul>
                    </div>
                </div>
            ),
            placement: 'right'
        },
        {
            target: '.tour-timeline-slider',
            content: (
                <div className="flex flex-col gap-3">
                    <div>
                        <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-2">
                            Evolution Timeline
                        </h3>
                        <p className="text-[12px] text-slate-400 leading-relaxed">
                            If historical data is loaded, this slider lets you scrub back in time to see exactly how your system's architecture evolved over time.
                        </p>
                    </div>
                    
                    {/* New Trends Modal Callout */}
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 mt-1">
                        <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                            Trends
                        </span>
                        <p className="text-[12px] text-slate-400 leading-relaxed">
                            Open the trends view to get a high-level overview of your architectural drift, making it easy to spot if your system is evolving in a healthy or degraded direction.
                        </p>
                    </div>
                </div>
            ),
            placement: 'top'
        },
        {
            target: '.tour-change-impact', 
            content: (
                <div className="flex flex-col gap-3">
                    <div>
                        <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-2">
                            Change Impact Analysis
                        </h3>
                        <p className="text-[12px] text-slate-400 leading-relaxed">
                            Understand exactly how your architecture is evolving. This tool provides a detailed set of measurements detailing how both topological and semantic changes have impacted your various services between snapshots.
                        </p>
                    </div>
                    
                    {/* AI Summarization Callout */}
                    <div className="bg-slate-800/50 border border-indigo-500/30 rounded-lg p-3 mt-1">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                            </svg>
                            AI Impact Summary
                        </span>
                        <p className="text-[12px] text-slate-400 leading-relaxed">
                            Don't want to sift through the raw metrics? You can ask the AI assistant to instantly analyze the data and provide a plain-English summary of the most critical architectural shifts.
                        </p>
                    </div>
                </div>
            ),
            placement: 'bottom'
        },
        {
            target: '.tour-add-to-timeline',
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-2">
                        Manual Timeline Adjustment
                    </h3>
                    <p className="text-[12px] text-slate-400">
                        If you happen to have IR from a specific point in time, you can manually add it to the timeline by dropping it here.
                    </p>
                </div>
            ),
            placement: 'right'
        },
        {
            target: '.tour-graph-options',
            content: (
                <div className="flex flex-col gap-3">
                    <div>
                        <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-2">
                            Graph Controls & Versions
                        </h3>
                        <p className="text-[12px] text-slate-400 leading-relaxed">
                            Use these controls to view and select specific snapshots of the system for your timeline, replay this interactive tour at any time, and get detailed instructions on how to navigate the graph.
                        </p>
                    </div>
                    
                    {/* Snapshot Selection Callout */}
                    <div className="bg-slate-800/50 border border-emerald-500/30 rounded-lg p-3 mt-1">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            {/* Calendar / Snapshot Icon */}
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Personalized Snapshots
                        </span>
                        <p className="text-[12px] text-slate-400 leading-relaxed">
                            By clicking the versions icon, you can hand-pick exactly which historical snapshots are loaded into your timeline. This facilitates highly personalized, targeted architectural comparisons!
                        </p>
                    </div>
                </div>
            ),
            placement: 'bottom-end' 
        },
        {
            target: '.tour-3d-canvas',
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-2">
                        Interactive System Architecture
                    </h3>
                    <p className="text-[12px] text-slate-400">
                        Drag to rotate, scroll to zoom. Click node and links to reveal more information and double-click to reveal underlying dependencies.
                    </p>
                </div>
            ),
            placement: 'center'
        }
    ];

    const handleJoyrideEvent = (data: EventData) => {
        if (data.status === 'finished' || data.status === 'skipped') {
            onFinish();
        }
    };

    return (
        <Joyride
            steps={steps}
            run={run}
            continuous={true} 
            onEvent={handleJoyrideEvent}
            tooltipComponent={ConduitTourTooltip} 
            options={{
                overlayColor: 'rgba(2, 6, 23, 0.85)', 
                zIndex: 10000,
            }}
        />
    );
};