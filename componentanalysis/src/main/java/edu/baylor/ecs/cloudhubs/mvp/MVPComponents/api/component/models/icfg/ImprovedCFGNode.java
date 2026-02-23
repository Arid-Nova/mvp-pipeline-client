package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Enhanced CFG node with rich semantic information, source location, and data flow tracking.
 * Extends the basic CFG node with detailed AST and analysis information.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder({"id", "type", "astType", "description", "sourceCode", "location", "dataFlow",
                   "methodCall", "branch", "loop", "exceptionInfo"})
public class ImprovedCFGNode {

    /**
     * Node types for CFG analysis
     */
    public enum NodeType {
        ENTRY,          // Method entry point
        EXIT,           // Method exit point
        STATEMENT,      // General statement
        CALL,           // Method call
        REMOTE_CALL,    // Remote service call (RestTemplate, WebClient, etc.)
        BRANCH,         // Conditional branch (if, switch)
        LOOP,           // Loop header
        MERGE,          // Control flow merge point
        EXPRESSION,     // Expression evaluation
        DECLARATION,    // Variable declaration
        ASSIGNMENT,     // Variable assignment
        EXCEPTION       // Exception handling
    }

    /**
     * Numeric ID (0-based index) for graph structure
     */
    private int id;

    /**
     * Semantic node type for analysis
     */
    private NodeType type;

    /**
     * AST node type from JavaParser (e.g., "MethodCallExpr", "IfStmt")
     */
    private String astType;

    /**
     * Human-readable description of the node
     */
    private String description;

    /**
     * Complete source code for this node (not truncated)
     */
    private String sourceCode;

    /**
     * Source code location for IDE integration
     */
    private SourceLocation location;

    /**
     * Data flow information (variables defined, used, modified)
     */
    private DataFlowInfo dataFlow;

    /**
     * Method call specific information (only for CALL nodes)
     */
    private MethodCallInfo methodCall;

    /**
     * Branch specific information (only for BRANCH nodes)
     */
    private BranchInfo branch;

    /**
     * Loop specific information (only for LOOP nodes)
     */
    private LoopInfo loop;

    /**
     * Exception handling information (only for EXCEPTION nodes)
     */
    private ExceptionInfo exceptionInfo;

    // Factory methods for creating specific node types

    /**
     * Create an entry node
     */
    public static ImprovedCFGNode createEntry(int id, String methodSignature, SourceLocation location) {
        ImprovedCFGNode node = new ImprovedCFGNode();
        node.setId(id);
        node.setType(NodeType.ENTRY);
        node.setAstType("MethodDeclaration");
        node.setDescription(methodSignature);
        node.setLocation(location);
        return node;
    }

    /**
     * Create an exit node
     */
    public static ImprovedCFGNode createExit(int id, String description, SourceLocation location) {
        ImprovedCFGNode node = new ImprovedCFGNode();
        node.setId(id);
        node.setType(NodeType.EXIT);
        node.setAstType("ReturnStmt");
        node.setDescription(description);
        node.setLocation(location);
        return node;
    }

    /**
     * Create a method call node
     */
    public static ImprovedCFGNode createCall(int id, String description, String astType,
                                           SourceLocation location, MethodCallInfo methodCallInfo) {
        ImprovedCFGNode node = new ImprovedCFGNode();
        node.setId(id);
        node.setType(NodeType.CALL);
        node.setAstType(astType);
        node.setDescription(description);
        node.setLocation(location);
        node.setMethodCall(methodCallInfo);
        return node;
    }

    /**
     * Create a remote service call node
     */
    public static ImprovedCFGNode createRemoteCall(int id, String description, String astType,
                                                 SourceLocation location, MethodCallInfo methodCallInfo) {
        ImprovedCFGNode node = new ImprovedCFGNode();
        node.setId(id);
        node.setType(NodeType.REMOTE_CALL);
        node.setAstType(astType);
        node.setDescription(description);
        node.setLocation(location);
        node.setMethodCall(methodCallInfo);
        return node;
    }

    /**
     * Create a branch node
     */
    public static ImprovedCFGNode createBranch(int id, String description, String astType,
                                             SourceLocation location, BranchInfo branchInfo) {
        ImprovedCFGNode node = new ImprovedCFGNode();
        node.setId(id);
        node.setType(NodeType.BRANCH);
        node.setAstType(astType);
        node.setDescription(description);
        node.setLocation(location);
        node.setBranch(branchInfo);
        return node;
    }

    /**
     * Create a loop node
     */
    public static ImprovedCFGNode createLoop(int id, String description, String astType,
                                           SourceLocation location, LoopInfo loopInfo) {
        ImprovedCFGNode node = new ImprovedCFGNode();
        node.setId(id);
        node.setType(NodeType.LOOP);
        node.setAstType(astType);
        node.setDescription(description);
        node.setLocation(location);
        node.setLoop(loopInfo);
        return node;
    }

    /**
     * Create a statement node
     */
    public static ImprovedCFGNode createStatement(int id, String description, String astType,
                                                SourceLocation location) {
        ImprovedCFGNode node = new ImprovedCFGNode();
        node.setId(id);
        node.setType(NodeType.STATEMENT);
        node.setAstType(astType);
        node.setDescription(description);
        node.setLocation(location);
        return node;
    }

    /**
     * Create an expression node
     */
    public static ImprovedCFGNode createExpression(int id, String description, String astType,
                                                 SourceLocation location) {
        ImprovedCFGNode node = new ImprovedCFGNode();
        node.setId(id);
        node.setType(NodeType.EXPRESSION);
        node.setAstType(astType);
        node.setDescription(description);
        node.setLocation(location);
        return node;
    }

    /**
     * Create a declaration node
     */
    public static ImprovedCFGNode createDeclaration(int id, String description, String astType,
                                                  SourceLocation location) {
        ImprovedCFGNode node = new ImprovedCFGNode();
        node.setId(id);
        node.setType(NodeType.DECLARATION);
        node.setAstType(astType);
        node.setDescription(description);
        node.setLocation(location);
        return node;
    }

    /**
     * Create an assignment node
     */
    public static ImprovedCFGNode createAssignment(int id, String description, String astType,
                                                 SourceLocation location) {
        ImprovedCFGNode node = new ImprovedCFGNode();
        node.setId(id);
        node.setType(NodeType.ASSIGNMENT);
        node.setAstType(astType);
        node.setDescription(description);
        node.setLocation(location);
        return node;
    }

    /**
     * Create a merge node
     */
    public static ImprovedCFGNode createMerge(int id, String description, SourceLocation location) {
        ImprovedCFGNode node = new ImprovedCFGNode();
        node.setId(id);
        node.setType(NodeType.MERGE);
        node.setAstType("MergePoint");
        node.setDescription(description);
        node.setLocation(location);
        return node;
    }

    /**
     * Create an exception node
     */
    public static ImprovedCFGNode createException(int id, String description, String astType,
                                                SourceLocation location, ExceptionInfo exceptionInfo) {
        ImprovedCFGNode node = new ImprovedCFGNode();
        node.setId(id);
        node.setType(NodeType.EXCEPTION);
        node.setAstType(astType);
        node.setDescription(description);
        node.setLocation(location);
        node.setExceptionInfo(exceptionInfo);
        return node;
    }

    /**
     * Create an exception node (backward compatibility - without ExceptionInfo)
     */
    public static ImprovedCFGNode createException(int id, String description, String astType,
                                                SourceLocation location) {
        return createException(id, description, astType, location, null);
    }

    // Utility methods

    /**
     * Check if this node represents a method call
     */
    public boolean isMethodCall() {
        return type == NodeType.CALL && methodCall != null;
    }

    /**
     * Check if this node represents a remote service call
     */
    public boolean isRemoteCall() {
        return type == NodeType.REMOTE_CALL && methodCall != null && methodCall.isRemoteCall();
    }

    /**
     * Check if this node represents a branch
     */
    public boolean isBranch() {
        return type == NodeType.BRANCH && branch != null;
    }

    /**
     * Check if this node represents a loop
     */
    public boolean isLoop() {
        return type == NodeType.LOOP && loop != null;
    }

    /**
     * Check if this node has data flow information
     */
    public boolean hasDataFlow() {
        return dataFlow != null && !dataFlow.isEmpty();
    }

    /**
     * Check if this node has source location information
     */
    public boolean hasLocation() {
        return location != null;
    }

    /**
     * Add data flow information if not present
     */
    public void ensureDataFlow() {
        if (dataFlow == null) {
            dataFlow = new DataFlowInfo();
        }
    }

    /**
     * Get a compact string representation for debugging
     */
    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        sb.append("Node{id=").append(id)
          .append(", type=").append(type)
          .append(", desc='").append(description).append("'");

        if (location != null) {
            sb.append(", loc=").append(location);
        }

        sb.append("}");
        return sb.toString();
    }
}