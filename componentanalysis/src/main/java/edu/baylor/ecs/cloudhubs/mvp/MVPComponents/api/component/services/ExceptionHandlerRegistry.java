package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.MemberValuePair;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
import com.github.javaparser.ast.type.ClassOrInterfaceType;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Registry for mapping exception types to HTTP status codes from @ExceptionHandler and @ControllerAdvice.
 * Scans controller advice classes and exception class definitions to build a comprehensive mapping.
 */
public class ExceptionHandlerRegistry {

    /**
     * Map of exception type names to HTTP status codes
     */
    private final Map<String, Integer> exceptionToStatusCode;

    /**
     * Map of exception type names to response types
     */
    private final Map<String, String> exceptionToResponseType;

    public ExceptionHandlerRegistry() {
        this.exceptionToStatusCode = new HashMap<>();
        this.exceptionToResponseType = new HashMap<>();
    }

    /**
     * Scan a compilation unit for @ControllerAdvice classes and register exception handlers
     */
    public void scanControllerAdvice(CompilationUnit cu) {
        for (ClassOrInterfaceDeclaration classDecl : cu.findAll(ClassOrInterfaceDeclaration.class)) {
            // Check if class has @ControllerAdvice annotation
            if (hasAnnotation(classDecl, "ControllerAdvice") || hasAnnotation(classDecl, "RestControllerAdvice")) {
                scanExceptionHandlers(classDecl);
            }
        }
    }

    /**
     * Scan a class for @ExceptionHandler methods
     */
    private void scanExceptionHandlers(ClassOrInterfaceDeclaration classDecl) {
        for (MethodDeclaration method : classDecl.getMethods()) {
            Optional<AnnotationExpr> exceptionHandlerAnnotation = method.getAnnotationByName("ExceptionHandler");

            if (exceptionHandlerAnnotation.isPresent()) {
                // Extract exception types handled by this method
                String[] exceptionTypes = extractExceptionTypes(exceptionHandlerAnnotation.get(), method);

                // Extract HTTP status code from @ResponseStatus
                Integer statusCode = extractResponseStatus(method);

                // Extract response type from method return type
                String responseType = method.getTypeAsString();

                // Register each exception type
                for (String exceptionType : exceptionTypes) {
                    if (statusCode != null) {
                        exceptionToStatusCode.put(exceptionType, statusCode);
                    }
                    if (responseType != null && !responseType.equals("void")) {
                        exceptionToResponseType.put(exceptionType, responseType);
                    }
                }
            }
        }
    }

    /**
     * Extract exception types from @ExceptionHandler annotation
     */
    private String[] extractExceptionTypes(AnnotationExpr annotation, MethodDeclaration method) {
        // Try to get from annotation value
        if (annotation instanceof SingleMemberAnnotationExpr) {
            String value = ((SingleMemberAnnotationExpr) annotation).getMemberValue().toString();
            // Parse array or single class reference
            return parseExceptionClasses(value);
        } else if (annotation instanceof NormalAnnotationExpr) {
            for (MemberValuePair pair : ((NormalAnnotationExpr) annotation).getPairs()) {
                if ("value".equals(pair.getNameAsString()) || "classes".equals(pair.getNameAsString())) {
                    return parseExceptionClasses(pair.getValue().toString());
                }
            }
        }

        // Fallback: extract from method parameter
        if (!method.getParameters().isEmpty()) {
            String paramType = method.getParameter(0).getTypeAsString();
            return new String[]{paramType};
        }

        return new String[0];
    }

    /**
     * Parse exception class references from annotation value
     */
    private String[] parseExceptionClasses(String value) {
        // Remove curly braces and split by comma
        value = value.replaceAll("[{}]", "").trim();

        // Handle class references like OrderNotFoundException.class
        String[] parts = value.split(",");
        String[] exceptionTypes = new String[parts.length];

        for (int i = 0; i < parts.length; i++) {
            String part = parts[i].trim();
            // Remove .class suffix
            if (part.endsWith(".class")) {
                part = part.substring(0, part.length() - 6);
            }
            exceptionTypes[i] = part;
        }

        return exceptionTypes;
    }

    /**
     * Extract HTTP status code from @ResponseStatus annotation
     */
    private Integer extractResponseStatus(MethodDeclaration method) {
        Optional<AnnotationExpr> responseStatus = method.getAnnotationByName("ResponseStatus");

        if (responseStatus.isPresent()) {
            return parseResponseStatus(responseStatus.get());
        }

        return null;
    }

    /**
     * Scan exception class definitions for @ResponseStatus annotations
     */
    public void scanExceptionClass(CompilationUnit cu) {
        for (ClassOrInterfaceDeclaration classDecl : cu.findAll(ClassOrInterfaceDeclaration.class)) {
            // Check if this is an exception class
            if (isExceptionClass(classDecl)) {
                Optional<AnnotationExpr> responseStatus = classDecl.getAnnotationByName("ResponseStatus");

                if (responseStatus.isPresent()) {
                    Integer statusCode = parseResponseStatus(responseStatus.get());
                    if (statusCode != null) {
                        String exceptionType = classDecl.getNameAsString();
                        exceptionToStatusCode.put(exceptionType, statusCode);
                    }
                }
            }
        }
    }

    /**
     * Check if a class is an exception class
     */
    private boolean isExceptionClass(ClassOrInterfaceDeclaration classDecl) {
        // Check if extends Exception, RuntimeException, or Throwable
        for (ClassOrInterfaceType extendedType : classDecl.getExtendedTypes()) {
            String typeName = extendedType.getNameAsString();
            if (typeName.equals("Exception") || typeName.equals("RuntimeException") ||
                typeName.equals("Throwable") || typeName.endsWith("Exception")) {
                return true;
            }
        }
        return false;
    }

    /**
     * Parse @ResponseStatus annotation to extract HTTP status code
     */
    private Integer parseResponseStatus(AnnotationExpr annotation) {
        if (annotation instanceof SingleMemberAnnotationExpr) {
            String value = ((SingleMemberAnnotationExpr) annotation).getMemberValue().toString();
            return parseHttpStatus(value);
        } else if (annotation instanceof NormalAnnotationExpr) {
            for (MemberValuePair pair : ((NormalAnnotationExpr) annotation).getPairs()) {
                if ("value".equals(pair.getNameAsString()) || "code".equals(pair.getNameAsString())) {
                    return parseHttpStatus(pair.getValue().toString());
                }
            }
        }
        return null;
    }

    /**
     * Parse HttpStatus enum value to integer status code
     */
    private Integer parseHttpStatus(String value) {
        // Handle HttpStatus enum values like HttpStatus.NOT_FOUND
        if (value.contains("HttpStatus.")) {
            String statusName = value.substring(value.lastIndexOf('.') + 1);
            return mapHttpStatusToCode(statusName);
        }

        // Handle direct integer values
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * Map HttpStatus enum name to integer code
     */
    private Integer mapHttpStatusToCode(String statusName) {
        switch (statusName) {
            // 2xx Success
            case "OK": return 200;
            case "CREATED": return 201;
            case "ACCEPTED": return 202;
            case "NO_CONTENT": return 204;

            // 3xx Redirection
            case "MOVED_PERMANENTLY": return 301;
            case "FOUND": return 302;
            case "SEE_OTHER": return 303;
            case "NOT_MODIFIED": return 304;

            // 4xx Client Errors
            case "BAD_REQUEST": return 400;
            case "UNAUTHORIZED": return 401;
            case "FORBIDDEN": return 403;
            case "NOT_FOUND": return 404;
            case "METHOD_NOT_ALLOWED": return 405;
            case "CONFLICT": return 409;
            case "UNPROCESSABLE_ENTITY": return 422;

            // 5xx Server Errors
            case "INTERNAL_SERVER_ERROR": return 500;
            case "NOT_IMPLEMENTED": return 501;
            case "BAD_GATEWAY": return 502;
            case "SERVICE_UNAVAILABLE": return 503;

            default: return null;
        }
    }

    /**
     * Check if an entity has a specific annotation
     */
    private boolean hasAnnotation(ClassOrInterfaceDeclaration classDecl, String annotationName) {
        return classDecl.getAnnotationByName(annotationName).isPresent();
    }

    /**
     * Get HTTP status code for a given exception type
     */
    public Integer getStatusCode(String exceptionType) {
        // Try exact match
        if (exceptionToStatusCode.containsKey(exceptionType)) {
            return exceptionToStatusCode.get(exceptionType);
        }

        // Try simple class name (without package)
        String simpleClassName = exceptionType.contains(".") ?
            exceptionType.substring(exceptionType.lastIndexOf('.') + 1) : exceptionType;

        return exceptionToStatusCode.get(simpleClassName);
    }

    /**
     * Get response type for a given exception type
     */
    public String getResponseType(String exceptionType) {
        // Try exact match
        if (exceptionToResponseType.containsKey(exceptionType)) {
            return exceptionToResponseType.get(exceptionType);
        }

        // Try simple class name (without package)
        String simpleClassName = exceptionType.contains(".") ?
            exceptionType.substring(exceptionType.lastIndexOf('.') + 1) : exceptionType;

        return exceptionToResponseType.get(simpleClassName);
    }

    /**
     * Get all registered exception mappings
     */
    public Map<String, Integer> getAllExceptionMappings() {
        return new HashMap<>(exceptionToStatusCode);
    }

    /**
     * Clear all registered mappings
     */
    public void clear() {
        exceptionToStatusCode.clear();
        exceptionToResponseType.clear();
    }

    /**
     * Get number of registered exception handlers
     */
    public int size() {
        return exceptionToStatusCode.size();
    }
}
