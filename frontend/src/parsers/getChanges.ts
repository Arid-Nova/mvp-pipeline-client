import type { IRData, Controller, Service} from './getData';
import { showError } from '../utils/notifications';

interface ComparisonGraph {
    nodes: any[];
    links: any[];
    gitCommitId?: string;
}

const EMPTY_GRAPH: ComparisonGraph = { nodes: [], links: [], gitCommitId: 'unknown' };

function getComparisonData(irData: IRData, nodes_array?: string[]): ComparisonGraph {
    if (!irData || !Array.isArray(irData.microservices)) {
        showError("Invalid or missing IR data provided for comparison.");
        return EMPTY_GRAPH;
    }
    
    let microservices = irData.microservices;
    let nodes: any[] = [];
    let internalLinks: any[] = [];
    let methods: { [key: string]: any } = {};
    let internalConnections = new Map<string, number>()

    const filteredMicroservices = nodes_array
        ? microservices.filter(ms => nodes_array.includes(ms.name))
        : microservices;

    try {
        // First pass: Collecting all microservice nodes and endpoint methods.
        for (let microservice of filteredMicroservices) {
            nodes.push({
                "nodeName": microservice.name, 
                "nodeType": "microservice", 
                "displayName": microservice.name,
                "parentMicroservice": null, 
                "parentController": null, 
                "parentService": null,
            });
            const collectMethods = (components: (Controller | Service)[]) => {
                for (const component of components) {
                    for (const method of component.methods) {
                        if (method.url) methods[method.url] = { "microservice": microservice.name, "methodName": method.name, ...method };
                    }
                }
            };
            collectMethods(microservice.controllers);
            collectMethods(microservice.services);
        }
        
        // Second pass: Creating links for inter-service communication.
        for (const microservice of filteredMicroservices) {
            const processMethodCalls = (components: (Controller | Service)[]) => {
                for (const component of components) {
                    for (const func of component.methods) {
                        for (const methodCall of func.methodCalls) {
                            if (!methodCall.url || !methods[methodCall.url]) 
                                continue;
                            
                            const destinationMs = methods[methodCall.url].microservice;
                            const sourceMs = microservice.name;

                            if (sourceMs !== destinationMs) {
                                const connectionKey = `${sourceMs}-->${destinationMs}`;
                                if (!internalConnections.has(connectionKey)) {
                                    internalConnections.set(connectionKey, internalLinks.length);
                                    internalLinks.push({
                                        source: sourceMs, target: destinationMs, name: connectionKey,
                                        nodeType: "link", requests: [],
                                    });
                                }
                                const linkIndex = internalConnections.get(connectionKey)!;
                                internalLinks[linkIndex].requests.push({
                                    "destinationUrl": methodCall.url,
                                    "sourceMethod": methodCall.calledFrom,
                                    "endpointFunction": methods[methodCall.url].methodName,
                                    "className": component.name,
                                    "destinationclassName": methods[methodCall.url].className,
                                    "type": methodCall.httpMethod,
                                    "argument": methodCall.parameterContents,
                                    "msReturn": methods[methodCall.url].returnType,
                                });
                            }
                        }
                    }
                }
            };
            processMethodCalls(microservice.controllers);
            processMethodCalls(microservice.services);
        }

        return {
            "nodes": nodes,
            "links": internalLinks, 
            "gitCommitId": irData.commitID
        };
    } catch (error: any) {
        showError('Failed to parse comparison data.');
        return EMPTY_GRAPH;
    }  
}

// Finding differences.
function getLinkDifferences(links1: any[], links2: any[]) {
    const set1 = new Set(links1.map(l => l.name));
    const set2 = new Set(links2.map(l => l.name));
    const additions = links2.filter(l => !set1.has(l.name));
    const subtractions = links1.filter(l => !set2.has(l.name));
    const unmodified = links2.filter(l => set1.has(l.name));
    
    return { additions, subtractions, unmodified };
}

function getNodeDifferences(nodes1: any[], nodes2: any[]) {
    const key = (n: any) => `${n.nodeName}::${n.nodeType}`;
    const set1 = new Set(nodes1.map(key));
    const set2 = new Set(nodes2.map(key));
    const additions = nodes2.filter(n => !set1.has(key(n)));
    const subtractions = nodes1.filter(n => !set2.has(key(n)));
    const unmodified = nodes2.filter(n => set1.has(key(n)));

    return { additions, subtractions, unmodified };
}

function getRequestDifferences(requests1: any[], requests2: any[]) {
    const key = (r: any) => `${r.sourceMethod}::${r.destinationUrl}::${r.type}`;
    const set1 = new Set(requests1.map(key));
    const set2 = new Set(requests2.map(key));
    const additions = requests2.filter(r => !set1.has(key(r)));
    const subtractions = requests1.filter(r => !set2.has(key(r)));
    const unmodified = requests2.filter(r => set1.has(key(r)));

    return { additions, subtractions, unmodified };
}

// Main comparison logic (no changes needed here)
function findModifications(graph1: ComparisonGraph, graph2: ComparisonGraph) {
    const finalNodes: any[] = [];
    const finalLinks: any[] = [];

    const nodeDiff = getNodeDifferences(graph1.nodes, graph2.nodes);
    nodeDiff.additions.forEach(n => finalNodes.push({ ...n, color: "green" }));
    nodeDiff.subtractions.forEach(n => finalNodes.push({ ...n, color: "red" }));
    nodeDiff.unmodified.forEach(n => finalNodes.push({ ...n, color: "grey" }));

    const linkDiff = getLinkDifferences(graph1.links, graph2.links);
    linkDiff.additions.forEach(l => finalLinks.push({ ...l, color: "green" }));
    linkDiff.subtractions.forEach(l => finalLinks.push({ ...l, color: "red" }));

    for (const link2 of linkDiff.unmodified) {
        const link1 = graph1.links.find(l => l.name === link2.name);
        if (!link1) continue;
        const reqDiff = getRequestDifferences(link1.requests, link2.requests);
        const modified = reqDiff.additions.length > 0 || reqDiff.subtractions.length > 0;
        const requestsWithColor = [
            ...reqDiff.additions.map(r => ({ ...r, color: "green" })),
            ...reqDiff.subtractions.map(r => ({ ...r, color: "red" })),
            ...reqDiff.unmodified.map(r => ({ ...r, color: "grey" })),
        ];
        finalLinks.push({ ...link2, requests: requestsWithColor, color: modified ? "yellow" : "grey" });
    }

    return {
        "graphName": "msgraph-changes",
        "nodes": finalNodes,
        "links": finalLinks,
        "gitCommitId": graph2.gitCommitId,
    };
}

/**
 * Compares two IR files and returns a graph data object highlighting the changes.
 * @param commit1 The earlier IR data object.
 * @param commit2 The later IR data object.
 * @returns A graph data object with color-coded changes.
 */
export default function compareChanges(commit1: IRData, commit2: IRData) {
    if (!commit1 || !commit2) {
        showError("One or both commits are missing for comparison.");
        return null;
    }

    try {
        const graph1 = getComparisonData(commit1);
        const graph2 = getComparisonData(commit2);
        return findModifications(graph1, graph2);
    } catch (error: any) {
        showError("Error occured in comparison.");
        return null;
    } 
}