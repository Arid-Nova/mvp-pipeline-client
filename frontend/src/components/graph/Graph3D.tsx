import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import ForceGraph3D from "react-force-graph-3d";
import { ForceGraphProps as SharedProps } from "react-force-graph-2d";
import {
    getColor,
    getLinkColor,
    getLinkWidth,
    getNeighbors,
    getNodeOpacity,
    getVisibility,
} from "../../utils/graphFunctions";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import { showRenderingError } from "../../utils/notifications";

type Props = {
    width: number;
    height: number;
    search: string;
    threshold: number;
    sharedProps: SharedProps;
    graphRef: any;
    setInitCoords: any;
    setInitRotation: any;
    antiPattern: any;
    colorMode: any;
    defNodeColor: any;
    setDefNodeColor: any;
    setGraphData: any;
    isDarkMode: any;
    selectedAntiPattern: any;
    trackNodes: any;
    focusNode: any;
    endpointCalls: any;
    trackChanges: any;
    expandedNodes: Set<string>;
    isHighLevelExpanded: boolean;
    setExpandedNodes: React.Dispatch<React.SetStateAction<Set<string>>>;
    verificationSuggestions?: any[];
    regressionPayload?: any;
};

const cleanNodeId = (id: string) => {
    if (!id) return "";
    return id.replace(/_\d+$/, ''); 
};

const getRoleLabel = (mask: number) => {
    switch (mask) {
        case 0: return "None";
        case 1: return "Unauthenticated";
        case 2: return "User Only";
        case 4: return "Admin Only";
        case 6: return "User + Admin Only";
        case 7: return "Any Authenticated User";
        default: return `Mask ${mask}`;
    }
};

const Graph: React.FC<Props> = ({
    width,
    height,
    sharedProps,
    search,
    threshold,
    graphRef,
    setInitCoords,
    setInitRotation,
    antiPattern,
    colorMode,
    defNodeColor,
    setDefNodeColor,
    setGraphData,
    isDarkMode,
    selectedAntiPattern,
    trackNodes,
    focusNode,
    endpointCalls,
    trackChanges,
    expandedNodes,
    setExpandedNodes,
    isHighLevelExpanded,
    verificationSuggestions,
    regressionPayload
}) => {
    const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
    const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set());
    const [hoverNode, setHoverNode] = useState(null);
    const [selectedLink, setSelectedLink] = useState(null);
    const [hideNodes, setHideNodes] = useState<any>(new Set());
    const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // On page load
    useEffect(() => {
        if (graphRef.current) {
            let { x, y, z } = graphRef.current.cameraPosition();

            setInitCoords({ x, y, z });
            setInitRotation(graphRef.current.camera().quaternion);
            graphRef.current.d3Force("charge").strength(-500);
            graphRef.current.d3Force("link").distance(80);
        }
    }, []);

    useEffect(() => {
        if (!sharedProps.graphData?.nodes) return;

        sharedProps.graphData.nodes.forEach((node: any) => {
            if (node.__mesh) {
                // 1. Dynamically update Scale (Size)
                let sizeScale = 1;
                if (antiPattern && node.antiPattern) {
                    const isActive = !selectedAntiPattern || selectedAntiPattern === "ALL" || selectedAntiPattern === "none" || selectedAntiPattern === node.antiPattern;
                    if (isActive) {
                        if (node.antiPattern === 'GOD_SERVICE') sizeScale = 4;
                        if (node.antiPattern === 'SHARED_DB') sizeScale = 2;
                    }
                }
                node.__mesh.scale.set(sizeScale, sizeScale, sizeScale);

                // 2. Dynamically update Color
                let newColor;
                const nodeId = cleanNodeId(node.nodeName);
                if (regressionPayload) {
                    if (regressionPayload.introduced?.some((s: any) => cleanNodeId(s.id) === nodeId || cleanNodeId(s.endpoint_name) === nodeId)) {
                        newColor = '#f43f5e'; // Rose-500 (New Vulns)
                    } else if (regressionPayload.resolved?.some((s: any) => cleanNodeId(s.id) === nodeId || cleanNodeId(s.endpoint_name) === nodeId)) {
                        newColor = '#10b981'; // Emerald-500 (Fixed)
                    } else if (regressionPayload.persistent?.some((s: any) => cleanNodeId(s.id) === nodeId || cleanNodeId(s.endpoint_name) === nodeId)) {
                        newColor = '#f59e0b'; // Amber-500 (Persistent)
                    } else {
                        // Fallback if node isn't in diff
                        newColor = getColor(node, sharedProps.graphData, threshold, highlightNodes, hoverNode, defNodeColor, setDefNodeColor, antiPattern, colorMode, selectedAntiPattern, trackNodes, focusNode, trackChanges);
                    }
                } else if (verificationSuggestions && getSuggestionForNode(node.nodeName)) {
                    newColor = "#f43e3e"; 
                } else {
                    newColor = getColor(node, sharedProps.graphData, threshold, highlightNodes, hoverNode, defNodeColor, setDefNodeColor, antiPattern, colorMode, selectedAntiPattern, trackNodes, focusNode, trackChanges);
                }
                node.__mesh.material.color.set(newColor);
                
                // 3. Dynamically update Opacity
                node.__mesh.material.opacity = getNodeOpacity(node, search, highlightNodes, focusNode);
            }
        });
    }, [antiPattern, selectedAntiPattern, highlightNodes, hoverNode, colorMode, search, sharedProps.graphData]);

    // Double-click handler to expand/collapse nodes.
    const handleNodeDoubleClick = useCallback((node: any) => {
        // Only allow expanding/collapsing microservice nodes
        if (node.nodeType !== 'microservice') return;

        const newExpandedNodes = new Set(expandedNodes);
        if (newExpandedNodes.has(node.nodeName)) {
            newExpandedNodes.delete(node.nodeName);
        } else {
            newExpandedNodes.add(node.nodeName);
        }
        setExpandedNodes(newExpandedNodes);
    }, [expandedNodes]);

    // Memoized function to filter data based on expanded nodes.
    const visibleData = useMemo(() => {
        try {
            const { nodes: allNodes, links: allLinks } = 
                sharedProps.graphData || { nodes: [], links: [] };
        
            if (!allNodes || allNodes.length === 0) {
                return { nodes: [], links: [] };
            }

            let visibleNodes;

            // VERIFICATION MODE OVERRIDE
            if (verificationSuggestions && verificationSuggestions.length > 0) {
                const suggestedIds = new Set(verificationSuggestions.map(s => s.id));

                if (regressionPayload && regressionPayload.introduced) {
                    regressionPayload.introduced.forEach((s: any) => {
                        if (s.id) suggestedIds.add(s.id);
                        if (s.endpoint_name) suggestedIds.add(s.endpoint_name);
                    });
                }

                // 1. Pre-calculate: Find methods that are actually attached to a controller
                // We need to look at 'allLinks' to determine this relationship.
                const validMethodIds = new Set();
                const nodeTypeMap = new Map(allNodes.map((n: any) => [n.id, n.nodeType]));

                allLinks.forEach((link: any) => {
                    // Handle links whether they are raw objects (strings) or processed D3 objects
                    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
                    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
                    
                    const sourceType = nodeTypeMap.get(sourceId);
                    const targetType = nodeTypeMap.get(targetId);

                    // Record the method ID if it comes from a controller
                    if (sourceType === 'controller' && targetType === 'method') {
                        validMethodIds.add(targetId);
                    }
                });

                // 2. Filter the nodes
                visibleNodes = allNodes.filter((node: any) => {
                    // Rule A: Always show Microservices and Controllers (the backbone)
                    if (['microservice', 'controller'].includes(node.nodeType)) return true;

                    // Rule B: Only show Methods if they are linked to a Controller
                    if (node.nodeType === 'method' && validMethodIds.has(node.id)) return true;
                    
                    // Rule C: Always show nodes that specifically have a suggestion (even if orphaned/weird)
                    // This ensures you don't accidentally hide the very thing you need to fix.
                    const cleanName = cleanNodeId(node.nodeName);
                    if (suggestedIds.has(node.nodeName) || suggestedIds.has(cleanName)) return true;

                    return false;
                });
            }
            // STANDARD FILTER LOGIC
            else if (isHighLevelExpanded) {
                visibleNodes = allNodes.filter((node: any) => node.nodeType !== 'method');
            } else {
                const relevantUsesLinks = allLinks.filter((link: any) =>
                    link.nodeType === 'uses' && 
                    allNodes.find((n: any) => (n.nodeName === (link.source.nodeName || link.source)) && expandedNodes.has(n.parentMicroservice))
                );
                const visibleEntityIds = new Set(relevantUsesLinks.map((link: any) => link.target.nodeName || link.target));

                visibleNodes = allNodes.filter((node: any) =>
                    node.nodeType === 'microservice' ||
                    expandedNodes.has(node.parentMicroservice) ||
                    (node.nodeType === 'entity' && visibleEntityIds.has(node.nodeName))
                );
            }

            const visibleNodeIds = new Set(visibleNodes.map((n: any) => n.nodeName));
            const visibleLinks = allLinks.filter((link: any) =>
                visibleNodeIds.has(link.source?.nodeName || link.source) &&
                visibleNodeIds.has(link.target?.nodeName || link.target)
            );

            return { nodes: visibleNodes, links: visibleLinks };
        } catch (error: any) {
            showRenderingError('Graph rendering failed!');
            return { nodes: [], links: [] };
        }
    }, [sharedProps.graphData, expandedNodes, isHighLevelExpanded, verificationSuggestions]);

    const handleNodeHover = (node: any) => {
        const newHighlightNodes = new Set<string>();
        const newHighlightLinks = new Set<string>();
    
        if (node) {
            newHighlightNodes.add(node.nodeName);
            setHoverNode(node.nodeName);
            const neighbors = getNeighbors(
                node,
                visibleData.nodes,
                visibleData.links
            );
            neighbors.nodes.forEach((neighbor: any) =>
                newHighlightNodes.add(neighbor.nodeName)
            );
            neighbors.nodeLinks.forEach((link: any) =>
                newHighlightLinks.add(link.name)
            );
        } else {
            setHoverNode(null);
        }
    
        setHighlightNodes(newHighlightNodes);
        setHighlightLinks(newHighlightLinks);
    };

    const handleLinkHover = (link: any) => {
        // ... (existing implementation is fine)
        const newHighlightNodes = new Set<string>();
        const newHighlightLinks = new Set<string>();

        if (link) {
            newHighlightLinks.add(link.name);
            newHighlightNodes.add(link.source.nodeName || link.source);
            newHighlightNodes.add(link.target.nodeName || link.target);
        }
        
        setHighlightNodes(newHighlightNodes);
        setHighlightLinks(newHighlightLinks);
    };

    // On link click.
    const handleLinkClick = useCallback((link: any) => {
        const event = new CustomEvent("linkClick", {
            detail: { link: link },
        });
        document.dispatchEvent(event);
    }, []);

        // Verification suggestion map
    const suggestionMap = useMemo(() => {
        if (!verificationSuggestions) return null;
        const map = new Map();
        verificationSuggestions.forEach(sugg => {
            map.set(sugg.id, sugg); 
        });
        return map;
    }, [verificationSuggestions]);

    const getSuggestionForNode = useCallback((nodeName: string) => {
        if (!suggestionMap) return null;
        if (suggestionMap.has(nodeName)) return suggestionMap.get(nodeName);
        const cleanName = cleanNodeId(nodeName);
        if (suggestionMap.has(cleanName)) return suggestionMap.get(cleanName);
        return null;
    }, [suggestionMap]);

    // On node left click - zoom in on the node and pull up info box
    const handleNodeClick = useCallback((node: any) => {
        // If a timeout is already running, it means this is a double-click
        if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current);
            clickTimeoutRef.current = null;
            handleNodeDoubleClick(node); // Execute double-click logic
        } else {
            // Otherwise, it's a single-click. Set a timeout.
            clickTimeoutRef.current = setTimeout(() => {
                // This code runs if no second click happens within 300ms
                if (node != null && graphRef.current) {
                    graphRef.current.cameraPosition(
                        {...graphRef.current.cameraPosition()},
                        node,
                        1000
                    );

                    const suggestion = getSuggestionForNode(node.nodeName);
                    const nodePayload = suggestion ? { ...node, suggestion } : node;

                    const event = new CustomEvent("nodeClick", { detail: { node: nodePayload } });
                    document.dispatchEvent(event);
                }
                clickTimeoutRef.current = null;
            }, 300); // 300ms is a standard double-click threshold
        }
    }, [graphRef, getSuggestionForNode, handleNodeDoubleClick]);

    return (
        <ForceGraph3D
            ref={graphRef}
            graphData={visibleData}
            nodeId={"nodeName"}
            width={width}
            height={height}
            onNodeClick={handleNodeClick}
            
            // Custom Node Logic
            nodeVisibility={(node) => getVisibility(node, hideNodes)}
            onNodeRightClick={(node: any) => {
                const event = new CustomEvent("nodecontextmenu", {
                    detail: {
                        node: node,
                        coords: graphRef.current.graph2ScreenCoords(
                            node.x,
                            node.y,
                            node.z
                        ),
                        graphData: sharedProps.graphData,
                        setHideNodes: setHideNodes,
                        setGraphData: setGraphData,
                    },
                });
                document.dispatchEvent(event);
            }}

            nodeThreeObject={(node: any) => {
                // 1. Checking if in Verification Mode
                const suggestion = getSuggestionForNode(node.nodeName);
                const isVerificationMode = suggestionMap !== null;

                // 2. Determine Color
                let color;
                if (isVerificationMode) {
                    if (suggestion) {
                        color = "#f43e3e"; // RED for violations
                    } else {
                        color = getColor(
                            node, sharedProps.graphData, threshold, highlightNodes,
                            hoverNode, defNodeColor, setDefNodeColor, antiPattern,
                            colorMode, selectedAntiPattern, trackNodes, focusNode, trackChanges
                        );
                    }
                } else {
                    color = getColor(
                        node, sharedProps.graphData, threshold, highlightNodes,
                        hoverNode, defNodeColor, setDefNodeColor, antiPattern,
                        colorMode, selectedAntiPattern, trackNodes, focusNode, trackChanges
                    );
                }

                let sizeScale = 1;
                if (antiPattern && node.antiPattern) {
                    const isActive = !selectedAntiPattern || selectedAntiPattern === "ALL" || selectedAntiPattern === "none" || selectedAntiPattern === node.antiPattern;
                    if (isActive) {
                        if (node.antiPattern === 'GOD_SERVICE') sizeScale = 4; // Massive scale
                        if (node.antiPattern === 'SHARED_DB') sizeScale = 2;  // Large scale
                    }
                }

                // 3. Geometry Logic (Updated to use sizeScale)
                let geometry;
                let nodeType = node["nodeType"]?.toUpperCase();
                
                if (nodeType === "MICROSERVICE") {
                    geometry = new THREE.SphereGeometry(8 * sizeScale);
                } else if (nodeType === "CONTROLLER" || nodeType === "SERVICE") {
                    geometry = new THREE.SphereGeometry(5 * sizeScale);
                } else if (nodeType === "METHOD") {
                    if (suggestion) {
                        geometry = new THREE.SphereGeometry(10 * sizeScale);
                    } else {
                        geometry = new THREE.SphereGeometry(4 * sizeScale);
                    }
                } else if (nodeType === "ENTITY") {
                    geometry = new THREE.BoxGeometry(10 * sizeScale, 10 * sizeScale, 10 * sizeScale);
                }

                // 4. Opacity Logic
                let opacity = getNodeOpacity(node, search, highlightNodes, focusNode);
                if (isVerificationMode && !suggestion) {
                    opacity = 0.6; 
                }

                const nodeId = cleanNodeId(node.nodeName);
                
                if (regressionPayload) {
                    if (regressionPayload.introduced?.some((s: any) => cleanNodeId(s.id) === nodeId || cleanNodeId(s.endpoint_name) === nodeId)) {
                        color = '#f43f5e'; // Rose-500
                    } else if (regressionPayload.resolved?.some((s: any) => cleanNodeId(s.id) === nodeId || cleanNodeId(s.endpoint_name) === nodeId)) {
                        color = '#10b981'; // Emerald-500
                    } else if (regressionPayload.persistent?.some((s: any) => cleanNodeId(s.id) === nodeId || cleanNodeId(s.endpoint_name) === nodeId)) {
                        color = '#f59e0b'; // Amber-500
                    } else {
                        color = getColor(
                            node, sharedProps.graphData, threshold, highlightNodes, 
                            hoverNode, defNodeColor, setDefNodeColor, antiPattern, 
                            colorMode, selectedAntiPattern, trackNodes, focusNode, trackChanges
                        );
                    }
                } else if (suggestionMap && getSuggestionForNode(node.nodeName)) {
                    color = "#f43e3e"; // RED for violations
                } else {
                    color = getColor(
                        node, sharedProps.graphData, threshold, highlightNodes, 
                        hoverNode, defNodeColor, setDefNodeColor, antiPattern, 
                        colorMode, selectedAntiPattern, trackNodes, focusNode, trackChanges
                    );
                }

                const material = new THREE.MeshLambertMaterial({
                    transparent: true,
                    color: color,
                    opacity: opacity,
                });

                const mesh = new THREE.Mesh(geometry, material);

                // 5. Label / Annotation Logic
                let labelText = node.displayName || node.nodeName;
                let textColor = node.color || 'rgba(255, 255, 255, 0.8)';
                let bgColor = 'rgba(0, 0, 0, 0)'; // Transparent by default
                let borderColor = 'rgba(0,0,0,0)';
                let borderWidth = 0;
                let padding = 0;

                // 6. If Security Violation exists, Apply Styling
                if (suggestion) {
                    const current = getRoleLabel(suggestion.current_role_mask);
                    const suggested = getRoleLabel(suggestion.suggested_role_mask);
                    
                    // Add newlines to stack the text neatly
                    labelText += `\n`;
                    labelText += `\nCurrent: ${current}`;
                    labelText += `\nRequired: ${suggested}`;

                    // "Security Card" styling
                    textColor = 'red';                  
                    bgColor = 'rgba(255, 255, 255, 0.85)'; 
                    borderColor = 'red';                 
                    borderWidth = 1;                     
                    padding = 4;                         
                }

                const sprite = new SpriteText(labelText);
                sprite.color = textColor;
                sprite.textHeight = suggestion ? 12 : 10; 
                sprite.backgroundColor = bgColor;
                sprite.padding = padding;
                sprite.borderWidth = borderWidth;
                sprite.borderColor = borderColor;
                sprite.borderRadius = 4; 

                sprite.material.depthWrite = false;

                sprite.position.set(0, 15, 0);
                mesh.add(sprite);
                
                node.__mesh = mesh;
                return mesh;
            }}

            nodeThreeObjectExtend={false}
            onNodeDragEnd={(node) => {
                if (node.x && node.y && node.z) {
                    node.fx = node.x;
                    node.fy = node.y;
                    node.fz = node.z;
                }
            }}

            // Detailed Link Styling Props.
            linkCurvature={(link) => (link.hasReciprocal ? 0.4 : 0)}
            linkWidth={(link) =>
                getLinkWidth(
                    link, search, highlightLinks, antiPattern, selectedAntiPattern
                )
            }

            // 6. Link Styling for Verification Mode
            linkColor={(link) => {
                if (suggestionMap) {
                    return "rgba(215, 211, 211, 0.81)";
                }

                if (antiPattern && link.antiPattern) {
                    const isActive = !selectedAntiPattern || selectedAntiPattern === "ALL" || selectedAntiPattern === "none" || selectedAntiPattern === link.antiPattern;
                    if (isActive) {
                        return "rgba(255, 0, 0, 0.99)"; 
                    }
                }

                switch (link.nodeType) {
                    case 'uses': return 'rgba(65, 68, 249, 0.7)'; // Controller/Service -> Entity
                    case 'dependency': return 'rgba(255, 165, 0, 0.7)'; // Controller -> Service
                    case 'hierarchy': return 'rgba(150, 150, 150, 0.5)'; // MS -> Controller/Service -> Method
                    default:
                        return getLinkColor(
                            link, search, hoverNode, antiPattern, true,
                            selectedAntiPattern, focusNode, trackChanges
                        );
                }
            }}

            linkDirectionalArrowLength={(link) => link.nodeType === 'link' ? 10 : 0}
            linkDirectionalArrowRelPos={sharedProps.linkDirectionalArrowRelPos}
            linkDirectionalArrowColor={(link) =>
                getLinkColor(
                    link, search, hoverNode, antiPattern, true,
                    selectedAntiPattern, focusNode, trackChanges
                )
            }

            linkDirectionalParticles={(link: any) => {
                // Adding heavy particle traffic for Chatty/Cyclic services
                if (antiPattern && link.antiPattern) {
                    const isActive = !selectedAntiPattern || selectedAntiPattern === "ALL" || selectedAntiPattern === "none" || selectedAntiPattern === link.antiPattern;
                    if (isActive) {
                        if (link.antiPattern === 'CHATTY_SERVICE') return 10;
                        if (link.antiPattern === 'CYCLIC_DEPENDENCY') return 5; 
                    }
                }

                if (link.nodeType === 'hierarchy') return 0;
                return highlightLinks.has(link.name) || endpointCalls.includes(link.name) ? 4 : 0;
            }}

            linkDirectionalParticleWidth={(link) =>
                getLinkWidth(
                    link, search, highlightLinks, antiPattern, selectedAntiPattern
                )
            }

            linkDirectionalParticleSpeed={(link:any) =>{
                if (highlightLinks.has(link.name)){
                    return 0.01;
                }
                if (endpointCalls.includes(link.name)){
                    return 0;
                }
                return 0.01;
            }}

            nodeVal={(node: any) => {
                const nodeId = cleanNodeId(node.nodeName);

                // For regression
                if (regressionPayload) {
                    if (regressionPayload.introduced?.some((s: any) => cleanNodeId(s.id) === nodeId || cleanNodeId(s.endpoint_name) === nodeId)) {
                        return 25; 
                    }
                    if (regressionPayload.resolved?.some((s: any) => cleanNodeId(s.id) === nodeId || cleanNodeId(s.endpoint_name) === nodeId)) {
                        return 15; 
                    }
                }

                // For antipatterns
                if (antiPattern && node.antiPattern) {
                    const isActive = !selectedAntiPattern || selectedAntiPattern === "ALL" || selectedAntiPattern === "none" || selectedAntiPattern === node.antiPattern;
                    if (isActive) {
                        if (node.antiPattern === 'GOD_SERVICE') return 400; 
                        if (node.antiPattern === 'SHARED_DB') return 200;  
                    }
                }
                
                return node.nodeType === 'microservice' ? 10 : 3;
            }}
            
            linkDirectionalParticleColor={(link: any) => {
                if (antiPattern && link.antiPattern && (link.antiPattern === 'CHATTY_SERVICE' || link.antiPattern === 'CYCLIC_DEPENDENCY')) {
                    const isActive = !selectedAntiPattern || selectedAntiPattern === "ALL" || selectedAntiPattern === "none" || selectedAntiPattern === link.antiPattern;
                    if (isActive) return 'rgba(255, 0, 0, 0.99)'; // Red alert particles
                }
                return isDarkMode ? '#FFFFFF' : '#000000';
            }}
            
            // General props
            backgroundColor={"rgba(0,0,0,0)"}
            onLinkClick={handleLinkClick}
            onNodeHover={handleNodeHover}
            onLinkHover={handleLinkHover}
        />
    );
};

export default Graph;