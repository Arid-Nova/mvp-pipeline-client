package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import edu.university.ecs.lab.common.models.ir.Annotation;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Set;

/**
 * Represents a method parameter with type reference information.
 * Used by IndexedMethod to store enhanced parameter data with navigation capabilities.
 */
@Getter
@Setter
@NoArgsConstructor
public class IndexedParameter {
    
    /**
     * Parameter name
     */
    private String name;
    
    /**
     * Parameter type (simple name)
     */
    private String type;
    
    /**
     * Reference to the indexed type component (null if type is not indexed)
     */
    private String typeId;
    
    /**
     * Fully qualified type name (always stored for reference)
     */
    private String fullyQualifiedType;
    
    /**
     * Whether this parameter has a generic type (e.g., List<User>)
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
     * Parameter annotations from IR
     */
    private Set<Annotation> annotations;
    
    /**
     * Whether this is a variable parameter (varargs)
     */
    private boolean isVariableParameter;
    
    /**
     * Parameter type for signature generation
     */
    private String parameterTypeForSignature;
    
    /**
     * Full ID of the parameter from IR
     */
    private String fullId;
    
    /**
     * Service-scoped ID of the parameter
     */
    private String id;
    
    /**
     * Constructor for IndexedParameter
     * 
     * @param name Parameter name
     * @param type Parameter type
     * @param typeId Reference to indexed type
     * @param fullyQualifiedType Fully qualified type name
     * @param isGenericType Whether parameter has generic type
     * @param genericTypeId Reference to generic parameter type
     * @param fullyQualifiedGenericType Fully qualified generic parameter type
     * @param annotations Parameter annotations
     * @param isVariableParameter Whether this is varargs
     * @param parameterTypeForSignature Type for signature
     * @param fullId Full ID from IR
     * @param id Service-scoped ID
     */
    public IndexedParameter(String name, String type, String typeId, String fullyQualifiedType,
                           boolean isGenericType, String genericTypeId, String fullyQualifiedGenericType,
                           Set<Annotation> annotations, boolean isVariableParameter, 
                           String parameterTypeForSignature, String fullId, String id) {
        this.name = name;
        this.type = type;
        this.typeId = typeId;
        this.fullyQualifiedType = fullyQualifiedType;
        this.isGenericType = isGenericType;
        this.genericTypeId = genericTypeId;
        this.fullyQualifiedGenericType = fullyQualifiedGenericType;
        this.annotations = annotations;
        this.isVariableParameter = isVariableParameter;
        this.parameterTypeForSignature = parameterTypeForSignature;
        this.fullId = fullId;
        this.id = id;
    }
    
    /**
     * Check if this parameter's type is indexed and can be navigated to
     * 
     * @return true if typeId is not null
     */
    public boolean hasIndexedType() {
        return typeId != null;
    }
    
    /**
     * Check if this parameter's generic parameter type is indexed
     * 
     * @return true if genericTypeId is not null
     */
    public boolean hasIndexedGenericType() {
        return genericTypeId != null;
    }
    
    /**
     * Get the effective type name for display (uses fullyQualifiedType if available, otherwise type)
     * 
     * @return The most appropriate type name for display
     */
    public String getEffectiveTypeName() {
        return fullyQualifiedType != null ? fullyQualifiedType : type;
    }
}