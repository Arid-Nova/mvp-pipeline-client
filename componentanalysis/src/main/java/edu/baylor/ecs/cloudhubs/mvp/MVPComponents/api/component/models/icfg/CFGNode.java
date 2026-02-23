package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Base class for control flow graph nodes in the ICFG representation.
 * Each node represents a point in the control flow with connections to other nodes.
 */
@Getter
@Setter
@NoArgsConstructor
@JsonTypeInfo(
    use = JsonTypeInfo.Id.NAME,
    include = JsonTypeInfo.As.PROPERTY,
    property = "nodeType"
)
@JsonSubTypes({
    @JsonSubTypes.Type(value = EntryNode.class, name = "ENTRY"),
    @JsonSubTypes.Type(value = ExitNode.class, name = "EXIT"),
    @JsonSubTypes.Type(value = CallNode.class, name = "CALL"),
    @JsonSubTypes.Type(value = ReturnNode.class, name = "RETURN"),
    @JsonSubTypes.Type(value = BranchNode.class, name = "BRANCH"),
    @JsonSubTypes.Type(value = StatementNode.class, name = "STATEMENT")
})
public abstract class CFGNode {
    
    /**
     * Unique identifier for this node within the method's ICFG
     */
    private String nodeId;
    
    /**
     * Type of this control flow node
     */
    private CFGNodeType type;
    
    /**
     * Human-readable description of what this node represents
     */
    private String description;
    
    /**
     * Line number in the source code where this node originates (if applicable)
     */
    private Integer lineNumber;
    
    /**
     * List of outgoing edges from this node
     */
    private List<CFGEdge> outgoingEdges;
    
    /**
     * List of incoming edges to this node
     */
    private List<CFGEdge> incomingEdges;
    
    /**
     * Constructor for CFG nodes
     * 
     * @param nodeId Unique identifier for this node
     * @param type Type of this control flow node
     * @param description Human-readable description
     * @param lineNumber Source code line number (optional)
     */
    public CFGNode(String nodeId, CFGNodeType type, String description, Integer lineNumber) {
        this.nodeId = nodeId;
        this.type = type;
        this.description = description;
        this.lineNumber = lineNumber;
        this.outgoingEdges = new ArrayList<>();
        this.incomingEdges = new ArrayList<>();
    }
    
    /**
     * Add an outgoing edge from this node
     * 
     * @param edge The edge to add
     */
    public void addOutgoingEdge(CFGEdge edge) {
        if (outgoingEdges == null) {
            outgoingEdges = new ArrayList<>();
        }
        outgoingEdges.add(edge);
    }
    
    /**
     * Add an incoming edge to this node
     * 
     * @param edge The edge to add
     */
    public void addIncomingEdge(CFGEdge edge) {
        if (incomingEdges == null) {
            incomingEdges = new ArrayList<>();
        }
        incomingEdges.add(edge);
    }
    
    /**
     * Get the number of outgoing edges
     * 
     * @return Number of outgoing edges
     */
    public int getOutgoingEdgeCount() {
        return outgoingEdges != null ? outgoingEdges.size() : 0;
    }
    
    /**
     * Get the number of incoming edges
     * 
     * @return Number of incoming edges
     */
    public int getIncomingEdgeCount() {
        return incomingEdges != null ? incomingEdges.size() : 0;
    }
    
    /**
     * Check if this node has any outgoing edges
     * 
     * @return true if there are outgoing edges
     */
    public boolean hasOutgoingEdges() {
        return getOutgoingEdgeCount() > 0;
    }
    
    /**
     * Check if this node has any incoming edges
     * 
     * @return true if there are incoming edges
     */
    public boolean hasIncomingEdges() {
        return getIncomingEdgeCount() > 0;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        CFGNode cfgNode = (CFGNode) o;
        return Objects.equals(nodeId, cfgNode.nodeId);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(nodeId);
    }
    
    @Override
    public String toString() {
        return String.format("%s[id=%s, type=%s, description='%s']", 
            getClass().getSimpleName(), nodeId, type, description);
    }
}