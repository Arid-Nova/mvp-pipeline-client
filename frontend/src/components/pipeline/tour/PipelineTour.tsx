import React from 'react';
import { Joyride, Step, STATUS, type EventData } from 'react-joyride';

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
                    <h2 className="text-lg font-bold text-slate-800 mb-2">Welcome to CONDUIT by AridNova!</h2>
                    <p className="text-sm text-slate-600">Let's take a quick tour to show you how to build your first analysis pipeline. You can skip this anytime.</p>
                </div>
            ),
            placement: 'center',
            skipBeacon: true
        },
        {
            target: '.tour-toolbox-sidebar',
            content: (
                <div>
                    <h3 className="font-bold text-slate-800">The Toolbox</h3>
                    <p className="text-sm text-slate-600 mt-1">Here are all your available nodes. Click on a category to expand it, and click any node to add it to your canvas!</p>
                </div>
            ),
            placement: 'right',
        },
        {
            target: '.tour-pipeline-canvas',
            content: (
                <div>
                    <h3 className="font-bold text-slate-800">The Canvas</h3>
                    <p className="text-sm text-slate-600 mt-1">You can drag cards around freely. Try middle-clicking or holding Space to pan around, and use Ctrl+Scroll to zoom in and out.</p>
                </div>
            ),
            placement: 'center',
        },
        {
            target: '.tour-pipeline-header', 
            content: (
                <div>
                    <h3 className="font-bold text-slate-800">Connecting & Running</h3>
                    <p className="text-sm text-slate-600 mt-1">To connect cards, click the colored dots on the edges of the cards. Once your pipeline is ready, use the controls up here to Run, Save, or clear your session.</p>
                </div>
            ),
            placement: 'bottom',
        }
    ];

    const handleJoyrideEvent = (data: EventData) => {
        const { status } = data;
        const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
        
        if (finishedStatuses.includes(status)) {
            onFinish();
        }
    };

    return (
        <Joyride
            steps={steps}
            run={run}
            continuous={true} 
            onEvent={handleJoyrideEvent}
            options={{
                primaryColor: '#059669',
                textColor: '#1e293b',
                backgroundColor: '#ffffff',
                overlayColor: 'rgba(0, 0, 0, 0.75)',
                zIndex: 10000,
                showProgress: true,
                buttons: ['back', 'close', 'primary', 'skip'], 
            }}
            styles={{
                tooltipContainer: {
                    textAlign: 'left',
                },
                buttonPrimary: {
                    borderRadius: '8px',
                    fontWeight: 'bold',
                },
                buttonSkip: {
                    color: '#64748b',
                }
            }}
        />
    );
};