package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors.CurlExampleGenerator;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors.DTOSchemaIntrospector;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors.EndpointExtractor;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors.SecurityExtractor;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.*;
import edu.university.ecs.lab.common.models.ir.*;

import java.time.Instant;
import java.util.*;

public class EndpointIndexingOrchestrator {
    private final EndpointExtractor endpointExtractor;
    private final SecurityExtractor securityExtractor;

    /** Base URL for curl example generation */
    private String baseUrl;

    /**
     * Constructor initializing all sub-components.
     */
    public EndpointIndexingOrchestrator() {
        this.endpointExtractor = new EndpointExtractor();
        this.securityExtractor = new SecurityExtractor();
    }

    /**
     * Constructor with custom base URL for curl examples.
     *
     * @param baseUrl The base URL to use in curl examples (e.g., "https://api.example.com")
     */
    public EndpointIndexingOrchestrator(SecurityExtractor securityExtractor, String baseUrl) {
        this.baseUrl = baseUrl;
        this.securityExtractor = securityExtractor;
        this.endpointExtractor = new EndpointExtractor(baseUrl);
    }

    /**
     * Main entry point: Indexes all endpoints in the microservice system.
     *
     * <p>This method orchestrates the complete Phase 1 pipeline:
     * <pre>
     * 1. Extract endpoints → Map&lt;String, EndpointInfo&gt;
     * 2. Parse security configs → Map&lt;String, List&lt;SecurityRule&gt;&gt;
     * 3. Enrich with authorization
     * 4. Parse authentication configs
     * 5. Enrich with authentication mechanisms
     * 6. Build and return EndpointIndex
     * </pre>
     *
     * @param system The microservice system IR to index
     * @return Complete EndpointIndex with all metadata
     */
    public EndpointIndex indexEndpoints(MicroserviceSystem system, String commitID) {
        // PHASE 0: Initialize DTO introspector for curl example generation
        initializeDTOIntrospector(system);

        // PHASE 1: Extract all endpoints with basic metadata
        Map<String, EndpointInfo> endpoints = extractAllEndpoints(system);

        // PHASE 2: Parse security configurations
        Map<String, List<SecurityRule>> securityRules = securityExtractor.parseSecurityConfigs(system);

        // PHASE 3: Enrich endpoints with authorization information
        securityExtractor.enrichEndpointsWithAuthorization(endpoints, securityRules);

        // PHASE 4: Parse authentication configurations
        Map<String, AuthenticationMechanism> authMechanisms = new HashMap<>();
        Map<String, SecurityFeaturesInfo> securityFeatures = new HashMap<>();
        securityExtractor.parseAuthenticationConfigs(system, authMechanisms, securityFeatures);

        // PHASE 5: Enrich endpoints with authentication mechanisms
        securityExtractor.enrichEndpointsWithAuthenticationMechanism(
                endpoints, authMechanisms, securityFeatures, system);

        // PHASE 6: Collect metadata and build index
        Set<String> allRoles = collectAllRoles(endpoints);
        Set<String> services = collectAllServices(system);
        IndexMetadata metadata = buildMetadata(system, endpoints.size(), services, allRoles, commitID);

        return new EndpointIndex(endpoints, metadata);
    }

    /**
     * Phase 0: Initializes the DTO introspector for curl example generation.
     *
     * <p>This creates a {@link DTOSchemaIntrospector} from the MicroserviceSystem
     * which allows generating realistic request body JSON examples with actual field names.
     *
     * @param system The microservice system
     */
    private void initializeDTOIntrospector(MicroserviceSystem system) {
        try {
            DTOSchemaIntrospector dtoIntrospector = new DTOSchemaIntrospector(system);
            CurlExampleGenerator curlGenerator = new CurlExampleGenerator(baseUrl, dtoIntrospector);
            endpointExtractor.setCurlExampleGenerator(curlGenerator);
        } catch (Exception e) {
            // Fall back to basic curl generation without DTO introspection
        }
    }

    /**
     * Phase 1.1: Extracts all endpoints from all microservices.
     *
     * <p>Iterates through all microservices and classes, extracting REST endpoints
     * (methods annotated with @RequestMapping, @GetMapping, etc.) and building
     * complete {@link EndpointInfo} objects with all metadata.
     *
     * @param system The microservice system
     * @return Map of endpoint ID to EndpointInfo
     */
    private Map<String, EndpointInfo> extractAllEndpoints(MicroserviceSystem system) {
        Map<String, EndpointInfo> endpoints = new HashMap<>();
        int totalProcessed = 0;
        int totalExtracted = 0;

        for (Microservice microservice : system.getMicroservices()) {
            String serviceName = microservice.getName();

            for (AbstractClass abstractClass : microservice.getClasses()) {
                String controllerClass = abstractClass.getName();

                for (Method method : abstractClass.getMethods()) {
                    totalProcessed++;

                    // Only process endpoints (methods with REST annotations)
                    if (method instanceof Endpoint) {
                        Endpoint endpoint = (Endpoint) method;

                        // Extract complete endpoint information
                        EndpointInfo info = endpointExtractor.extractEndpoint(
                                endpoint, method, serviceName, controllerClass
                        );

                        if (info != null) {
                            // Use endpoint ID as key (API contract-based)
                            endpoints.put(info.getEndpointId(), info);
                            totalExtracted++;
                        }
                    }
                }
            }
        }

        return endpoints;
    }

    /**
     * Collects all unique roles from enriched endpoints.
     *
     * @param endpoints Map of endpoints
     * @return Set of all role names
     */
    private Set<String> collectAllRoles(Map<String, EndpointInfo> endpoints) {
        Set<String> allRoles = new HashSet<>();

        for (EndpointInfo endpoint : endpoints.values()) {
            if (endpoint.getAuthorization() != null &&
                    endpoint.getAuthorization().getRequiredRoles() != null) {
                allRoles.addAll(endpoint.getAuthorization().getRequiredRoles());
            }
        }

        return allRoles;
    }

    /**
     * Collects all microservice names from the system.
     *
     * @param system The microservice system
     * @return Set of service names
     */
    private Set<String> collectAllServices(MicroserviceSystem system) {
        Set<String> services = new HashSet<>();
        for (Microservice microservice : system.getMicroservices()) {
            services.add(microservice.getName());
        }
        return services;
    }

    /**
     * Builds metadata for the endpoint index.
     *
     * @param system The microservice system
     * @param totalEndpoints Total number of endpoints indexed
     * @param services Set of service names
     * @param roles Set of all roles
     * @return Complete IndexMetadata
     */
    private IndexMetadata buildMetadata(MicroserviceSystem system,
                                        int totalEndpoints,
                                        Set<String> services,
                                        Set<String> roles,
                                        String commitID) {
        IndexMetadata metadata = new IndexMetadata();
        metadata.setSystemName(system.getName());
        metadata.setCommitId(commitID);
        metadata.setIndexedAt(Instant.now().toString());
        metadata.setTotalComponents(totalEndpoints);
        metadata.setMicroserviceCount(services.size());

        // Component counts
        Map<String, Integer> counts = new HashMap<>();
        counts.put("endpoints", totalEndpoints);
        counts.put("roles", roles.size());
        counts.put("microservices", services.size());
        metadata.setComponentCounts(counts);

        return metadata;
    }

    /**
     * Gets statistics about the indexing process.
     *
     * @param index The endpoint index
     * @return Statistics string for logging
     */
    public String getStatistics(EndpointIndex index) {
        if (index == null || index.getEndpoints() == null) {
            return "No endpoints indexed";
        }

        Map<String, EndpointInfo> endpoints = index.getEndpoints();

        // Count by HTTP method
        Map<String, Integer> methodCounts = new HashMap<>();
        int authenticated = 0;
        int publicEndpoints = 0;

        for (EndpointInfo endpoint : endpoints.values()) {
            // Count by HTTP method
            String method = endpoint.getHttpMethod();
            methodCounts.put(method, methodCounts.getOrDefault(method, 0) + 1);

            // Count authentication
            if (endpoint.getAuthentication() != null && endpoint.getAuthentication().isRequired()) {
                authenticated++;
            } else {
                publicEndpoints++;
            }
        }

        StringBuilder stats = new StringBuilder();
        stats.append("\n=== Endpoint Indexing Statistics ===\n");
        stats.append(String.format("Total Endpoints: %d\n", endpoints.size()));
        stats.append(String.format("  - Authenticated: %d\n", authenticated));
        stats.append(String.format("  - Public: %d\n", publicEndpoints));
        stats.append("\nBy HTTP Method:\n");
        methodCounts.forEach((method, count) ->
                stats.append(String.format("  - %s: %d\n", method, count)));
        stats.append("=====================================");

        return stats.toString();
    }
}
