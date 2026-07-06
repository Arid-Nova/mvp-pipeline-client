import React, { useState, useEffect } from 'react';
import { Joyride, Step, EventData, ACTIONS, EVENTS, STATUS } from 'react-joyride';
import { ConduitTourTooltip } from '../../pipeline/tour/ConduitTourTooltip';

interface FormalTourProps {
    run: boolean;
    onFinish: () => void;
    setActiveTab: (tabName: 'results' | 'graph') => void;
}

export const FormalTour: React.FC<FormalTourProps> = ({ run, onFinish, setActiveTab }) => {   
    const [stepIndex, setStepIndex] = useState(0);

    useEffect(() => {
        if (run) {
            setStepIndex(0);
            setActiveTab('results');
        }
    }, [run, setActiveTab]);
    
    const steps: Step[] = [
        {
            target: 'body',
            content: (
                <div>
                    <h2 className="text-sm font-bold tracking-wider uppercase text-slate-200 mb-1">
                        Formal Verification Results
                    </h2>
                    <p className="text-[13px] text-slate-300 leading-relaxed font-medium mt-2">
                        Welcome to the Verification Dashboard. This page displays the absolute mathematical proofs calculated by the SMT solvers regarding your architectural authorization policies.
                    </p>
                </div>
            ),
            placement: 'center',
            skipBeacon: true
        },
        {
            target: '.tour-formal-sidebar',
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-2">
                        Verification Summary
                    </h3>
                    <p className="text-[12px] text-slate-400">
                        This panel breaks down the analyzed endpoints, showing how many passed the policy check and how many critical violations were found across the system.
                    </p>
                </div>
            ),
            placement: 'right'
        },
        {
            target: '.tour-formal-violations',
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-2">
                        Policy Violations
                    </h3>
                    <p className="text-[12px] text-slate-400">
                        If there are cross-service authorization mismatches (e.g., an admin-only endpoint calling a public endpoint), they will be flagged here with suggested remediations.
                    </p>
                </div>
            ),
            placement: 'right'
        },
        {
            target: '.tour-formal-graph',
            content: (
                <div>
                    <h3 className="text-[13px] font-bold text-white uppercase tracking-wide mb-2">
                        3D Evidence Topology
                    </h3>
                    <p className="text-[12px] text-slate-400">
                        This interactive graph show how the policy inconsistencies manifest across the system. Red nodes represent vulnerabilities where the formal policy mathematically fails. Drag to rotate and scroll to zoom.
                    </p>
                </div>
            ),
            placement: 'right'
        }
    ];

    const handleJoyrideEvent = (data: EventData) => {
        const { status, type, action, index } = data;

        if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
            setActiveTab('results');
            setStepIndex(0);
            onFinish();
            return;
        }

        if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
            const nextStepIndex = index + (action === ACTIONS.PREV ? -1 : 1);
            
            if (nextStepIndex === 3) {
                setActiveTab('graph');
                // Giving React 100ms to mount the Graph tab before Joyride looks for the class
                setTimeout(() => setStepIndex(nextStepIndex), 100);
            } 
            else if (nextStepIndex === 2 && action === ACTIONS.PREV) {
                setActiveTab('results');
                setTimeout(() => setStepIndex(nextStepIndex), 100);
            } 
            else {
                setStepIndex(nextStepIndex);
            }
        }
    };

    return (
        <Joyride
            steps={steps}
            run={run}
            stepIndex={stepIndex}
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