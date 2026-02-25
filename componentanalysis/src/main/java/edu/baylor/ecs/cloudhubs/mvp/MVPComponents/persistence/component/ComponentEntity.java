package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.component;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "microservice_components")
public class ComponentEntity {
    @Id
    private String id;

    // Store as binary data instead of a BSON Document
    private byte[] compressedPayload;

    public ComponentEntity(byte[] compressedPayload) {
        this.compressedPayload = compressedPayload;
    }

    public String getId() {
        return id;
    }

    public byte[] getCompressedPayload() {
        return compressedPayload;
    }
}
