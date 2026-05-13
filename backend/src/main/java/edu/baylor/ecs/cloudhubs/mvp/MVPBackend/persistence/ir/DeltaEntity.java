package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.SystemRepository;

@Document(collection = "microservice_delta")
@Data
@NoArgsConstructor
public class DeltaEntity {

    @Id
    private String id;

    private String systemName;

    private byte[] payload;

    private List<SystemRepository> base;

    private List<SystemRepository> comparator;
    
    private Instant createdAt;

    public DeltaEntity(
            String name, 
            byte[] payload, 
            List<SystemRepository> base, 
            List<SystemRepository> comparator) {
        this.systemName = name;
        this.payload = payload;
        this.base = base;
        this.comparator = comparator;
        this.createdAt = Instant.now();
    }

    public String getId() {
        return id;
    }
    
}
