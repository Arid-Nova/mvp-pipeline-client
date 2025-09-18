import type { IRData, Method } from '../parsers/getData';
import { showError } from './notifications';

interface FilteredNode {
    nodeName: string;
    nodeType: string;
    microserviceName: string;
    packageName: string;
    color: string;
    methods: any[]; 
}

interface FilteredLink {
    nodeType: "link";
    source: string;
    target: string;
    sourceMicroservice: string;
    destinationMicroservice: string;
    requests: any[];
    name: string;
}

type MicroserviceColors = { [key: string]: string };
type EndpointCalls = string[];

type FilteredGraphData = {
    graphName: "msgraph";
    nodes: FilteredNode[];
    links: FilteredLink[];
    gitCommitId: string;
};

interface MappedMethod {
    name: string;
    parameters: any[];
    returnType: string;
    url?: string;
    httpMethod?: string;
}

// Color palette for microservices
const COLORS = [
    '(230, 25, 75)', '(60, 180, 75)', '(121, 25, 255)', '(0, 130, 200)',
    '(245, 130, 48)', '(145, 30, 180)', '(70, 240, 240)', '(240, 50, 230)',
    '(210, 245, 60)', '(250, 190, 212)', '(0, 128, 128)', '(220, 190, 255)',
    '(170, 110, 40)', '(255, 250, 200)', '(128, 0, 0)', '(170, 255, 195)',
    '(128, 128, 0)', '(255, 215, 180)', '(0, 0, 128)', '(128, 128, 128)'
];

/**
 * Parses IR data to create a detailed graph of internal component dependencies within specified microservices.
 * @param myData The full IR data object.
 * @param arrayOfNodes An array of microservice names to include in the detailed view.
 * @returns A tuple containing the graph data, a color map for microservices, and a list of endpoint calls.
 */
export default function filterNodes(
    myData: IRData | null,
    arrayOfNodes: string[]
): [FilteredGraphData, MicroserviceColors, EndpointCalls] | null {

    const emptyGraphData: FilteredGraphData = {
        graphName: "msgraph",
        nodes: [],
        links: [],
        gitCommitId: "unknown"
    };
    const emptyResult: [FilteredGraphData, MicroserviceColors, any[]] = [emptyGraphData, {}, []];
    
    try {
        if (!myData || !Array.isArray(myData.microservices)) {
            showError("Invalid or missing IR data provided for filtering.");
            return null; 
        }
        if (!Array.isArray(arrayOfNodes) || arrayOfNodes.length === 0) {
            return emptyResult; 
        }

        let colorIndex = 0;
        const finalNodes: FilteredNode[] = [];
        const finalLinks: FilteredLink[] = [];
        const componentMethods = new Map<string, any>(); 
        const linkMap = new Map<string, FilteredLink>();
        const microserviceColors: MicroserviceColors = {};
        const microservicesToProcess = myData.microservices.filter(ms => arrayOfNodes.includes(ms.name));

        // First PASS: Creating all component nodes (Controllers, Services, Entities).
        for (const microservice of microservicesToProcess) {
            const msName = microservice.name;
            microserviceColors[msName] = `rgb${COLORS[colorIndex % COLORS.length]}`;

            const processComponents = (components: any[], type: string) => {
                if (!components) return;

                type MethodMap = { [key: string]: any };
                for (const component of components) {
                    const componentName = component.implementedTypes?.[0] || component.name;
                    const methods: MappedMethod[] = component.methods.map((m: Method) => ({
                        name: m.name,
                        parameters: m.parameters,
                        returnType: m.returnType,
                        ...(type === "CONTROLLER" && { url: m.url, httpMethod: m.httpMethod })
                    }));

                    componentMethods.set(componentName, methods.reduce((acc: MethodMap, m: MappedMethod) => {
                        acc[m.name] = m;
                        return acc;
                    }, {} as MethodMap));

                    finalNodes.push({
                        "nodeName": componentName,
                        "nodeType": component.classRole || type.toUpperCase(),
                        "microserviceName": msName,
                        "packageName": component.packageName,
                        "color": COLORS[colorIndex % COLORS.length],
                        "methods": methods,
                    });
                }
            };

            processComponents(microservice.services, 'service');
            processComponents(microservice.controllers, 'controller');
            processComponents((microservice as any).entities, 'entity');
            processComponents((microservice as any).repositories, 'repository');

            colorIndex++;
        }

        // Second Pass: Creating links based on method calls between components.
        for (const microservice of microservicesToProcess) {
            let msName = microservice.name;
            
            const processLinks = (components: any[]) => {
                if (!components) return;
                for (let component of components) {
                    let sourceName = component.implementedTypes?.[0] || component.name;

                    for (let methodCall of component.methodCalls || []) {
                        let targetName = methodCall.objectType;

                        // Only create links between components that exist in our graph
                        if (componentMethods.has(targetName) && targetName !== sourceName) {
                            let linkKey = `${sourceName} -> ${targetName}`;
                            let targetMethods = componentMethods.get(targetName);
                            let returnType = targetMethods?.[methodCall.name]?.returnType || "void";

                            if (!linkMap.has(linkKey)) {
                                linkMap.set(linkKey, {
                                    "nodeType": "link",
                                    "source": sourceName,
                                    "target": targetName,
                                    "sourceMicroservice": msName,
                                    "destinationMicroservice": msName, 
                                    "requests": [],
                                    "name": linkKey
                                });
                            }

                            linkMap.get(linkKey)!.requests.push({
                                "sourceMethod": methodCall.calledFrom,
                                "endpointFunction": methodCall.name,
                                "argument": methodCall.parameterContents,
                                "msReturn": returnType,
                            });
                        }
                    }
                }
            };
            
            processLinks(microservice.controllers);
            processLinks(microservice.services);
        }

        return [
            {
                "graphName": "msgraph",
                "nodes": finalNodes,
                "links": Array.from(linkMap.values()),
                "gitCommitId": myData.commitID || "unknown"
            },
            microserviceColors,
            [] 
        ];

    } catch (error: any) {
        showError('A critical error occurred while filtering nodes');
        return null;
    }
}