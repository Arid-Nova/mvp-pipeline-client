package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors;

import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.MemberValuePair;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.ValidationConstraint;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Set;

/**
 * Extracts validation constraints from JSR-303/JSR-380 validation annotations.
 */
public class ValidationExtractor {

    /**
     * Common validation annotations to extract
     */
    private static final Set<String> VALIDATION_ANNOTATIONS = Set.of(
        "NotNull", "NotBlank", "NotEmpty", "Null",
        "Size", "Min", "Max", "DecimalMin", "DecimalMax",
        "Digits", "Pattern", "Email",
        "Positive", "PositiveOrZero", "Negative", "NegativeOrZero",
        "Past", "PastOrPresent", "Future", "FutureOrPresent",
        "Valid", "Validated",
        "AssertTrue", "AssertFalse"
    );

    /**
     * Extract validation constraints from a parameter
     */
    public static List<ValidationConstraint> extractValidationConstraints(Parameter parameter) {
        List<ValidationConstraint> constraints = new ArrayList<>();

        for (AnnotationExpr annotation : parameter.getAnnotations()) {
            String annotationName = getSimpleAnnotationName(annotation);

            if (VALIDATION_ANNOTATIONS.contains(annotationName)) {
                ValidationConstraint constraint = extractConstraint(annotation, annotationName);
                if (constraint != null) {
                    constraints.add(constraint);
                }
            }
        }

        return constraints;
    }

    /**
     * Extract a single constraint from an annotation
     */
    private static ValidationConstraint extractConstraint(AnnotationExpr annotation, String constraintType) {
        ValidationConstraint constraint = new ValidationConstraint();
        constraint.setConstraintType(constraintType);
        constraint.setAttributes(new HashMap<>());

        // Check for cascaded validation
        if (constraintType.equals("Valid") || constraintType.equals("Validated")) {
            constraint.setCascaded(true);
        }

        // Extract annotation attributes
        if (annotation instanceof NormalAnnotationExpr) {
            // Annotation with named parameters: @Size(min=3, max=50)
            NormalAnnotationExpr normalAnnotation = (NormalAnnotationExpr) annotation;
            for (MemberValuePair pair : normalAnnotation.getPairs()) {
                String name = pair.getNameAsString();
                String value = pair.getValue().toString();

                if (name.equals("message")) {
                    constraint.setMessage(cleanStringLiteral(value));
                } else if (name.equals("groups")) {
                    constraint.setGroups(extractGroups(value));
                } else {
                    constraint.addAttribute(name, parseAttributeValue(value));
                }
            }
        } else if (annotation instanceof SingleMemberAnnotationExpr) {
            // Annotation with single value: @Min(5)
            SingleMemberAnnotationExpr singleAnnotation = (SingleMemberAnnotationExpr) annotation;
            String value = singleAnnotation.getMemberValue().toString();
            constraint.addAttribute("value", parseAttributeValue(value));
        }

        // Add default attributes based on constraint type
        addDefaultAttributes(constraint, constraintType);

        return constraint;
    }

    /**
     * Get simple annotation name (without package)
     */
    private static String getSimpleAnnotationName(AnnotationExpr annotation) {
        String name = annotation.getNameAsString();
        // Remove package prefix if present
        if (name.contains(".")) {
            name = name.substring(name.lastIndexOf('.') + 1);
        }
        return name;
    }

    /**
     * Parse attribute value from string representation
     */
    private static Object parseAttributeValue(String value) {
        value = value.trim();

        // Remove quotes from string literals
        if (value.startsWith("\"") && value.endsWith("\"")) {
            return value.substring(1, value.length() - 1);
        }

        // Parse numbers
        try {
            if (value.contains(".")) {
                return Double.parseDouble(value);
            } else {
                return Integer.parseInt(value);
            }
        } catch (NumberFormatException e) {
            // Not a number, return as string
        }

        // Parse booleans
        if (value.equals("true") || value.equals("false")) {
            return Boolean.parseBoolean(value);
        }

        // Return as-is for other values (enums, etc.)
        return value;
    }

    /**
     * Clean string literal by removing quotes
     */
    private static String cleanStringLiteral(String value) {
        if (value.startsWith("\"") && value.endsWith("\"")) {
            return value.substring(1, value.length() - 1);
        }
        return value;
    }

    /**
     * Extract validation groups from annotation
     */
    private static String[] extractGroups(String groupsValue) {
        // Simple parsing for groups array
        // Example: {Group1.class, Group2.class}
        groupsValue = groupsValue.replace("{", "").replace("}", "");
        String[] parts = groupsValue.split(",");

        List<String> groups = new ArrayList<>();
        for (String part : parts) {
            part = part.trim();
            if (part.endsWith(".class")) {
                part = part.substring(0, part.length() - 6);
            }
            if (!part.isEmpty()) {
                groups.add(part);
            }
        }

        return groups.toArray(new String[0]);
    }

    /**
     * Add default attributes based on constraint type
     */
    private static void addDefaultAttributes(ValidationConstraint constraint, String constraintType) {
        switch (constraintType) {
            case "NotNull":
            case "NotBlank":
            case "NotEmpty":
                constraint.addAttribute("nullable", false);
                break;

            case "Email":
                if (!constraint.getAttributes().containsKey("regexp")) {
                    constraint.addAttribute("regexp", ".*@.*");
                }
                break;

            case "Positive":
                constraint.addAttribute("min", 1);
                constraint.addAttribute("exclusive", false);
                break;

            case "PositiveOrZero":
                constraint.addAttribute("min", 0);
                constraint.addAttribute("exclusive", false);
                break;

            case "Negative":
                constraint.addAttribute("max", -1);
                constraint.addAttribute("exclusive", false);
                break;

            case "NegativeOrZero":
                constraint.addAttribute("max", 0);
                constraint.addAttribute("exclusive", false);
                break;

            case "Size":
                // Set defaults if not specified
                if (!constraint.getAttributes().containsKey("min")) {
                    constraint.addAttribute("min", 0);
                }
                if (!constraint.getAttributes().containsKey("max")) {
                    constraint.addAttribute("max", Integer.MAX_VALUE);
                }
                break;
        }
    }

    /**
     * Check if a constraint makes the parameter required
     */
    public static boolean isRequiredConstraint(ValidationConstraint constraint) {
        return constraint.getConstraintType().equals("NotNull") ||
               constraint.getConstraintType().equals("NotBlank") ||
               constraint.getConstraintType().equals("NotEmpty");
    }

    /**
     * Get a human-readable summary of all constraints
     */
    public static String getConstraintsSummary(List<ValidationConstraint> constraints) {
        if (constraints == null || constraints.isEmpty()) {
            return "No validation";
        }

        StringBuilder summary = new StringBuilder();
        for (int i = 0; i < constraints.size(); i++) {
            if (i > 0) {
                summary.append(", ");
            }
            summary.append(constraints.get(i).getSummary());
        }

        return summary.toString();
    }
}
