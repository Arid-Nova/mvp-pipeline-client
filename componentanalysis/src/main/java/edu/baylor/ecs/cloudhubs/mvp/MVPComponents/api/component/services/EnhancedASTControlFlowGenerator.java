package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedField;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedMethod;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedComponent;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils.EndpointMatchResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils.EndpointPatternIndex;

import edu.university.ecs.lab.common.models.ir.Method;
import edu.university.ecs.lab.common.models.ir.MethodCall;

import java.util.*;

import static edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services.RemoteCallDetector.analyzeMethodCall;

/**
 * Enhanced control flow generator that creates rich CFGs with source locations,
 * data flow information, and accurate method resolution.
 * Never falls back to sequential flow - parses all constructs comprehensively.
 */
public class EnhancedASTControlFlowGenerator extends VoidVisitorAdapter<EnhancedASTControlFlowGenerator.EnhancedFlowContext> {

    private final EnhancedICFG icfg;
    private final Map<String, IndexedComponent> components;
    private final EndpointPatternIndex patternIndex;
    private final Map<MethodCall, String> methodCallTargets;
    private final Map<MethodCall, String> methodCallCanonicals;
    private final Set<String> declaredVariables;
    private final List<String> methodParameters;

    /**
     * Information about a URL constructed from variables and string literals.
     * Used to track service names and endpoint paths through variable assignments.
     */
    public static class UrlInfo {
        public final String service;      // Service name (e.g., "ts-user-service")
        public final String path;          // Endpoint path (e.g., "/api/v1/userservice/users")
        public final String fullUrl;       // Combined service+path if available

        public UrlInfo(String service, String path) {
            this.service = service;
            this.path = path;
            this.fullUrl = (service != null && path != null) ? service + path : null;
        }

        public UrlInfo(String service, String path, String fullUrl) {
            this.service = service;
            this.path = path;
            this.fullUrl = fullUrl;
        }
    }

    /**
     * Tracks URL information assigned under specific conditions (e.g., in if/else branches).
     * Used for path-sensitive analysis of remote call URL resolution.
     */
    public static class ConditionalUrlInfo {
        public final String condition;       // Branch condition (e.g., "info.getTripId().startsWith(\"G\")")
        public final UrlInfo urlInfo;        // URL information for this path
        public final int assignmentNodeId;   // Node ID where this assignment happens

        public ConditionalUrlInfo(String condition, UrlInfo urlInfo, int assignmentNodeId) {
            this.condition = condition;
            this.urlInfo = urlInfo;
            this.assignmentNodeId = assignmentNodeId;
        }
    }

    /**
     * Enhanced context for tracking control flow state during AST traversal
     */
    public static class EnhancedFlowContext {
        public int currentNode;
        public List<Integer> breakNodes = new ArrayList<>();
        public List<Integer> continueNodes = new ArrayList<>();
        public List<Integer> exitNodes = new ArrayList<>();
        public Set<String> availableVariables = new HashSet<>();
        public List<Integer> exceptionSources = new ArrayList<>(); // Nodes that can throw exceptions
        public Map<String, String> variableToService = new HashMap<>(); // Maps variable names to service names from service discovery calls
        public Map<String, UrlInfo> variableToUrl = new HashMap<>(); // Maps variable names to URL information (service + path)

        // Track variables that have multiple possible values based on control flow branches
        // Maps variable name -> list of (condition, UrlInfo, nodeId) for each possible value
        public Map<String, List<ConditionalUrlInfo>> conditionalUrls = new HashMap<>();

        public EnhancedFlowContext(int currentNode) {
            this.currentNode = currentNode;
        }

        public EnhancedFlowContext copy() {
            EnhancedFlowContext copy = new EnhancedFlowContext(this.currentNode);
            copy.breakNodes = new ArrayList<>(this.breakNodes);
            copy.continueNodes = new ArrayList<>(this.continueNodes);
            copy.exitNodes = new ArrayList<>(this.exitNodes);
            copy.availableVariables = new HashSet<>(this.availableVariables);
            copy.exceptionSources = new ArrayList<>(this.exceptionSources);
            copy.variableToService = new HashMap<>(this.variableToService);
            copy.variableToUrl = new HashMap<>(this.variableToUrl);
            // Deep copy conditionalUrls
            copy.conditionalUrls = new HashMap<>();
            for (Map.Entry<String, List<ConditionalUrlInfo>> entry : this.conditionalUrls.entrySet()) {
                copy.conditionalUrls.put(entry.getKey(), new ArrayList<>(entry.getValue()));
            }
            return copy;
        }
    }

    /**
     * Constructor for EnhancedASTControlFlowGenerator
     *
     * @param icfg The ICFG to populate
     * @param components Map of indexed components for method resolution
     * @param patternIndex Pattern index for endpoint resolution (null if not available)
     */
    public EnhancedASTControlFlowGenerator(EnhancedICFG icfg, Map<String, IndexedComponent> components, EndpointPatternIndex patternIndex) {
        this.icfg = icfg;
        this.components = components;
        this.patternIndex = patternIndex;
        this.methodCallTargets = new HashMap<>();
        this.methodCallCanonicals = new HashMap<>();
        this.declaredVariables = new HashSet<>();
        this.methodParameters = new ArrayList<>();
    }

    /**
     * Generate enhanced control flow for a method declaration
     */
    public void generateControlFlow(MethodDeclaration methodDecl, Method irMethod) {
        // Pre-resolve method call targets using IR data
        preResolveMethodCalls(irMethod);

        // Extract method parameters
        extractMethodParameters(methodDecl);

        // Create initial context with entry node
        EnhancedFlowContext context = new EnhancedFlowContext(0); // Entry node is always index 0
        context.availableVariables.addAll(methodParameters);

        // Visit the method body
        if (methodDecl.getBody().isPresent()) {
            methodDecl.getBody().get().accept(this, context);
        }

        // If no explicit exits were created, add a default exit
        if (context.exitNodes.isEmpty()) {
            SourceLocation exitLoc = getSourceLocation(methodDecl.getEnd().orElse(methodDecl.getBegin().orElse(null)));
            int defaultExit = icfg.addNode(ImprovedCFGNode.createExit(0, "return", exitLoc));
            icfg.addExitNodeIndex(defaultExit);
            icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, defaultExit));
        }

        // Build data flow summary
        buildDataFlowSummary();

        // Build exception flow information
        buildExceptionFlow(context);

        // Build loop structure information
        buildLoopStructure();
    }

    /**
     * Extract method parameters for data flow tracking
     */
    private void extractMethodParameters(MethodDeclaration methodDecl) {
        methodParameters.clear();
        for (Parameter param : methodDecl.getParameters()) {
            methodParameters.add(param.getNameAsString());
        }
    }

    /**
     * Pre-resolve method call targets from IR data
     */
    private void preResolveMethodCalls(Method irMethod) {
        for (MethodCall methodCall : irMethod.getMethodCalls()) {
            String targetId = resolveTargetMethodId(methodCall);
            String canonicalId = resolveCanonicalId(methodCall, targetId);

            methodCallTargets.put(methodCall, targetId);
            methodCallCanonicals.put(methodCall, canonicalId);
        }
    }

    @Override
    public void visit(BlockStmt block, EnhancedFlowContext context) {
        for (Statement stmt : block.getStatements()) {
            stmt.accept(this, context);
        }
    }

    @Override
    public void visit(ExpressionStmt exprStmt, EnhancedFlowContext context) {
        SourceLocation location = getSourceLocation(exprStmt.getBegin().orElse(null));

        if (exprStmt.getExpression() instanceof MethodCallExpr) {
            // Handle method call expressions
            MethodCallExpr callExpr = (MethodCallExpr) exprStmt.getExpression();
            int callNode = createEnhancedCallNode(callExpr, location, context);

            icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, callNode));
            context.currentNode = callNode;

        } else if (exprStmt.getExpression() instanceof AssignExpr) {
            // Handle assignment expressions
            AssignExpr assignExpr = (AssignExpr) exprStmt.getExpression();
            int assignNode = createAssignmentNode(assignExpr, location, context);

            icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, assignNode));
            context.currentNode = assignNode;

        } else if (exprStmt.getExpression() instanceof VariableDeclarationExpr) {
            // Handle variable declarations (like "ResponseEntity<Response> re = restTemplate.exchange(...)")
            VariableDeclarationExpr varDecl = (VariableDeclarationExpr) exprStmt.getExpression();
            varDecl.accept(this, context);

        } else {
            // Handle other expressions
            String fullSourceCode = exprStmt.getExpression().toString();
            String description = exprStmt.getExpression().getClass().getSimpleName();

            ImprovedCFGNode exprNode = ImprovedCFGNode.createExpression(
                0, description, getASTType(exprStmt.getExpression()), location
            );

            // Set full source code
            exprNode.setSourceCode(fullSourceCode);

            // Add basic data flow for expression
            DataFlowInfo dataFlow = extractDataFlowFromExpression(exprStmt.getExpression(), context);
            exprNode.setDataFlow(dataFlow);

            int nodeIndex = icfg.addNode(exprNode);
            icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, nodeIndex));
            context.currentNode = nodeIndex;
        }
    }

    @Override
    public void visit(VariableDeclarationExpr varDecl, EnhancedFlowContext context) {
        SourceLocation location = getSourceLocation(varDecl.getBegin().orElse(null));

        for (VariableDeclarator declarator : varDecl.getVariables()) {
            String varName = declarator.getNameAsString();
            String fullSourceCode = declarator.toString();
            String description = varName + " : " + declarator.getType().asString();

            ImprovedCFGNode declNode = ImprovedCFGNode.createDeclaration(
                0, description, "VariableDeclarationExpr", location
            );

            // Set full source code
            declNode.setSourceCode(fullSourceCode);

            // Add data flow information
            DataFlowInfo dataFlow = new DataFlowInfo();
            dataFlow.addDefine(varName);

            // If there's an initializer, check for method calls and track data flow
            if (declarator.getInitializer().isPresent()) {
                Expression initializer = declarator.getInitializer().get();

                // Check if this is a service discovery call and track the variable-to-service mapping
                if (initializer instanceof MethodCallExpr) {
                    MethodCallExpr methodCall = (MethodCallExpr) initializer;
                    RemoteCallDetector.RemoteCallAnalysis analysis = analyzeMethodCall(methodCall);

                    if (analysis.isServiceDiscovery && analysis.targetService != null) {
                        // Map this variable to the resolved service name
                        context.variableToService.put(varName, analysis.targetService);
                    }
                }

                // Check if this is a URL concatenation (e.g., baseUrl + "/path")
                // This handles patterns like: USER_SERVICE_IP_URI = user_service_url + "/api/v1/userservice/users"
                if (initializer instanceof BinaryExpr) {
                    BinaryExpr binaryExpr = (BinaryExpr) initializer;
                    if (binaryExpr.getOperator() == BinaryExpr.Operator.PLUS) {
                        UrlInfo urlInfo = extractUrlFromBinaryExpr(binaryExpr, context);
                        if (urlInfo != null) {
                            context.variableToUrl.put(varName, urlInfo);
                        }
                    }
                }

                // Check if the initializer contains method calls (especially remote calls)
                processMethodCallsInExpression(initializer, context);

                // Track data flow from the initializer
                DataFlowInfo initDataFlow = extractDataFlowFromExpression(initializer, context);
                if (initDataFlow.hasUses() && initDataFlow.getUses() != null) {
                    for (String use : initDataFlow.getUses()) {
                        dataFlow.addUse(use);
                    }
                }
            }

            declNode.setDataFlow(dataFlow);

            // Track the variable in our context
            context.availableVariables.add(varName);
            declaredVariables.add(varName);

            int nodeIndex = icfg.addNode(declNode);
            icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, nodeIndex));
            context.currentNode = nodeIndex;
        }
    }

    @Override
    public void visit(IfStmt ifStmt, EnhancedFlowContext context) {
        SourceLocation location = getSourceLocation(ifStmt.getBegin().orElse(null));
        String condition = ifStmt.getCondition().toString();
        String fullSourceCode = ifStmt.toString();

        // Create branch node
        BranchInfo branchInfo = BranchInfo.createIf(condition, ifStmt.getElseStmt().isPresent());
        ImprovedCFGNode branchNode = ImprovedCFGNode.createBranch(
            0, "if (" + condition + ")", "IfStmt", location, branchInfo
        );

        // Set full source code
        branchNode.setSourceCode(fullSourceCode);

        // Add data flow for condition
        DataFlowInfo conditionDataFlow = extractDataFlowFromExpression(ifStmt.getCondition(), context);
        branchNode.setDataFlow(conditionDataFlow);

        int branchIndex = icfg.addNode(branchNode);
        icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, branchIndex));

        // Create contexts for then and else branches
        EnhancedFlowContext thenContext = context.copy();
        thenContext.currentNode = branchIndex;

        EnhancedFlowContext elseContext = context.copy();
        elseContext.currentNode = branchIndex;

        // Store current node count to track first nodes in each branch
        int nodeCountBeforeThen = icfg.getNodeCount();

        // Visit then branch
        ifStmt.getThenStmt().accept(this, thenContext);

        // Determine the first node of the then branch
        int thenFirstNode = nodeCountBeforeThen;
        if (icfg.getNodeCount() > nodeCountBeforeThen) {
            // Connect branch to first node of then statement
            icfg.addEdge(ImprovedCFGEdge.createBranchTrue(branchIndex, thenFirstNode, condition));
        }

        // Visit else branch if present
        boolean hasElse = ifStmt.getElseStmt().isPresent();
        if (hasElse) {
            int nodeCountBeforeElse = icfg.getNodeCount();
            ifStmt.getElseStmt().get().accept(this, elseContext);

            // Determine the first node of the else branch
            int elseFirstNode = nodeCountBeforeElse;
            if (icfg.getNodeCount() > nodeCountBeforeElse) {
                // Connect branch to first node of else statement
                icfg.addEdge(ImprovedCFGEdge.createBranchFalse(branchIndex, elseFirstNode, condition));
            }
        }

        // Handle branch connections
        boolean thenExited = hasExited(thenContext);
        boolean elseExited = hasExited(elseContext);

        // Create merge node if needed
        if (!thenExited || (!elseExited && hasElse) || !hasElse) {
            SourceLocation mergeLocation = getSourceLocation(ifStmt.getEnd().orElse(null));
            int mergeNode = icfg.addNode(ImprovedCFGNode.createMerge(0, "if-merge", mergeLocation));

            // Connect branches to merge
            if (!thenExited) {
                icfg.addEdge(ImprovedCFGEdge.createMerge(thenContext.currentNode, mergeNode));
            }

            if (hasElse && !elseExited) {
                icfg.addEdge(ImprovedCFGEdge.createMerge(elseContext.currentNode, mergeNode));
            } else if (!hasElse) {
                // No else block, false branch goes directly to merge
                icfg.addEdge(ImprovedCFGEdge.createBranchFalse(branchIndex, mergeNode, condition));
            }

            context.currentNode = mergeNode;
        }

        // Merge exit nodes and exception sources
        context.exitNodes.addAll(thenContext.exitNodes);
        context.exitNodes.addAll(elseContext.exitNodes);
        context.exceptionSources.addAll(thenContext.exceptionSources);
        context.exceptionSources.addAll(elseContext.exceptionSources);

        // Track conditional URL assignments for path-sensitive remote call resolution
        // If a variable was assigned different URL values in then/else branches,
        // store both possibilities for later remote call node duplication
        trackConditionalUrlAssignments(condition, thenContext, elseContext, context, nodeCountBeforeThen, hasElse);
    }

    @Override
    public void visit(ForStmt forStmt, EnhancedFlowContext context) {
        SourceLocation location = getSourceLocation(forStmt.getBegin().orElse(null));
        String fullSourceCode = forStmt.toString();

        // Create loop init nodes for initialization expressions
        for (Expression init : forStmt.getInitialization()) {
            if (init instanceof VariableDeclarationExpr) {
                ((VariableDeclarationExpr) init).accept(this, context);
            } else {
                String initSource = init.toString();
                ImprovedCFGNode initNode = ImprovedCFGNode.createStatement(0, "for-init", "ForInit", location);
                initNode.setSourceCode(initSource);
                int initIndex = icfg.addNode(initNode);
                icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, initIndex));
                context.currentNode = initIndex;
            }
        }

        // Create loop header node with condition
        String initStr = forStmt.getInitialization().isEmpty() ? "" :
            forStmt.getInitialization().stream().map(Object::toString).reduce((a, b) -> a + ", " + b).orElse("");
        String condition = forStmt.getCompare().map(Object::toString).orElse("true");
        String updateStr = forStmt.getUpdate().isEmpty() ? "" :
            forStmt.getUpdate().stream().map(Object::toString).reduce((a, b) -> a + ", " + b).orElse("");

        LoopInfo loopInfo = LoopInfo.createFor("i", initStr, condition, updateStr);
        ImprovedCFGNode loopNode = ImprovedCFGNode.createLoop(
            0, "for (" + condition + ")", "ForStmt", location, loopInfo
        );
        loopNode.setSourceCode(fullSourceCode);

        int loopIndex = icfg.addNode(loopNode);
        icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, loopIndex));

        // Create loop body context
        EnhancedFlowContext bodyContext = context.copy();
        bodyContext.currentNode = loopIndex;
        bodyContext.continueNodes.clear();
        bodyContext.breakNodes.clear();
        bodyContext.exceptionSources.clear(); // Clear to prevent accumulation

        // Visit loop body
        forStmt.getBody().accept(this, bodyContext);

        // Create update node for loop update expressions
        if (!forStmt.getUpdate().isEmpty()) {
            for (Expression update : forStmt.getUpdate()) {
                String updateSource = update.toString();
                ImprovedCFGNode updateNode = ImprovedCFGNode.createStatement(0, "for-update", "ForUpdate", location);
                updateNode.setSourceCode(updateSource);
                int updateIndex = icfg.addNode(updateNode);
                icfg.addEdge(ImprovedCFGEdge.createSequential(bodyContext.currentNode, updateIndex));
                bodyContext.currentNode = updateIndex;
            }
        }

        // Create exit node
        SourceLocation exitLocation = getSourceLocation(forStmt.getEnd().orElse(null));
        int exitNode = icfg.addNode(ImprovedCFGNode.createMerge(0, "for-exit", exitLocation));

        // Connect loop body back to loop header
        if (!hasExited(bodyContext) && bodyContext.breakNodes.isEmpty()) {
            icfg.addEdge(ImprovedCFGEdge.createLoopBack(bodyContext.currentNode, loopIndex));
        }

        // Connect loop header to exit (condition false)
        icfg.addEdge(ImprovedCFGEdge.createLoopExit(loopIndex, exitNode, "!" + condition));

        // Handle break/continue statements
        for (int breakNode : bodyContext.breakNodes) {
            icfg.addEdge(ImprovedCFGEdge.createBreak(breakNode, exitNode));
        }
        for (int continueNode : bodyContext.continueNodes) {
            icfg.addEdge(ImprovedCFGEdge.createContinue(continueNode, loopIndex));
        }

        context.currentNode = exitNode;
        context.exitNodes.addAll(bodyContext.exitNodes);
        context.exceptionSources.addAll(bodyContext.exceptionSources);
    }

    @Override
    public void visit(WhileStmt whileStmt, EnhancedFlowContext context) {
        SourceLocation location = getSourceLocation(whileStmt.getBegin().orElse(null));
        String condition = whileStmt.getCondition().toString();
        String fullSourceCode = whileStmt.toString();

        // Create loop header node
        LoopInfo loopInfo = LoopInfo.createWhile(condition);
        ImprovedCFGNode loopNode = ImprovedCFGNode.createLoop(
            0, "while (" + condition + ")", "WhileStmt", location, loopInfo
        );
        loopNode.setSourceCode(fullSourceCode);

        int loopIndex = icfg.addNode(loopNode);
        icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, loopIndex));

        // Create loop body context
        EnhancedFlowContext bodyContext = context.copy();
        bodyContext.currentNode = loopIndex;
        bodyContext.continueNodes.clear();
        bodyContext.breakNodes.clear();
        bodyContext.exceptionSources.clear(); // Clear to prevent accumulation

        // Visit loop body
        whileStmt.getBody().accept(this, bodyContext);

        // Create exit node
        SourceLocation exitLocation = getSourceLocation(whileStmt.getEnd().orElse(null));
        int exitNode = icfg.addNode(ImprovedCFGNode.createMerge(0, "while-exit", exitLocation));

        // Connect loop body back to loop header
        if (!hasExited(bodyContext) && bodyContext.breakNodes.isEmpty()) {
            icfg.addEdge(ImprovedCFGEdge.createLoopBack(bodyContext.currentNode, loopIndex));
        }

        // Connect loop header to exit (condition false)
        icfg.addEdge(ImprovedCFGEdge.createLoopExit(loopIndex, exitNode, "!" + condition));

        // Handle break/continue statements
        for (int breakNode : bodyContext.breakNodes) {
            icfg.addEdge(ImprovedCFGEdge.createBreak(breakNode, exitNode));
        }
        for (int continueNode : bodyContext.continueNodes) {
            icfg.addEdge(ImprovedCFGEdge.createContinue(continueNode, loopIndex));
        }

        context.currentNode = exitNode;
        context.exitNodes.addAll(bodyContext.exitNodes);
        context.exceptionSources.addAll(bodyContext.exceptionSources);
    }

    @Override
    public void visit(DoStmt doStmt, EnhancedFlowContext context) {
        SourceLocation location = getSourceLocation(doStmt.getBegin().orElse(null));
        String condition = doStmt.getCondition().toString();
        String fullSourceCode = doStmt.toString();

        // Create do-while entry node
        ImprovedCFGNode doNode = ImprovedCFGNode.createStatement(0, "do", "DoStmt", location);
        doNode.setSourceCode(fullSourceCode);

        int doIndex = icfg.addNode(doNode);
        icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, doIndex));

        // Create loop body context
        EnhancedFlowContext bodyContext = context.copy();
        bodyContext.currentNode = doIndex;
        bodyContext.continueNodes.clear();
        bodyContext.breakNodes.clear();
        bodyContext.exceptionSources.clear(); // Clear to prevent accumulation

        // Visit loop body
        doStmt.getBody().accept(this, bodyContext);

        // Create condition node (evaluated after body)
        LoopInfo loopInfo = LoopInfo.createDoWhile(condition);
        SourceLocation condLocation = getSourceLocation(doStmt.getCondition().getBegin().orElse(null));
        ImprovedCFGNode condNode = ImprovedCFGNode.createLoop(
            0, "while (" + condition + ")", "DoWhile", condLocation, loopInfo
        );
        int condIndex = icfg.addNode(condNode);
        icfg.addEdge(ImprovedCFGEdge.createSequential(bodyContext.currentNode, condIndex));

        // Create exit node
        SourceLocation exitLocation = getSourceLocation(doStmt.getEnd().orElse(null));
        int exitNode = icfg.addNode(ImprovedCFGNode.createMerge(0, "do-while-exit", exitLocation));

        // Loop back from condition to body if true
        icfg.addEdge(ImprovedCFGEdge.createLoopBack(condIndex, doIndex));

        // Exit from condition if false
        icfg.addEdge(ImprovedCFGEdge.createLoopExit(condIndex, exitNode, "!" + condition));

        // Handle break/continue statements
        for (int breakNode : bodyContext.breakNodes) {
            icfg.addEdge(ImprovedCFGEdge.createBreak(breakNode, exitNode));
        }
        for (int continueNode : bodyContext.continueNodes) {
            icfg.addEdge(ImprovedCFGEdge.createContinue(continueNode, condIndex));
        }

        context.currentNode = exitNode;
        context.exitNodes.addAll(bodyContext.exitNodes);
        context.exceptionSources.addAll(bodyContext.exceptionSources);
    }

    @Override
    public void visit(SwitchStmt switchStmt, EnhancedFlowContext context) {
        SourceLocation location = getSourceLocation(switchStmt.getBegin().orElse(null));
        String selector = switchStmt.getSelector().toString();
        String fullSourceCode = switchStmt.toString();

        // Extract case labels
        List<String> caseValues = new ArrayList<>();
        for (SwitchEntry entry : switchStmt.getEntries()) {
            if (entry.getLabels().isEmpty()) {
                caseValues.add("default");
            } else {
                for (Expression label : entry.getLabels()) {
                    caseValues.add(label.toString());
                }
            }
        }

        // Create switch node
        BranchInfo branchInfo = BranchInfo.createSwitch(selector, caseValues);
        ImprovedCFGNode switchNode = ImprovedCFGNode.createBranch(
            0, "switch (" + selector + ")", "SwitchStmt", location, branchInfo
        );
        switchNode.setSourceCode(fullSourceCode);

        int switchIndex = icfg.addNode(switchNode);
        icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, switchIndex));

        // Track case exit nodes
        List<Integer> caseExitNodes = new ArrayList<>();
        int previousCaseExit = switchIndex;

        // Process each case
        for (SwitchEntry entry : switchStmt.getEntries()) {
            // Create case node
            String caseLabel = entry.getLabels().isEmpty() ? "default" :
                entry.getLabels().stream().map(Object::toString).reduce((a, b) -> a + ", " + b).orElse("");

            SourceLocation caseLocation = getSourceLocation(entry.getBegin().orElse(null));
            ImprovedCFGNode caseNode = ImprovedCFGNode.createStatement(
                0, "case " + caseLabel, "SwitchEntry", caseLocation
            );
            caseNode.setSourceCode(entry.toString());

            int caseIndex = icfg.addNode(caseNode);

            // Connect switch to case
            String condition = caseLabel.equals("default") ? "default" : selector + " == " + caseLabel;
            icfg.addEdge(ImprovedCFGEdge.createBranchTrue(switchIndex, caseIndex, condition));

            // Create context for case body
            EnhancedFlowContext caseContext = context.copy();
            caseContext.currentNode = caseIndex;
            caseContext.breakNodes.clear();

            // Visit case body
            for (Statement stmt : entry.getStatements()) {
                stmt.accept(this, caseContext);
            }

            // Track case exit
            caseExitNodes.add(caseContext.currentNode);

            // Track breaks
            for (int breakNode : caseContext.breakNodes) {
                caseExitNodes.add(breakNode);
            }

            previousCaseExit = caseContext.currentNode;
        }

        // Create merge node
        SourceLocation exitLocation = getSourceLocation(switchStmt.getEnd().orElse(null));
        int exitNode = icfg.addNode(ImprovedCFGNode.createMerge(0, "switch-exit", exitLocation));

        // Connect all case exits to merge
        for (int caseExit : caseExitNodes) {
            icfg.addEdge(ImprovedCFGEdge.createMerge(caseExit, exitNode));
        }

        context.currentNode = exitNode;
    }

    @Override
    public void visit(ForEachStmt forEachStmt, EnhancedFlowContext context) {
        SourceLocation location = getSourceLocation(forEachStmt.getBegin().orElse(null));
        String iterableExpr = forEachStmt.getIterable().toString();
        String variable = forEachStmt.getVariable().getVariables().get(0).getNameAsString();
        String fullSourceCode = forEachStmt.toString();

        // Create loop header node
        LoopInfo loopInfo = LoopInfo.createForEach(variable, iterableExpr);
        ImprovedCFGNode loopNode = ImprovedCFGNode.createLoop(
            0, "for (" + variable + " : " + iterableExpr + ")", "ForEachStmt", location, loopInfo
        );

        // Set full source code
        loopNode.setSourceCode(fullSourceCode);

        // Add data flow for loop
        DataFlowInfo loopDataFlow = new DataFlowInfo();
        loopDataFlow.addDefine(variable);
        loopDataFlow.addUse(iterableExpr);
        loopNode.setDataFlow(loopDataFlow);

        int loopIndex = icfg.addNode(loopNode);
        icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, loopIndex));

        // Create loop body context
        EnhancedFlowContext bodyContext = context.copy();
        bodyContext.currentNode = loopIndex;
        bodyContext.continueNodes.clear();
        bodyContext.breakNodes.clear();
        bodyContext.exceptionSources.clear(); // Clear to prevent accumulation
        bodyContext.availableVariables.add(variable);

        // Visit loop body
        forEachStmt.getBody().accept(this, bodyContext);

        // Create exit node
        SourceLocation exitLocation = getSourceLocation(forEachStmt.getEnd().orElse(null));
        int exitNode = icfg.addNode(ImprovedCFGNode.createMerge(0, "foreach-exit", exitLocation));

        // Connect loop to body (enter) and to exit (no more elements)
        // Only create loop enter edge if body was actually visited and currentNode changed
        if (bodyContext.currentNode != loopIndex) {
            icfg.addEdge(ImprovedCFGEdge.createLoopEnter(loopIndex, bodyContext.currentNode, "hasNext(" + iterableExpr + ")"));
        }
        icfg.addEdge(ImprovedCFGEdge.createLoopExit(loopIndex, exitNode, "!hasNext(" + iterableExpr + ")"));

        // Connect body back to loop (if no break/return)
        if (!hasExited(bodyContext) && bodyContext.breakNodes.isEmpty() && bodyContext.currentNode != loopIndex) {
            icfg.addEdge(ImprovedCFGEdge.createLoopBack(bodyContext.currentNode, loopIndex));
        }

        // Handle break statements
        for (int breakNode : bodyContext.breakNodes) {
            icfg.addEdge(ImprovedCFGEdge.createBreak(breakNode, exitNode));
        }

        // Handle continue statements
        for (int continueNode : bodyContext.continueNodes) {
            icfg.addEdge(ImprovedCFGEdge.createContinue(continueNode, loopIndex));
        }

        context.currentNode = exitNode;
        context.exitNodes.addAll(bodyContext.exitNodes);
        // Only add unique exception sources to prevent exponential growth
        for (Integer source : bodyContext.exceptionSources) {
            if (!context.exceptionSources.contains(source)) {
                context.exceptionSources.add(source);
            }
        }
    }

    @Override
    public void visit(LambdaExpr lambdaExpr, EnhancedFlowContext context) {
        SourceLocation location = getSourceLocation(lambdaExpr.getBegin().orElse(null));
        String fullSourceCode = lambdaExpr.toString();

        // Extract lambda parameters
        List<String> lambdaParams = new ArrayList<>();
        for (Parameter param : lambdaExpr.getParameters()) {
            lambdaParams.add(param.getNameAsString());
        }

        String description = "λ(" + String.join(", ", lambdaParams) + ")";

        ImprovedCFGNode lambdaNode = ImprovedCFGNode.createExpression(
            0, description, "LambdaExpr", location
        );

        // Set full source code
        lambdaNode.setSourceCode(fullSourceCode);

        // Add data flow for lambda - track captured variables
        DataFlowInfo dataFlow = new DataFlowInfo();

        // Add lambda parameters as defined variables
        for (String param : lambdaParams) {
            dataFlow.addDefine(param);
        }

        // Track captured variables (variables used but not defined in lambda)
        lambdaExpr.accept(new VoidVisitorAdapter<Void>() {
            @Override
            public void visit(NameExpr nameExpr, Void arg) {
                String varName = nameExpr.getNameAsString();
                if (context.availableVariables.contains(varName) && !lambdaParams.contains(varName)) {
                    dataFlow.addUse(varName); // Captured variable
                }
                super.visit(nameExpr, arg);
            }
        }, null);

        lambdaNode.setDataFlow(dataFlow);

        int nodeIndex = icfg.addNode(lambdaNode);
        icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, nodeIndex));
        context.currentNode = nodeIndex;

        // Process lambda body (if it's a block statement)
        if (lambdaExpr.getBody() instanceof BlockStmt) {
            EnhancedFlowContext lambdaContext = context.copy();
            lambdaContext.currentNode = nodeIndex;
            lambdaContext.availableVariables.addAll(lambdaParams);

            ((BlockStmt) lambdaExpr.getBody()).accept(this, lambdaContext);
            context.currentNode = lambdaContext.currentNode;
        }
    }

    @Override
    public void visit(TryStmt tryStmt, EnhancedFlowContext context) {
        SourceLocation location = getSourceLocation(tryStmt.getBegin().orElse(null));
        String fullSourceCode = tryStmt.toString();

        // Create try block entry node
        ImprovedCFGNode tryNode = ImprovedCFGNode.createStatement(
            0, "try", "TryStmt", location
        );
        tryNode.setSourceCode(fullSourceCode);

        int tryIndex = icfg.addNode(tryNode);
        icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, tryIndex));

        // Handle try-with-resources
        if (!tryStmt.getResources().isEmpty()) {
            ExceptionInfo resourceInfo = ExceptionInfo.createTryWithResources(new ArrayList<>());
            for (Expression resource : tryStmt.getResources()) {
                resourceInfo.addResource(resource.toString());
            }
            tryNode.setExceptionInfo(resourceInfo);
        }

        // Create context for try block
        EnhancedFlowContext tryContext = context.copy();
        tryContext.currentNode = tryIndex;
        tryContext.exceptionSources = new ArrayList<>();

        // Visit try block
        tryStmt.getTryBlock().accept(this, tryContext);

        // Track exit node after try
        int tryExitNode = tryContext.currentNode;

        // Create catch handlers
        List<Integer> catchExitNodes = new ArrayList<>();
        for (CatchClause catchClause : tryStmt.getCatchClauses()) {
            Parameter exceptionParam = catchClause.getParameter();

            // Handle multi-catch (Java 7+)
            List<String> caughtTypes = new ArrayList<>();
            if (exceptionParam.getType() instanceof com.github.javaparser.ast.type.UnionType) {
                com.github.javaparser.ast.type.UnionType unionType =
                    (com.github.javaparser.ast.type.UnionType) exceptionParam.getType();
                for (com.github.javaparser.ast.type.ReferenceType refType : unionType.getElements()) {
                    caughtTypes.add(refType.asString());
                }
            } else {
                caughtTypes.add(exceptionParam.getType().asString());
            }

            String catchVar = exceptionParam.getNameAsString();

            // Create ExceptionInfo
            ExceptionInfo exceptionInfo;
            if (caughtTypes.size() > 1) {
                exceptionInfo = ExceptionInfo.createMultiCatch(caughtTypes, catchVar);
            } else {
                exceptionInfo = ExceptionInfo.createCatch(caughtTypes.get(0), catchVar);
            }

            // Create catch node
            SourceLocation catchLocation = getSourceLocation(catchClause.getBegin().orElse(null));
            ImprovedCFGNode catchNode = ImprovedCFGNode.createException(
                0, exceptionInfo.toString(), "CatchClause", catchLocation, exceptionInfo
            );
            catchNode.setSourceCode(catchClause.toString());

            int catchIndex = icfg.addNode(catchNode);

            // Add exception edges from all exception sources in try block
            for (int sourceNode : tryContext.exceptionSources) {
                for (String exceptionType : caughtTypes) {
                    icfg.addEdge(ImprovedCFGEdge.createException(sourceNode, catchIndex, exceptionType));
                }
            }

            // Visit catch block
            EnhancedFlowContext catchContext = context.copy();
            catchContext.currentNode = catchIndex;
            catchContext.availableVariables.add(catchVar);

            catchClause.getBody().accept(this, catchContext);

            // Check for rethrown exceptions
            boolean hasRethrow = checkForRethrow(catchClause.getBody(), catchVar);
            if (hasRethrow) {
                exceptionInfo.setRethrown(true);
            }

            catchExitNodes.add(catchContext.currentNode);
        }

        // Create finally block if present
        if (tryStmt.getFinallyBlock().isPresent()) {
            ExceptionInfo finallyInfo = ExceptionInfo.createFinally();
            SourceLocation finallyLocation = getSourceLocation(tryStmt.getFinallyBlock().get().getBegin().orElse(null));

            ImprovedCFGNode finallyNode = ImprovedCFGNode.createException(
                0, "finally", "FinallyBlock", finallyLocation, finallyInfo
            );
            finallyNode.setSourceCode(tryStmt.getFinallyBlock().get().toString());

            int finallyIndex = icfg.addNode(finallyNode);

            // Connect try exit to finally
            if (!hasExited(tryContext)) {
                icfg.addEdge(ImprovedCFGEdge.createFinally(tryExitNode, finallyIndex));
            }

            // Connect all catch exits to finally
            for (int catchExit : catchExitNodes) {
                icfg.addEdge(ImprovedCFGEdge.createFinally(catchExit, finallyIndex));
            }

            // Visit finally block
            EnhancedFlowContext finallyContext = context.copy();
            finallyContext.currentNode = finallyIndex;
            tryStmt.getFinallyBlock().get().accept(this, finallyContext);

            context.currentNode = finallyContext.currentNode;
        } else {
            // Create merge point for try and catch exits
            SourceLocation mergeLocation = getSourceLocation(tryStmt.getEnd().orElse(null));
            int mergeNode = icfg.addNode(ImprovedCFGNode.createMerge(
                0, "try-catch-merge", mergeLocation
            ));

            if (!hasExited(tryContext)) {
                icfg.addEdge(ImprovedCFGEdge.createMerge(tryExitNode, mergeNode));
            }

            for (int catchExit : catchExitNodes) {
                icfg.addEdge(ImprovedCFGEdge.createMerge(catchExit, mergeNode));
            }

            context.currentNode = mergeNode;
        }

        // Merge exception sources
        context.exceptionSources.addAll(tryContext.exceptionSources);
    }

    /**
     * Check if a catch block contains a rethrow of the exception
     */
    private boolean checkForRethrow(BlockStmt catchBody, String catchVar) {
        // Simple check for throw statements with the same variable
        for (Statement stmt : catchBody.getStatements()) {
            if (stmt instanceof ThrowStmt) {
                ThrowStmt throwStmt = (ThrowStmt) stmt;
                String thrownExpr = throwStmt.getExpression().toString();
                if (thrownExpr.equals(catchVar)) {
                    return true;
                }
            }
        }
        return false;
    }

    @Override
    public void visit(ReturnStmt returnStmt, EnhancedFlowContext context) {
        SourceLocation location = getSourceLocation(returnStmt.getBegin().orElse(null));
        String fullSourceCode = returnStmt.toString();

        // Process the return expression first to capture any method calls
        if (returnStmt.getExpression().isPresent()) {
            Expression returnExpr = returnStmt.getExpression().get();

            // Process any method calls in the return expression
            processMethodCallsInExpression(returnExpr, context);
        }

        String returnValue = returnStmt.getExpression()
            .map(Object::toString).orElse("void");

        ImprovedCFGNode exitNode = ImprovedCFGNode.createExit(
            0, "return " + returnValue, location
        );

        // Set full source code
        exitNode.setSourceCode(fullSourceCode);

        // Add data flow for return value
        if (returnStmt.getExpression().isPresent()) {
            DataFlowInfo returnDataFlow = extractDataFlowFromExpression(
                returnStmt.getExpression().get(), context
            );
            exitNode.setDataFlow(returnDataFlow);
        }

        int exitIndex = icfg.addNode(exitNode);
        icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, exitIndex));
        icfg.addExitNodeIndex(exitIndex);

        context.exitNodes.add(exitIndex);
        context.currentNode = exitIndex;
    }

    // Additional helper methods

    /**
     * Create an enhanced call node from a method call expression
     */
    private int createEnhancedCallNode(MethodCallExpr callExpr, SourceLocation location, EnhancedFlowContext context) {
        // Analyze the method call to determine if it's a remote call
        // Pass variable-to-service mapping for improved service resolution
        RemoteCallDetector.RemoteCallAnalysis analysis = analyzeMethodCall(callExpr, context.variableToService);

        MethodCallInfo callInfo;

        // If it's a remote call or service discovery, use the analysis result
        if (analysis.isRemoteCall || analysis.isServiceDiscovery) {
            callInfo = analysis.toMethodCallInfo();

            // Phase 2: Try to resolve remote call to endpoint ID
            if (analysis.isRemoteCall && patternIndex != null) {
                resolveRemoteCallToEndpoint(callInfo, callExpr, context);

                // STEP 4: If this is a conditional URL, create multiple REMOTE_CALL nodes
                if (callInfo.getHasConditionalUrl() != null && callInfo.getHasConditionalUrl()) {
                    return createMultipleConditionalRemoteCallNodes(callExpr, callInfo, location, context);
                }
            }
        } else {
            // For local calls, try to match with pre-resolved method calls
            MethodCall matchedCall = findMatchingMethodCall(callExpr);

            if (matchedCall != null) {
                String targetId = methodCallTargets.get(matchedCall);
                String canonicalId = methodCallCanonicals.get(matchedCall);
                String objectType = getObjectType(callExpr);

                if (targetId != null) {
                    callInfo = MethodCallInfo.createExact(targetId, canonicalId, objectType);
                } else {
                    callInfo = MethodCallInfo.createPartial(null, canonicalId, objectType);
                }
            } else {
                callInfo = MethodCallInfo.createUnresolved(getObjectType(callExpr));
            }
        }

        // Set additional call information
        callInfo.setReturnUsed(isReturnValueUsed(callExpr));
        callInfo.setIsStatic(isStaticCall(callExpr));

        // Store full source code (not truncated)
        String fullSourceCode = callExpr.toString();

        // Create description with enhanced information for remote calls
        String description;
        if (callInfo.isRemoteCall()) {
            description = callInfo.getDisplayDescription();
        } else if (callInfo.isServiceDiscoveryCall()) {
            description = "discover: " + (callInfo.getTargetService() != null ? callInfo.getTargetService() : callExpr.getNameAsString());
        } else {
            description = callExpr.getNameAsString();
        }

        // Create the appropriate node type
        // Service discovery calls (serviceResolver.getServiceUrl) are NOT remote calls
        // Only actual HTTP calls (restTemplate.exchange, etc.) are remote calls
        ImprovedCFGNode callNode;
        if (callInfo.isRemoteCall() && !callInfo.isServiceDiscoveryCall()) {
            callNode = ImprovedCFGNode.createRemoteCall(0, description, "MethodCallExpr", location, callInfo);
        } else {
            callNode = ImprovedCFGNode.createCall(0, description, "MethodCallExpr", location, callInfo);
        }

        // Set full source code
        callNode.setSourceCode(fullSourceCode);

        // Add data flow information
        DataFlowInfo dataFlow = extractDataFlowFromMethodCall(callExpr, context);
        callNode.setDataFlow(dataFlow);

        // Track as potential exception source (remote calls have higher risk)
        context.exceptionSources.add(icfg.getNodeCount());

        return icfg.addNode(callNode);
    }

    /**
     * Track conditional URL assignments from if/else branches for path-sensitive analysis.
     *
     * When a variable is assigned different URL values in then/else branches,
     * this method stores both possibilities in context.conditionalUrls for later
     * remote call node duplication.
     *
     * @param condition The branch condition (e.g., "info.getTripId().startsWith(\"G\")")
     * @param thenContext Context after then branch execution
     * @param elseContext Context after else branch execution
     * @param parentContext Parent context to store conditional assignments
     * @param thenNodeStart Node index where then branch starts
     * @param hasElse Whether the if statement has an else branch
     */
    private void trackConditionalUrlAssignments(String condition, EnhancedFlowContext thenContext,
                                               EnhancedFlowContext elseContext, EnhancedFlowContext parentContext,
                                               int thenNodeStart, boolean hasElse) {
        // Find variables that were assigned URLs in THEN branch
        Set<String> thenVars = thenContext.variableToUrl.keySet();

        // Find variables that were assigned URLs in ELSE branch (if present)
        Set<String> elseVars = hasElse ? elseContext.variableToUrl.keySet() : new HashSet<>();

        // Process variables assigned in THEN branch
        for (String varName : thenVars) {
            UrlInfo thenUrl = thenContext.variableToUrl.get(varName);

            if (hasElse && elseVars.contains(varName)) {
                // Variable assigned in BOTH branches - track both possibilities
                UrlInfo elseUrl = elseContext.variableToUrl.get(varName);

                // Check if URLs are different
                boolean sameService = (thenUrl.service != null && thenUrl.service.equals(elseUrl.service)) ||
                                     (thenUrl.service == null && elseUrl.service == null);
                boolean samePath = (thenUrl.path != null && thenUrl.path.equals(elseUrl.path)) ||
                                  (thenUrl.path == null && elseUrl.path == null);

                if (!sameService || !samePath) {
                    // Different URLs - create conditional tracking
                    List<ConditionalUrlInfo> conditionals = parentContext.conditionalUrls.computeIfAbsent(
                        varName, k -> new ArrayList<>()
                    );

                    // Add THEN branch URL
                    conditionals.add(new ConditionalUrlInfo(
                        condition,
                        thenUrl,
                        thenNodeStart  // Node where assignment happens
                    ));

                    // Add ELSE branch URL with negated condition
                    conditionals.add(new ConditionalUrlInfo(
                        "!(" + condition + ")",
                        elseUrl,
                        thenNodeStart + 1  // Approximate - else assignment node
                    ));
                } else {
                    // Same URL in both branches - just use it directly
                    parentContext.variableToUrl.put(varName, thenUrl);
                }
            } else {
                // Variable only assigned in THEN branch - store in parent
                parentContext.variableToUrl.put(varName, thenUrl);
            }
        }

        // Process variables assigned ONLY in ELSE branch
        if (hasElse) {
            for (String varName : elseVars) {
                if (!thenVars.contains(varName)) {
                    UrlInfo elseUrl = elseContext.variableToUrl.get(varName);
                    parentContext.variableToUrl.put(varName, elseUrl);
                }
            }
        }
    }

    /**
     * STEP 4: Create multiple REMOTE_CALL nodes for a conditional URL.
     *
     * When a remote call uses a URL variable that has different values based on branch conditions
     * (e.g., if/else), this method creates separate REMOTE_CALL nodes for each possible path.
     *
     * For example, if requestOrderURL can be:
     * - "ts-order-service/api/v1/orderservice/order/..." when condition is true
     * - "ts-order-other-service/api/v1/orderOtherService/orderOther/..." when condition is false
     *
     * Then we create TWO remote call nodes, each with proper endpoint resolution.
     *
     * @param callExpr The method call expression
     * @param baseCallInfo The base call info (with hasConditionalUrl=true)
     * @param location Source location
     * @param context Flow context with conditionalUrls mapping
     * @return The index of the last created node (for edge connection)
     */
    private int createMultipleConditionalRemoteCallNodes(MethodCallExpr callExpr, MethodCallInfo baseCallInfo,
                                                         SourceLocation location, EnhancedFlowContext context) {
        String urlVarName = baseCallInfo.getUrlVariableName();
        List<ConditionalUrlInfo> conditionalUrls = context.conditionalUrls.get(urlVarName);

        if (conditionalUrls == null || conditionalUrls.isEmpty()) {
            // Shouldn't happen - hasConditionalUrl was true, but no conditionals found
            // Fall back to creating a single node with no resolution
            return createSingleRemoteCallNode(callExpr, baseCallInfo, location, context);
        }

        // Track all node indices created
        List<Integer> createdNodeIndices = new ArrayList<>();

        // Create one REMOTE_CALL node for each conditional URL
        for (ConditionalUrlInfo conditionalUrl : conditionalUrls) {
            // Clone the base call info for this path
            MethodCallInfo pathCallInfo = cloneMethodCallInfo(baseCallInfo);

            // Set the specific URL info for this path
            pathCallInfo.setTargetService(conditionalUrl.urlInfo.service);
            pathCallInfo.setEndpoint(conditionalUrl.urlInfo.path);
            pathCallInfo.setBranchCondition(conditionalUrl.condition);
            pathCallInfo.setPathBranchNodeId(conditionalUrl.assignmentNodeId);

            // Resolve this specific path to an endpoint ID
            if (pathCallInfo.getTargetService() != null && pathCallInfo.getEndpoint() != null &&
                pathCallInfo.getHttpMethod() != null && patternIndex != null) {

                EndpointMatchResult result = patternIndex.resolve(
                    pathCallInfo.getTargetService(),
                    pathCallInfo.getEndpoint(),
                    pathCallInfo.getHttpMethod()
                );

                if (result.isMatched()) {
                    pathCallInfo.setTargetEndpointId(result.getEndpointId());
                    pathCallInfo.setEndpointResolved(true);
                    pathCallInfo.setNormalizedUrl(result.getTemplateUrl());
                } else {
                    pathCallInfo.setTargetEndpointId(null);
                    pathCallInfo.setEndpointResolved(false);
                    pathCallInfo.setNormalizedUrl(null);
                }
            } else {
                pathCallInfo.setEndpointResolved(false);
            }

            // Create the node for this path
            int nodeIndex = createSingleRemoteCallNode(callExpr, pathCallInfo, location, context);
            createdNodeIndices.add(nodeIndex);
        }

        // Return the last node index (for edge connection from previous node)
        // In the future, we might want to create a BRANCH node that connects to all paths
        // For now, just return the last one
        return createdNodeIndices.get(createdNodeIndices.size() - 1);
    }

    /**
     * Helper method to create a single remote call node.
     * Extracted to be reused by both normal flow and conditional flow.
     */
    private int createSingleRemoteCallNode(MethodCallExpr callExpr, MethodCallInfo callInfo,
                                          SourceLocation location, EnhancedFlowContext context) {
        // Set additional call information
        callInfo.setReturnUsed(isReturnValueUsed(callExpr));
        callInfo.setIsStatic(isStaticCall(callExpr));

        // Store full source code
        String fullSourceCode = callExpr.toString();

        // Create description
        String description = callInfo.getDisplayDescription();

        // Create REMOTE_CALL node
        ImprovedCFGNode callNode = ImprovedCFGNode.createRemoteCall(
            0, description, "MethodCallExpr", location, callInfo
        );

        // Set full source code
        callNode.setSourceCode(fullSourceCode);

        // Add data flow information
        DataFlowInfo dataFlow = extractDataFlowFromMethodCall(callExpr, context);
        callNode.setDataFlow(dataFlow);

        // Track as potential exception source
        context.exceptionSources.add(icfg.getNodeCount());

        return icfg.addNode(callNode);
    }

    /**
     * Clone a MethodCallInfo object for creating multiple nodes.
     * Creates a shallow copy with all fields duplicated.
     */
    private MethodCallInfo cloneMethodCallInfo(MethodCallInfo original) {
        MethodCallInfo clone = new MethodCallInfo();
        clone.setTargetMethodId(original.getTargetMethodId());
        clone.setCanonicalId(original.getCanonicalId());
        clone.setResolved(original.getResolved());
        clone.setObjectType(original.getObjectType());
        clone.setReturnUsed(original.getReturnUsed());
        clone.setIsStatic(original.getIsStatic());
        clone.setCallType(original.getCallType());
        clone.setTargetService(original.getTargetService());
        clone.setEndpoint(original.getEndpoint());
        clone.setHttpMethod(original.getHttpMethod());
        clone.setIsAsync(original.getIsAsync());
        clone.setServiceDiscoveryPattern(original.getServiceDiscoveryPattern());
        clone.setTargetEndpointId(original.getTargetEndpointId());
        clone.setEndpointResolved(original.getEndpointResolved());
        clone.setNormalizedUrl(original.getNormalizedUrl());
        clone.setUrlVariableName(original.getUrlVariableName());
        clone.setHasConditionalUrl(original.getHasConditionalUrl());
        clone.setBranchCondition(original.getBranchCondition());
        clone.setPathBranchNodeId(original.getPathBranchNodeId());
        return clone;
    }

    /**
     * Resolve a remote call to an endpoint ID using pattern matching.
     * Attempts to resolve URL variables using the variableToUrl mapping.
     *
     * Updates the MethodCallInfo with:
     * - targetEndpointId: The resolved endpoint ID (if match found)
     * - endpointResolved: true/false
     * - normalizedUrl: The template URL from pattern matching
     *
     * @param callInfo The method call info to enrich with endpoint resolution
     * @param callExpr The method call expression (to extract URL variable name)
     * @param context The flow context containing variable mappings
     */
    private void resolveRemoteCallToEndpoint(MethodCallInfo callInfo, MethodCallExpr callExpr, EnhancedFlowContext context) {
        // Extract required information from the call
        String targetService = callInfo.getTargetService();
        String endpoint = callInfo.getEndpoint();
        edu.university.ecs.lab.common.models.enums.HttpMethod httpMethod = callInfo.getHttpMethod();

        // If endpoint is null or targetService is null, try to resolve from URL variable
        if ((endpoint == null || targetService == null) && callExpr.getArguments().size() > 0) {
            Expression urlArg = callExpr.getArguments().get(0);

            // Check if the URL is a variable name
            if (urlArg instanceof NameExpr) {
                String varName = ((NameExpr) urlArg).getNameAsString();

                // STEP 3: Check if this variable has conditional URLs
                List<ConditionalUrlInfo> conditionalUrls = context.conditionalUrls.get(varName);
                if (conditionalUrls != null && !conditionalUrls.isEmpty()) {
                    // This is a conditional URL - mark it for node duplication in Step 4
                    // Store the variable name and conditional info for later processing
                    callInfo.setUrlVariableName(varName);
                    callInfo.setHasConditionalUrl(true);
                    // Don't try to resolve now - we'll create multiple nodes in createEnhancedCallNode
                    // The resolution will happen in createMultipleConditionalRemoteCallNodes
                    return;
                }

                // Look up the variable in our URL mapping (single-value case)
                UrlInfo urlInfo = context.variableToUrl.get(varName);
                if (urlInfo != null) {
                    if (targetService == null && urlInfo.service != null) {
                        targetService = urlInfo.service;
                        callInfo.setTargetService(targetService);
                    }
                    if (endpoint == null && urlInfo.path != null) {
                        endpoint = urlInfo.path;
                        callInfo.setEndpoint(endpoint);
                    }
                } else {
                    callInfo.setUrlVariableName(varName);
                }
            }
        }

        // IMPROVEMENT: Fallback strategy 1 - Extract service from URL path
        // If we have an endpoint but no service, try to extract service from the URL pattern
        if (targetService == null && endpoint != null) {
            targetService = extractServiceFromUrlPath(endpoint);
            if (targetService != null) {
                callInfo.setTargetService(targetService);
            }
        }

        // IMPROVEMENT: Fallback strategy 2 - Use pattern index to find service by URL match
        // If still no service but we have endpoint and method, search all endpoints for a match
        if (targetService == null && endpoint != null && httpMethod != null && patternIndex != null) {
            String foundService = patternIndex.findServiceByUrlPath(endpoint, httpMethod);
            if (foundService != null) {
                targetService = foundService;
                callInfo.setTargetService(targetService);
            }
        }

        // Validate we have the necessary info
        if (targetService == null || endpoint == null || httpMethod == null) {
            callInfo.setEndpointResolved(false);
            return;
        }

        // Resolve using pattern index
        EndpointMatchResult result = patternIndex.resolve(targetService, endpoint, httpMethod);

        if (result.isMatched()) {
            // Resolution successful - attach endpoint ID
            callInfo.setTargetEndpointId(result.getEndpointId());
            callInfo.setEndpointResolved(true);
            callInfo.setNormalizedUrl(result.getTemplateUrl());
        } else {
            // IMPROVEMENT: Fallback strategy 3 - Try resolution with service found from URL lookup
            // The service we found might have a different normalization than what pattern index expects
            if (patternIndex != null) {
                // Try direct endpoint lookup across all services as last resort
                String foundService = patternIndex.findServiceByUrlPath(endpoint, httpMethod);
                if (foundService != null) {
                    // Retry resolution with the found service
                    EndpointMatchResult retryResult = patternIndex.resolve(foundService, endpoint, httpMethod);
                    if (retryResult.isMatched()) {
                        callInfo.setTargetService(foundService);
                        callInfo.setTargetEndpointId(retryResult.getEndpointId());
                        callInfo.setEndpointResolved(true);
                        callInfo.setNormalizedUrl(retryResult.getTemplateUrl());
                        return;
                    }
                }
            }

            // Resolution failed - explicitly set to null
            callInfo.setTargetEndpointId(null);
            callInfo.setEndpointResolved(false);
            callInfo.setNormalizedUrl(null);
        }
    }

    /**
     * Create an assignment node
     */
    private int createAssignmentNode(AssignExpr assignExpr, SourceLocation location, EnhancedFlowContext context) {
        String fullSourceCode = assignExpr.toString();
        String description = assignExpr.getTarget().toString() + " = ...";

        ImprovedCFGNode assignNode = ImprovedCFGNode.createAssignment(
            0, description, "AssignExpr", location
        );

        // Set full source code
        assignNode.setSourceCode(fullSourceCode);

        // Add data flow information
        DataFlowInfo dataFlow = new DataFlowInfo();

        // Target variable is modified
        if (assignExpr.getTarget() instanceof NameExpr) {
            String varName = ((NameExpr) assignExpr.getTarget()).getNameAsString();
            dataFlow.addModify(varName);

            // Track URL assignments (for conditional URL detection)
            // Check if the assigned value is a binary expression (string concatenation)
            Expression value = assignExpr.getValue();
            if (value instanceof BinaryExpr) {
                BinaryExpr binaryExpr = (BinaryExpr) value;
                if (binaryExpr.getOperator() == BinaryExpr.Operator.PLUS) {
                    UrlInfo urlInfo = extractUrlFromBinaryExpr(binaryExpr, context);
                    if (urlInfo != null) {
                        context.variableToUrl.put(varName, urlInfo);
                    }
                }
            }
        }

        // Value expression may use variables
        DataFlowInfo valueDataFlow = extractDataFlowFromExpression(assignExpr.getValue(), context);
        if (valueDataFlow.hasUses()) {
            for (String use : valueDataFlow.getUses()) {
                dataFlow.addUse(use);
            }
        }

        assignNode.setDataFlow(dataFlow);
        return icfg.addNode(assignNode);
    }

    /**
     * Extract data flow information from an expression
     */
    private DataFlowInfo extractDataFlowFromExpression(Expression expr, EnhancedFlowContext context) {
        DataFlowInfo dataFlow = new DataFlowInfo();

        // Simple variable extraction - can be enhanced
        expr.accept(new VoidVisitorAdapter<Void>() {
            @Override
            public void visit(NameExpr nameExpr, Void arg) {
                String varName = nameExpr.getNameAsString();
                if (context.availableVariables.contains(varName)) {
                    dataFlow.addUse(varName);
                }
                super.visit(nameExpr, arg);
            }
        }, null);

        return dataFlow;
    }

    /**
     * Extract data flow information from a method call
     */
    private DataFlowInfo extractDataFlowFromMethodCall(MethodCallExpr callExpr, EnhancedFlowContext context) {
        DataFlowInfo dataFlow = new DataFlowInfo();

        // Object being called on
        if (callExpr.getScope().isPresent() && callExpr.getScope().get() instanceof NameExpr) {
            String objectName = ((NameExpr) callExpr.getScope().get()).getNameAsString();
            if (context.availableVariables.contains(objectName)) {
                dataFlow.addUse(objectName);
            }
        }

        // Arguments
        for (Expression arg : callExpr.getArguments()) {
            DataFlowInfo argDataFlow = extractDataFlowFromExpression(arg, context);
            if (argDataFlow.hasUses()) {
                for (String use : argDataFlow.getUses()) {
                    dataFlow.addUse(use);
                }
            }
        }

        return dataFlow;
    }

    /**
     * Extract URL information from a binary expression (concatenation).
     * Handles patterns like: user_service_url + "/api/v1/userservice/users"
     * Supports nested concatenations, string literals, and variable references.
     *
     * @param binaryExpr The binary expression to analyze
     * @param context The flow context containing variable mappings
     * @return UrlInfo if URL pattern is found, null otherwise
     */
    private UrlInfo extractUrlFromBinaryExpr(BinaryExpr binaryExpr, EnhancedFlowContext context) {
        // CRITICAL: Only process PLUS operator (string concatenation)
        if (binaryExpr.getOperator() != BinaryExpr.Operator.PLUS) {
            return null;
        }

        Expression left = binaryExpr.getLeft();
        Expression right = binaryExpr.getRight();

        String service = null;
        String path = null;

        // Process left side
        if (left instanceof NameExpr) {
            // Left is a variable name
            String varName = ((NameExpr) left).getNameAsString();

            // Check if this variable is a service URL
            service = context.variableToService.get(varName);

            // Or check if it's already a URL we've tracked
            if (service == null && context.variableToUrl.containsKey(varName)) {
                UrlInfo existingUrl = context.variableToUrl.get(varName);
                service = existingUrl.service;
                path = existingUrl.path; // May have path from previous concatenation
            }

            // IMPROVED: Try to extract service name from variable name itself
            // Examples: order_service_url → ts-order-service, userServiceUrl → ts-user-service
            if (service == null) {
                service = extractServiceNameFromVariableName(varName);
            }
        } else if (left instanceof StringLiteralExpr) {
            // Left is a string literal (might be service name or base URL)
            String literal = ((StringLiteralExpr) left).getValue();
            // If it contains "-service", treat it as a service name
            if (literal.contains("-service") || literal.startsWith("http")) {
                service = literal;
            } else {
                // Otherwise it's part of the path
                path = literal;
            }
        } else if (left instanceof BinaryExpr) {
            // Left is a nested concatenation (e.g., (base + "/api") + "/users")
            BinaryExpr leftBinary = (BinaryExpr) left;
            // Only process if it's also a PLUS operator
            if (leftBinary.getOperator() == BinaryExpr.Operator.PLUS) {
                UrlInfo leftUrl = extractUrlFromBinaryExpr(leftBinary, context);
                if (leftUrl != null) {
                    service = leftUrl.service;
                    path = leftUrl.path;
                }
            }
        }

        // Process right side
        if (right instanceof StringLiteralExpr) {
            // Right is a string literal path
            String rightPath = ((StringLiteralExpr) right).getValue();
            if (path != null) {
                // Concatenate with existing path
                path = path + rightPath;
            } else {
                path = rightPath;
            }
        } else if (right instanceof NameExpr) {
            // Right is a variable reference
            String varName = ((NameExpr) right).getNameAsString();

            // Check if this variable has a tracked URL
            if (context.variableToUrl.containsKey(varName)) {
                UrlInfo rightUrl = context.variableToUrl.get(varName);
                // If we don't have a service yet, use the one from right side
                if (service == null && rightUrl.service != null) {
                    service = rightUrl.service;
                }
                // Concatenate paths
                if (rightUrl.path != null) {
                    if (path != null) {
                        path = path + rightUrl.path;
                    } else {
                        path = rightUrl.path;
                    }
                }
            } else {
                // Variable is not a URL - treat it as a path parameter placeholder
                // This handles cases like: base_url + "/api/users/" + id
                // Result: "/api/users/{id}"
                String placeholder = "{" + varName + "}";
                if (path != null) {
                    path = path + placeholder;
                } else {
                    path = placeholder;
                }
            }
        } else if (right instanceof BinaryExpr) {
            // Right is a nested concatenation
            BinaryExpr rightBinary = (BinaryExpr) right;
            // Only process if it's also a PLUS operator
            if (rightBinary.getOperator() == BinaryExpr.Operator.PLUS) {
                UrlInfo rightUrl = extractUrlFromBinaryExpr(rightBinary, context);
                if (rightUrl != null) {
                    if (service == null && rightUrl.service != null) {
                        service = rightUrl.service;
                    }
                    if (rightUrl.path != null) {
                        if (path != null) {
                            path = path + rightUrl.path;
                        } else {
                            path = rightUrl.path;
                        }
                    }
                }
            }
        }

        // IMPROVEMENT: If we have a path but no service, try to extract service from URL path
        if (service == null && path != null) {
            service = extractServiceFromUrlPath(path);
            if (service != null) {
                System.out.println("Extracted service " + service + " from URL path " + path + " in binary expression.");
            }
        }

        // Return UrlInfo if we found at least one component
        if (service != null || path != null) {
            return new UrlInfo(service, path);
        }

        return null;
    }

    /**
     * Process method calls within complex expressions (like return statements)
     */
    private void processMethodCallsInExpression(Expression expr, EnhancedFlowContext context) {
        // Traverse the expression tree to find and process method calls
        expr.accept(new VoidVisitorAdapter<Void>() {
            @Override
            public void visit(MethodCallExpr callExpr, Void arg) {
                SourceLocation callLocation = getSourceLocation(callExpr.getBegin().orElse(null));
                int callNode = createEnhancedCallNode(callExpr, callLocation, context);

                icfg.addEdge(ImprovedCFGEdge.createSequential(context.currentNode, callNode));
                context.currentNode = callNode;

                super.visit(callExpr, arg);
            }
        }, null);
    }

    // Utility methods

    private SourceLocation getSourceLocation(com.github.javaparser.Position position) {
        if (position != null) {
            return new SourceLocation(position.line, position.column);
        }
        return null;
    }

    private String getASTType(Expression expr) {
        return expr.getClass().getSimpleName();
    }

    private String getObjectType(MethodCallExpr callExpr) {
        if (callExpr.getScope().isPresent()) {
            return callExpr.getScope().get().toString();
        }
        return null;
    }

    private boolean isReturnValueUsed(MethodCallExpr callExpr) {
        // Simple heuristic - can be enhanced with parent node analysis
        return callExpr.getParentNode().map(parent ->
            parent instanceof AssignExpr || parent instanceof VariableDeclarator
        ).orElse(false);
    }

    private boolean isStaticCall(MethodCallExpr callExpr) {
        // Check if scope is a type reference rather than an object
        return callExpr.getScope().map(scope ->
            scope instanceof NameExpr && Character.isUpperCase(scope.toString().charAt(0))
        ).orElse(false);
    }

    private String truncateDescription(String description, int maxLength) {
        if (description.length() > maxLength) {
            return description.substring(0, maxLength - 3) + "...";
        }
        return description;
    }

    /**
     * Extract service name from variable name patterns.
     * Examples:
     *   - order_service_url → ts-order-service
     *   - userServiceUrl → ts-user-service
     *   - contactService → ts-contact-service
     *   - ts_auth_service_uri → ts-auth-service
     *
     * @param varName The variable name
     * @return The extracted service name, or null if no pattern matches
     */
    private String extractServiceNameFromVariableName(String varName) {
        if (varName == null || varName.isEmpty()) {
            return null;
        }

        String lower = varName.toLowerCase();

        // Remove common suffixes (_url, _uri, _endpoint, Url, Uri, Endpoint)
        lower = lower.replaceAll("(_url|_uri|_endpoint|url|uri|endpoint)$", "");

        // Check if the variable name contains "service" pattern
        if (lower.contains("service")) {
            // Convert camelCase/snake_case to words
            // Examples: orderService → order service, order_service → order service
            String servicePart = lower
                .replaceAll("_", " ")  // Replace underscores with spaces
                .replaceAll("([a-z])([A-Z])", "$1 $2")  // Split camelCase
                .toLowerCase()
                .trim();

            // Extract service name (everything before "service" or including "service")
            // Examples: "order service" → "order", "auth service" → "auth"
            if (servicePart.contains(" service")) {
                String[] parts = servicePart.split(" service");
                if (parts.length > 0 && !parts[0].isEmpty()) {
                    String serviceName = parts[0].trim();
                    // Remove common prefixes like "ts" if already present
                    serviceName = serviceName.replaceFirst("^ts\\s+", "");
                    // Convert to ts- format
                    return "ts-" + serviceName.replace(" ", "-") + "-service";
                }
            } else if (servicePart.endsWith("service")) {
                // Variable is just "service" - not specific enough
                return null;
            }
        }

        return null;
    }

    /**
     * Extract service name from URL path patterns.
     * The endpoint URL often contains the normalized service name within it.
     *
     * Examples:
     *   - /api/v1/orderservice/order/admin → ts-order-service
     *   - /api/v1/contactservice/contacts/{id} → ts-contacts-service
     *   - /api/v1/userservice/users/register → ts-user-service
     *   - /api/v1/orderOtherService/orderOther/admin → ts-order-other-service
     *
     * @param urlPath The endpoint URL path
     * @return The extracted service name, or null if no pattern matches
     */
    private String extractServiceFromUrlPath(String urlPath) {
        if (urlPath == null || urlPath.isEmpty()) {
            return null;
        }

        // Pattern 1: /api/v{n}/{servicename}/... where servicename ends with "service"
        // Examples: /api/v1/orderservice/order/admin → orderservice
        java.util.regex.Pattern pattern1 = java.util.regex.Pattern.compile(
            "/api/v\\d+/([a-zA-Z]+[Ss]ervice)/");
        java.util.regex.Matcher matcher1 = pattern1.matcher(urlPath);
        if (matcher1.find()) {
            String servicePart = matcher1.group(1).toLowerCase();
            // Remove "service" suffix and convert to ts- format
            servicePart = servicePart.replaceAll("service$", "");
            // Handle camelCase: orderOther → order-other
            servicePart = servicePart.replaceAll("([a-z])([A-Z])", "$1-$2").toLowerCase();
            return "ts-" + servicePart + "-service";
        }

        // Pattern 2: /api/v{n}/{servicename}_service/... (underscore variant)
        // Examples: /api/v1/order_service/order/admin → ts-order-service
        java.util.regex.Pattern pattern2 = java.util.regex.Pattern.compile(
            "/api/v\\d+/([a-zA-Z_]+)_service/");
        java.util.regex.Matcher matcher2 = pattern2.matcher(urlPath);
        if (matcher2.find()) {
            String servicePart = matcher2.group(1).toLowerCase().replace("_", "-");
            return "ts-" + servicePart + "-service";
        }

        // Pattern 3: /api/v{n}/{prefix}{Service}/... where Service is capitalized
        // Examples: /api/v1/orderOtherService/orderOther/admin → ts-order-other-service
        java.util.regex.Pattern pattern3 = java.util.regex.Pattern.compile(
            "/api/v\\d+/([a-z]+(?:[A-Z][a-z]+)*)Service/");
        java.util.regex.Matcher matcher3 = pattern3.matcher(urlPath);
        if (matcher3.find()) {
            String servicePart = matcher3.group(1);
            // Convert camelCase to kebab-case
            servicePart = servicePart.replaceAll("([a-z])([A-Z])", "$1-$2").toLowerCase();
            return "ts-" + servicePart + "-service";
        }

        // Pattern 4: Generic pattern - find any segment containing "service"
        // Split URL and find segment with service keyword
        String[] segments = urlPath.split("/");
        for (String segment : segments) {
            String lower = segment.toLowerCase();
            if (lower.contains("service") && !lower.equals("service")) {
                // Remove "service" and normalize
                String servicePart = lower.replaceAll("service", "");
                if (!servicePart.isEmpty()) {
                    // Handle underscores and camelCase
                    servicePart = servicePart.replace("_", "-");
                    servicePart = servicePart.replaceAll("([a-z])([A-Z])", "$1-$2").toLowerCase();
                    // Clean up multiple dashes
                    servicePart = servicePart.replaceAll("-+", "-").replaceAll("^-|-$", "");
                    if (!servicePart.isEmpty()) {
                        return "ts-" + servicePart + "-service";
                    }
                }
            }
        }

        return null;
    }

    private MethodCall findMatchingMethodCall(MethodCallExpr callExpr) {
        String methodName = callExpr.getNameAsString();
        for (MethodCall methodCall : methodCallTargets.keySet()) {
            if (methodName.equals(methodCall.getName())) {
                return methodCall;
            }
        }
        return null;
    }

    private boolean hasExited(EnhancedFlowContext context) {
        return !context.exitNodes.isEmpty();
    }

    private String resolveTargetMethodId(MethodCall methodCall) {
        // Resolve using DI-aware method resolution
        String methodName = methodCall.getName();
        String objectName = methodCall.getObjectName();
        String objectType = methodCall.getObjectType();

        // ALWAYS try DI resolution if we have an object name
        if (objectName != null && !objectName.isEmpty()) {
            String diResolvedType = resolveObjectType(objectName);
            if (diResolvedType != null) {
                objectType = diResolvedType;
            }
        }

        // Collect candidate methods that match the name
        List<IndexedMethod> candidates = new ArrayList<>();
        for (IndexedComponent component : components.values()) {
            if (component instanceof IndexedMethod) {
                IndexedMethod indexedMethod = (IndexedMethod) component;
                if (methodName.equals(indexedMethod.getName())) {
                    candidates.add(indexedMethod);
                }
            }
        }

        // If we have an object type, filter candidates by class
        // Prioritize concrete implementations over abstract/interface methods
        if (objectType != null && !objectType.isEmpty()) {
            // Get current method's microservice to ensure we only match within same microservice
            String currentMicroservice = null;
            String currentMethodId = icfg.getMethodId();
            if (currentMethodId != null) {
                IndexedComponent currentMethod = components.get(currentMethodId);
                if (currentMethod != null) {
                    currentMicroservice = currentMethod.getMicroservice();
                }
            }

            IndexedMethod abstractMatch = null;

            for (IndexedMethod candidate : candidates) {
                // CRITICAL: Only match methods from the same microservice
                if (currentMicroservice != null && !currentMicroservice.equals(candidate.getMicroservice())) {
                    continue; // Skip methods from different microservices
                }

                boolean matches = isTypeMatch(objectType, candidate.getClassName());

                if (matches) {
                    // Prefer concrete implementations (not abstract)
                    if (candidate.getIsAbstract() == null || !candidate.getIsAbstract()) {
                        // Found concrete implementation - use it immediately
                        return candidate.getId();
                    } else {
                        // Remember abstract match as fallback
                        if (abstractMatch == null) {
                            abstractMatch = candidate;
                        }
                    }
                }
            }

            // If we only found abstract/interface methods, use that as fallback
            if (abstractMatch != null) {
                return abstractMatch.getId();
            }
        }

        // If no type-specific match found within the same microservice,
        // fall back to any candidate from the same microservice (as a last resort)
        if (!candidates.isEmpty()) {
            // Get current method's microservice for filtering
            String currentMicroservice = null;
            String currentMethodId = icfg.getMethodId();
            if (currentMethodId != null) {
                IndexedComponent currentMethod = components.get(currentMethodId);
                if (currentMethod != null) {
                    currentMicroservice = currentMethod.getMicroservice();
                }
            }

            // Try to find any candidate from the same microservice
            if (currentMicroservice != null) {
                for (IndexedMethod candidate : candidates) {
                    if (currentMicroservice.equals(candidate.getMicroservice())) {
                        return candidate.getId();
                    }
                }
            }

            // If still no match from same microservice, return first candidate
            // (this handles cases where method calls cross microservice boundaries)
            return candidates.get(0).getId();
        }

        // Fallback to IR's targetMethodId if DI resolution failed
        if (methodCall.getTargetMethodId() != null) {
            return methodCall.getTargetMethodId();
        }

        return null;
    }

    /**
     * Resolve the type of an object/variable name by looking up field definitions.
     * Respects microservice boundaries - only looks for fields in the current microservice.
     */
    private String resolveObjectType(String objectName) {
        // Get current method's microservice to ensure we only match fields from same microservice
        String currentMicroservice = null;
        String currentMethodId = icfg.getMethodId();
        if (currentMethodId != null) {
            IndexedComponent currentMethod = components.get(currentMethodId);
            if (currentMethod != null) {
                currentMicroservice = currentMethod.getMicroservice();
            }
        }

        // Look for field definitions that match the object name in the same microservice
        for (IndexedComponent component : components.values()) {
            if (component instanceof IndexedField) {
                IndexedField field = (IndexedField) component;

                // CRITICAL: Only match fields from the same microservice
                if (currentMicroservice != null && !currentMicroservice.equals(field.getMicroservice())) {
                    continue;
                }

                if (objectName.equals(field.getName())) {
                    // If this is an @Autowired field with a resolved implementation, use that
                    if (field.isAutowired() && field.getResolvedImplementationType() != null) {
                        return field.getResolvedImplementationType();
                    }
                    // Otherwise, return the field type
                    return field.getEffectiveTypeName();
                }
            }
        }

        // Look for method parameters that match the object name
        // (parameters are in the current method's scope)
        // Note: This is limited because we don't have easy access to the current method context here
        return null;
    }

    /**
     * Check if a resolved type matches a class name
     */
    private boolean isTypeMatch(String resolvedType, String className) {
        if (resolvedType == null || className == null) {
            return false;
        }

        // Direct match
        if (resolvedType.equals(className)) {
            return true;
        }

        // Fully qualified match (e.g., "com.example.OrderStatus" matches "OrderStatus")
        if (resolvedType.endsWith("." + className)) {
            return true;
        }

        return false;
    }

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

    private void buildDataFlowSummary() {
        // Build comprehensive data flow summary for the method
        Set<String> modifiedVars = new HashSet<>();
        Set<String> returnVars = new HashSet<>();

        for (ImprovedCFGNode node : icfg.getNodes()) {
            if (node.hasDataFlow()) {
                DataFlowInfo dataFlow = node.getDataFlow();
                if (dataFlow.hasModifications()) {
                    modifiedVars.addAll(dataFlow.getModifies());
                }
                if (node.getType() == ImprovedCFGNode.NodeType.EXIT && dataFlow.hasUses()) {
                    returnVars.addAll(dataFlow.getUses());
                }
            }
        }

        icfg.setDataFlowSummary(
            new ArrayList<>(methodParameters),
            new ArrayList<>(declaredVariables),
            new ArrayList<>(modifiedVars),
            new ArrayList<>(returnVars)
        );
    }

    private void buildExceptionFlow(EnhancedFlowContext context) {
        // For now, create a simple exception flow mapping
        // This can be enhanced to handle specific exception types and catch blocks
        if (!context.exceptionSources.isEmpty()) {
            // Find catch handlers (simplified)
            for (ImprovedCFGNode node : icfg.getNodes()) {
                if (node.getType() == ImprovedCFGNode.NodeType.EXCEPTION) {
                    icfg.addExceptionFlow(context.exceptionSources, node.getId(), "Exception");
                    break;
                }
            }
        }
    }

    private void buildLoopStructure() {
        // Identify and record loop structures
        for (ImprovedCFGNode node : icfg.getNodes()) {
            if (node.isLoop() && node.getLoop() != null) {
                // Find loop body and exits (simplified implementation)
                List<Integer> body = new ArrayList<>();
                List<Integer> exits = new ArrayList<>();

                // This is a simplified version - can be enhanced with proper CFG analysis
                for (ImprovedCFGEdge edge : icfg.getEdgesFrom(node.getId())) {
                    if (edge.getType() == ImprovedCFGEdge.EdgeType.LOOP_ENTER) {
                        body.add(edge.getTo());
                    } else if (edge.getType() == ImprovedCFGEdge.EdgeType.LOOP_EXIT) {
                        exits.add(edge.getTo());
                    }
                }

                icfg.addLoopStructure(node.getId(), body, exits, node.getLoop().getType());
            }
        }
    }
}