package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.di;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.IndexedComponent;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.SpringDIContext;
import edu.university.ecs.lab.common.models.ir.AbstractClass;
import edu.university.ecs.lab.common.models.ir.Annotation;
import edu.university.ecs.lab.common.models.ir.JClass;
import edu.university.ecs.lab.common.models.ir.Microservice;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class DIContextBuilder {
    // Spring stereotype annotation names
    private static final Set<String> SPRING_STEREOTYPE_ANNOTATIONS = Set.of(
        "Service", "Component", "Repository", "Controller", "RestController"
    );

    /**
     * Builds a Spring DI context for the given microservice.
     *
     * @param microservice The microservice to build the DI context for
     * @param components Map of indexed components for reference
     * @return A complete SpringDIContext with all discovered beans
     */
    public SpringDIContext buildContext(Microservice microservice, Map<String, IndexedComponent> components) {
        SpringDIContext context = new SpringDIContext();

        // Phase 1: Scan classes from IR
        scanBeansFromIR(microservice, context);

        // Phase 2: Scan source files for additional beans
        scanBeansFromSource(microservice, context, components);

        return context;
    }

    /**
     * Phase 1: Scans classes from the IR model to identify Spring beans.
     *
     * @param microservice The microservice whose IR classes to scan
     * @param context The DI context to populate
     */
    private void scanBeansFromIR(Microservice microservice, SpringDIContext context) {

        for (AbstractClass abstractClass : microservice.getClasses()) {
            // Only process concrete classes (not interfaces/abstracts)
            if (!(abstractClass instanceof JClass)) {
                continue;
            }

            JClass jClass = (JClass) abstractClass;
            BeanInfo beanInfo = extractBeanInfo(jClass);

            if (beanInfo.isBean) {
                String classId = jClass.getID();
                String fullyQualifiedName = jClass.getPackageName() + "." + jClass.getName();
                Set<String> interfaces = resolveInterfaces(jClass, microservice);

                context.registerBean(classId, fullyQualifiedName, interfaces,
                                   beanInfo.isPrimary, beanInfo.beanName);
            }
        }
    }

    /**
     * Phase 2: Scans source files directly to find Spring beans not captured in IR.
     *
     * @param microservice The microservice whose source files to scan
     * @param context The DI context to populate
     * @param components Map of indexed components for reference
     */
    private void scanBeansFromSource(Microservice microservice, SpringDIContext context,
                                     Map<String, IndexedComponent> components) {
        try {
            Path microservicePath = resolveMicroservicePath(microservice.getPath());
            if (microservicePath == null || !Files.exists(microservicePath)) {
                return;
            }

            Path srcDir = microservicePath.resolve("src/main/java");
            if (!Files.exists(srcDir)) {
                return;
            }

            Files.walk(srcDir)
                .filter(path -> path.toString().endsWith(".java"))
                .forEach(javaFile -> processSourceFile(javaFile, microservice, context));

        } catch (Exception ignored) { }
    }

    /**
     * Processes a single source file to extract bean information.
     *
     * @param javaFile The Java source file to process
     * @param microservice The parent microservice
     * @param context The DI context to populate
     */
    private void processSourceFile(Path javaFile, Microservice microservice, SpringDIContext context) {
        try {
            CompilationUnit cu = StaticJavaParser.parse(javaFile);

            cu.getPrimaryType().ifPresent(typeDeclaration ->
                processTypeDeclaration(typeDeclaration, cu, microservice, context));

        } catch (Exception ignored) { }
    }

    /**
     * Processes a type declaration from source code to extract bean information.
     *
     * @param typeDeclaration The type declaration to process
     * @param cu The compilation unit containing the type
     * @param microservice The parent microservice
     * @param context The DI context to populate
     */
    private void processTypeDeclaration(TypeDeclaration<?> typeDeclaration, CompilationUnit cu,
                                       Microservice microservice, SpringDIContext context) {
        String className = typeDeclaration.getNameAsString();

        // Skip interfaces - we only want concrete classes
        if (typeDeclaration.isClassOrInterfaceDeclaration()) {
            ClassOrInterfaceDeclaration classDecl = typeDeclaration.asClassOrInterfaceDeclaration();
            if (classDecl.isInterface()) {
                return;
            }
        }

        // Check for Spring stereotype annotations
        boolean isBean = typeDeclaration.getAnnotations().stream()
            .anyMatch(ann -> SPRING_STEREOTYPE_ANNOTATIONS.contains(ann.getNameAsString()));

        if (!isBean) {
            return;
        }

        boolean isPrimary = typeDeclaration.getAnnotations().stream()
            .anyMatch(ann -> ann.getNameAsString().equals("Primary"));

        // Get package and fully qualified name
        String packageName = cu.getPackageDeclaration()
            .map(pd -> pd.getNameAsString())
            .orElse("");
        String fullyQualifiedName = packageName.isEmpty() ? className : packageName + "." + className;

        // Check if already registered from IR scan
        if (context.isBean(fullyQualifiedName)) {
            return;
        }

        // Get implemented interfaces
        Set<String> interfaces = extractInterfaces(typeDeclaration, packageName, cu);

        // Generate synthetic classId for beans not in IR
        String classId = microservice.getName() + ":" + fullyQualifiedName.hashCode();

        // Generate bean name (default: uncapitalized class name)
        String beanName = Character.toLowerCase(className.charAt(0)) + className.substring(1);

        context.registerBean(classId, fullyQualifiedName, interfaces, isPrimary, beanName);
    }

    /**
     * Extracts bean information from a JClass (IR model).
     *
     * @param jClass The class to extract bean info from
     * @return BeanInfo containing isBean, isPrimary, and beanName
     */
    private BeanInfo extractBeanInfo(JClass jClass) {
        boolean isBean = false;
        boolean isPrimary = false;
        String beanName = null;

        for (Annotation annotation : jClass.getAnnotations()) {
            String annotationName = annotation.getName();

            if (SPRING_STEREOTYPE_ANNOTATIONS.contains(annotationName)) {
                isBean = true;

                // Extract bean name from annotation value if present
                Map<String, String> attributes = annotation.getAttributes();
                if (attributes != null && attributes.containsKey("value")) {
                    beanName = attributes.get("value").replace("\"", "");
                }

                // Default bean name is uncapitalized class name
                if (beanName == null || beanName.isEmpty()) {
                    String className = jClass.getName();
                    beanName = Character.toLowerCase(className.charAt(0)) + className.substring(1);
                }
            }

            if (annotationName.equals("Primary")) {
                isPrimary = true;
            }
        }

        return new BeanInfo(isBean, isPrimary, beanName);
    }

    /**
     * Resolves interface names to fully qualified names for a JClass from IR.
     *
     * @param jClass The class whose interfaces to resolve
     * @param microservice The parent microservice for interface lookup
     * @return Set of fully qualified interface names
     */
    private Set<String> resolveInterfaces(JClass jClass, Microservice microservice) {
        Set<String> interfaces = new HashSet<>();

        if (jClass.getImplementedTypes() != null) {
            for (String interfaceName : jClass.getImplementedTypes()) {
                String qualifiedInterface = findInterfaceQualifiedName(interfaceName, microservice);
                if (qualifiedInterface != null) {
                    interfaces.add(qualifiedInterface);
                } else {
                    // Fallback: assume same package as implementation
                    interfaces.add(jClass.getPackageName() + "." + interfaceName);
                }
            }
        }

        return interfaces;
    }

    /**
     * Extracts interface names from a type declaration in source code.
     *
     * @param typeDeclaration The type declaration
     * @param packageName The package name of the class
     * @param cu The compilation unit for import resolution
     * @return Set of fully qualified interface names
     */
    private Set<String> extractInterfaces(TypeDeclaration<?> typeDeclaration,
                                          String packageName, CompilationUnit cu) {
        Set<String> interfaces = new HashSet<>();

        if (typeDeclaration.isClassOrInterfaceDeclaration()) {
            ClassOrInterfaceDeclaration classDecl = typeDeclaration.asClassOrInterfaceDeclaration();

            classDecl.getImplementedTypes().forEach(impl -> {
                String interfaceName = impl.getNameAsString();
                String fqInterfaceName = resolveInterfaceName(interfaceName, packageName, cu);
                interfaces.add(fqInterfaceName);
            });
        }

        return interfaces;
    }

    /**
     * Resolves an interface name to its fully qualified name using imports.
     *
     * @param interfaceName The simple or qualified interface name
     * @param packageName The current package name
     * @param cu The compilation unit for import resolution
     * @return Fully qualified interface name
     */
    private String resolveInterfaceName(String interfaceName, String packageName, CompilationUnit cu) {
        // Already fully qualified
        if (interfaceName.contains(".")) {
            return interfaceName;
        }

        // Check imports
        for (var imp : cu.getImports()) {
            String importName = imp.getNameAsString();
            if (importName.endsWith("." + interfaceName)) {
                return importName;
            }
        }

        // Assume same package
        return packageName.isEmpty() ? interfaceName : packageName + "." + interfaceName;
    }

    /**
     * Finds the fully qualified name of an interface in a microservice.
     *
     * @param simpleInterfaceName The simple interface name
     * @param microservice The microservice to search
     * @return Fully qualified interface name, or null if not found
     */
    private String findInterfaceQualifiedName(String simpleInterfaceName, Microservice microservice) {
        for (AbstractClass abstractClass : microservice.getClasses()) {
            if (abstractClass.getName().equals(simpleInterfaceName)) {
                return abstractClass.getPackageName() + "." + abstractClass.getName();
            }
        }
        return null;
    }

    /**
     * Resolves the microservice path, handling relative paths.
     *
     * @param microservicePath The microservice path from the model
     * @return Resolved absolute path, or null if not resolvable
     */
    private Path resolveMicroservicePath(Path microservicePath) {
        if (microservicePath == null) {
            return null;
        }

        // If already absolute, return as-is
        if (microservicePath.isAbsolute()) {
            return microservicePath;
        }

        // Try to resolve relative to current directory
        Path resolved = Path.of(System.getProperty("user.dir")).resolve(microservicePath);
        if (Files.exists(resolved)) {
            return resolved;
        }

        return null;
    }

    /**
     * Internal class to hold bean extraction results.
     */
    private static class BeanInfo {
        final boolean isBean;
        final boolean isPrimary;
        final String beanName;

        BeanInfo(boolean isBean, boolean isPrimary, String beanName) {
            this.isBean = isBean;
            this.isPrimary = isPrimary;
            this.beanName = beanName;
        }
    }
}
