package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Objects;

/**
 * Represents an edge in the control flow graph connecting two nodes.
 * Edges define the possible execution paths between control flow points.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class CFGEdge {
    
    /**
     * Unique identifier of the source node
     */
    private String sourceNodeId;
    
    /**
     * Unique identifier of the target node
     */
    private String targetNodeId;
    
    /**
     * Type of this control flow edge
     */
    private CFGEdgeType type;
    
    /**
     * Optional condition or label for this edge (e.g., "condition == true")
     */
    private String condition;
    
    /**
     * Check if this edge has a condition
     * 
     * @return true if condition is not null and not empty
     */
    public boolean hasCondition() {
        return condition != null && !condition.trim().isEmpty();
    }
    
    /**
     * Check if this is a conditional edge (TRUE_BRANCH or FALSE_BRANCH)
     * 
     * @return true if this is a conditional edge
     */
    public boolean isConditional() {
        return type == CFGEdgeType.TRUE_BRANCH || type == CFGEdgeType.FALSE_BRANCH;
    }
    
    /**
     * Check if this is a call/return edge
     * 
     * @return true if this is a call or return edge
     */
    public boolean isInterprocedural() {
        return type == CFGEdgeType.CALL || type == CFGEdgeType.RETURN;
    }
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        CFGEdge cfgEdge = (CFGEdge) o;
        return Objects.equals(sourceNodeId, cfgEdge.sourceNodeId) &&
               Objects.equals(targetNodeId, cfgEdge.targetNodeId) &&
               type == cfgEdge.type;
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(sourceNodeId, targetNodeId, type);
    }
    
    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        sb.append(sourceNodeId).append(" -[").append(type);
        if (hasCondition()) {
            sb.append(": ").append(condition);
        }
        sb.append("]-> ").append(targetNodeId);
        return sb.toString();
    }
}