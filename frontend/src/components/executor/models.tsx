export interface ExecutionResult {
    status: 'idle' | 'running' | 'success' | 'error';
    statusCode?: number;
    responseBody?: string;
    logs: string[];
    passed?: boolean; 
    assertions?: { description: string; passed: boolean; actual?: string; expected?: string }[];
}