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
};

const cleanNodeId = (id: string) => {
    if (!id) return "";
    return id.replace(/_\d+$/, ''); 
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
    selectedAntiPattern,
    trackNodes,
    focusNode,
    endpointCalls,
    trackChanges,
    expandedNodes,
    setExpandedNodes,
    isHighLevelExpanded,
    verificationSuggestions,
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
                
                visibleNodes = allNodes.filter((node: any) => {
                    // 1. Always show structure
                    if (['microservice', 'controller', 'method'].includes(node.nodeType)) return true;
                    
                    // 2. Check for match on the ID
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

        const getSuggestionForNode = (nodeName: string) => {
        if (!suggestionMap) return null;
        // 1. Exact Match
        if (suggestionMap.has(nodeName)) return suggestionMap.get(nodeName);
        // 2. Cleaned Match (remove _0)
        const cleanName = cleanNodeId(nodeName);
        if (suggestionMap.has(cleanName)) return suggestionMap.get(cleanName);
        return null;
    };

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
    }, [graphRef, handleNodeDoubleClick, getSuggestionForNode]);

    // Verification suggestion map
    const suggestionMap = useMemo(() => {
        if (!verificationSuggestions) return null;
        const map = new Map();
        verificationSuggestions.forEach(sugg => {
            map.set(sugg.id, sugg); 
        });
        return map;
    }, [verificationSuggestions]);

    return (
        <ForceGraph3D
            ref={graphRef}
            graphData={visibleData}
            nodeId={"nodeName"}
            width={width}
            height={height}
            onNodeClick={handleNodeClick}
            
            // Your Custom Node Logic (unchanged)
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
                        // color = "#acb8c8"; // GRAY (Dimmed) for non-relevant nodes
                    }
                } else {
                    color = getColor(
                        node, sharedProps.graphData, threshold, highlightNodes,
                        hoverNode, defNodeColor, setDefNodeColor, antiPattern,
                        colorMode, selectedAntiPattern, trackNodes, focusNode, trackChanges
                    );
                }
                
                // 3. Geometry Logic
                let geometry;
                let nodeType = node["nodeType"]?.toUpperCase();
                if (nodeType === "MICROSERVICE") {
                    geometry = new THREE.SphereGeometry(8);
                } else if (nodeType === "CONTROLLER" || nodeType === "SERVICE") {
                    geometry = new THREE.SphereGeometry(5);
                } else if (nodeType === "METHOD") {
                    if(suggestion){
                        geometry = new THREE.SphereGeometry(10);
                    } else {
                        geometry = new THREE.SphereGeometry(4);
                    }
                } else if (nodeType === "ENTITY") {
                    geometry = new THREE.BoxGeometry(10, 10, 10); 
                } 

                // 4. Opacity Logic
                let opacity = getNodeOpacity(node, search, highlightNodes, focusNode);
                if (isVerificationMode && !suggestion) {
                    opacity = 0.6; 
                }

                const material = new THREE.MeshLambertMaterial({
                    transparent: true,
                    color: color,
                    opacity: opacity,
                });

                const mesh = new THREE.Mesh(geometry, material);

                // 5. Label / Annotation Logic
                let labelText = node.displayName || node.nodeName;
                // if (suggestion) {
                //     const current = getRoleLabel(suggestion.current_role_mask);
                //     const suggested = getRoleLabel(suggestion.suggested_role_mask);
                //     labelText += ` need to change from ${current} → ${suggested}.`;
                // }

                const sprite = new SpriteText(labelText);
                sprite.material.depthWrite = false;
                const textColor = new THREE.Color(color);

                // Making annotation bright white/red if suggested
                if (suggestion) {
                    sprite.color = "#ffffff"; 
                    sprite.textHeight = 18; 
                    sprite.backgroundColor = "rgba(238, 91, 91, 0.5)"; 
                    sprite.padding = 5;
                } else {
                    sprite.color = textColor.getStyle();
                    sprite.material.opacity = material.opacity;
                    sprite.textHeight = 14;
                }

                sprite.position.set(0, 15, 0);
                mesh.add(sprite);
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
            
            // General props
            backgroundColor={"rgba(0,0,0,0)"}
            onLinkClick={handleLinkClick}
            onNodeHover={handleNodeHover}
            onLinkHover={handleLinkHover}
        />
    );
};

export default Graph;