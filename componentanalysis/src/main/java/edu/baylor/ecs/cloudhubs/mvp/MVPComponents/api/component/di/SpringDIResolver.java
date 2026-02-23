package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.di;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedComponent;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedField;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.SpringDIContext;
import edu.university.ecs.lab.common.models.ir.Field;
import lombok.Getter;

import java.util.Map;

public class SpringDIResolver {
    /**
     * Resolution strategies for dependency injection
     */
    public enum ResolutionStrategy {
        /** Single implementation found - straightforward resolution */
        EXACT,

        /** Multiple implementations found, resolved using @Primary annotation */
        PRIMARY,

        /** Multiple implementations found with no @Primary - ambiguous */
        AMBIGUOUS,

        /** No implementations found - unresolved */
        UNRESOLVED,

        /** Resolved using @Qualifier annotation */
        QUALIFIER
    }

    /**
     * Result of a DI resolution attempt.
     */
    @Getter
    public static class ResolutionResult {
        private final boolean resolved;
        private final String implementationType;
        private final String implementationId;
        private final ResolutionStrategy strategy;
        private final String message;

        private ResolutionResult(boolean resolved, String implementationType,
                                String implementationId, ResolutionStrategy strategy, String message) {
            this.resolved = resolved;
            this.implementationType = implementationType;
            this.implementationId = implementationId;
            this.strategy = strategy;
            this.message = message;
        }

        public static ResolutionResult success(String implementationType, String implementationId,
                                              ResolutionStrategy strategy) {
            return new ResolutionResult(true, implementationType, implementationId, strategy, null);
        }

        public static ResolutionResult failure(ResolutionStrategy strategy, String message) {
            return new ResolutionResult(false, null, null, strategy, message);
        }

    }

    /**
     * Resolves an @Autowired field to its concrete implementation.
     *
     * @param field The IR field model
     * @param diContext The Spring DI context for resolution
     * @param components Map of indexed components for lookup
     * @return ResolutionResult containing resolution information
     */
    public ResolutionResult resolveField(Field field, SpringDIContext diContext,
                                        Map<String, IndexedComponent> components) {
        // Check if field has @Autowired annotation
        boolean isAutowired = field.getAnnotations().stream()
            .anyMatch(ann -> ann.getName().equals("Autowired"));

        if (!isAutowired) {
            return ResolutionResult.failure(ResolutionStrategy.UNRESOLVED,
                                          "Field is not annotated with @Autowired");
        }

        String fieldType = field.getFieldType();

        // Check for @Qualifier annotation
        String qualifierName = extractQualifier(field);
        if (qualifierName != null) {
            return resolveWithQualifier(fieldType, qualifierName, diContext, components);
        }

        // Standard autowired resolution
        return resolveAutowired(fieldType, diContext, components);
    }

    /**
     * Resolves an autowired field using standard Spring resolution rules.
     *
     * @param fieldType The declared type of the field
     * @param diContext The Spring DI context
     * @param components Map of indexed components
     * @return ResolutionResult
     */
    private ResolutionResult resolveAutowired(String fieldType, SpringDIContext diContext,
                                              Map<String, IndexedComponent> components) {
        SpringDIContext.BeanImplementation implementation = diContext.resolveAutowiredField(fieldType);

        if (implementation == null) {
            // Check if it's a concrete class autowiring
            if (diContext.isBean(fieldType)) {
                String classId = diContext.getBeanInfo(fieldType).classId;
                return ResolutionResult.success(fieldType, classId, ResolutionStrategy.EXACT);
            }

            // Check number of implementations to determine strategy
            var implementations = diContext.getImplementations(fieldType);
            if (implementations.isEmpty()) {
                return ResolutionResult.failure(ResolutionStrategy.UNRESOLVED,
                                              "No implementation found for type: " + fieldType);
            } else {
                return ResolutionResult.failure(ResolutionStrategy.AMBIGUOUS,
                                              "Multiple implementations without @Primary: " + fieldType);
            }
        }

        // Determine strategy based on number of implementations
        var implementations = diContext.getImplementations(fieldType);
        ResolutionStrategy strategy;

        if (implementations.size() == 1) {
            strategy = ResolutionStrategy.EXACT;
        } else if (implementation.isPrimary) {
            strategy = ResolutionStrategy.PRIMARY;
        } else {
            strategy = ResolutionStrategy.EXACT; // Concrete class
        }

        return ResolutionResult.success(
            implementation.fullyQualifiedName,
            implementation.classId,
            strategy
        );
    }

    /**
     * Resolves an autowired field using @Qualifier.
     *
     * @param fieldType The declared type of the field
     * @param qualifierName The qualifier value
     * @param diContext The Spring DI context
     * @param components Map of indexed components
     * @return ResolutionResult
     */
    private ResolutionResult resolveWithQualifier(String fieldType, String qualifierName,
                                                  SpringDIContext diContext,
                                                  Map<String, IndexedComponent> components) {
        SpringDIContext.BeanImplementation implementation = diContext.resolveWithQualifier(fieldType, qualifierName);

        if (implementation == null) {
            return ResolutionResult.failure(ResolutionStrategy.UNRESOLVED,
                                          "No bean found with qualifier: " + qualifierName);
        }

        return ResolutionResult.success(
            implementation.fullyQualifiedName,
            implementation.classId,
            ResolutionStrategy.QUALIFIER
        );
    }

    /**
     * Applies resolution result to an IndexedField.
     *
     * @param indexedField The indexed field to enrich
     * @param result The resolution result
     */
    public void applyResolution(IndexedField indexedField, ResolutionResult result) {
        if (result.isResolved()) {
            indexedField.setResolvedImplementationType(result.getImplementationType());
            indexedField.setResolvedImplementationId(result.getImplementationId());
            indexedField.setDiResolutionStrategy(result.getStrategy().name());
        } else {
            indexedField.setDiResolutionStrategy(result.getStrategy().name());
        }
    }

    /**
     * Extracts @Qualifier value from field annotations.
     *
     * @param field The field to check
     * @return The qualifier value, or null if not present
     */
    private String extractQualifier(Field field) {
        return field.getAnnotations().stream()
            .filter(ann -> ann.getName().equals("Qualifier"))
            .findFirst()
            .map(ann -> {
                Map<String, String> attributes = ann.getAttributes();
                if (attributes != null && attributes.containsKey("value")) {
                    return attributes.get("value").replace("\"", "");
                }
                return null;
            })
            .orElse(null);
    }

    /**
     * Resolves the object type for a method call based on field name.
     *
     * <p>This is used during CFG generation to resolve method calls on autowired fields.
     *
     * @param objectName The name of the object/field
     * @param components Map of indexed components
     * @return The resolved type (implementation class name), or null if not found
     */
    public String resolveObjectType(String objectName, Map<String, IndexedComponent> components) {
        // Search for field with matching name
        for (IndexedComponent component : components.values()) {
            if (component instanceof IndexedField) {
                IndexedField field = (IndexedField) component;
                if (field.getName().equals(objectName)) {
                    // If field has resolved implementation, use it
                    if (field.getResolvedImplementationType() != null) {
                        return field.getResolvedImplementationType();
                    }
                    // Otherwise use declared type
                    return field.getFieldType();
                }
            }
        }

        return null;
    }

    /**
     * Gets diagnostic information about DI resolution for debugging.
     *
     * @param diContext The DI context to analyze
     * @return Diagnostic information string
     */
    public String getDiagnostics(SpringDIContext diContext) {
        StringBuilder sb = new StringBuilder();
        sb.append("Spring DI Context Diagnostics:\n");
        sb.append("Bean count: ").append(diContext.getBeanCount()).append("\n");
        // Additional diagnostic information can be added here
        return sb.toString();
    }
}
