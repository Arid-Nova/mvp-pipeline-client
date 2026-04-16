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