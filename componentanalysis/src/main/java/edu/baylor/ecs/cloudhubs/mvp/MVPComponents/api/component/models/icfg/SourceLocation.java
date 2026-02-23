package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Represents the source code location of a CFG node.
 * Provides precise mapping back to source code for IDE integration.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder({"line", "column", "endLine", "endColumn"})
public class SourceLocation {

    /**
     * Starting line number (1-based)
     */
    private int line;

    /**
     * Starting column number (1-based)
     */
    private Integer column;

    /**
     * Ending line number (1-based) - optional for single-line constructs
     */
    private Integer endLine;

    /**
     * Ending column number (1-based) - optional for single-line constructs
     */
    private Integer endColumn;

    /**
     * Constructor for simple line-only location
     */
    public SourceLocation(int line) {
        this.line = line;
    }

    /**
     * Constructor for line and column location
     */
    public SourceLocation(int line, int column) {
        this.line = line;
        this.column = column;
    }

    /**
     * Check if this is a single-line location
     */
    public boolean isSingleLine() {
        return endLine == null || endLine.equals(line);
    }

    /**
     * Get a human-readable string representation
     */
    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        sb.append("line ").append(line);

        if (column != null) {
            sb.append(":").append(column);
        }

        if (endLine != null && !endLine.equals(line)) {
            sb.append("-").append(endLine);
            if (endColumn != null) {
                sb.append(":").append(endColumn);
            }
        } else if (endColumn != null && !endColumn.equals(column)) {
            sb.append("-").append(endColumn);
        }

        return sb.toString();
    }
}