package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.HashMap;
import java.util.Map;

/**
 * Represents a validation constraint on a parameter or field.
 * Captures information from JSR-303/JSR-380 validation annotations.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ValidationConstraint {

    /**
     * Type of constraint (e.g., "NotNull", "Size", "Pattern", "Min", "Max", "Valid")
     */
    private String constraintType;

    /**
     * Custom validation message if provided
     */
    private String message;

    /**
     * Constraint-specific attributes
     * Examples:
     * - Size: {min: 3, max: 50}
     * - Pattern: {regexp: "[A-Z]+"}
     * - Min: {value: 1}
     * - Max: {value: 100}
     * - Email: {regexp: "..."}
     */
    private Map<String, Object> attributes;

    /**
     * Whether this constraint applies to nested objects (@Valid)
     */
    private boolean cascaded;

    /**
     * Validation groups if specified
     */
    private String[] groups;

    /**
     * Create a simple constraint without attributes
     */
    public static ValidationConstraint createSimple(String constraintType) {
        ValidationConstraint constraint = new ValidationConstraint();
        constraint.setConstraintType(constraintType);
        constraint.setAttributes(new HashMap<>());
        return constraint;
    }

    /**
     * Create a constraint with a custom message
     */
    public static ValidationConstraint createWithMessage(String constraintType, String message) {
        ValidationConstraint constraint = createSimple(constraintType);
        constraint.setMessage(message);
        return constraint;
    }

    /**
     * Create a constraint with attributes
     */
    public static ValidationConstraint createWithAttributes(String constraintType, Map<String, Object> attributes) {
        ValidationConstraint constraint = new ValidationConstraint();
        constraint.setConstraintType(constraintType);
        constraint.setAttributes(attributes);
        return constraint;
    }

    /**
     * Add an attribute to this constraint
     */
    public void addAttribute(String key, Object value) {
        if (attributes == null) {
            attributes = new HashMap<>();
        }
        attributes.put(key, value);
    }

    /**
     * Get a summary of this constraint
     */
    public String getSummary() {
        StringBuilder summary = new StringBuilder("@" + constraintType);

        if (attributes != null && !attributes.isEmpty()) {
            summary.append("(");
            attributes.forEach((key, value) -> {
                summary.append(key).append("=").append(value).append(", ");
            });
            // Remove trailing comma and space
            summary.setLength(summary.length() - 2);
            summary.append(")");
        }

        if (message != null) {
            summary.append(" [message: \"").append(message).append("\"]");
        }

        return summary.toString();
    }

    @Override
    public String toString() {
        return getSummary();
    }
}
