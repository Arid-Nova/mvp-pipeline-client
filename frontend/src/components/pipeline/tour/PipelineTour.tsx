import React from 'react';
import { Joyride, Step, EventData } from 'react-joyride';
import { ConduitTourTooltip } from './ConduitTourTooltip';

interface PipelineTourProps {
    run: boolean;
    onFinish: () => void;
}

export const PipelineTour: React.FC<PipelineTourProps> = ({ run, onFinish }) => {   
    const steps: Step[] = [
        {
            target: 'body',
            content: (
                <div>
                    <h2 className="text-sm font-bold tracking-wider uppercase text-slate-200 mb-1">
                        Welcome to <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-teal-200 to-teal-400 font-extrabold text-base drop-shadow-sm">CONDUIT</span>
                    </h2>
                    <p className="text-[10px] font-bold text-teal-500/70 tracking-[0.2em] uppercase mb-4">
                        By AridNova
                    </p>
                    <p className="text-[13px] text-slate-300 leading-relaxed font-medium">
                        Let's configure your workspace. This quick onboarding will show you how to construct, analyze, and execute your first verification pipeline.
                    </p>
                </div>
            ),
            placement: 'center',
            skipBeacon: true
        },
        {
            target: '.tour-toolbox-sidebar',
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                        </svg>
                        The Module Library
                    </h3>
                    <p className="text-[13px] text-slate-400 leading-relaxed">
                        Access your processing nodes here. Expand a category block and <span className="text-white font-semibold">click any node</span> to instantly inject it into your active workspace.
                    </p>
                </div>
            ),
            placement: 'right',
            skipBeacon: true,     
            blockTargetInteraction: false
        },
        {
            target: '.tour-pipeline-canvas',
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                        Visual Canvas
                    </h3>
                    <p className="text-[13px] text-slate-400 leading-relaxed mb-3">
                        This is your infinite workspace grid. Drag cards freely to organize your flow.
                    </p>
                    <div className="flex gap-2">
                        <span className="bg-slate-950 border border-slate-700 text-slate-300 px-2 py-1 rounded text-[10px] font-mono shadow-inner"><kbd>Space</kbd> + Drag to Pan</span>
                        <span className="bg-slate-950 border border-slate-700 text-slate-300 px-2 py-1 rounded text-[10px] font-mono shadow-inner"><kbd>Ctrl</kbd> + Scroll to Zoom</span>
                    </div>
                </div>
            ),
            placement: 'center',
            skipBeacon: true,     
            blockTargetInteraction: false
        },
        {
            target: '.tour-pipeline-header', 
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Execution Engine
                    </h3>
                    <p className="text-[13px] text-slate-400 leading-relaxed">
                        Link nodes using their colored boundary pins. Once your pipeline architecture is complete, use the <span className="text-emerald-400 font-semibold">Run</span> controls here to trigger the evaluation sequence.
                    </p>
                </div>
            ),
            placement: 'bottom',
            skipBeacon: true,     
            blockTargetInteraction: false
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