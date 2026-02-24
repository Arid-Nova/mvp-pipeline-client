package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.component;

import lombok.Getter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Map;

@Document(collection = "microservice_components")
public class ComponentEntity {
    @Id
    private String id;

    @Getter
    private final Map<String, Object> payload;

    public ComponentEntity(Map<String, Object> payload){
        this.payload = payload;
    }

    public String getId() {
        return id;
    }
}
