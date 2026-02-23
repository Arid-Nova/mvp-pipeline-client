package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.github.javaparser.ast.expr.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg.MethodCallInfo;
import edu.university.ecs.lab.common.models.enums.HttpMethod;
import edu.university.ecs.lab.common.models.enums.RestCallTemplate;

import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Utility class for detecting and analyzing remote service calls in microservice architectures.
 * Handles RestTemplate, WebClient, and service discovery patterns.
 */
public class RemoteCallDetector {
    // Patterns for service discovery
    private static final Pattern SERVICE_URL_PATTERN = Pattern.compile("getServiceUrl\\s*\\(\\s*[\"']([^\"']+)[\"']\\s*\\)");
    private static final Pattern SERVICE_NAME_PATTERN = Pattern.compile("[\"']([a-zA-Z][a-zA-Z0-9-_]*-service)[\"']");
    private static final Pattern ENDPOINT_PATTERN = Pattern.compile("[\"'](/[a-zA-Z0-9/_-]*)[\"']");

    // Common service discovery object names
    private static final String[] SERVICE_DISCOVERY_OBJECTS = {
        "serviceResolver", "discoveryClient", "loadBalancer", "registry"
    };

    // Common REST template object names
    private static final String[] REST_TEMPLATE_OBJECTS = {
        "restTemplate", "webClient", "httpClient", "restOperations"
    };

    /**
     * Analyze a method call expression to determine if it's a remote service call
     */
    public static RemoteCallAnalysis analyzeMethodCall(MethodCallExpr methodCall) {
        return analyzeMethodCall(methodCall, null);
    }

    /**
     * Analyze a method call to determine if it's a remote call, service discovery, or async call.
     * This overloaded version accepts a variable-to-service map for improved service resolution.
     *
     * @param methodCall The method call expression to analyze
     * @param variableToService Map of variable names to service names (from service discovery calls)
     * @return Analysis result containing call type, endpoint, service name, etc.
     */
    public static RemoteCallAnalysis analyzeMethodCall(MethodCallExpr methodCall, Map<String, String> variableToService) {
        RemoteCallAnalysis analysis = new RemoteCallAnalysis();

        // Check if this is a REST template call
        if (isRestTemplateCall(methodCall)) {
            analysis.isRemoteCall = true;
            analysis.callType = MethodCallInfo.CallType.REMOTE_HTTP;
            analysis.objectType = getObjectName(methodCall);
            analysis.httpMethod = extractHttpMethod(methodCall);
            analysis.endpoint = extractEndpoint(methodCall);
            analysis.targetService = extractTargetService(methodCall, variableToService);
        }
        // Check if this is a service discovery call
        else if (isServiceDiscoveryCall(methodCall)) {
            analysis.isServiceDiscovery = true;
            analysis.callType = MethodCallInfo.CallType.SERVICE_DISCOVERY;
            analysis.objectType = getObjectName(methodCall);
            analysis.targetService = extractServiceNameFromDiscovery(methodCall);
            analysis.serviceDiscoveryPattern = methodCall.toString();
        }
        // Check if this is an async call
        else if (isAsyncCall(methodCall)) {
            analysis.isRemoteCall = true;
            analysis.callType = MethodCallInfo.CallType.REMOTE_ASYNC;
            analysis.objectType = getObjectName(methodCall);
            analysis.isAsync = true;
        }
        else {
            // Default to local call
            analysis.callType = MethodCallInfo.CallType.LOCAL;
            analysis.objectType = getObjectName(methodCall);
        }

        return analysis;
    }

    /**
     * Check if a method call is a REST template call (RestTemplate, WebClient, etc.)
     */
    private static boolean isRestTemplateCall(MethodCallExpr methodCall) {
        String objectName = getObjectName(methodCall);
        String methodName = methodCall.getNameAsString();

        // First check if the method name is a REST method
        if (!RestCallTemplate.REST_METHODS.contains(methodName)) {
            return false;
        }

        // Check object name patterns
        if (objectName != null) {
            String lowerObjectName = objectName.toLowerCase();

            // Check against REST template object names
            for (String restObj : REST_TEMPLATE_OBJECTS) {
                if (lowerObjectName.contains(restObj.toLowerCase())) {
                    return true;
                }
            }

            // Check against REST types (exact match for class names)
            for (String restType : RestCallTemplate.REST_OBJECTS) {
                if (objectName.contains(restType)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if a method call is a service discovery call
     */
    private static boolean isServiceDiscoveryCall(MethodCallExpr methodCall) {
        String objectName = getObjectName(methodCall);
        String methodName = methodCall.getNameAsString();

        if (objectName != null) {
            String lowerObjectName = objectName.toLowerCase();

            // Check for service discovery object patterns
            for (String discoveryObj : SERVICE_DISCOVERY_OBJECTS) {
                String lowerDiscoveryObj = discoveryObj.toLowerCase();  // Lowercase for case-insensitive comparison
                if (lowerObjectName.contains(lowerDiscoveryObj)) {
                    return methodName.contains("getService") ||
                           methodName.contains("resolve") ||
                           methodName.contains("discover");
                }
            }
        }

        return false;
    }

    /**
     * Check if a method call is an asynchronous call
     */
    private static boolean isAsyncCall(MethodCallExpr methodCall) {
        String methodName = methodCall.getNameAsString();
        String objectName = getObjectName(methodCall);

        // Check method name patterns
        if (methodName.contains("async") || methodName.contains("Async") ||
            methodName.startsWith("submit") || methodName.contains("Future")) {
            return true;
        }

        // Check object patterns
        if (objectName != null) {
            String lowerObjectName = objectName.toLowerCase();
            return lowerObjectName.contains("async") ||
                   lowerObjectName.contains("executor") ||
                   lowerObjectName.contains("scheduler");
        }

        return false;
    }

    /**
     * Extract HTTP method from a REST template call
     */
    private static HttpMethod extractHttpMethod(MethodCallExpr methodCall) {
        String methodName = methodCall.getNameAsString();

        // Direct method name mapping
        switch (methodName) {
            case "getForObject":
            case "getForEntity":
            case "get":
                return HttpMethod.GET;
            case "postForObject":
            case "postForEntity":
            case "post":
                return HttpMethod.POST;
            case "put":
                return HttpMethod.PUT;
            case "delete":
                return HttpMethod.DELETE;
            case "patchForObject":
            case "patchForEntity":
            case "patch":
                return HttpMethod.PATCH;
            case "exchange":
                return extractHttpMethodFromExchangeCall(methodCall);
            case "retrieve": // WebClient method
            case "uri": // WebClient method
                return HttpMethod.GET; // default for WebClient
            default:
                return HttpMethod.GET; // default
        }
    }

    /**
     * Extract HTTP method from exchange() method call by analyzing arguments
     */
    private static HttpMethod extractHttpMethodFromExchangeCall(MethodCallExpr methodCall) {
        if (methodCall.getArguments().size() < 2) {
            return HttpMethod.GET; // default
        }

        // Check all arguments for HttpMethod (it could be in various positions)
        for (Expression arg : methodCall.getArguments()) {
            String argStr = arg.toString();
            if (argStr.contains("HttpMethod.POST")) {
                return HttpMethod.POST;
            } else if (argStr.contains("HttpMethod.PUT")) {
                return HttpMethod.PUT;
            } else if (argStr.contains("HttpMethod.DELETE")) {
                return HttpMethod.DELETE;
            } else if (argStr.contains("HttpMethod.PATCH")) {
                return HttpMethod.PATCH;
            } else if (argStr.contains("HttpMethod.GET")) {
                return HttpMethod.GET;
            }
        }

        return HttpMethod.GET; // default
    }

    /**
     * Extract endpoint URL from a REST template call.
     * Handles various URL construction patterns and normalizes path variables.
     */
    private static String extractEndpoint(MethodCallExpr methodCall) {
        if (methodCall.getArguments().isEmpty()) {
            return null;
        }

        // First argument is typically the URL
        Expression urlArg = methodCall.getArguments().get(0);

        // Handle simple string literal
        if (urlArg instanceof StringLiteralExpr) {
            String url = ((StringLiteralExpr) urlArg).asString();
            return cleanEndpoint(url);
        }

        // Handle binary expressions (concatenation with +)
        if (urlArg instanceof BinaryExpr) {
            return extractEndpointFromBinaryExpr((BinaryExpr) urlArg);
        }

        // Handle String.format("pattern", args...)
        if (urlArg instanceof MethodCallExpr) {
            MethodCallExpr methodCallArg = (MethodCallExpr) urlArg;
            if (isStringFormatCall(methodCallArg)) {
                return extractEndpointFromStringFormat(methodCallArg);
            }
            // Handle UriComponentsBuilder
            if (isUriComponentsBuilderCall(methodCallArg)) {
                return extractEndpointFromUriBuilder(methodCallArg);
            }
        }

        // Fallback: try to extract from string representation
        if (urlArg != null) {
            String urlStr = urlArg.toString();
            String extracted = extractEndpointFromString(urlStr);
            if (extracted != null) {
                return cleanEndpoint(extracted);
            }
        }

        // Last resort: return null for completely dynamic URLs
        return null;
    }

    /**
     * Extract endpoint from binary expression (e.g., url + "/path/" + variable).
     * Detects path variables and normalizes them to {paramName}.
     */
    private static String extractEndpointFromBinaryExpr(BinaryExpr binaryExpr) {
        List<UrlPart> parts = new ArrayList<>();
        collectUrlParts(binaryExpr, parts);

        // Build normalized endpoint from parts
        StringBuilder endpoint = new StringBuilder();
        for (int i = 0; i < parts.size(); i++) {
            UrlPart part = parts.get(i);

            if (part.isLiteral) {
                // Append literal part
                String literalValue = part.value;

                // Clean up the literal
                literalValue = literalValue.replaceAll("^https?://[^/]+", ""); // Remove protocol/host

                // Remove base URL variables (common patterns)
                if (isBaseUrlVariable(literalValue)) {
                    continue; // Skip base URL parts
                }

                endpoint.append(literalValue);
            } else {
                // This is a variable - determine if it's a path parameter or base URL
                String varName = part.value;

                // Check if this variable is a base URL variable (e.g., order_service_url, baseUrl)
                if (isBaseUrlVariableName(varName)) {
                    continue; // Skip base URL variables
                }

                // Check if we need a path separator before the variable
                boolean needsSlash = endpoint.length() > 0 &&
                                    !endpoint.toString().endsWith("/") &&
                                    !varName.startsWith("/");

                // Determine placeholder name from variable name
                String placeholder = inferPlaceholderName(varName);

                // Check if next part starts with "/" (variable is in the middle of path)
                boolean nextStartsWithSlash = (i + 1 < parts.size() &&
                                              parts.get(i + 1).isLiteral &&
                                              parts.get(i + 1).value.startsWith("/"));

                // If previous part ends with "/" or next starts with "/", this is a path param
                if (endpoint.toString().endsWith("/") || nextStartsWithSlash || needsSlash) {
                    if (needsSlash && !endpoint.toString().endsWith("/")) {
                        endpoint.append("/");
                    }
                    endpoint.append("{").append(placeholder).append("}");
                } else {
                    // Might be query param or other context - skip for now
                    // Could enhance to handle ?param=value cases
                }
            }
        }

        String result = endpoint.toString();
        return cleanEndpoint(result);
    }

    /**
     * Recursively collect URL parts from a binary expression tree.
     */
    private static void collectUrlParts(Expression expr, List<UrlPart> parts) {
        if (expr instanceof BinaryExpr) {
            BinaryExpr binExpr = (BinaryExpr) expr;
            // Process left side first (to maintain order)
            collectUrlParts(binExpr.getLeft(), parts);
            // Then right side
            collectUrlParts(binExpr.getRight(), parts);
        } else if (expr instanceof StringLiteralExpr) {
            // String literal
            String value = ((StringLiteralExpr) expr).asString();
            // Skip empty strings
            if (value != null && !value.trim().isEmpty()) {
                parts.add(new UrlPart(value, true));
            }
        } else if (expr instanceof NameExpr) {
            // Variable name
            String varName = ((NameExpr) expr).getNameAsString();
            parts.add(new UrlPart(varName, false));
        } else if (expr instanceof MethodCallExpr) {
            // Method call (e.g., getId(), toString(), getBaseUrl())
            MethodCallExpr methodCall = (MethodCallExpr) expr;
            String methodName = methodCall.getNameAsString();

            // Check if this is a base URL getter method
            if (isBaseUrlGetterMethod(methodName)) {
                // Skip base URL getter methods
                return;
            }

            // Try to infer variable name from method call
            String varName = inferVariableFromMethodCall(methodCall);
            parts.add(new UrlPart(varName, false));
        } else if (expr instanceof FieldAccessExpr) {
            // Field access (e.g., user.id, Constants.BASE_URL)
            FieldAccessExpr fieldAccess = (FieldAccessExpr) expr;
            String fieldName = fieldAccess.getNameAsString();

            // Check if accessing a constant field
            if (fieldAccess.getScope() instanceof NameExpr) {
                String scopeName = ((NameExpr) fieldAccess.getScope()).getNameAsString();
                // Check if it's a Constants class or similar
                if (scopeName.matches("^[A-Z][a-zA-Z]*$") &&
                    (scopeName.equals("Constants") || scopeName.equals("Config") ||
                     scopeName.endsWith("Constants") || scopeName.endsWith("Config"))) {
                    // This is likely a constant - check if it's a base URL
                    if (isBaseUrlVariableName(fieldName)) {
                        return; // Skip base URL constants
                    }
                }
            }

            parts.add(new UrlPart(fieldName, false));
        } else if (expr instanceof EnclosedExpr) {
            // Enclosed expression (parentheses)
            EnclosedExpr enclosed = (EnclosedExpr) expr;
            collectUrlParts(enclosed.getInner(), parts);
        } else if (expr instanceof ConditionalExpr) {
            // Ternary operator: condition ? thenExpr : elseExpr
            ConditionalExpr conditional = (ConditionalExpr) expr;
            // For URL construction, we can use the "then" part as the representative
            // In a more sophisticated implementation, we could create multiple endpoint variants
            collectUrlParts(conditional.getThenExpr(), parts);
        } else {
            // Unknown expression type - treat as variable
            String exprStr = expr.toString();
            // Don't add if it looks like a base URL
            if (!isBaseUrlVariableName(exprStr)) {
                parts.add(new UrlPart(exprStr, false));
            }
        }
    }

    /**
     * Check if a method name represents a base URL getter.
     * Examples: getBaseUrl(), getServiceUrl(), getEndpoint()
     */
    private static boolean isBaseUrlGetterMethod(String methodName) {
        String lower = methodName.toLowerCase();
        return lower.equals("getbaseurl") ||
               lower.equals("getserviceurl") ||
               lower.equals("geturl") ||
               lower.equals("geturi") ||
               lower.equals("getendpoint") ||
               lower.equals("gethost") ||
               lower.contains("baseurl") ||
               lower.contains("serviceurl");
    }

    /**
     * Extract endpoint from String.format("pattern", args...) calls.
     */
    private static String extractEndpointFromStringFormat(MethodCallExpr formatCall) {
        if (formatCall.getArguments().isEmpty()) {
            return null;
        }

        // First argument is the format string
        Expression formatArg = formatCall.getArguments().get(0);
        if (formatArg instanceof StringLiteralExpr) {
            String pattern = ((StringLiteralExpr) formatArg).asString();

            // Replace %s, %d, etc. with placeholders
            int placeholderIndex = 0;
            pattern = pattern.replaceAll("%s", "{arg" + (placeholderIndex++) + "}");
            pattern = pattern.replaceAll("%d", "{arg" + (placeholderIndex++) + "}");
            pattern = pattern.replaceAll("%[a-zA-Z]", "{arg" + (placeholderIndex++) + "}");

            // Try to infer better names from arguments
            if (formatCall.getArguments().size() > 1) {
                List<String> argNames = new ArrayList<>();
                for (int i = 1; i < formatCall.getArguments().size(); i++) {
                    Expression arg = formatCall.getArguments().get(i);
                    String argName = extractVariableName(arg);
                    argNames.add(argName);
                }

                // Replace generic placeholders with actual names
                for (int i = 0; i < argNames.size(); i++) {
                    pattern = pattern.replaceFirst("\\{arg" + i + "\\}", "{" + argNames.get(i) + "}");
                }
            }

            return cleanEndpoint(pattern);
        }

        return null;
    }

    /**
     * Extract endpoint from UriComponentsBuilder patterns.
     */
    private static String extractEndpointFromUriBuilder(MethodCallExpr builderCall) {
        // This is complex - simplified version for now
        String callStr = builderCall.toString();

        // Extract path patterns from builder
        Pattern pathPattern = Pattern.compile("\\.path\\([\"']([^\"']+)[\"']\\)");
        Matcher matcher = pathPattern.matcher(callStr);

        StringBuilder endpoint = new StringBuilder();
        while (matcher.find()) {
            endpoint.append(matcher.group(1));
        }

        // Extract path variables
        Pattern pathVarPattern = Pattern.compile("\\.pathVariable\\([\"']([^\"']+)[\"']");
        matcher = pathVarPattern.matcher(callStr);

        while (matcher.find()) {
            String varName = matcher.group(1);
            // Try to replace in endpoint if possible
            endpoint.append("/{").append(varName).append("}");
        }

        if (endpoint.length() > 0) {
            return cleanEndpoint(endpoint.toString());
        }

        return null;
    }

    /**
     * Check if a method call is String.format
     */
    private static boolean isStringFormatCall(MethodCallExpr methodCall) {
        return methodCall.getNameAsString().equals("format") &&
               methodCall.getScope().map(scope -> scope.toString().equals("String")).orElse(false);
    }

    /**
     * Check if a method call is UriComponentsBuilder
     */
    private static boolean isUriComponentsBuilderCall(MethodCallExpr methodCall) {
        String methodName = methodCall.getNameAsString();
        return methodName.equals("fromUriString") ||
               methodName.equals("fromHttpUrl") ||
               methodName.contains("UriComponents");
    }

    /**
     * Check if a string is likely a base URL literal value
     */
    private static boolean isBaseUrlVariable(String value) {
        if (value == null || value.trim().isEmpty()) {
            return true;
        }

        // Common base URL literal patterns
        String lower = value.toLowerCase();
        return lower.contains("http://") ||
               lower.contains("https://");
    }

    /**
     * Check if a variable name represents a base URL variable.
     * Examples: order_service_url, baseUrl, serviceUrl, service_url, AUTH_SERVICE_URI, etc.
     */
    private static boolean isBaseUrlVariableName(String varName) {
        if (varName == null || varName.isEmpty()) {
            return false;
        }

        String lower = varName.toLowerCase();

        // Check for ALL_CAPS constants (likely configuration constants)
        if (varName.matches("^[A-Z][A-Z0-9_]*$")) {
            // ALL_CAPS constant - likely a base URL if it contains service, url, uri, or endpoint
            return lower.contains("service") ||
                   lower.contains("url") ||
                   lower.contains("uri") ||
                   lower.contains("endpoint") ||
                   lower.contains("base") ||
                   lower.contains("host");
        }

        // Common base URL variable name patterns
        return lower.endsWith("_url") ||           // order_service_url, contact_service_url
               lower.endsWith("_uri") ||            // auth_service_uri
               lower.endsWith("url") ||             // baseUrl, serviceUrl, orderUrl
               lower.endsWith("uri") ||             // baseUri, serviceUri
               lower.endsWith("endpoint") ||        // serviceEndpoint
               lower.equals("base") ||              // base
               lower.equals("baseurl") ||           // baseurl
               lower.equals("serviceurl") ||        // serviceurl
               lower.equals("host") ||              // host
               lower.startsWith("base_") ||         // base_url, base_path
               lower.startsWith("service_url") ||   // service_url
               lower.startsWith("service_uri") ||   // service_uri
               lower.startsWith("service_base") ||  // service_base_url
               lower.startsWith("service_endpoint") || // service_endpoint
               lower.contains("_service_url") ||    // order_service_url, user_service_url
               lower.contains("_service_uri") ||    // order_service_uri
               lower.matches(".*service.*url.*") || // Any combination of service and url
               lower.matches(".*service.*uri.*") || // Any combination of service and uri
               lower.matches("^(http|https).*");    // Variables starting with http/https
    }

    /**
     * Infer placeholder name from variable name.
     * Examples: userId -> id, orderId -> id, customerId -> id
     */
    private static String inferPlaceholderName(String varName) {
        if (varName == null) {
            return "id";
        }

        String lower = varName.toLowerCase();

        // Common ID patterns
        if (lower.endsWith("id")) {
            // Extract the entity name before "id"
            String entity = varName.substring(0, varName.length() - 2);
            if (entity.isEmpty()) {
                return "id";
            }
            // Return just the entity name or "id" if it's a simple ID
            return lower.equals("id") ? "id" : entity.toLowerCase();
        }

        // If it's a getter method name, extract the field
        if (lower.startsWith("get")) {
            String field = varName.substring(3);
            if (!field.isEmpty()) {
                return Character.toLowerCase(field.charAt(0)) + field.substring(1);
            }
        }

        // Default: return as-is (lowercase)
        return varName.toLowerCase();
    }

    /**
     * Infer variable name from method call (e.g., getId() -> id)
     */
    private static String inferVariableFromMethodCall(MethodCallExpr methodCall) {
        String methodName = methodCall.getNameAsString();

        // Handle getter methods
        if (methodName.startsWith("get") && methodName.length() > 3) {
            String fieldName = methodName.substring(3);
            return Character.toLowerCase(fieldName.charAt(0)) + fieldName.substring(1);
        }

        // Handle toString()
        if (methodName.equals("toString")) {
            if (methodCall.getScope().isPresent()) {
                return extractVariableName(methodCall.getScope().get());
            }
            return "value";
        }

        // Default: use method name
        return methodName;
    }

    /**
     * Extract variable name from any expression
     */
    private static String extractVariableName(Expression expr) {
        if (expr instanceof NameExpr) {
            return ((NameExpr) expr).getNameAsString();
        } else if (expr instanceof MethodCallExpr) {
            return inferVariableFromMethodCall((MethodCallExpr) expr);
        } else if (expr instanceof FieldAccessExpr) {
            return ((FieldAccessExpr) expr).getNameAsString();
        } else {
            return "param";
        }
    }

    /**
     * Helper class to represent a part of a URL (either literal or variable)
     */
    private static class UrlPart {
        String value;
        boolean isLiteral;

        UrlPart(String value, boolean isLiteral) {
            this.value = value;
            this.isLiteral = isLiteral;
        }

        @Override
        public String toString() {
            return (isLiteral ? "'" : "") + value + (isLiteral ? "'" : "");
        }
    }

    /**
     * Extract target service name from various patterns
     */
    private static String extractTargetService(MethodCallExpr methodCall) {
        return extractTargetService(methodCall, null);
    }

    /**
     * Extract target service name from a REST template call.
     * This version accepts a variable-to-service map to resolve service names from variables.
     *
     * @param methodCall The REST template method call
     * @param variableToService Map of variable names to service names (can be null)
     * @return The target service name, or null if not found
     */
    private static String extractTargetService(MethodCallExpr methodCall, Map<String, String> variableToService) {
        // FIRST: Try to resolve service name from variable tracking (most reliable)
        // Check the RAW arguments (before URL extraction) for tracked variables
        if (variableToService != null && !variableToService.isEmpty()) {
            // For RestTemplate calls, the URL is typically the first argument
            // Check all arguments for any tracked variables
            for (Expression arg : methodCall.getArguments()) {
                for (Map.Entry<String, String> entry : variableToService.entrySet()) {
                    String varName = entry.getKey();
                    String serviceName = entry.getValue();

                    // Check if this variable is used in the URL argument
                    if (containsVariable(arg, varName)) {
                        // Found the variable in the URL - use its mapped service name
                        return serviceName;
                    }
                }
            }
        }

        // SECOND: Try to extract from variable name patterns
        // Example: order_service_url → ts-order-service
        if (methodCall.getArguments().size() > 0) {
            Expression urlArg = methodCall.getArguments().get(0);
            if (urlArg instanceof NameExpr) {
                String varName = ((NameExpr) urlArg).getNameAsString();
                String serviceFromVarName = extractServiceNameFromVariableName(varName);
                if (serviceFromVarName != null) {
                    return serviceFromVarName;
                }
            }
            // Also check binary expressions for variable names
            if (urlArg instanceof BinaryExpr) {
                String serviceFromBinary = extractServiceFromBinaryExprVarNames((BinaryExpr) urlArg);
                if (serviceFromBinary != null) {
                    return serviceFromBinary;
                }
            }
        }

        // THIRD: Try to extract from URL pattern (less reliable)
        String endpoint = extractEndpoint(methodCall);
        if (endpoint != null) {
            String service = extractServiceFromEndpoint(endpoint);
            if (service != null) {
                return service;
            }
        }

        // LAST RESORT: Try to extract from variable names or arguments using regex
        for (Expression arg : methodCall.getArguments()) {
            String argStr = arg.toString();
            Matcher matcher = SERVICE_NAME_PATTERN.matcher(argStr);
            if (matcher.find()) {
                String service = matcher.group(1);
                return service;
            }
        }

        return null;
    }

    /**
     * Check if an expression contains a reference to a specific variable.
     */
    private static boolean containsVariable(Expression expr, String varName) {
        if (expr == null) return false;

        String exprStr = expr.toString();
        // Simple check: does the expression string contain the variable name?
        // This handles cases like: varName, varName + "/path", etc.
        return exprStr.contains(varName);
    }

    /**
     * Extract service name from service discovery call
     */
    private static String extractServiceNameFromDiscovery(MethodCallExpr methodCall) {
        for (Expression arg : methodCall.getArguments()) {
            if (arg instanceof StringLiteralExpr) {
                String serviceName = ((StringLiteralExpr) arg).asString();
                if (serviceName.endsWith("-service") || serviceName.startsWith("ts-")) {
                    return serviceName;
                }
            }
        }

        // Fallback to pattern matching
        String callStr = methodCall.toString();
        Matcher matcher = SERVICE_URL_PATTERN.matcher(callStr);
        if (matcher.find()) {
            return matcher.group(1);
        }

        return null;
    }

    /**
     * Get the object name from a method call expression
     */
    private static String getObjectName(MethodCallExpr methodCall) {
        if (methodCall.getScope().isPresent()) {
            Expression scope = methodCall.getScope().get();
            if (scope instanceof NameExpr) {
                return ((NameExpr) scope).getNameAsString();
            }
            return scope.toString();
        }
        return null;
    }

    /**
     * Clean and normalize endpoint URL
     */
    private static String cleanEndpoint(String url) {
        if (url == null) return null;

        // Remove protocol and host (including port)
        url = url.replaceAll("^https?://[^/]+", "");

        // Normalize multiple consecutive slashes to single slash
        url = url.replaceAll("//+", "/");

        // Ensure it starts with /
        if (!url.startsWith("/") && !url.isEmpty()) {
            url = "/" + url;
        }

        // Extract path before query parameters (ignore query params for now)
        int queryIndex = url.indexOf('?');
        if (queryIndex > 0) {
            // In REST APIs, path is more important than query params for endpoint identification
            url = url.substring(0, queryIndex);
        }

        // Remove trailing slash (unless it's the root path "/")
        if (url.length() > 1 && url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }

        // Remove any remaining empty path segments
        url = url.replaceAll("/+$", "").replaceAll("^/+", "/");

        return url;
    }

    /**
     * Extract service name from endpoint path
     */
    private static String extractServiceFromEndpoint(String endpoint) {
        if (endpoint == null) return null;

        // Pattern: /api/v1/orderservice/... -> orderservice
        Pattern servicePattern = Pattern.compile("/api/v\\d+/([a-zA-Z]+)(?:service|Service)");
        Matcher matcher = servicePattern.matcher(endpoint);
        if (matcher.find()) {
            return "ts-" + matcher.group(1).toLowerCase() + "-service";
        }

        // Pattern: /orderOtherService/... -> order-other-service
        Pattern camelCasePattern = Pattern.compile("/([a-zA-Z]+(?:Service|service))");
        matcher = camelCasePattern.matcher(endpoint);
        if (matcher.find()) {
            String serviceName = matcher.group(1)
                .replaceAll("Service$", "")
                .replaceAll("service$", "");
            return "ts-" + camelCaseToKebab(serviceName) + "-service";
        }

        return null;
    }

    /**
     * Extract endpoint from string representation
     */
    private static String extractEndpointFromString(String str) {
        Matcher matcher = ENDPOINT_PATTERN.matcher(str);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return null;
    }

    /**
     * Convert camelCase to kebab-case
     */
    private static String camelCaseToKebab(String camelCase) {
        return camelCase.replaceAll("([a-z])([A-Z])", "$1-$2").toLowerCase();
    }

    /**
     * Extract service name from variable name patterns.
     * Examples:
     *   - order_service_url → ts-order-service
     *   - userServiceUrl → ts-user-service
     *   - contactService → ts-contact-service
     *   - ts_auth_service_uri → ts-auth-service
     *
     * @param varName The variable name
     * @return The extracted service name, or null if no pattern matches
     */
    private static String extractServiceNameFromVariableName(String varName) {
        if (varName == null || varName.isEmpty()) {
            return null;
        }

        String lower = varName.toLowerCase();

        // Remove common suffixes (_url, _uri, _endpoint, Url, Uri, Endpoint)
        lower = lower.replaceAll("(_url|_uri|_endpoint|url|uri|endpoint)$", "");

        // Check if the variable name contains "service" pattern
        if (lower.contains("service")) {
            // Convert camelCase/snake_case to words
            // Examples: orderService → order service, order_service → order service
            String servicePart = lower
                .replaceAll("_", " ")  // Replace underscores with spaces
                .replaceAll("([a-z])([A-Z])", "$1 $2")  // Split camelCase
                .toLowerCase()
                .trim();

            // Extract service name (everything before "service" or including "service")
            // Examples: "order service" → "order", "auth service" → "auth"
            if (servicePart.contains(" service")) {
                String[] parts = servicePart.split(" service");
                if (parts.length > 0 && !parts[0].isEmpty()) {
                    String serviceName = parts[0].trim();
                    // Remove common prefixes like "ts" if already present
                    serviceName = serviceName.replaceFirst("^ts\\s+", "");
                    // Convert to ts- format
                    return "ts-" + serviceName.replace(" ", "-") + "-service";
                }
            } else if (servicePart.endsWith("service")) {
                // Variable is just "service" - not specific enough
                return null;
            }
        }

        return null;
    }

    /**
     * Extract service name from variable names in a binary expression.
     * Recursively searches for variable names that might contain service information.
     *
     * @param binaryExpr The binary expression to search
     * @return The extracted service name, or null if none found
     */
    private static String extractServiceFromBinaryExprVarNames(BinaryExpr binaryExpr) {
        if (binaryExpr == null) {
            return null;
        }

        // Check left side
        Expression left = binaryExpr.getLeft();
        if (left instanceof NameExpr) {
            String varName = ((NameExpr) left).getNameAsString();
            String service = extractServiceNameFromVariableName(varName);
            if (service != null) {
                return service;
            }
        } else if (left instanceof BinaryExpr) {
            String service = extractServiceFromBinaryExprVarNames((BinaryExpr) left);
            if (service != null) {
                return service;
            }
        }

        // Check right side
        Expression right = binaryExpr.getRight();
        if (right instanceof NameExpr) {
            String varName = ((NameExpr) right).getNameAsString();
            String service = extractServiceNameFromVariableName(varName);
            if (service != null) {
                return service;
            }
        } else if (right instanceof BinaryExpr) {
            String service = extractServiceFromBinaryExprVarNames((BinaryExpr) right);
            if (service != null) {
                return service;
            }
        }

        return null;
    }

    /**
     * Result of remote call analysis
     */
    public static class RemoteCallAnalysis {
        public boolean isRemoteCall = false;
        public boolean isServiceDiscovery = false;
        public boolean isAsync = false;
        public MethodCallInfo.CallType callType;
        public String objectType;
        public String targetService;
        public String endpoint;
        public HttpMethod httpMethod;
        public String serviceDiscoveryPattern;

        /**
         * Create MethodCallInfo from this analysis
         */
        public MethodCallInfo toMethodCallInfo() {
            if (isRemoteCall) {
                MethodCallInfo info = MethodCallInfo.createRemoteCall(targetService, endpoint, httpMethod, objectType);
                info.setIsAsync(isAsync);
                return info;
            } else if (isServiceDiscovery) {
                return MethodCallInfo.createServiceDiscoveryCall(targetService, serviceDiscoveryPattern, objectType);
            } else {
                return MethodCallInfo.createUnresolved(objectType);
            }
        }
    }
}