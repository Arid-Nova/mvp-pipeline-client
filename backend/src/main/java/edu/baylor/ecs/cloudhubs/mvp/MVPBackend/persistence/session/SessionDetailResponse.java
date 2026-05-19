package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import java.time.Instant;
import lombok.Data;

@Data
@AllArgsConstructor
public class SessionDetailResponse {
    private String id;
    
    private String name;
    
    @JsonProperty("updated_at")
    private Instant updatedAt;
}
