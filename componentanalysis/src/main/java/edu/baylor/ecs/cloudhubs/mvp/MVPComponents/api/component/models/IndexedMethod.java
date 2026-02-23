package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import com.fasterxml.jackson.annotation.JsonInclude;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg.EnhancedICFG;
import edu.university.ecs.lab.common.models.ir.Annotation;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Represents a method component that has been indexed with all Method IR properties.
 * Extends IndexedComponent to include complete method metadata.
 * Note: methodCalls are excluded for now as per the enhancement plan.
 */
@Getter
@Setter
@NoArgsConstructor
public class IndexedMethod extends IndexedComponent {
    
    /**
     * Access modifier from IR (PUBLIC, PRIVATE, PROTECTED, PACKAGE_PRIVATE)
     */
    private String protection;
    
    /**
     * Return type from IR
     */
    private String returnType;
    
    /**
     * Abstract modifier from IR
     */
    private Boolean isAbstract;
    
    /**
     * Static modifier from IR
     */
    private Boolean isStatic;
    
    /**
     * Final modifier from IR
     */
    private Boolean isFinal;
    
    /**
     * Constructor flag from IR
     */
    private Boolean isConstructor;
    
    /**
     * Enhanced parameter storage with type references
     * Contains all parameter information including type navigation capabilities
     */
    private List<IndexedParameter> parameters;
    
    /**
     * Full annotation objects from IR
     */
    private Set<Annotation> annotations;
    
    /**
     * Exception types from IR
     */
    private Set<String> thrownExceptions;
    
    /**
     * Reference to the indexed return type component (null if return type is not indexed)
     */
    private String returnTypeId;
    
    /**
     * Fully qualified return type name (always stored for reference)
     */
    private String fullyQualifiedReturnType;
    
    /**
     * Whether this method has a generic return type (e.g., List<User>)
     */
    private boolean isGenericReturnType;
    
    /**
     * Reference to the generic return type parameter component (null if not indexed)
     * For simple generics like List<User>, this refers to User
     */
    private String genericReturnTypeId;
    
    /**
     * Fully qualified generic return type parameter name
     * For simple generics like List<User>, this would be the fully qualified User type
     */
    private String fullyQualifiedGenericReturnType;
    
    /**
     * Enhanced Interprocedural Control Flow Graph with rich semantic information
     * Contains control flow nodes and edges representing the method's execution paths
     * with source locations, data flow analysis, and detailed control structure information
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private EnhancedICFG controlFlowGraph;

    /**
     * Database operation information for repository methods
     * Contains query details, transaction settings, and operation types
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private DatabaseOperationInfo databaseOperation;
    
    /**
     * Constructor for IndexedMethod
     * 
     * @param type Component type
     * @param name Component name
     * @param id Service-scoped ID
     * @param fullID Full canonical signature
     * @param microservice Microservice name
     * @param className Class name
     * @param metadata Component metadata
     * @param protection Access modifier
     * @param returnType Return type
     * @param isAbstract Abstract modifier
     * @param isStatic Static modifier
     * @param isFinal Final modifier
     * @param isConstructor Constructor flag
     * @param annotations Full annotation objects
     * @param thrownExceptions Exception types
     */
    public IndexedMethod(String type, String name, String id, String fullID, String microservice, 
                        String className, Object metadata, String protection, String returnType,
                        Boolean isAbstract, Boolean isStatic, Boolean isFinal, Boolean isConstructor,
                        Set<Annotation> annotations, Set<String> thrownExceptions) {
        super(type, name, id, fullID, microservice, className, metadata);
        this.protection = protection;
        this.returnType = returnType;
        this.isAbstract = isAbstract;
        this.isStatic = isStatic;
        this.isFinal = isFinal;
        this.isConstructor = isConstructor;
        this.parameters = new ArrayList<>();
        this.annotations = annotations;
        this.thrownExceptions = thrownExceptions;
        // Type references will be set separately during indexing
        this.returnTypeId = null;
        this.fullyQualifiedReturnType = null;
        this.isGenericReturnType = false;
        this.genericReturnTypeId = null;
        this.fullyQualifiedGenericReturnType = null;
        this.controlFlowGraph = null;
    }
    
    /**
     * Enhanced constructor for IndexedMethod with type references
     * 
     * @param type Component type
     * @param name Component name
     * @param id Service-scoped ID
     * @param fullID Full canonical signature
     * @param microservice Microservice name
     * @param className Class name
     * @param metadata Component metadata
     * @param protection Access modifier
     * @param returnType Return type
     * @param isAbstract Abstract modifier
     * @param isStatic Static modifier
     * @param isFinal Final modifier
     * @param isConstructor Constructor flag
     * @param parameters Enhanced parameter storage with type references
     * @param annotations Full annotation objects
     * @param thrownExceptions Exception types
     * @param returnTypeId Reference to indexed return type
     * @param fullyQualifiedReturnType Fully qualified return type name
     * @param isGenericReturnType Whether method has generic return type
     * @param genericReturnTypeId Reference to generic return type parameter
     * @param fullyQualifiedGenericReturnType Fully qualified generic return type parameter
     * @param controlFlowGraph Enhanced Interprocedural Control Flow Graph for this method
     */
    public IndexedMethod(String type, String name, String id, String fullID, String microservice, 
                        String className, Object metadata, String protection, String returnType,
                        Boolean isAbstract, Boolean isStatic, Boolean isFinal, Boolean isConstructor,
                        List<IndexedParameter> parameters, Set<Annotation> annotations, Set<String> thrownExceptions,
                        String returnTypeId, String fullyQualifiedReturnType, boolean isGenericReturnType,
                        String genericReturnTypeId, String fullyQualifiedGenericReturnType, EnhancedICFG controlFlowGraph) {
        super(type, name, id, fullID, microservice, className, metadata);
        this.protection = protection;
        this.returnType = returnType;
        this.isAbstract = isAbstract;
        this.isStatic = isStatic;
        this.isFinal = isFinal;
        this.isConstructor = isConstructor;
        this.parameters = parameters != null ? parameters : new ArrayList<>();
        this.annotations = annotations;
        this.thrownExceptions = thrownExceptions;
        this.returnTypeId = returnTypeId;
        this.fullyQualifiedReturnType = fullyQualifiedReturnType;
        this.isGenericReturnType = isGenericReturnType;
        this.genericReturnTypeId = genericReturnTypeId;
        this.fullyQualifiedGenericReturnType = fullyQualifiedGenericReturnType;
        this.controlFlowGraph = controlFlowGraph;
    }
    
    /**
     * Check if this method's return type is indexed and can be navigated to
     * 
     * @return true if returnTypeId is not null
     */
    public boolean hasIndexedReturnType() {
        return returnTypeId != null;
    }
    
    /**
     * Check if this method's generic return type parameter is indexed
     * 
     * @return true if genericReturnTypeId is not null
     */
    public boolean hasIndexedGenericReturnType() {
        return genericReturnTypeId != null;
    }
    
    /**
     * Get the effective return type name for display
     * 
     * @return The most appropriate return type name for display
     */
    public String getEffectiveReturnTypeName() {
        return fullyQualifiedReturnType != null ? fullyQualifiedReturnType : returnType;
    }
    
    /**
     * Get the number of parameters
     * 
     * @return Number of parameters
     */
    public int getParameterCount() {
        return parameters != null ? parameters.size() : 0;
    }
    
    /**
     * Check if this method has any parameters with indexed types
     * 
     * @return true if any parameter has an indexed type
     */
    public boolean hasParametersWithIndexedTypes() {
        if (parameters == null) return false;
        return parameters.stream().anyMatch(IndexedParameter::hasIndexedType);
    }
    
    /**
     * Check if this method has a control flow graph
     *
     * @return true if controlFlowGraph is not null and not empty
     */
    public boolean hasControlFlowGraph() {
        return controlFlowGraph != null && !controlFlowGraph.isEmpty();
    }

    /**
     * Check if this method has database operation information
     *
     * @return true if databaseOperation is not null
     */
    public boolean hasDatabaseOperation() {
        return databaseOperation != null;
    }
}