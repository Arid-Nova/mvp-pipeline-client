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

// Chatbot API schema
export interface ChatbotContext {
    systemName?: string;
    irId?: string;
    indexId?: string;
    runId?: string;
    commitId?: string;
    selectedService?: string;
    selectedEndpoint?: string;
}

export interface ChatbotContextRefreshRequest {
    context?: ChatbotContext;
}

export interface ChatbotContextRefreshResponse {
    success: boolean;
    refreshedArtifactCountsByType: Record<string, number>;
    unavailableProviders: string[];
    refreshedAt: string;
    refreshVersion: string;
    message: string;
    staleContext: boolean;
}

export interface ChatbotMessage {
    role: string;
    content: string;
}

export interface ChatbotQueryRequest {
    question: string;
    context?: ChatbotContext;
    conversationId?: string;
    messages?: ChatbotMessage[];
}

export interface CitationItem {
    artifactType: string;
    artifactId: string;
    artifactName: string;
    locationHint: string;
    version: string;
    summary: string;
    sourcePath?: string;
    sourceEndpoint?: string;
    serviceName?: string;
    entityName?: string;
    endpointPath?: string;
    commitId?: string;
    timestamp?: string;
}

export type ChatbotConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_EVIDENCE";
export type ChatbotFlag =
    | "partial"
    | "insufficient_evidence"
    | "stale_context"
    | "truncated_context"
    | "citation_validation_failed"
    | "model_unavailable";

export interface ChatbotResponse {
    answer: string;
    citations: CitationItem[];
    confidence: ChatbotConfidence;
    flags: ChatbotFlag[];
    requestId: string;
    processingTimeMs: number;
    model: string;
    provider: string;
    confidenceRationale?: string;
    confidenceReasons?: string[];
    traceMetadata?: Record<string, unknown>;
}

export type ChatbotHealthStatus = "healthy" | "degraded" | "unavailable";

export interface ChatbotHealthResponse {
    status: ChatbotHealthStatus;
    provider: string;
    model: string;
    baseUrl: string;
    message: string;
    checkedAt: string;
    latencyMs: number | null;
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

// User Feedback
export interface UserFeedback {
    rating : number,
    comments: string
}
