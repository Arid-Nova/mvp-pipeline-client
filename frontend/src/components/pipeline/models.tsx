import { VerificationResponse, OrgImportResponse } from '../../services/types';

export type CardType = 
    | 'SYSTEM_INPUT'
    | 'MULTI_REPO' 
    | 'COMPONENT_GENERATE'
    | 'UPLOAD_IR' 
    | 'IR_HOLDER' 
    | 'COMPONENT_HOLDER'
    | 'FORMAL_VERIFY' 
    | 'SCENARIO_GENERATE'
    | 'PROMPT_GENERATE'
    | 'VISUALIZATION' 
    | 'AEGIS' 
    | 'FORMAL_VIZ'
    | 'TEST_GENERATE'
    | 'TEST_EXECUTOR'
    | 'VERIFICATION_COMPARISON'
    | 'CHANGE_IMPACT'
    | 'SECURITY_REGRESSION';

export interface SystemPayload {
    type: 'SYSTEM_PAYLOAD';
    systemName: string;
    repositories: RepositoryMeta[];
}

export interface ComponentPayload {
    id: string;
    authvecid: string;
    endpoints: any;
    components: any;
}

export interface RepositoryMeta {
    repoUrl: string;
    branch: string;
    commitId: string;
}

export interface PipelinePayload {
    irJson: any;
    systemName: string;
    metadata: RepositoryMeta[];
    additional?: any;
}

export interface NodeData {
    id: string;
    type: CardType;
    x: number;
    y: number;
    data: {
        systemName?: string;
        targetUrl?: string;
        filterEndpointText?: string;
        filterShowInconsistenciesOnly?: boolean;
        repositories?: RepositoryMeta[];
        rolePriorities?: { 
            role: string; 
            priority: number 
        }[];
        componentPayload?: ComponentPayload;
        changeImpactPayload?: any;
        payload?: PipelinePayload; 
        verificationResult?: VerificationResponse;
        scenarioPayload?: ScenarioPayload;
        selectedScenarios?: string[];
        promptPayload?: PromptPayload;
        testSuitePayload?: TestSuitePayload;
        selectedLlm?: string;
        language?: string;
        isExpanded?: boolean;
        systemInfo?: {
            systemName: string;
            ir: any;
        };
        comparisonResult?: {
            totalSuggestions: number;
            totalScenarios: number;
            mappedCoverage: number;
            inconsistencyRate: number;
        };
        targetedServices?: string[];
        regressionPayload?: {
            baseCount: number;
            targetCount: number;
            resolved: any[];
            introduced: any[];
            persistent: any[];
        };
        orgImportData?: OrgImportResponse;
    };
    status: 'idle' | 'running' | 'completed' | 'failed';
    logs: string[];
}

export interface Connection {
    id: string;
    source: string;
    target: string;
}

export interface ScenarioPayload {
    vectorId: string;
    scenarios: any[];
}

export interface PromptItem {
    scenario_id: string;
    prompt: string;
}

export interface PromptPayload {
    prompts: PromptItem[];
    language: string;
}

export interface TestSuiteItem {
    scenario_id: string;
    test_code: string;
}

export interface TestSuitePayload {
    status: string;
    tests: TestSuiteItem[];
}

export interface MatrixData {
    services: string[];
    links: Record<string, Record<string, string>>;
    impacts: Record<string, Record<string, number>>;
    riskFactors: Record<string, Set<string>>;
    centralities: Record<string, number>;
}