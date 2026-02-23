package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Exception handling information for exception nodes in the CFG.
 * Captures details about try-catch-finally blocks and exception types.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ExceptionInfo {

    /**
     * Type of exception being caught (e.g., "IOException", "Exception")
     */
    private String exceptionType;

    /**
     * Variable name for the caught exception (e.g., "e", "ex")
     */
    private String catchVariable;

    /**
     * Whether this is a finally block
     */
    private boolean isFinally;

    /**
     * List of all exception types caught in a multi-catch block
     * (e.g., ["IOException", "SQLException"])
     */
    private List<String> caughtTypes;

    /**
     * Whether this exception is rethrown
     */
    private boolean isRethrown;

    /**
     * Resource declarations for try-with-resources
     */
    private List<String> resources;

    /**
     * Create exception info for a catch block
     */
    public static ExceptionInfo createCatch(String exceptionType, String catchVariable) {
        ExceptionInfo info = new ExceptionInfo();
        info.setExceptionType(exceptionType);
        info.setCatchVariable(catchVariable);
        info.setFinally(false);
        info.setCaughtTypes(new ArrayList<>());
        info.getCaughtTypes().add(exceptionType);
        return info;
    }

    /**
     * Create exception info for a multi-catch block
     */
    public static ExceptionInfo createMultiCatch(List<String> caughtTypes, String catchVariable) {
        ExceptionInfo info = new ExceptionInfo();
        info.setExceptionType(String.join(" | ", caughtTypes));
        info.setCatchVariable(catchVariable);
        info.setFinally(false);
        info.setCaughtTypes(new ArrayList<>(caughtTypes));
        return info;
    }

    /**
     * Create exception info for a finally block
     */
    public static ExceptionInfo createFinally() {
        ExceptionInfo info = new ExceptionInfo();
        info.setFinally(true);
        return info;
    }

    /**
     * Create exception info for try-with-resources
     */
    public static ExceptionInfo createTryWithResources(List<String> resources) {
        ExceptionInfo info = new ExceptionInfo();
        info.setResources(new ArrayList<>(resources));
        return info;
    }

    /**
     * Add a caught type to the list
     */
    public void addCaughtType(String type) {
        if (caughtTypes == null) {
            caughtTypes = new ArrayList<>();
        }
        caughtTypes.add(type);
    }

    /**
     * Add a resource to the list
     */
    public void addResource(String resource) {
        if (resources == null) {
            resources = new ArrayList<>();
        }
        resources.add(resource);
    }

    @Override
    public String toString() {
        if (isFinally) {
            return "finally";
        } else if (caughtTypes != null && caughtTypes.size() > 1) {
            return "catch(" + String.join(" | ", caughtTypes) + " " + catchVariable + ")";
        } else {
            return "catch(" + exceptionType + " " + catchVariable + ")";
        }
    }
}
