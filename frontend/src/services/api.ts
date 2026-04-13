import axios from 'axios';
import { showError } from '../utils/notifications';

// IR request schema
export interface RepositoryInput {
  systemName: string;
  systemRepositories: {
    repoBranchPair: {
      repositoryURL: string;
      branchName: string;
    };
    commitID?: string;
  }[];
}

// Formal verification request schema
export interface VerificationInput {
    systemName: string;
    repos: VerifyRepo[];
    ir: any; 
}

export interface VerifyRepo {
    repoURL: string;
    branch: string;
    commitId: string;
}

export interface Suggestion {
    endpoint_name: string;
    id: string;
    current_role_mask: number;
    suggested_role_mask: number;
    description: string;
}

export interface VerificationResponse {
    status: "SAT" | "UNSAT";
    is_satisfiable: boolean;
    suggestions: Suggestion[];
    logs: string[];
    processing_time_seconds: number;
}

export const fetchIRFromRepo = async (input: RepositoryInput) => {
    try {
        const response = await axios.post('/ir/create', input);
        return response.data; 
    } catch (error: any) {
        console.error("API Error:", error);
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
        console.error("Verification API Error:", error);
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