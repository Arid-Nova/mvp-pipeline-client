package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Minimized Interprocedural Control Flow Graph representation.
 * Uses numeric indices and compact structure for optimal JSON size.
 */
@Getter
@Setter
@NoArgsConstructor
@JsonPropertyOrder({"methodId", "entryNodeIndex", "exitNodeIndices", "nodes", "edges"})
public class MinimizedICFG {
    
    /**
     * ID of the method this ICFG represents
     */
    private String methodId;
    
    /**
     * Index of the entry node (typically 0)
     */
    private int entryNodeIndex;
    
    /**
     * Indices of all exit nodes (multiple returns/throws)
     */
    private List<Integer> exitNodeIndices;
    
    /**
     * All nodes in the control flow graph
     */
    private List<ICFGNode> nodes;
    
    /**
     * All edges connecting the nodes
     */
    private List<ICFGEdge> edges;
    
    /**
     * Constructor
     */
    public MinimizedICFG(String methodId) {
        this.methodId = methodId;
        this.entryNodeIndex = 0;
        this.exitNodeIndices = new ArrayList<>();
        this.nodes = new ArrayList<>();
        this.edges = new ArrayList<>();
    }
    
    /**
     * Add a node and return its index
     */
    public int addNode(ICFGNode node) {
        if (nodes == null) {
            nodes = new ArrayList<>();
        }
        int index = nodes.size();
        node.setId(index);
        nodes.add(node);
        return index;
    }
    
    /**
     * Add an edge
     */
    public void addEdge(ICFGEdge edge) {
        if (edges == null) {
            edges = new ArrayList<>();
        }
        edges.add(edge);
    }
    
    /**
     * Add an exit node index
     */
    public void addExitNodeIndex(int index) {
        if (exitNodeIndices == null) {
            exitNodeIndices = new ArrayList<>();
        }
        exitNodeIndices.add(index);
    }
    
    /**
     * Get node by index
     */
    public ICFGNode getNode(int index) {
        if (nodes != null && index >= 0 && index < nodes.size()) {
            return nodes.get(index);
        }
        return null;
    }
    
    /**
     * Get node count
     */
    @JsonIgnore
    public int getNodeCount() {
        return nodes != null ? nodes.size() : 0;
    }
    
    /**
     * Get edge count
     */
    @JsonIgnore
    public int getEdgeCount() {
        return edges != null ? edges.size() : 0;
    }
    
    /**
     * Check if empty
     */
    @JsonIgnore
    public boolean isEmpty() {
        return getNodeCount() == 0;
    }
}