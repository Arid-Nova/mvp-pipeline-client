import { CardType } from './models';

export const CATEGORIES: Record<string, CardType[]> = {
    "Input": ['SYSTEM_INPUT', 'UPLOAD_IR'],
    "Generators": ['MULTI_REPO', 'COMPONENT_GENERATE'],
    "Intermediate Results": ['IR_HOLDER', 'COMPONENT_HOLDER'],
    "Version Control": ['CHANGE_IMPACT', 'SECURITY_REGRESSION'],
    "Processes": ['FORMAL_VERIFY', 'SCENARIO_GENERATE', 'PROMPT_GENERATE', 'TEST_GENERATE'],
    "Execution": ['TEST_EXECUTOR'],
    "Visualization": ['VISUALIZATION', 'FORMAL_VIZ', 'AEGIS', 'VERIFICATION_COMPARISON']
};

export const CARD_CONFIG: Record<CardType, { title: string; color: string; icon: JSX.Element; description: string; tooltip: { purpose: string; outcome: string;};}> = {
    SYSTEM_INPUT: { 
        title: "System Source", 
        color: "border-blue-500 bg-blue-900/20", 
        description: "Define GIT repositories",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>,
        tooltip: {
            purpose: "Define the Git repositories, branches, and commits that make up the system being analyzed.",
            outcome: "Provides repository information that downstream pipeline steps can use to generate and analyze artifacts."
        }
    },
    MULTI_REPO: { 
        title: "Generate IR", 
        color: "border-blue-500 bg-blue-900/20", 
        description: "Generate IR from GIT repository",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>,
        tooltip: {
            purpose: "Generate an Intermediate Representation (IR) from the configured source repositories.",
            outcome: "Produces a machine-readable IR that can be used for visualization, verification, and further analysis."
        }
    },
    UPLOAD_IR: { 
        title: "Upload IR", 
        color: "border-blue-500 bg-blue-900/20", 
        description: "Upload local JSON file",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>,
        tooltip: {
            purpose: "Import an existing IR file from your local machine instead of generating one.",
            outcome: "Makes a previously generated IR available for analysis within the pipeline."
        }
    },
    COMPONENT_GENERATE: { 
        title: "Get Components", 
        color: "border-teal-500 bg-teal-900/20", 
        description: "Extract components",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>,
        tooltip: {
            purpose: "Extract services, components, endpoints, and related system structure from the source information.",
            outcome: "Produces component data that can be used for scenario generation and architecture analysis."
        }
    },
    IR_HOLDER: { 
        title: "IR Card", 
        color: "border-yellow-500 bg-yellow-900/20", 
        description: "Stores and exposes IR JSON",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>,
        tooltip: {
            purpose: "Store and expose Intermediate Representation data between pipeline steps.",
            outcome: "Makes IR data available to connected cards without regenerating it."
        }
    },
    COMPONENT_HOLDER: { 
        title: "Component Card", 
        color: "border-orange-500 bg-orange-900/20", 
        description: "Stores Components & Endpoints",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>,
        tooltip: {
            purpose: "Store extracted component and endpoint information.",
            outcome: "Provides reusable component data for downstream analysis and scenario generation."
        }
    },
    FORMAL_VERIFY: { 
        title: "Formal Verification", 
        color: "border-purple-500 bg-purple-900/20", 
        description: "Run system verification",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>,
        tooltip: {
            purpose: "Analyze the system against formal security and consistency rules.",
            outcome: "Produces verification results that identify potential violations, inconsistencies, or policy issues."
        }
    },
    SCENARIO_GENERATE: { 
        title: "Scenario Generation", 
        color: "border-indigo-500 bg-indigo-900/20", 
        description: "Generate RBAC Test Scenarios",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>,
        tooltip: {
            purpose: "Generate role-based access control (RBAC) and security testing scenarios from system information.",
            outcome: "Produces realistic scenarios that can be used for validation and test creation."
        }
    },
    PROMPT_GENERATE: { 
        title: "LLM Prompter", 
        color: "border-emerald-500 bg-emerald-900/20", 
        description: "Prepares LLM prompts for scenarios",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>,
        tooltip: {
            purpose: "Convert generated scenarios into prompts suitable for large language model processing.",
            outcome: "Produces structured prompts ready for automated test generation."
        }
    },
    TEST_GENERATE: { 
        title: "Test Suite Generation", 
        color: "border-purple-500 bg-purple-900/20", 
        description: "Generate Tests via LLM",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M12 15a3 3 0 100-6 3 3 0 000 6z" />
            </svg>,
        tooltip: {
            purpose: "Generate executable test cases from prepared prompts and scenarios.",
            outcome: "Produces a test suite that can be executed against the target system."
        }
    },
    VISUALIZATION: { 
        title: "IR Visualization", 
        color: "border-green-500 bg-green-900/20", 
        description: "Launch graph visualizer",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>,
        tooltip: {
            purpose: "Visualize the Intermediate Representation as a graph or system model.",
            outcome: "Provides an interactive view of relationships and system structure."
        }
    },
    AEGIS: { 
        title: "Aegis", 
        color: "border-red-500 bg-red-900/20", 
        description: "Neuro-symbolic deep analysis",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>,
        tooltip: {
            purpose: "Perform advanced neuro-symbolic analysis of the generated system artifacts.",
            outcome: "Produces deeper insights and findings beyond standard verification workflows."
        }
    },
    FORMAL_VIZ: { 
        title: "Verification Visualization", 
        color: "border-pink-500 bg-pink-900/20", 
        description: "View verification results",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>,
        tooltip: {
            purpose: "Present formal verification results in an easier-to-understand visual format.",
            outcome: "Displays verification findings, relationships, and potential issues."
        }
    },
    TEST_EXECUTOR: {
        title: "Test Executor",
        color: "border-fuchsia-500 bg-fuchsia-900/20",
        description: "Configure and run generated tests",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>,
        tooltip: {
            purpose: "Configure and execute generated test suites.",
            outcome: "Runs tests and produces execution results for review."
        }
    },
    VERIFICATION_COMPARISON: {
        title: "Quick Compare",
        color: "border-sky-500 bg-sky-900/20",
        description: "Compare FV vs Scenario Inconsistencies",
        icon:
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>,
        tooltip: {
            purpose: "Compare formal verification results against generated security scenarios.",
            outcome: "Highlights agreements, inconsistencies, and coverage gaps between analyses."
        }
    },
    CHANGE_IMPACT: {
        title: "Change Impact",
        color: "border-orange-500 bg-orange-900/20",
        description: "Extract the changes betwen versions",
        icon: 
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="2" fill="currentColor" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7a5 5 0 100 10 5 5 0 000-10z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} strokeDasharray="1 3" d="M12 3a9 9 0 100 18 9 9 0 000-18z" />
            </svg>,
        tooltip: {
            purpose: "Analyze differences between software versions and identify affected areas.",
            outcome: "Produces a change summary that can drive downstream security and testing workflows."
        }
    },
    SECURITY_REGRESSION: {
        title: "Policy Drift",
        color: "border-rose-500 bg-rose-900/20",
        description: "Compare policy changes",
        icon:
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>,
        tooltip: {
            purpose: "Compare security policies across versions to detect changes in behavior or enforcement.",
            outcome: "Identifies policy regressions, drift, and security-impacting modifications."
        }
    }
};

export const VALID_CONNECTIONS: Record<CardType, CardType[]> = {
    SYSTEM_INPUT: ['MULTI_REPO', 'COMPONENT_GENERATE', 'VISUALIZATION', 'CHANGE_IMPACT'],
    MULTI_REPO: ['IR_HOLDER', 'FORMAL_VERIFY', 'CHANGE_IMPACT'],
    UPLOAD_IR: ['IR_HOLDER'],
    COMPONENT_GENERATE: ['COMPONENT_HOLDER'],
    COMPONENT_HOLDER: ['SCENARIO_GENERATE'],
    IR_HOLDER: ['FORMAL_VERIFY', 'VISUALIZATION', 'AEGIS', 'CHANGE_IMPACT'],
    SCENARIO_GENERATE: ['PROMPT_GENERATE', 'VERIFICATION_COMPARISON'],
    PROMPT_GENERATE: ['TEST_GENERATE'],
    TEST_GENERATE: ['TEST_EXECUTOR'],
    TEST_EXECUTOR: [],
    FORMAL_VERIFY: ['FORMAL_VIZ', 'SCENARIO_GENERATE', 'VERIFICATION_COMPARISON', 'SECURITY_REGRESSION'],
    VISUALIZATION: [], 
    AEGIS: [],        
    FORMAL_VIZ: [],
    VERIFICATION_COMPARISON: [],  
    CHANGE_IMPACT: ['SCENARIO_GENERATE'],
    SECURITY_REGRESSION: ['FORMAL_VIZ']
};