package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models;

import edu.university.ecs.lab.common.models.enums.ClassType;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Set;

/**
 * Represents a class component that has been indexed with all AbstractClass IR properties.
 * Extends IndexedComponent to include complete class metadata for type navigation.
 */
@Getter
@Setter
@NoArgsConstructor
public class IndexedClass extends IndexedComponent {
    
    /**
     * Package name of the class
     */
    private String packageName;
    
    /**
     * Fully qualified name of the superclass
     */
    private String superclass;
    
    /**
     * Reference to indexed superclass (null if not indexed)
     */
    private String superclassId;
    
    /**
     * Fully qualified names of implemented interfaces
     */
    private Set<String> interfaces;
    
    /**
     * References to indexed interfaces (only those that are indexed)
     */
    private Set<String> interfaceIds;
    
    /**
     * Class type from IR (CLASS, INTERFACE, ENUM, RECORD)
     */
    private ClassType classType;
    
    /**
     * Abstract modifier from IR
     */
    private boolean isAbstract;
    
    /**
     * Final modifier from IR
     */
    private boolean isFinal;
    
    /**
     * Static modifier from IR
     */
    private boolean isStatic;
    
    /**
     * Number of methods in this class (for statistics)
     */
    private int methodCount;
    
    /**
     * Number of fields in this class (for statistics)
     */
    private int fieldCount;
    
    /**
     * Number of annotations in this class (for statistics)
     */
    private int annotationCount;
    
    /**
     * Fully qualified class name (packageName + "." + name)
     */
    private String fullyQualifiedName;
    
    /**
     * Constructor for IndexedClass
     * 
     * @param type Component type ("Class")
     * @param name Component name (simple class name)
     * @param id Service-scoped ID
     * @param fullID Full canonical signature
     * @param microservice Microservice name
     * @param className Class name (same as name for classes)
     * @param metadata Component metadata
     * @param packageName Package name
     * @param superclass Superclass fully qualified name
     * @param superclassId Reference to indexed superclass
     * @param interfaces Implemented interfaces
     * @param interfaceIds References to indexed interfaces
     * @param classType Class type from IR
     * @param isAbstract Abstract modifier
     * @param isFinal Final modifier
     * @param isStatic Static modifier
     * @param methodCount Number of methods
     * @param fieldCount Number of fields
     * @param annotationCount Number of annotations
     * @param fullyQualifiedName Fully qualified class name
     */
    public IndexedClass(String type, String name, String id, String fullID, String microservice, 
                       String className, Object metadata, String packageName, String superclass,
                       String superclassId, Set<String> interfaces, Set<String> interfaceIds,
                       ClassType classType, boolean isAbstract, boolean isFinal, boolean isStatic,
                       int methodCount, int fieldCount, int annotationCount, String fullyQualifiedName) {
        super(type, name, id, fullID, microservice, className, metadata);
        this.packageName = packageName;
        this.superclass = superclass;
        this.superclassId = superclassId;
        this.interfaces = interfaces;
        this.interfaceIds = interfaceIds;
        this.classType = classType;
        this.isAbstract = isAbstract;
        this.isFinal = isFinal;
        this.isStatic = isStatic;
        this.methodCount = methodCount;
        this.fieldCount = fieldCount;
        this.annotationCount = annotationCount;
        this.fullyQualifiedName = fullyQualifiedName;
    }
    
    /**
     * Check if this class extends another class
     * 
     * @return true if the class has a superclass (other than Object)
     */
    public boolean hasSuperclass() {
        return superclass != null && !superclass.equals("java.lang.Object");
    }
    
    /**
     * Check if this class implements any interfaces
     * 
     * @return true if the class implements interfaces
     */
    public boolean hasInterfaces() {
        return interfaces != null && !interfaces.isEmpty();
    }
    
    /**
     * Check if this is an interface
     * 
     * @return true if classType is INTERFACE
     */
    public boolean isInterface() {
        return classType == ClassType.INTERFACE;
    }
    
    /**
     * Check if this is an enum
     * 
     * @return true if classType is ENUM
     */
    public boolean isEnum() {
        return classType == ClassType.ENUM;
    }
    
    /**
     * Check if this is a record
     * 
     * @return true if classType is RECORD
     */
    public boolean isRecord() {
        return classType == ClassType.RECORD;
    }
    
    /**
     * Get the total component count for this class
     * 
     * @return Sum of methods, fields, and annotations
     */
    public int getTotalComponentCount() {
        return methodCount + fieldCount + annotationCount;
    }
}