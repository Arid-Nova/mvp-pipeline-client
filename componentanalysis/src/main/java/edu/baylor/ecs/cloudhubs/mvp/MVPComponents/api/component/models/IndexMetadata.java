package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;
import java.util.Map;

/**
 * Metadata about an indexed microservice system.
 * Contains statistics and information about the indexing process.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class IndexMetadata {
    /**
     * Name of the indexed system
     */
    private String systemName;
    
    /**
     * Commit ID of the indexed system
     */
    private String commitId;
    
    /**
     * Timestamp when the index was created
     */
    private String indexedAt;
    
    /**
     * Total number of indexed components
     */
    private int totalComponents;
    
    /**
     * Map of component type names to their counts
     */
    private Map<String, Integer> componentCounts;
    
    /**
     * Number of microservices indexed
     */
    private int microserviceCount;

    /**
     * Total number of unique roles across all microservices
     */
    private int roleCount;

    /**
     * List of all unique roles across all microservices
     */
    private List<String> roles;
}