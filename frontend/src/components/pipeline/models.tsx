import { VerificationResponse } from '../../services/api';

export type CardType = 
    | 'SYSTEM_INPUT'
    | 'MULTI_REPO' 
    | 'COMPONENT_GENERATE'
    | 'UPLOAD_IR' 
    | 'IR_HOLDER' 
    | 'COMPONENT_HOLDER'
    | 'FORMAL_VERIFY' 
    | 'SCENARIO_GENERATE'
    | 'VISUALIZATION' 
    | 'AEGIS' 
    | 'FORMAL_VIZ';

export interface SystemPayload {
    type: 'SYSTEM_PAYLOAD';
    systemName: string;
    repositories: { repoUrl: string; branch: string; commit: string }[];
}

export interface ComponentPayload {
    id: string;
    endpoints: any;
    components: any;
}

export interface PipelinePayload {
    irJson: any;
    metadata: {
        systemName: string;
        repoUrl: string;
        branch: string;
        commitId: string;
    };
}

export interface NodeData {
    id: string;
    type: CardType;
    x: number;
    y: number;
    data: {
        systemName?: string;
        repoUrl?: string;
        branch?: string;
        commit?: string;
        repositories?: { repoUrl: string; branch: string; commit: string }[];
        rolePriorities?: { role: string; priority: number }[];
        componentPayload?: ComponentPayload;
        payload?: PipelinePayload; 
        verificationResult?: VerificationResponse;
        scenarioPayload?: ScenarioPayload;
        selectedScenarios?: string[];
        systemInfo?: {
            systemName: string;
            ir: any;
        };
    };
    status: 'idle' | 'running' | 'completed' | 'failed';
    logs: string[];
}

export interface Connection {
    id: string;
    source: string;
    target: string;
}

export interface ScenarioItem {
    scenario_id: string;
    method: string;
    endpoint: string;
    allowed_roles: string[];
    expected_outcome: string;
}

export interface ScenarioPayload {
    vectorId: string;
    scenarios: ScenarioItem[];
}