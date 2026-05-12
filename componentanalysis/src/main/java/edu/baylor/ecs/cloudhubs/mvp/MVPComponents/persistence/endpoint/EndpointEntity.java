package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.endpoint;

import lombok.Getter;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.EndpointIndex;

@Document(collection = "microservice_endpoints")
public class EndpointEntity {
    @Id
    private String id;

    @Getter
    private byte[] payload;

    public EndpointEntity(byte[] payload){
        this.payload = payload;
    }

    public String getId() {
        return id;
    }
}
