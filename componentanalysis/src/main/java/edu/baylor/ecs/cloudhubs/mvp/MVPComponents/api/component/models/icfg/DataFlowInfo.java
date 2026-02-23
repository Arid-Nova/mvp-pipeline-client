package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Represents basic data flow information for a CFG node.
 * Tracks variable definitions, uses, and modifications.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_EMPTY)
@JsonPropertyOrder({"defines", "uses", "modifies"})
public class DataFlowInfo {

    /**
     * Variables defined (declared/initialized) at this node
     */
    private List<String> defines;

    /**
     * Variables read/used at this node
     */
    private List<String> uses;

    /**
     * Variables modified (assigned to) at this node
     */
    private List<String> modifies;

    /**
     * Add a variable definition
     */
    public void addDefine(String variable) {
        if (defines == null) {
            defines = new ArrayList<>();
        }
        if (!defines.contains(variable)) {
            defines.add(variable);
        }
    }

    /**
     * Add a variable use
     */
    public void addUse(String variable) {
        if (uses == null) {
            uses = new ArrayList<>();
        }
        if (!uses.contains(variable)) {
            uses.add(variable);
        }
    }

    /**
     * Add a variable modification
     */
    public void addModify(String variable) {
        if (modifies == null) {
            modifies = new ArrayList<>();
        }
        if (!modifies.contains(variable)) {
            modifies.add(variable);
        }
    }

    /**
     * Check if this node has any data flow information
     */
    public boolean isEmpty() {
        return (defines == null || defines.isEmpty()) &&
               (uses == null || uses.isEmpty()) &&
               (modifies == null || modifies.isEmpty());
    }

    /**
     * Check if this node defines any variables
     */
    public boolean hasDefinitions() {
        return defines != null && !defines.isEmpty();
    }

    /**
     * Check if this node uses any variables
     */
    public boolean hasUses() {
        return uses != null && !uses.isEmpty();
    }

    /**
     * Check if this node modifies any variables
     */
    public boolean hasModifications() {
        return modifies != null && !modifies.isEmpty();
    }
}