package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class SessionResponse {

    @JsonProperty("session_id")
    private String sessionId;
    
}
