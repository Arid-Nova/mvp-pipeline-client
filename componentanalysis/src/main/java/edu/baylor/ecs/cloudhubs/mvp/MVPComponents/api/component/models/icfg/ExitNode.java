package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Represents an exit point (return statement) of a method in the control flow graph.
 * Methods can have multiple exit nodes if they have multiple return statements.
 */
@Getter
@Setter
@NoArgsConstructor
public class ExitNode extends CFGNode {
    
    /**
     * The return expression or value (if any)
     */
    private String returnExpression;
    
    /**
     * Constructor for ExitNode
     * 
     * @param nodeId Unique identifier for this node
     * @param returnExpression The return expression (optional)
     */
    public ExitNode(String nodeId, String returnExpression) {
        super(nodeId, CFGNodeType.EXIT, 
              generateDescription(returnExpression), 
              null);
        this.returnExpression = returnExpression;
    }
    
    /**
     * Constructor for ExitNode with line number
     * 
     * @param nodeId Unique identifier for this node
     * @param returnExpression The return expression (optional)
     * @param lineNumber Line number of the return statement
     */
    public ExitNode(String nodeId, String returnExpression, Integer lineNumber) {
        super(nodeId, CFGNodeType.EXIT, 
              generateDescription(returnExpression), 
              lineNumber);
        this.returnExpression = returnExpression;
    }
    
    /**
     * Generate description based on return expression
     * 
     * @param returnExpression The return expression
     * @return Generated description
     */
    private static String generateDescription(String returnExpression) {
        if (returnExpression == null || returnExpression.trim().isEmpty()) {
            return "Method exit: return";
        }
        return String.format("Method exit: return %s", returnExpression);
    }
    
    /**
     * Check if this exit node has a return value
     * 
     * @return true if returnExpression is not null and not empty
     */
    public boolean hasReturnValue() {
        return returnExpression != null && !returnExpression.trim().isEmpty();
    }
}