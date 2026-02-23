package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.stmt.*;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedComponent;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedMethod;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg.ICFGEdge;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg.ICFGNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg.MinimizedICFG;
import edu.university.ecs.lab.common.models.ir.Method;
import edu.university.ecs.lab.common.models.ir.MethodCall;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Generates control flow graphs from AST by traversing method declarations
 * and building nodes for branches, loops, and multiple return statements.
 */
public class ASTControlFlowGenerator extends VoidVisitorAdapter<ASTControlFlowGenerator.FlowContext> {
    
    private final MinimizedICFG icfg;
    private final Map<String, IndexedComponent> components;
    private final Map<MethodCall, String> methodCallTargets;
    private final Map<MethodCall, String> methodCallCanonicals;
    
    /**
     * Context for tracking control flow state during AST traversal
     */
    public static class FlowContext {
        public int currentNode;
        public List<Integer> breakNodes = new ArrayList<>();
        public List<Integer> continueNodes = new ArrayList<>();
        public List<Integer> exitNodes = new ArrayList<>();
        
        public FlowContext(int currentNode) {
            this.currentNode = currentNode;
        }
        
        public FlowContext copy() {
            FlowContext copy = new FlowContext(this.currentNode);
            copy.breakNodes = new ArrayList<>(this.breakNodes);
            copy.continueNodes = new ArrayList<>(this.continueNodes);
            copy.exitNodes = new ArrayList<>(this.exitNodes);
            return copy;
        }
    }
    
    public ASTControlFlowGenerator(MinimizedICFG icfg, Map<String, IndexedComponent> components) {
        this.icfg = icfg;
        this.components = components;
        this.methodCallTargets = new HashMap<>();
        this.methodCallCanonicals = new HashMap<>();
    }
    
    /**
     * Generate control flow for a method declaration
     */
    public void generateControlFlow(MethodDeclaration methodDecl, Method irMethod) {
        // Pre-resolve method call targets using IR data
        preResolveMethodCalls(irMethod);
        
        // Create initial context with entry node
        FlowContext context = new FlowContext(0); // Entry node is always index 0
        
        // Visit the method body
        if (methodDecl.getBody().isPresent()) {
            methodDecl.getBody().get().accept(this, context);
        }
        
        // If no explicit exits were created, add a default exit
        if (context.exitNodes.isEmpty()) {
            int defaultExit = icfg.addNode(ICFGNode.createExit(0, "return", "DEFAULT"));
            icfg.addExitNodeIndex(defaultExit);
            icfg.addEdge(ICFGEdge.createSequential(context.currentNode, defaultExit));
        }
    }
    
    /**
     * Pre-resolve method call targets from IR data
     */
    private void preResolveMethodCalls(Method irMethod) {
        for (MethodCall methodCall : irMethod.getMethodCalls()) {
            // Resolve target and canonical IDs
            String targetId = resolveTargetMethodId(methodCall);
            String canonicalId = resolveCanonicalId(methodCall, targetId);
            
            methodCallTargets.put(methodCall, targetId);
            methodCallCanonicals.put(methodCall, canonicalId);
        }
    }
    
    @Override
    public void visit(BlockStmt block, FlowContext context) {
        for (Statement stmt : block.getStatements()) {
            stmt.accept(this, context);
        }
    }
    
    @Override
    public void visit(ExpressionStmt exprStmt, FlowContext context) {
        // Handle method call expressions
        if (exprStmt.getExpression() instanceof MethodCallExpr) {
            MethodCallExpr callExpr = (MethodCallExpr) exprStmt.getExpression();
            int callNode = createCallNode(callExpr);
            
            // Connect to current node
            icfg.addEdge(ICFGEdge.createSequential(context.currentNode, callNode));
            context.currentNode = callNode;
        }
        // Handle other expressions (assignments, etc.)
        else {
            // Create a generic expression node
            int exprNode = icfg.addNode(ICFGNode.createExpression(0,
                exprStmt.getExpression().toString()));
            icfg.addEdge(ICFGEdge.createSequential(context.currentNode, exprNode));
            context.currentNode = exprNode;
        }
    }
    
    @Override
    public void visit(IfStmt ifStmt, FlowContext context) {
        // Create branch node
        String condition = ifStmt.getCondition().toString();
        int branchNode = icfg.addNode(ICFGNode.createBranch(0, 
            "if (" + condition + ")", "IF", condition, null));
        
        // Connect current to branch
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, branchNode));
        
        // Create contexts for then and else branches
        FlowContext thenContext = context.copy();
        thenContext.currentNode = branchNode;
        
        FlowContext elseContext = context.copy();
        elseContext.currentNode = branchNode;
        
        // Visit then branch
        ifStmt.getThenStmt().accept(this, thenContext);
        
        // Visit else branch if present
        if (ifStmt.getElseStmt().isPresent()) {
            ifStmt.getElseStmt().get().accept(this, elseContext);
        }
        
        // Handle branch connections properly
        boolean thenExited = hasExited(thenContext);
        boolean elseExited = hasExited(elseContext);
        boolean hasElse = ifStmt.getElseStmt().isPresent();
        
        // Always connect the true branch
        icfg.addEdge(ICFGEdge.createBranch(branchNode, thenContext.currentNode, "TRUE"));
        
        // Create merge node only if at least one branch continues
        if (!thenExited || (!elseExited && hasElse) || !hasElse) {
            int mergeNode = icfg.addNode(ICFGNode.createMerge(0, "merge"));
            
            // Connect then branch to merge if it doesn't exit
            if (!thenExited) {
                icfg.addEdge(ICFGEdge.createSequential(thenContext.currentNode, mergeNode));
            }
            
            // Handle else branch
            if (hasElse) {
                icfg.addEdge(ICFGEdge.createBranch(branchNode, elseContext.currentNode, "FALSE"));
                if (!elseExited) {
                    icfg.addEdge(ICFGEdge.createSequential(elseContext.currentNode, mergeNode));
                }
            } else {
                // No else block, false branch goes directly to merge
                icfg.addEdge(ICFGEdge.createBranch(branchNode, mergeNode, "FALSE"));
            }
            
            context.currentNode = mergeNode;
        } else {
            // Both branches exit, handle else connection
            if (hasElse) {
                icfg.addEdge(ICFGEdge.createBranch(branchNode, elseContext.currentNode, "FALSE"));
            }
            // No merge needed, both paths end
        }
        
        // Merge exit nodes
        context.exitNodes.addAll(thenContext.exitNodes);
        context.exitNodes.addAll(elseContext.exitNodes);
    }
    
    @Override
    public void visit(ForEachStmt forEachStmt, FlowContext context) {
        // Create loop header node for enhanced for loop
        String iterableExpr = forEachStmt.getIterable().toString();
        String variable = forEachStmt.getVariable().toString();
        int loopNode = icfg.addNode(ICFGNode.createBranch(0, 
            "for (" + variable + " : " + iterableExpr + ")", "LOOP", 
            "hasNext(" + iterableExpr + ")", variable));
        
        // Connect current to loop
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, loopNode));
        
        // Create loop body context
        FlowContext bodyContext = context.copy();
        bodyContext.currentNode = loopNode;
        bodyContext.continueNodes.clear();
        bodyContext.breakNodes.clear();
        
        // Visit loop body
        forEachStmt.getBody().accept(this, bodyContext);
        
        // Create exit merge node
        int exitNode = icfg.addNode(ICFGNode.createMerge(0, "loop-exit"));
        
        // Connect loop to body (true) and to exit (false)
        icfg.addEdge(ICFGEdge.createBranch(loopNode, bodyContext.currentNode, "TRUE"));
        icfg.addEdge(ICFGEdge.createBranch(loopNode, exitNode, "FALSE"));
        
        // Connect body back to loop (if no break/return)
        if (!hasExited(bodyContext) && bodyContext.breakNodes.isEmpty()) {
            icfg.addEdge(ICFGEdge.createSequential(bodyContext.currentNode, loopNode));
        }
        
        // Handle break statements
        for (int breakNode : bodyContext.breakNodes) {
            icfg.addEdge(ICFGEdge.createSequential(breakNode, exitNode));
        }
        
        // Handle continue statements
        for (int continueNode : bodyContext.continueNodes) {
            icfg.addEdge(ICFGEdge.createSequential(continueNode, loopNode));
        }
        
        context.currentNode = exitNode;
        context.exitNodes.addAll(bodyContext.exitNodes);
    }
    
    @Override
    public void visit(ForStmt forStmt, FlowContext context) {
        // Create loop header node
        String condition = forStmt.getCompare().map(Object::toString).orElse("true");
        int loopNode = icfg.addNode(ICFGNode.createBranch(0, 
            "for (" + condition + ")", "LOOP", condition, null));
        
        // Connect current to loop
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, loopNode));
        
        // Create loop body context
        FlowContext bodyContext = context.copy();
        bodyContext.currentNode = loopNode;
        bodyContext.continueNodes.clear(); // Clear continue nodes for this loop
        bodyContext.breakNodes.clear(); // Clear break nodes for this loop
        
        // Visit loop body
        forStmt.getBody().accept(this, bodyContext);
        
        // Create exit merge node
        int exitNode = icfg.addNode(ICFGNode.createMerge(0, "loop-exit"));
        
        // Connect loop to body (true) and to exit (false)
        icfg.addEdge(ICFGEdge.createBranch(loopNode, bodyContext.currentNode, "TRUE"));
        icfg.addEdge(ICFGEdge.createBranch(loopNode, exitNode, "FALSE"));
        
        // Connect body back to loop (if no break/return)
        if (!hasExited(bodyContext) && bodyContext.breakNodes.isEmpty()) {
            icfg.addEdge(ICFGEdge.createSequential(bodyContext.currentNode, loopNode));
        }
        
        // Handle break statements
        for (int breakNode : bodyContext.breakNodes) {
            icfg.addEdge(ICFGEdge.createSequential(breakNode, exitNode));
        }
        
        // Handle continue statements
        for (int continueNode : bodyContext.continueNodes) {
            icfg.addEdge(ICFGEdge.createSequential(continueNode, loopNode));
        }
        
        context.currentNode = exitNode;
        context.exitNodes.addAll(bodyContext.exitNodes);
    }
    
    @Override
    public void visit(WhileStmt whileStmt, FlowContext context) {
        // Similar to for loop but simpler
        String condition = whileStmt.getCondition().toString();
        int loopNode = icfg.addNode(ICFGNode.createBranch(0, 
            "while (" + condition + ")", "LOOP", condition, null));
        
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, loopNode));
        
        FlowContext bodyContext = context.copy();
        bodyContext.currentNode = loopNode;
        bodyContext.continueNodes.clear();
        bodyContext.breakNodes.clear();
        
        whileStmt.getBody().accept(this, bodyContext);
        
        int exitNode = icfg.addNode(ICFGNode.createMerge(0, "loop-exit"));
        
        icfg.addEdge(ICFGEdge.createBranch(loopNode, bodyContext.currentNode, "TRUE"));
        icfg.addEdge(ICFGEdge.createBranch(loopNode, exitNode, "FALSE"));
        
        if (!hasExited(bodyContext) && bodyContext.breakNodes.isEmpty()) {
            icfg.addEdge(ICFGEdge.createSequential(bodyContext.currentNode, loopNode));
        }
        
        for (int breakNode : bodyContext.breakNodes) {
            icfg.addEdge(ICFGEdge.createSequential(breakNode, exitNode));
        }
        
        for (int continueNode : bodyContext.continueNodes) {
            icfg.addEdge(ICFGEdge.createSequential(continueNode, loopNode));
        }
        
        context.currentNode = exitNode;
        context.exitNodes.addAll(bodyContext.exitNodes);
    }
    
    @Override
    public void visit(ReturnStmt returnStmt, FlowContext context) {
        String returnValue = returnStmt.getExpression()
            .map(Object::toString).orElse("void");
        
        int exitNode = icfg.addNode(ICFGNode.createExit(0, 
            "return " + returnValue, "EXPLICIT"));
        
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, exitNode));
        icfg.addExitNodeIndex(exitNode);
        
        context.exitNodes.add(exitNode);
        context.currentNode = exitNode; // This path ends here
    }
    
    @Override
    public void visit(BreakStmt breakStmt, FlowContext context) {
        int breakNode = icfg.addNode(ICFGNode.createExpression(0, "break"));
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, breakNode));
        context.breakNodes.add(breakNode);
        context.currentNode = breakNode;
    }
    
    @Override
    public void visit(ContinueStmt continueStmt, FlowContext context) {
        int continueNode = icfg.addNode(ICFGNode.createExpression(0, "continue"));
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, continueNode));
        context.continueNodes.add(continueNode);
        context.currentNode = continueNode;
    }
    
    // Missing edge cases - adding them now:
    
    @Override
    public void visit(DoStmt doStmt, FlowContext context) {
        // Create loop body node first (do-while executes body first)
        FlowContext bodyContext = context.copy();
        bodyContext.continueNodes.clear();
        bodyContext.breakNodes.clear();
        
        // Visit body first
        doStmt.getBody().accept(this, bodyContext);
        
        // Create condition node
        String condition = doStmt.getCondition().toString();
        int conditionNode = icfg.addNode(ICFGNode.createBranch(0, 
            "while (" + condition + ")", "LOOP", condition, null));
        
        // Connect current to body, body to condition
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, bodyContext.currentNode));
        if (!hasExited(bodyContext)) {
            icfg.addEdge(ICFGEdge.createSequential(bodyContext.currentNode, conditionNode));
        }
        
        // Create exit node
        int exitNode = icfg.addNode(ICFGNode.createMerge(0, "loop-exit"));
        
        // Condition: true goes back to body, false exits
        icfg.addEdge(ICFGEdge.createBranch(conditionNode, bodyContext.currentNode, "TRUE"));
        icfg.addEdge(ICFGEdge.createBranch(conditionNode, exitNode, "FALSE"));
        
        // Handle break statements
        for (int breakNode : bodyContext.breakNodes) {
            icfg.addEdge(ICFGEdge.createSequential(breakNode, exitNode));
        }
        
        // Handle continue statements
        for (int continueNode : bodyContext.continueNodes) {
            icfg.addEdge(ICFGEdge.createSequential(continueNode, conditionNode));
        }
        
        context.currentNode = exitNode;
        context.exitNodes.addAll(bodyContext.exitNodes);
    }
    
    @Override
    public void visit(SwitchStmt switchStmt, FlowContext context) {
        // Create switch node
        String selector = switchStmt.getSelector().toString();
        int switchNode = icfg.addNode(ICFGNode.createBranch(0, 
            "switch (" + selector + ")", "SWITCH", "switch", null));
        
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, switchNode));
        
        // Create merge node for after switch
        int mergeNode = icfg.addNode(ICFGNode.createMerge(0, "switch-exit"));
        
        // Track if we have a default case
        boolean hasDefault = false;
        
        // Process each case
        for (SwitchEntry entry : switchStmt.getEntries()) {
            FlowContext caseContext = context.copy();
            caseContext.currentNode = switchNode;
            caseContext.breakNodes.clear();
            
            // Create case node
            String caseLabel = entry.getLabels().isEmpty() ? "default" : 
                entry.getLabels().stream().map(Object::toString).reduce((a, b) -> a + ", " + b).orElse("");
            
            if (entry.getLabels().isEmpty()) {
                hasDefault = true;
            }
            
            int caseNode = icfg.addNode(ICFGNode.createExpression(0, "case " + caseLabel + ":"));
            icfg.addEdge(ICFGEdge.createBranch(switchNode, caseNode, caseLabel));
            caseContext.currentNode = caseNode;
            
            // Visit case statements
            for (Statement stmt : entry.getStatements()) {
                stmt.accept(this, caseContext);
            }
            
            // Connect case end to merge (if no break)
            if (!hasExited(caseContext) && caseContext.breakNodes.isEmpty()) {
                icfg.addEdge(ICFGEdge.createSequential(caseContext.currentNode, mergeNode));
            }
            
            // Handle break statements
            for (int breakNode : caseContext.breakNodes) {
                icfg.addEdge(ICFGEdge.createSequential(breakNode, mergeNode));
            }
            
            context.exitNodes.addAll(caseContext.exitNodes);
        }
        
        // If no default case, connect switch directly to merge
        if (!hasDefault) {
            icfg.addEdge(ICFGEdge.createBranch(switchNode, mergeNode, "default"));
        }
        
        context.currentNode = mergeNode;
    }
    
    @Override
    public void visit(TryStmt tryStmt, FlowContext context) {
        // Create try node
        int tryNode = icfg.addNode(ICFGNode.createExpression(0, "try"));
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, tryNode));
        
        // Visit try block
        FlowContext tryContext = context.copy();
        tryContext.currentNode = tryNode;
        tryStmt.getTryBlock().accept(this, tryContext);
        
        // Create merge node for after try-catch
        int mergeNode = icfg.addNode(ICFGNode.createMerge(0, "try-catch-exit"));
        
        // Connect successful try execution to merge
        if (!hasExited(tryContext)) {
            icfg.addEdge(ICFGEdge.createSequential(tryContext.currentNode, mergeNode));
        }
        
        // Process catch clauses
        for (CatchClause catchClause : tryStmt.getCatchClauses()) {
            FlowContext catchContext = context.copy();
            catchContext.currentNode = tryNode;
            
            String exceptionType = catchClause.getParameter().getType().toString();
            int catchNode = icfg.addNode(ICFGNode.createExpression(0, "catch (" + exceptionType + ")"));
            icfg.addEdge(ICFGEdge.createBranch(tryNode, catchNode, "throws " + exceptionType));
            
            catchContext.currentNode = catchNode;
            catchClause.getBody().accept(this, catchContext);
            
            // Connect catch end to merge
            if (!hasExited(catchContext)) {
                icfg.addEdge(ICFGEdge.createSequential(catchContext.currentNode, mergeNode));
            }
            
            context.exitNodes.addAll(catchContext.exitNodes);
        }
        
        // Process finally block if present
        if (tryStmt.getFinallyBlock().isPresent()) {
            FlowContext finallyContext = context.copy();
            finallyContext.currentNode = mergeNode;
            
            int finallyNode = icfg.addNode(ICFGNode.createExpression(0, "finally"));
            icfg.addEdge(ICFGEdge.createSequential(mergeNode, finallyNode));
            
            finallyContext.currentNode = finallyNode;
            tryStmt.getFinallyBlock().get().accept(this, finallyContext);
            
            context.currentNode = finallyContext.currentNode;
            context.exitNodes.addAll(finallyContext.exitNodes);
        } else {
            context.currentNode = mergeNode;
        }
        
        context.exitNodes.addAll(tryContext.exitNodes);
    }
    
    @Override
    public void visit(ThrowStmt throwStmt, FlowContext context) {
        String throwExpr = throwStmt.getExpression().toString();
        int throwNode = icfg.addNode(ICFGNode.createExit(0, 
            "throw " + throwExpr, "EXCEPTION"));
        
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, throwNode));
        icfg.addExitNodeIndex(throwNode);
        
        context.exitNodes.add(throwNode);
        context.currentNode = throwNode; // This path ends here
    }
    
    @Override
    public void visit(SynchronizedStmt syncStmt, FlowContext context) {
        String monitor = syncStmt.getExpression().toString();
        int syncNode = icfg.addNode(ICFGNode.createExpression(0, "synchronized (" + monitor + ")"));
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, syncNode));
        
        // Visit synchronized block
        FlowContext syncContext = context.copy();
        syncContext.currentNode = syncNode;
        syncStmt.getBody().accept(this, syncContext);
        
        context.currentNode = syncContext.currentNode;
        context.exitNodes.addAll(syncContext.exitNodes);
    }
    
    // Additional edge cases that might be missed:
    
    @Override
    public void visit(LabeledStmt labeledStmt, FlowContext context) {
        // Create label node
        int labelNode = icfg.addNode(ICFGNode.createExpression(0, labeledStmt.getLabel().asString() + ":"));
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, labelNode));
        
        // Visit labeled statement
        FlowContext labelContext = context.copy();
        labelContext.currentNode = labelNode;
        labeledStmt.getStatement().accept(this, labelContext);
        
        context.currentNode = labelContext.currentNode;
        context.exitNodes.addAll(labelContext.exitNodes);
    }
    
    @Override
    public void visit(AssertStmt assertStmt, FlowContext context) {
        String condition = assertStmt.getCheck().toString();
        String message = assertStmt.getMessage().map(expr -> " : " + expr.toString()).orElse("");
        
        int assertNode = icfg.addNode(ICFGNode.createExpression(0, "assert " + condition + message));
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, assertNode));
        
        context.currentNode = assertNode;
    }
    
    @Override  
    public void visit(EmptyStmt emptyStmt, FlowContext context) {
        // Empty statements don't create nodes, just continue
        // This handles things like extra semicolons
    }
    
    @Override
    public void visit(LocalClassDeclarationStmt localClassStmt, FlowContext context) {
        // Local class declarations don't affect control flow
        int classNode = icfg.addNode(ICFGNode.createExpression(0, 
            "local class " + localClassStmt.getClassDeclaration().getNameAsString()));
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, classNode));
        context.currentNode = classNode;
    }
    
    @Override
    public void visit(LocalRecordDeclarationStmt localRecordStmt, FlowContext context) {
        // Local record declarations don't affect control flow  
        int recordNode = icfg.addNode(ICFGNode.createExpression(0,
            "local record " + localRecordStmt.getRecordDeclaration().getNameAsString()));
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, recordNode));
        context.currentNode = recordNode;
    }
    
    @Override
    public void visit(YieldStmt yieldStmt, FlowContext context) {
        String yieldExpr = yieldStmt.getExpression().toString();
        int yieldNode = icfg.addNode(ICFGNode.createExit(0, 
            "yield " + yieldExpr, "YIELD"));
        
        icfg.addEdge(ICFGEdge.createSequential(context.currentNode, yieldNode));
        icfg.addExitNodeIndex(yieldNode);
        
        context.exitNodes.add(yieldNode);
        context.currentNode = yieldNode;
    }
    
    /**
     * Create a call node from a method call expression
     */
    private int createCallNode(MethodCallExpr callExpr) {
        // Try to match with pre-resolved method calls
        MethodCall matchedCall = findMatchingMethodCall(callExpr);
        
        String targetId = null;
        String canonicalId = null;
        String objectName = "";
        
        if (matchedCall != null) {
            targetId = methodCallTargets.get(matchedCall);
            canonicalId = methodCallCanonicals.get(matchedCall);
            objectName = matchedCall.getObjectName() != null ? matchedCall.getObjectName() : "";
        }
        
        // Generate description
        String desc = callExpr.toString();
        if (desc.length() > 50) {
            desc = desc.substring(0, 47) + "...";
        }
        
        return icfg.addNode(ICFGNode.createCall(0, desc, targetId, canonicalId, objectName));
    }
    
    /**
     * Find matching method call from IR data
     */
    private MethodCall findMatchingMethodCall(MethodCallExpr callExpr) {
        String methodName = callExpr.getNameAsString();
        
        for (MethodCall methodCall : methodCallTargets.keySet()) {
            if (methodName.equals(methodCall.getName())) {
                return methodCall;
            }
        }
        return null;
    }
    
    /**
     * Check if context has exited (has return statements)
     */
    private boolean hasExited(FlowContext context) {
        return !context.exitNodes.isEmpty();
    }
    
    /**
     * Resolve target method ID (simplified - could use IndexerService logic)
     */
    private String resolveTargetMethodId(MethodCall methodCall) {
        if (methodCall.getTargetMethodId() != null) {
            return methodCall.getTargetMethodId();
        }
        
        // Simple lookup by method name
        String methodName = methodCall.getName();
        for (IndexedComponent component : components.values()) {
            if (component instanceof IndexedMethod) {
                IndexedMethod indexedMethod = (IndexedMethod) component;
                if (methodName.equals(indexedMethod.getName())) {
                    return indexedMethod.getId();
                }
            }
        }
        return null;
    }
    
    /**
     * Resolve canonical ID from target method
     */
    private String resolveCanonicalId(MethodCall methodCall, String targetMethodId) {
        if (methodCall.getTargetMethodCanonicalId() != null) {
            return methodCall.getTargetMethodCanonicalId();
        }
        
        if (targetMethodId != null) {
            IndexedComponent component = components.get(targetMethodId);
            if (component instanceof IndexedMethod) {
                return ((IndexedMethod) component).getFullID();
            }
        }
        return null;
    }
}