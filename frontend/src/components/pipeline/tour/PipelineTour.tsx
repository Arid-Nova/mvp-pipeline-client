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
                        Let's configure your workspace. This quick tour will show you how to construct, analyze, and execute your first microservices analysis pipeline.
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
                        Analysis Toolbox
                    </h3>
                    <p className="text-[13px] text-slate-400 leading-relaxed">
                        Access your analysis agents here. Expand a category block and <span className="text-white font-semibold">click any option</span> to instantly inject it into your active workspace.
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
                        This is your infinite workspace grid. Drag your analysis agents (cards) freely to configure your flow.
                    </p>
                    <p className="text-[13px] text-slate-400 leading-relaxed mb-3">
                        To zoom in and out or pan around, use the following controls:
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
            target: '.tour-pipeline-canvas', 
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                        </svg>
                        Placing & Moving Nodes
                    </h3>
                    
                    {/* Beautifully framed GIF container */}
                    <div className="mt-2 mb-4 rounded-lg overflow-hidden border border-slate-700/80 shadow-[0_0_20px_rgba(0,0,0,0.4)] bg-slate-950/80 p-1">
                        <img 
                            src="/tour/addingmoving.gif" 
                            alt="Demonstration of adding and moving nodes on the canvas" 
                            className="w-full h-auto rounded opacity-90 hover:opacity-100 transition-opacity pointer-events-none"
                        />
                    </div>

                    <p className="text-[13px] text-slate-400 leading-relaxed">
                        Simply click any module in the toolbox to instantly add it to your grid. Once it's on the canvas, <span className="text-white font-semibold">click and drag</span> any card to organize your layout.
                    </p>

                    <p className="text-[13px] text-slate-400 leading-relaxed">
                        If you want to remove a card, simply click on the "X" on the top right corner.
                    </p>
                </div>
            ),
            placement: 'center', 
            skipBeacon: true,     
            blockTargetInteraction: false
        },
        {
            target: '.tour-pipeline-canvas', 
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        Wiring & Linking Nodes
                    </h3>
                    
                    <div className="mt-2 mb-4 rounded-lg overflow-hidden border border-slate-700/80 shadow-[0_0_20px_rgba(0,0,0,0.4)] bg-slate-950/80 p-1">
                        <img 
                            src="/tour/linking.gif" 
                            alt="Demonstration of linking nodes together" 
                            className="w-full h-auto rounded opacity-90 hover:opacity-100 transition-opacity pointer-events-none"
                        />
                    </div>

                    <p className="text-[13px] text-slate-400 leading-relaxed">
                        To construct your analysis sequence, connect cards together by clicking between <span className="text-yellow-400 font-semibold">colored boundary pins</span>. Data flows from source (link starting node) to destination (link finihsing node)!
                    </p>
                    <p className="text-[13px] text-slate-400 leading-relaxed">
                        You can always click on the red "X" on any link to remove it.
                    </p>
                </div>
            ),
            placement: 'center', 
            skipBeacon: true,     
            blockTargetInteraction: false
        },
        {
            target: '.tour-clear-pipeline', 
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Clear Workspace
                    </h3>
                    <p className="text-[13px] text-slate-400 leading-relaxed">
                        Need to start completely fresh? Use this to wipe all nodes and links from your active canvas. <span className="text-rose-400 font-semibold">Make sure to save first!</span>
                    </p>
                </div>
            ),
            placement: 'bottom', 
            skipBeacon: true,     
            blockTargetInteraction: false
        },
        {
            target: '.tour-session-status', 
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        Workspace State
                    </h3>
                    <p className="text-[13px] text-slate-400 leading-relaxed mb-3">
                        Keep track of your active session here. This will monitor your pipeline and let you know if you have <span className="text-amber-400 font-semibold">Unsaved</span> changes that need to be committed.
                    </p>
                </div>
            ),
            placement: 'bottom-start', 
            skipBeacon: true,     
            blockTargetInteraction: false
        },
        {
            target: '.tour-undo-redo', 
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                        {/* A sleek history/undo arrow icon in indigo */}
                        <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        History Controls
                    </h3>
                    <p className="text-[13px] text-slate-400 leading-relaxed mb-4">
                        Made a mistake? You can step backward or forward through your canvas changes at any time.
                    </p>
                    <div className="flex gap-2">
                        <span className="bg-slate-950 border border-slate-700 text-slate-300 px-2 py-1 rounded text-[10px] font-mono shadow-inner">
                            <kbd>Ctrl</kbd> + <kbd>Z</kbd> to Undo
                        </span>
                        <span className="bg-slate-950 border border-slate-700 text-slate-300 px-2 py-1 rounded text-[10px] font-mono shadow-inner">
                            <kbd>Ctrl</kbd> + <kbd>Y</kbd> to Redo
                        </span>
                    </div>
                </div>
            ),
            placement: 'bottom', 
            skipBeacon: true,     
            blockTargetInteraction: false
        },
        {
            target: '.tour-settings-button', 
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Session & Settings Menu
                    </h3>
                    <p className="text-[13px] text-slate-400 leading-relaxed mb-3">
                        Click here to open your workspace settings. Inside, you can access:
                    </p>
                    <ul className="text-[12px] text-slate-400 space-y-3 mt-2">
                        <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>
                            <p><span className="text-white font-semibold">Session Controls:</span> Save your active pipeline, Save As your active pipeline with a custom name you can remember, or Load previous work.</p>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></span>
                            <p><span className="text-white font-semibold">GitHub Auth:</span> Securely set your Personal Access Token to bypass API limits during analysis.</p>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.8)]"></span>
                            <p><span className="text-white font-semibold">Tour:</span> Take this tour <b>anytime</b> again if you would like to refresh your memory!</p>
                        </li>
                    </ul>
                </div>
            ),
            placement: 'bottom-end', 
            skipBeacon: true,     
            blockTargetInteraction: false
        },
        {
            target: '.tour-run-pipeline', 
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Running the Pipeline
                    </h3>
                    
                    <div className="mt-2 mb-4 rounded-lg overflow-hidden border border-slate-700/80 shadow-[0_0_20px_rgba(0,0,0,0.4)] bg-slate-950/80 p-1">
                        <img 
                            src="/tour/running.gif" 
                            alt="Demonstration of the pipeline executing" 
                            className="w-full h-auto rounded opacity-90 hover:opacity-100 transition-opacity pointer-events-none"
                        />
                    </div>

                    <p className="text-[13px] text-slate-400 leading-relaxed mb-3">
                        Once your architecture is fully wired up, click here to initialize the full analysis sequence. The engine will process your cards in order.
                    </p>
                    
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5 mt-2 flex gap-2 items-start">
                        <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <p className="text-[11px] text-rose-300/90 leading-relaxed">
                            <span className="font-bold text-rose-400 uppercase tracking-wider">Pro Tip:</span> Need to abort? You can click this button while the pipeline is running to instantly terminate all background agents.
                        </p>
                    </div>
                </div>
            ),
            placement: 'bottom-end', 
            skipBeacon: true,     
            blockTargetInteraction: false
        },
        {
            target: '.tour-pipeline-canvas', 
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Run From Node
                    </h3>

                    <div className="mt-2 mb-4 rounded-lg overflow-hidden border border-slate-700/80 shadow-[0_0_20px_rgba(0,0,0,0.4)] bg-slate-950/80 p-1">
                        <img 
                            src="/tour/runfromnode.gif" 
                            alt="Demonstration of running the pipeline from a specific node" 
                            className="w-full h-auto rounded opacity-90 hover:opacity-100 transition-opacity pointer-events-none"
                        />
                    </div>

                    <p className="text-[13px] text-slate-400 leading-relaxed">
                        Need to add more steps after a successful run? You don't have to restart from the beginning! Simply add your new cards and click the <span className="text-violet-400 font-semibold">Play button</span> directly on any node to resume execution from that exact point.
                    </p>
                </div>
            ),
            placement: 'center', 
            skipBeacon: true,     
            blockTargetInteraction: false
        },
        {
            target: '.tour-explore-preview',
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-3 flex items-center gap-2">
                        <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        Agent Explorer
                    </h3>
                    <p className="text-[13px] text-slate-400 leading-relaxed mb-1">
                        But before you start, if you want to try out the agents independently, click here to see exactly what they do in an isolated sandbox.
                    </p>
                </div>
            ),
            placement: 'right', 
            skipBeacon: true,
            blockTargetInteraction: false
        },
        {
            target: 'body', 
            content: (
                <div className="text-center flex flex-col items-center pt-2 pb-4">
                    <div className="w-14 h-14 rounded-full bg-slate-900 border border-teal-500/40 flex items-center justify-center mb-4 shadow-[0_0_40px_rgba(45,212,191,0.35)] animate-pulse">
                        <svg className="w-7 h-7 text-teal-400 tour-animated-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 17a7 7 0 100-14 7 7 0 000 14zM22 22l-4.35-4.35" />
                        </svg>
                    </div>
                    
                    <h3 className="text-base font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-teal-200 to-teal-400 uppercase tracking-widest mb-2 drop-shadow-sm">
                        You're All Set!
                    </h3>
                    
                    <p className="text-[13px] text-slate-300 leading-relaxed font-medium max-w-[300px] mx-auto">
                        You now have everything you need to evaluate, verify, and validate complex microservice architectures. 
                    </p>
                    
                    <div className="mt-4 py-2 px-4 bg-slate-950/50 border border-slate-700/50 rounded-lg inline-block">
                        <p className="text-[11px] font-bold text-teal-500 uppercase tracking-widest">
                            Happy Analyzing!
                        </p>
                    </div>
                </div>
            ),
            placement: 'center', 
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