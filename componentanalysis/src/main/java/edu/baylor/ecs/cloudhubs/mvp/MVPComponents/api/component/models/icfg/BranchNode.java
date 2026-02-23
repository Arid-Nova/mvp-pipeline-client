package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Represents a conditional branch in the control flow graph.
 * This includes if statements, loops, switch statements, and other control structures.
 */
@Getter
@Setter
@NoArgsConstructor
public class BranchNode extends CFGNode {
    
    /**
     * Type of branch (IF, WHILE, FOR, etc.)
     */
    private BranchType branchType;
    
    /**
     * The condition expression being evaluated
     */
    private String condition;
    
    /**
     * Constructor for BranchNode
     * 
     * @param nodeId Unique identifier for this node
     * @param branchType Type of branch
     * @param condition The condition expression
     */
    public BranchNode(String nodeId, BranchType branchType, String condition) {
        super(nodeId, CFGNodeType.BRANCH, 
              generateDescription(branchType, condition), 
              null);
        this.branchType = branchType;
        this.condition = condition;
    }
    
    /**
     * Constructor for BranchNode with line number
     * 
     * @param nodeId Unique identifier for this node
     * @param branchType Type of branch
     * @param condition The condition expression
     * @param lineNumber Line number of the branch statement
     */
    public BranchNode(String nodeId, BranchType branchType, String condition, Integer lineNumber) {
        super(nodeId, CFGNodeType.BRANCH, 
              generateDescription(branchType, condition), 
              lineNumber);
        this.branchType = branchType;
        this.condition = condition;
    }
    
    /**
     * Generate description based on branch type and condition
     * 
     * @param branchType Type of branch
     * @param condition The condition expression
     * @return Generated description
     */
    private static String generateDescription(BranchType branchType, String condition) {
        if (condition == null || condition.trim().isEmpty()) {
            return String.format("Branch: %s", branchType.toString().toLowerCase());
        }
        return String.format("Branch: %s (%s)", branchType.toString().toLowerCase(), condition);
    }
    
    /**
     * Check if this branch has a condition
     * 
     * @return true if condition is not null and not empty
     */
    public boolean hasCondition() {
        return condition != null && !condition.trim().isEmpty();
    }
    
    /**
     * Check if this is a loop branch
     * 
     * @return true if branchType is a loop type
     */
    public boolean isLoop() {
        return branchType == BranchType.WHILE || 
               branchType == BranchType.FOR || 
               branchType == BranchType.DO_WHILE || 
               branchType == BranchType.FOR_EACH;
    }
}