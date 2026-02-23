package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Represents a field component that has been indexed with all Field IR properties.
 * Extends IndexedComponent to include complete field metadata.
 */
@Getter
@Setter
@NoArgsConstructor
public class IndexedField extends IndexedComponent {
    
    /**
     * Java data type from IR (e.g., String, Logger)
     */
    private String fieldType;
    
    /**
     * Access modifier from IR (PUBLIC, PRIVATE, PROTECTED, PACKAGE_PRIVATE)
     */
    private String protection;
    
    /**
     * Static modifier from IR
     */
    private Boolean isStatic;
    
    /**
     * Final modifier from IR
     */
    private Boolean isFinal;
    
    /**
     * Reference to the indexed type component (null if type is not indexed)
     */
    private String typeId;
    
    /**
     * Fully qualified type name (always stored for reference)
     */
    private String fullyQualifiedType;
    
    /**
     * Whether this field has a generic type (e.g., List<User>)
     */
    private boolean isGenericType;
    
    /**
     * Reference to the generic parameter type component (null if not indexed)
     * For simple generics like List<User>, this refers to User
     */
    private String genericTypeId;
    
    /**
     * Fully qualified generic parameter type name
     * For simple generics like List<User>, this would be the fully qualified User type
     */
    private String fullyQualifiedGenericType;

    /**
     * Whether this field is autowired (has @Autowired annotation)
     */
    private boolean autowired;

    /**
     * Resolved implementation type (for @Autowired fields with interface types)
     * Example: Field type is "UserService" (interface), resolved type is "UserServiceImpl"
     */
    private String resolvedImplementationType;

    /**
     * Resolved implementation component ID (for @Autowired fields)
     */
    private String resolvedImplementationId;

    /**
     * How the dependency injection was resolved
     * Values: null (not DI), "EXACT" (only one impl), "PRIMARY" (@Primary bean), "AMBIGUOUS" (multiple impls)
     */
    private String diResolutionStrategy;

    /**
     * Constructor for IndexedField
     * 
     * @param type Component type
     * @param name Component name
     * @param id Service-scoped ID
     * @param fullID Full canonical signature
     * @param microservice Microservice name
     * @param className Class name
     * @param metadata Component metadata
     * @param fieldType Java data type
     * @param protection Access modifier
     * @param isStatic Static modifier
     * @param isFinal Final modifier
     */
    public IndexedField(String type, String name, String id, String fullID, String microservice, 
                       String className, Object metadata, String fieldType, String protection, 
                       Boolean isStatic, Boolean isFinal) {
        super(type, name, id, fullID, microservice, className, metadata);
        this.fieldType = fieldType;
        this.protection = protection;
        this.isStatic = isStatic;
        this.isFinal = isFinal;
        // Type references will be set separately during indexing
        this.typeId = null;
        this.fullyQualifiedType = null;
        this.isGenericType = false;
        this.genericTypeId = null;
        this.fullyQualifiedGenericType = null;
    }
    
    /**
     * Enhanced constructor for IndexedField with type references
     * 
     * @param type Component type
     * @param name Component name
     * @param id Service-scoped ID
     * @param fullID Full canonical signature
     * @param microservice Microservice name
     * @param className Class name
     * @param metadata Component metadata
     * @param fieldType Java data type
     * @param protection Access modifier
     * @param isStatic Static modifier
     * @param isFinal Final modifier
     * @param typeId Reference to indexed type
     * @param fullyQualifiedType Fully qualified type name
     * @param isGenericType Whether field has generic type
     * @param genericTypeId Reference to generic parameter type
     * @param fullyQualifiedGenericType Fully qualified generic parameter type
     */
    public IndexedField(String type, String name, String id, String fullID, String microservice, 
                       String className, Object metadata, String fieldType, String protection, 
                       Boolean isStatic, Boolean isFinal, String typeId, String fullyQualifiedType,
                       boolean isGenericType, String genericTypeId, String fullyQualifiedGenericType) {
        super(type, name, id, fullID, microservice, className, metadata);
        this.fieldType = fieldType;
        this.protection = protection;
        this.isStatic = isStatic;
        this.isFinal = isFinal;
        this.typeId = typeId;
        this.fullyQualifiedType = fullyQualifiedType;
        this.isGenericType = isGenericType;
        this.genericTypeId = genericTypeId;
        this.fullyQualifiedGenericType = fullyQualifiedGenericType;
    }
    
    /**
     * Check if this field's type is indexed and can be navigated to
     * 
     * @return true if typeId is not null
     */
    public boolean hasIndexedType() {
        return typeId != null;
    }
    
    /**
     * Check if this field's generic parameter type is indexed
     * 
     * @return true if genericTypeId is not null
     */
    public boolean hasIndexedGenericType() {
        return genericTypeId != null;
    }
    
    /**
     * Get the effective type name for display (uses fullyQualifiedType if available, otherwise fieldType)
     * 
     * @return The most appropriate type name for display
     */
    public String getEffectiveTypeName() {
        return fullyQualifiedType != null ? fullyQualifiedType : fieldType;
    }
}