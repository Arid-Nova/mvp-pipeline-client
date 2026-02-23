package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.component.indexers;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedAnnotation;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedComponent;
import edu.university.ecs.lab.common.models.ir.Annotation;

import java.util.Map;

public class AnnotationIndexer {
    /**
     * Indexes an annotation component.
     *
     * @param annotation The annotation to index
     * @param microserviceName Name of the containing microservice
     * @param className Name of the containing class
     * @param components Map to store indexed components
     * @param componentCounts Map to track component counts
     */
    public void indexAnnotation(Annotation annotation, String microserviceName, String className,
                                Map<String, IndexedComponent> components, Map<String, Integer> componentCounts) {
        IndexedAnnotation indexed = createIndexedAnnotation(annotation, microserviceName, className);

        if (indexed != null) {
            components.put(indexed.getId(), indexed);

            // Update component counts
            String type = indexed.getType();
            componentCounts.put(type, componentCounts.getOrDefault(type, 0) + 1);
        }
    }

    /**
     * Creates an IndexedAnnotation from an Annotation IR component.
     *
     * @param annotation The Annotation IR component
     * @param microserviceName Name of the containing microservice
     * @param className Name of the containing class
     * @return The enhanced IndexedAnnotation
     */
    private IndexedAnnotation createIndexedAnnotation(Annotation annotation, String microserviceName, String className) {
        return new IndexedAnnotation(
            "Annotation",
            annotation.getName(),
            annotation.getID(),
            annotation.getFullID(),
            microserviceName,
            className,
            annotation.getMetadata(),
            annotation.getAttributes()
        );
    }
}
