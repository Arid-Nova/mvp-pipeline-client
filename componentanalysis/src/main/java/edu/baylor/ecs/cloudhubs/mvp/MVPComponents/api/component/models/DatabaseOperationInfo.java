package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Captures database operation information for methods.
 * Tracks JPA/Spring Data operations including queries, transactions, and repository patterns.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class DatabaseOperationInfo {

    /**
     * Type of database operation
     */
    public enum OperationType {
        SELECT,         // Read operation
        INSERT,         // Create operation
        UPDATE,         // Update operation
        DELETE,         // Delete operation
        MIXED,          // Multiple operation types
        UNKNOWN         // Cannot determine type
    }

    /**
     * Operation type (SELECT, INSERT, UPDATE, DELETE, etc.)
     */
    private OperationType operationType;

    /**
     * The custom query if @Query annotation is present
     */
    private String customQuery;

    /**
     * Whether the query language is native SQL or JPQL
     */
    private boolean nativeQuery;

    /**
     * Whether this operation modifies data (@Modifying)
     */
    private boolean modifying;

    /**
     * Whether this operation is transactional (@Transactional)
     */
    private boolean transactional;

    /**
     * Transaction propagation level (e.g., REQUIRED, REQUIRES_NEW)
     */
    private String transactionPropagation;

    /**
     * Transaction isolation level (e.g., READ_COMMITTED, SERIALIZABLE)
     */
    private String transactionIsolation;

    /**
     * Whether the transaction is read-only
     */
    private boolean readOnly;

    /**
     * Entity types involved in the operation
     */
    private List<String> entityTypes;

    /**
     * Repository interface name (if detected)
     */
    private String repositoryInterface;

    /**
     * JPA method naming pattern (e.g., findBy, deleteBy, countBy)
     */
    private String methodPattern;

    /**
     * Query parameters extracted from method parameters or @Param annotations
     */
    private List<String> queryParameters;

    /**
     * Return type of the query (entity, list, page, etc.)
     */
    private String returnType;

    /**
     * Whether this uses pagination (Pageable parameter)
     */
    private boolean paginated;

    /**
     * Whether this uses sorting (Sort parameter)
     */
    private boolean sorted;

    /**
     * Named queries referenced
     */
    private List<String> namedQueries;

    /**
     * Create a simple database operation
     */
    public static DatabaseOperationInfo createSimple(OperationType operationType) {
        DatabaseOperationInfo info = new DatabaseOperationInfo();
        info.setOperationType(operationType);
        info.setEntityTypes(new ArrayList<>());
        info.setQueryParameters(new ArrayList<>());
        return info;
    }

    /**
     * Create database operation with custom query
     */
    public static DatabaseOperationInfo createWithQuery(OperationType operationType, String customQuery, boolean nativeQuery) {
        DatabaseOperationInfo info = createSimple(operationType);
        info.setCustomQuery(customQuery);
        info.setNativeQuery(nativeQuery);
        return info;
    }

    /**
     * Create database operation from repository method pattern
     */
    public static DatabaseOperationInfo createFromPattern(String methodPattern, String entityType) {
        DatabaseOperationInfo info = createSimple(determineOperationType(methodPattern));
        info.setMethodPattern(methodPattern);
        if (entityType != null) {
            info.addEntityType(entityType);
        }
        return info;
    }

    /**
     * Add an entity type
     */
    public void addEntityType(String entityType) {
        if (entityTypes == null) {
            entityTypes = new ArrayList<>();
        }
        if (!entityTypes.contains(entityType)) {
            entityTypes.add(entityType);
        }
    }

    /**
     * Add a query parameter
     */
    public void addQueryParameter(String parameter) {
        if (queryParameters == null) {
            queryParameters = new ArrayList<>();
        }
        if (!queryParameters.contains(parameter)) {
            queryParameters.add(parameter);
        }
    }

    /**
     * Add a named query
     */
    public void addNamedQuery(String namedQuery) {
        if (namedQueries == null) {
            namedQueries = new ArrayList<>();
        }
        if (!namedQueries.contains(namedQuery)) {
            namedQueries.add(namedQuery);
        }
    }

    /**
     * Check if this operation involves database writes
     */
    @JsonIgnore
    public boolean isWriteOperation() {
        return operationType == OperationType.INSERT ||
               operationType == OperationType.UPDATE ||
               operationType == OperationType.DELETE ||
               operationType == OperationType.MIXED ||
               modifying;
    }

    /**
     * Check if this operation is read-only
     */
    @JsonIgnore
    public boolean isReadOperation() {
        return operationType == OperationType.SELECT && !modifying;
    }

    /**
     * Check if this uses custom query
     */
    @JsonIgnore
    public boolean hasCustomQuery() {
        return customQuery != null && !customQuery.isEmpty();
    }

    /**
     * Check if this uses JPA method naming convention
     */
    @JsonIgnore
    public boolean usesMethodPattern() {
        return methodPattern != null && !methodPattern.isEmpty();
    }

    /**
     * Get a summary of the database operation
     */
    @JsonIgnore
    public String getSummary() {
        StringBuilder summary = new StringBuilder();
        summary.append(operationType);

        if (hasCustomQuery()) {
            summary.append(" [Custom Query]");
            if (nativeQuery) {
                summary.append(" [Native SQL]");
            } else {
                summary.append(" [JPQL]");
            }
        } else if (usesMethodPattern()) {
            summary.append(" [").append(methodPattern).append("]");
        }

        if (transactional) {
            summary.append(" [Transactional");
            if (transactionPropagation != null) {
                summary.append(" - ").append(transactionPropagation);
            }
            summary.append("]");
        }

        if (modifying) {
            summary.append(" [Modifying]");
        }

        if (paginated) {
            summary.append(" [Paginated]");
        }

        if (entityTypes != null && !entityTypes.isEmpty()) {
            summary.append(" - Entities: ").append(String.join(", ", entityTypes));
        }

        return summary.toString();
    }

    /**
     * Determine operation type from JPA method name pattern
     */
    private static OperationType determineOperationType(String methodPattern) {
        if (methodPattern == null) {
            return OperationType.UNKNOWN;
        }

        String pattern = methodPattern.toLowerCase();
        if (pattern.startsWith("find") || pattern.startsWith("get") ||
            pattern.startsWith("read") || pattern.startsWith("query") ||
            pattern.startsWith("search") || pattern.startsWith("count") ||
            pattern.startsWith("exists")) {
            return OperationType.SELECT;
        } else if (pattern.startsWith("save") || pattern.startsWith("insert") ||
                   pattern.startsWith("create")) {
            return OperationType.INSERT;
        } else if (pattern.startsWith("update") || pattern.startsWith("modify")) {
            return OperationType.UPDATE;
        } else if (pattern.startsWith("delete") || pattern.startsWith("remove")) {
            return OperationType.DELETE;
        }

        return OperationType.UNKNOWN;
    }

    @Override
    public String toString() {
        return getSummary();
    }
}
