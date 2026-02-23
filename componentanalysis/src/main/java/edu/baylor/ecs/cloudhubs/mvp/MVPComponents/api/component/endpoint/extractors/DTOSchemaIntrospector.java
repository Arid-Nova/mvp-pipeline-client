package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors;

import edu.university.ecs.lab.common.models.ir.*;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Introspects DTO classes to generate JSON examples with actual field names.
 *
 * <p>This class builds a type registry from the MicroserviceSystem IR and uses it
 * to generate realistic JSON examples for request body parameters.
 *
 * <p>Features:
 * <ul>
 *   <li>Resolves class types from the IR</li>
 *   <li>Extracts field names and types from DTOs</li>
 *   <li>Generates sample values based on field type and name</li>
 *   <li>Handles nested objects and collections</li>
 * </ul>
 *
 * @author Claude Code
 * @version 1.0
 */
public class DTOSchemaIntrospector {
    /** Maximum depth for nested object introspection to prevent infinite loops */
    private static final int MAX_DEPTH = 3;

    /** Type registry: maps simple class names and fully qualified names to JClass objects */
    private final Map<String, JClass> typeRegistry;

    /** Set of primitive and wrapper types that don't need introspection */
    private static final Set<String> SIMPLE_TYPES = Set.of(
        "String", "Integer", "Long", "Double", "Float", "Boolean", "Byte", "Short", "Character",
        "int", "long", "double", "float", "boolean", "byte", "short", "char",
        "BigDecimal", "BigInteger", "Date", "LocalDate", "LocalDateTime", "Instant",
        "ZonedDateTime", "OffsetDateTime", "UUID", "Object"
    );

    /**
     * Creates a DTOSchemaIntrospector without a type registry.
     * Use this when you don't need DTO introspection.
     */
    public DTOSchemaIntrospector() {
        this.typeRegistry = new HashMap<>();
    }

    /**
     * Creates a DTOSchemaIntrospector with a type registry built from the MicroserviceSystem.
     *
     * @param system The MicroserviceSystem containing class definitions
     */
    public DTOSchemaIntrospector(MicroserviceSystem system) {
        this.typeRegistry = buildTypeRegistry(system);
    }

    /**
     * Builds a type registry from the MicroserviceSystem.
     */
    private Map<String, JClass> buildTypeRegistry(MicroserviceSystem system) {
        Map<String, JClass> registry = new HashMap<>();

        if (system == null || system.getMicroservices() == null) {
            return registry;
        }

        for (Microservice ms : system.getMicroservices()) {
            if (ms.getClasses() == null) continue;

            for (AbstractClass clazz : ms.getClasses()) {
                if (clazz instanceof JClass) {
                    JClass jClass = (JClass) clazz;
                    // Register by simple name
                    registry.put(jClass.getName(), jClass);
                    // Register by fully qualified name if available
                    if (jClass.getPackageName() != null) {
                        registry.put(jClass.getPackageName() + "." + jClass.getName(), jClass);
                    }
                }
            }
        }

        return registry;
    }

    /**
     * Generates a JSON example for the given type.
     *
     * @param typeName The type name (simple or fully qualified)
     * @return JSON string example, or null if type cannot be introspected
     */
    public String generateJsonExample(String typeName) {
        if (typeName == null || typeName.isEmpty()) {
            return null;
        }

        // Handle generic types like List<User>
        String baseType = extractBaseType(typeName);

        // Check if it's a simple type
        if (SIMPLE_TYPES.contains(baseType)) {
            return generateSimpleValue(baseType, null);
        }

        // Try to find the class in the registry
        JClass jClass = typeRegistry.get(baseType);
        if (jClass == null) {
            return null;
        }

        // Generate JSON from class fields
        return generateJsonFromClass(jClass, 0, new HashSet<>());
    }

    /**
     * Generates JSON from a JClass's fields.
     */
    private String generateJsonFromClass(JClass jClass, int depth, Set<String> visitedTypes) {
        if (depth > MAX_DEPTH) {
            return "{}";
        }

        if (visitedTypes.contains(jClass.getName())) {
            return "{}"; // Prevent circular references
        }
        visitedTypes.add(jClass.getName());

        Set<Field> fields = jClass.getFields();
        if (fields == null || fields.isEmpty()) {
            return "{}";
        }

        StringBuilder json = new StringBuilder("{");
        boolean first = true;

        for (Field field : fields) {
            // Skip static and transient fields
            if (Boolean.TRUE.equals(field.getIsStatic())) continue;

            if (!first) {
                json.append(", ");
            }
            first = false;

            String fieldName = field.getName();
            String fieldType = field.getFieldType();

            json.append("\"").append(fieldName).append("\": ");
            json.append(generateFieldValue(fieldName, fieldType, depth + 1, visitedTypes));
        }

        json.append("}");
        visitedTypes.remove(jClass.getName());

        return json.toString();
    }

    /**
     * Generates a sample value for a field.
     */
    private String generateFieldValue(String fieldName, String fieldType, int depth, Set<String> visitedTypes) {
        if (fieldType == null) {
            return "null";
        }

        // Handle collections
        if (fieldType.startsWith("List<") || fieldType.startsWith("Set<") || fieldType.startsWith("Collection<")) {
            String innerType = extractGenericType(fieldType);
            String innerValue = generateFieldValue(fieldName, innerType, depth, visitedTypes);
            return "[" + innerValue + "]";
        }

        // Handle maps
        if (fieldType.startsWith("Map<")) {
            return "{\"key\": \"value\"}";
        }

        // Handle arrays
        if (fieldType.endsWith("[]")) {
            String elementType = fieldType.substring(0, fieldType.length() - 2);
            String elementValue = generateFieldValue(fieldName, elementType, depth, visitedTypes);
            return "[" + elementValue + "]";
        }

        // Extract base type
        String baseType = extractBaseType(fieldType);

        // Check if it's a simple type
        if (SIMPLE_TYPES.contains(baseType)) {
            return generateSimpleValue(baseType, fieldName);
        }

        // Try to introspect nested type
        if (depth <= MAX_DEPTH) {
            JClass nestedClass = typeRegistry.get(baseType);
            if (nestedClass != null) {
                return generateJsonFromClass(nestedClass, depth, visitedTypes);
            }
        }

        // Fallback for unknown types
        return "{}";
    }

    /**
     * Generates a simple value based on type and field name.
     */
    private String generateSimpleValue(String type, String fieldName) {
        // Use field name heuristics first
        if (fieldName != null) {
            String lowerName = fieldName.toLowerCase();

            if (lowerName.contains("id")) return "\"12345\"";
            if (lowerName.contains("uuid")) return "\"550e8400-e29b-41d4-a716-446655440000\"";
            if (lowerName.contains("name")) return "\"Sample Name\"";
            if (lowerName.contains("email")) return "\"user@example.com\"";
            if (lowerName.contains("phone")) return "\"555-123-4567\"";
            if (lowerName.contains("password")) return "\"********\"";
            if (lowerName.contains("date") || lowerName.contains("created") || lowerName.contains("updated")) {
                return "\"2024-01-15T10:30:00Z\"";
            }
            if (lowerName.contains("time")) return "\"10:30:00\"";
            if (lowerName.contains("status")) return "\"ACTIVE\"";
            if (lowerName.contains("type")) return "\"DEFAULT\"";
            if (lowerName.contains("code")) return "\"ABC123\"";
            if (lowerName.contains("description") || lowerName.contains("message") || lowerName.contains("comment")) {
                return "\"Sample description text\"";
            }
            if (lowerName.contains("url") || lowerName.contains("link")) return "\"https://example.com\"";
            if (lowerName.contains("path")) return "\"/path/to/resource\"";
            if (lowerName.contains("count") || lowerName.contains("total") || lowerName.contains("quantity")) return "10";
            if (lowerName.contains("price") || lowerName.contains("amount") || lowerName.contains("cost")) return "99.99";
            if (lowerName.contains("enabled") || lowerName.contains("active") || lowerName.contains("verified")) return "true";
            if (lowerName.contains("address")) return "\"123 Main Street\"";
            if (lowerName.contains("city")) return "\"Springfield\"";
            if (lowerName.contains("country")) return "\"USA\"";
            if (lowerName.contains("zip") || lowerName.contains("postal")) return "\"12345\"";
        }

        // Use type-based generation
        if (type == null) {
            return "null";
        }

        switch (type.toLowerCase()) {
            case "string":
                return "\"example-value\"";
            case "integer":
            case "int":
                return "123";
            case "long":
                return "12345";
            case "double":
            case "float":
            case "bigdecimal":
                return "123.45";
            case "boolean":
                return "true";
            case "byte":
            case "short":
                return "1";
            case "character":
            case "char":
                return "\"A\"";
            case "date":
            case "localdate":
                return "\"2024-01-15\"";
            case "localdatetime":
            case "datetime":
            case "instant":
            case "zoneddatetime":
            case "offsetdatetime":
                return "\"2024-01-15T10:30:00Z\"";
            case "uuid":
                return "\"550e8400-e29b-41d4-a716-446655440000\"";
            case "object":
                return "{}";
            default:
                return "\"value\"";
        }
    }

    /**
     * Extracts the base type from a potentially generic type.
     * E.g., "List<User>" -> "List", "ResponseEntity<User>" -> "ResponseEntity"
     */
    private String extractBaseType(String type) {
        if (type == null) return null;
        int genericStart = type.indexOf('<');
        if (genericStart > 0) {
            return type.substring(0, genericStart);
        }
        // Remove package prefix if present
        int lastDot = type.lastIndexOf('.');
        if (lastDot > 0) {
            return type.substring(lastDot + 1);
        }
        return type;
    }

    /**
     * Extracts the inner type from a generic type.
     * E.g., "List<User>" -> "User", "Map<String,Integer>" -> "String,Integer"
     */
    private String extractGenericType(String type) {
        if (type == null) return null;
        int start = type.indexOf('<');
        int end = type.lastIndexOf('>');
        if (start > 0 && end > start) {
            return type.substring(start + 1, end);
        }
        return type;
    }

    /**
     * Returns the number of types in the registry.
     */
    public int getTypeCount() {
        return typeRegistry.size();
    }

    /**
     * Checks if a type is in the registry.
     */
    public boolean hasType(String typeName) {
        return typeRegistry.containsKey(typeName);
    }
}
