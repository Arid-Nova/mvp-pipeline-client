package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.systemindex;

import lombok.Getter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "microservice_index")
public class IndexEntity {
    @Id
    private String id;

    @Getter
    private final String componentId;

    @Getter
    private final String endpointId;

    public IndexEntity(String componentId, String endpointId){
        this.componentId = componentId;
        this.endpointId = endpointId;
    }

    public String getId() {
        return id;
    }
}
