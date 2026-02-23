package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Enhanced Interprocedural Control Flow Graph with rich semantic information.
 * Uses improved nodes and edges with source locations, data flow, and detailed control structure analysis.
 */
@Getter
@Setter
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder({"methodId", "entryNodeIndex", "exitNodeIndices", "nodes", "edges",
                   "exceptionFlow", "loopStructure", "dataFlowSummary"})
public class EnhancedICFG {

    /**
     * ID of the method this ICFG represents
     */
    private String methodId;

    /**
     * Index of the entry node (typically 0)
     */
    private int entryNodeIndex;

    /**
     * Indices of all exit nodes (multiple returns/throws)
     */
    private List<Integer> exitNodeIndices;

    /**
     * All nodes in the control flow graph
     */
    private List<ImprovedCFGNode> nodes;

    /**
     * All edges connecting the nodes
     */
    private List<ImprovedCFGEdge> edges;

    /**
     * Exception flow information
     */
    private List<ExceptionFlow> exceptionFlow;

    /**
     * Loop structure information
     */
    private List<LoopStructure> loopStructure;

    /**
     * High-level data flow summary
     */
    private DataFlowSummary dataFlowSummary;

    /**
     * Exception flow entry
     */
    @Getter
    @Setter
    @NoArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ExceptionFlow {
        private List<Integer> sourceNodes;  // Nodes that can throw
        private int handlerNode;            // Catch handler node
        private String exceptionType;       // Exception type

        public ExceptionFlow(List<Integer> sourceNodes, int handlerNode, String exceptionType) {
            this.sourceNodes = sourceNodes;
            this.handlerNode = handlerNode;
            this.exceptionType = exceptionType;
        }
    }

    /**
     * Loop structure entry
     */
    @Getter
    @Setter
    @NoArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class LoopStructure {
        private int header;                 // Loop header node
        private List<Integer> body;         // Loop body nodes
        private List<Integer> exits;        // Loop exit nodes
        private LoopInfo.LoopType type;     // Loop type

        public LoopStructure(int header, List<Integer> body, List<Integer> exits, LoopInfo.LoopType type) {
            this.header = header;
            this.body = body;
            this.exits = exits;
            this.type = type;
        }
    }

    /**
     * Data flow summary for the entire method
     */
    @Getter
    @Setter
    @NoArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class DataFlowSummary {
        private List<String> parameters;    // Method parameters
        private List<String> localVars;     // Local variables declared
        private List<String> modifiedVars;  // Variables modified in method
        private List<String> returnVars;    // Variables used in return statements

        public DataFlowSummary(List<String> parameters, List<String> localVars,
                              List<String> modifiedVars, List<String> returnVars) {
            this.parameters = parameters;
            this.localVars = localVars;
            this.modifiedVars = modifiedVars;
            this.returnVars = returnVars;
        }
    }

    /**
     * Constructor
     */
    public EnhancedICFG(String methodId) {
        this.methodId = methodId;
        this.entryNodeIndex = 0;
        this.exitNodeIndices = new ArrayList<>();
        this.nodes = new ArrayList<>();
        this.edges = new ArrayList<>();
        this.exceptionFlow = new ArrayList<>();
        this.loopStructure = new ArrayList<>();
    }

    /**
     * Add a node and return its index
     */
    public int addNode(ImprovedCFGNode node) {
        if (nodes == null) {
            nodes = new ArrayList<>();
        }
        int index = nodes.size();
        node.setId(index);
        nodes.add(node);
        return index;
    }

    /**
     * Add an edge
     */
    public void addEdge(ImprovedCFGEdge edge) {
        if (edges == null) {
            edges = new ArrayList<>();
        }
        edges.add(edge);
    }

    /**
     * Add an exit node index
     */
    public void addExitNodeIndex(int index) {
        if (exitNodeIndices == null) {
            exitNodeIndices = new ArrayList<>();
        }
        exitNodeIndices.add(index);
    }

    /**
     * Add exception flow information
     */
    public void addExceptionFlow(List<Integer> sourceNodes, int handlerNode, String exceptionType) {
        if (exceptionFlow == null) {
            exceptionFlow = new ArrayList<>();
        }
        exceptionFlow.add(new ExceptionFlow(sourceNodes, handlerNode, exceptionType));
    }

    /**
     * Add loop structure information
     */
    public void addLoopStructure(int header, List<Integer> body, List<Integer> exits, LoopInfo.LoopType type) {
        if (loopStructure == null) {
            loopStructure = new ArrayList<>();
        }
        loopStructure.add(new LoopStructure(header, body, exits, type));
    }

    /**
     * Set data flow summary
     */
    public void setDataFlowSummary(List<String> parameters, List<String> localVars,
                                  List<String> modifiedVars, List<String> returnVars) {
        this.dataFlowSummary = new DataFlowSummary(parameters, localVars, modifiedVars, returnVars);
    }

    /**
     * Get node by index
     */
    public ImprovedCFGNode getNode(int index) {
        if (nodes != null && index >= 0 && index < nodes.size()) {
            return nodes.get(index);
        }
        return null;
    }

    /**
     * Get all edges from a specific node
     */
    @JsonIgnore
    public List<ImprovedCFGEdge> getEdgesFrom(int nodeIndex) {
        List<ImprovedCFGEdge> result = new ArrayList<>();
        if (edges != null) {
            for (ImprovedCFGEdge edge : edges) {
                if (edge.getFrom() == nodeIndex) {
                    result.add(edge);
                }
            }
        }
        return result;
    }

    /**
     * Get all edges to a specific node
     */
    @JsonIgnore
    public List<ImprovedCFGEdge> getEdgesTo(int nodeIndex) {
        List<ImprovedCFGEdge> result = new ArrayList<>();
        if (edges != null) {
            for (ImprovedCFGEdge edge : edges) {
                if (edge.getTo() == nodeIndex) {
                    result.add(edge);
                }
            }
        }
        return result;
    }

    /**
     * Get node count
     */
    @JsonIgnore
    public int getNodeCount() {
        return nodes != null ? nodes.size() : 0;
    }

    /**
     * Get edge count
     */
    @JsonIgnore
    public int getEdgeCount() {
        return edges != null ? edges.size() : 0;
    }

    /**
     * Check if empty
     */
    @JsonIgnore
    public boolean isEmpty() {
        return getNodeCount() == 0;
    }

    /**
     * Get all method call nodes
     */
    @JsonIgnore
    public List<ImprovedCFGNode> getMethodCallNodes() {
        List<ImprovedCFGNode> calls = new ArrayList<>();
        if (nodes != null) {
            for (ImprovedCFGNode node : nodes) {
                if (node.isMethodCall()) {
                    calls.add(node);
                }
            }
        }
        return calls;
    }

    /**
     * Get all branch nodes
     */
    @JsonIgnore
    public List<ImprovedCFGNode> getBranchNodes() {
        List<ImprovedCFGNode> branches = new ArrayList<>();
        if (nodes != null) {
            for (ImprovedCFGNode node : nodes) {
                if (node.isBranch()) {
                    branches.add(node);
                }
            }
        }
        return branches;
    }

    /**
     * Get all loop nodes
     */
    @JsonIgnore
    public List<ImprovedCFGNode> getLoopNodes() {
        List<ImprovedCFGNode> loops = new ArrayList<>();
        if (nodes != null) {
            for (ImprovedCFGNode node : nodes) {
                if (node.isLoop()) {
                    loops.add(node);
                }
            }
        }
        return loops;
    }

    /**
     * Build a quick lookup map of variables to nodes that define them
     */
    @JsonIgnore
    public Map<String, List<Integer>> getVariableDefinitions() {
        Map<String, List<Integer>> defs = new HashMap<>();
        if (nodes != null) {
            for (ImprovedCFGNode node : nodes) {
                if (node.hasDataFlow() && node.getDataFlow().hasDefinitions()) {
                    for (String var : node.getDataFlow().getDefines()) {
                        defs.computeIfAbsent(var, unused -> new ArrayList<>()).add(node.getId());
                    }
                }
            }
        }
        return defs;
    }

    /**
     * Build a quick lookup map of variables to nodes that use them
     */
    @JsonIgnore
    public Map<String, List<Integer>> getVariableUses() {
        Map<String, List<Integer>> uses = new HashMap<>();
        if (nodes != null) {
            for (ImprovedCFGNode node : nodes) {
                if (node.hasDataFlow() && node.getDataFlow().hasUses()) {
                    for (String var : node.getDataFlow().getUses()) {
                        uses.computeIfAbsent(var, unused -> new ArrayList<>()).add(node.getId());
                    }
                }
            }
        }
        return uses;
    }
}