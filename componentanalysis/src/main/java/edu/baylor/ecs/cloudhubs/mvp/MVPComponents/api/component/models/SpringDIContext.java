package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import java.util.*;

/**
 * Represents Spring Dependency Injection context for a microservice.
 * Tracks beans (@Service, @Component, @Repository) and their interface-to-implementation mappings.
 * Used to resolve @Autowired field injections to concrete implementations.
 */
public class SpringDIContext {

    /**
     * Map from interface fully qualified name to list of implementing bean classes
     * Example: "com.example.UserService" -> ["com.example.UserServiceImpl", "com.example.CachedUserServiceImpl"]
     */
    private final Map<String, List<BeanImplementation>> interfaceToImplementations;

    /**
     * Map from interface simple name to list of implementing bean classes
     * Example: "UserService" -> ["com.example.UserServiceImpl", "com.example.CachedUserServiceImpl"]
     * Used for lookup when field type is not fully qualified
     */
    private final Map<String, List<BeanImplementation>> simpleNameToImplementations;

    /**
     * All Spring beans (@Service, @Component, @Repository) in this microservice
     * Key: fully qualified class name, Value: BeanInfo
     */
    private final Map<String, BeanInfo> beans;

    /**
     * Map from simple class name to BeanInfo for fast lookup
     */
    private final Map<String, List<BeanInfo>> simpleNameToBeans;

    public SpringDIContext() {
        this.interfaceToImplementations = new HashMap<>();
        this.simpleNameToImplementations = new HashMap<>();
        this.beans = new HashMap<>();
        this.simpleNameToBeans = new HashMap<>();
    }

    /**
     * Register a Spring bean (class with @Service, @Component, or @Repository)
     *
     * @param classId The indexed component ID
     * @param fullyQualifiedName The fully qualified class name
     * @param interfaces List of interfaces this class implements
     * @param isPrimary Whether this bean is marked with @Primary
     * @param beanName The Spring bean name (from @Service("name") or simple class name)
     */
    public void registerBean(String classId, String fullyQualifiedName, Set<String> interfaces,
                            boolean isPrimary, String beanName) {
        // Register bean
        BeanInfo beanInfo = new BeanInfo(classId, fullyQualifiedName, interfaces, isPrimary, beanName);
        beans.put(fullyQualifiedName, beanInfo);

        // Also register by simple name
        String simpleName = getSimpleName(fullyQualifiedName);
        simpleNameToBeans.computeIfAbsent(simpleName, k -> new ArrayList<>()).add(beanInfo);

        // Register implementations for each interface (both fully qualified and simple name)
        for (String interfaceName : interfaces) {
            // Register by fully qualified interface name
            List<BeanImplementation> impls = interfaceToImplementations.computeIfAbsent(
                interfaceName, k -> new ArrayList<>()
            );
            impls.add(new BeanImplementation(classId, fullyQualifiedName, isPrimary, beanName));

            // Also register by simple interface name
            String simpleInterfaceName = getSimpleName(interfaceName);
            List<BeanImplementation> simpleImpls = simpleNameToImplementations.computeIfAbsent(
                simpleInterfaceName, k -> new ArrayList<>()
            );
            simpleImpls.add(new BeanImplementation(classId, fullyQualifiedName, isPrimary, beanName));
        }
    }

    /**
     * Extracts the simple class name from a fully qualified name.
     * Example: "com.example.UserService" -> "UserService"
     */
    private String getSimpleName(String fullyQualifiedName) {
        int lastDot = fullyQualifiedName.lastIndexOf('.');
        return lastDot >= 0 ? fullyQualifiedName.substring(lastDot + 1) : fullyQualifiedName;
    }

    /**
     * Resolve an @Autowired field to its implementation.
     * Uses Spring's resolution rules:
     * 1. If only one implementation exists, use it
     * 2. If multiple exist, prefer @Primary
     * 3. If no @Primary, return null (ambiguous - would be runtime error in Spring)
     *
     * Supports both fully qualified and simple type names.
     *
     * @param interfaceType The declared type of the @Autowired field (fully qualified or simple name)
     * @return The resolved implementation, or null if ambiguous/not found
     */
    public BeanImplementation resolveAutowiredField(String interfaceType) {
        // Try fully qualified name first
        List<BeanImplementation> implementations = interfaceToImplementations.get(interfaceType);

        // If not found, try simple name
        if (implementations == null || implementations.isEmpty()) {
            implementations = simpleNameToImplementations.get(interfaceType);
        }

        if (implementations == null || implementations.isEmpty()) {
            // No implementations found - might be concrete class autowiring
            // Try fully qualified name first
            BeanInfo beanInfo = beans.get(interfaceType);

            // If not found, try simple name
            if (beanInfo == null) {
                List<BeanInfo> simpleBeans = simpleNameToBeans.get(interfaceType);
                if (simpleBeans != null && simpleBeans.size() == 1) {
                    beanInfo = simpleBeans.get(0);
                } else if (simpleBeans != null && simpleBeans.size() > 1) {
                    // Multiple beans with same simple name - ambiguous
                    return null;
                }
            }

            if (beanInfo != null) {
                return new BeanImplementation(beanInfo.classId, beanInfo.fullyQualifiedName,
                                             beanInfo.isPrimary, beanInfo.beanName);
            }
            return null;
        }

        if (implementations.size() == 1) {
            // Only one implementation, use it
            return implementations.get(0);
        }

        // Multiple implementations - look for @Primary
        List<BeanImplementation> primaryBeans = new ArrayList<>();
        for (BeanImplementation impl : implementations) {
            if (impl.isPrimary) {
                primaryBeans.add(impl);
            }
        }

        if (primaryBeans.size() == 1) {
            return primaryBeans.get(0);
        }

        // Ambiguous: either no @Primary or multiple @Primary (error case)
        return null;
    }

    /**
     * Resolve with qualifier support (for future enhancement)
     *
     * Supports both fully qualified and simple type names.
     *
     * @param interfaceType The declared type (fully qualified or simple name)
     * @param qualifierName The @Qualifier value
     * @return The matching implementation
     */
    public BeanImplementation resolveWithQualifier(String interfaceType, String qualifierName) {
        // Try fully qualified name first
        List<BeanImplementation> implementations = interfaceToImplementations.get(interfaceType);

        // If not found, try simple name
        if (implementations == null || implementations.isEmpty()) {
            implementations = simpleNameToImplementations.get(interfaceType);
        }

        if (implementations == null || implementations.isEmpty()) {
            return null;
        }

        // Find implementation matching qualifier (bean name)
        for (BeanImplementation impl : implementations) {
            if (impl.beanName != null && impl.beanName.equals(qualifierName)) {
                return impl;
            }
        }

        return null;
    }

    /**
     * Get all implementations for an interface.
     * Supports both fully qualified and simple type names.
     *
     * @param interfaceType The interface type (fully qualified or simple name)
     * @return List of implementations
     */
    public List<BeanImplementation> getImplementations(String interfaceType) {
        // Try fully qualified name first
        List<BeanImplementation> implementations = interfaceToImplementations.get(interfaceType);

        // If not found or empty, try simple name
        if (implementations == null || implementations.isEmpty()) {
            implementations = simpleNameToImplementations.get(interfaceType);
        }

        return implementations != null ? implementations : new ArrayList<>();
    }

    /**
     * Check if a type is a registered bean
     */
    public boolean isBean(String fullyQualifiedName) {
        return beans.containsKey(fullyQualifiedName);
    }

    /**
     * Get bean info
     */
    public BeanInfo getBeanInfo(String fullyQualifiedName) {
        return beans.get(fullyQualifiedName);
    }

    /**
     * Get the total number of registered beans
     */
    public int getBeanCount() {
        return beans.size();
    }

    /**
     * Represents a Spring bean
     */
    public static class BeanInfo {
        public final String classId;
        public final String fullyQualifiedName;
        public final Set<String> interfaces;
        public final boolean isPrimary;
        public final String beanName;

        public BeanInfo(String classId, String fullyQualifiedName, Set<String> interfaces,
                       boolean isPrimary, String beanName) {
            this.classId = classId;
            this.fullyQualifiedName = fullyQualifiedName;
            this.interfaces = interfaces;
            this.isPrimary = isPrimary;
            this.beanName = beanName;
        }
    }

    /**
     * Represents a bean implementation
     */
    public static class BeanImplementation {
        public final String classId;
        public final String fullyQualifiedName;
        public final boolean isPrimary;
        public final String beanName;

        public BeanImplementation(String classId, String fullyQualifiedName,
                                 boolean isPrimary, String beanName) {
            this.classId = classId;
            this.fullyQualifiedName = fullyQualifiedName;
            this.isPrimary = isPrimary;
            this.beanName = beanName;
        }

        @Override
        public String toString() {
            return fullyQualifiedName + (isPrimary ? " (PRIMARY)" : "");
        }
    }
}
