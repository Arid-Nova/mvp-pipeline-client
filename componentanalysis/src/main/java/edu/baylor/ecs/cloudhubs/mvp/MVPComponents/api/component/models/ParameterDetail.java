package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;
import java.util.Objects;

/**
 * Represents detailed information about an endpoint parameter.
 * Includes type information, validation annotations, and Spring-specific metadata.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ParameterDetail {
    /**
     * Parameter name (e.g., "orderId", "trainNumber")
     */
    private String name;
    
    /**
     * Simple type name (e.g., "String", "Long", "User")
     */
    private String type;
    
    /**
     * Fully qualified Java type (e.g., "java.lang.String", "com.example.User")
     */
    private String javaType;
    
    /**
     * Whether the parameter is required (from annotation attributes)
     */
    private boolean required;
    
    /**
     * Default value if parameter is optional (from annotation attributes)
     */
    private String defaultValue;
    
    /**
     * List of annotation names applied to this parameter
     */
    private List<String> annotations;
    
    /**
     * Position of the parameter in the method signature (0-based)
     */
    private int position;

    /**
     * Validation constraints extracted from JSR-303/JSR-380 annotations
     */
    private List<ValidationConstraint> validationConstraints;

    /**
     * Check if this parameter has a specific annotation
     * 
     * @param annotationName The annotation name to check for
     * @return true if the parameter has this annotation
     */
    public boolean hasAnnotation(String annotationName) {
        return annotations != null && annotations.stream()
            .anyMatch(ann -> ann.equals(annotationName) || ann.endsWith("." + annotationName));
    }
    
    /**
     * Check if this parameter is a path variable
     * 
     * @return true if annotated with @PathVariable
     */
    public boolean isPathVariable() {
        return hasAnnotation("PathVariable");
    }
    
    /**
     * Check if this parameter is a request parameter
     * 
     * @return true if annotated with @RequestParam
     */
    public boolean isRequestParam() {
        return hasAnnotation("RequestParam");
    }
    
    /**
     * Check if this parameter is a request body
     * 
     * @return true if annotated with @RequestBody
     */
    public boolean isRequestBody() {
        return hasAnnotation("RequestBody");
    }
    
    /**
     * Check if this parameter is a request header
     * 
     * @return true if annotated with @RequestHeader
     */
    public boolean isRequestHeader() {
        return hasAnnotation("RequestHeader");
    }
    
    /**
     * Check if this parameter has validation annotations
     *
     * @return true if has validation annotations like @Valid, @NotNull, etc.
     */
    public boolean hasValidation() {
        return validationConstraints != null && !validationConstraints.isEmpty();
    }
    
    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (obj == null || getClass() != obj.getClass()) return false;
        ParameterDetail that = (ParameterDetail) obj;
        return required == that.required &&
               position == that.position &&
               Objects.equals(name, that.name) &&
               Objects.equals(type, that.type) &&
               Objects.equals(javaType, that.javaType) &&
               Objects.equals(defaultValue, that.defaultValue) &&
               Objects.equals(annotations, that.annotations) &&
               Objects.equals(validationConstraints, that.validationConstraints);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(name, type, javaType, required, defaultValue, annotations, position, validationConstraints);
    }
    
    @Override
    public String toString() {
        return "ParameterDetail{" +
               "name='" + name + '\'' +
               ", type='" + type + '\'' +
               ", javaType='" + javaType + '\'' +
               ", required=" + required +
               ", defaultValue='" + defaultValue + '\'' +
               ", annotations=" + annotations +
               ", position=" + position +
               ", validationConstraints=" + validationConstraints +
               '}';
    }
}