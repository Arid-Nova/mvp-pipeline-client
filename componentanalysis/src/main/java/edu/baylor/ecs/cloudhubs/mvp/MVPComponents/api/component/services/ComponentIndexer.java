package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.cfg.CFGGenerationOrchestrator;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.component.ComponentIndexingOrchestrator;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.*;
import edu.university.ecs.lab.common.config.Config;
import edu.university.ecs.lab.common.models.ir.MicroserviceSystem;
import edu.university.ecs.lab.common.utils.JsonReadWriteUtils;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Service for indexing all components (classes, methods, fields, annotations) in a microservice system.
 *
 * <p>This is a facade service that coordinates the component indexing pipeline using the new
 * refactored architecture:
 * <ul>
 *   <li>Phase 2: Component Indexing (via ComponentIndexingOrchestrator)</li>
 *   <li>Phase 3: CFG Generation (via CFGGenerationOrchestrator)</li>
 * </ul>
 *
 * <p>The service generates a ComponentIndex containing:
 * <ul>
 *   <li>All components (classes, methods, fields, annotations) indexed by ID</li>
 *   <li>Enhanced control flow graphs for all methods</li>
 *   <li>Resolved dependency injection relationships</li>
 *   <li>Remote call endpoint resolution</li>
 *   <li>System metadata and statistics</li>
 * </ul>
 *
 * <p>This service replaces direct usage of the old monolithic IndexerService for component indexing.
 *
 * @author Claude Code Refactoring
 * @version 2.0
 */
public class ComponentIndexer {
    private final Config config;
    private final EndpointIndex endpointIndex;
    private final ComponentIndexingOrchestrator componentOrchestrator;
    private final CFGGenerationOrchestrator cfgOrchestrator;

    /**
     * Constructor with configuration and endpoint index.
     *
     * @param config The configuration
     * @param endpointIndex The endpoint index from Phase 1 (may be null)
     */
    public ComponentIndexer(Config config, EndpointIndex endpointIndex) {
        this.config = config;
        this.endpointIndex = endpointIndex;
        this.componentOrchestrator = new ComponentIndexingOrchestrator();
        this.cfgOrchestrator = new CFGGenerationOrchestrator(endpointIndex);
    }

    /**
     * Generates a complete component index from a microservice system.
     *
     * <p>This method coordinates the entire component indexing pipeline:
     * <ol>
     *   <li>Initialize component maps and counters</li>
     *   <li>Run Phase 2: Component Indexing (classes, methods, fields, annotations)</li>
     *   <li>Run Phase 3: CFG Generation with DI resolution</li>
     *   <li>Extract roles from endpoints or security configs</li>
     *   <li>Build metadata and create final index</li>
     * </ol>
     *
     * @param system The microservice system to index
     * @return The generated component index
     */
    public ComponentIndex generateIndex(MicroserviceSystem system, String commitID) {
        // Initialize storage
        Map<String, IndexedComponent> components = new HashMap<>();
        Map<String, Integer> componentCounts = new HashMap<>();

        // Initialize component type counters (NO endpoints - handled in Phase 1)
        componentCounts.put("Field", 0);
        componentCounts.put("Method", 0);
        componentCounts.put("Annotation", 0);
        componentCounts.put("Class", 0);

        // Phase 2: Component Indexing
        componentOrchestrator.indexComponents(system, components, componentCounts);

        // Phase 3: CFG Generation
        int cfgCount = cfgOrchestrator.generateCFGs(
            system,
            components,
            componentOrchestrator.getAllDIContexts()
        );

        // Extract all roles from the system and sort by priority
        List<String> sortedRoles = extractAndSortRoles(system);

        // Create metadata
        IndexMetadata metadata = buildMetadata(system, components, componentCounts, sortedRoles, commitID);

        // Create and return the index (WITHOUT endpoints)
        ComponentIndex index = new ComponentIndex();
        index.setComponents(components);
        index.setMetadata(metadata);
        index.setRoles(new LinkedHashSet<>(sortedRoles)); // LinkedHashSet preserves insertion order

        return index;
    }

    /**
     * Extracts all roles from the system and sorts them by priority.
     *
     * <p>If an endpoint index is available, roles are extracted from endpoint authorization.
     * Otherwise, roles can be extracted from SecurityConfig files (not implemented yet).
     *
     * <p>Roles are sorted by priority (lower number = higher permission):
     * <ul>
     *   <li>Configured priorities from config.json rolePriority map</li>
     *   <li>Smart defaults: SUPER(0) > ADMIN(10) > MANAGER(20) > USER(50) > GUEST(80) > ANONYMOUS(90)</li>
     *   <li>Unknown roles use defaultRolePriority (default: 50)</li>
     * </ul>
     *
     * @param system The microservice system
     * @return List of roles sorted by priority (highest permission first)
     */
    private List<String> extractAndSortRoles(MicroserviceSystem system) {
        Set<String> allRoles = new HashSet<>();

        if (this.endpointIndex != null) {
            // Get roles from Phase 1 endpoint index
            for (EndpointInfo endpoint : this.endpointIndex.getEndpoints().values()) {
                if (endpoint.getAuthorization() != null &&
                    endpoint.getAuthorization().getRequiredRoles() != null) {
                    allRoles.addAll(endpoint.getAuthorization().getRequiredRoles());
                }
            }
        }
        // TODO: Add fallback to extract roles from SecurityConfig files if needed

        // Sort roles by priority using config
        return allRoles.stream()
            .sorted((r1, r2) -> {
                int p1 = config.getRolePriority(r1);
                int p2 = config.getRolePriority(r2);
                // Primary sort by priority (ascending - lower number = higher permission)
                int priorityCompare = Integer.compare(p1, p2);
                if (priorityCompare != 0) {
                    return priorityCompare;
                }
                // Secondary sort alphabetically for roles with same priority
                return r1.compareTo(r2);
            })
            .collect(Collectors.toList());
    }

    /**
     * Builds metadata for the component index.
     *
     * @param system The microservice system
     * @param components Map of indexed components
     * @param componentCounts Map of component counts by type
     * @param sortedRoles List of roles sorted by priority
     * @return The index metadata
     */
    private IndexMetadata buildMetadata(MicroserviceSystem system,
                                       Map<String, IndexedComponent> components,
                                       Map<String, Integer> componentCounts,
                                       List<String> sortedRoles, String commitID) {
        IndexMetadata metadata = new IndexMetadata();
        metadata.setSystemName(system.getName());
        metadata.setCommitId(commitID);
        metadata.setIndexedAt(Instant.now().toString());
        metadata.setTotalComponents(components.size());
        metadata.setComponentCounts(componentCounts);
        metadata.setMicroserviceCount(system.getMicroservices().size());
        metadata.setRoleCount(sortedRoles.size());
        metadata.setRoles(sortedRoles); // Already sorted by priority

        return metadata;
    }

    /**
     * Writes the component index to a JSON file.
     *
     * @param index The index to write
     * @param outputPath Path to write the JSON file
     * @throws IOException If writing fails
     */
    public void writeToFile(ComponentIndex index, Path outputPath) throws IOException {
        JsonReadWriteUtils.writeToJSON(outputPath, index);
    }

    /**
     * Gets formatted statistics for the component index.
     *
     * @param index The component index
     * @return Formatted statistics string
     */
    public String getStatistics(ComponentIndex index) {
        StringBuilder stats = new StringBuilder();
        stats.append("Component Index Statistics:\n");
        stats.append("  Total Components: ").append(index.getMetadata().getTotalComponents()).append("\n");
        stats.append("  Component Breakdown:\n");

        Map<String, Integer> counts = index.getMetadata().getComponentCounts();
        counts.forEach((type, count) ->
            stats.append("    - ").append(type).append(": ").append(count).append("\n")
        );

        stats.append("  Microservices: ").append(index.getMetadata().getMicroserviceCount()).append("\n");
        stats.append("  Roles: ").append(index.getMetadata().getRoleCount());

        return stats.toString();
    }
}
