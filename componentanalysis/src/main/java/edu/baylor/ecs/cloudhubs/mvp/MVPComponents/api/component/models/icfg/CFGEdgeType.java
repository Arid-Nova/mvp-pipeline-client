package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

/**
 * Enumeration of control flow graph edge types for ICFG representation.
 * Each type represents a different kind of control flow transition between nodes.
 */
public enum CFGEdgeType {
    /**
     * Sequential flow - normal execution from one statement to the next
     */
    SEQUENTIAL,
    
    /**
     * True branch - execution when a conditional expression evaluates to true
     */
    TRUE_BRANCH,
    
    /**
     * False branch - execution when a conditional expression evaluates to false
     */
    FALSE_BRANCH,
    
    /**
     * Loop back edge - execution that returns to the beginning of a loop
     */
    LOOP_BACK,
    
    /**
     * Exception edge - execution flow when an exception is thrown
     */
    EXCEPTION,
    
    /**
     * Call edge - flow from a call site to the entry of the called method
     */
    CALL,
    
    /**
     * Return edge - flow from the exit of a called method back to the return site
     */
    RETURN
}