package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir;

import lombok.Getter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Map;

@Document(collection = "microservice_ir")
public class MicroserviceEntity {

    @Id
    private String id;

    @Getter
    private final Map<String, Object> payload;

    public MicroserviceEntity(Map<String, Object> payload) {
        this.payload = payload;
    }

    public String getId() {
        return id;
    }
}
