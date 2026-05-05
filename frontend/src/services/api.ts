import axios from 'axios';
import { showError } from '../utils/notifications';
import { RepositoryInput, VerificationInput, VerificationResponse, OrgImportResponse } from './types';
import { PromptItem } from '../components/pipeline/models';


export const fetchIRFromRepo = async (input: RepositoryInput) => {
    try {
        const response = await axios.post('/ir/create', input);
        return response.data; 
    } catch (error: any) {
        const msg = error.response?.data?.message || "Failed to generate IR from repository.";
        showError(msg);
        throw error;
    }
};

export const verifySystem = async (input: VerificationInput): Promise<VerificationResponse> => {
    try {
        const response = await axios.post('http://localhost:9000/verify', input);
        return response.data;
    } catch (error: any) {
        const msg = error.response?.data?.message || "Verification service unreachable.";
        showError(msg);
        throw error;
    }
};

export const checkHistoricalIRs = async (systemName: string): Promise<boolean> => {
    try {
        const response = await axios.get('/ir/meta', { 
            params: { systemName }
        });
        return response.status === 200;
    } catch (error: any) {
        console.error("Failed to check historical IRs:", error);
        return false;
    }
};

export const fetchHistoricalIRs = async (systemName: string): Promise<any[]> => {
    try {
        const response = await axios.get('/ir', { 
            params: { systemName }
        });
        return response.data;
    } catch (error: any) {
        console.error("Failed to fetch historical IRs:", error);
        showError("Failed to load historical timeline data.");
        throw error;
    }
};

export const createComponent = async (reqBody: any) => {
    const response = await fetch('http://localhost:8060/component/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);
    return await response.json();
};

export const generateAuthVectors = async (indexId: string) => {
    const authVectorsResponse = await fetch('http://localhost:8050/vectors/generate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indexId: indexId }) 
    });

    if (!authVectorsResponse.ok) throw new Error(`API error ${authVectorsResponse.status}`);
    return await authVectorsResponse.json();
};

export const generateScenarios = async (indexId: string|undefined, vectorsId: string|undefined) => {
    const actualScenarios = await fetch('http://localhost:8040/scenarios/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
            {   
                index_id: indexId,
                vectors_id: vectorsId
            }
        ) 
    });

    if (!actualScenarios.ok) throw new Error(`API error ${actualScenarios.status}`);
    return await actualScenarios.json();
};

export const generateTestSuites = async (selectedLlm: string, prompts: PromptItem[]|undefined) => {
    const response = await fetch('http://localhost:8030/testsuites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            llm_model: selectedLlm,
            prompts: prompts 
        })
    });

    if (!response.ok) throw new Error(`Test Generation API error: ${response.status}`);
    
    return await response.json();
};

export const generatePrompts = async (selectedIds: string[], targetLanguage: string) => {
    const response = await fetch('http://localhost:8040/scenarios/prompts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_ids: selectedIds, language: targetLanguage })
    });

    if (!response.ok) throw new Error(`Prompt API error: ${response.status}`);
    
    return await response.json(); 
};

export const analyzeAegis = async (enginePayload: any) => {
    return fetch('http://localhost:8900/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(enginePayload)
    })
};

export const fetchChangeImpact = async (deltaInput: any) => {
    const response = await fetch('http://localhost:8080/ir/delta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deltaInput)
    });
    if (!response.ok) throw new Error(`Delta API error: ${response.status}`);
    return await response.json();
};

export const importOrganization = async (orgUrl: string): Promise<OrgImportResponse> => {
    const response = await fetch('http://localhost:8020/import/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_url: orgUrl })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.detail || `API error ${response.status}: Failed to import organization`;
        showError(errorMessage);
        throw new Error(errorMessage);
    }
    
    return await response.json();
};

export const saveGitHubToken = async (token: string) => {
    const response = await fetch('http://localhost:8020/settings/github-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_token: token })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || `API error ${response.status}`);
    }
    return await response.json();
};

export const deleteGitHubToken = async () => {
    const response = await fetch('http://localhost:8020/settings/github-token', {
        method: 'DELETE'
    });

    if (!response.ok) throw new Error(`API error ${response.status}`);
    return await response.json();
};

export const checkGitHubTokenStatus = async () => {
    try {
        const response = await fetch('http://localhost:8020/settings/github-token/status');
        if (!response.ok) return false;
        const data = await response.json();
        return data.hasToken;
    } catch (error) {
        console.error("Failed to check token status", error);
        return false; 
    }
};