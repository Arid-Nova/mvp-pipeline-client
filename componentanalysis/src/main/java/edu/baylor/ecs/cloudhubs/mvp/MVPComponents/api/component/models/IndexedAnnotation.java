package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Map;

/**
 * Represents an annotation component that has been indexed with all Annotation IR properties.
 * Extends IndexedComponent to include complete annotation metadata.
 */
@Getter
@Setter
@NoArgsConstructor
public class IndexedAnnotation extends IndexedComponent {
    
    /**
     * Annotation attributes from IR (key-value pairs)
     */
    private Map<String, String> attributes;
    
    /**
     * Constructor for IndexedAnnotation
     * 
     * @param type Component type
     * @param name Component name
     * @param id Service-scoped ID
     * @param fullID Full canonical signature
     * @param microservice Microservice name
     * @param className Class name
     * @param metadata Component metadata
     * @param attributes Annotation attributes
     */
    public IndexedAnnotation(String type, String name, String id, String fullID, String microservice, 
                            String className, Object metadata, Map<String, String> attributes) {
        super(type, name, id, fullID, microservice, className, metadata);
        this.attributes = attributes;
    }
}