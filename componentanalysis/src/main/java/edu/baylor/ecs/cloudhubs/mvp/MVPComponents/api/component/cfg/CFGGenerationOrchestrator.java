package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.cfg;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.MethodDeclaration;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.EndpointIndex;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedMethod;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.SpringDIContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedComponent;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg.EnhancedICFG;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg.ImprovedCFGEdge;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg.ImprovedCFGNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg.SourceLocation;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils.EndpointPatternIndex;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services.EnhancedASTControlFlowGenerator;

import edu.university.ecs.lab.common.models.ir.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

public class CFGGenerationOrchestrator {

    private final EndpointPatternIndex patternIndex;

    private String systemName;

    public CFGGenerationOrchestrator(EndpointIndex endpointIndex) {
        this.patternIndex = endpointIndex != null ? new EndpointPatternIndex(endpointIndex) : null;
    }

    /**
     * Generates control flow graphs for all methods in the system.
     *
     * @param system The microservice system
     * @param components Map of indexed components (including methods)
     * @param diContexts Map of Spring DI contexts by microservice name
     * @return Number of CFGs generated
     */
    public int generateCFGs(MicroserviceSystem system,
                           Map<String, IndexedComponent> components,
                           Map<String, SpringDIContext> diContexts) {
        // Store system name for path resolution
        this.systemName = system.getName();

        int cfgCount = 0;
        int totalMethods = 0;
        int enhancedCFGs = 0;
        int minimalCFGs = 0;

        // Generate CFGs for each microservice
        for (Microservice microservice : system.getMicroservices()) {
            String microserviceName = microservice.getName();
            SpringDIContext diContext = diContexts.get(microserviceName);

            for (AbstractClass abstractClass : microservice.getClasses()) {
                totalMethods += abstractClass.getMethods().size();
                int classCount = generateCFGsForClass(abstractClass, microserviceName, components, diContext);
                cfgCount += classCount;
            }
        }

        // Generate CFGs for orphaned classes
        for (ProjectFile orphan : system.getOrphans()) {
            if (orphan instanceof AbstractClass) {
                AbstractClass orphanedClass = (AbstractClass) orphan;
                totalMethods += orphanedClass.getMethods().size();
                int orphanCount = generateCFGsForClass(orphanedClass, "orphaned", components, null);
                cfgCount += orphanCount;
            }
        }

        // Count enhanced vs minimal CFGs
        for (IndexedComponent component : components.values()) {
            if (component instanceof IndexedMethod) {
                IndexedMethod method = (IndexedMethod) component;
                if (method.getControlFlowGraph() != null) {
                    int nodeCount = method.getControlFlowGraph().getNodes().size();
                    if (nodeCount > 2) {  // More than just entry and exit
                        enhancedCFGs++;
                    } else {
                        minimalCFGs++;
                    }
                }
            }
        }

        return cfgCount;
    }

    /**
     * Generates CFGs for all methods in a single class.
     *
     * @param abstractClass The class to process
     * @param microserviceName Name of the microservice
     * @param components Map of indexed components
     * @param diContext Spring DI context (may be null for orphaned classes)
     * @return Number of CFGs generated for this class
     */
    private int generateCFGsForClass(AbstractClass abstractClass, String microserviceName,
                                    Map<String, IndexedComponent> components, SpringDIContext diContext) {
        int count = 0;

        for (Method method : abstractClass.getMethods()) {
            // Find the indexed method in components
            String methodId = method.getID();
            IndexedComponent component = components.get(methodId);

            if (component == null) {
                continue;
            }

            if (!(component instanceof IndexedMethod)) {
                continue;
            }

            IndexedMethod indexedMethod = (IndexedMethod) component;

            // Check if it already has a CFG
            if (indexedMethod.getControlFlowGraph() != null) {
                continue;
            }

            // Generate CFG for this method
            try {
                EnhancedICFG controlFlowGraph = generateEnhancedICFG(method, components, abstractClass);
                indexedMethod.setControlFlowGraph(controlFlowGraph);
                count++;
            } catch (Exception ignored) { }
        }

        return count;
    }

    /**
     * Generates an enhanced ICFG for a single method.
     *
     * @param method The method to analyze
     * @param components Map of indexed components
     * @param context The containing class
     * @return The generated enhanced ICFG
     */
    private EnhancedICFG generateEnhancedICFG(Method method, Map<String, IndexedComponent> components,
                                             AbstractClass context) {
        String methodId = method.getID();
        EnhancedICFG icfg = new EnhancedICFG(methodId);

        // Create entry node with source location
        SourceLocation entryLocation = new SourceLocation(1);
        int entryIndex = icfg.addNode(ImprovedCFGNode.createEntry(0,
                method.getName() + "(" + getParameterTypes(method) + ")", entryLocation));
        icfg.setEntryNodeIndex(entryIndex);

        // Generate enhanced control flow using AST parsing
        if (!generateEnhancedASTBasedControlFlow(method, icfg, components, context)) {
            // If AST parsing fails, create a minimal enhanced CFG
            SourceLocation exitLocation = new SourceLocation(2);
            int exitIndex = icfg.addNode(ImprovedCFGNode.createExit(0, "return", exitLocation));
            icfg.addExitNodeIndex(exitIndex);
            icfg.addEdge(ImprovedCFGEdge.createSequential(entryIndex, exitIndex));
        }

        return icfg;
    }

    /**
     * Generates enhanced AST-based control flow by parsing the method source.
     *
     * @param method The Method IR component
     * @param icfg The enhanced ICFG to populate
     * @param components Map of indexed components
     * @param context The containing class for source file resolution
     * @return true if AST-based generation succeeded, false for fallback
     */
    private boolean generateEnhancedASTBasedControlFlow(Method method, EnhancedICFG icfg,
                                                       Map<String, IndexedComponent> components,
                                                       AbstractClass context) {
        try {
            // Get the source file path from the context class
            Path sourcePath = context.getPath();

            if (sourcePath == null) {
                return false;
            }

            if (!Files.exists(sourcePath)) {
                // Try to resolve the file path
                Path originalPath = sourcePath;
                sourcePath = resolveSourcePath(context);

                if (sourcePath == null || !Files.exists(sourcePath)) {
                    return false;
                }
            }

            // Parse the source file
            CompilationUnit cu = StaticJavaParser.parse(sourcePath.toFile());

            // Find the specific method declaration
            MethodDeclaration methodDecl = findMethodDeclaration(cu, method);

            if (methodDecl == null) {
                return false;
            }

            // Use the EnhancedASTControlFlowGenerator to populate the CFG
            EnhancedASTControlFlowGenerator flowGenerator =
                new EnhancedASTControlFlowGenerator(icfg, components, patternIndex);
            flowGenerator.generateControlFlow(methodDecl, method);

            return true;

        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Resolves the source path for a class, handling relative paths.
     *
     * @param clazz The class to resolve the path for
     * @return Resolved absolute path, or null if not resolvable
     */
    private Path resolveSourcePath(AbstractClass clazz) {
        Path path = clazz.getPath();
        if (path == null) {
            return null;
        }

        // If already absolute and exists, return as-is
        if (path.isAbsolute() && Files.exists(path)) {
            return path;
        }

        Path userDir = Path.of(System.getProperty("user.dir"));

        // Strip leading slash if present (common in IR paths)
        String pathStr = path.toString();
        if (pathStr.startsWith("/") || pathStr.startsWith("\\")) {
            pathStr = pathStr.substring(1);
        }

        // Try to resolve relative to clone/system-name directory
        // Pattern: clone/<system-name>/ts-service-name/src/...
        Path cloneDir = userDir.resolve("clone");
        if (Files.exists(cloneDir)) {
            // First, try using the system name directly
            if (systemName != null && !systemName.isEmpty()) {
                Path systemDir = cloneDir.resolve(systemName);
                if (Files.exists(systemDir)) {
                    Path resolved = systemDir.resolve(pathStr);
                    if (Files.exists(resolved)) {
                        return resolved;
                    }
                }
            }

            // Fallback: try each subdirectory in clone/
            try {
                for (Path systemDir : Files.list(cloneDir)
                        .filter(Files::isDirectory)
                        .toList()) {
                    Path resolved = systemDir.resolve(pathStr);
                    if (Files.exists(resolved)) {
                        return resolved;
                    }
                }
            } catch (Exception ignored) { }
        }

        // Try to resolve relative to current directory
        Path resolved = userDir.resolve(pathStr);
        if (Files.exists(resolved)) {
            return resolved;
        }

        // Try parent directory (common in multi-module projects)
        Path parent = userDir.getParent();
        if (parent != null) {
            resolved = parent.resolve(pathStr);
            if (Files.exists(resolved)) {
                return resolved;
            }
        }

        return null;
    }

    /**
     * Finds a method declaration in a compilation unit.
     *
     * @param cu The compilation unit
     * @param method The method to find
     * @return MethodDeclaration, or null if not found
     */
    private MethodDeclaration findMethodDeclaration(CompilationUnit cu, Method method) {
        String methodName = method.getName();
        int paramCount = method.getParameters().size();

        for (MethodDeclaration methodDecl : cu.findAll(MethodDeclaration.class)) {
            if (methodDecl.getNameAsString().equals(methodName) &&
                methodDecl.getParameters().size() == paramCount) {
                return methodDecl;
            }
        }

        return null;
    }

    /**
     * Gets parameter types as a string for display purposes.
     *
     * @param method The method
     * @return Comma-separated parameter types
     */
    private String getParameterTypes(Method method) {
        if (method.getParameters().isEmpty()) {
            return "";
        }

        return method.getParameters().stream()
            .map(param -> {
                String type = param.getParameterType();
                // Extract simple type name
                int lastDot = type.lastIndexOf('.');
                return lastDot >= 0 ? type.substring(lastDot + 1) : type;
            })
            .reduce((a, b) -> a + ", " + b)
            .orElse("");
    }
}
