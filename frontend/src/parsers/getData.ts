
import { showError } from '../utils/notifications';

// Define types for better type safety
export interface Method {
    name: string;
    parameters: any[];
    returnType: string;
    url: string;
    httpMethod: string;
    className: string;
    annotations: any[];
    methodCalls: MethodCall[];
}

export interface MethodCall {
    url?: string;
    httpMethod: string;
    calledFrom: string;
    name: string;
    parameterContents: any[];
}

export interface Controller {
    methods: Method[];
    implementedTypes: string[];
    name: string;
    imports: any[];
}

export interface Service extends Controller {}

export interface Microservice {
    name: string;
    controllers: Controller[];
    services: Service[]; // Services have the same structure as controllers
}

export interface IRData {
    microservices: Microservice[];
    commitID?: string;
    createDate: string | null;
    modifyDate: string | null;
}

function findMethodByUrl(callUrl: string, methodsDict: { [key: string]: any }): any | null {
    if (!callUrl) return null;
    return methodsDict[callUrl];
}

// Retrieving and parsing data from the IR json file.
export default function getData(myData: IRData | null, nodes_array?: string[] | undefined) {
    if (!myData) {
        showError("No data provided. File may be empty or corrupted.");
        return null;
    };

    try {
        let microservices = myData["microservices"];
        
        // Checking if the json is valid.
        if (!Array.isArray(microservices)) {
            showError('Invalid file structure. Missing microservices.');
            return null;
        }
        
        let nodes: Array<{ 
            nodeName: string; 
            nodeType: string;
            displayName: string;
            parentMicroservice: string | null;
            parentController: string | null;
            parentService: string | null; 
            parameters: any[] | null;
            returnType: string | null }> = [];
        
        let links: any[] = [];
        let entitySet = new Set<string>();
        let methods: { [key: string]: any } = {};
        let connections = new Map<string, number>();
        
        // Pre-filtering for performance optimization.
        let filteredMicroservices = nodes_array 
            ? microservices.filter(ms => {
                if (!ms.name) {
                    showError("Microservice missing name.");
                    return false;
                }
                return nodes_array.includes(ms.name);
            })
            : microservices;
        
        // First pass - identifying nodes.
        for (let microservice of filteredMicroservices){
            let nodeName = microservice["name"];

            if (nodes_array == undefined || nodes_array.includes(nodeName)){
                nodes.push({
                    "nodeName": nodeName,
                    "displayName": nodeName,
                    "nodeType": "microservice",
                    "parentMicroservice": null,
                    "parentController": null,
                    "parentService": null,
                    "parameters": [],
                    "returnType": null
                });

            }
            else {
                continue;
            }
            
            // Handling controllers.
            for (let controller of microservice["controllers"]){
                let controllerUniqueName = `${nodeName}.${controller["name"]}`;
                nodes.push({
                    "nodeName": controllerUniqueName,
                    "displayName": controller["name"],
                    "nodeType": "controller", // New node type
                    "parentMicroservice": nodeName, // Add parent for hierarchy
                    "parentController": null,
                    "parentService": null,
                    "parameters": null,
                    "returnType": null
                });

                let functions = controller["methods"];
                for (let k=0; k<functions.length; k++){
                    let method = functions[k];
                    let url = method["url"];
                    let http = method["httpMethod"];
                    let methodName = method["name"];
                    let parameters = method["parameters"];
                    let returnType = method["returnType"];
                    
                    let fullMethodName = `${nodeName}.${controller["name"]}.${methodName}_${k}`;

                    nodes.push({
                        "nodeName": fullMethodName,
                        "nodeType": "method",
                        "displayName": methodName,
                        "parentController": controllerUniqueName,
                        "parentMicroservice": nodeName,
                        "parentService": null,
                        "parameters": parameters,
                        "returnType": returnType
                    });
                    
                    //Check if this method has a default annotation, then also add that url
                    if (method["annotations"].length > 0 && 
                        method["annotations"][0]["attributes"] && 
                        "default" in method["annotations"][0]["attributes"]){
                        let temp_url = method["annotations"][0]["attributes"]["default"];
                        methods[temp_url] = {
                            "microservice" : nodeName, 
                            "parameters": parameters,
                            "returnType": returnType,
                            "methodName": methodName,
                            "className": method["className"],
                            "httpMethod": http,
                        }
                    }
                    methods[url] = {
                        "microservice" : nodeName, 
                        "parameters": parameters,
                        "returnType": returnType,
                        "className": method["className"],
                        "methodName": methodName,
                        "httpMethod": http,
                    }
                }
            }

            // Handling Services.
            // Create Service and their Method nodes
            for (let service of microservice["services"]){
                let serviceUniqueName = `${nodeName}.${service.name}`;
                nodes.push({
                    "nodeName": serviceUniqueName,
                    "displayName": service.name,
                    "nodeType": "service", 
                    "parentMicroservice": nodeName,
                    "parentController": null,
                    "parentService": null,
                    "parameters": null,
                    "returnType": null
                });
                
                let services = service.methods;
                for(let k=0; k<services.length; k++){
                    let method = services[k];
                    let fullMethodName = `${serviceUniqueName}.${method.name}._${k}`;
                    nodes.push({
                        "nodeName": fullMethodName,
                        "displayName": method.name,
                        "nodeType": "method",
                        "parentController": null,
                        "parentService": serviceUniqueName, 
                        "parentMicroservice": nodeName,
                        "parameters": method.parameters,
                        "returnType": method.returnType
                    });
                }
            }
        }

        // Second pass - identifying links between all different nodes.
        for (let microservice of filteredMicroservices){
            let msName = microservice["name"];

            // Create Hierarchy Links (MS -> Controller/Service -> Method)
            let msControllers = nodes.filter(n => n.nodeType === 'controller' && n.parentMicroservice === msName);
            let msServices = nodes.filter(n => n.nodeType === 'service' && n.parentMicroservice === msName);

            msControllers.forEach(controller => {
                links.push({ source: msName, target: controller.nodeName, nodeType: "hierarchy" });
                // Link controller to its methods
                nodes.filter(n => n.nodeType === 'method' && n.parentController === controller.nodeName)
                     .forEach(method => links.push({ source: controller.nodeName, target: method.nodeName, nodeType: "hierarchy" }));

                // Creating Dependency Links (Controller -> Service).
                msServices.forEach(service => {
                    links.push({
                        source: controller.nodeName,
                        target: service.nodeName,
                        name: `${controller.displayName} -> ${service.displayName}`,
                        nodeType: "dependency"
                    });
                });
            });

            msServices.forEach(service => {
                links.push({ source: msName, target: service.nodeName, nodeType: "hierarchy" });
                 // Link service to its methods
                nodes.filter(n => n.nodeType === 'method' && n.parentService === service.nodeName)
                     .forEach(method => links.push({ source: service.nodeName, target: method.nodeName, nodeType: "hierarchy" }));
            });

            // Creating Entity nodes and "uses" links (Service/Controller -> Entity).
            const processImports = (component: Controller | Service) => {
                const componentName = `${msName}.${component.name}`;
                if (!component.imports) return;

                for (const imp of component.imports) {
                    // Assuming an import is an entity if it's in a package containing ".entity"
                    if (imp.name && imp.name.includes(".entity.")) {
                        const entityName = imp.importObject;
                        
                        // Add entity node only if it's new
                        if (!entitySet.has(entityName)) {
                            entitySet.add(entityName);
                            nodes.push({
                                "nodeName": entityName, 
                                "displayName": entityName, 
                                "nodeType": "entity",
                                "parentMicroservice": null, 
                                "parentController": null, 
                                "parentService": null,
                                "parameters": null, 
                                "returnType": null
                            });
                        }

                        // Create the "uses" link from component to entity
                        links.push({
                            source: componentName,
                            target: entityName,
                            name: `${componentName} -> ${entityName}`,
                            nodeType: "uses" 
                        });
                    }
                }
            };

            microservice.controllers.forEach(processImports);
            microservice.services.forEach(processImports);

            // Create Communication Links (Method -> Method in another Microservice)
            const processMethodCalls = (componentArray: (Controller | Service)[]) => {
                for (let component of componentArray) {
                    for (let func of component.methods) {
                        for (let methodCall of func.methodCalls) {
                            const destinationMethod = findMethodByUrl(methodCall.url!, methods);
                            if (!destinationMethod) continue;

                            let destinationMs = destinationMethod.microservice;
                            let sourceMs = msName;
                            
                            if (sourceMs !== destinationMs) {
                                let connectionKey = `${sourceMs}-->${destinationMs}`;
                                if (!connections.has(connectionKey)) {
                                    connections.set(connectionKey, links.length);
                                    links.push({
                                        source: sourceMs,
                                        target: destinationMs,
                                        nodeType: "link",
                                        requests: [],
                                        name: connectionKey
                                    });
                                }
                                const linkIndex = connections.get(connectionKey)!;
                                links[linkIndex].requests.push({
                                    "destinationUrl": methodCall.url,
                                    "sourceMethod": methodCall.calledFrom,
                                    "endpointFunction": destinationMethod.methodName,
                                    "className": component.name,
                                    "destinationclassName": destinationMethod.className,
                                    "type": methodCall.httpMethod,
                                    "argument": methodCall.parameterContents,
                                    "msReturn": destinationMethod.returnType,
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
            "graphName": "msgraph",
            "nodes": nodes, 
            "links": links, 
            "gitCommitId": myData["commitID"] || "unknown"
        };

    } catch (error: any ) {
        showError(`IR file parsing failed: ${error.message}`);
        return null;
    }
}