package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.llm;

import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.annotation.Id;
import java.time.Instant;
import lombok.Data;

@Data
@Document(collection = "llm_configs")
public class LLMConfigEntity {
    @Id
    private String id;
    
    private String userId;
    private String provider; // "internal", "local", "external"
    private String uri;
    private String encryptedToken;
    private boolean isDefault;
    
    private Instant createdAt;
    private Instant updatedAt;
}