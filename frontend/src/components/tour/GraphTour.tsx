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
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-2">
                        Evolution Timeline
                    </h3>
                    <p className="text-[12px] text-slate-400">
                        If historical data is loaded, this slider lets you scrub back in time to see exactly how your system's architecture evolved over time.
                    </p>
                </div>
            ),
            placement: 'top'
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
            target: '.tour-3d-canvas',
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-2">
                        Interactive Map
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