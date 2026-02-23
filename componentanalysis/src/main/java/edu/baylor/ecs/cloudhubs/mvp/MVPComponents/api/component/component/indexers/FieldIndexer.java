package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.component.indexers;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedComponent;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedField;
import edu.university.ecs.lab.common.models.ir.Annotation;
import edu.university.ecs.lab.common.models.ir.Field;

import java.util.Map;

public class FieldIndexer {
    private final AnnotationIndexer annotationIndexer;

    /**
     * Constructor with annotation indexer dependency.
     *
     * @param annotationIndexer The annotation indexer for field annotations
     */
    public FieldIndexer(AnnotationIndexer annotationIndexer) {
        this.annotationIndexer = annotationIndexer;
    }

    /**
     * Indexes a field and its annotations.
     *
     * @param field The field to index
     * @param microserviceName Name of the containing microservice
     * @param className Name of the containing class
     * @param components Map to store indexed components
     * @param componentCounts Map to track component counts
     */
    public void indexField(Field field, String microserviceName, String className,
                           Map<String, IndexedComponent> components, Map<String, Integer> componentCounts) {
        // Create and store the indexed field
        IndexedField indexed = createIndexedField(field, microserviceName, className);

        if (indexed != null) {
            components.put(indexed.getId(), indexed);

            // Update component counts
            String type = indexed.getType();
            componentCounts.put(type, componentCounts.getOrDefault(type, 0) + 1);

            // Index field annotations
            for (Annotation annotation : field.getAnnotations()) {
                annotationIndexer.indexAnnotation(annotation, microserviceName, className, components, componentCounts);
            }
        }
    }

    /**
     * Creates an IndexedField from a Field IR component.
     *
     * @param field The Field IR component
     * @param microserviceName Name of the containing microservice
     * @param className Name of the containing class
     * @return The enhanced IndexedField
     */
    private IndexedField createIndexedField(Field field, String microserviceName, String className) {
        IndexedField indexed = new IndexedField(
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

        // Check if field is autowired
        boolean isAutowired = field.getAnnotations().stream()
            .anyMatch(ann -> ann.getName().equals("Autowired") ||
                           ann.getName().equals("Inject") ||
                           ann.getName().equals("Resource"));
        indexed.setAutowired(isAutowired);

        return indexed;
    }
}
