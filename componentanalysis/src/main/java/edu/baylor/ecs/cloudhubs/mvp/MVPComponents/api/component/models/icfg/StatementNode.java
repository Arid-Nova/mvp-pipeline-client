package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.icfg;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Represents a regular statement in the control flow graph.
 * This includes assignments, expressions, declarations, and other non-control statements.
 */
@Getter
@Setter
@NoArgsConstructor
public class StatementNode extends CFGNode {
    
    /**
     * The statement expression or code
     */
    private String statement;
    
    /**
     * Type of statement (assignment, declaration, expression, etc.)
     */
    private String statementType;
    
    /**
     * Constructor for StatementNode
     * 
     * @param nodeId Unique identifier for this node
     * @param statement The statement expression
     * @param statementType Type of statement
     */
    public StatementNode(String nodeId, String statement, String statementType) {
        super(nodeId, CFGNodeType.STATEMENT, 
              generateDescription(statementType, statement), 
              null);
        this.statement = statement;
        this.statementType = statementType;
    }
    
    /**
     * Constructor for StatementNode with line number
     * 
     * @param nodeId Unique identifier for this node
     * @param statement The statement expression
     * @param statementType Type of statement
     * @param lineNumber Line number of the statement
     */
    public StatementNode(String nodeId, String statement, String statementType, Integer lineNumber) {
        super(nodeId, CFGNodeType.STATEMENT, 
              generateDescription(statementType, statement), 
              lineNumber);
        this.statement = statement;
        this.statementType = statementType;
    }
    
    /**
     * Generate description based on statement type and content
     * 
     * @param statementType Type of statement
     * @param statement The statement content
     * @return Generated description
     */
    private static String generateDescription(String statementType, String statement) {
        if (statementType != null && !statementType.trim().isEmpty()) {
            return String.format("Statement: %s", statementType);
        }
        if (statement != null && !statement.trim().isEmpty()) {
            // Truncate long statements for readability
            String truncated = statement.length() > 50 ? 
                statement.substring(0, 47) + "..." : statement;
            return String.format("Statement: %s", truncated);
        }
        return "Statement";
    }
    
    /**
     * Check if this statement has content
     * 
     * @return true if statement is not null and not empty
     */
    public boolean hasStatement() {
        return statement != null && !statement.trim().isEmpty();
    }
    
    /**
     * Check if this statement has a type classification
     * 
     * @return true if statementType is not null and not empty
     */
    public boolean hasStatementType() {
        return statementType != null && !statementType.trim().isEmpty();
    }
}