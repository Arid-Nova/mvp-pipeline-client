export interface SimpleOptions {
    text: string;
    is2d3d: string;
}

export type Node = {
    nodeName: string;
    nodeType: string;
    patterns: Array<Antipattern>;
};

export type Antipattern = {
    type: string;
};

export interface SnapshotMetric {
    version: string;
    id: string;
    nodes: number;
    edges: number;
    coupling: number;
    density: number;
    hubsCount: number;
    leafCount: number;
    internalCount: number;
    dependenciesUnavailable: boolean;
    rawNodes: any[]; 
    antiPatterns: Record<string, number>;
    totalAntiPatterns: number;
}

export interface FullMetric extends SnapshotMetric {
    deltaLabel: string;
    affected: number;
    fileChanges: number;
    riskScore: number;
    [dynamicChartKey: string]: any; 
}
