package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ChatbotContextRefreshResponse {
    private boolean success;
    private Map<String, Long> refreshedArtifactCountsByType = new LinkedHashMap<>();
    private List<String> unavailableProviders = List.of();
    private Instant refreshedAt;
    private String refreshVersion;
    private String message;
    private boolean staleContext;
}
