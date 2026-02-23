package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.MemberValuePair;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
import com.github.javaparser.ast.type.ClassOrInterfaceType;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.DatabaseOperationInfo;

import java.util.ArrayList;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Detects and analyzes database operations from JPA/Spring Data repositories.
 * Supports @Query, @Modifying, @Transactional annotations and JPA method naming patterns.
 */
public class DatabaseOperationDetector {

    /**
     * Common JPA/Spring Data annotations
     */
    private static final Set<String> QUERY_ANNOTATIONS = Set.of(
        "Query", "NamedQuery", "NamedQueries"
    );

    private static final Set<String> REPOSITORY_INTERFACES = Set.of(
        "JpaRepository", "CrudRepository", "PagingAndSortingRepository",
        "Repository", "MongoRepository", "ReactiveCrudRepository"
    );

    /**
     * JPA method name patterns
     */
    private static final Pattern REPOSITORY_METHOD_PATTERN = Pattern.compile(
        "^(find|get|read|query|search|count|exists|save|insert|create|update|modify|delete|remove)(.*)$"
    );

    /**
     * Detect database operation from a method declaration
     */
    public static DatabaseOperationInfo detectDatabaseOperation(MethodDeclaration method, ClassOrInterfaceDeclaration parentClass) {
        // Check if parent class is a repository
        if (!isRepositoryClass(parentClass)) {
            return null;
        }

        DatabaseOperationInfo info = new DatabaseOperationInfo();
        info.setEntityTypes(new ArrayList<>());
        info.setQueryParameters(new ArrayList<>());

        // Extract repository interface name
        String repositoryInterface = findRepositoryInterface(parentClass);
        info.setRepositoryInterface(repositoryInterface);

        // Extract entity type from repository interface
        String entityType = extractEntityTypeFromRepository(parentClass);
        if (entityType != null) {
            info.addEntityType(entityType);
        }

        // Check for @Query annotation
        boolean hasQueryAnnotation = extractQueryAnnotation(method, info);

        // Check for @Modifying annotation
        extractModifyingAnnotation(method, info);

        // Check for @Transactional annotation
        extractTransactionalAnnotation(method, info);

        // Extract query parameters
        extractQueryParameters(method, info);

        // Check for pagination/sorting
        checkPaginationAndSorting(method, info);

        // Extract return type
        String returnType = method.getTypeAsString();
        info.setReturnType(returnType);

        // If no @Query annotation, try to parse method name pattern
        if (!hasQueryAnnotation) {
            extractMethodPattern(method, info);
        }

        // Determine operation type if not set
        if (info.getOperationType() == null) {
            info.setOperationType(DatabaseOperationInfo.OperationType.UNKNOWN);
        }

        return info;
    }

    /**
     * Check if the class is a repository interface
     */
    private static boolean isRepositoryClass(ClassOrInterfaceDeclaration classDecl) {
        if (!classDecl.isInterface()) {
            return false;
        }

        // Check for @Repository annotation
        if (hasAnnotation(classDecl, "Repository")) {
            return true;
        }

        // Check if it extends a known repository interface
        for (ClassOrInterfaceType extendedType : classDecl.getExtendedTypes()) {
            String typeName = extendedType.getNameAsString();
            if (REPOSITORY_INTERFACES.contains(typeName)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Find the repository interface being extended
     */
    private static String findRepositoryInterface(ClassOrInterfaceDeclaration classDecl) {
        for (ClassOrInterfaceType extendedType : classDecl.getExtendedTypes()) {
            String typeName = extendedType.getNameAsString();
            if (REPOSITORY_INTERFACES.contains(typeName)) {
                return typeName;
            }
        }
        return null;
    }

    /**
     * Extract entity type from repository interface generic parameters
     * Example: JpaRepository<User, Long> -> "User"
     */
    private static String extractEntityTypeFromRepository(ClassOrInterfaceDeclaration classDecl) {
        for (ClassOrInterfaceType extendedType : classDecl.getExtendedTypes()) {
            String typeName = extendedType.getNameAsString();
            if (REPOSITORY_INTERFACES.contains(typeName)) {
                // Get generic type arguments
                if (extendedType.getTypeArguments().isPresent()) {
                    var typeArgs = extendedType.getTypeArguments().get();
                    if (!typeArgs.isEmpty()) {
                        // First type argument is the entity type
                        return typeArgs.get(0).asString();
                    }
                }
            }
        }
        return null;
    }

    /**
     * Extract @Query annotation information
     */
    private static boolean extractQueryAnnotation(MethodDeclaration method, DatabaseOperationInfo info) {
        for (AnnotationExpr annotation : method.getAnnotations()) {
            String annotationName = getSimpleAnnotationName(annotation);

            if (QUERY_ANNOTATIONS.contains(annotationName)) {
                if (annotation instanceof SingleMemberAnnotationExpr) {
                    // @Query("SELECT...")
                    SingleMemberAnnotationExpr singleAnnotation = (SingleMemberAnnotationExpr) annotation;
                    String queryValue = cleanStringLiteral(singleAnnotation.getMemberValue().toString());
                    info.setCustomQuery(queryValue);
                    info.setOperationType(determineOperationTypeFromQuery(queryValue));
                } else if (annotation instanceof NormalAnnotationExpr) {
                    // @Query(value="SELECT...", nativeQuery=true)
                    NormalAnnotationExpr normalAnnotation = (NormalAnnotationExpr) annotation;
                    for (MemberValuePair pair : normalAnnotation.getPairs()) {
                        String name = pair.getNameAsString();
                        String value = pair.getValue().toString();

                        if (name.equals("value") || name.equals("query")) {
                            String queryValue = cleanStringLiteral(value);
                            info.setCustomQuery(queryValue);
                            info.setOperationType(determineOperationTypeFromQuery(queryValue));
                        } else if (name.equals("nativeQuery")) {
                            info.setNativeQuery(Boolean.parseBoolean(value));
                        } else if (name.equals("name")) {
                            info.addNamedQuery(cleanStringLiteral(value));
                        }
                    }
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Extract @Modifying annotation information
     */
    private static void extractModifyingAnnotation(MethodDeclaration method, DatabaseOperationInfo info) {
        if (hasAnnotation(method, "Modifying")) {
            info.setModifying(true);
        }
    }

    /**
     * Extract @Transactional annotation information
     */
    private static void extractTransactionalAnnotation(MethodDeclaration method, DatabaseOperationInfo info) {
        for (AnnotationExpr annotation : method.getAnnotations()) {
            String annotationName = getSimpleAnnotationName(annotation);

            if (annotationName.equals("Transactional")) {
                info.setTransactional(true);

                if (annotation instanceof NormalAnnotationExpr) {
                    NormalAnnotationExpr normalAnnotation = (NormalAnnotationExpr) annotation;
                    for (MemberValuePair pair : normalAnnotation.getPairs()) {
                        String name = pair.getNameAsString();
                        String value = pair.getValue().toString();

                        if (name.equals("propagation")) {
                            info.setTransactionPropagation(extractEnumValue(value));
                        } else if (name.equals("isolation")) {
                            info.setTransactionIsolation(extractEnumValue(value));
                        } else if (name.equals("readOnly")) {
                            info.setReadOnly(Boolean.parseBoolean(value));
                        }
                    }
                }
            }
        }
    }

    /**
     * Extract query parameters from method parameters
     */
    private static void extractQueryParameters(MethodDeclaration method, DatabaseOperationInfo info) {
        for (Parameter param : method.getParameters()) {
            String paramType = param.getTypeAsString();

            // Skip pagination/sorting parameters
            if (paramType.equals("Pageable") || paramType.equals("Sort")) {
                continue;
            }

            // Check for @Param annotation
            boolean hasParam = false;
            for (AnnotationExpr annotation : param.getAnnotations()) {
                if (getSimpleAnnotationName(annotation).equals("Param")) {
                    hasParam = true;
                    if (annotation instanceof SingleMemberAnnotationExpr) {
                        SingleMemberAnnotationExpr singleAnnotation = (SingleMemberAnnotationExpr) annotation;
                        String paramName = cleanStringLiteral(singleAnnotation.getMemberValue().toString());
                        info.addQueryParameter(paramName);
                    }
                }
            }

            // If no @Param, use parameter name
            if (!hasParam) {
                info.addQueryParameter(param.getNameAsString());
            }
        }
    }

    /**
     * Check for pagination and sorting parameters
     */
    private static void checkPaginationAndSorting(MethodDeclaration method, DatabaseOperationInfo info) {
        for (Parameter param : method.getParameters()) {
            String paramType = param.getTypeAsString();

            if (paramType.equals("Pageable") || paramType.contains("Pageable")) {
                info.setPaginated(true);
            }

            if (paramType.equals("Sort") || paramType.contains("Sort")) {
                info.setSorted(true);
            }
        }
    }

    /**
     * Extract method pattern from JPA method name
     * Examples: findByName, deleteByIdAndStatus, countByCategory
     */
    private static void extractMethodPattern(MethodDeclaration method, DatabaseOperationInfo info) {
        String methodName = method.getNameAsString();
        Matcher matcher = REPOSITORY_METHOD_PATTERN.matcher(methodName);

        if (matcher.matches()) {
            String operation = matcher.group(1);
            String criteria = matcher.group(2);

            info.setMethodPattern(operation + (criteria.isEmpty() ? "" : "By" + criteria));

            // Determine operation type from method name
            DatabaseOperationInfo.OperationType operationType = determineOperationTypeFromMethodName(operation);
            if (info.getOperationType() == null) {
                info.setOperationType(operationType);
            }
        }
    }

    /**
     * Determine operation type from query string
     */
    private static DatabaseOperationInfo.OperationType determineOperationTypeFromQuery(String query) {
        if (query == null) {
            return DatabaseOperationInfo.OperationType.UNKNOWN;
        }

        String upperQuery = query.trim().toUpperCase();

        if (upperQuery.startsWith("SELECT")) {
            return DatabaseOperationInfo.OperationType.SELECT;
        } else if (upperQuery.startsWith("INSERT")) {
            return DatabaseOperationInfo.OperationType.INSERT;
        } else if (upperQuery.startsWith("UPDATE")) {
            return DatabaseOperationInfo.OperationType.UPDATE;
        } else if (upperQuery.startsWith("DELETE")) {
            return DatabaseOperationInfo.OperationType.DELETE;
        } else if (upperQuery.startsWith("FROM")) {
            // JPQL query starting with FROM is a SELECT
            return DatabaseOperationInfo.OperationType.SELECT;
        }

        return DatabaseOperationInfo.OperationType.UNKNOWN;
    }

    /**
     * Determine operation type from method name
     */
    private static DatabaseOperationInfo.OperationType determineOperationTypeFromMethodName(String methodPrefix) {
        if (methodPrefix == null) {
            return DatabaseOperationInfo.OperationType.UNKNOWN;
        }

        String prefix = methodPrefix.toLowerCase();

        if (prefix.equals("find") || prefix.equals("get") || prefix.equals("read") ||
            prefix.equals("query") || prefix.equals("search") || prefix.equals("count") ||
            prefix.equals("exists")) {
            return DatabaseOperationInfo.OperationType.SELECT;
        } else if (prefix.equals("save") || prefix.equals("insert") || prefix.equals("create")) {
            return DatabaseOperationInfo.OperationType.INSERT;
        } else if (prefix.equals("update") || prefix.equals("modify")) {
            return DatabaseOperationInfo.OperationType.UPDATE;
        } else if (prefix.equals("delete") || prefix.equals("remove")) {
            return DatabaseOperationInfo.OperationType.DELETE;
        }

        return DatabaseOperationInfo.OperationType.UNKNOWN;
    }

    /**
     * Get simple annotation name without package
     */
    private static String getSimpleAnnotationName(AnnotationExpr annotation) {
        String name = annotation.getNameAsString();
        if (name.contains(".")) {
            name = name.substring(name.lastIndexOf('.') + 1);
        }
        return name;
    }

    /**
     * Check if method/class has a specific annotation
     */
    private static boolean hasAnnotation(MethodDeclaration method, String annotationName) {
        return method.getAnnotations().stream()
            .anyMatch(ann -> getSimpleAnnotationName(ann).equals(annotationName));
    }

    private static boolean hasAnnotation(ClassOrInterfaceDeclaration classDecl, String annotationName) {
        return classDecl.getAnnotations().stream()
            .anyMatch(ann -> getSimpleAnnotationName(ann).equals(annotationName));
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
     * Extract enum value from annotation (e.g., "Propagation.REQUIRED" -> "REQUIRED")
     */
    private static String extractEnumValue(String value) {
        if (value.contains(".")) {
            return value.substring(value.lastIndexOf('.') + 1);
        }
        return value;
    }
}
