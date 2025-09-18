import { useEffect, useCallback, useState } from "react";
import { getNeighbors } from "../utils/graphFunctions";

export const useInfoBox = (graphData: any, setFocusNode: any) => {
    const [anchorPoint, setAnchorPoint] = useState({ x: 0, y: 0 });
    const [show, setShow] = useState<boolean>(false);
    const [name, setName] = useState<string>();
    const [type, setType] = useState<string>();
    const [depends, setDepends] = useState<any[]>();
    const [dependencies, setDependencies] = useState<any[]>();
    const [patterns, setAntiPatterns] = useState<any[]>();
    const [methods, setMethods] = useState<any[]>();
    const [parameters, setParameters] = useState<any[]>();
    const [source, setSource] = useState<String>();
    const [destination, setDestination] = useState<String>();
    const [entityDependencies, setEntityDependencies] = useState<Map<string, any[]>>(new Map());

    let node;

    const handleLinkClick = useCallback(
        (event: any) => {
            console.log(event);
            node = event.detail.link;

            setAnchorPoint({ x: event.pageX, y: event.pageY });
            setName(node.name);
            setFocusNode({
                node: event.detail.link.source.nodeName,
                neighbors: [node.target]
            });
            
            setDependencies([node]);
            setDepends([]);
            //setAntiPatterns(event.detail.node.patterns)
            setShow(true);
            setSource(node.source.displayName);
            setDestination(node.target.displayName);

            if (node.source.nodeType == "microservice"){    
                if(node.target.nodeType == "controller" || node.target.nodeType == "service") {
                    setType("sublink");
                } else setType("link");
            }
            else {
                setType("sublink");
            }
        }, [setShow, setAnchorPoint, setName, setType, 
            setFocusNode, setDependencies, setDepends, setSource, setDestination]
    );

    const handleNodeClick = useCallback((event: any) => {
        // Clear previous state
        setAntiPatterns([]);
        setMethods([]);
        setParameters([]);
        setSource(undefined);
        
        const node = event.detail.node;
        if (!node) return;

        // Handling different node types.
        switch (node.nodeType) {
            case 'microservice':
                // No specific details like methods or parent source to set
                break;

            case 'service': {
                // Set the parent microservice name
                setSource(node.parentMicroservice);
                
                // Finding all method nodes that belong to this controller.
                const serviceMethods = graphData.nodes.filter(
                    (n: any) => n.nodeType === 'method' && n.parentService === node.nodeName
                );
                setMethods(serviceMethods);
                break;
            }

            case 'controller': {
                // Set the parent microservice name
                setSource(node.parentMicroservice);
                
                // Finding all method nodes that belong to this controller.
                const controllerMethods = graphData.nodes.filter(
                    (n: any) => n.nodeType === 'method' && n.parentController === node.nodeName
                );
                setMethods(controllerMethods);
                break;
            }

            case 'method':
                // A method belongs to a microservice, but has no methods of its own
                setSource(node.parentMicroservice);
                setParameters(node.parameters);
                break;

            case 'entity': {
                const dependentsMap = new Map<string, any[]>();
                
                const dependentLinks = graphData.links.filter(
                    (link: any) => link.nodeType === 'uses' && 
                    (link.target.nodeName || link.target) === node.nodeName
                );

                // Group the source of those links (the components) by their parent microservice
                for (const link of dependentLinks) {
                    const component = link.source;
                    if (component && component.parentMicroservice) {
                        if (!dependentsMap.has(component.parentMicroservice)) {
                            dependentsMap.set(component.parentMicroservice, []);
                        }
                        dependentsMap.get(component.parentMicroservice)!.push(component);
                    }
                }
                setEntityDependencies(dependentsMap);
                break;
            }
        }

        // Common logic for all node types.
        setAnchorPoint({ x: event.pageX, y: event.pageY });
        // Using displayName for better readability.
        setName(node.displayName || node.nodeName); 
        setType(node.nodeType);

        const neighbors = getNeighbors(
            node,
            graphData.nodes,
            graphData.links
        );
        
        const neighborNames = neighbors.nodes.map((n: any) => n.nodeName);

        setFocusNode({
            node: node.nodeName,
            neighbors: neighborNames,
        });

        const dependsOn = neighbors.nodeLinks.filter(
            (link: any) => node.nodeName === link.target.nodeName
        );

        const dependencies = neighbors.nodeLinks.filter(
            (link: any) => node.nodeName === link.source.nodeName
        );

        setDependencies(dependencies);
        setDepends(dependsOn);
        //setAntiPatterns(node.patterns)
        setShow(true);

    }, [graphData, setShow, setAnchorPoint, setMethods, setSource, 
        setParameters, setName, setType, setFocusNode, setDependencies, setDepends]);

    useEffect(() => {
        if (!show) {
            setFocusNode(null);
        }
    }, [show]);

    useEffect(() => {
        document.addEventListener("nodeClick", handleNodeClick);
        document.addEventListener("linkClick", handleLinkClick);

        return () => {
            document.removeEventListener("nodeClick", handleNodeClick);
            document.removeEventListener("linkClick", handleLinkClick);
        };
    }, [handleNodeClick, handleLinkClick]);

    return {
        anchorPoint,
        name,
        show,
        type,
        depends,
        setShow,
        dependencies,
        patterns,
        methods,
        source, 
        destination,
        parameters,
        entityDependencies
    };
};
