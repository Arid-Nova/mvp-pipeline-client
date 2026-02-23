package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.component.indexers;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedComponent;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedMethod;
import edu.university.ecs.lab.common.models.ir.Annotation;
import edu.university.ecs.lab.common.models.ir.Method;
import edu.university.ecs.lab.common.models.ir.Parameter;

import java.util.Map;

public class MethodIndexer {
    private final AnnotationIndexer annotationIndexer;

    /**
     * Constructor with annotation indexer dependency.
     *
     * @param annotationIndexer The annotation indexer for method and parameter annotations
     */
    public MethodIndexer(AnnotationIndexer annotationIndexer) {
        this.annotationIndexer = annotationIndexer;
    }

    /**
     * Indexes a method and its annotations.
     *
     * @param method The method to index
     * @param microserviceName Name of the containing microservice
     * @param className Name of the containing class
     * @param components Map to store indexed components
     * @param componentCounts Map to track component counts
     */
    public void indexMethod(Method method, String microserviceName, String className,
                            Map<String, IndexedComponent> components, Map<String, Integer> componentCounts) {
        // Create and store the indexed method
        IndexedMethod indexed = createIndexedMethod(method, microserviceName, className);

        if (indexed != null) {
            components.put(indexed.getId(), indexed);

            // Update component counts
            String type = indexed.getType();
            componentCounts.put(type, componentCounts.getOrDefault(type, 0) + 1);

            // Index method annotations
            for (Annotation annotation : method.getAnnotations()) {
                annotationIndexer.indexAnnotation(annotation, microserviceName, className, components, componentCounts);
            }

            // Index parameter annotations
            for (Parameter parameter : method.getParameters()) {
                for (Annotation annotation : parameter.getAnnotations()) {
                    annotationIndexer.indexAnnotation(annotation, microserviceName, className, components, componentCounts);
                }
            }
        }
    }

    /**
     * Creates an IndexedMethod from a Method IR component.
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
}
