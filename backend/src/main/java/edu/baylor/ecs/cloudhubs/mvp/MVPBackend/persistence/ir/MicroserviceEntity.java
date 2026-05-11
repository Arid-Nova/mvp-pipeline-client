package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "microservice_ir")
@Data
@NoArgsConstructor
public class MicroserviceEntity {

    @Id
    private String id;

    private String name;

    private byte[] payload;

    public MicroserviceEntity(String name, byte[] payload) {
        this.name = name;
        this.payload = payload;
    }

    public String getId() {
        return id;
    }
}
