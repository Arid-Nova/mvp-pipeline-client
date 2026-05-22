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
    ir_id: string; 
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

// Organization Import Types
export interface RepoData {
    url: string;
    branch: string;
    branches: string[]; 
    commitMap: Record<string, string>;
}

export interface OrgImportResponse {
    proposedSystemName: string;
    relevantRepos: RepoData[];
    suggestedRepos: RepoData[];
}

// Session Management Types
export interface SessionSummary {
    id: string;
    name: string;
    updated_at: string;
}

export interface SessionPageResponse {
    sessions: SessionSummary[];
    currentPage: number;
    totalPages: number;
    totalElements: number;
}

// Single-repo metadata fetched from the repomanager service
export interface RepoMetadata {
    name: string;
    repoUrl: string;
    defaultBranch: string;
    latestCommit: string;
    branches: string[];
    commitMap: Record<string, string>;
}

// Paginated commit history for a branch
export interface CommitInfo {
    sha: string;
    message: string;
    author: string;
    date: string;
}

export interface CommitPageResponse {
    commits: CommitInfo[];
    page: number;
    perPage: number;
    hasMore: boolean;
}

// Change Impact
export interface ChangeImpactInsight {
    metrics: {
        added: number;
        modified: number;
        deleted: number;
    };
    affectedServices: string[];
    riskFactors: Record<string, string[]>;
    criticalImpacts: Array<{
        source: string;
        target: string;
        status: string;
        riskScore: number;
    }>;
}
