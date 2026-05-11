package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import java.time.Instant;
import java.util.List;
import lombok.Data;

@Data
@AllArgsConstructor
public class SessionPageResponse {
    private List<SessionSummary> sessions;
    private int currentPage;
    private int totalPages;
    private long totalElements;
    
    @Data
    @AllArgsConstructor
    public static class SessionSummary {
        private String id;
        private String name;
        
        @JsonProperty("updated_at")
        private Instant updatedAt;
    }
}
