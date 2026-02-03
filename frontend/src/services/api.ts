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