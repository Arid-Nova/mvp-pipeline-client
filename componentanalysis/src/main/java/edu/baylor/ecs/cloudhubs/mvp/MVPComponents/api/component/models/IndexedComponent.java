package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Represents a component that has been indexed for O(1) lookup.
 * Contains minimal information needed for component identification.
 */
@Getter
@Setter
@NoArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class IndexedComponent {
    /**
     * Type of the component (Method, Field, Annotation)
     */
    private String type;
    
    /**
     * Name of the component
     */
    private String name;
    
    /**
     * Service-scoped ID (serviceName:hash)
     */
    private String id;
    
    /**
     * Full canonical signature without service prefix
     */
    private String fullID;
    
    /**
     * Name of the microservice containing this component
     */
    private String microservice;
    
    /**
     * Name of the class containing this component
     */
    private String className;
    
    /**
     * Component metadata from IR
     */
    private Object metadata;
    
    /**
     * Constructor for IndexedComponent
     * 
     * @param type Component type
     * @param name Component name
     * @param id Service-scoped ID
     * @param fullID Full canonical signature
     * @param microservice Microservice name
     * @param className Class name
     * @param metadata Component metadata
     */
    public IndexedComponent(String type, String name, String id, String fullID, String microservice, 
                           String className, Object metadata) {
        this.type = type;
        this.name = name;
        this.id = id;
        this.fullID = fullID;
        this.microservice = microservice;
        this.className = className;
        this.metadata = metadata;
    }
}