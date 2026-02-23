package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Represents the return point after a method call in the control flow graph.
 * This node represents where execution continues after a method call completes.
 */
@Getter
@Setter
@NoArgsConstructor
public class ReturnNode extends CFGNode {
    
    /**
     * ID of the corresponding call node
     */
    private String correspondingCallNodeId;
    
    /**
     * Name of the called method that this return corresponds to
     */
    private String calledMethodName;
    
    /**
     * Constructor for ReturnNode
     * 
     * @param nodeId Unique identifier for this node
     * @param correspondingCallNodeId ID of the corresponding call node
     * @param calledMethodName Name of the called method
     */
    public ReturnNode(String nodeId, String correspondingCallNodeId, String calledMethodName) {
        super(nodeId, CFGNodeType.RETURN, 
              String.format("Return from %s", calledMethodName), 
              null);
        this.correspondingCallNodeId = correspondingCallNodeId;
        this.calledMethodName = calledMethodName;
    }
    
    /**
     * Constructor for ReturnNode with line number
     * 
     * @param nodeId Unique identifier for this node
     * @param correspondingCallNodeId ID of the corresponding call node
     * @param calledMethodName Name of the called method
     * @param lineNumber Line number where the call was made
     */
    public ReturnNode(String nodeId, String correspondingCallNodeId, String calledMethodName, Integer lineNumber) {
        super(nodeId, CFGNodeType.RETURN, 
              String.format("Return from %s", calledMethodName), 
              lineNumber);
        this.correspondingCallNodeId = correspondingCallNodeId;
        this.calledMethodName = calledMethodName;
    }
}