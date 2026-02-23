package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Interprocedural Control Flow Graph representation for a method.
 * Contains nodes representing control flow points and edges representing execution paths.
 */
@Getter
@Setter
@NoArgsConstructor
public class ICFG {
    
    /**
     * ID of the method this ICFG represents
     */
    private String methodId;
    
    /**
     * All nodes in this control flow graph, indexed by their ID for O(1) lookup
     */
    private Map<String, CFGNode> nodes;
    
    /**
     * All edges in this control flow graph
     */
    private List<CFGEdge> edges;
    
    /**
     * ID of the entry node for this method
     */
    private String entryNodeId;
    
    /**
     * List of exit node IDs for this method (methods can have multiple return points)
     */
    private List<String> exitNodeIds;
    
    /**
     * Constructor for ICFG
     * 
     * @param methodId ID of the method this ICFG represents
     */
    public ICFG(String methodId) {
        this.methodId = methodId;
        this.nodes = new HashMap<>();
        this.edges = new ArrayList<>();
        this.exitNodeIds = new ArrayList<>();
    }
    
    /**
     * Add a node to the ICFG
     * 
     * @param node The node to add
     */
    public void addNode(CFGNode node) {
        if (nodes == null) {
            nodes = new HashMap<>();
        }
        nodes.put(node.getNodeId(), node);
    }
    
    /**
     * Add an edge to the ICFG and update node connections
     * 
     * @param edge The edge to add
     */
    public void addEdge(CFGEdge edge) {
        if (edges == null) {
            edges = new ArrayList<>();
        }
        edges.add(edge);
        
        // Update node connections
        CFGNode sourceNode = nodes.get(edge.getSourceNodeId());
        CFGNode targetNode = nodes.get(edge.getTargetNodeId());
        
        if (sourceNode != null) {
            sourceNode.addOutgoingEdge(edge);
        }
        if (targetNode != null) {
            targetNode.addIncomingEdge(edge);
        }
    }
    
    /**
     * Get a node by its ID
     * 
     * @param nodeId The node ID
     * @return The node, or null if not found
     */
    public CFGNode getNode(String nodeId) {
        return nodes != null ? nodes.get(nodeId) : null;
    }
    
    /**
     * Get the entry node of this ICFG
     * 
     * @return The entry node, or null if not set
     */
    public CFGNode getEntryNode() {
        return entryNodeId != null ? getNode(entryNodeId) : null;
    }
    
    /**
     * Get all exit nodes of this ICFG
     * 
     * @return List of exit nodes
     */
    public List<CFGNode> getExitNodes() {
        if (exitNodeIds == null || nodes == null) {
            return new ArrayList<>();
        }
        return exitNodeIds.stream()
                .map(this::getNode)
                .collect(Collectors.toList());
    }
    
    /**
     * Add an exit node ID to the list
     * 
     * @param exitNodeId The exit node ID to add
     */
    public void addExitNodeId(String exitNodeId) {
        if (exitNodeIds == null) {
            exitNodeIds = new ArrayList<>();
        }
        exitNodeIds.add(exitNodeId);
    }
    
    /**
     * Get all nodes of a specific type
     * 
     * @param nodeType The type of nodes to retrieve
     * @return List of nodes of the specified type
     */
    public List<CFGNode> getNodesByType(CFGNodeType nodeType) {
        if (nodes == null) {
            return new ArrayList<>();
        }
        return nodes.values().stream()
                .filter(node -> node.getType() == nodeType)
                .collect(Collectors.toList());
    }
    
    /**
     * Get all edges of a specific type
     * 
     * @param edgeType The type of edges to retrieve
     * @return List of edges of the specified type
     */
    public List<CFGEdge> getEdgesByType(CFGEdgeType edgeType) {
        if (edges == null) {
            return new ArrayList<>();
        }
        return edges.stream()
                .filter(edge -> edge.getType() == edgeType)
                .collect(Collectors.toList());
    }
    
    /**
     * Get the total number of nodes
     * 
     * @return Number of nodes
     */
    public int getNodeCount() {
        return nodes != null ? nodes.size() : 0;
    }
    
    /**
     * Get the total number of edges
     * 
     * @return Number of edges
     */
    public int getEdgeCount() {
        return edges != null ? edges.size() : 0;
    }
    
    /**
     * Check if the ICFG is empty (no nodes)
     * 
     * @return true if there are no nodes
     */
    public boolean isEmpty() {
        return getNodeCount() == 0;
    }
    
    @Override
    public String toString() {
        return String.format("ICFG[methodId=%s, nodes=%d, edges=%d]", 
            methodId, getNodeCount(), getEdgeCount());
    }
}