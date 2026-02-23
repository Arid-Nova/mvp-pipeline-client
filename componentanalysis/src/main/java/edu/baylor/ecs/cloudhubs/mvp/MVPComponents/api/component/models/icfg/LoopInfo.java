package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Information for loop nodes in the CFG.
 * Captures loop structure and iteration details.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder({"type", "variable", "collection", "condition", "init", "update"})
public class LoopInfo {

    /**
     * Loop types
     */
    public enum LoopType {
        FOR,
        FOR_EACH,
        WHILE,
        DO_WHILE
    }

    /**
     * Type of loop construct
     */
    private LoopType type;

    /**
     * Loop variable name (for for-each and for loops)
     */
    private String variable;

    /**
     * Collection being iterated (for for-each loops)
     */
    private String collection;

    /**
     * Loop condition expression
     */
    private String condition;

    /**
     * Loop initialization expression (for for loops)
     */
    private String init;

    /**
     * Loop update expression (for for loops)
     */
    private String update;

    /**
     * Create loop info for a for-each loop
     */
    public static LoopInfo createForEach(String variable, String collection) {
        LoopInfo info = new LoopInfo();
        info.setType(LoopType.FOR_EACH);
        info.setVariable(variable);
        info.setCollection(collection);
        return info;
    }

    /**
     * Create loop info for a for loop
     */
    public static LoopInfo createFor(String variable, String init, String condition, String update) {
        LoopInfo info = new LoopInfo();
        info.setType(LoopType.FOR);
        info.setVariable(variable);
        info.setInit(init);
        info.setCondition(condition);
        info.setUpdate(update);
        return info;
    }

    /**
     * Create loop info for a while loop
     */
    public static LoopInfo createWhile(String condition) {
        LoopInfo info = new LoopInfo();
        info.setType(LoopType.WHILE);
        info.setCondition(condition);
        return info;
    }

    /**
     * Create loop info for a do-while loop
     */
    public static LoopInfo createDoWhile(String condition) {
        LoopInfo info = new LoopInfo();
        info.setType(LoopType.DO_WHILE);
        info.setCondition(condition);
        return info;
    }

    /**
     * Check if this loop has an iteration variable
     */
    public boolean hasIterationVariable() {
        return variable != null && !variable.trim().isEmpty();
    }

    /**
     * Check if this is a collection-based loop
     */
    public boolean isCollectionBased() {
        return type == LoopType.FOR_EACH;
    }

    /**
     * Check if this is a condition-based loop
     */
    public boolean isConditionBased() {
        return type == LoopType.WHILE || type == LoopType.DO_WHILE;
    }
}