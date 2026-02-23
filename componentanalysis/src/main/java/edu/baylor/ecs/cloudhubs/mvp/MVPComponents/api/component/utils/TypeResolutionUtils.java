package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils;

import edu.university.ecs.lab.common.models.ir.Import;

import java.util.Arrays;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Utility class for resolving Java types in the indexer service.
 * Handles primitive types, generic types, arrays, and type resolution using imports.
 */
public class TypeResolutionUtils {
    
    /**
     * Set of Java primitive type names
     */
    private static final Set<String> PRIMITIVE_TYPES = Set.of(
        "int", "char", "boolean", "byte", "short", "long", "float", "double", "void"
    );
    
    /**
     * Set of primitive array patterns
     */
    private static final Set<String> PRIMITIVE_ARRAY_PATTERNS = Set.of(
        "int[]", "char[]", "boolean[]", "byte[]", "short[]", "long[]", "float[]", "double[]"
    );
    
    /**
     * Set of whitelisted Java types that should be indexed if referenced
     */
    private static final Set<String> WHITELISTED_TYPES = Set.of(
        // Core Java types
        "java.lang.String", "java.lang.Integer", "java.lang.Long", "java.lang.Double", 
        "java.lang.Boolean", "java.lang.Character", "java.lang.Byte", "java.lang.Short", 
        "java.lang.Float", "java.lang.Object",
        
        // Math types
        "java.math.BigDecimal", "java.math.BigInteger",
        
        // Date/Time types
        "java.util.Date", "java.time.LocalDate", "java.time.LocalDateTime", 
        "java.time.Instant", "java.time.ZonedDateTime", "java.time.LocalTime",
        
        // Utility types
        "java.util.UUID", "java.util.Optional",
        
        // Collections
        "java.util.List", "java.util.ArrayList", "java.util.LinkedList",
        "java.util.Set", "java.util.HashSet", "java.util.TreeSet", "java.util.LinkedHashSet",
        "java.util.Map", "java.util.HashMap", "java.util.TreeMap", "java.util.LinkedHashMap",
        "java.util.Queue", "java.util.Deque", "java.util.Stack",
        "java.util.Collection", "java.util.Iterator",
        
        // Spring Framework types
        "org.springframework.web.client.RestTemplate",
        "org.springframework.http.ResponseEntity", "org.springframework.http.HttpHeaders",
        "org.springframework.http.HttpStatus", "org.springframework.http.HttpEntity",
        
        // JPA types
        "javax.persistence.Entity", "org.springframework.data.jpa.repository.JpaRepository",
        
        // Jackson types
        "com.fasterxml.jackson.databind.ObjectMapper", "com.fasterxml.jackson.databind.JsonNode"
    );
    
    /**
     * Pattern for extracting generic type information
     * Matches: List<String>, Map<String, Integer>, Optional<User>, etc.
     */
    private static final Pattern GENERIC_TYPE_PATTERN = Pattern.compile("([^<]+)<(.+)>");
    
    /**
     * Pattern for array types
     * Matches: String[], int[][], User[][][], etc.
     */
    private static final Pattern ARRAY_TYPE_PATTERN = Pattern.compile("(.+)(\\[\\])+");
    
    /**
     * Check if a type is a Java primitive
     * 
     * @param type The type name to check
     * @return true if the type is a primitive
     */
    public static boolean isPrimitiveType(String type) {
        if (type == null) return false;
        
        // Remove array brackets to check base type
        String baseType = type.replaceAll("\\[\\]", "");
        return PRIMITIVE_TYPES.contains(baseType);
    }
    
    /**
     * Check if a type is a primitive array
     * 
     * @param type The type name to check
     * @return true if the type is a primitive array
     */
    public static boolean isPrimitiveArray(String type) {
        if (type == null) return false;
        
        // Check for exact primitive array matches or multi-dimensional arrays
        return PRIMITIVE_ARRAY_PATTERNS.contains(type) || 
               (type.contains("[]") && isPrimitiveType(type.replaceAll("\\[\\]", "")));
    }
    
    /**
     * Check if a fully qualified type is in the whitelist
     * 
     * @param fullyQualifiedType The fully qualified type name
     * @return true if the type is whitelisted
     */
    public static boolean isWhitelistedType(String fullyQualifiedType) {
        if (fullyQualifiedType == null) return false;
        
        // Remove array brackets and generic parameters for comparison
        String baseType = extractBaseType(fullyQualifiedType);
        return WHITELISTED_TYPES.contains(baseType);
    }
    
    /**
     * Determine if a type should be indexed based on our strategy
     * 
     * @param fullyQualifiedType The fully qualified type name
     * @return true if the type should be indexed
     */
    public static boolean shouldIndexType(String fullyQualifiedType) {
        if (fullyQualifiedType == null) return false;
        
        // Never index primitives or primitive arrays
        if (isPrimitiveType(fullyQualifiedType) || isPrimitiveArray(fullyQualifiedType)) {
            return false;
        }
        
        // Index whitelisted types
        if (isWhitelistedType(fullyQualifiedType)) {
            return true;
        }
        
        // Index user-defined types (not in java.* or javax.* packages)
        String baseType = extractBaseType(fullyQualifiedType);
        return !baseType.startsWith("java.") && !baseType.startsWith("javax.");
    }
    
    /**
     * Resolve a simple type name to its fully qualified name using imports
     * 
     * @param simpleType The simple type name (e.g., "String", "List")
     * @param imports The set of imports from the class
     * @return The fully qualified type name, or the original if not resolvable
     */
    public static String resolveType(String simpleType, Set<Import> imports) {
        if (simpleType == null || imports == null) {
            return simpleType;
        }
        
        // Handle primitive types
        if (isPrimitiveType(simpleType)) {
            return simpleType;
        }
        
        // Handle array types
        if (simpleType.contains("[]")) {
            String baseType = simpleType.replaceAll("\\[\\]", "");
            String resolvedBase = resolveType(baseType, imports);
            return resolvedBase + simpleType.substring(baseType.length());
        }
        
        // Handle generic types
        Matcher genericMatcher = GENERIC_TYPE_PATTERN.matcher(simpleType);
        if (genericMatcher.matches()) {
            String containerType = genericMatcher.group(1);
            String genericParams = genericMatcher.group(2);
            
            String resolvedContainer = resolveType(containerType, imports);
            String resolvedParams = resolveGenericParameters(genericParams, imports);
            
            return resolvedContainer + "<" + resolvedParams + ">";
        }
        
        // Check java.lang types (automatically imported)
        String javaLangType = "java.lang." + simpleType;
        if (WHITELISTED_TYPES.contains(javaLangType)) {
            return javaLangType;
        }
        
        // Check explicit imports
        for (Import imp : imports) {
            if (!imp.importsEntirePackage() && imp.getImportObject().equals(simpleType)) {
                return imp.getImportPackage() + "." + imp.getImportObject();
            }
        }
        
        // Check wildcard imports (less precise, but best effort)
        for (Import imp : imports) {
            if (imp.importsEntirePackage()) {
                String possibleType = imp.getImportPackage() + "." + simpleType;
                // We can't verify if this type actually exists, but return the constructed name
                return possibleType;
            }
        }
        
        // If not resolvable, return as-is (could be in same package)
        return simpleType;
    }
    
    /**
     * Parse a generic type string and extract type information
     * 
     * @param type The type string to parse
     * @return TypeInfo object with parsed information
     */
    public static TypeInfo parseGenericType(String type) {
        if (type == null) {
            return null;
        }
        
        TypeInfo typeInfo = new TypeInfo();
        
        // Handle arrays
        Matcher arrayMatcher = ARRAY_TYPE_PATTERN.matcher(type);
        if (arrayMatcher.matches()) {
            typeInfo.setArray(true);
            String baseType = arrayMatcher.group(1);
            String brackets = arrayMatcher.group(2);
            typeInfo.setArrayDimensions(brackets.length() / 2); // Each [] is 2 characters
            
            // Recursively parse the base type
            TypeInfo baseTypeInfo = parseGenericType(baseType);
            if (baseTypeInfo != null) {
                typeInfo.setBaseType(baseTypeInfo.getBaseType());
                typeInfo.setFullyQualifiedBaseType(baseTypeInfo.getFullyQualifiedBaseType());
                typeInfo.setGenericParameters(baseTypeInfo.getGenericParameters());
            }
        } else {
            typeInfo.setArray(false);
            typeInfo.setArrayDimensions(0);
            
            // Handle generic types
            Matcher genericMatcher = GENERIC_TYPE_PATTERN.matcher(type);
            if (genericMatcher.matches()) {
                String containerType = genericMatcher.group(1);
                String genericParams = genericMatcher.group(2);
                
                typeInfo.setBaseType(containerType);
                typeInfo.setFullyQualifiedBaseType(containerType); // Will be resolved later
                
                // Parse generic parameters
                String[] params = splitGenericParameters(genericParams);
                for (String param : params) {
                    TypeInfo paramInfo = parseGenericType(param.trim());
                    if (paramInfo != null) {
                        typeInfo.getGenericParameters().add(paramInfo);
                    }
                }
            } else {
                // Simple type
                typeInfo.setBaseType(type);
                typeInfo.setFullyQualifiedBaseType(type); // Will be resolved later
            }
        }
        
        return typeInfo;
    }
    
    /**
     * Extract the simple type name from a fully qualified type
     * 
     * @param fullyQualifiedType The fully qualified type name
     * @return The simple type name
     */
    public static String extractSimpleTypeName(String fullyQualifiedType) {
        if (fullyQualifiedType == null) return null;
        
        // Handle generic types
        Matcher genericMatcher = GENERIC_TYPE_PATTERN.matcher(fullyQualifiedType);
        if (genericMatcher.matches()) {
            String containerType = genericMatcher.group(1);
            return extractSimpleTypeName(containerType);
        }
        
        // Handle array types
        if (fullyQualifiedType.contains("[]")) {
            String baseType = fullyQualifiedType.replaceAll("\\[\\]", "");
            return extractSimpleTypeName(baseType) + fullyQualifiedType.substring(baseType.length());
        }
        
        // Extract simple name from fully qualified name
        int lastDotIndex = fullyQualifiedType.lastIndexOf('.');
        if (lastDotIndex >= 0 && lastDotIndex < fullyQualifiedType.length() - 1) {
            return fullyQualifiedType.substring(lastDotIndex + 1);
        }
        
        return fullyQualifiedType;
    }
    
    /**
     * Extract the base type from a type string (removing generics and arrays)
     * 
     * @param type The type string
     * @return The base type
     */
    private static String extractBaseType(String type) {
        if (type == null) return null;
        
        // Remove array brackets
        String withoutArrays = type.replaceAll("\\[\\]", "");
        
        // Remove generic parameters
        Matcher genericMatcher = GENERIC_TYPE_PATTERN.matcher(withoutArrays);
        if (genericMatcher.matches()) {
            return genericMatcher.group(1);
        }
        
        return withoutArrays;
    }
    
    /**
     * Resolve generic parameters in a generic type string
     * 
     * @param genericParams The generic parameters string
     * @param imports The imports for resolution
     * @return The resolved generic parameters string
     */
    private static String resolveGenericParameters(String genericParams, Set<Import> imports) {
        String[] params = splitGenericParameters(genericParams);
        StringBuilder resolved = new StringBuilder();
        
        for (int i = 0; i < params.length; i++) {
            if (i > 0) resolved.append(", ");
            resolved.append(resolveType(params[i].trim(), imports));
        }
        
        return resolved.toString();
    }
    
    /**
     * Split generic parameters string, handling nested generics
     * Example: "String, List<Integer>, Map<String, User>" -> ["String", "List<Integer>", "Map<String, User>"]
     * 
     * @param genericParams The generic parameters string
     * @return Array of individual parameter strings
     */
    private static String[] splitGenericParameters(String genericParams) {
        if (genericParams == null || genericParams.trim().isEmpty()) {
            return new String[0];
        }
        
        // Simple case: no nested generics
        if (!genericParams.contains("<")) {
            return genericParams.split(",");
        }
        
        // Complex case: handle nested generics
        StringBuilder current = new StringBuilder();
        int bracketDepth = 0;
        char[] chars = genericParams.toCharArray();
        
        for (char c : chars) {
            if (c == '<') {
                bracketDepth++;
                current.append(c);
            } else if (c == '>') {
                bracketDepth--;
                current.append(c);
            } else if (c == ',' && bracketDepth == 0) {
                // This comma is at the top level, so it's a parameter separator
                return Arrays.copyOf(
                    (current.toString() + "," + genericParams.substring(current.length() + 1))
                        .split(","), 
                    2);
            } else {
                current.append(c);
            }
        }
        
        // Fallback to simple split if parsing fails
        return genericParams.split(",");
    }
}