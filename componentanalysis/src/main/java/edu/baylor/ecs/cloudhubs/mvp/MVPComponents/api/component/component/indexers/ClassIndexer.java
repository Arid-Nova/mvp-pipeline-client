package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.component.indexers;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedComponent;
import edu.university.ecs.lab.common.models.ir.AbstractClass;
import edu.university.ecs.lab.common.models.ir.Annotation;

import java.util.Map;

public class ClassIndexer {
    private final AnnotationIndexer annotationIndexer;
    private final FieldIndexer fieldIndexer;
    private final MethodIndexer methodIndexer;

    /**
     * Constructor initializing all sub-indexers.
     */
    public ClassIndexer() {
        this.annotationIndexer = new AnnotationIndexer();
        this.fieldIndexer = new FieldIndexer(annotationIndexer);
        this.methodIndexer = new MethodIndexer(annotationIndexer);
    }

    /**
     * Indexes a class and all its components (annotations, fields, methods).
     *
     * @param abstractClass The class to index
     * @param microserviceName Name of the containing microservice
     * @param components Map to store indexed components
     * @param componentCounts Map to track component counts
     */
    public void indexClass(AbstractClass abstractClass, String microserviceName,
                           Map<String, IndexedComponent> components, Map<String, Integer> componentCounts) {
        String className = abstractClass.getName();

        // Index class-level annotations
        for (Annotation annotation : abstractClass.getAnnotations()) {
            annotationIndexer.indexAnnotation(annotation, microserviceName, className, components, componentCounts);
        }

        // Index fields
        for (edu.university.ecs.lab.common.models.ir.Field field : abstractClass.getFields()) {
            fieldIndexer.indexField(field, microserviceName, className, components, componentCounts);
        }

        // Index methods and their annotations/parameters
        for (edu.university.ecs.lab.common.models.ir.Method method : abstractClass.getMethods()) {
            methodIndexer.indexMethod(method, microserviceName, className, components, componentCounts);
        }
    }
}
