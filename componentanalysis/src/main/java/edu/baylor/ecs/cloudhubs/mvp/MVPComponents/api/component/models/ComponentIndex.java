package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Represents the complete index of components in a microservice system.
 * Provides O(1) lookup of components by their service-scoped IDs.
 */
@Setter
@NoArgsConstructor
public class ComponentIndex {
    
    /**
     * Constructor with components and metadata
     */
    public ComponentIndex(Map<String, IndexedComponent> components, IndexMetadata metadata) {
        this.components = components != null ? components : new HashMap<>();
        this.endpoints = new HashMap<>();
        this.metadata = metadata;
    }
    
    /**
     * Constructor with all fields
     */
    public ComponentIndex(Map<String, IndexedComponent> components, Map<String, EndpointInfo> endpoints, IndexMetadata metadata) {
        this.components = components != null ? components : new HashMap<>();
        this.endpoints = endpoints != null ? endpoints : new HashMap<>();
        this.roles = new HashSet<>();
        this.metadata = metadata;
    }

    /**
     * Constructor with all fields including roles
     */
    public ComponentIndex(Map<String, IndexedComponent> components, Map<String, EndpointInfo> endpoints, Set<String> roles, IndexMetadata metadata) {
        this.components = components != null ? components : new HashMap<>();
        this.endpoints = endpoints != null ? endpoints : new HashMap<>();
        this.roles = roles != null ? roles : new HashSet<>();
        this.metadata = metadata;
    }
    /**
     * Map of service-scoped IDs to indexed components
     */
    private Map<String, IndexedComponent> components;
    
    /**
     * Map of service-scoped IDs to endpoint information (separate from components)
     */
    private Map<String, EndpointInfo> endpoints;

    /**
     * Set of all unique roles across all microservices
     * Extracted from SecurityConfig files and endpoint authentication annotations
     */
    private Set<String> roles;

    /**
     * Metadata about the index
     */
    private IndexMetadata metadata;
    
    // ============== JSON SERIALIZATION GETTERS ==============

    public Map<String, IndexedComponent> getComponents() { return components; }
    public Map<String, EndpointInfo> getEndpoints() { return endpoints; }
    public Set<String> getRoles() { return roles; }
    public IndexMetadata getMetadata() { return metadata; }
    
    // ============== UTILITY METHODS ==============
    
    /**
     * Find a component by its ID with O(1) lookup
     * 
     * @param id The service-scoped ID of the component
     * @return The indexed component, or null if not found
     */
    public IndexedComponent findComponentById(String id) {
        return components.get(id);
    }
    
    /**
     * Check if a component is a field
     * 
     * @param id The service-scoped ID of the component
     * @return true if the component is an IndexedField
     */
    public boolean isField(String id) {
        IndexedComponent component = components.get(id);
        return component instanceof IndexedField;
    }
    
    /**
     * Check if a component is a method
     * 
     * @param id The service-scoped ID of the component
     * @return true if the component is an IndexedMethod
     */
    public boolean isMethod(String id) {
        IndexedComponent component = components.get(id);
        return component instanceof IndexedMethod;
    }
    
    /**
     * Check if a component is an annotation
     * 
     * @param id The service-scoped ID of the component
     * @return true if the component is an IndexedAnnotation
     */
    public boolean isAnnotation(String id) {
        IndexedComponent component = components.get(id);
        return component instanceof IndexedAnnotation;
    }
    
    /**
     * Get field details by casting to IndexedField
     * 
     * @param id The service-scoped ID of the component
     * @return The component cast to IndexedField, or null if not a field
     */
    public IndexedField getFieldDetails(String id) {
        IndexedComponent component = components.get(id);
        return component instanceof IndexedField ? (IndexedField) component : null;
    }
    
    /**
     * Get method details by casting to IndexedMethod
     * 
     * @param id The service-scoped ID of the component
     * @return The component cast to IndexedMethod, or null if not a method
     */
    public IndexedMethod getMethodDetails(String id) {
        IndexedComponent component = components.get(id);
        return component instanceof IndexedMethod ? (IndexedMethod) component : null;
    }
    
    /**
     * Get annotation details by casting to IndexedAnnotation
     * 
     * @param id The service-scoped ID of the component
     * @return The component cast to IndexedAnnotation, or null if not an annotation
     */
    public IndexedAnnotation getAnnotationDetails(String id) {
        IndexedComponent component = components.get(id);
        return component instanceof IndexedAnnotation ? (IndexedAnnotation) component : null;
    }
    
    /**
     * Check if a component is a class
     * 
     * @param id The service-scoped ID of the component
     * @return true if the component is an IndexedClass
     */
    public boolean isClass(String id) {
        IndexedComponent component = components.get(id);
        return component instanceof IndexedClass;
    }
    
    /**
     * Get class details by casting to IndexedClass
     * 
     * @param id The service-scoped ID of the component
     * @return The component cast to IndexedClass, or null if not a class
     */
    public IndexedClass getClassDetails(String id) {
        IndexedComponent component = components.get(id);
        return component instanceof IndexedClass ? (IndexedClass) component : null;
    }
    
    /**
     * Find all components that reference a specific type
     * 
     * @param typeId The ID of the type to find references to
     * @return List of components that reference this type
     */
    public List<IndexedComponent> findComponentsByType(String typeId) {
        List<IndexedComponent> result = new ArrayList<>();
        
        for (IndexedComponent component : components.values()) {
            if (component instanceof IndexedField) {
                IndexedField field = (IndexedField) component;
                if (typeId.equals(field.getTypeId()) || typeId.equals(field.getGenericTypeId())) {
                    result.add(component);
                }
            } else if (component instanceof IndexedMethod) {
                IndexedMethod method = (IndexedMethod) component;
                if (typeId.equals(method.getReturnTypeId()) || typeId.equals(method.getGenericReturnTypeId())) {
                    result.add(component);
                }
                
                // Check parameters
                if (method.getParameters() != null) {
                    for (IndexedParameter param : method.getParameters()) {
                        if (typeId.equals(param.getTypeId()) || typeId.equals(param.getGenericTypeId())) {
                            result.add(component);
                            break; // Avoid adding the same method multiple times
                        }
                    }
                }
            }
        }
        
        return result;
    }
    
    /**
     * Find all fields that have a specific type
     * 
     * @param typeId The ID of the type to find
     * @return List of IndexedField components with this type
     */
    public List<IndexedField> findFieldsOfType(String typeId) {
        return components.values().stream()
            .filter(component -> component instanceof IndexedField)
            .map(component -> (IndexedField) component)
            .filter(field -> typeId.equals(field.getTypeId()) || typeId.equals(field.getGenericTypeId()))
            .collect(Collectors.toList());
    }
    
    /**
     * Find all methods that return a specific type
     * 
     * @param typeId The ID of the type to find
     * @return List of IndexedMethod components that return this type
     */
    public List<IndexedMethod> findMethodsReturningType(String typeId) {
        return components.values().stream()
            .filter(component -> component instanceof IndexedMethod)
            .map(component -> (IndexedMethod) component)
            .filter(method -> typeId.equals(method.getReturnTypeId()) || typeId.equals(method.getGenericReturnTypeId()))
            .collect(Collectors.toList());
    }
    
    /**
     * Find all methods that have a parameter of a specific type
     * 
     * @param typeId The ID of the type to find
     * @return List of IndexedMethod components with parameters of this type
     */
    public List<IndexedMethod> findMethodsWithParameterType(String typeId) {
        List<IndexedMethod> result = new ArrayList<>();
        
        for (IndexedComponent component : components.values()) {
            if (component instanceof IndexedMethod) {
                IndexedMethod method = (IndexedMethod) component;
                if (method.getParameters() != null) {
                    boolean hasMatchingParameter = method.getParameters().stream()
                        .anyMatch(param -> typeId.equals(param.getTypeId()) || typeId.equals(param.getGenericTypeId()));
                    
                    if (hasMatchingParameter) {
                        result.add(method);
                    }
                }
            }
        }
        
        return result;
    }
    
    /**
     * Find a class by its fully qualified name
     * 
     * @param fullyQualifiedName The fully qualified class name
     * @return The IndexedClass if found, null otherwise
     */
    public IndexedClass findClassByFullyQualifiedName(String fullyQualifiedName) {
        return components.values().stream()
            .filter(component -> component instanceof IndexedClass)
            .map(component -> (IndexedClass) component)
            .filter(clazz -> fullyQualifiedName.equals(clazz.getFullyQualifiedName()))
            .findFirst()
            .orElse(null);
    }
    
    /**
     * Check if a type is indexed in this system
     * 
     * @param fullyQualifiedType The fully qualified type name
     * @return true if the type is indexed
     */
    public boolean isTypeIndexed(String fullyQualifiedType) {
        return findClassByFullyQualifiedName(fullyQualifiedType) != null;
    }
    
    /**
     * Get all indexed classes in the system
     * 
     * @return List of all IndexedClass components
     */
    @JsonIgnore
    public List<IndexedClass> getAllClasses() {
        return components.values().stream()
            .filter(component -> component instanceof IndexedClass)
            .map(component -> (IndexedClass) component)
            .collect(Collectors.toList());
    }
    
    /**
     * Get all components in a specific microservice
     * 
     * @param microserviceName The name of the microservice
     * @return List of components in the microservice
     */
    public List<IndexedComponent> getComponentsByMicroservice(String microserviceName) {
        return components.values().stream()
            .filter(component -> microserviceName.equals(component.getMicroservice()))
            .collect(Collectors.toList());
    }
    
    /**
     * Get all components in a specific class
     * 
     * @param className The name of the class
     * @return List of components in the class
     */
    public List<IndexedComponent> getComponentsByClass(String className) {
        return components.values().stream()
            .filter(component -> className.equals(component.getClassName()))
            .collect(Collectors.toList());
    }
    
    /**
     * Find components by type (e.g., "Method", "Field", "Class", "Annotation")
     * 
     * @param componentType The type of component to find
     * @return List of components of the specified type
     */
    public List<IndexedComponent> getComponentsByType(String componentType) {
        return components.values().stream()
            .filter(component -> componentType.equals(component.getType()))
            .collect(Collectors.toList());
    }
    
    // ============== ENDPOINT-SPECIFIC METHODS ==============
    
    /**
     * Add an endpoint to the index
     * 
     * @param endpoint The endpoint to add
     */
    public void addEndpoint(EndpointInfo endpoint) {
        if (endpoints == null) {
            endpoints = new HashMap<>();
        }
        endpoints.put(endpoint.getId(), endpoint);
    }
    
    /**
     * Find an endpoint by its ID with O(1) lookup
     * 
     * @param id The service-scoped ID of the endpoint
     * @return The endpoint info, or null if not found
     */
    public EndpointInfo findEndpointById(String id) {
        return endpoints != null ? endpoints.get(id) : null;
    }
    
    /**
     * Find endpoints by HTTP method
     * 
     * @param httpMethod The HTTP method to filter by (GET, POST, PUT, DELETE, etc.)
     * @return List of endpoints with the specified HTTP method
     */
    public List<EndpointInfo> findEndpointsByHttpMethod(String httpMethod) {
        if (endpoints == null) {
            return new ArrayList<>();
        }
        return endpoints.values().stream()
            .filter(endpoint -> httpMethod.equalsIgnoreCase(endpoint.getHttpMethod()))
            .collect(Collectors.toList());
    }
    
    /**
     * Find endpoints by path pattern
     * 
     * @param pathPattern The path pattern to match (supports simple wildcards)
     * @return List of endpoints with matching paths
     */
    public List<EndpointInfo> findEndpointsByPath(String pathPattern) {
        if (endpoints == null) {
            return new ArrayList<>();
        }
        return endpoints.values().stream()
            .filter(endpoint -> endpoint.getFullUri() != null && 
                   matchesPathPattern(endpoint.getFullUri(), pathPattern))
            .collect(Collectors.toList());
    }
    
    /**
     * Check if a URI matches a pattern with proper wildcard handling
     */
    private boolean matchesPathPattern(String uri, String pattern) {
        // Convert the pattern to a proper regex
        // Handle wildcards at the end: /api/v1/users* should match /api/v1/users and /api/v1/users/anything
        String regexPattern = pattern.replace("*", ".*");
        
        // If pattern ends with .*, it should match the base path exactly OR anything that starts with it
        if (pattern.endsWith("*") && !pattern.endsWith(".*")) {
            String basePath = pattern.substring(0, pattern.length() - 1);
            return uri.equals(basePath) || uri.startsWith(basePath);
        }
        
        return uri.matches(regexPattern);
    }
    
    /**
     * Find endpoints by controller class
     * 
     * @param controllerClass The fully qualified controller class name
     * @return List of endpoints in the specified controller
     */
    public List<EndpointInfo> findEndpointsByController(String controllerClass) {
        if (endpoints == null) {
            return new ArrayList<>();
        }
        return endpoints.values().stream()
            .filter(endpoint -> controllerClass.equals(endpoint.getControllerClass()))
            .collect(Collectors.toList());
    }
    
    /**
     * Get all endpoints
     * 
     * @return List of all endpoints in the system
     */
    @JsonIgnore
    public List<EndpointInfo> getAllEndpoints() {
        if (endpoints == null) {
            return new ArrayList<>();
        }
        return new ArrayList<>(endpoints.values());
    }
    
    /**
     * Generate a REST API summary
     *
     * @return Map containing API overview statistics and information
     */
    @JsonIgnore
    public Map<String, Object> getRestApiSummary() {
        Map<String, Object> summary = new HashMap<>();
        
        if (endpoints == null || endpoints.isEmpty()) {
            summary.put("totalEndpoints", 0);
            summary.put("httpMethods", new HashMap<String, Integer>());
            summary.put("controllers", new ArrayList<String>());
            return summary;
        }
        
        // Count endpoints by HTTP method
        Map<String, Integer> httpMethodCounts = new HashMap<>();
        List<String> controllers = new ArrayList<>();
        
        for (EndpointInfo endpoint : endpoints.values()) {
            // Count HTTP methods
            String method = endpoint.getHttpMethod();
            httpMethodCounts.put(method, httpMethodCounts.getOrDefault(method, 0) + 1);
            
            // Collect unique controllers
            String controller = endpoint.getControllerClass();
            if (controller != null && !controllers.contains(controller)) {
                controllers.add(controller);
            }
        }
        
        summary.put("totalEndpoints", endpoints.size());
        summary.put("httpMethods", httpMethodCounts);
        summary.put("controllers", controllers);
        summary.put("controllerCount", controllers.size());
        
        return summary;
    }
}