import { CardType } from "../models";

export interface PipelineTemplate {
    id: string;
    name: string;
    description: string;
    icon: JSX.Element;
    gif: string;
    nodes: { tempId: string; type: CardType; x: number; y: number }[];
    connections: { sourceTempId: string; targetTempId: string }[];
}

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
    {
        id: 'arch-reconstruction',
        name: 'Architecture Reconstruction',
        description: 'Extract and visualize the microservices system architecture from configurable source repositories.',
        icon: (
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
        ),
        gif: 'sar.gif',
        nodes: [
            { tempId: 'sys', type: 'SYSTEM_INPUT', x: 100, y: 200 },
            { tempId: 'repo', type: 'MULTI_REPO', x: 450, y: 200 },
            { tempId: 'ir', type: 'IR_HOLDER', x: 800, y: 200 },
            { tempId: 'viz', type: 'VISUALIZATION', x: 1150, y: 200 }
        ],
        connections: [
            { sourceTempId: 'sys', targetTempId: 'repo' },
            { sourceTempId: 'repo', targetTempId: 'ir' },
            { sourceTempId: 'ir', targetTempId: 'viz' }
        ]
    },
    {
        id: 'formal-verification',
        name: 'Formal Policy Verification',
        description: 'Verify the unified authorization policy consistency through formal method verification and recieve policy change suggestions.',
        icon: (
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
        ),
        gif: 'formalverify.gif',
        nodes: [
            { tempId: 'sys', type: 'SYSTEM_INPUT', x: 100, y: 200 },
            { tempId: 'repo', type: 'MULTI_REPO', x: 450, y: 200 },
            { tempId: 'ir', type: 'IR_HOLDER', x: 800, y: 200 },
            { tempId: 'fv', type: 'FORMAL_VERIFY', x: 1150, y: 200 },
            { tempId: 'fviz', type: 'FORMAL_VIZ', x: 1500, y: 200 }
        ],
        connections: [
            { sourceTempId: 'sys', targetTempId: 'repo' },
            { sourceTempId: 'repo', targetTempId: 'ir' },
            { sourceTempId: 'ir', targetTempId: 'fv' },
            { sourceTempId: 'fv', targetTempId: 'fviz' }
        ]
    },
    {
        id: 'auth-test-generation',
        name: 'Auth Test Generation',
        description: 'Generate comprehensive, down-stream aware executable authorization test suites and run them against the target system.',
        icon: (
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
        ),
        gif: 'testgen.gif',
        nodes: [
            { tempId: 'sys', type: 'SYSTEM_INPUT', x: 100, y: 200 },
            { tempId: 'cg', type: 'COMPONENT_GENERATE', x: 450, y: 200 },
            { tempId: 'ch', type: 'COMPONENT_HOLDER', x: 800, y: 200 },
            { tempId: 'sg', type: 'SCENARIO_GENERATE', x: 1150, y: 200 },
            { tempId: 'pg', type: 'PROMPT_GENERATE', x: 1500, y: 200 },
            { tempId: 'tg', type: 'TEST_GENERATE', x: 1850, y: 200 },
            { tempId: 'te', type: 'TEST_EXECUTOR', x: 2200, y: 200 }
        ],
        connections: [
            { sourceTempId: 'sys', targetTempId: 'cg' },
            { sourceTempId: 'cg', targetTempId: 'ch' },
            { sourceTempId: 'ch', targetTempId: 'sg' },
            { sourceTempId: 'sg', targetTempId: 'pg' },
            { sourceTempId: 'pg', targetTempId: 'tg' },
            { sourceTempId: 'tg', targetTempId: 'te' }
        ]
    },
    {
        id: 'vulnerability-extraction',
        name: 'Vulnerability Extraction',
        description: 'Extract and quantify latent vulnerabilities (potential exploitable loopholes) for remediation prioritization using Aegis.',
        icon: (
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        ),
        gif: 'aegis.gif',
        nodes: [
            { tempId: 'sys', type: 'SYSTEM_INPUT', x: 100, y: 200 },
            { tempId: 'repo', type: 'MULTI_REPO', x: 450, y: 200 },
            { tempId: 'ir', type: 'IR_HOLDER', x: 800, y: 200 },
            { tempId: 'aegis', type: 'AEGIS', x: 1150, y: 200 }
        ],
        connections: [
            { sourceTempId: 'sys', targetTempId: 'repo' },
            { sourceTempId: 'repo', targetTempId: 'ir' },
            { sourceTempId: 'ir', targetTempId: 'aegis' }
        ]
    },
    {
        id: 'policy-drift-comparison',
        name: 'Policy Drift Comparison',
        description: 'Compare the unified authorization policies between two different snapshots (authorization policy drift) of a microservices system.',
        icon: (
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 9h16m0 0l-4-4m4 4l-4 4M20 15H4m0 0l4-4m-4 4l4 4" />
            </svg>
        ),
        gif: 'policydrift.gif',
        nodes: [
            // --- Track 1 (Top Pipeline) ---
            { tempId: 'sys1', type: 'SYSTEM_INPUT', x: 100, y: 50 },
            { tempId: 'repo1', type: 'MULTI_REPO', x: 450, y: 50 },
            { tempId: 'ir1', type: 'IR_HOLDER', x: 800, y: 50 },
            { tempId: 'fv1', type: 'FORMAL_VERIFY', x: 1150, y: 50 },
            
            // --- Track 2 (Bottom Pipeline) ---
            { tempId: 'sys2', type: 'SYSTEM_INPUT', x: 100, y: 350 },
            { tempId: 'repo2', type: 'MULTI_REPO', x: 450, y: 350 },
            { tempId: 'ir2', type: 'IR_HOLDER', x: 800, y: 350 },
            { tempId: 'fv2', type: 'FORMAL_VERIFY', x: 1150, y: 350 },
            
            // --- Convergence Nodes ---
            // Centered exactly between Track 1 (y: 50) and Track 2 (y: 350)
            { tempId: 'vcomp', type: 'SECURITY_REGRESSION', x: 1500, y: 200 },
            
            // Visualization sits slightly higher to cleanly accept inputs from FV1 and VCOMP
            { tempId: 'fviz', type: 'FORMAL_VIZ', x: 1850, y: 125 }
        ],
        connections: [
            // Track 1 wiring
            { sourceTempId: 'sys1', targetTempId: 'repo1' },
            { sourceTempId: 'repo1', targetTempId: 'ir1' },
            { sourceTempId: 'ir1', targetTempId: 'fv1' },
            
            // Track 2 wiring
            { sourceTempId: 'sys2', targetTempId: 'repo2' },
            { sourceTempId: 'repo2', targetTempId: 'ir2' },
            { sourceTempId: 'ir2', targetTempId: 'fv2' },
            
            // Convergence wiring (Comparing the two verifications)
            { sourceTempId: 'fv1', targetTempId: 'vcomp' },
            { sourceTempId: 'fv2', targetTempId: 'vcomp' },
            
            // Visualization wiring (Visualizing the V1 verification + The Drift Comparison)
            { sourceTempId: 'fv1', targetTempId: 'fviz' },
            { sourceTempId: 'vcomp', targetTempId: 'fviz' }
        ]
    },
    {
        id: 'change-impact-analysis',
        name: 'Change Impact Analysis',
        description: 'Analyze the architectural and security impact of changes between two snapshots of a microservices system.',
        icon: (
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 14a9 9 0 0118 0" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l3.5-3.5M13 14a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
        ),
        gif: 'changeimpact.gif',
        nodes: [
            // Track 1 (Snapshot 1)
            { tempId: 'sys1', type: 'SYSTEM_INPUT', x: 100, y: 50 },
            { tempId: 'repo', type: 'MULTI_REPO', x: 450, y: 50 },
            { tempId: 'up_ir', type: 'IR_HOLDER', x: 800, y: 50 },
            
            // Track 2 (Snapshot 2)
            // Positioned right under IR_HOLDER so the wiring to Change Impact is neat
            { tempId: 'sys2', type: 'SYSTEM_INPUT', x: 800, y: 250 },
            
            // Convergence
            // Centered vertically between the two tracks
            { tempId: 'ci', type: 'CHANGE_IMPACT', x: 1150, y: 150 }
        ],
        connections: [
            { sourceTempId: 'sys1', targetTempId: 'repo' },
            { sourceTempId: 'repo', targetTempId: 'up_ir' },
            { sourceTempId: 'up_ir', targetTempId: 'ci' },
            { sourceTempId: 'sys2', targetTempId: 'ci' }
        ]
    },
    {
        id: 'regressive-auth-testing',
        name: 'Regressive Auth Testing',
        description: 'A comprehensive end-to-end pipeline that combines change impact analysis with automated authorization test generation.',
        icon: (
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
            </svg>
        ),
        gif: 'regression.gif',
        nodes: [
            // The Root Node for V1 (Centered vertically to split up and down)
            { tempId: 'sys1', type: 'SYSTEM_INPUT', x: 100, y: 400 },
            
            // Top Track: Change Impact Path (Moved way up)
            { tempId: 'repo', type: 'MULTI_REPO', x: 550, y: -50 },
            { tempId: 'up_ir', type: 'IR_HOLDER', x: 1000, y: -50 },
            
            // The Root Node for V2 (Middle track, aligned under IR_HOLDER)
            { tempId: 'sys2', type: 'SYSTEM_INPUT', x: 1000, y: 400 },
            
            // Bottom Track: Component Gen Path (Moved way down)
            { tempId: 'cg', type: 'COMPONENT_GENERATE', x: 550, y: 850 },
            { tempId: 'ch', type: 'COMPONENT_HOLDER', x: 1000, y: 850 },
            
            // Change Impact Node (Merges Top Track and Middle Track)
            { tempId: 'ci', type: 'CHANGE_IMPACT', x: 1450, y: 175 },
            
            // The Long Tail: Scenario to Execution (Merges Change Impact and Bottom Track)
            { tempId: 'sg', type: 'SCENARIO_GENERATE', x: 1900, y: 500 },
            { tempId: 'pg', type: 'PROMPT_GENERATE', x: 2350, y: 500 },
            { tempId: 'tg', type: 'TEST_GENERATE', x: 2800, y: 500 },
            { tempId: 'te', type: 'TEST_EXECUTOR', x: 3250, y: 500 }
        ],
        connections: [
            // Branching from System 1
            { sourceTempId: 'sys1', targetTempId: 'repo' },
            { sourceTempId: 'sys1', targetTempId: 'cg' },
            
            // Top Track Wiring
            { sourceTempId: 'repo', targetTempId: 'up_ir' },
            { sourceTempId: 'up_ir', targetTempId: 'ci' },
            
            // Middle Track Wiring
            { sourceTempId: 'cg', targetTempId: 'ch' },
            
            // System 2 into Change Impact
            { sourceTempId: 'sys2', targetTempId: 'ci' },
            
            // Convergence into Scenario Generation
            { sourceTempId: 'ch', targetTempId: 'sg' },
            { sourceTempId: 'ci', targetTempId: 'sg' },
            
            // The Tail Execution
            { sourceTempId: 'sg', targetTempId: 'pg' },
            { sourceTempId: 'pg', targetTempId: 'tg' },
            { sourceTempId: 'tg', targetTempId: 'te' }
        ]
    }
];