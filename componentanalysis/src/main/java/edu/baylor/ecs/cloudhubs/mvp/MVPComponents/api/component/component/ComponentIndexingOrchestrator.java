package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.component;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.component.indexers.ClassIndexer;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.di.DIContextBuilder;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.di.SpringDIResolver;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedComponent;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedField;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.SpringDIContext;

import edu.university.ecs.lab.common.models.ir.AbstractClass;
import edu.university.ecs.lab.common.models.ir.Microservice;
import edu.university.ecs.lab.common.models.ir.ProjectFile;
import edu.university.ecs.lab.common.models.ir.MicroserviceSystem;

import java.util.HashMap;
import java.util.Map;

public class ComponentIndexingOrchestrator {

    private final ClassIndexer classIndexer;
    private final DIContextBuilder diContextBuilder;
    private final SpringDIResolver diResolver;

    // DI contexts by microservice name
    private final Map<String, SpringDIContext> diContexts = new HashMap<>();

    // Cache of IR Field objects by field ID for DI resolution
    private final Map<String, edu.university.ecs.lab.common.models.ir.Field> fieldCache = new HashMap<>();

    /**
     * Constructor initializing all dependencies.
     */
    public ComponentIndexingOrchestrator() {
        this.classIndexer = new ClassIndexer();
        this.diContextBuilder = new DIContextBuilder();
        this.diResolver = new SpringDIResolver();
    }

    /**
     * Indexes all components in the microservice system.
     *
     * @param system The microservice system to index
     * @param components Map to store indexed components
     * @param componentCounts Map to track component counts
     */
    public void indexComponents(MicroserviceSystem system,
                                Map<String, IndexedComponent> components,
                                Map<String, Integer> componentCounts) {

        // Phase 2.0: Cache IR Field objects for later DI resolution
        cacheFieldObjects(system);

        // Phase 2.1: Build Spring DI contexts (before indexing so beans are available)
        buildDIContexts(system, components);

        // Phase 2.2: Index all components
        indexAllClasses(system, components, componentCounts);

        // Phase 2.3: Resolve DI relationships
        resolveDependencyInjection(components);
    }

    /**
     * Phase 2.0: Caches all IR Field objects for later DI resolution.
     *
     * @param system The microservice system
     */
    private void cacheFieldObjects(MicroserviceSystem system) {
        // Cache fields from microservices
        for (Microservice microservice : system.getMicroservices()) {
            for (AbstractClass clazz : microservice.getClasses()) {
                for (edu.university.ecs.lab.common.models.ir.Field field : clazz.getFields()) {
                    fieldCache.put(field.getID(), field);
                }
            }
        }

        // Cache fields from orphaned classes
        for (ProjectFile orphan : system.getOrphans()) {
            if (orphan instanceof AbstractClass) {
                AbstractClass orphanedClass = (AbstractClass) orphan;
                for (edu.university.ecs.lab.common.models.ir.Field field : orphanedClass.getFields()) {
                    fieldCache.put(field.getID(), field);
                }
            }
        }
    }

    /**
     * Phase 2.2: Indexes all classes and their components.
     *
     * @param system The microservice system
     * @param components Map to store indexed components
     * @param componentCounts Map to track component counts
     */
    private void indexAllClasses(MicroserviceSystem system,
                                Map<String, IndexedComponent> components,
                                Map<String, Integer> componentCounts) {
        int classesIndexed = 0;

        // Index classes in microservices
        for (Microservice microservice : system.getMicroservices()) {
            for (AbstractClass clazz : microservice.getClasses()) {
                classIndexer.indexClass(clazz, microservice.getName(), components, componentCounts);
                classesIndexed++;
            }
        }

        // Index orphaned classes
        for (ProjectFile orphan : system.getOrphans()) {
            if (orphan instanceof AbstractClass) {
                AbstractClass orphanedClass = (AbstractClass) orphan;
                classIndexer.indexClass(orphanedClass, "orphaned", components, componentCounts);
                classesIndexed++;
            }
        }
    }

    /**
     * Phase 2.1: Builds Spring DI contexts for all microservices.
     *
     * @param system The microservice system
     * @param components Map of components (may be partially populated)
     */
    private void buildDIContexts(MicroserviceSystem system, Map<String, IndexedComponent> components) {
        for (Microservice microservice : system.getMicroservices()) {
            SpringDIContext context = diContextBuilder.buildContext(microservice, components);
            diContexts.put(microservice.getName(), context);
        }
    }

    /**
     * Phase 2.4: Resolves dependency injection for @Autowired fields.
     *
     * @param components Map of indexed components
     */
    private void resolveDependencyInjection(Map<String, IndexedComponent> components) {
        int resolvedCount = 0;
        int failedCount = 0;
        int skippedCount = 0;

        int autowiredFieldsFound = 0;
        int diContextMissing = 0;
        int fieldCacheMissing = 0;

        for (IndexedComponent component : components.values()) {
            if (component instanceof IndexedField) {
                IndexedField field = (IndexedField) component;

                // Skip non-autowired fields
                if (!field.isAutowired()) {
                    skippedCount++;
                    continue;
                }

                autowiredFieldsFound++;

                // Get the DI context for this field's microservice
                SpringDIContext diContext = diContexts.get(field.getMicroservice());
                if (diContext == null) {
                    diContextMissing++;
                    skippedCount++;
                    continue;
                }

                // Try to resolve the field
                try {
                    // Get the original IR Field object from cache
                    edu.university.ecs.lab.common.models.ir.Field irField = fieldCache.get(field.getId());

                    if (irField == null) {
                        fieldCacheMissing++;
                        failedCount++;
                        continue;
                    }

                    SpringDIResolver.ResolutionResult result = diResolver.resolveField(irField, diContext, components);

                    // Apply resolution to the indexed field
                    diResolver.applyResolution(field, result);

                    if (result.isResolved()) {
                        resolvedCount++;
                    } else {
                        failedCount++;
                    }
                } catch (Exception e) {
                    failedCount++;
                }
            }
        }
    }

    /**
     * Gets the DI context for a microservice.
     *
     * @param microserviceName The name of the microservice
     * @return The DI context, or null if not found
     */
    public SpringDIContext getDIContext(String microserviceName) {
        return diContexts.get(microserviceName);
    }

    /**
     * Gets all DI contexts.
     *
     * @return Map of microservice name to DI context
     */
    public Map<String, SpringDIContext> getAllDIContexts() {
        return new HashMap<>(diContexts);
    }
}
