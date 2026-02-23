package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils.EndpointIdGenerator;

import edu.university.ecs.lab.common.models.enums.HttpMethod;
import edu.university.ecs.lab.common.models.ir.AbstractClass;
import edu.university.ecs.lab.common.models.ir.Endpoint;
import edu.university.ecs.lab.common.models.ir.Method;

import lombok.Setter;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Service for extracting complete endpoint information from REST API methods.
 *
 * <p>This service orchestrates multiple specialized extractors to build comprehensive
 * {@link EndpointInfo} objects that include:
 * <ul>
 *   <li>Basic endpoint metadata (HTTP method, URL, IDs)</li>
 *   <li>Parameter details (path, query, request body) with validation constraints</li>
 *   <li>Authentication information</li>
 *   <li>Response schema information</li>
 *   <li>Database operation information (if applicable)</li>
 *   <li>Curl command examples for LLM test generation</li>
 * </ul>
 *
 * <p>The extractor uses JavaParser to analyze source code and extract detailed
 * information that may not be available in the IR (Intermediate Representation) alone.
 *
 * @author Claude Code Refactoring
 * @version 2.0
 */
public class EndpointExtractor {

    private final ParameterExtractor parameterExtractor;
    /**
     * -- SETTER --
     *  Sets a custom CurlExampleGenerator (allows setting DTO introspector after construction).
     *
     * @param curlExampleGenerator The curl example generator to use
     */
    @Setter
    private CurlExampleGenerator curlExampleGenerator;

    /**
     * Constructor initializing all sub-extractors.
     */
    public EndpointExtractor() {
        this.parameterExtractor = new ParameterExtractor();
        this.curlExampleGenerator = new CurlExampleGenerator();
    }

    /**
     * Constructor with custom base URL for curl examples.
     *
     * @param baseUrl The base URL to use in curl examples (e.g., "<a href="https://api.example.com">Link</a>")
     */
    public EndpointExtractor(String baseUrl) {
        this.parameterExtractor = new ParameterExtractor();
        this.curlExampleGenerator = new CurlExampleGenerator(baseUrl, null);
    }

    /**
     * Constructor with custom base URL and DTO introspector for curl examples.
     *
     * @param baseUrl The base URL to use in curl examples
     * @param dtoIntrospector DTO introspector for request body examples
     */
    public EndpointExtractor(String baseUrl, DTOSchemaIntrospector dtoIntrospector) {
        this.parameterExtractor = new ParameterExtractor();
        this.curlExampleGenerator = new CurlExampleGenerator(baseUrl, dtoIntrospector);
    }

    /**
     * Extracts complete endpoint information from an endpoint method.
     *
     * @param endpoint The endpoint from IR
     * @param method The method from IR
     * @param serviceName The name of the microservice
     * @param controllerClass The name of the controller class
     * @return Complete EndpointInfo, or null if extraction fails
     */
    public EndpointInfo extractEndpoint(Endpoint endpoint, Method method,
                                        String serviceName, String controllerClass) {
        try {
            // 1. Generate method-based ID (existing, from IR)
            String methodId = method.getID();

            // 2. Extract HTTP method and URLs
            HttpMethod httpMethod = endpoint.getHttpMethod();
            if (httpMethod == null) {
                httpMethod = HttpMethod.GET; // Default
            }

            // Get simplified URL (with {?}) for pattern matching
            String simplifiedUri = endpoint.getUrl();
            if (simplifiedUri == null || simplifiedUri.isEmpty()) {
                return null;
            }

            // Get original URL with actual parameter names for display
            String fullUri = endpoint.getOriginalUrl();
            if (fullUri == null || fullUri.isEmpty()) {
                fullUri = simplifiedUri; // Fallback for backward compatibility
            }

            // 3. Generate endpoint-based ID (API contract based) - use simplified for consistency
            String endpointId = EndpointIdGenerator.generate(serviceName, simplifiedUri, httpMethod);

            // 4. Extract parameter details using original URL with parameter names
            List<ParameterDetail> pathParams = parameterExtractor.extractPathParameters(method, fullUri, endpoint.getOriginalParamNames());
            List<ParameterDetail> queryParams = parameterExtractor.extractQueryParameters(method);
            ParameterDetail requestBody = parameterExtractor.extractRequestBody(method);

            // 5. Extract other metadata
            String responseType = method.getReturnType();
            String description = generateEndpointDescription(method);

            // 6. Extract authentication information
            AuthenticationInfo authentication = extractAuthenticationInfo(method);

            // 7. Extract response schema information
            ResponseSchemaInfo responseSchema = extractResponseSchemaInfo(method);

            // 8. Extract URL-derived service name for remote call resolution
            String urlDerivedService = extractServiceNameFromUrl(fullUri);

            // 9. Determine effective service name for indexing
            // Use URL-derived service name if available (for remote call resolution)
            // Otherwise fall back to the physical service name
            String effectiveServiceName = (urlDerivedService != null) ? urlDerivedService : serviceName;

            // Regenerate endpoint ID with effective service name for correct resolution
            String effectiveEndpointId = EndpointIdGenerator.generate(effectiveServiceName, simplifiedUri, httpMethod);

            // 10. Build EndpointInfo
            EndpointInfo info = new EndpointInfo();
            info.setId(methodId);                      // Method-based ID (backward compatible)
            info.setEndpointId(effectiveEndpointId);   // Endpoint-based ID (API contract) - uses effective service
            info.setMethodId(methodId);                // Reference to method
            info.setServiceName(effectiveServiceName); // Use effective service for indexing
            info.setPhysicalServiceName(serviceName);  // Store physical location
            info.setUrlDerivedServiceName(urlDerivedService); // Store URL-derived (may be null)
            info.setHttpMethod(httpMethod.toString());
            info.setFullUri(fullUri);                  // Original URL with param names
            info.setSimplifiedUri(simplifiedUri);      // Simplified URL with {?}
            info.setPathParameterDetails(pathParams);
            info.setQueryParameterDetails(queryParams);
            info.setRequestBodyDetail(requestBody);
            info.setResponseType(responseType);
            info.setControllerClass(controllerClass);
            info.setMethodName(method.getName());
            info.setDescription(description);
            info.setAuthentication(authentication);
            info.setResponseSchema(responseSchema);

            // Authorization will be enriched later by SecurityExtractor
            info.setAuthorization(createBasicAuthorization());

            // 9. Generate curl example for LLM test generation
            if (curlExampleGenerator != null) {
                String curlExample = curlExampleGenerator.generate(info);
                info.setCurlExample(curlExample);
            }

            return info;

        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Extracts authentication information from a method using JavaParser.
     *
     * @param method The method to extract authentication from
     * @return AuthenticationInfo, or public endpoint if extraction fails
     */
    private AuthenticationInfo extractAuthenticationInfo(Method method) {
        try {
            // Get the parent class
            if (!method.getParent().isPresent() || !(method.getParent().get() instanceof AbstractClass)) {
                return AuthenticationInfo.createPublic();
            }

            AbstractClass parentClass = (AbstractClass) method.getParent().get();

            // Get the source file path
            Path sourcePath = resolveSourcePath(parentClass);
            if (sourcePath == null || !Files.exists(sourcePath)) {
                return AuthenticationInfo.createPublic();
            }

            // Parse the source file
            CompilationUnit cu = StaticJavaParser.parse(sourcePath.toFile());

            // Find the method declaration
            MethodDeclaration methodDecl = findMethodDeclaration(cu, method);
            if (methodDecl == null) {
                return AuthenticationInfo.createPublic();
            }

            // Find the class declaration
            ClassOrInterfaceDeclaration classDecl = findClassDeclaration(cu, parentClass.getName());

            // Extract authentication using AuthenticationExtractor
            return AuthenticationExtractor.extractAuthentication(methodDecl, classDecl);

        } catch (Exception e) {
            return AuthenticationInfo.createPublic();
        }
    }

    /**
     * Extracts response schema information from a method using JavaParser.
     *
     * @param method The method to extract response schema from
     * @return ResponseSchemaInfo, or simple schema if extraction fails
     */
    private ResponseSchemaInfo extractResponseSchemaInfo(Method method) {
        try {
            // Get the parent class
            if (method.getParent().isEmpty() || !(method.getParent().get() instanceof AbstractClass)) {
                return ResponseSchemaInfo.createSimple(method.getReturnType());
            }

            AbstractClass parentClass = (AbstractClass) method.getParent().get();

            // Get the source file path
            Path sourcePath = resolveSourcePath(parentClass);
            if (sourcePath == null || !Files.exists(sourcePath)) {
                return ResponseSchemaInfo.createSimple(method.getReturnType());
            }

            // Parse the source file
            CompilationUnit cu = StaticJavaParser.parse(sourcePath.toFile());

            // Find the method declaration
            MethodDeclaration methodDecl = findMethodDeclaration(cu, method);
            if (methodDecl == null) {
                return ResponseSchemaInfo.createSimple(method.getReturnType());
            }

            // Create exception handler registry and scan for exception handlers
            ExceptionHandlerRegistry exceptionRegistry = new ExceptionHandlerRegistry();
            exceptionRegistry.scanControllerAdvice(cu);
            exceptionRegistry.scanExceptionClass(cu);

            // Extract response schema using ResponseSchemaExtractor
            return ResponseSchemaExtractor.extractResponseSchema(methodDecl, exceptionRegistry);

        } catch (Exception e) {
            return ResponseSchemaInfo.createSimple(method.getReturnType());
        }
    }


    /**
     * Generates a human-readable description for the endpoint from the method name.
     *
     * @param method The method
     * @return Human-readable description
     */
    private String generateEndpointDescription(Method method) {
        String name = method.getName();
        if (name == null) {
            return "Endpoint";
        }

        // Convert camelCase to spaces: getUserById -> get user by id
        return name.replaceAll("([A-Z])", " $1").trim().toLowerCase();
    }

    /**
     * Creates basic authorization info that will be enriched later by SecurityExtractor.
     *
     * @return Basic AuthorizationInfo
     */
    private AuthorizationInfo createBasicAuthorization() {
        AuthorizationInfo auth = new AuthorizationInfo();
        auth.setRequiredRoles(new ArrayList<>());
        auth.setRequiresAuthentication(false);
        auth.setPublic(true);
        auth.setSource("default");
        return auth;
    }

    /**
     * Extract service name from URL path pattern.
     *
     * <p>This method analyzes the URL path to determine which logical service
     * the endpoint belongs to, based on common API naming conventions.
     *
     * <p>Supported patterns:
     * <ul>
     *   <li>/api/v1/orderservice/... → ts-order-service</li>
     *   <li>/api/v1/orderOtherService/... → ts-order-other-service</li>
     *   <li>/api/v1/userservice/... → ts-user-service</li>
     *   <li>/api/v1/travel2service/... → ts-travel2-service</li>
     *   <li>/api/v1/contactservice/... → ts-contacts-service (note: plural form)</li>
     * </ul>
     *
     * @param url The endpoint URL path
     * @return The extracted service name (e.g., "ts-order-service"), or null if not determinable
     */
    private String extractServiceNameFromUrl(String url) {
        if (url == null || url.isEmpty()) {
            return null;
        }

        // Pattern 1: /api/vN/XXXservice/... or /api/vN/XXXService/...
        // Examples: /api/v1/orderservice/order → ts-order-service
        //           /api/v1/orderOtherService/orderOther → ts-order-other-service
        java.util.regex.Pattern servicePattern = java.util.regex.Pattern.compile(
            "/api/v\\d+/([a-zA-Z0-9]+)(?:service|Service)(?:/|$)"
        );
        java.util.regex.Matcher matcher = servicePattern.matcher(url);
        if (matcher.find()) {
            String servicePart = matcher.group(1);
            // Convert camelCase to kebab-case: orderOther → order-other
            String kebabCase = camelCaseToKebabCase(servicePart);
            return "ts-" + kebabCase + "-service";
        }

        // Pattern 2: /XXXservice/... (without /api/vN prefix)
        // Examples: /orderservice/order → ts-order-service
        servicePattern = java.util.regex.Pattern.compile(
            "^/([a-zA-Z0-9]+)(?:service|Service)(?:/|$)"
        );
        matcher = servicePattern.matcher(url);
        if (matcher.find()) {
            String servicePart = matcher.group(1);
            String kebabCase = camelCaseToKebabCase(servicePart);
            return "ts-" + kebabCase + "-service";
        }

        // Pattern 3: /api/vN/users/... → ts-user-service (common resource patterns)
        // This handles cases where the service is named after the resource
        servicePattern = java.util.regex.Pattern.compile(
            "/api/v\\d+/(users|orders|routes|travels|stations|prices|contacts|trains|seats|assurances|foods|consigns)(?:/|$)"
        );
        matcher = servicePattern.matcher(url);
        if (matcher.find()) {
            String resourcePart = matcher.group(1);
            // Singularize: users → user, orders → order, etc.
            String singular = resourcePart.endsWith("s") && !resourcePart.endsWith("ss")
                ? resourcePart.substring(0, resourcePart.length() - 1)
                : resourcePart;
            return "ts-" + singular + "-service";
        }

        return null; // Cannot determine service from URL
    }

    /**
     * Convert camelCase to kebab-case.
     *
     * <p>Examples:
     * <ul>
     *   <li>orderOther → order-other</li>
     *   <li>travel2 → travel2</li>
     *   <li>OrderService → order-service</li>
     * </ul>
     *
     * @param camelCase The camelCase string
     * @return The kebab-case string
     */
    private String camelCaseToKebabCase(String camelCase) {
        if (camelCase == null || camelCase.isEmpty()) {
            return camelCase;
        }
        // Insert hyphen before uppercase letters and convert to lowercase
        return camelCase
            .replaceAll("([a-z])([A-Z])", "$1-$2")
            .replaceAll("([A-Z])([A-Z][a-z])", "$1-$2")
            .toLowerCase();
    }

    /**
     * Resolves the source path for a class, handling relative paths.
     *
     * @param clazz The class to resolve the path for
     * @return Resolved absolute path, or null if not resolvable
     */
    private Path resolveSourcePath(AbstractClass clazz) {
        Path path = clazz.getPath();
        if (path == null) {
            return null;
        }

        // If already absolute and exists, return as-is
        if (path.isAbsolute() && Files.exists(path)) {
            return path;
        }

        // Try to resolve relative to current directory
        Path resolved = Path.of(System.getProperty("user.dir")).resolve(path);
        if (Files.exists(resolved)) {
            return resolved;
        }

        // Try parent directory (common in multi-module projects)
        resolved = Path.of(System.getProperty("user.dir")).getParent().resolve(path);
        if (resolved != null && Files.exists(resolved)) {
            return resolved;
        }

        return null;
    }

    /**
     * Finds a method declaration in a compilation unit.
     *
     * @param cu The compilation unit
     * @param method The method to find
     * @return MethodDeclaration, or null if not found
     */
    private MethodDeclaration findMethodDeclaration(CompilationUnit cu, Method method) {
        String methodName = method.getName();
        int paramCount = method.getParameters().size();

        for (MethodDeclaration methodDecl : cu.findAll(MethodDeclaration.class)) {
            if (methodDecl.getNameAsString().equals(methodName) &&
                methodDecl.getParameters().size() == paramCount) {
                return methodDecl;
            }
        }

        return null;
    }

    /**
     * Finds a class declaration in a compilation unit.
     *
     * @param cu The compilation unit
     * @param className The class name to find
     * @return ClassOrInterfaceDeclaration, or null if not found
     */
    private ClassOrInterfaceDeclaration findClassDeclaration(CompilationUnit cu, String className) {
        for (ClassOrInterfaceDeclaration classDecl : cu.findAll(ClassOrInterfaceDeclaration.class)) {
            if (classDecl.getNameAsString().equals(className)) {
                return classDecl;
            }
        }
        return null;
    }
}
