package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

/**
 * Enhanced CFG edge with semantic edge types and data flow information.
 * Provides clear control flow semantics and optional labels.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder({"from", "to", "type", "label", "dataFlow", "exceptionType"})
public class ImprovedCFGEdge {

    /**
     * Semantic edge types for control flow analysis
     */
    public enum EdgeType {
        SEQUENTIAL,         // Normal sequential execution
        BRANCH_TRUE,        // Branch taken (condition true)
        BRANCH_FALSE,       // Branch not taken (condition false)
        LOOP_ENTER,         // Entering a loop body
        LOOP_BACK,          // Loop iteration back to header
        LOOP_EXIT,          // Exiting a loop
        EXCEPTION,          // Exception flow
        CALL,               // Method call edge
        RETURN,             // Method return edge
        MERGE,              // Control flow merge
        SWITCH_CASE,        // Switch case edge
        SWITCH_DEFAULT,     // Switch default case
        BREAK,              // Break statement
        CONTINUE,           // Continue statement
        FINALLY             // Finally block execution
    }

    /**
     * Source node index
     */
    private int from;

    /**
     * Target node index
     */
    private int to;

    /**
     * Semantic edge type
     */
    private EdgeType type;

    /**
     * Optional human-readable label for the edge
     */
    private String label;

    /**
     * Variables that flow along this edge
     */
    private List<String> dataFlow;

    /**
     * Exception type for exception edges
     */
    private String exceptionType;

    // Factory methods for creating specific edge types

    /**
     * Create a sequential edge
     */
    public static ImprovedCFGEdge createSequential(int from, int to) {
        return new ImprovedCFGEdge(from, to, EdgeType.SEQUENTIAL, null, null, null);
    }

    /**
     * Create a branch true edge
     */
    public static ImprovedCFGEdge createBranchTrue(int from, int to, String condition) {
        return new ImprovedCFGEdge(from, to, EdgeType.BRANCH_TRUE, condition, null, null);
    }

    /**
     * Create a branch false edge
     */
    public static ImprovedCFGEdge createBranchFalse(int from, int to, String condition) {
        return new ImprovedCFGEdge(from, to, EdgeType.BRANCH_FALSE, "!(" + condition + ")", null, null);
    }

    /**
     * Create a loop enter edge
     */
    public static ImprovedCFGEdge createLoopEnter(int from, int to, String condition) {
        return new ImprovedCFGEdge(from, to, EdgeType.LOOP_ENTER, condition, null, null);
    }

    /**
     * Create a loop back edge
     */
    public static ImprovedCFGEdge createLoopBack(int from, int to) {
        return new ImprovedCFGEdge(from, to, EdgeType.LOOP_BACK, "next iteration", null, null);
    }

    /**
     * Create a loop exit edge
     */
    public static ImprovedCFGEdge createLoopExit(int from, int to, String condition) {
        return new ImprovedCFGEdge(from, to, EdgeType.LOOP_EXIT, condition, null, null);
    }

    /**
     * Create an exception edge
     */
    public static ImprovedCFGEdge createException(int from, int to, String exceptionType) {
        return new ImprovedCFGEdge(from, to, EdgeType.EXCEPTION, "throws " + exceptionType, null, exceptionType);
    }

    /**
     * Create a call edge
     */
    public static ImprovedCFGEdge createCall(int from, int to) {
        return new ImprovedCFGEdge(from, to, EdgeType.CALL, null, null, null);
    }

    /**
     * Create a return edge
     */
    public static ImprovedCFGEdge createReturn(int from, int to) {
        return new ImprovedCFGEdge(from, to, EdgeType.RETURN, null, null, null);
    }

    /**
     * Create a merge edge
     */
    public static ImprovedCFGEdge createMerge(int from, int to) {
        return new ImprovedCFGEdge(from, to, EdgeType.MERGE, null, null, null);
    }

    /**
     * Create a switch case edge
     */
    public static ImprovedCFGEdge createSwitchCase(int from, int to, String caseValue) {
        return new ImprovedCFGEdge(from, to, EdgeType.SWITCH_CASE, "case " + caseValue, null, null);
    }

    /**
     * Create a switch default edge
     */
    public static ImprovedCFGEdge createSwitchDefault(int from, int to) {
        return new ImprovedCFGEdge(from, to, EdgeType.SWITCH_DEFAULT, "default", null, null);
    }

    /**
     * Create a break edge
     */
    public static ImprovedCFGEdge createBreak(int from, int to) {
        return new ImprovedCFGEdge(from, to, EdgeType.BREAK, "break", null, null);
    }

    /**
     * Create a continue edge
     */
    public static ImprovedCFGEdge createContinue(int from, int to) {
        return new ImprovedCFGEdge(from, to, EdgeType.CONTINUE, "continue", null, null);
    }

    /**
     * Create a finally edge
     */
    public static ImprovedCFGEdge createFinally(int from, int to) {
        return new ImprovedCFGEdge(from, to, EdgeType.FINALLY, "finally", null, null);
    }

    // Utility methods

    /**
     * Check if this is a conditional edge
     */
    public boolean isConditional() {
        return type == EdgeType.BRANCH_TRUE || type == EdgeType.BRANCH_FALSE ||
               type == EdgeType.LOOP_ENTER || type == EdgeType.LOOP_EXIT ||
               type == EdgeType.SWITCH_CASE || type == EdgeType.SWITCH_DEFAULT;
    }

    /**
     * Check if this is a loop-related edge
     */
    public boolean isLoopEdge() {
        return type == EdgeType.LOOP_ENTER || type == EdgeType.LOOP_BACK || type == EdgeType.LOOP_EXIT;
    }

    /**
     * Check if this is an exception edge
     */
    public boolean isExceptionEdge() {
        return type == EdgeType.EXCEPTION;
    }

    /**
     * Check if this is a branch edge
     */
    public boolean isBranchEdge() {
        return type == EdgeType.BRANCH_TRUE || type == EdgeType.BRANCH_FALSE;
    }

    /**
     * Check if this edge carries data flow information
     */
    public boolean hasDataFlow() {
        return dataFlow != null && !dataFlow.isEmpty();
    }

    /**
     * Add a variable to the data flow
     */
    public void addDataFlow(String variable) {
        if (dataFlow == null) {
            dataFlow = new java.util.ArrayList<>();
        }
        if (!dataFlow.contains(variable)) {
            dataFlow.add(variable);
        }
    }

    /**
     * Set multiple variables for data flow
     */
    public void setDataFlow(List<String> variables) {
        this.dataFlow = variables;
    }

    /**
     * Get a compact string representation for debugging
     */
    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        sb.append("Edge{").append(from).append(" -> ").append(to)
          .append(", type=").append(type);

        if (label != null) {
            sb.append(", label='").append(label).append("'");
        }

        if (exceptionType != null) {
            sb.append(", exception=").append(exceptionType);
        }

        sb.append("}");
        return sb.toString();
    }
}