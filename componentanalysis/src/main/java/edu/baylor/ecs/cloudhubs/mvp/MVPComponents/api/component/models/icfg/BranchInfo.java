package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

/**
 * Information for branch nodes (if, switch) in the CFG.
 * Captures conditional logic and possible outcomes.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder({"type", "condition", "evaluatesTo", "hasElse"})
public class BranchInfo {

    /**
     * Branch types
     */
    public enum BranchType {
        IF,
        SWITCH,
        TERNARY,
        SHORT_CIRCUIT_AND,
        SHORT_CIRCUIT_OR
    }

    /**
     * Type of branch construct
     */
    private BranchType type;

    /**
     * Condition expression as a string
     */
    private String condition;

    /**
     * Possible evaluation outcomes (e.g., ["TRUE", "FALSE"] for if, case values for switch)
     */
    private List<String> evaluatesTo;

    /**
     * Whether the branch has an else clause (for if statements)
     */
    private Boolean hasElse;

    /**
     * Create branch info for an if statement
     */
    public static BranchInfo createIf(String condition, boolean hasElse) {
        BranchInfo info = new BranchInfo();
        info.setType(BranchType.IF);
        info.setCondition(condition);
        info.setEvaluatesTo(List.of("TRUE", "FALSE"));
        info.setHasElse(hasElse);
        return info;
    }

    /**
     * Create branch info for a switch statement
     */
    public static BranchInfo createSwitch(String condition, List<String> caseValues) {
        BranchInfo info = new BranchInfo();
        info.setType(BranchType.SWITCH);
        info.setCondition(condition);
        info.setEvaluatesTo(caseValues);
        return info;
    }

    /**
     * Create branch info for a ternary operator
     */
    public static BranchInfo createTernary(String condition) {
        BranchInfo info = new BranchInfo();
        info.setType(BranchType.TERNARY);
        info.setCondition(condition);
        info.setEvaluatesTo(List.of("TRUE", "FALSE"));
        return info;
    }

    /**
     * Check if this is a binary branch (true/false outcomes)
     */
    public boolean isBinary() {
        return type == BranchType.IF || type == BranchType.TERNARY ||
               type == BranchType.SHORT_CIRCUIT_AND || type == BranchType.SHORT_CIRCUIT_OR;
    }

    /**
     * Check if this is a multi-way branch (switch)
     */
    public boolean isMultiWay() {
        return type == BranchType.SWITCH;
    }
}