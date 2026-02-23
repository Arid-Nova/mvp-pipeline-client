package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Represents parsed information about a Java type, including generics and arrays.
 * Used by TypeResolutionUtils to handle complex type parsing.
 */
@Getter
@Setter
@NoArgsConstructor
public class TypeInfo {
    
    /**
     * The base type name (without generics or array brackets)
     * Example: "List" from "List<String>[]"
     */
    private String baseType;
    
    /**
     * The fully qualified base type name
     * Example: "java.util.List" from "List<String>[]"
     */
    private String fullyQualifiedBaseType;
    
    /**
     * List of generic parameter type information
     * Example: For "Map<String, List<User>>", contains TypeInfo for "String" and "List<User>"
     */
    private List<TypeInfo> genericParameters = new ArrayList<>();
    
    /**
     * Whether this type is an array
     */
    private boolean isArray;
    
    /**
     * Number of array dimensions
     * Example: 1 for "String[]", 2 for "int[][]"
     */
    private int arrayDimensions;
    
    /**
     * Constructor for simple types (no generics, no arrays)
     * 
     * @param baseType The base type name
     * @param fullyQualifiedBaseType The fully qualified base type name
     */
    public TypeInfo(String baseType, String fullyQualifiedBaseType) {
        this.baseType = baseType;
        this.fullyQualifiedBaseType = fullyQualifiedBaseType;
        this.isArray = false;
        this.arrayDimensions = 0;
    }
    
    /**
     * Constructor for array types
     * 
     * @param baseType The base type name
     * @param fullyQualifiedBaseType The fully qualified base type name
     * @param arrayDimensions Number of array dimensions
     */
    public TypeInfo(String baseType, String fullyQualifiedBaseType, int arrayDimensions) {
        this.baseType = baseType;
        this.fullyQualifiedBaseType = fullyQualifiedBaseType;
        this.isArray = arrayDimensions > 0;
        this.arrayDimensions = arrayDimensions;
    }
    
    /**
     * Check if this type has generic parameters
     * 
     * @return true if the type has generic parameters
     */
    public boolean hasGenericParameters() {
        return !genericParameters.isEmpty();
    }
    
    /**
     * Get the first generic parameter (useful for collections like List<T>)
     * 
     * @return The first generic parameter, or null if none
     */
    public TypeInfo getFirstGenericParameter() {
        return genericParameters.isEmpty() ? null : genericParameters.get(0);
    }
    
    /**
     * Add a generic parameter
     * 
     * @param parameterType The generic parameter to add
     */
    public void addGenericParameter(TypeInfo parameterType) {
        if (parameterType != null) {
            this.genericParameters.add(parameterType);
        }
    }
    
    /**
     * Get the full type string representation
     * 
     * @return Full type string with generics and array brackets
     */
    public String getFullTypeString() {
        StringBuilder sb = new StringBuilder();
        
        // Base type
        sb.append(fullyQualifiedBaseType != null ? fullyQualifiedBaseType : baseType);
        
        // Generic parameters
        if (hasGenericParameters()) {
            sb.append("<");
            for (int i = 0; i < genericParameters.size(); i++) {
                if (i > 0) sb.append(", ");
                sb.append(genericParameters.get(i).getFullTypeString());
            }
            sb.append(">");
        }
        
        // Array brackets
        for (int i = 0; i < arrayDimensions; i++) {
            sb.append("[]");
        }
        
        return sb.toString();
    }
    
    /**
     * Get the simple type string representation (using simple names)
     * 
     * @return Simple type string with generics and array brackets
     */
    public String getSimpleTypeString() {
        StringBuilder sb = new StringBuilder();
        
        // Base type (simple name)
        sb.append(baseType);
        
        // Generic parameters
        if (hasGenericParameters()) {
            sb.append("<");
            for (int i = 0; i < genericParameters.size(); i++) {
                if (i > 0) sb.append(", ");
                sb.append(genericParameters.get(i).getSimpleTypeString());
            }
            sb.append(">");
        }
        
        // Array brackets
        for (int i = 0; i < arrayDimensions; i++) {
            sb.append("[]");
        }
        
        return sb.toString();
    }
    
    @Override
    public String toString() {
        return getFullTypeString();
    }
    
    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (obj == null || getClass() != obj.getClass()) return false;
        
        TypeInfo typeInfo = (TypeInfo) obj;
        
        return isArray == typeInfo.isArray &&
               arrayDimensions == typeInfo.arrayDimensions &&
               baseType.equals(typeInfo.baseType) &&
               (fullyQualifiedBaseType != null ? fullyQualifiedBaseType.equals(typeInfo.fullyQualifiedBaseType) 
                                               : typeInfo.fullyQualifiedBaseType == null) &&
               genericParameters.equals(typeInfo.genericParameters);
    }
    
    @Override
    public int hashCode() {
        int result = baseType.hashCode();
        result = 31 * result + (fullyQualifiedBaseType != null ? fullyQualifiedBaseType.hashCode() : 0);
        result = 31 * result + genericParameters.hashCode();
        result = 31 * result + (isArray ? 1 : 0);
        result = 31 * result + arrayDimensions;
        return result;
    }
}