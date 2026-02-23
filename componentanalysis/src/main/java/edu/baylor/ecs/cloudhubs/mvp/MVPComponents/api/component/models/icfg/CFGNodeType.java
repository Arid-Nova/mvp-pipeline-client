package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

/**
 * Enumeration of control flow graph node types for ICFG representation.
 * Each type represents a different kind of control flow construct in Java methods.
 */
public enum CFGNodeType {
    /**
     * Entry point of a method - represents the start of execution
     */
    ENTRY,
    
    /**
     * Exit point of a method - represents the end of execution (return statements)
     */
    EXIT,
    
    /**
     * Method call node - represents invocation of another method
     */
    CALL,
    
    /**
     * Return from method call - represents the continuation point after a method call
     */
    RETURN,
    
    /**
     * Branch node - represents conditional statements (if, switch, etc.)
     */
    BRANCH,
    
    /**
     * Regular statement - represents assignment, expression, or other non-control statements
     */
    STATEMENT
}