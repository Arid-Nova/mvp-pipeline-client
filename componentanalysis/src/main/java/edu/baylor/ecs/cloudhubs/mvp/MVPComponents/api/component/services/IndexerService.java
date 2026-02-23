package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.MethodDeclaration;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.cfg.CFGGenerationOrchestrator;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.component.ComponentIndexingOrchestrator;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg.EnhancedICFG;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg.ImprovedCFGEdge;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg.ImprovedCFGNode;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg.SourceLocation;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils.TypeInfo;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils.PathPatternMatcher;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils.TypeResolutionUtils;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils.EndpointPatternIndex;

import edu.university.ecs.lab.common.models.ir.*;
import edu.university.ecs.lab.common.config.Config;
import edu.university.ecs.lab.common.utils.JsonReadWriteUtils;
import edu.university.ecs.lab.intermediate.create.services.IRExtractionService;

import org.eclipse.jgit.api.errors.GitAPIException;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;

/**
 * Service for creating O(1) lookup indexes of microservice components.
 * Indexes methods, fields, and annotations using service-scoped IDs as keys.
 *
 * @deprecated This class is deprecated in favor of the new refactored architecture.
 *             Use {@link ComponentIndexer} instead, which uses:
 *             <ul>
 *               <li>{@link ComponentIndexingOrchestrator} for Phase 2</li>
 *               <li>{@link CFGGenerationOrchestrator} for Phase 3</li>
 *             </ul>
 *             This class remains for backward compatibility but will be removed in a future version.
 */
@Deprecated
public class IndexerService {

    /**
     * Configuration object
     */
    private final Config config;

    /**
     * Endpoint index from Phase 1 (endpoint indexing)
     */
    private final EndpointIndex endpointIndex;

    /**
     * Pattern index built from endpoint index for URL matching
     */
    private final EndpointPatternIndex patternIndex;

    /**
     * Spring DI contexts per microservice for resolving @Autowired injections
     * Key: microservice name, Value: SpringDIContext
     */
    private final Map<String, SpringDIContext> diContexts;

    /**
     * Constructor for IndexerService (Phase 2)
     *
     * @param config Configuration for the service
     * @param endpointIndex Endpoint index from Phase 1
     */
    public IndexerService(Config config, EndpointIndex endpointIndex) {
        this.config = config;
        this.endpointIndex = endpointIndex;
        this.patternIndex = endpointIndex != null ? new EndpointPatternIndex(endpointIndex) : null;
        this.diContexts = new HashMap<>();
    }

    /**
     * Legacy constructor for backward compatibility (no endpoint resolution)
     *
     * @param config Configuration for the service
     * @deprecated Use IndexerService(Config, EndpointIndex) for full Phase 2 functionality
     */
    @Deprecated
    public IndexerService(Config config) {
        this.config = config;
        this.endpointIndex = null;
        this.patternIndex = null;
        this.diContexts = new HashMap<>();
    }


    /**
     * Instance method to create an index from a configuration using instance settings
     *
     * @param config Configuration for the microservice system
     * @return The generated component index
     * @throws GitAPIException If Git operations fail
     * @throws IOException If file operations fail
     * @throws InterruptedException If the process is interrupted
     */
    public ComponentIndex createFromConfig(Config config) throws GitAPIException, IOException, InterruptedException {
        MicroserviceSystem system = IRExtractionService.create(config);
        return generateIndex(system);
    }

    /**
     * Static method to create an index from a microservice system
     * 
     * @param system The microservice system to index
     * @return The generated component index
     */
    public static ComponentIndex create(MicroserviceSystem system) {
        IndexerService service = new IndexerService(null);
        return service.generateIndex(system);
    }
    
    /**
     * Static method to create an index and write it to a file
     * 
     * @param system The microservice system to index
     * @param outputPath Path to write the index JSON file
     * @return The generated component index
     * @throws IOException If writing to file fails
     */
    public static ComponentIndex createAndWrite(MicroserviceSystem system, Path outputPath) throws IOException {
        IndexerService service = new IndexerService(null);
        ComponentIndex index = service.generateIndex(system);
        service.writeIndexToFile(index, outputPath);
        return index;
    }
    
    /**
     * Static method to create an index from a configuration (extracts IR and creates index)
     * 
     * @param config Configuration for the microservice system
     * @return The generated component index
     * @throws GitAPIException If git operations fail
     * @throws IOException If file operations fail
     * @throws InterruptedException If process is interrupted
     */
    public static ComponentIndex create(Config config) throws GitAPIException, IOException, InterruptedException {
        IndexerService service = new IndexerService(config);
        return service.generateIndexFromConfig();
    }
    
    /**
     * Static method to create an index from a configuration with specific commit
     * 
     * @param config Configuration for the microservice system
     * @param commitID Specific commit to extract and index
     * @return The generated component index
     * @throws GitAPIException If git operations fail
     * @throws IOException If file operations fail
     * @throws InterruptedException If process is interrupted
     */
    public static ComponentIndex create(Config config, String commitID) throws GitAPIException, IOException, InterruptedException {
        IndexerService service = new IndexerService(config);
        return service.generateIndexFromConfig(commitID);
    }
    
    /**
     * Static method to create an index from a configuration and write it to a file
     * 
     * @param config Configuration for the microservice system
     * @param outputPath Path to write the index JSON file
     * @return The generated component index
     * @throws GitAPIException If git operations fail
     * @throws IOException If file operations fail
     * @throws InterruptedException If process is interrupted
     */
    public static ComponentIndex createAndWrite(Config config, Path outputPath) throws GitAPIException, IOException, InterruptedException {
        ComponentIndex index = create(config);
        JsonReadWriteUtils.writeToJSON(outputPath, index);
        return index;
    }
    
    /**
     * Static method to create an index from a configuration with specific commit and write it to a file
     * 
     * @param config Configuration for the microservice system
     * @param commitID Specific commit to extract and index
     * @param outputPath Path to write the index JSON file
     * @return The generated component index
     * @throws GitAPIException If git operations fail
     * @throws IOException If file operations fail
     * @throws InterruptedException If process is interrupted
     */
    public static ComponentIndex createAndWrite(Config config, String commitID, Path outputPath) throws GitAPIException, IOException, InterruptedException {
        ComponentIndex index = create(config, commitID);
        JsonReadWriteUtils.writeToJSON(outputPath, index);
        return index;
    }
    
    /**
     * Static method to create an index from an existing IR file
     * 
     * @param irPath Path to the IR JSON file
     * @return The generated component index
     * @throws IOException If reading from file fails
     */
    public static ComponentIndex createFromIR(Path irPath) throws IOException {
        MicroserviceSystem system = JsonReadWriteUtils.readFromJSON(irPath, MicroserviceSystem.class);
        return create(system);
    }
    
    /**
     * Static method to create an index from an existing IR file and write it to a file
     * 
     * @param irPath Path to the IR JSON file
     * @param outputPath Path to write the index JSON file
     * @return The generated component index
     * @throws IOException If reading from file or writing to file fails
     */
    public static ComponentIndex createFromIRAndWrite(Path irPath, Path outputPath) throws IOException {
        MicroserviceSystem system = JsonReadWriteUtils.readFromJSON(irPath, MicroserviceSystem.class);
        return createAndWrite(system, outputPath);
    }
    
    /**
     * Static method to read an existing index from a file
     * 
     * @param inputPath Path to the index JSON file
     * @return The loaded component index
     * @throws IOException If reading from file fails
     */
    public static ComponentIndex read(Path inputPath) throws IOException {
        return JsonReadWriteUtils.readFromJSON(inputPath, ComponentIndex.class);
    }
    
    /**
     * Generate an index from configuration (extracts IR first, then creates index)
     * 
     * @return The generated component index
     * @throws GitAPIException If git operations fail
     * @throws IOException If file operations fail
     * @throws InterruptedException If process is interrupted
     */
    public ComponentIndex generateIndexFromConfig() throws GitAPIException, IOException, InterruptedException {
        if (config == null) {
            throw new IllegalStateException("Config is required for IR extraction");
        }
        
        // Extract IR from the configured repository using the static method
        MicroserviceSystem system = IRExtractionService.create(config);
        
        // Generate index from the extracted IR
        return generateIndex(system);
    }
    
    /**
     * Generate an index from configuration with specific commit
     * 
     * @param commitID Specific commit to extract and index
     * @return The generated component index
     * @throws GitAPIException If git operations fail
     * @throws IOException If file operations fail
     * @throws InterruptedException If process is interrupted
     */
    public ComponentIndex generateIndexFromConfig(String commitID) throws GitAPIException, IOException, InterruptedException {
        if (config == null) {
            throw new IllegalStateException("Config is required for IR extraction");
        }
        
        // Extract IR from the configured repository at specific commit using the static method
        MicroserviceSystem system = IRExtractionService.create(config, commitID);
        
        // Generate index from the extracted IR
        return generateIndex(system);
    }
    
    /**
     * Generate a complete index from a microservice system using reference-based approach
     * 
     * @param system The microservice system to index
     * @return The generated component index
     */
    /**
     * Phase 2: Generate component index (methods, fields, classes, annotations).
     * Endpoints are NOT included - they are handled in Phase 1 by EndpointIndexer.
     *
     * @param system The microservice system to index
     * @return The generated component index (without endpoints)
     */
    public ComponentIndex generateIndex(MicroserviceSystem system) {
        Map<String, IndexedComponent> components = new HashMap<>();
        Map<String, Integer> componentCounts = new HashMap<>();

        // Initialize component type counters (NO endpoints - handled in Phase 1)
        componentCounts.put("Field", 0);
        componentCounts.put("Method", 0);
        componentCounts.put("Annotation", 0);
        componentCounts.put("Class", 0);

        // Phase 2.1: Collect all referenced types
        Set<String> referencedTypes = collectReferencedTypes(system);

        // Phase 2.2: Index referenced classes only
        indexReferencedClasses(referencedTypes, system, components, componentCounts);

        // Phase 2.2.5: Build Spring DI contexts for each microservice
        for (Microservice microservice : system.getMicroservices()) {
            SpringDIContext diContext = buildSpringDIContext(microservice, components);
            diContexts.put(microservice.getName(), diContext);

            // Diagnostic: test if AdminOrderService interface resolves to implementation
            var testResolution = diContext.resolveAutowiredField("com.cloudhubs.trainticket.order.service.AdminOrderService");
        }

        // Phase 2.3: Index components (methods, fields, annotations) WITHOUT CFG generation
        // NOTE: Endpoints are indexed in Phase 1, CFGs are generated in Phase 2.4
        for (Microservice microservice : system.getMicroservices()) {
            indexMicroserviceWithTypeReferences(microservice, components, componentCounts, system);
        }

        // Index orphaned files
        for (ProjectFile orphan : system.getOrphans()) {
            if (orphan instanceof AbstractClass) {
                AbstractClass orphanedClass = (AbstractClass) orphan;
                indexClassWithTypeReferences(orphanedClass, "orphaned", components, componentCounts, system);
            }
        }

        // Phase 2.4: Generate CFGs for all methods with full component context
        System.out.println("Phase 2.4: Starting CFG generation");
        int cfgCount = 0;
        for (Microservice microservice : system.getMicroservices()) {
            String microserviceName = microservice.getName();
            SpringDIContext diContext = diContexts.get(microserviceName);
            System.out.println("Processing microservice: " + microserviceName + " with " + microservice.getClasses().size() + " classes");

            for (AbstractClass abstractClass : microservice.getClasses()) {
                int classCount = generateCFGsForClass(abstractClass, microserviceName, components, diContext);
                System.out.println("  Generated " + classCount + " CFGs for class: " + abstractClass.getName());
                cfgCount += classCount;
            }
        }

        // Generate CFGs for orphaned classes
        for (ProjectFile orphan : system.getOrphans()) {
            if (orphan instanceof AbstractClass) {
                AbstractClass orphanedClass = (AbstractClass) orphan;
                cfgCount += generateCFGsForClass(orphanedClass, "orphaned", components, null);
            }
        }

        // Extract all roles from the system
        // If we have access to endpointIndex (Phase 2), get roles from there
        // Otherwise, extract from SecurityConfig files
        Set<String> allRoles = new HashSet<>();
        if (this.endpointIndex != null) {
            // Get roles from Phase 1 endpoint index
            for (EndpointInfo endpoint : this.endpointIndex.getEndpoints().values()) {
                if (endpoint.getAuthorization() != null &&
                    endpoint.getAuthorization().getRequiredRoles() != null) {
                    allRoles.addAll(endpoint.getAuthorization().getRequiredRoles());
                }
            }
        } else {
            // Fallback: Extract roles from SecurityConfig files directly
            for (Microservice microservice : system.getMicroservices()) {
                Set<String> microserviceRoles = extractRolesFromMicroservice(microservice);
                allRoles.addAll(microserviceRoles);
            }
        }

        // Create metadata
        IndexMetadata metadata = new IndexMetadata();
        metadata.setSystemName(system.getName());
        metadata.setCommitId(system.getCommitID());
        metadata.setIndexedAt(Instant.now().toString());
        metadata.setTotalComponents(components.size());
        metadata.setComponentCounts(componentCounts);
        metadata.setMicroserviceCount(system.getMicroservices().size());
        metadata.setRoleCount(allRoles.size());
        metadata.setRoles(new ArrayList<>(allRoles));  // Set the actual roles

        // Create and return the index (WITHOUT endpoints)
        ComponentIndex index = new ComponentIndex();
        index.setComponents(components);
        index.setMetadata(metadata);
        index.setRoles(allRoles);  // Set the root-level roles

        return index;
    }
    
    /**
     * Index all components in a microservice
     * 
     * @param microservice The microservice to index
     * @param components Map to store indexed components
     * @param componentCounts Map to track component counts
     */
    private void indexMicroservice(Microservice microservice, Map<String, IndexedComponent> components, 
                                   Map<String, Integer> componentCounts) {
        // Process all classes in the microservice
        for (AbstractClass abstractClass : microservice.getClasses()) {
            indexClass(abstractClass, microservice.getName(), components, componentCounts);
        }
    }
    
    /**
     * Index all components in a class
     * 
     * @param abstractClass The class to index
     * @param microserviceName Name of the containing microservice
     * @param components Map to store indexed components
     * @param componentCounts Map to track component counts
     */
    private void indexClass(AbstractClass abstractClass, String microserviceName, 
                            Map<String, IndexedComponent> components, Map<String, Integer> componentCounts) {
        String className = abstractClass.getName();
        
        // Index class-level annotations
        for (Annotation annotation : abstractClass.getAnnotations()) {
            indexComponent(annotation, microserviceName, className, components, componentCounts);
        }
        
        // Index fields
        for (Field field : abstractClass.getFields()) {
            indexComponent(field, microserviceName, className, components, componentCounts);
        }
        
        // Index methods and their annotations/parameters
        for (Method method : abstractClass.getMethods()) {
            indexComponent(method, microserviceName, className, components, componentCounts);
            
            // Index method annotations (already included in the Method object but explicitly indexed here for completeness)
            for (Annotation annotation : method.getAnnotations()) {
                indexComponent(annotation, microserviceName, className, components, componentCounts);
            }
            
            // Index parameter annotations
            for (Parameter parameter : method.getParameters()) {
                for (Annotation annotation : parameter.getAnnotations()) {
                    indexComponent(annotation, microserviceName, className, components, componentCounts);
                }
            }
            
            // Skip method calls as per the plan (will be added later)
        }
    }
    
    /**
     * Index an individual component
     * 
     * @param component The component to index
     * @param microserviceName Name of the containing microservice
     * @param className Name of the containing class
     * @param components Map to store indexed components
     * @param componentCounts Map to track component counts
     */
    private void indexComponent(Component component, String microserviceName, String className,
                                Map<String, IndexedComponent> components, Map<String, Integer> componentCounts) {
        // Only index methods, fields, and annotations as per the plan
        if (!(component instanceof Method || component instanceof Field || component instanceof Annotation)) {
            return;
        }
        
        IndexedComponent indexed = buildIndexedComponent(component, microserviceName, className);
        if (indexed != null) {
            components.put(indexed.getId(), indexed);
            
            // Update component counts using proper keys
            String type = indexed.getType();
            componentCounts.put(type, componentCounts.get(type) + 1);
        }
    }
    
    
    /**
     * Create an IndexedField from a Field IR component
     * 
     * @param field The Field IR component
     * @param microserviceName Name of the containing microservice
     * @param className Name of the containing class
     * @return The enhanced IndexedField
     */
    private IndexedField createIndexedField(Field field, String microserviceName, String className) {
        return new IndexedField(
            "Field",
            field.getName(),
            field.getID(),
            field.getFullID(),
            microserviceName,
            className,
            field.getMetadata(),
            field.getFieldType(),
            field.getProtection() != null ? field.getProtection().toString() : null,
            field.getIsStatic(),
            field.getIsFinal()
        );
    }
    
    /**
     * Create an IndexedMethod from a Method IR component
     * 
     * @param method The Method IR component
     * @param microserviceName Name of the containing microservice
     * @param className Name of the containing class
     * @return The enhanced IndexedMethod
     */
    private IndexedMethod createIndexedMethod(Method method, String microserviceName, String className) {
        return new IndexedMethod(
            "Method",
            method.getName(),
            method.getID(),
            method.getFullID(),
            microserviceName,
            className,
            method.getMetadata(),
            method.getProtection() != null ? method.getProtection().toString() : null,
            method.getReturnType(),
            method.getIsAbstract(),
            method.getIsStatic(),
            method.getIsFinal(),
            method.getIsConstructor(),
            method.getAnnotations(),
            method.getThrownExceptions()
        );
    }
    
    /**
     * Create an IndexedAnnotation from an Annotation IR component
     * 
     * @param annotation The Annotation IR component
     * @param microserviceName Name of the containing microservice
     * @param className Name of the containing class
     * @return The enhanced IndexedAnnotation
     */
    private IndexedAnnotation createIndexedAnnotation(Annotation annotation, String microserviceName, String className) {
        return new IndexedAnnotation(
            "Annotation",
            annotation.getName(),
            annotation.getID(),
            annotation.getFullID(),
            microserviceName,
            className,
            annotation.getMetadata(),
            annotation.getAttributes()
        );
    }

    /**
     * Build an IndexedComponent from a Component using enhanced factory methods
     * 
     * @param component The component to convert
     * @param microserviceName Name of the containing microservice
     * @param className Name of the containing class
     * @return The enhanced indexed component, or null if unable to index
     */
    private IndexedComponent buildIndexedComponent(Component component, String microserviceName, String className) {
        if (component instanceof Field) {
            return createIndexedField((Field) component, microserviceName, className);
        } else if (component instanceof Method) {
            return createIndexedMethod((Method) component, microserviceName, className);
        } else if (component instanceof Annotation) {
            return createIndexedAnnotation((Annotation) component, microserviceName, className);
        } else {
            return null; // Skip other types
        }
    }
    
    /**
     * Detect the target service for a method call (for cross-service call detection)
     * 
     * @param methodCall The method call to analyze
     * @param currentService The current service context
     * @return The detected target service name, or null if same service
     */
    private String detectTargetService(MethodCall methodCall, String currentService) {
        // If the method call has a target method ID, we can extract the service from it
        String targetId = methodCall.getTargetMethodId();
        if (targetId != null && targetId.contains(":")) {
            String targetService = targetId.substring(0, targetId.indexOf(":"));
            if (!targetService.equals(currentService)) {
                return targetService;
            }
        }
        
        // TODO: Implement more sophisticated service detection based on:
        // - Object type analysis
        // - Package naming conventions
        // - Import analysis
        
        return null;
    }
    
    /**
     * Write an index to a JSON file
     * 
     * @param index The index to write
     * @param outputPath Path to write the JSON file
     * @throws IOException If writing fails
     */
    public void writeIndexToFile(ComponentIndex index, Path outputPath) throws IOException {
        JsonReadWriteUtils.writeToJSON(outputPath, index);
    }
    
    /**
     * Create an index from a system and write it to a file
     * 
     * @param system The microservice system to index
     * @param outputPath Path to write the JSON file
     * @return The generated component index
     * @throws IOException If writing fails
     */
    public ComponentIndex createIndexFromSystem(MicroserviceSystem system, Path outputPath) throws IOException {
        ComponentIndex index = generateIndex(system);
        writeIndexToFile(index, outputPath);
        return index;
    }
    
    /**
     * Collect all types that are referenced in the system (Phase 1 of reference-based indexing)
     * 
     * @param system The microservice system to analyze
     * @return Set of fully qualified type names that are referenced
     */
    private Set<String> collectReferencedTypes(MicroserviceSystem system) {
        Set<String> referencedTypes = new HashSet<>();
        
        // Collect types from all microservices
        for (Microservice microservice : system.getMicroservices()) {
            for (AbstractClass abstractClass : microservice.getClasses()) {
                collectTypesFromClass(abstractClass, referencedTypes);
            }
        }
        
        // Collect types from orphaned files
        for (ProjectFile orphan : system.getOrphans()) {
            if (orphan instanceof AbstractClass) {
                collectTypesFromClass((AbstractClass) orphan, referencedTypes);
            }
        }
        
        return referencedTypes;
    }
    
    /**
     * Collect types referenced in a single class
     * 
     * @param clazz The class to analyze
     * @param referencedTypes Set to add referenced types to
     */
    private void collectTypesFromClass(AbstractClass clazz, Set<String> referencedTypes) {
        // Collect superclass and interface types (different for each class type)
        if (clazz instanceof JClass) {
            JClass jClass = (JClass) clazz;
            // Collect superclass type
            if (jClass.getExtendedType() != null && !jClass.getExtendedType().equals("Object")) {
                String resolvedSuperclass = TypeResolutionUtils.resolveType(jClass.getExtendedType(), clazz.getImports());
                referencedTypes.add(resolvedSuperclass);
            }
            
            // Collect interface types
            if (jClass.getImplementedTypes() != null) {
                for (String interfaceName : jClass.getImplementedTypes()) {
                    String resolvedInterface = TypeResolutionUtils.resolveType(interfaceName, clazz.getImports());
                    referencedTypes.add(resolvedInterface);
                }
            }
        }
        // TODO: Add support for JInterface, JEnum, JRecord if they have inheritance
        
        // Collect field types
        for (Field field : clazz.getFields()) {
            collectTypesFromField(field, referencedTypes, clazz);
        }
        
        // Collect method types (return types and parameter types)
        for (Method method : clazz.getMethods()) {
            collectTypesFromMethod(method, referencedTypes, clazz);
        }
    }
    
    /**
     * Collect types referenced in a field
     * 
     * @param field The field to analyze
     * @param referencedTypes Set to add referenced types to
     * @param context The containing class for import resolution
     */
    private void collectTypesFromField(Field field, Set<String> referencedTypes, AbstractClass context) {
        String fieldType = field.getFieldType();
        if (fieldType != null) {
            // Parse the type to handle generics and arrays
            TypeInfo typeInfo = TypeResolutionUtils.parseGenericType(fieldType);
            if (typeInfo != null) {
                // Resolve and add the base type
                String resolvedBaseType = TypeResolutionUtils.resolveType(typeInfo.getBaseType(), context.getImports());
                typeInfo.setFullyQualifiedBaseType(resolvedBaseType);
                referencedTypes.add(resolvedBaseType);
                
                // Add generic parameter types
                for (TypeInfo genericParam : typeInfo.getGenericParameters()) {
                    String resolvedGenericType = TypeResolutionUtils.resolveType(genericParam.getBaseType(), context.getImports());
                    genericParam.setFullyQualifiedBaseType(resolvedGenericType);
                    referencedTypes.add(resolvedGenericType);
                }
            }
        }
    }
    
    /**
     * Collect types referenced in a method
     * 
     * @param method The method to analyze
     * @param referencedTypes Set to add referenced types to
     * @param context The containing class for import resolution
     */
    private void collectTypesFromMethod(Method method, Set<String> referencedTypes, AbstractClass context) {
        // Collect return type
        String returnType = method.getReturnType();
        if (returnType != null && !returnType.equals("void")) {
            TypeInfo returnTypeInfo = TypeResolutionUtils.parseGenericType(returnType);
            if (returnTypeInfo != null) {
                String resolvedReturnType = TypeResolutionUtils.resolveType(returnTypeInfo.getBaseType(), context.getImports());
                returnTypeInfo.setFullyQualifiedBaseType(resolvedReturnType);
                referencedTypes.add(resolvedReturnType);
                
                // Add generic parameter types
                for (TypeInfo genericParam : returnTypeInfo.getGenericParameters()) {
                    String resolvedGenericType = TypeResolutionUtils.resolveType(genericParam.getBaseType(), context.getImports());
                    genericParam.setFullyQualifiedBaseType(resolvedGenericType);
                    referencedTypes.add(resolvedGenericType);
                }
            }
        }
        
        // Collect parameter types
        for (Parameter parameter : method.getParameters()) {
            String paramType = parameter.getParameterType();
            if (paramType != null) {
                TypeInfo paramTypeInfo = TypeResolutionUtils.parseGenericType(paramType);
                if (paramTypeInfo != null) {
                    String resolvedParamType = TypeResolutionUtils.resolveType(paramTypeInfo.getBaseType(), context.getImports());
                    paramTypeInfo.setFullyQualifiedBaseType(resolvedParamType);
                    referencedTypes.add(resolvedParamType);
                    
                    // Add generic parameter types
                    for (TypeInfo genericParam : paramTypeInfo.getGenericParameters()) {
                        String resolvedGenericType = TypeResolutionUtils.resolveType(genericParam.getBaseType(), context.getImports());
                        genericParam.setFullyQualifiedBaseType(resolvedGenericType);
                        referencedTypes.add(resolvedGenericType);
                    }
                }
            }
        }
        
        // Collect exception types
        if (method.getThrownExceptions() != null) {
            for (String exceptionType : method.getThrownExceptions()) {
                String resolvedExceptionType = TypeResolutionUtils.resolveType(exceptionType, context.getImports());
                referencedTypes.add(resolvedExceptionType);
            }
        }
    }
    
    /**
     * Index only the referenced classes (Phase 2 of reference-based indexing)
     * 
     * @param referencedTypes Set of type names that are referenced
     * @param system The microservice system
     * @param components Map to store indexed components
     * @param componentCounts Map to track component counts
     */
    private void indexReferencedClasses(Set<String> referencedTypes, MicroserviceSystem system, 
                                       Map<String, IndexedComponent> components, Map<String, Integer> componentCounts) {
        Map<String, AbstractClass> classMap = buildClassMap(system);
        
        for (String typeName : referencedTypes) {
            // Only index if it should be indexed according to our strategy
            if (TypeResolutionUtils.shouldIndexType(typeName)) {
                AbstractClass clazz = findClassByTypeName(typeName, classMap, system);
                if (clazz != null) {
                    // Determine microservice name
                    String microserviceName = determineMicroserviceName(clazz, system);
                    
                    // Create and store the indexed class
                    IndexedClass indexedClass = createIndexedClass(clazz, microserviceName);
                    components.put(indexedClass.getId(), indexedClass);
                    componentCounts.put("Class", componentCounts.get("Class") + 1);
                }
            }
        }
    }
    
    /**
     * Build a map of fully qualified class names to AbstractClass objects
     * 
     * @param system The microservice system
     * @return Map of class names to AbstractClass objects
     */
    private Map<String, AbstractClass> buildClassMap(MicroserviceSystem system) {
        Map<String, AbstractClass> classMap = new HashMap<>();
        
        // Add classes from microservices
        for (Microservice microservice : system.getMicroservices()) {
            for (AbstractClass clazz : microservice.getClasses()) {
                String fullyQualifiedName = buildFullyQualifiedClassName(clazz);
                classMap.put(fullyQualifiedName, clazz);
            }
        }
        
        // Add orphaned classes
        for (ProjectFile orphan : system.getOrphans()) {
            if (orphan instanceof AbstractClass) {
                AbstractClass clazz = (AbstractClass) orphan;
                String fullyQualifiedName = buildFullyQualifiedClassName(clazz);
                classMap.put(fullyQualifiedName, clazz);
            }
        }
        
        return classMap;
    }
    
    /**
     * Build the fully qualified class name from an AbstractClass
     * 
     * @param clazz The class
     * @return Fully qualified class name
     */
    private String buildFullyQualifiedClassName(AbstractClass clazz) {
        String packageName = clazz.getPackageName();
        String className = clazz.getName();
        
        if (packageName != null && !packageName.isEmpty()) {
            return packageName + "." + className;
        } else {
            return className;
        }
    }
    
    /**
     * Find a class by its type name
     * 
     * @param typeName The type name to find
     * @param classMap Map of class names to AbstractClass objects
     * @param system The microservice system
     * @return The AbstractClass if found, null otherwise
     */
    private AbstractClass findClassByTypeName(String typeName, Map<String, AbstractClass> classMap, MicroserviceSystem system) {
        // Direct lookup by fully qualified name
        AbstractClass clazz = classMap.get(typeName);
        if (clazz != null) {
            return clazz;
        }
        
        // Try to find by simple name (less reliable but covers some cases)
        String simpleTypeName = TypeResolutionUtils.extractSimpleTypeName(typeName);
        for (AbstractClass candidate : classMap.values()) {
            if (candidate.getName().equals(simpleTypeName)) {
                return candidate;
            }
        }
        
        return null;
    }
    
    /**
     * Determine the microservice name for a class
     * 
     * @param clazz The class
     * @param system The microservice system
     * @return The microservice name
     */
    private String determineMicroserviceName(AbstractClass clazz, MicroserviceSystem system) {
        // Check if class belongs to any microservice
        for (Microservice microservice : system.getMicroservices()) {
            if (microservice.getClasses().contains(clazz)) {
                return microservice.getName();
            }
        }
        
        // Check if it's an orphaned class
        if (system.getOrphans().contains(clazz)) {
            return "orphaned";
        }
        
        // Fallback
        return "unknown";
    }
    
    /**
     * Create an IndexedClass from an AbstractClass
     * 
     * @param abstractClass The AbstractClass to convert
     * @param microserviceName Name of the containing microservice
     * @return The IndexedClass
     */
    private IndexedClass createIndexedClass(AbstractClass abstractClass, String microserviceName) {
        String fullyQualifiedName = buildFullyQualifiedClassName(abstractClass);
        
        // Count statistics
        int methodCount = abstractClass.getMethods().size();
        int fieldCount = abstractClass.getFields().size();
        int annotationCount = abstractClass.getAnnotations().size();
        
        // Resolve superclass and interfaces (different for each class type)
        String superclass = null;
        Set<String> interfaces = new HashSet<>();
        
        if (abstractClass instanceof JClass) {
            JClass jClass = (JClass) abstractClass;
            if (jClass.getExtendedType() != null && !jClass.getExtendedType().equals("Object")) {
                superclass = TypeResolutionUtils.resolveType(jClass.getExtendedType(), abstractClass.getImports());
            }
            
            if (jClass.getImplementedTypes() != null) {
                for (String interfaceName : jClass.getImplementedTypes()) {
                    String resolvedInterface = TypeResolutionUtils.resolveType(interfaceName, abstractClass.getImports());
                    interfaces.add(resolvedInterface);
                }
            }
        }
        // TODO: Add support for JInterface, JEnum, JRecord if they have inheritance
        
        return new IndexedClass(
            "Class",
            abstractClass.getName(),
            abstractClass.getID(),
            abstractClass.getFullID(),
            microserviceName,
            abstractClass.getName(), // className same as name for classes
            abstractClass.getMetadata(),
            abstractClass.getPackageName(),
            superclass,
            null, // superclassId will be resolved later if needed
            interfaces,
            new HashSet<>(), // interfaceIds will be resolved later if needed
            abstractClass.getClassType(),
            abstractClass.getIsAbstract(),
            abstractClass.getIsFinal(),
            abstractClass.getIsStatic(),
            methodCount,
            fieldCount,
            annotationCount,
            fullyQualifiedName
        );
    }
    
    /**
     * Index all components in a microservice with type references (Phase 3)
     * 
     * @param microservice The microservice to index
     * @param components Map to store indexed components
     * @param componentCounts Map to track component counts
     * @param system The full microservice system for type resolution
     */
    private void indexMicroserviceWithTypeReferences(Microservice microservice, Map<String, IndexedComponent> components, 
                                                    Map<String, Integer> componentCounts, MicroserviceSystem system) {
        for (AbstractClass abstractClass : microservice.getClasses()) {
            indexClassWithTypeReferences(abstractClass, microservice.getName(), components, componentCounts, system);
        }
    }
    
    /**
     * Index all components in a class with type references (Phase 3)
     * 
     * @param abstractClass The class to index
     * @param microserviceName Name of the containing microservice
     * @param components Map to store indexed components
     * @param componentCounts Map to track component counts
     * @param system The full microservice system for type resolution
     */
    private void indexClassWithTypeReferences(AbstractClass abstractClass, String microserviceName, 
                                            Map<String, IndexedComponent> components, Map<String, Integer> componentCounts,
                                            MicroserviceSystem system) {
        String className = abstractClass.getName();
        
        // Index class-level annotations
        for (Annotation annotation : abstractClass.getAnnotations()) {
            indexComponent(annotation, microserviceName, className, components, componentCounts);
        }
        
        // Index fields with type references
        for (Field field : abstractClass.getFields()) {
            IndexedField indexedField = createIndexedFieldWithTypeReferences(field, microserviceName, className, abstractClass, components);
            if (indexedField != null) {
                components.put(indexedField.getId(), indexedField);
                componentCounts.put("Field", componentCounts.get("Field") + 1);
            }
        }
        
        // Index methods with type references
        for (Method method : abstractClass.getMethods()) {
            IndexedMethod indexedMethod = createIndexedMethodWithTypeReferences(method, microserviceName, className, abstractClass, components);
            if (indexedMethod != null) {
                components.put(indexedMethod.getId(), indexedMethod);
                componentCounts.put("Method", componentCounts.get("Method") + 1);
            }
            
            // Index method-level annotations
            for (Annotation annotation : method.getAnnotations()) {
                indexComponent(annotation, microserviceName, className, components, componentCounts);
            }
            
            // Index parameter annotations
            for (Parameter parameter : method.getParameters()) {
                for (Annotation annotation : parameter.getAnnotations()) {
                    indexComponent(annotation, microserviceName, className, components, componentCounts);
                }
            }
        }
    }
    
    /**
     * Create an IndexedField with type references
     * 
     * @param field The Field IR component
     * @param microserviceName Name of the containing microservice
     * @param className Name of the containing class
     * @param context The containing class for import resolution
     * @param components Map of all indexed components for type ID lookup
     * @return The enhanced IndexedField
     */
    private IndexedField createIndexedFieldWithTypeReferences(Field field, String microserviceName, String className,
                                                             AbstractClass context, Map<String, IndexedComponent> components) {
        // Start with basic field creation
        IndexedField indexedField = createIndexedField(field, microserviceName, className);

        // Add type references
        String fieldType = field.getFieldType();
        if (fieldType != null) {
            TypeInfo typeInfo = TypeResolutionUtils.parseGenericType(fieldType);
            if (typeInfo != null) {
                // Resolve base type
                String resolvedType = TypeResolutionUtils.resolveType(typeInfo.getBaseType(), context.getImports());
                indexedField.setFullyQualifiedType(resolvedType);

                // Find type ID if indexed
                String typeId = findTypeIdInComponents(resolvedType, components);
                indexedField.setTypeId(typeId);

                // Handle generic types
                if (typeInfo.hasGenericParameters()) {
                    indexedField.setGenericType(true);

                    // For now, handle simple single-parameter generics like List<User>
                    TypeInfo firstParam = typeInfo.getFirstGenericParameter();
                    if (firstParam != null) {
                        String resolvedGenericType = TypeResolutionUtils.resolveType(firstParam.getBaseType(), context.getImports());
                        indexedField.setFullyQualifiedGenericType(resolvedGenericType);

                        String genericTypeId = findTypeIdInComponents(resolvedGenericType, components);
                        indexedField.setGenericTypeId(genericTypeId);
                    }
                }
            }
        }

        // Check for @Autowired and resolve via Spring DI
        if (field.getAnnotations() != null) {
            for (Annotation annotation : field.getAnnotations()) {
                if (annotation.getName().equals("Autowired")) {
                    indexedField.setAutowired(true);

                    // Resolve implementation using DI context
                    SpringDIContext diContext = diContexts.get(microserviceName);
                    if (diContext != null && indexedField.getFullyQualifiedType() != null) {
                        SpringDIContext.BeanImplementation implementation =
                            diContext.resolveAutowiredField(indexedField.getFullyQualifiedType());

                        if (implementation != null) {
                            indexedField.setResolvedImplementationType(implementation.fullyQualifiedName);
                            indexedField.setResolvedImplementationId(implementation.classId);

                            // Determine resolution strategy
                            List<SpringDIContext.BeanImplementation> allImpls =
                                diContext.getImplementations(indexedField.getFullyQualifiedType());
                            if (allImpls.size() == 1) {
                                indexedField.setDiResolutionStrategy("EXACT");
                            } else if (implementation.isPrimary) {
                                indexedField.setDiResolutionStrategy("PRIMARY");
                            }

                        } else {
                            // Multiple implementations or no implementation found
                            List<SpringDIContext.BeanImplementation> allImpls =
                                diContext.getImplementations(indexedField.getFullyQualifiedType());
                            if (allImpls.size() > 1) {
                                indexedField.setDiResolutionStrategy("AMBIGUOUS");
                            }
                        }
                    }
                    break;
                }
            }
        }

        return indexedField;
    }
    
    /**
     * Create an IndexedMethod with type references
     * 
     * @param method The Method IR component
     * @param microserviceName Name of the containing microservice
     * @param className Name of the containing class
     * @param context The containing class for import resolution
     * @param components Map of all indexed components for type ID lookup
     * @return The enhanced IndexedMethod
     */
    private IndexedMethod createIndexedMethodWithTypeReferences(Method method, String microserviceName, String className,
                                                               AbstractClass context, Map<String, IndexedComponent> components) {
        // Start with basic method creation
        IndexedMethod indexedMethod = createIndexedMethod(method, microserviceName, className);
        
        // Add return type references
        String returnType = method.getReturnType();
        if (returnType != null && !returnType.equals("void")) {
            TypeInfo returnTypeInfo = TypeResolutionUtils.parseGenericType(returnType);
            if (returnTypeInfo != null) {
                String resolvedReturnType = TypeResolutionUtils.resolveType(returnTypeInfo.getBaseType(), context.getImports());
                indexedMethod.setFullyQualifiedReturnType(resolvedReturnType);
                
                String returnTypeId = findTypeIdInComponents(resolvedReturnType, components);
                indexedMethod.setReturnTypeId(returnTypeId);
                
                // Handle generic return types
                if (returnTypeInfo.hasGenericParameters()) {
                    indexedMethod.setGenericReturnType(true);
                    
                    TypeInfo firstParam = returnTypeInfo.getFirstGenericParameter();
                    if (firstParam != null) {
                        String resolvedGenericReturnType = TypeResolutionUtils.resolveType(firstParam.getBaseType(), context.getImports());
                        indexedMethod.setFullyQualifiedGenericReturnType(resolvedGenericReturnType);
                        
                        String genericReturnTypeId = findTypeIdInComponents(resolvedGenericReturnType, components);
                        indexedMethod.setGenericReturnTypeId(genericReturnTypeId);
                    }
                }
            }
        }
        
        // Add enhanced parameter handling
        List<IndexedParameter> indexedParameters = new ArrayList<>();
        for (Parameter param : method.getParameters()) {
            IndexedParameter indexedParam = createIndexedParameter(param, context, components);
            indexedParameters.add(indexedParam);
        }
        indexedMethod.setParameters(indexedParameters);

        // NOTE: CFG generation moved to Phase 2.4
        // This allows all fields to be indexed first with their DI resolution
        // before we generate CFGs that need to resolve @Autowired fields

        // Extract database operation information if this is a repository method
        DatabaseOperationInfo databaseOperation = extractDatabaseOperationInfo(method, context);
        indexedMethod.setDatabaseOperation(databaseOperation);

        return indexedMethod;
    }
    
    /**
     * Create an IndexedParameter with type references
     * 
     * @param parameter The Parameter IR component
     * @param context The containing class for import resolution
     * @param components Map of all indexed components for type ID lookup
     * @return The IndexedParameter
     */
    private IndexedParameter createIndexedParameter(Parameter parameter, AbstractClass context, 
                                                   Map<String, IndexedComponent> components) {
        String paramType = parameter.getParameterType();
        String typeId = null;
        String fullyQualifiedType = null;
        boolean isGenericType = false;
        String genericTypeId = null;
        String fullyQualifiedGenericType = null;
        
        if (paramType != null) {
            TypeInfo paramTypeInfo = TypeResolutionUtils.parseGenericType(paramType);
            if (paramTypeInfo != null) {
                String resolvedType = TypeResolutionUtils.resolveType(paramTypeInfo.getBaseType(), context.getImports());
                fullyQualifiedType = resolvedType;
                typeId = findTypeIdInComponents(resolvedType, components);
                
                if (paramTypeInfo.hasGenericParameters()) {
                    isGenericType = true;
                    
                    TypeInfo firstParam = paramTypeInfo.getFirstGenericParameter();
                    if (firstParam != null) {
                        String resolvedGenericType = TypeResolutionUtils.resolveType(firstParam.getBaseType(), context.getImports());
                        fullyQualifiedGenericType = resolvedGenericType;
                        genericTypeId = findTypeIdInComponents(resolvedGenericType, components);
                    }
                }
            }
        }
        
        return new IndexedParameter(
            parameter.getName(),
            parameter.getParameterType(),
            typeId,
            fullyQualifiedType,
            isGenericType,
            genericTypeId,
            fullyQualifiedGenericType,
            parameter.getAnnotations(),
            parameter.getIsVariableParameter(),
            parameter.getParameterTypeForSignature(),
            parameter.getFullID(),
            parameter.getID()
        );
    }
    
    /**
     * Find the type ID for a given fully qualified type name in the components map
     * 
     * @param fullyQualifiedTypeName The type name to find
     * @param components Map of indexed components
     * @return The type ID if found, null otherwise
     */
    private String findTypeIdInComponents(String fullyQualifiedTypeName, Map<String, IndexedComponent> components) {
        for (IndexedComponent component : components.values()) {
            if (component instanceof IndexedClass) {
                IndexedClass indexedClass = (IndexedClass) component;
                if (fullyQualifiedTypeName.equals(indexedClass.getFullyQualifiedName())) {
                    return indexedClass.getId();
                }
            }
        }
        return null;
    }
    

    /**
     * Generate an Enhanced Interprocedural Control Flow Graph (ICFG) for a method
     * with rich semantic information, source locations, and data flow tracking
     *
     * @param method The Method IR component
     * @param components Map of all indexed components for method ID resolution
     * @param context The containing class for source file resolution
     * @return The generated enhanced ICFG
     */
    private EnhancedICFG generateEnhancedICFG(Method method, Map<String, IndexedComponent> components, AbstractClass context) {
        String methodId = method.getID();
        EnhancedICFG icfg = new EnhancedICFG(methodId);

        // Create entry node with source location
        SourceLocation entryLocation = new SourceLocation(1); // Will be updated with actual location
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
     * Generate enhanced AST-based control flow by parsing the method source
     *
     * @param method The Method IR component
     * @param icfg The enhanced ICFG to populate
     * @param components Map of indexed components
     * @param context The containing class for source file resolution
     * @return true if AST-based generation succeeded, false for fallback
     */
    private boolean generateEnhancedASTBasedControlFlow(Method method, EnhancedICFG icfg,
                                                       Map<String, IndexedComponent> components, AbstractClass context) {
        try {
            // Get the source file path from the context class
            Path sourcePath = context.getPath();

            if (sourcePath == null || !sourcePath.toFile().exists()) {
                // Try to find the file in the cloned directory
                sourcePath = resolveSourcePath(context);

                if (sourcePath == null || !sourcePath.toFile().exists()) {
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
            if (!methodDecl.getBody().isPresent()) {
                return false;
            }

            // Generate enhanced control flow from AST
            EnhancedASTControlFlowGenerator flowGenerator = new EnhancedASTControlFlowGenerator(icfg, components, patternIndex);
            flowGenerator.generateControlFlow(methodDecl, method);

            return true;

        } catch (Exception e) {
            // If enhanced AST parsing fails, return false for fallback
            return false;
        }
    }

    
    /**
     * Resolve the source path by finding it in the cloned directory
     */
    private Path resolveSourcePath(AbstractClass parentClass) {
        Path originalPath = parentClass.getPath();
        if (originalPath == null) {
            return null;
        }

        // The original path might be relative to the repository root
        // We need to find it in the clone directory
        String pathStr = originalPath.toString();

        // Get the clone directory from config
        String systemName = config != null ? config.getSystemName() : null;
        Path clonePath;

        if (systemName != null) {
            clonePath = Path.of("clone", systemName);
        } else {
            // Fallback: try to detect clone directory dynamically
            clonePath = Path.of("clone").toFile().listFiles() != null && Path.of("clone").toFile().listFiles().length > 0
                ? Path.of("clone", Path.of("clone").toFile().listFiles()[0].getName())
                : Path.of("clone");
        }

        // Try different variations of the path
        Path[] pathVariations = {
            clonePath.resolve(pathStr),
            clonePath.resolve(pathStr.replaceFirst("^/", "")), // Remove leading slash
            Path.of(pathStr), // Try absolute path
            Path.of(pathStr.replaceFirst("^/", "")) // Try relative from current directory
        };

        for (Path path : pathVariations) {
            if (path.toFile().exists()) {
                return path;
            }
        }

        return null;
    }
    
    /**
     * Find the method declaration in the compilation unit that matches the IR method
     */
    private MethodDeclaration findMethodDeclaration(CompilationUnit cu, Method method) {
        for (MethodDeclaration methodDecl : cu.findAll(MethodDeclaration.class)) {
            if (methodDecl.getNameAsString().equals(method.getName())) {
                // Basic matching by name - could be enhanced with parameter matching
                return methodDecl;
            }
        }
        return null;
    }
    
    
    /**
     * Generate compact call description
     */
    private String generateCallDescription(MethodCall methodCall) {
        StringBuilder desc = new StringBuilder();
        if (methodCall.getObjectName() != null && !methodCall.getObjectName().isEmpty()) {
            desc.append(methodCall.getObjectName()).append(".");
        }
        desc.append(methodCall.getName());
        desc.append("(");
        if (methodCall.getParameterContents() != null && !methodCall.getParameterContents().isEmpty()) {
            // Truncate long parameter lists
            String params = methodCall.getParameterContents();
            if (params.length() > 30) {
                params = params.substring(0, 27) + "...";
            }
            desc.append(params);
        }
        desc.append(")");
        return desc.toString();
    }
    
    /**
     * Get parameter types for method signature
     */
    private String getParameterTypes(Method method) {
        return method.getParameters().stream()
            .map(p -> {
                String type = p.getParameterType();
                // Simplify generic types for readability
                if (type.contains("<")) {
                    type = type.substring(0, type.indexOf("<")) + "<>";
                }
                return type;
            })
            .reduce((a, b) -> a + ", " + b)
            .orElse("");
    }

    /**
     * Find the fully qualified name of an interface by searching the microservice IR
     */
    private String findInterfaceQualifiedName(String simpleInterfaceName, Microservice microservice) {
        for (AbstractClass abstractClass : microservice.getClasses()) {
            if (abstractClass.getName().equals(simpleInterfaceName)) {
                return abstractClass.getPackageName() + "." + abstractClass.getName();
            }
        }
        return null;
    }

    /**
     * Generate CFGs for all methods in a class (Phase 2.4)
     *
     * @param abstractClass The class to generate CFGs for
     * @param microserviceName Name of the containing microservice
     * @param components Map of all indexed components (includes fields with DI resolution)
     * @param diContext Spring DI context for the microservice (can be null for orphaned classes)
     * @return Number of CFGs generated
     */
    private int generateCFGsForClass(AbstractClass abstractClass, String microserviceName,
                                     Map<String, IndexedComponent> components, SpringDIContext diContext) {
        int count = 0;

        for (Method method : abstractClass.getMethods()) {
            // Find the indexed method in components
            String methodId = method.getID();
            IndexedComponent component = components.get(methodId);

            if (component == null) {
                System.out.println("WARNING: Could not find indexed method for ID: " + methodId + " (" + method.getName() + ")");
                continue;
            }

            if (component instanceof IndexedMethod) {
                IndexedMethod indexedMethod = (IndexedMethod) component;

                // Check if it already has a CFG
                if (indexedMethod.getControlFlowGraph() != null) {
                    System.out.println("  Method " + method.getName() + " already has CFG, skipping");
                    continue;
                }

                // Generate CFG for this method
                EnhancedICFG controlFlowGraph = generateEnhancedICFG(method, components, abstractClass);
                indexedMethod.setControlFlowGraph(controlFlowGraph);

                if (method.getName().equals("getAllOrders")) {
                    System.out.println("  ✓ Generated CFG for getAllOrders in " + abstractClass.getName());
                }

                count++;
            } else {
                System.out.println("WARNING: Component is not IndexedMethod: " + component.getClass().getName());
            }
        }

        return count;
    }

    /**
     * Build Spring DI context for a microservice by scanning for @Service, @Component, @Repository beans
     * and building interface-to-implementation mappings.
     * Since IR may not include implementation classes, we also scan source files directly.
     *
     * @param microservice The microservice to build DI context for
     * @param components Map of indexed components
     * @return The Spring DI context
     */
    private SpringDIContext buildSpringDIContext(Microservice microservice, Map<String, IndexedComponent> components) {
        SpringDIContext context = new SpringDIContext();

        // Scan all classes in the microservice from IR
        for (AbstractClass abstractClass : microservice.getClasses()) {
            // Only process concrete classes (not interfaces/abstracts)
            if (abstractClass instanceof JClass) {
                JClass jClass = (JClass) abstractClass;

                // Check for Spring stereotype annotations
                boolean isBean = false;
                boolean isPrimary = false;
                String beanName = null;

                for (Annotation annotation : jClass.getAnnotations()) {
                    String annotationName = annotation.getName();

                    if (annotationName.equals("Service") || annotationName.equals("Component") ||
                        annotationName.equals("Repository") || annotationName.equals("Controller") ||
                        annotationName.equals("RestController")) {
                        isBean = true;

                        // Extract bean name from annotation value if present
                        Map<String, String> attributes = annotation.getAttributes();
                        if (attributes != null && attributes.containsKey("value")) {
                            beanName = attributes.get("value").replace("\"", "");
                        }

                        // Default bean name is uncapitalized class name
                        if (beanName == null || beanName.isEmpty()) {
                            String className = jClass.getName();
                            beanName = Character.toLowerCase(className.charAt(0)) + className.substring(1);
                        }
                    }

                    if (annotationName.equals("Primary")) {
                        isPrimary = true;
                    }
                }

                // If this is a Spring bean, register it
                if (isBean) {
                    // Get the class ID from components
                    String classId = jClass.getID();

                    // Get fully qualified name
                    String fullyQualifiedName = jClass.getPackageName() + "." + jClass.getName();

                    // Get interfaces this class implements
                    Set<String> interfaces = new HashSet<>();
                    if (jClass.getImplementedTypes() != null) {
                        for (String interfaceName : jClass.getImplementedTypes()) {
                            // Qualify interface names by searching in IR
                            String qualifiedInterface = findInterfaceQualifiedName(interfaceName, microservice);
                            if (qualifiedInterface != null) {
                                interfaces.add(qualifiedInterface);
                            } else {
                                // Fallback: assume same package as implementation
                                interfaces.add(jClass.getPackageName() + "." + interfaceName);
                            }
                        }
                    }

                    // Register the bean
                    context.registerBean(classId, fullyQualifiedName, interfaces, isPrimary, beanName);

                    System.out.println("REGISTERED BEAN FROM IR: " + fullyQualifiedName + " implements " + interfaces);
                }
            }
        }

        // Additionally, scan source files directly to find implementation classes not in IR
        scanSourceFilesForBeans(microservice, context, components);

        return context;
    }

    /**
     * Scan source files directly to find Spring beans (especially implementations not in IR)
     */
    private void scanSourceFilesForBeans(Microservice microservice, SpringDIContext context,
                                         Map<String, IndexedComponent> components) {
        try {
            Path microservicePath = resolveMicroservicePath(microservice.getPath());
            System.out.println("SOURCE SCAN: microservicePath = " + microservicePath);
            if (microservicePath == null || !microservicePath.toFile().exists()) {
                System.out.println("SOURCE SCAN: Path null or doesn't exist");
                return;
            }

            // Look for service/impl directory
            Path implDir = microservicePath.resolve("src/main/java");
            System.out.println("SOURCE SCAN: Looking in " + implDir);
            if (!implDir.toFile().exists()) {
                System.out.println("SOURCE SCAN: src/main/java doesn't exist");
                return;
            }

            // Recursively find all .java files
            java.nio.file.Files.walk(implDir)
                .filter(path -> path.toString().endsWith(".java"))
                .forEach(javaFile -> {
                    try {
                        System.out.println("SCANNING FILE: " + javaFile.getFileName());
                        CompilationUnit cu = StaticJavaParser.parse(javaFile);

                        // Get primary type declaration
                        if (!cu.getPrimaryType().isPresent()) {
                            System.out.println("NO PRIMARY TYPE: " + javaFile.getFileName());
                            return;
                        }
                        cu.getPrimaryType().ifPresent(typeDeclaration -> {
                            String className = typeDeclaration.getNameAsString();
                            System.out.println("PROCESSING CLASS: " + className);

                            // Skip interfaces - we only want concrete classes
                            if (typeDeclaration.isClassOrInterfaceDeclaration()) {
                                com.github.javaparser.ast.body.ClassOrInterfaceDeclaration classDecl =
                                    typeDeclaration.asClassOrInterfaceDeclaration();
                                if (classDecl.isInterface()) {
                                    System.out.println("SKIPPING INTERFACE: " + className);
                                    return;  // Skip interfaces
                                }
                            }

                            // Check for Spring stereotype annotations
                            System.out.println("CHECKING ANNOTATIONS FOR: " + className);
                            boolean isBean = typeDeclaration.getAnnotations().stream()
                                .anyMatch(ann -> {
                                    String name = ann.getNameAsString();
                                    System.out.println("  Found annotation: " + name);
                                    return name.equals("Service") || name.equals("Component") ||
                                           name.equals("Repository") || name.equals("Controller") ||
                                           name.equals("RestController");
                                });

                            System.out.println("IS BEAN: " + isBean + " for " + className);
                            if (!isBean) {
                                if (className.contains("Impl")) {
                                    System.out.println("NOT A BEAN (no @Service): " + className);
                                }
                                return;
                            }

                            boolean isPrimary = typeDeclaration.getAnnotations().stream()
                                .anyMatch(ann -> ann.getNameAsString().equals("Primary"));

                            // Get package name
                            String packageName = cu.getPackageDeclaration()
                                .map(pd -> pd.getNameAsString())
                                .orElse("");

                            String fullyQualifiedName = packageName.isEmpty() ? className : packageName + "." + className;

                            // Check if already registered
                            System.out.println("CHECKING IF ALREADY REGISTERED: " + fullyQualifiedName);
                            if (context.isBean(fullyQualifiedName)) {
                                System.out.println("ALREADY REGISTERED, SKIPPING: " + fullyQualifiedName);
                                return;
                            }
                            System.out.println("NOT YET REGISTERED: " + fullyQualifiedName);

                            // Get implemented interfaces
                            Set<String> interfaces = new HashSet<>();
                            if (typeDeclaration.isClassOrInterfaceDeclaration()) {
                                com.github.javaparser.ast.body.ClassOrInterfaceDeclaration classDecl =
                                    typeDeclaration.asClassOrInterfaceDeclaration();

                                classDecl.getImplementedTypes().forEach(impl -> {
                                    String interfaceName = impl.getNameAsString();
                                    // Try to resolve to fully qualified name
                                    String fqInterfaceName = resolveInterfaceName(interfaceName, packageName, cu);
                                    interfaces.add(fqInterfaceName);
                                });
                            }

                            // Generate synthetic classId
                            String classId = microservice.getName() + ":" + fullyQualifiedName.hashCode();

                            // Generate bean name
                            String beanName = Character.toLowerCase(className.charAt(0)) + className.substring(1);

                            context.registerBean(classId, fullyQualifiedName, interfaces, isPrimary, beanName);

                            System.out.println("REGISTERED BEAN: " + fullyQualifiedName + " implements " + interfaces);
                        });
                    } catch (Exception e) {
                        // Skip files that fail to parse
                        System.out.println("PARSE ERROR: " + javaFile.getFileName() + " - " + e.getMessage());
                    }
                });
        } catch (Exception e) {
            System.out.println("Failed to scan source files for beans in " + microservice.getName() + " - " + e.getMessage());
        }
    }

    /**
     * Resolve interface name to fully qualified name
     */
    private String resolveInterfaceName(String interfaceName, String packageName, CompilationUnit cu) {
        // If already fully qualified
        if (interfaceName.contains(".")) {
            return interfaceName;
        }

        // Check imports
        for (com.github.javaparser.ast.ImportDeclaration imp : cu.getImports()) {
            String importName = imp.getNameAsString();
            if (importName.endsWith("." + interfaceName)) {
                return importName;
            }
        }

        // Assume same package
        return packageName.isEmpty() ? interfaceName : packageName + "." + interfaceName;
    }

    /**
     * Resolve the target method ID for a method call
     * 
     * @param methodCall The method call to resolve
     * @param components Map of all indexed components for lookup
     * @return The resolved method ID or null
     */
    private String resolveTargetMethodId(MethodCall methodCall, Map<String, IndexedComponent> components) {
        // Use existing target method ID if already resolved
        if (methodCall.getTargetMethodId() != null) {
            return methodCall.getTargetMethodId();
        }
        
        // Try to find the target method in the components index
        return findMethodInComponents(methodCall, components);
    }
    
    /**
     * Resolve the canonical ID for a method call
     * 
     * @param methodCall The method call
     * @param targetMethodId The resolved target method ID
     * @param components Map of all indexed components
     * @return The canonical ID if found, null otherwise
     */
    private String resolveCanonicalId(MethodCall methodCall, String targetMethodId, Map<String, IndexedComponent> components) {
        // First check if the method call already has a canonical ID
        String existingCanonicalId = methodCall.getTargetMethodCanonicalId();
        if (existingCanonicalId != null && !existingCanonicalId.isEmpty()) {
            return existingCanonicalId;
        }
        
        // If we have a resolved target method ID, look up its canonical ID
        if (targetMethodId != null && !targetMethodId.isEmpty()) {
            IndexedComponent component = components.get(targetMethodId);
            if (component instanceof IndexedMethod) {
                IndexedMethod indexedMethod = (IndexedMethod) component;
                return indexedMethod.getFullID();
            }
        }
        
        return null;
    }
    
    /**
     * Find a method in the components index that matches the method call
     * 
     * @param methodCall The method call to find
     * @param components Map of all indexed components
     * @return The method ID if found, null otherwise
     */
    private String findMethodInComponents(MethodCall methodCall, Map<String, IndexedComponent> components) {
        String methodName = methodCall.getName();
        String objectType = methodCall.getObjectType();
        String objectName = methodCall.getObjectName();

        // Try to resolve object type if not provided
        if ((objectType == null || objectType.isEmpty()) && objectName != null && !objectName.isEmpty()) {
            objectType = resolveObjectType(objectName, components);

            if (objectName.equals("adminOrderService")) {
                System.out.println("RESOLVING adminOrderService.getAllOrders:");
                System.out.println("  objectName=" + objectName);
                System.out.println("  resolvedType=" + objectType);
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

        if (methodName.equals("getAllOrders")) {
            System.out.println("  Found " + candidates.size() + " getAllOrders candidates:");
            for (IndexedMethod candidate : candidates) {
                System.out.println("    - " + candidate.getClassName() + "." + candidate.getName() + " (id=" + candidate.getId() + ")");
            }
        }

        // If we have an object type, filter candidates by class
        if (objectType != null && !objectType.isEmpty()) {
            if (methodName.equals("getAllOrders")) {
                System.out.println("  Filtering by objectType=" + objectType);
            }

            for (IndexedMethod candidate : candidates) {
                boolean matches = isTypeMatch(objectType, candidate.getClassName());

                if (methodName.equals("getAllOrders")) {
                    System.out.println("    Checking " + candidate.getClassName() + ": isTypeMatch=" + matches);
                }

                if (matches) {
                    if (methodName.equals("getAllOrders")) {
                        System.out.println("  ✓ MATCHED: " + candidate.getClassName() + "." + methodName + " (id=" + candidate.getId() + ")");
                    }
                    return candidate.getId();
                }
            }
        }

        // If no type-specific match found, return the first candidate
        // This handles cases where objectName is empty (static calls) or type resolution failed
        if (!candidates.isEmpty()) {
            if (methodName.equals("getAllOrders")) {
                System.out.println("  ✗ NO TYPE MATCH - returning first candidate: " + candidates.get(0).getClassName() + "." + methodName + " (id=" + candidates.get(0).getId() + ")");
            }
            return candidates.get(0).getId();
        }

        return null;
    }
    
    /**
     * Resolve the type of an object/variable name by looking up field definitions
     * 
     * @param objectName The variable or object name
     * @param components Map of all indexed components
     * @return The resolved type name, or null if not found
     */
    private String resolveObjectType(String objectName, Map<String, IndexedComponent> components) {
        // Look for field definitions that match the object name
        for (IndexedComponent component : components.values()) {
            if (component instanceof IndexedField) {
                IndexedField field = (IndexedField) component;
                if (objectName.equals(field.getName())) {
                    // If this is an @Autowired field with a resolved implementation, use that
                    if (objectName.equals("adminOrderService")) {
                        System.out.println("FOUND adminOrderService field: autowired=" + field.isAutowired() +
                                          ", resolvedImpl=" + field.getResolvedImplementationType() +
                                          ", fieldType=" + field.getEffectiveTypeName());
                    }
                    if (field.isAutowired() && field.getResolvedImplementationType() != null) {
                        return field.getResolvedImplementationType();
                    }
                    // Otherwise, return the field type, preferring fully qualified type
                    return field.getEffectiveTypeName();
                }
            }
        }

        // Look for method parameters that match the object name
        for (IndexedComponent component : components.values()) {
            if (component instanceof IndexedMethod) {
                IndexedMethod method = (IndexedMethod) component;
                if (method.getParameters() != null) {
                    for (IndexedParameter param : method.getParameters()) {
                        if (objectName.equals(param.getName())) {
                            return param.getEffectiveTypeName();
                        }
                    }
                }
            }
        }

        return null;
    }
    
    /**
     * Check if a resolved type matches a class name
     * 
     * @param resolvedType The resolved type (may be fully qualified)
     * @param className The class name to match against
     * @return true if they match
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
    
    // ============== SECURITY CONFIG PARSING AND AUTHORIZATION ENRICHMENT ==============

    /**
     * Parse SecurityConfig files for all microservices
     *
     * @param system The microservice system
     * @return Map of microservice names to their security rules
     */
    public Map<String, List<SecurityRule>> parseSecurityConfigs(MicroserviceSystem system) {
        Map<String, List<SecurityRule>> securityRules = new HashMap<>();

        for (Microservice microservice : system.getMicroservices()) {
            Path microservicePath = microservice.getPath();
            if (microservicePath == null) {
                continue;
            }

            // Resolve the microservice path
            Path resolvedPath = resolveMicroservicePath(microservicePath);
            if (resolvedPath == null || !resolvedPath.toFile().exists()) {
                continue;
            }

            // Find SecurityConfig.java
            Path securityConfigPath = findSecurityConfig(resolvedPath, "src/main/java/*/config/SecurityConfig.java");
            if (securityConfigPath != null && securityConfigPath.toFile().exists()) {
                List<SecurityRule> rules = SecurityConfigParser.parseSecurityConfig(securityConfigPath);
                if (!rules.isEmpty()) {
                    securityRules.put(microservice.getName(), rules);
                }
            }
        }

        return securityRules;
    }

    /**
     * Parse authentication mechanisms and security features from SecurityConfig files
     *
     * @param system The microservice system
     * @param authMechanismsByMicroservice Output map for authentication mechanisms by microservice
     * @param securityFeaturesByMicroservice Output map for security features by microservice
     */
    public void parseAuthenticationConfigs(MicroserviceSystem system,
                                           Map<String, AuthenticationMechanism> authMechanismsByMicroservice,
                                           Map<String, SecurityFeaturesInfo> securityFeaturesByMicroservice) {
        for (Microservice microservice : system.getMicroservices()) {
            Path microservicePath = microservice.getPath();
            if (microservicePath == null) {
                continue;
            }

            // Resolve the microservice path
            Path resolvedPath = resolveMicroservicePath(microservicePath);
            if (resolvedPath == null || !resolvedPath.toFile().exists()) {
                continue;
            }

            // Find SecurityConfig.java
            Path securityConfigPath = findSecurityConfig(resolvedPath, "src/main/java/*/config/SecurityConfig.java");
            if (securityConfigPath != null && securityConfigPath.toFile().exists()) {
                AuthenticationConfigParser.ParsedSecurityConfig config =
                        AuthenticationConfigParser.parseSecurityConfig(securityConfigPath);

                if (config.authenticationMechanism != null) {
                    authMechanismsByMicroservice.put(microservice.getName(), config.authenticationMechanism);
                }
                if (config.securityFeatures != null) {
                    securityFeaturesByMicroservice.put(microservice.getName(), config.securityFeatures);
                }
            }
        }
    }

    /**
     * Enrich endpoints with authentication mechanism information and detect optional authentication
     *
     * @param endpoints Map of endpoints to enrich
     * @param authMechanismsByMicroservice Authentication mechanisms organized by microservice
     * @param securityFeaturesByMicroservice Security features organized by microservice
     * @param system The microservice system (for path resolution)
     */
    public void enrichEndpointsWithAuthenticationMechanism(Map<String, EndpointInfo> endpoints,
                                                           Map<String, AuthenticationMechanism> authMechanismsByMicroservice,
                                                           Map<String, SecurityFeaturesInfo> securityFeaturesByMicroservice,
                                                           MicroserviceSystem system) {
        for (EndpointInfo endpoint : endpoints.values()) {
            // Extract microservice name from endpoint ID
            String microserviceName = extractMicroserviceNameFromEndpointId(endpoint.getId());

            // Get authentication mechanism for this microservice
            AuthenticationMechanism mechanism = authMechanismsByMicroservice.get(microserviceName);
            SecurityFeaturesInfo securityFeatures = securityFeaturesByMicroservice.get(microserviceName);

            // Set mechanism on endpoint's authentication info
            if (endpoint.getAuthentication() != null && mechanism != null) {
                endpoint.getAuthentication().setMechanism(mechanism);
            } else if (endpoint.getAuthentication() == null && mechanism != null) {
                // Create basic authentication info if none exists
                AuthenticationInfo auth = new AuthenticationInfo();
                auth.setMechanism(mechanism);
                auth.setRequired(mechanism.getType() != AuthenticationMechanism.AuthenticationType.NONE);
                endpoint.setAuthentication(auth);
            }

            // Detect optional authentication:
            // - Public endpoint (not required, permitAll, or no auth requirement)
            // - BUT has JWT/token-based authentication mechanism configured
            // - AND filters that return 401 for invalid tokens
            detectOptionalAuthentication(endpoint, mechanism, securityFeatures, microserviceName, system);

            // Re-evaluate response schema with optional authentication
            // (Add 401 status code if optional authentication was detected)
            if (endpoint.getAuthentication() != null && endpoint.getAuthentication().isOptionalAuthentication()) {
                if (endpoint.getResponseSchema() != null) {
                    ResponseSchemaExtractor.addAuthenticationStatusCodes(
                        endpoint.getResponseSchema(),
                        endpoint.getAuthentication(),
                        endpoint.getAuthorization()
                    );
                }
            }
        }
    }

    /**
     * Detect optional authentication scenarios where:
     * - Endpoint is public (no authentication required)
     * - BUT authentication filter (e.g., JWTFilter) validates tokens if provided
     * - Invalid tokens trigger 401 errors
     *
     * @param endpoint The endpoint to check
     * @param mechanism The authentication mechanism for the microservice
     * @param securityFeatures Security features including custom filters
     * @param microserviceName Name of the microservice
     * @param system The microservice system
     */
    private void detectOptionalAuthentication(EndpointInfo endpoint,
                                             AuthenticationMechanism mechanism,
                                             SecurityFeaturesInfo securityFeatures,
                                             String microserviceName,
                                             MicroserviceSystem system) {
        AuthenticationInfo auth = endpoint.getAuthentication();
        if (auth == null) {
            return;
        }

        // Check if endpoint is public (not required or permitAll)
        boolean isPublicEndpoint = !auth.isRequired() || auth.isPermitAll();
        if (!isPublicEndpoint) {
            return; // Not optional if authentication is required
        }

        // Check if mechanism is token-based (JWT, OAuth2, API Key)
        if (mechanism == null) {
            return;
        }

        AuthenticationMechanism.AuthenticationType type = mechanism.getType();
        boolean isTokenBased = type == AuthenticationMechanism.AuthenticationType.JWT ||
                              type == AuthenticationMechanism.AuthenticationType.OAUTH2 ||
                              type == AuthenticationMechanism.AuthenticationType.API_KEY;

        if (!isTokenBased) {
            return; // Session-based auth doesn't have optional authentication
        }

        // For token-based authentication on public endpoints:
        // Assume optional authentication (filters validate tokens if provided)
        // This is the standard behavior for JWT/OAuth2 filters
        boolean hasOptionalAuth = true;

        // Optionally, verify by analyzing filter implementations
        if (securityFeatures != null && securityFeatures.getCustomFilters() != null &&
            !securityFeatures.getCustomFilters().isEmpty()) {
            // Get microservice path for filter analysis
            Path microservicePath = getMicroservicePath(microserviceName, system);

            // Check if any filter explicitly returns 401 for invalid tokens
            boolean filtersReturn401 = FilterBehaviorAnalyzer.hasFiltersReturning401(
                securityFeatures.getCustomFilters(),
                microservicePath
            );

            // If we found filters that return 401, use that result
            // Otherwise, assume true for JWT/OAuth2 (standard behavior)
            hasOptionalAuth = filtersReturn401 || type == AuthenticationMechanism.AuthenticationType.JWT;
        }

        // Set optional authentication flag
        auth.setOptionalAuthentication(hasOptionalAuth);
    }

    /**
     * Get the path for a microservice by name
     */
    private Path getMicroservicePath(String microserviceName, MicroserviceSystem system) {
        for (Microservice microservice : system.getMicroservices()) {
            if (microservice.getName().equals(microserviceName)) {
                Path path = microservice.getPath();
                if (path != null) {
                    return resolveMicroservicePath(path);
                }
            }
        }
        return null;
    }

    /**
     * Enrich all endpoints with authorization information from SecurityConfig rules
     *
     * @param endpoints Map of endpoints to enrich
     * @param securityRulesByMicroservice Security rules organized by microservice
     */
    public void enrichEndpointsWithAuthorization(Map<String, EndpointInfo> endpoints,
                                                  Map<String, List<SecurityRule>> securityRulesByMicroservice) {
        for (EndpointInfo endpoint : endpoints.values()) {
            // Extract microservice name from endpoint ID (format: "microservice-name:hash")
            String microserviceName = extractMicroserviceNameFromEndpointId(endpoint.getId());

            // Get security rules for this microservice
            List<SecurityRule> rules = securityRulesByMicroservice.get(microserviceName);
            if (rules == null || rules.isEmpty()) {
                // No SecurityConfig rules, use default authorization
                endpoint.setAuthorization(AuthorizationInfo.createPublic());

                // Add authentication status codes to response schema
                if (endpoint.getResponseSchema() != null) {
                    ResponseSchemaExtractor.addAuthenticationStatusCodes(
                        endpoint.getResponseSchema(),
                        endpoint.getAuthentication(),
                        endpoint.getAuthorization()
                    );
                }
                continue;
            }

            // Find matching rules for this endpoint
            List<SecurityRule> matchingRules = PathPatternMatcher.findMatchingRules(
                endpoint.getFullUri(),
                endpoint.getHttpMethod(),
                rules
            );

            // Get the most specific matching rule
            SecurityRule bestMatch = PathPatternMatcher.getMostSpecificMatch(matchingRules);

            // Build authorization info from the matched rule
            AuthorizationInfo authorization = buildAuthorizationFromSecurityRule(
                endpoint.getAuthentication(),
                bestMatch
            );

            endpoint.setAuthorization(authorization);

            // Update authentication source if needed
            updateAuthenticationSource(endpoint, bestMatch);

            // Add authentication status codes to response schema
            if (endpoint.getResponseSchema() != null) {
                ResponseSchemaExtractor.addAuthenticationStatusCodes(
                    endpoint.getResponseSchema(),
                    endpoint.getAuthentication(),
                    endpoint.getAuthorization()
                );
            }
        }
    }

    /**
     * Extract microservice name from endpoint ID
     *
     * @param endpointId The endpoint ID (format: "microservice-name:hash")
     * @return The microservice name
     */
    private String extractMicroserviceNameFromEndpointId(String endpointId) {
        if (endpointId == null || !endpointId.contains(":")) {
            return "unknown";
        }
        return endpointId.substring(0, endpointId.indexOf(":"));
    }

    /**
     * Build authorization info by merging annotation-based and SecurityConfig-based rules
     *
     * @param authentication Authentication info from annotations
     * @param securityRule Security rule from SecurityConfig
     * @return Merged authorization info
     */
    private AuthorizationInfo buildAuthorizationFromSecurityRule(AuthenticationInfo authentication,
                                                                SecurityRule securityRule) {
        AuthorizationInfo authz = new AuthorizationInfo();

        // Always initialize role list (even if empty)
        authz.setRequiredRoles(new ArrayList<>());

        // Priority 1: Method-level annotations (most specific)
        if (authentication != null && authentication.hasSecurityRequirements()) {
            if (authentication.getRequiredRoles() != null) {
                authz.setRequiredRoles(new ArrayList<>(authentication.getRequiredRoles()));
            }
            authz.setPublic(authentication.isPermitAll());
            authz.setRequiresAuthentication(true); // Always true when there are role requirements
            authz.setSource("annotation");
            return authz;
        }

        // Priority 2: SecurityConfig rules
        if (securityRule != null) {
            if (securityRule.hasRoleRequirements()) {
                authz.setRequiredRoles(new ArrayList<>(securityRule.getRequiredRoles()));
            }
            authz.setPublic(securityRule.isPermitAll());

            // Requires authentication if:
            // 1. There are role/authority requirements, OR
            // 2. Explicit .authenticated() call in SecurityConfig
            boolean requiresAuth = securityRule.hasSecurityRequirements() || securityRule.isAuthenticated();
            authz.setRequiresAuthentication(requiresAuth);

            authz.setMatchedPattern(securityRule.getPattern());
            authz.setMatchedHttpMethod(securityRule.getHttpMethod());
            authz.setMatchPriority(securityRule.getPriority());
            authz.setSource("securityConfig");
            return authz;
        }

        // Priority 3: Default (public)
        authz.setPublic(true);
        authz.setSource("default");
        return authz;
    }

    /**
     * Update authentication source field based on SecurityConfig rule
     *
     * @param endpoint The endpoint to update
     * @param securityRule The matched security rule
     */
    private void updateAuthenticationSource(EndpointInfo endpoint, SecurityRule securityRule) {
        AuthenticationInfo auth = endpoint.getAuthentication();
        if (auth == null) {
            return;
        }

        // If endpoint has annotation-based auth, keep that source
        if (auth.hasSecurityRequirements()) {
            auth.setSource("annotation");
            return;
        }

        // If we have a SecurityConfig rule, update authentication based on it
        if (securityRule != null) {
            auth.setRequired(!securityRule.isPermitAll());
            auth.setPermitAll(securityRule.isPermitAll());
            // Use the rule's source to determine authentication source
            String source = "yaml".equals(securityRule.getSource()) ? "yaml" : "SecurityConfig";
            auth.setSource(source);

            // Copy roles from SecurityConfig to authentication
            if (securityRule.hasRoleRequirements()) {
                auth.setRequiredRoles(new ArrayList<>(securityRule.getRequiredRoles()));
            }
        } else {
            // No specific rule found, mark as default
            auth.setSource("default");
        }
    }

    // ============== ROLE EXTRACTION METHODS ==============

    /**
     * Extract all unique roles from the microservice system
     * Roles are extracted from:
     * 1. SecurityConfig.java files in each microservice
     * 2. Authentication annotations on endpoints
     *
     * @param system The microservice system to extract roles from
     * @param endpoints Map of endpoint information
     * @return Set of all unique roles
     */
    private Set<String> extractAllRoles(MicroserviceSystem system, Map<String, EndpointInfo> endpoints) {
        Set<String> allRoles = new HashSet<>();

        // Extract roles from SecurityConfig files for each microservice
        for (Microservice microservice : system.getMicroservices()) {
            Set<String> microserviceRoles = extractRolesFromMicroservice(microservice);
            allRoles.addAll(microserviceRoles);
        }

        // Extract roles from endpoint authentication information
        if (endpoints != null) {
            for (EndpointInfo endpoint : endpoints.values()) {
                if (endpoint.getAuthentication() != null) {
                    AuthenticationInfo auth = endpoint.getAuthentication();
                    if (auth.getRequiredRoles() != null) {
                        allRoles.addAll(auth.getRequiredRoles());
                    }
                }
            }
        }

        return allRoles;
    }

    /**
     * Extract roles from a single microservice by scanning its SecurityConfig file
     *
     * @param microservice The microservice to extract roles from
     * @return Set of roles found in the microservice
     */
    private Set<String> extractRolesFromMicroservice(Microservice microservice) {
        Set<String> roles = new HashSet<>();

        // Get the microservice's base path
        Path microservicePath = microservice.getPath();
        if (microservicePath == null) {
            return roles;
        }

        // Resolve the microservice path - it might be relative
        Path resolvedPath = resolveMicroservicePath(microservicePath);
        if (resolvedPath == null || !resolvedPath.toFile().exists()) {
            return roles;
        }

        // Look for SecurityConfig.java in common locations
        String[] possiblePaths = {
            "src/main/java/*/config/SecurityConfig.java",
            "src/main/java/config/SecurityConfig.java",
            "**/config/SecurityConfig.java"
        };

        for (String pathPattern : possiblePaths) {
            Path securityConfigPath = findSecurityConfig(resolvedPath, pathPattern);
            if (securityConfigPath != null && securityConfigPath.toFile().exists()) {
                Set<String> extractedRoles = RoleExtractor.extractAndNormalizeRoles(securityConfigPath);
                roles.addAll(extractedRoles);
                break; // Found the config, no need to check other patterns
            }
        }

        return roles;
    }

    /**
     * Resolve microservice path to absolute path
     * Handles both absolute and relative paths from the IR
     *
     * @param microservicePath The path from the microservice IR
     * @return Resolved absolute path, or null if cannot be resolved
     */
    private Path resolveMicroservicePath(Path microservicePath) {
        if (microservicePath == null) {
            return null;
        }

        // If it's already absolute and exists, return it
        if (microservicePath.isAbsolute() && microservicePath.toFile().exists()) {
            return microservicePath;
        }

        // Try to resolve relative to current working directory
        Path currentDir = Path.of(System.getProperty("user.dir"));

        // Common base directories to try (ordered by specificity - most specific first)
        // Use dynamic system name from config if available
        String systemName = config != null ? config.getSystemName() : "train-ticket-aitest";
        String[] baseDirs = {
            "clone/" + systemName,
            "clone/train-ticket-microservices-test",
            "clone/train-ticket",
            "clone",
            ""
        };

        for (String baseDir : baseDirs) {
            Path basePath = baseDir.isEmpty() ? currentDir : currentDir.resolve(baseDir);

            // Try appending the microservice path
            Path candidate = basePath.resolve(microservicePath.toString().replaceFirst("^/", ""));
            if (candidate.toFile().exists()) {
                return candidate;
            }
        }

        // As a last resort, try the path as-is from current directory
        Path fromCurrentDir = currentDir.resolve(microservicePath.toString().replaceFirst("^/", ""));
        if (fromCurrentDir.toFile().exists()) {
            return fromCurrentDir;
        }

        return null;
    }

    /**
     * Find SecurityConfig.java file in a microservice directory
     *
     * @param microservicePath Base path of the microservice
     * @param pattern Pattern to search for
     * @return Path to SecurityConfig.java if found, null otherwise
     */
    private Path findSecurityConfig(Path microservicePath, String pattern) {
        try {
            // First, try a direct path construction based on common patterns
            if (pattern.contains("*/config/")) {
                // Try to find any package with a config directory
                Path srcMainJava = microservicePath.resolve("src/main/java");
                if (srcMainJava.toFile().exists()) {
                    java.io.File[] packages = srcMainJava.toFile().listFiles(java.io.File::isDirectory);
                    if (packages != null) {
                        for (java.io.File packageDir : packages) {
                            Path configPath = packageDir.toPath().resolve("config/SecurityConfig.java");
                            if (configPath.toFile().exists()) {
                                return configPath;
                            }
                        }
                    }
                }
            } else if (pattern.equals("src/main/java/config/SecurityConfig.java")) {
                Path configPath = microservicePath.resolve(pattern);
                if (configPath.toFile().exists()) {
                    return configPath;
                }
            }

            // If direct construction fails, try recursive search
            return recursiveFindFile(microservicePath, "SecurityConfig.java");

        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Recursively search for a file in a directory
     *
     * @param directory Directory to search in
     * @param fileName File name to search for
     * @return Path to the file if found, null otherwise
     */
    private Path recursiveFindFile(Path directory, String fileName) {
        try {
            if (!directory.toFile().exists() || !directory.toFile().isDirectory()) {
                return null;
            }

            java.io.File[] files = directory.toFile().listFiles();
            if (files == null) {
                return null;
            }

            // First pass: check direct children
            for (java.io.File file : files) {
                if (file.isFile() && file.getName().equals(fileName)) {
                    return file.toPath();
                }
            }

            // Second pass: recurse into subdirectories (limit depth to avoid deep recursion)
            for (java.io.File file : files) {
                if (file.isDirectory() && !file.getName().startsWith(".")) {
                    Path found = recursiveFindFile(file.toPath(), fileName);
                    if (found != null) {
                        return found;
                    }
                }
            }

            return null;
        } catch (Exception e) {
            return null;
        }
    }

    // ============== ENDPOINT INDEXING METHODS ==============

    /**
     * Index all endpoints in a microservice
     * 
     * @param microservice The microservice to index
     * @param endpoints Map to store endpoint information
     * @param componentCounts Map to track component counts
     * @param components Map of indexed components for method ID resolution
     */
    private void indexMicroserviceEndpoints(Microservice microservice, Map<String, EndpointInfo> endpoints,
                                          Map<String, Integer> componentCounts, Map<String, IndexedComponent> components) {
        for (AbstractClass abstractClass : microservice.getClasses()) {
            indexClassEndpoints(abstractClass, microservice.getName(), endpoints, componentCounts, components);
        }
    }
    
    /**
     * Index all endpoints in a class (if it's a controller)
     * 
     * @param abstractClass The class to check for endpoints
     * @param microserviceName Name of the containing microservice
     * @param endpoints Map to store endpoint information
     * @param componentCounts Map to track component counts
     * @param components Map of indexed components for method ID resolution
     */
    private void indexClassEndpoints(AbstractClass abstractClass, String microserviceName, 
                                   Map<String, EndpointInfo> endpoints, Map<String, Integer> componentCounts,
                                   Map<String, IndexedComponent> components) {
        // Check if this class is a controller
        if (!isControllerClass(abstractClass)) {
            return;
        }
        
        String controllerClass = buildFullyQualifiedClassName(abstractClass);
        
        // Index endpoints from methods
        for (Method method : abstractClass.getMethods()) {
            if (method instanceof Endpoint) {
                Endpoint endpoint = (Endpoint) method;
                EndpointInfo endpointInfo = createEndpointInfo(endpoint, method, microserviceName, controllerClass, components);
                
                if (endpointInfo != null) {
                    endpoints.put(endpointInfo.getId(), endpointInfo);
                    componentCounts.put("Endpoint", componentCounts.get("Endpoint") + 1);
                }
            }
        }
    }
    
    /**
     * Check if a class is a REST controller
     * 
     * @param abstractClass The class to check
     * @return true if the class has controller annotations
     */
    private boolean isControllerClass(AbstractClass abstractClass) {
        for (Annotation annotation : abstractClass.getAnnotations()) {
            String annotationName = annotation.getName();
            if ("RestController".equals(annotationName) || 
                "Controller".equals(annotationName) ||
                annotationName.endsWith("RestController") ||
                annotationName.endsWith("Controller")) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Create EndpointInfo from an Endpoint IR component with enhanced parameter details
     * 
     * @param endpoint The Endpoint IR component
     * @param method The Method IR component (same object, different view)
     * @param microserviceName Name of the containing microservice
     * @param controllerClass Fully qualified controller class name
     * @param components Map of indexed components for method ID resolution
     * @return The EndpointInfo object
     */
    private EndpointInfo createEndpointInfo(Endpoint endpoint, Method method, String microserviceName, 
                                          String controllerClass, Map<String, IndexedComponent> components) {
        // Generate endpoint ID (service-scoped)
        String endpointId = endpoint.getID();
        
        // Find the corresponding method ID in components
        String methodId = method.getID();
        
        // Extract HTTP method and URL
        String httpMethod = endpoint.getHttpMethod() != null ? endpoint.getHttpMethod().toString() : "GET";
        String fullUri = endpoint.getUrl();
        
        // Reconstruct the URL with actual parameter names by correlating {?} placeholders with @PathVariable parameters
        String reconstructedUri = reconstructUrlWithParameterNames(fullUri, method);
        if (reconstructedUri != null && !reconstructedUri.isEmpty()) {
            fullUri = reconstructedUri;
        }
        
        // Extract enhanced parameter information
        List<ParameterDetail> pathParameterDetails = extractPathParameterDetails(method, fullUri);
        List<ParameterDetail> queryParameterDetails = extractQueryParameterDetails(method);
        ParameterDetail requestBodyDetail = extractRequestBodyDetail(method);
        
        // Get response type
        String responseType = method.getReturnType();
        
        // Create description from method name or annotations
        String description = generateEndpointDescription(method);

        // Extract authentication information
        AuthenticationInfo authentication = extractAuthenticationInfo(method);

        // Extract response schema information
        ResponseSchemaInfo responseSchema = extractResponseSchemaInfo(method);

        // Create EndpointInfo with detailed parameter information only
        EndpointInfo endpointInfo = new EndpointInfo();
        endpointInfo.setId(endpointId);
        endpointInfo.setMethodId(methodId);
        endpointInfo.setHttpMethod(httpMethod);
        endpointInfo.setFullUri(fullUri);
        endpointInfo.setPathParameterDetails(pathParameterDetails);
        endpointInfo.setQueryParameterDetails(queryParameterDetails);
        endpointInfo.setRequestBodyDetail(requestBodyDetail);
        endpointInfo.setResponseType(responseType);
        endpointInfo.setControllerClass(controllerClass);
        endpointInfo.setMethodName(method.getName());
        endpointInfo.setDescription(description);
        endpointInfo.setAuthentication(authentication);
        endpointInfo.setResponseSchema(responseSchema);

        return endpointInfo;
    }

    /**
     * Extract authentication information from a method
     *
     * @param method The method to extract authentication from
     * @return Authentication information
     */
    public AuthenticationInfo extractAuthenticationInfo(Method method) {
        try {
            // Get the parent class
            if (!method.getParent().isPresent() || !(method.getParent().get() instanceof AbstractClass)) {
                return AuthenticationInfo.createPublic();
            }

            AbstractClass parentClass = (AbstractClass) method.getParent().get();

            // Get the source file path
            Path sourcePath = parentClass.getPath();
            if (sourcePath == null || !sourcePath.toFile().exists()) {
                sourcePath = resolveSourcePath(parentClass);
                if (sourcePath == null || !sourcePath.toFile().exists()) {
                    return AuthenticationInfo.createPublic();
                }
            }

            // Parse the source file
            CompilationUnit cu = StaticJavaParser.parse(sourcePath.toFile());

            // Find the method declaration
            MethodDeclaration methodDecl = findMethodDeclaration(cu, method);
            if (methodDecl == null) {
                return AuthenticationInfo.createPublic();
            }

            // Find the class declaration
            com.github.javaparser.ast.body.ClassOrInterfaceDeclaration classDecl = null;
            for (com.github.javaparser.ast.body.ClassOrInterfaceDeclaration cls : cu.findAll(com.github.javaparser.ast.body.ClassOrInterfaceDeclaration.class)) {
                if (cls.getNameAsString().equals(parentClass.getName())) {
                    classDecl = cls;
                    break;
                }
            }

            // Extract authentication using AuthenticationExtractor
            return AuthenticationExtractor.extractAuthentication(methodDecl, classDecl);

        } catch (Exception e) {
            // If extraction fails, default to public endpoint
            return AuthenticationInfo.createPublic();
        }
    }

    /**
     * Extract database operation information from a method
     *
     * @param method The method to extract database operation from
     * @param context The containing class
     * @return Database operation information, or null if not a repository method
     */
    private DatabaseOperationInfo extractDatabaseOperationInfo(Method method, AbstractClass context) {
        try {
            // Get the source file path
            Path sourcePath = context.getPath();
            if (sourcePath == null || !sourcePath.toFile().exists()) {
                sourcePath = resolveSourcePath(context);
                if (sourcePath == null || !sourcePath.toFile().exists()) {
                    return null;
                }
            }

            // Parse the source file
            CompilationUnit cu = StaticJavaParser.parse(sourcePath.toFile());

            // Find the method declaration
            MethodDeclaration methodDecl = findMethodDeclaration(cu, method);
            if (methodDecl == null) {
                return null;
            }

            // Find parent class declaration
            com.github.javaparser.ast.body.ClassOrInterfaceDeclaration classDecl = null;
            for (com.github.javaparser.ast.body.ClassOrInterfaceDeclaration cls : cu.findAll(com.github.javaparser.ast.body.ClassOrInterfaceDeclaration.class)) {
                if (cls.getNameAsString().equals(context.getName())) {
                    classDecl = cls;
                    break;
                }
            }

            if (classDecl == null) {
                return null;
            }

            // Detect database operation using DatabaseOperationDetector
            return DatabaseOperationDetector.detectDatabaseOperation(methodDecl, classDecl);

        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Extract response schema information from a method
     *
     * @param method The method to extract response schema from
     * @return Response schema information
     */
    public ResponseSchemaInfo extractResponseSchemaInfo(Method method) {
        try {
            // Get the parent class
            if (!method.getParent().isPresent() || !(method.getParent().get() instanceof AbstractClass)) {
                return ResponseSchemaInfo.createSimple(method.getReturnType());
            }

            AbstractClass parentClass = (AbstractClass) method.getParent().get();

            // Get the source file path
            Path sourcePath = parentClass.getPath();
            if (sourcePath == null || !sourcePath.toFile().exists()) {
                sourcePath = resolveSourcePath(parentClass);
                if (sourcePath == null || !sourcePath.toFile().exists()) {
                    return ResponseSchemaInfo.createSimple(method.getReturnType());
                }
            }

            // Parse the source file
            CompilationUnit cu = StaticJavaParser.parse(sourcePath.toFile());

            // Find the method declaration
            MethodDeclaration methodDecl = findMethodDeclaration(cu, method);
            if (methodDecl == null) {
                return ResponseSchemaInfo.createSimple(method.getReturnType());
            }

            // Create exception handler registry and scan for exception handlers
            ExceptionHandlerRegistry exceptionRegistry = new ExceptionHandlerRegistry();

            // Scan the compilation unit for @ControllerAdvice classes
            exceptionRegistry.scanControllerAdvice(cu);

            // Scan for exception class definitions with @ResponseStatus
            exceptionRegistry.scanExceptionClass(cu);

            // Extract response schema using ResponseSchemaExtractor
            return ResponseSchemaExtractor.extractResponseSchema(methodDecl, exceptionRegistry);

        } catch (Exception e) {
            // If extraction fails, return simple response schema
            return ResponseSchemaInfo.createSimple(method.getReturnType());
        }
    }


    /**
     * Extract validation constraints from a parameter
     *
     * @param method The method containing the parameter
     * @param parameterName The name of the parameter to extract constraints for
     * @return List of validation constraints, or empty list if extraction fails
     */
    private List<ValidationConstraint> extractValidationConstraints(Method method, String parameterName) {
        try {
            // Get the parent class
            if (!method.getParent().isPresent() || !(method.getParent().get() instanceof AbstractClass)) {
                return List.of();
            }

            AbstractClass parentClass = (AbstractClass) method.getParent().get();

            // Get the source file path
            Path sourcePath = parentClass.getPath();
            if (sourcePath == null || !sourcePath.toFile().exists()) {
                sourcePath = resolveSourcePath(parentClass);
                if (sourcePath == null || !sourcePath.toFile().exists()) {
                    return List.of();
                }
            }

            // Parse the source file
            CompilationUnit cu = StaticJavaParser.parse(sourcePath.toFile());

            // Find the method declaration
            MethodDeclaration methodDecl = findMethodDeclaration(cu, method);
            if (methodDecl == null) {
                return List.of();
            }

            // Find the parameter by name
            for (com.github.javaparser.ast.body.Parameter parameter : methodDecl.getParameters()) {
                if (parameter.getNameAsString().equals(parameterName)) {
                    return ValidationExtractor.extractValidationConstraints(parameter);
                }
            }

            return List.of();

        } catch (Exception e) {
            // If extraction fails, return empty list
            return List.of();
        }
    }

    /**
     * Generate a description for the endpoint
     *
     * @param method The method to generate description for
     * @return A descriptive string for the endpoint
     */
    private String generateEndpointDescription(Method method) {
        // For now, use method name as description
        // Could be enhanced to extract from Javadoc or annotations
        String methodName = method.getName();

        // Convert camelCase to readable format
        return methodName.replaceAll("([a-z])([A-Z])", "$1 $2").toLowerCase();
    }
    
    // ============== ENHANCED PARAMETER EXTRACTION METHODS ==============
    
    /**
     * Reconstruct URL with actual parameter names by matching {?} placeholders with @PathVariable parameters
     * 
     * @param simplifiedUri The URI with {?} placeholders
     * @param method The method containing parameter information
     * @return The URI with actual parameter names, or null if reconstruction fails
     */
    private String reconstructUrlWithParameterNames(String simplifiedUri, Method method) {
        if (simplifiedUri == null || !simplifiedUri.contains("{?}")) {
            return simplifiedUri; // No placeholders to replace
        }
        
        // Find all @PathVariable parameters in order
        List<String> pathVariableNames = new ArrayList<>();
        for (Parameter parameter : method.getParameters()) {
            for (Annotation annotation : parameter.getAnnotations()) {
                if ("PathVariable".equals(annotation.getName())) {
                    // Check if annotation has a name attribute, otherwise use parameter name
                    String paramName = annotation.getAttributes().get("value");
                    if (paramName == null || paramName.isEmpty()) {
                        paramName = annotation.getAttributes().get("name");
                    }
                    if (paramName == null || paramName.isEmpty()) {
                        paramName = parameter.getName();
                    }
                    pathVariableNames.add(cleanPath(paramName));
                    break;
                }
            }
        }
        
        // Replace {?} placeholders with actual parameter names in order
        String result = simplifiedUri;
        for (String paramName : pathVariableNames) {
            result = result.replaceFirst("\\{\\?\\}", "{" + paramName + "}");
        }
        
        return result;
    }
    
    /**
     * Extract the original URI from method annotations before parameter simplification
     * 
     * @param method The method to analyze
     * @return The original URI with parameter names, or null if not found
     */
    private String extractOriginalUri(Method method) {
        // Look for Spring mapping annotations to get original URL
        for (Annotation annotation : method.getAnnotations()) {
            String annotationName = annotation.getName();
            if (annotationName.endsWith("Mapping")) {
                // Extract URL from annotation attributes
                String path = extractPathFromAnnotation(annotation);
                if (path != null && !path.isEmpty()) {
                    // Get class-level RequestMapping if exists
                    String classLevelPath = extractClassLevelPath(method);
                    return combinePaths(classLevelPath, path);
                }
            }
        }
        return null; // Use existing URL from Endpoint
    }
    
    /**
     * Extract path from Spring mapping annotation
     */
    private String extractPathFromAnnotation(Annotation annotation) {
        // Check for value or path attribute
        Map<String, String> attributes = annotation.getAttributes();
        
        // Try 'default' first (SingleMemberAnnotationExpr like @GetMapping("/path"))
        String path = attributes.get("default");
        if (path != null && !path.isEmpty()) {
            return cleanPath(path);
        }
        
        // Try 'value' attribute (NormalAnnotationExpr like @GetMapping(value="/path"))
        path = attributes.get("value");
        if (path != null && !path.isEmpty()) {
            return cleanPath(path);
        }
        
        // Try 'path' attribute (NormalAnnotationExpr like @GetMapping(path="/path"))
        path = attributes.get("path");
        if (path != null && !path.isEmpty()) {
            return cleanPath(path);
        }
        
        return null;
    }
    
    /**
     * Extract class-level RequestMapping path
     */
    private String extractClassLevelPath(Method method) {
        // Get the parent class annotations
        if (method.getParent().isPresent() && method.getParent().get() instanceof AbstractClass) {
            AbstractClass parentClass = (AbstractClass) method.getParent().get();
            for (Annotation annotation : parentClass.getAnnotations()) {
                if ("RequestMapping".equals(annotation.getName())) {
                    return extractPathFromAnnotation(annotation);
                }
            }
        }
        return "";
    }
    
    /**
     * Combine class-level and method-level paths
     */
    private String combinePaths(String classPath, String methodPath) {
        if (classPath == null || classPath.isEmpty()) {
            return methodPath;
        }
        if (methodPath == null || methodPath.isEmpty()) {
            return classPath;
        }
        
        // Ensure paths start with slash
        if (!classPath.startsWith("/")) {
            classPath = "/" + classPath;
        }
        if (!methodPath.startsWith("/")) {
            methodPath = "/" + methodPath;
        }
        
        // Combine paths
        String combined = classPath + methodPath;
        
        // Clean up double slashes
        combined = combined.replaceAll("//+", "/");
        
        // Remove trailing slash unless it's the root
        if (combined.endsWith("/") && !combined.equals("/")) {
            combined = combined.substring(0, combined.length() - 1);
        }
        
        return combined;
    }
    
    /**
     * Clean path value from annotation (remove quotes, etc.)
     */
    private String cleanPath(String path) {
        if (path == null) {
            return null;
        }
        
        // Remove quotes
        path = path.replaceAll("^\"|\"$", "");
        path = path.replaceAll("^'|'$", "");
        
        // Handle array notation ["/path"] -> "/path"
        if (path.startsWith("[") && path.endsWith("]")) {
            path = path.substring(1, path.length() - 1);
            path = path.replaceAll("^\"|\"$", "");
            path = path.replaceAll("^'|'$", "");
        }
        
        return path.trim();
    }
    
    /**
     * Extract detailed path parameter information
     * 
     * @param method The method to analyze
     * @param uri The endpoint URI
     * @return List of detailed path parameter information
     */
    public List<ParameterDetail> extractPathParameterDetails(Method method, String uri) {
        List<ParameterDetail> details = new ArrayList<>();
        
        // Extract parameter names from URI (parameters in curly braces)
        List<String> uriParams = new ArrayList<>();
        if (uri != null) {
            java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("\\{([^}]+)\\}");
            java.util.regex.Matcher matcher = pattern.matcher(uri);
            while (matcher.find()) {
                uriParams.add(matcher.group(1));
            }
        }
        
        // Find method parameters with @PathVariable annotation
        int position = 0;
        for (Parameter parameter : method.getParameters()) {
            if (hasPathVariableAnnotation(parameter)) {
                String paramName = getPathVariableName(parameter);
                if (paramName == null) {
                    paramName = parameter.getName(); // Use parameter name if annotation value not specified
                }
                
                // Check if this parameter name exists in the URI
                if (uriParams.contains(paramName)) {
                    ParameterDetail detail = new ParameterDetail();
                    detail.setName(paramName);
                    detail.setType(getSimpleTypeName(parameter.getParameterType()));
                    detail.setJavaType(parameter.getParameterType());
                    detail.setRequired(true); // Path variables are always required
                    detail.setDefaultValue(null);
                    detail.setAnnotations(extractAnnotationNames(parameter));
                    detail.setPosition(position);

                    // Extract validation constraints
                    List<ValidationConstraint> validationConstraints = extractValidationConstraints(method, paramName);
                    detail.setValidationConstraints(validationConstraints);

                    details.add(detail);
                }
            }
            position++;
        }
        
        return details;
    }
    
    /**
     * Extract detailed query parameter information
     * 
     * @param method The method to analyze
     * @return List of detailed query parameter information
     */
    public List<ParameterDetail> extractQueryParameterDetails(Method method) {
        List<ParameterDetail> details = new ArrayList<>();
        
        int position = 0;
        for (Parameter parameter : method.getParameters()) {
            if (hasRequestParamAnnotation(parameter)) {
                String paramName = getRequestParamName(parameter);
                ParameterDetail detail = new ParameterDetail();
                detail.setName(paramName);
                detail.setType(getSimpleTypeName(parameter.getParameterType()));
                detail.setJavaType(parameter.getParameterType());
                detail.setRequired(getRequestParamRequired(parameter));
                detail.setDefaultValue(getRequestParamDefaultValue(parameter));
                detail.setAnnotations(extractAnnotationNames(parameter));
                detail.setPosition(position);

                // Extract validation constraints
                List<ValidationConstraint> validationConstraints = extractValidationConstraints(method, paramName);
                detail.setValidationConstraints(validationConstraints);

                details.add(detail);
            }
            position++;
        }
        
        return details;
    }
    
    /**
     * Extract detailed request body parameter information
     * 
     * @param method The method to analyze
     * @return ParameterDetail for request body, or null if none
     */
    public ParameterDetail extractRequestBodyDetail(Method method) {
        int position = 0;
        for (Parameter parameter : method.getParameters()) {
            if (hasRequestBodyAnnotation(parameter)) {
                String paramName = parameter.getName();
                ParameterDetail detail = new ParameterDetail();
                detail.setName(paramName);
                detail.setType(getSimpleTypeName(parameter.getParameterType()));
                detail.setJavaType(parameter.getParameterType());
                detail.setRequired(true); // Request body is typically required
                detail.setDefaultValue(null);
                detail.setAnnotations(extractAnnotationNames(parameter));
                detail.setPosition(position);

                // Extract validation constraints
                List<ValidationConstraint> validationConstraints = extractValidationConstraints(method, paramName);
                detail.setValidationConstraints(validationConstraints);

                return detail;
            }
            position++;
        }
        return null;
    }
    
    /**
     * Check if parameter has @PathVariable annotation
     */
    private boolean hasPathVariableAnnotation(Parameter parameter) {
        return parameter.getAnnotations().stream()
            .anyMatch(ann -> "PathVariable".equals(ann.getName()) || ann.getName().endsWith("PathVariable"));
    }
    
    /**
     * Check if parameter has @RequestParam annotation
     */
    private boolean hasRequestParamAnnotation(Parameter parameter) {
        return parameter.getAnnotations().stream()
            .anyMatch(ann -> "RequestParam".equals(ann.getName()) || ann.getName().endsWith("RequestParam"));
    }
    
    /**
     * Check if parameter has @RequestBody annotation
     */
    private boolean hasRequestBodyAnnotation(Parameter parameter) {
        return parameter.getAnnotations().stream()
            .anyMatch(ann -> "RequestBody".equals(ann.getName()) || ann.getName().endsWith("RequestBody"));
    }
    
    /**
     * Extract path variable name from annotation
     */
    private String getPathVariableName(Parameter parameter) {
        // For now, return the parameter name
        // TODO: Extract actual value from @PathVariable annotation when attribute parsing is available
        return parameter.getName();
    }
    
    /**
     * Extract request param name from annotation
     */
    private String getRequestParamName(Parameter parameter) {
        // For now, return the parameter name
        // TODO: Extract actual value from @RequestParam annotation when attribute parsing is available
        return parameter.getName();
    }
    
    /**
     * Extract required attribute from @RequestParam annotation
     */
    private boolean getRequestParamRequired(Parameter parameter) {
        // For now, default to true
        // TODO: Extract actual required value from @RequestParam annotation when attribute parsing is available
        return true;
    }
    
    /**
     * Extract defaultValue attribute from @RequestParam annotation
     */
    private String getRequestParamDefaultValue(Parameter parameter) {
        // For now, return null
        // TODO: Extract actual defaultValue from @RequestParam annotation when attribute parsing is available
        return null;
    }
    
    /**
     * Extract annotation names from parameter
     */
    private List<String> extractAnnotationNames(Parameter parameter) {
        List<String> names = new ArrayList<>();
        for (Annotation annotation : parameter.getAnnotations()) {
            names.add(annotation.getName());
        }
        return names;
    }
    
    /**
     * Get simple type name from fully qualified type
     */
    private String getSimpleTypeName(String fullyQualifiedType) {
        if (fullyQualifiedType == null) {
            return "Object";
        }
        
        // Handle generics
        if (fullyQualifiedType.contains("<")) {
            fullyQualifiedType = fullyQualifiedType.substring(0, fullyQualifiedType.indexOf("<"));
        }
        
        // Get simple name
        int lastDot = fullyQualifiedType.lastIndexOf('.');
        if (lastDot >= 0) {
            return fullyQualifiedType.substring(lastDot + 1);
        }
        
        return fullyQualifiedType;
    }
}