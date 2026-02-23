package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import lombok.NoArgsConstructor;

/**
 * Represents the entry point of a method in the control flow graph.
 * Every method has exactly one entry node where execution begins.
 */
@NoArgsConstructor
public class EntryNode extends CFGNode {
    
    /**
     * Constructor for EntryNode
     * 
     * @param nodeId Unique identifier for this node
     * @param methodName Name of the method this entry represents
     */
    public EntryNode(String nodeId, String methodName) {
        super(nodeId, CFGNodeType.ENTRY, 
              String.format("Method entry: %s", methodName), 
              null);
    }
    
    /**
     * Constructor for EntryNode with line number
     * 
     * @param nodeId Unique identifier for this node
     * @param methodName Name of the method this entry represents
     * @param lineNumber Line number where the method is declared
     */
    public EntryNode(String nodeId, String methodName, Integer lineNumber) {
        super(nodeId, CFGNodeType.ENTRY, 
              String.format("Method entry: %s", methodName), 
              lineNumber);
    }
}