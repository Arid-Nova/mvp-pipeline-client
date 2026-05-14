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

    /**
     * Indexed-friendly system name for queries.
     */
    private String systemName;

    /**
     * Legacy uncompressed payload. Kept for backward compatibility reads.
     */
    private Map<String, Object> payload;

    /**
     * Compressed JSON payload for large IRs that would exceed Mongo's 16MB doc size limit.
     */
    private byte[] payloadCompressed;

    private Date createDate;
    private Date modifyDate;

    public MicroserviceEntity(String systemName, Map<String, Object> payload, byte[] payloadCompressed, Date createDate, Date modifyDate) {
        this.systemName = systemName;
        this.payload = payload;
        this.payloadCompressed = payloadCompressed;
        this.createDate = createDate;
        this.modifyDate = modifyDate;
    }
}
