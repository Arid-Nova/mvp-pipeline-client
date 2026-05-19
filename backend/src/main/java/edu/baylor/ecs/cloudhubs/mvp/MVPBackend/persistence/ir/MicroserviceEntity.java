package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Date;
import java.util.Map;

@Document(collection = "microservice_ir")
@Getter
@Setter
@NoArgsConstructor
public class MicroserviceEntity {

    @Id
    private String id;

    private String systemName;

    // Legacy uncompressed payload for backward compatibility.
    private Map<String, Object> payload;

    // Primary compressed payload to avoid Mongo document size issues.
    private byte[] payloadCompressed;

    private Date createDate;
    private Date modifyDate;

    public MicroserviceEntity(String systemName, Map<String, Object> payload, byte[] payloadCompressed,
                              Date createDate, Date modifyDate) {
        this.systemName = systemName;
        this.payload = payload;
        this.payloadCompressed = payloadCompressed;
        this.createDate = createDate;
        this.modifyDate = modifyDate;
    }
}
