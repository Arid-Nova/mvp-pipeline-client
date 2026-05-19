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
}

export type ChatbotConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT_EVIDENCE";
export type ChatbotFlag = "partial" | "insufficient_evidence" | "stale_context" | "model_unavailable";

export interface ChatbotResponse {
    answer: string;
    citations: CitationItem[];
    confidence: ChatbotConfidence;
    flags: ChatbotFlag[];
    requestId: string;
    processingTimeMs: number;
    model: string;
    provider: string;
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
