package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Represents a method call in the control flow graph.
 * Contains information about the called method and enables interprocedural analysis.
 */
@Getter
@Setter
@NoArgsConstructor
public class CallNode extends CFGNode {
    
    /**
     * Name of the called method
     */
    private String methodName;
    
    /**
     * Name of the object on which the method is called (if applicable)
     */
    private String objectName;
    
    /**
     * Type of the object on which the method is called
     */
    private String objectType;
    
    /**
     * Parameter contents as a string
     */
    private String parameterContents;
    
    /**
     * Target method ID if resolution is possible (service:hash format)
     */
    private String targetMethodId;
    
    /**
     * Canonical ID of the target method if resolution is possible
     */
    private String targetMethodCanonicalId;
    
    /**
     * Constructor for CallNode
     * 
     * @param nodeId Unique identifier for this node
     * @param methodName Name of the called method
     * @param objectName Name of the object (optional)
     * @param objectType Type of the object (optional)
     * @param parameterContents Parameter contents as string
     */
    public CallNode(String nodeId, String methodName, String objectName, 
                   String objectType, String parameterContents) {
        super(nodeId, CFGNodeType.CALL, 
              generateDescription(objectName, methodName, parameterContents), 
              null);
        this.methodName = methodName;
        this.objectName = objectName;
        this.objectType = objectType;
        this.parameterContents = parameterContents;
        this.targetMethodId = null;
        this.targetMethodCanonicalId = null;
    }
    
    /**
     * Constructor for CallNode with line number
     * 
     * @param nodeId Unique identifier for this node
     * @param methodName Name of the called method
     * @param objectName Name of the object (optional)
     * @param objectType Type of the object (optional)
     * @param parameterContents Parameter contents as string
     * @param lineNumber Line number of the method call
     */
    public CallNode(String nodeId, String methodName, String objectName, 
                   String objectType, String parameterContents, Integer lineNumber) {
        super(nodeId, CFGNodeType.CALL, 
              generateDescription(objectName, methodName, parameterContents), 
              lineNumber);
        this.methodName = methodName;
        this.objectName = objectName;
        this.objectType = objectType;
        this.parameterContents = parameterContents;
        this.targetMethodId = null;
        this.targetMethodCanonicalId = null;
    }
    
    /**
     * Generate description based on call details
     * 
     * @param objectName Name of the object
     * @param methodName Name of the method
     * @param parameterContents Parameter contents
     * @return Generated description
     */
    private static String generateDescription(String objectName, String methodName, String parameterContents) {
        if (objectName != null && !objectName.trim().isEmpty()) {
            return String.format("Call %s.%s(%s)", objectName, methodName, 
                   parameterContents != null ? parameterContents : "");
        }
        return String.format("Call %s(%s)", methodName, 
               parameterContents != null ? parameterContents : "");
    }
    
    /**
     * Check if this call has been resolved to a target method
     * 
     * @return true if targetMethodId is not null
     */
    public boolean isResolved() {
        return targetMethodId != null;
    }
    
    /**
     * Check if this is a static method call (no object instance)
     * 
     * @return true if objectName is null or empty
     */
    public boolean isStaticCall() {
        return objectName == null || objectName.trim().isEmpty();
    }
    
    /**
     * Set the target method information after resolution
     * 
     * @param targetMethodId Service-scoped method ID
     * @param targetMethodCanonicalId Canonical method ID
     */
    public void setTargetMethod(String targetMethodId, String targetMethodCanonicalId) {
        this.targetMethodId = targetMethodId;
        this.targetMethodCanonicalId = targetMethodCanonicalId;
    }
}