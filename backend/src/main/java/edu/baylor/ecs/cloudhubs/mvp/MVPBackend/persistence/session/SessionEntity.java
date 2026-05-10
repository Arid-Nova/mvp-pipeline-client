package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session;

import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.annotation.Id;
import java.time.Instant;
import lombok.Data;

@Data
@Document(collection = "sessions")
public class SessionEntity {

    @Id
    private String id;
    
    private String name;

    private byte[] canvasData; 
    
    private Instant createdAt;
    
    private Instant updatedAt;
    
}
