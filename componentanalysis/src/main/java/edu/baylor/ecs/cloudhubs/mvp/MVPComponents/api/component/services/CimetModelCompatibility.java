package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.services;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.ConstructorDeclaration;
import com.github.javaparser.ast.expr.MethodCallExpr;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.Expression;
import edu.university.ecs.lab.common.models.ir.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Compatibility with the former component-index fork. Missing evidence is never synthesized. */
public final class CimetModelCompatibility {
    private CimetModelCompatibility() { }
    private static final ThreadLocal<Map<Path, CompilationUnit>> SOURCES = ThreadLocal.withInitial(HashMap::new);
    public static final List<String> LIMITATIONS = List.of(
            "Java component IDs use the version-2 service-scoped signature format; regenerate dependent indexes together.",
            "Call-target recovery resolves unique source-local calls only; external, ambiguous and dynamic calls remain unresolved.",
            "Constructors are recovered from source; constructor CFGs use the same conservative Java AST pipeline as methods.");

    private static final ThreadLocal<Map<Method, ConstructorDeclaration>> CONSTRUCTORS = ThreadLocal.withInitial(IdentityHashMap::new);
    private static final ThreadLocal<Map<MethodCall, Method>> TARGETS = ThreadLocal.withInitial(IdentityHashMap::new);
    public static void clear() { SOURCES.remove(); CONSTRUCTORS.remove(); TARGETS.remove(); }

    /** Restore source-backed method metadata which Endpoint's base-IR copy omits. */
    public static void prepare(MicroserviceSystem system) {
        for (Microservice service : system.getMicroservices()) {
            String repository = Objects.toString(service.getRepositoryURL(), "");
            String repoName = repository.substring(repository.lastIndexOf('/') + 1).replaceFirst("\\.git$", "");
            Path clone = Path.of(edu.university.ecs.lab.common.utils.FileUtils.getRepositoryPath(repoName));
            if (Files.isDirectory(clone) && service.getPath() != null) {
                Path resolved = Path.of(edu.university.ecs.lab.common.utils.FileUtils.gitPathToLocalPath(service.getPath().toString(), repoName));
                if (Files.isDirectory(resolved)) service.setPath(resolved.toAbsolutePath().normalize());
            }
            for (AbstractClass type : service.getClasses()) {
                if (!Files.isRegularFile(type.getPath())) {
                    if (type.getPath().isAbsolute() && !Files.isDirectory(clone))
                        throw new IllegalStateException("Java source is required for component indexing");
                    Path resolved = Path.of(edu.university.ecs.lab.common.utils.FileUtils.gitPathToLocalPath(type.getPath().toString(), repoName));
                    if (!Files.isRegularFile(resolved)) throw new IllegalStateException("Java source is required for component indexing");
                    type.setPath(resolved.toAbsolutePath().normalize());
                }
                recoverConstructors(type);
                for (Method method : type.getMethods()) {
                    MethodDeclaration declaration = declaration(method);
                    if (declaration != null) {
                        method.setAnnotations(declaration.getAnnotations().stream()
                                .map(annotation -> new Annotation(method, annotation)).collect(Collectors.toCollection(LinkedHashSet::new)));
                        method.setReturnType(declaration.getTypeAsString());
                    } else throw new IllegalStateException("Java method source binding is ambiguous or missing");
                }
            }
        }
        for (Microservice service : system.getMicroservices()) for (AbstractClass type : service.getClasses())
            for (Method method : type.getMethods()) for (MethodCall call : method.getMethodCalls()) {
                List<MethodCallExpr> observations = source(owner(call)).findAll(MethodCallExpr.class).stream()
                        .filter(candidate -> candidate.getNameAsString().equals(call.getName()))
                        .filter(candidate -> call.getLocation() != null && candidate.getBegin().map(position -> position.line == call.getLocation().getStartLine()).orElse(false))
                        .filter(candidate -> candidate.getArguments().stream().map(Object::toString).collect(Collectors.joining(",")).equals(call.getParameterContents()))
                        .filter(candidate -> candidate.findAncestor(com.github.javaparser.ast.body.CallableDeclaration.class)
                                .map(parent -> parent.getNameAsString().equals(method.getName())).orElse(false))
                        .toList();
                MethodCallExpr expression = observations.size() == 1 ? observations.getFirst() : null;
                if (expression == null || expression.getScope().isPresent() && !expression.getScope().get().isThisExpr()) continue;
                List<Method> candidates = type.getMethods().stream().filter(candidate -> !isConstructor(candidate)
                        && candidate.getName().equals(call.getName()) && candidate.getParameters().size() == expression.getArguments().size()).toList();
                if (candidates.size() == 1) TARGETS.get().put(call,candidates.getFirst());
            }
    }

    private static void recoverConstructors(AbstractClass type) {
        CompilationUnit unit = source(type);
        if (unit == null) return;
        var declaration = unit.findAll(com.github.javaparser.ast.body.ClassOrInterfaceDeclaration.class).stream()
                .filter(candidate -> candidate.getNameAsString().equals(type.getName())).findFirst().orElse(null);
        if (declaration == null) return;
        Set<Method> methods = new LinkedHashSet<>(type.getMethods());
        for (ConstructorDeclaration constructor : declaration.getConstructors()) {
            Method value = new Method(type,constructor.getNameAsString(),new Location(constructor.getRange().orElseThrow()));
            value.setParameters(constructor.getParameters().stream().map(parameter -> new Parameter(value,parameter)).collect(Collectors.toCollection(LinkedHashSet::new)));
            value.setAnnotations(constructor.getAnnotations().stream().map(annotation -> new Annotation(value,annotation)).collect(Collectors.toCollection(LinkedHashSet::new)));
            value.setProtection(edu.university.ecs.lab.common.models.enums.AccessModifier.fromAccessSpecifier(constructor.getAccessSpecifier()));
            value.setThrownExceptions(constructor.getThrownExceptions().stream().map(Object::toString).collect(Collectors.toSet()));
            value.setMethodCalls(edu.university.ecs.lab.common.utils.SourceToObjectUtils.parseMethodCalls(value,constructor.findAll(MethodCallExpr.class)));
            CONSTRUCTORS.get().put(value,constructor);
            methods.add(value);
        }
        type.setMethods(methods);
    }

    public static Set<Annotation> annotations(Field field) {
        AbstractClass owner = owner(field);
        CompilationUnit source = source(owner);
        if (source == null) return Set.of();
        for (FieldDeclaration declaration : source.findAll(FieldDeclaration.class)) {
            boolean sameLine = field.getLocation() == null || declaration.getRange().map(range ->
                    range.begin.line <= field.getLocation().getStartLine() && range.end.line >= field.getLocation().getStartLine()).orElse(false);
            if (sameLine && declaration.getVariables().stream().anyMatch(variable -> variable.getNameAsString().equals(field.getName()))) {
                return declaration.getAnnotations().stream().map(annotation -> new Annotation(field, annotation))
                        .collect(Collectors.toCollection(LinkedHashSet::new));
            }
        }
        return Set.of();
    }

    public static String id(Node node) {
        Node cursor = node;
        while (cursor != null && !(cursor instanceof Microservice)) cursor = parent(cursor);
        String service = cursor == null ? "orphan" : cursor.getName();
        return service + ":" + UUID.nameUUIDFromBytes(fullId(node).getBytes(StandardCharsets.UTF_8));
    }

    public static String fullId(Node node) {
        if (node instanceof AbstractClass type) {
            Node context = parent(type);
            while (context != null && !(context instanceof Microservice)) context = parent(context);
            String repository = context instanceof Microservice service ? Objects.toString(service.getRepositoryURL(), "") : "orphan";
            String serviceIdentity = "orphan";
            if (context instanceof Microservice service) {
                String repoName = repository.substring(repository.lastIndexOf('/') + 1).replaceFirst("\\.git$", "");
                String root = service.getPath() == null ? "" : edu.university.ecs.lab.common.utils.FileUtils
                        .normalizeRepositoryPath(service.getPath().toString(), repoName);
                if(service.getMetadata()!=null && service.getMetadata().has("sourceServicePath")) root=service.getMetadata().getString("sourceServicePath");
                serviceIdentity = service.getName() + "@" + root;
            }
            String source = type.getPath().toString().replace('\\', '/');
            if (context instanceof Microservice service && service.getPath() != null
                    && type.getPath().toAbsolutePath().normalize().startsWith(service.getPath().toAbsolutePath().normalize())) {
                source = service.getPath().toAbsolutePath().normalize().relativize(type.getPath().toAbsolutePath().normalize()).toString().replace('\\', '/');
            }
            return repository + "#service:" + serviceIdentity + "#" + source + "#" + Objects.toString(type.getPackageName(), "") + "." + type.getName();
        }
        if (node instanceof Method method) {
            MethodDeclaration declaration = declaration(method);
            String parameters = declaration == null ? method.getParameters().stream()
                    .sorted(Comparator.comparingInt((Parameter parameter) -> parameter.getLocation() == null ? 0 : parameter.getLocation().getStartLine())
                            .thenComparing(Parameter::getName))
                    .map(CimetModelCompatibility::parameterType).collect(Collectors.joining(","))
                    : declaration.getParameters().stream().map(parameter -> parameter.getTypeAsString() + (parameter.isVarArgs() ? "..." : ""))
                    .collect(Collectors.joining(","));
            return fullId(parent(method)) + (isConstructor(method) ? "#constructor:" : "#method:") + method.getName() + "(" + parameters + ")";
        }
        if (node == null) return "orphan";
        Node parent = parent(node);
        return (parent == null ? "orphan" : fullId(parent)) + "#" + node.getClass().getSimpleName() + ":" + node.getName();
    }

    public static String parameterType(Parameter parameter) {
        return parameter.getParameterType() + (Boolean.TRUE.equals(parameter.getIsVariableParameter()) ? "..." : "");
    }

    public static Boolean isConstructor(Method method) { return CONSTRUCTORS.get().containsKey(method); }
    public static String targetId(MethodCall call) { Method target = TARGETS.get().get(call); return target == null ? null : id(target); }
    public static String targetCanonicalId(MethodCall call) { Method target = TARGETS.get().get(call); return target == null ? null : fullId(target); }

    public static String originalUrl(Endpoint endpoint) {
        MethodDeclaration declaration = declaration(endpoint);
        if (declaration == null) return endpoint.getUrl();
        AbstractClass owner = owner(endpoint);
        List<String> prefixes = new ArrayList<>();
        if (owner != null) for (Annotation annotation : owner.getAnnotations()) {
            if (annotation.getName().endsWith("RequestMapping")) {
                String path = annotation.getAttributes().getOrDefault("value", annotation.getAttributes().getOrDefault("path",
                        annotation.getAttributes().get("default")));
                if (path != null) prefixes.add(path);
            }
        }
        if (prefixes.isEmpty()) prefixes.add("");
        for (AnnotationExpr annotation : declaration.getAnnotations()) {
            if (!annotation.getNameAsString().endsWith("Mapping")) continue;
            List<String> paths = new ArrayList<>();
            if (annotation.isSingleMemberAnnotationExpr()) literals(annotation.asSingleMemberAnnotationExpr().getMemberValue(), paths);
            if (annotation.isNormalAnnotationExpr()) annotation.asNormalAnnotationExpr().getPairs().stream()
                    .filter(pair -> Set.of("path", "value").contains(pair.getNameAsString())).forEach(pair -> literals(pair.getValue(), paths));
            if (paths.isEmpty()) paths.add("");
            for (String prefix : prefixes) for (String path : paths) {
                String candidate = ("/" + prefix + "/" + path).replaceAll("/+", "/");
                if (candidate.length() > 1 && candidate.endsWith("/")) candidate = candidate.substring(0, candidate.length() - 1);
                if (candidate.replaceAll("\\{[^}]+}", "{?}").equals(endpoint.getUrl())) return candidate;
            }
        }
        return endpoint.getUrl();
    }

    public static List<String> originalParamNames(Endpoint endpoint) {
        var matcher = Pattern.compile("\\{([^}]+)}").matcher(Objects.toString(originalUrl(endpoint), ""));
        List<String> names = new ArrayList<>();
        while (matcher.find()) if (!matcher.group(1).equals("?")) names.add(matcher.group(1));
        return names;
    }

    private static void literals(Expression expression, List<String> target) {
        if (expression.isStringLiteralExpr()) target.add(expression.asStringLiteralExpr().asString());
        else if (expression.isArrayInitializerExpr()) expression.asArrayInitializerExpr().getValues().forEach(value -> literals(value, target));
    }

    public static MethodDeclaration declaration(Method method) {
        ConstructorDeclaration constructor = CONSTRUCTORS.get().get(method);
        if (constructor != null) {
            MethodDeclaration compatible = new MethodDeclaration().setName(constructor.getNameAsString()).setType("void");
            compatible.setParameters(constructor.getParameters().stream().map(com.github.javaparser.ast.body.Parameter::clone).collect(com.github.javaparser.ast.NodeList.toNodeList())); compatible.setBody(constructor.getBody().clone());
            compatible.setAnnotations(constructor.getAnnotations().stream().map(com.github.javaparser.ast.expr.AnnotationExpr::clone).collect(com.github.javaparser.ast.NodeList.toNodeList())); compatible.setModifiers(constructor.getModifiers().stream().map(com.github.javaparser.ast.Modifier::clone).collect(com.github.javaparser.ast.NodeList.toNodeList()));
            compatible.setThrownExceptions(constructor.getThrownExceptions().stream().map(com.github.javaparser.ast.type.ReferenceType::clone).collect(com.github.javaparser.ast.NodeList.toNodeList())); compatible.setRange(constructor.getRange().orElse(null));
            return compatible;
        }
        CompilationUnit source = source(owner(method));
        if (source == null) return null;
        List<MethodDeclaration> candidates = source.findAll(MethodDeclaration.class).stream()
                .filter(declaration -> declaration.getNameAsString().equals(method.getName()))
                .filter(declaration -> declaration.getParameters().size() == method.getParameters().size()
                        && declaration.getParameters().stream().allMatch(parameter -> method.getParameters().stream()
                        .anyMatch(observed -> parameter.getNameAsString().equals(observed.getName())
                                && parameter.getTypeAsString().equals(observed.getParameterType())
                                && parameter.isVarArgs() == Boolean.TRUE.equals(observed.getIsVariableParameter()))))
                .filter(declaration -> method.getLocation() == null || declaration.getBegin()
                        .map(position -> position.line == method.getLocation().getStartLine()).orElse(false)).toList();
        return candidates.size() == 1 ? candidates.getFirst() : null;
    }

    private static CompilationUnit source(AbstractClass type) {
        if (type == null || type.getPath() == null || !type.getPath().toString().endsWith(".java")) return null;
        Path path = type.getPath().toAbsolutePath().normalize();
        if (!Files.isRegularFile(path)) return null;
        return SOURCES.get().computeIfAbsent(path, source -> {
            try { return StaticJavaParser.parse(source); }
            catch (Exception failure) { throw new IllegalStateException("Cannot recover required Java source metadata", failure); }
        });
    }
    private static AbstractClass owner(Node node) {
        while (node != null && !(node instanceof AbstractClass)) node = parent(node);
        return (AbstractClass) node;
    }
    private static Node parent(Node node) {
        return node == null || node.getParent() == null ? null : node.getParent().orElse(null);
    }
}
