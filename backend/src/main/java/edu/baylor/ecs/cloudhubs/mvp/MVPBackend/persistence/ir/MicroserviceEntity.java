package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "microservice_ir")
@Data
@NoArgsConstructor
public class MicroserviceEntity {

    @Id
    private String id;

    private String name;

    private String version;

    private byte[] payload;

    private Instant createdAt;

    public MicroserviceEntity(String name, byte[] payload) {
        this.name = name;
        this.version = null;
        this.payload = payload;
        this.createdAt = Instant.now();
    }

    public String getId() {
        return id;
    }
}
