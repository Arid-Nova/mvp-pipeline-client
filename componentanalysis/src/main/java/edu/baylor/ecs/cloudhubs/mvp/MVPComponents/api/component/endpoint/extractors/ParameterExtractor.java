package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.ParameterDetail;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.ValidationConstraint;
import edu.university.ecs.lab.common.models.ir.Annotation;
import edu.university.ecs.lab.common.models.ir.Method;
import edu.university.ecs.lab.common.models.ir.Parameter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Utility for extracting parameter details from REST endpoint methods.
 *
 * <p>This extractor handles three types of parameters commonly found in Spring REST endpoints:
 * <ul>
 *   <li><b>Path Parameters</b> - Parameters in the URL path (e.g., /users/{id})</li>
 *   <li><b>Query Parameters</b> - Parameters passed as query strings (e.g., ?page=1&size=10)</li>
 *   <li><b>Request Body</b> - Complex objects sent in the request body (typically JSON)</li>
 * </ul>
 *
 * <p>The extractor also handles validation constraints (e.g., @NotNull, @Size, @Pattern)
 * for each parameter.
 *
 * @author Claude Code Refactoring
 * @version 2.0
 */
public class ParameterExtractor {

    private static final Pattern URI_PARAM_PATTERN = Pattern.compile("\\{([^}]+)\\}");

    /**
     * Extracts detailed path parameter information from a method.
     *
     * <p>Path parameters are identified by the @PathVariable annotation and must
     * match placeholders in the URI template (e.g., {id}, {userId}).
     *
     * @param method The method to analyze
     * @param uri The URI template containing path variable placeholders
     * @return List of path parameter details with validation constraints
     */
    public List<ParameterDetail> extractPathParameters(Method method, String uri) {
        return extractPathParameters(method, uri, null);
    }

    /**
     * Extracts detailed path parameter information from a method with fallback parameter names.
     *
     * <p>Path parameters are identified by the @PathVariable annotation and must
     * match placeholders in the URI template (e.g., {id}, {userId}).
     *
     * <p>Handles several edge cases:
     * <ul>
     *   <li>Parameter name matches URL placeholder exactly</li>
     *   <li>URL has {?} placeholders (simplified) - uses originalParamNames or position</li>
     *   <li>Parameter name doesn't match URL placeholder (developer mismatch) - uses URL name</li>
     * </ul>
     *
     * @param method The method to analyze
     * @param uri The URI template containing path variable placeholders
     * @param originalParamNames Optional list of original parameter names for fallback matching
     * @return List of path parameter details with validation constraints
     */
    public List<ParameterDetail> extractPathParameters(Method method, String uri, List<String> originalParamNames) {
        List<ParameterDetail> details = new ArrayList<>();

        // Extract parameter names from URI (parameters in curly braces)
        List<String> uriParams = extractUriParameterNames(uri);

        // Count {?} placeholders for position-based matching
        int questionMarkCount = countQuestionMarkPlaceholders(uri);
        boolean hasQuestionMarks = questionMarkCount > 0;

        // Count actual named params (not {?}) for position-based matching
        int namedParamCount = (int) uriParams.stream().filter(p -> !"?".equals(p)).count();

        // Find method parameters with @PathVariable annotation
        int position = 0;
        int pathVarIndex = 0;
        for (Parameter parameter : method.getParameters()) {
            if (hasPathVariableAnnotation(parameter)) {
                String paramName = getPathVariableName(parameter);
                if (paramName == null) {
                    paramName = parameter.getName();
                }

                // Check if this parameter name exists in the URI
                boolean shouldInclude = uriParams.contains(paramName);
                String finalParamName = paramName;

                // Fallback 1: If URI has {?} placeholders, use originalParamNames list
                if (!shouldInclude && hasQuestionMarks && originalParamNames != null && pathVarIndex < originalParamNames.size()) {
                    // Use the original param name from the list
                    finalParamName = originalParamNames.get(pathVarIndex);
                    shouldInclude = true;
                }

                // Fallback 2: If still no match but has {?} placeholders, match by position
                if (!shouldInclude && hasQuestionMarks && pathVarIndex < questionMarkCount) {
                    shouldInclude = true;
                }

                // Fallback 3: If URL has named params but @PathVariable name doesn't match,
                // use the URL's param name at this position (handles developer mismatches)
                if (!shouldInclude && !hasQuestionMarks && pathVarIndex < namedParamCount) {
                    // Use the URL's parameter name instead of the method parameter name
                    finalParamName = uriParams.get(pathVarIndex);
                    shouldInclude = true;
                }

                if (shouldInclude) {
                    ParameterDetail detail = createParameterDetail(
                        parameter, finalParamName, position, true, null
                    );
                    details.add(detail);
                    pathVarIndex++;
                }
            }
            position++;
        }

        return details;
    }

    /**
     * Counts the number of {?} placeholders in the URI.
     *
     * @param uri The URI to analyze
     * @return Number of {?} placeholders
     */
    private int countQuestionMarkPlaceholders(String uri) {
        if (uri == null) return 0;
        int count = 0;
        int index = 0;
        while ((index = uri.indexOf("{?}", index)) != -1) {
            count++;
            index += 3;
        }
        return count;
    }

    /**
     * Extracts detailed query parameter information from a method.
     *
     * <p>Query parameters are identified by the @RequestParam annotation and
     * can optionally specify required status and default values.
     *
     * @param method The method to analyze
     * @return List of query parameter details with validation constraints
     */
    public List<ParameterDetail> extractQueryParameters(Method method) {
        List<ParameterDetail> details = new ArrayList<>();

        int position = 0;
        for (Parameter parameter : method.getParameters()) {
            if (hasRequestParamAnnotation(parameter)) {
                String paramName = getRequestParamName(parameter);
                boolean required = getRequestParamRequired(parameter);
                String defaultValue = getRequestParamDefaultValue(parameter);

                ParameterDetail detail = createParameterDetail(
                    parameter, paramName, position, required, defaultValue
                );
                details.add(detail);
            }
            position++;
        }

        return details;
    }

    /**
     * Extracts detailed request body parameter information from a method.
     *
     * <p>Request body is identified by the @RequestBody annotation and typically
     * represents a complex object (DTO) sent as JSON in the request body.
     *
     * @param method The method to analyze
     * @return ParameterDetail for request body, or null if none exists
     */
    public ParameterDetail extractRequestBody(Method method) {
        int position = 0;
        for (Parameter parameter : method.getParameters()) {
            if (hasRequestBodyAnnotation(parameter)) {
                String paramName = parameter.getName();
                ParameterDetail detail = createParameterDetail(
                    parameter, paramName, position, true, null
                );
                return detail;
            }
            position++;
        }
        return null;
    }

    /**
     * Extracts parameter names from URI template.
     *
     * @param uri URI template (e.g., "/users/{id}/orders/{orderId}")
     * @return List of parameter names (e.g., ["id", "orderId"])
     */
    private List<String> extractUriParameterNames(String uri) {
        List<String> params = new ArrayList<>();
        if (uri != null) {
            Matcher matcher = URI_PARAM_PATTERN.matcher(uri);
            while (matcher.find()) {
                params.add(matcher.group(1));
            }
        }
        return params;
    }

    /**
     * Creates a ParameterDetail object from a Parameter.
     *
     * @param parameter The IR parameter
     * @param paramName The parameter name
     * @param position The position in the parameter list
     * @param required Whether the parameter is required
     * @param defaultValue The default value (if any)
     * @return Complete ParameterDetail object
     */
    private ParameterDetail createParameterDetail(Parameter parameter, String paramName,
                                                  int position, boolean required,
                                                  String defaultValue) {
        ParameterDetail detail = new ParameterDetail();
        detail.setName(paramName);
        detail.setType(getSimpleTypeName(parameter.getParameterType()));
        detail.setJavaType(parameter.getParameterType());
        detail.setRequired(required);
        detail.setDefaultValue(defaultValue);
        detail.setAnnotations(extractAnnotationNames(parameter));
        detail.setPosition(position);

        // Extract validation constraints
        List<ValidationConstraint> validationConstraints = extractValidationConstraints(parameter, paramName);
        detail.setValidationConstraints(validationConstraints);

        return detail;
    }

    /**
     * Extracts validation constraints from a parameter's annotations.
     *
     * <p>Supported validation annotations include:
     * <ul>
     *   <li>@NotNull, @NotEmpty, @NotBlank</li>
     *   <li>@Size(min=x, max=y)</li>
     *   <li>@Min(x), @Max(x)</li>
     *   <li>@Pattern(regexp="...")</li>
     *   <li>@Email, @Positive, @Negative</li>
     * </ul>
     *
     * @param parameter The parameter to extract constraints from
     * @param paramName The parameter name
     * @return List of validation constraints
     */
    private List<ValidationConstraint> extractValidationConstraints(Parameter parameter, String paramName) {
        List<ValidationConstraint> constraints = new ArrayList<>();

        for (Annotation annotation : parameter.getAnnotations()) {
            String annotationName = annotation.getName();
            ValidationConstraint constraint = null;

            switch (annotationName) {
                case "NotNull":
                    constraint = createSimpleConstraint("NotNull", "Must not be null");
                    break;
                case "NotEmpty":
                    constraint = createSimpleConstraint("NotEmpty", "Must not be empty");
                    break;
                case "NotBlank":
                    constraint = createSimpleConstraint("NotBlank", "Must not be blank");
                    break;
                case "Size":
                    constraint = extractSizeConstraint(annotation);
                    break;
                case "Min":
                    constraint = extractMinConstraint(annotation);
                    break;
                case "Max":
                    constraint = extractMaxConstraint(annotation);
                    break;
                case "Pattern":
                    constraint = extractPatternConstraint(annotation);
                    break;
                case "Email":
                    constraint = createSimpleConstraint("Email", "Must be a valid email address");
                    break;
                case "Positive":
                    constraint = createSimpleConstraint("Positive", "Must be positive");
                    break;
                case "Negative":
                    constraint = createSimpleConstraint("Negative", "Must be negative");
                    break;
            }

            if (constraint != null) {
                constraints.add(constraint);
            }
        }

        return constraints;
    }

    /**
     * Helper method to create a simple ValidationConstraint.
     */
    private ValidationConstraint createSimpleConstraint(String type, String message) {
        ValidationConstraint constraint = new ValidationConstraint();
        constraint.setConstraintType(type);
        constraint.setMessage(message);
        return constraint;
    }

    /**
     * Helper method to create a ValidationConstraint with attributes.
     */
    private ValidationConstraint createConstraintWithAttributes(String type, String message,
                                                                Map<String, String> attributes) {
        ValidationConstraint constraint = new ValidationConstraint();
        constraint.setConstraintType(type);
        constraint.setMessage(message);
        if (attributes != null) {
            Map<String, Object> attrMap = new HashMap<>(attributes);
            constraint.setAttributes(attrMap);
        }
        return constraint;
    }

    /**
     * Extracts @Size constraint with min/max attributes.
     */
    private ValidationConstraint extractSizeConstraint(Annotation annotation) {
        var attributes = annotation.getAttributes();
        if (attributes != null) {
            String min = attributes.get("min");
            String max = attributes.get("max");
            String message = String.format("Size must be between %s and %s",
                                         min != null ? min : "0",
                                         max != null ? max : "∞");
            return createConstraintWithAttributes("Size", message, attributes);
        }
        return createSimpleConstraint("Size", "Size constraint");
    }

    /**
     * Extracts @Min constraint with value attribute.
     */
    private ValidationConstraint extractMinConstraint(Annotation annotation) {
        var attributes = annotation.getAttributes();
        if (attributes != null && attributes.containsKey("value")) {
            String value = attributes.get("value");
            String message = String.format("Must be at least %s", value);
            return createConstraintWithAttributes("Min", message, attributes);
        }
        return createSimpleConstraint("Min", "Minimum value constraint");
    }

    /**
     * Extracts @Max constraint with value attribute.
     */
    private ValidationConstraint extractMaxConstraint(Annotation annotation) {
        var attributes = annotation.getAttributes();
        if (attributes != null && attributes.containsKey("value")) {
            String value = attributes.get("value");
            String message = String.format("Must be at most %s", value);
            return createConstraintWithAttributes("Max", message, attributes);
        }
        return createSimpleConstraint("Max", "Maximum value constraint");
    }

    /**
     * Extracts @Pattern constraint with regexp attribute.
     */
    private ValidationConstraint extractPatternConstraint(Annotation annotation) {
        var attributes = annotation.getAttributes();
        if (attributes != null && attributes.containsKey("regexp")) {
            String regexp = attributes.get("regexp");
            String message = String.format("Must match pattern: %s", regexp);
            return createConstraintWithAttributes("Pattern", message, attributes);
        }
        return createSimpleConstraint("Pattern", "Pattern constraint");
    }

    /**
     * Extracts annotation names from a parameter.
     */
    private List<String> extractAnnotationNames(Parameter parameter) {
        List<String> names = new ArrayList<>();
        for (Annotation annotation : parameter.getAnnotations()) {
            names.add(annotation.getName());
        }
        return names;
    }

    /**
     * Gets the simple type name from a fully qualified type.
     *
     * @param fullyQualifiedType The fully qualified type name
     * @return Simple type name (e.g., "String" from "java.lang.String")
     */
    private String getSimpleTypeName(String fullyQualifiedType) {
        if (fullyQualifiedType == null) {
            return "Object";
        }

        // Handle generics
        if (fullyQualifiedType.contains("<")) {
            fullyQualifiedType = fullyQualifiedType.substring(0, fullyQualifiedType.indexOf("<"));
        }

        // Get simple name
        int lastDot = fullyQualifiedType.lastIndexOf('.');
        if (lastDot >= 0) {
            return fullyQualifiedType.substring(lastDot + 1);
        }

        return fullyQualifiedType;
    }

    // ============== ANNOTATION CHECKERS ==============

    /**
     * Checks if parameter has @PathVariable annotation.
     */
    private boolean hasPathVariableAnnotation(Parameter parameter) {
        return parameter.getAnnotations().stream()
            .anyMatch(ann -> "PathVariable".equals(ann.getName()) ||
                           ann.getName().endsWith("PathVariable"));
    }

    /**
     * Checks if parameter has @RequestParam annotation.
     */
    private boolean hasRequestParamAnnotation(Parameter parameter) {
        return parameter.getAnnotations().stream()
            .anyMatch(ann -> "RequestParam".equals(ann.getName()) ||
                           ann.getName().endsWith("RequestParam"));
    }

    /**
     * Checks if parameter has @RequestBody annotation.
     */
    private boolean hasRequestBodyAnnotation(Parameter parameter) {
        return parameter.getAnnotations().stream()
            .anyMatch(ann -> "RequestBody".equals(ann.getName()) ||
                           ann.getName().endsWith("RequestBody"));
    }

    // ============== ANNOTATION ATTRIBUTE EXTRACTORS ==============

    /**
     * Extracts path variable name from @PathVariable annotation.
     */
    private String getPathVariableName(Parameter parameter) {
        return parameter.getAnnotations().stream()
            .filter(ann -> "PathVariable".equals(ann.getName()) ||
                         ann.getName().endsWith("PathVariable"))
            .findFirst()
            .map(ann -> {
                var attributes = ann.getAttributes();
                if (attributes != null && attributes.containsKey("value")) {
                    return attributes.get("value").replace("\"", "");
                }
                if (attributes != null && attributes.containsKey("name")) {
                    return attributes.get("name").replace("\"", "");
                }
                return null;
            })
            .orElse(null);
    }

    /**
     * Extracts request param name from @RequestParam annotation.
     */
    private String getRequestParamName(Parameter parameter) {
        String annotationValue = parameter.getAnnotations().stream()
            .filter(ann -> "RequestParam".equals(ann.getName()) ||
                         ann.getName().endsWith("RequestParam"))
            .findFirst()
            .map(ann -> {
                var attributes = ann.getAttributes();
                if (attributes != null && attributes.containsKey("value")) {
                    return attributes.get("value").replace("\"", "");
                }
                if (attributes != null && attributes.containsKey("name")) {
                    return attributes.get("name").replace("\"", "");
                }
                return null;
            })
            .orElse(null);

        return annotationValue != null ? annotationValue : parameter.getName();
    }

    /**
     * Extracts required attribute from @RequestParam annotation.
     */
    private boolean getRequestParamRequired(Parameter parameter) {
        return parameter.getAnnotations().stream()
            .filter(ann -> "RequestParam".equals(ann.getName()) ||
                         ann.getName().endsWith("RequestParam"))
            .findFirst()
            .map(ann -> {
                var attributes = ann.getAttributes();
                if (attributes != null && attributes.containsKey("required")) {
                    String required = attributes.get("required");
                    return !"false".equalsIgnoreCase(required);
                }
                return true; // Default is true
            })
            .orElse(true);
    }

    /**
     * Extracts defaultValue attribute from @RequestParam annotation.
     */
    private String getRequestParamDefaultValue(Parameter parameter) {
        return parameter.getAnnotations().stream()
            .filter(ann -> "RequestParam".equals(ann.getName()) ||
                         ann.getName().endsWith("RequestParam"))
            .findFirst()
            .map(ann -> {
                var attributes = ann.getAttributes();
                if (attributes != null && attributes.containsKey("defaultValue")) {
                    return attributes.get("defaultValue").replace("\"", "");
                }
                return null;
            })
            .orElse(null);
    }
}
