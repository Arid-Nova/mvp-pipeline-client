package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Simplified edge representation for minimized ICFG output.
 * Uses numeric node references and abbreviated field names.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder({"from", "to", "type", "cond"})
public class ICFGEdge {
    
    /**
     * Source node index
     */
    private int from;
    
    /**
     * Target node index
     */
    private int to;
    
    /**
     * Edge type: "seq", "true", "false", "call", "ret", "loop"
     */
    private String type;
    
    /**
     * Optional condition for conditional edges
     */
    private String cond;
    
    /**
     * Factory method for sequential edges
     */
    public static ICFGEdge createSequential(int from, int to) {
        return new ICFGEdge(from, to, "seq", null);
    }
    
    /**
     * Factory method for true branch edges
     */
    public static ICFGEdge createTrueBranch(int from, int to, String condition) {
        return new ICFGEdge(from, to, "true", condition);
    }
    
    /**
     * Factory method for false branch edges
     */
    public static ICFGEdge createFalseBranch(int from, int to, String condition) {
        return new ICFGEdge(from, to, "false", condition);
    }
    
    /**
     * Factory method for loop back edges
     */
    public static ICFGEdge createLoopBack(int from, int to) {
        return new ICFGEdge(from, to, "loop", "next iteration");
    }
    
    /**
     * Factory method for call edges
     */
    public static ICFGEdge createCall(int from, int to) {
        return new ICFGEdge(from, to, "call", null);
    }
    
    /**
     * Factory method for return edges
     */
    public static ICFGEdge createReturn(int from, int to) {
        return new ICFGEdge(from, to, "ret", null);
    }
    
    /**
     * Factory method for general branch edges with custom type
     */
    public static ICFGEdge createBranch(int from, int to, String branchType) {
        return new ICFGEdge(from, to, branchType.toLowerCase(), null);
    }
}