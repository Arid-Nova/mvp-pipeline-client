package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import java.time.Instant;
import java.util.List;
import lombok.Data;

@Data
@AllArgsConstructor
public class SessionListResponse {
    private List<SessionSummary> sessions;
    
    @Data
    @AllArgsConstructor
    public static class SessionSummary {
        private String id;
        private String name;
        
        @JsonProperty("updated_at")
        private Instant updatedAt;
    }
}
