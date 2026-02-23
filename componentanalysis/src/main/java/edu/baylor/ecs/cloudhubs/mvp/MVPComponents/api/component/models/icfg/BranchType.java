package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

/**
 * Enumeration of branch types for conditional control flow constructs.
 * Used to classify different kinds of branching statements in Java.
 */
public enum BranchType {
    /**
     * If statement branch
     */
    IF,
    
    /**
     * While loop branch
     */
    WHILE,
    
    /**
     * For loop branch
     */
    FOR,
    
    /**
     * Switch statement branch
     */
    SWITCH,
    
    /**
     * Do-while loop branch
     */
    DO_WHILE,
    
    /**
     * Enhanced for loop (for-each) branch
     */
    FOR_EACH,
    
    /**
     * Try-catch exception handling branch
     */
    TRY_CATCH,
    
    /**
     * Ternary operator branch
     */
    TERNARY
}