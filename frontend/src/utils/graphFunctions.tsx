import { ColorRepresentation } from "three";
import { Antipattern} from "./types";

const RED = "rgb(255,0,0)";
const ORANGE = "rgb(255,160,0)";
const GREEN = "rgb(0,255,0)";
const NEWGREEN = "rgba(0, 255, 204, 0.79)";
const HOVER_BLUE = "rgb(89, 130, 255)";
const HOVER_NEIGHBOR = "rgb(79, 200, 209)";
const LIGHT_GRAY = "rgb(150,150,150)";
const DARK_GRAY = "rgb(50,50,50)";

const IN_PATTERN = "rgb(235,52,192)";

const LINK_FROM_HOVER = "rgba(52, 143, 235,1)";
const LINK_TO_HOVER = "rgba(179, 66, 245,1)";

const NODE_COLORS = {
    "microservice": LIGHT_GRAY,
    "controller": LINK_TO_HOVER,
    "service": ORANGE,
    "method": HOVER_BLUE,
    "entity": NEWGREEN
}

function getShape(type: String): number {
    if (type === "service") {
        return 0;
    } else if (
        type === "kafka" ||
        type === "proxy" ||
        type === "writer" ||
        type === "pipeline"
    ) {
        return 1;
    } else if (type === "customer" || "srcSink") {
        return 2;
    } else if (type === "archive" || type === "database" || type === "bucket") {
        return 3;
    } else if (type === "API") {
        return 4;
    } else if (type === "config") {
        return 5;
    } else {
        return 0;
    }
}

function showNeighbors(node: any, graphData: any, setHideNodes: any) {
    let { nodes } = graphData;
    let hideNodes = new Set();
    nodes.forEach((node: any) => hideNodes.add(node));
    getNeighbors(node, graphData.nodes, graphData.links).nodes.forEach(
        (node: any) => hideNodes.delete(node)
    );
    setHideNodes(hideNodes);
}

function getVisibility(node: any, hideNodes: any) {
    if (hideNodes.has(node)) {
        return false;
    }
    return true;
}

// Sets color of node
function getColor(
    node: any,
    graphData: any,
    threshold: number,
    highlightNodes: any,
    hoverNode: any,
    defNodeColor: any,
    setDefNodeColor: any,
    antipattern: any,
    colorMode: any,
    selectedAntiPattern: any,
    trackNodes: any,
    focusNode: any,
    trackChanges: any,
): any {
    if (highlightNodes && highlightNodes.has(node.nodeName)) {
        if (node.nodeName === hoverNode) {
            return HOVER_BLUE;
        } else {
            return HOVER_NEIGHBOR;
        }
    }

    const nodeType = node.nodeType as keyof typeof NODE_COLORS;
    if(NODE_COLORS[nodeType]) {
        return NODE_COLORS[nodeType];
    }

    if (focusNode) {
        if (focusNode.node === node.nodeName) {
            return HOVER_BLUE;
        } else if (
            focusNode.neighbors.find(
                (neighbor: any) => neighbor === node.nodeName
            )
        ) {
            return HOVER_NEIGHBOR;
        }
    }

    if (trackNodes.includes(node.nodeName)) {
        return "rgb(25,200,25)";
    }

    if (antipattern && node.antiPattern) {
        const isActive = !selectedAntiPattern || selectedAntiPattern === "ALL" || selectedAntiPattern === "none" || selectedAntiPattern === node.antiPattern;
        if (isActive) {
            if (node.antiPattern === 'SHARED_DB') return RED; 
            if (node.antiPattern === 'GOD_SERVICE') return ORANGE; 
        }
    }

    if (antipattern && selectedAntiPattern != "none") {
        switch (selectedAntiPattern) {
            case "Cyclic Dependency":
                const cyclic = node.patterns?.find(
                    (pattern: Antipattern) =>
                        pattern.type === "Cyclic Dependency"
                );
                return cyclic != undefined ? IN_PATTERN : LIGHT_GRAY;
            case "Bottleneck":
                const bottlneck = node.patterns.find(
                    (pattern: Antipattern) => pattern.type === "Bottleneck"
                );
                return bottlneck?.threshold > threshold
                    ? IN_PATTERN
                    : LIGHT_GRAY;
            case "Megaservice":
                const megaservice = node.patterns.find(
                    (pattern: Antipattern) => pattern.type === "Megaservice"
                );
                return megaservice?.threshold > threshold
                    ? IN_PATTERN
                    : LIGHT_GRAY;
            case "High Coupling":
                return getColorCoupling(node, graphData, threshold);
            // default just continue into visual color scheme (based on theme)
        }
    }

    if (trackChanges) {
        if (node.color == 'green') {
            return "rgb(0, 255, 0)";
        } else if (node.color == 'red') {
            return "rgb(255, 0, 0)";
        } else if (node.color == 'yellow'){
            return "rgb(255, 115, 0)";
        }
    }

    return getColorVisual(
        node,
        graphData,
        threshold,
        defNodeColor,
        setDefNodeColor,
        colorMode
    );
}

function getColorVisual(
    node: any,
    graphData: any,
    threshold: number,
    defNodeColor: any,
    setDefNodeColor: any,
    colorMode: string
): ColorRepresentation {
    if ("color" in node && !(node["color"].includes("rgb")) && node["color"] !== "-1"){
        console.log(node["color"])
        return "rgb".concat(node["color"]);
    }
    switch (colorMode) {
        case "neighbor":
            let neighbors: any = getNeighbors(
                node,
                graphData.nodes,
                graphData.links
            );
            return getColorNeighbor(
                node,
                graphData,
                threshold,
                defNodeColor,
                setDefNodeColor,
                neighbors
            );
        case "git":
            break;
        case "cpu":
            return getColorThreshold(threshold, node.cpu);
        case "ram":
            return getColorThreshold(threshold, node.ram);
        case "disk":
            return getColorThreshold(threshold, node.disk);
        case "latency":
            return getColorThreshold(threshold, node.latency);
        case "dark-default":
            return LIGHT_GRAY;
        case "light-default":
            return DARK_GRAY;
    }
    return node.color;
}

function getColorNeighbor(
    node: any,
    graphData: any,
    threshold: number,
    defNodeColor: any,
    setDefNodeColor: any,
    neighbors: any
): ColorRepresentation {
    let { nodes, links } = graphData;

    if (!defNodeColor) {
        nodes.map((n: any) => {
            n.color = "-1";
        });
        setDefNodeColor(true);
    }

    if (node.color === "-1") {
        const colors = [
            "rgb(250, 93, 57)",
            "rgb(255, 167, 0)",
            "rgb(245, 239, 71)",
            "rgb(51, 241, 255)",
            "rgb(204, 51, 255)",
            "rgb(255, 51, 112)",
            "rgb(173, 255, 51)",
            "rgb(194, 151, 252)",
        ];

        //let neighbors: any = getNeighbors(node, links);

        let offLimits: any = [];
        let newColors: any = [];

        neighbors.nodes.map((neighbor: any) => {
            if (neighbor.color !== "-1") {
                offLimits.push(neighbor.color);
            }
        });

        colors.map((color) => {
            if (offLimits.indexOf(color) === -1) {
                newColors.push(color);
            }
        });

        let randIndex = Math.floor(Math.random() * newColors.length);

        node.color = newColors[randIndex];
    }

    return node.color;
}

function getColorCoupling(
    node: any,
    graphData: any,
    threshold: number
): ColorRepresentation {
    let { nodes, links } = graphData;
    let numNeighbors = getNeighbors(node, nodes, links).nodes.length;

    if (numNeighbors > threshold) {
        return RED;
    }
    if (numNeighbors > threshold / 2) {
        return ORANGE;
    }

    return GREEN;
}

function getColorThreshold(
    threshold: number,
    value: number
): ColorRepresentation {
    if (value > threshold) {
        return RED;
    }
    if (value > threshold / 2) {
        return ORANGE;
    }

    return GREEN;
}

// Find neighbors of a given node
function getNeighbors(node: any, nodes: any[], links: any[]) {
    const neighbors = links.reduce((acc: any[], link: any) => {
        // Adding additional checks to ensure link and its properties are valid.
        if (!link || !link.source || !link.target || !node) return acc;
        let sourceName = link.source.nodeName || link.source;
        let targetName = link.target.nodeName || link.target;

        if (targetName === node.nodeName) {
            // Finding the full node object if source is just an ID.
            const sourceNode = typeof link.source === 'string' ? 
                nodes.find(n => n.nodeName === link.source) : link.source;
            if (sourceNode) acc.push(sourceNode);
        } else if (sourceName === node.nodeName) {
            // Finding the full node object if target is just an ID.
            const targetNode = typeof link.target === 'string' ? 
                nodes.find(n => n.nodeName === link.target) : link.target;
            if (targetNode) acc.push(targetNode);
        }
        return acc;
    }, []);
    
    return {
        nodeLinks: links.filter((link: any) => {
            // Adding additional checks to ensure link and its properties are valid.
            if (!link || !link.source || !link.target || !node) return false;
            let sourceName = link.source.nodeName || link.source;
            let targetName = link.target.nodeName || link.target;
            return sourceName === node.nodeName || targetName === node.nodeName;
        }),
        nodes: neighbors
    };
}

// Refresh visible nodes
function reset(graphRef: any) {
    graphRef.current.refresh();
}

// Set camera back to default view
function resetView(graphRef: any, initCoords: any) {
    graphRef.current.cameraPosition(
        initCoords, // new position
        { x: 0, y: 0, z: 0 }, // lookAt ({ x, y, z })
        2000 // ms transition duration
    );
    reset(graphRef);
}

const getNodeOpacity = (
    node: any,
    search: string[],
    highlightNodes: Set<string>,
    focusNode: any
): number => {
    const FOCUS_ACTIVE_NOT_SELECTED = 0.05;
    // When the search is inactive.
    if (!search || search.length === 0) {
        if (
            focusNode &&
            (focusNode.node === node.nodeName ||
                focusNode.neighbors.find(
                    (neighbor: any) => neighbor === node.nodeName
                ))
        ) {
            return 1.0;
        }
        if (highlightNodes.size === 0) {
            if (focusNode) {
                return FOCUS_ACTIVE_NOT_SELECTED;
            }
            return 0.8;
        }
        return highlightNodes.has(node.nodeName)
            ? 1.0
            : focusNode
            ? FOCUS_ACTIVE_NOT_SELECTED
            : 0.5;
    } 
    // When the search is active.
    else if (search.some(term => node.nodeName.toLowerCase().includes(term.toLowerCase()))) {
        return 1.0;
    } else if (
        focusNode &&
        (focusNode.node === node.nodeName ||
            focusNode.neighbors.find(
                (neighbor: any) => neighbor === node.nodeName
            ))
    ) {
        return 0.7;
    } else if (highlightNodes.has(node.nodeName)) {
        return 0.5;
    }

    // not the node we are looking for
    return 0.1;
};

function getSpriteColor(
    node: any,
    search: string[],
    graphData: any,
    threshold: number,
    highlightNodes: any,
    hoverNode: any,
    defNodeColor: any,
    setDefNodeColor: any,
    antipattern: any,
    colorMode: any,
    selectedAntiPattern: any,
    trackNodes: any,
    focusNode: any,
    trackChanges: any,
) {
    return getColor(
        node,
        graphData,
        threshold,
        highlightNodes,
        hoverNode,
        defNodeColor,
        setDefNodeColor,
        antipattern,
        colorMode,
        selectedAntiPattern,
        trackNodes,
        focusNode,
        trackChanges
    );
}

function getLinkOpacity(
    link: any,
    search: string[],
    threed: any,
    focusNode: any
): number {
    if (search && search.length > 0) {
        if (
            search.some(term => link.source.nodeName.toLowerCase().includes(term.toLowerCase())) ||
            search.some(term => link.target.nodeName.toLowerCase().includes(term.toLowerCase()))
        ) {
            if (threed) {
                return 1.0;
            }
        } else {
            if (threed) {
                return 0.2;
            }
            return 0.1;
        }
    }

    if (focusNode != null) {
        if (
            link.source.nodeName === focusNode.node ||
            link.target.nodeName === focusNode.node
        ) {
            return 1.0;
        } else {
            return 0.2;
        }
    }

    if (threed) {
        return 0.4;
    }
    return 0.7;
}

function getLinkColor(
    link: any,
    search: string[],
    hoverNode: any,
    antiPattern: any,
    threed: any,
    selectedAntiPattern: any,
    focusNode: any,
    showChanges: any)
{  
    if (link.nodeType === 'hierarchy') {
        return 'rgba(150, 150, 150, 0.5)'; 
    }
    if (
        link.source.nodeName === hoverNode ||
        (focusNode && link.source.nodeName === focusNode.node)
    ) {
        return LINK_FROM_HOVER;
    } else if (
        link.target.nodeName === hoverNode ||
        (focusNode && link.source.nodeName === focusNode.node)
    ) {
        return LINK_TO_HOVER;
    }

    if (antiPattern) {
        if (link.antiPattern) {
            const isActive = !selectedAntiPattern || selectedAntiPattern === "ALL" || selectedAntiPattern === "none" || selectedAntiPattern === link.antiPattern;
            if (isActive) {
                if (link.antiPattern === 'CYCLIC_DEPENDENCY' || link.antiPattern === 'CHATTY_SERVICE') {
                    return `rgba(255, 0, 0, 0.99)`; 
                }
            }
        }
        
        if (selectedAntiPattern == "coupling") {
            return `rgba(102,102,153, ${getLinkOpacity(
                link,
                search,
                threed,
                focusNode
            )})`;
        } else if (selectedAntiPattern == "Cyclic Dependency") {
            if (linkInAntiPattern(link, selectedAntiPattern)) {
                const color = IN_PATTERN.replace(`)`, `,0.99)`).replace(
                    "rgb",
                    "rgba"
                );

                return color;
            }
        }
    }
    //If the changes are shown then color each link depending on if it was added subtracted or deleted 
    if (showChanges) {
        if (link.color == 'green') {
            return `rgba(0, 255, 0,1)`;
        } else if (link.color == 'red') {
            return `rgba(255, 0, 0,1)`;
        } else if (link.color == 'yellow'){
            return `rgba(255, 115, 0,1)`;
        }
    }

    return `rgba(150,150,150,${getLinkOpacity(
        link,
        search,
        threed,
        focusNode
    )})`;
}

function linkColorAsSourceNodeColor(
    link: any,
    search: string[],
    threed: any,
    focusNode: any
) {
    let color = link.source.color;
    color = color
        .replace(`)`, `, ${getLinkOpacity(link, search, threed, focusNode)})`)
        .replace("rgb", "rgba");
    return color;
}

function getLinkWidth(
    link: any,
    search: string[],
    highlightLinks: Set<string>,
    antiPattern: boolean,
    selectedAntiPattern: string
) {
    if (link.nodeType === 'hierarchy') {
        return 1; 
    }

    let size = (link.requests?.length ?? 0) + 2;
    if (antiPattern) {
        if (link.antiPattern) {
            const isActive = !selectedAntiPattern || selectedAntiPattern === "ALL" || selectedAntiPattern === "none" || selectedAntiPattern === link.antiPattern;
            if (isActive && (link.antiPattern === 'CYCLIC_DEPENDENCY' || link.antiPattern === 'CHATTY_SERVICE')) {
                size *= 3; 
            }
        }

        if (
            selectedAntiPattern == "Cyclic Dependency" &&
            linkInAntiPattern(link, selectedAntiPattern)
        ) {
            size *= 2;
        }
    }
    if (highlightLinks.has(link.name)) {
        size *= 2;
    }
    return size;
}

function linkInAntiPattern(link: any, selectedAntiPattern: any) {
    return (
        link.source?.patterns?.find(
            (pattern: any) => pattern.type === selectedAntiPattern
        ) &&
        link.target?.patterns?.find(
            (pattern: any) => pattern.type === selectedAntiPattern
        )
    );
}

export {
    getShape,
    getColor,
    getNeighbors,
    reset,
    resetView,
    getNodeOpacity,
    getSpriteColor,
    getLinkOpacity,
    getLinkColor,
    getLinkWidth,
    getVisibility,
    showNeighbors,
};
