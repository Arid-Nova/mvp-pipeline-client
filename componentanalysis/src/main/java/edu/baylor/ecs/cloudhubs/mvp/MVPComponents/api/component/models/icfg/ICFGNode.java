package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Simplified, flattened node representation for minimized ICFG output.
 * Uses numeric IDs and omits null fields for optimal JSON size.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder({"id", "type", "desc", "targetMethodId", "canonicalId", "objectName", 
                   "branchType", "condition", "var", "returnType"})
public class ICFGNode {
    
    /**
     * Numeric ID (0-based index) for minimal size
     */
    private int id;
    
    /**
     * Node type: "entry", "exit", "call", "branch", "statement"
     */
    private String type;
    
    /**
     * Compact description of the node
     */
    private String desc;
    
    // === Call node specific fields ===
    
    /**
     * Target method ID in service:hash format (for call nodes)
     */
    private String targetMethodId;
    
    /**
     * Canonical method signature (for call nodes)
     */
    private String canonicalId;
    
    /**
     * Object or class name the method is called on (for call nodes)
     */
    private String objectName;
    
    // === Branch node specific fields ===
    
    /**
     * Type of branch: IF, FOR, WHILE, etc. (for branch nodes)
     */
    private String branchType;
    
    /**
     * Branch condition expression (for branch nodes)
     */
    private String condition;
    
    /**
     * Loop variable name (for for-each loops)
     */
    private String var;
    
    // === Exit node specific fields ===
    
    /**
     * Return type: NORMAL, CONDITIONAL, EXCEPTION, DEFAULT (for exit nodes)
     */
    private String returnType;
    
    /**
     * Factory method for entry nodes
     */
    public static ICFGNode createEntry(int id, String methodSignature) {
        ICFGNode node = new ICFGNode();
        node.setId(id);
        node.setType("entry");
        node.setDesc(methodSignature);
        return node;
    }
    
    /**
     * Factory method for exit nodes
     */
    public static ICFGNode createExit(int id, String description, String returnType) {
        ICFGNode node = new ICFGNode();
        node.setId(id);
        node.setType("exit");
        node.setDesc(description);
        node.setReturnType(returnType);
        return node;
    }
    
    /**
     * Factory method for call nodes
     */
    public static ICFGNode createCall(int id, String description, String targetMethodId, 
                                     String canonicalId, String objectName) {
        ICFGNode node = new ICFGNode();
        node.setId(id);
        node.setType("call");
        node.setDesc(description);
        node.setTargetMethodId(targetMethodId);
        node.setCanonicalId(canonicalId);
        node.setObjectName(objectName);
        return node;
    }
    
    /**
     * Factory method for branch nodes
     */
    public static ICFGNode createBranch(int id, String description, String branchType, 
                                       String condition, String var) {
        ICFGNode node = new ICFGNode();
        node.setId(id);
        node.setType("branch");
        node.setDesc(description);
        node.setBranchType(branchType);
        node.setCondition(condition);
        node.setVar(var);
        return node;
    }
    
    /**
     * Factory method for statement nodes
     */
    public static ICFGNode createStatement(int id, String description) {
        ICFGNode node = new ICFGNode();
        node.setId(id);
        node.setType("statement");
        node.setDesc(description);
        return node;
    }
    
    /**
     * Factory method for expression nodes
     */
    public static ICFGNode createExpression(int id, String description) {
        ICFGNode node = new ICFGNode();
        node.setId(id);
        node.setType("expression");
        node.setDesc(description);
        return node;
    }
    
    /**
     * Factory method for merge nodes (control flow merge points)
     */
    public static ICFGNode createMerge(int id, String description) {
        ICFGNode node = new ICFGNode();
        node.setId(id);
        node.setType("merge");
        node.setDesc(description);
        return node;
    }
}