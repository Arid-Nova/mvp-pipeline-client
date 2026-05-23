package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ChatbotResponse {
    public static final int MAX_CITATIONS = 10;

    private String answer;
    private List<CitationItem> citations = new ArrayList<>();
    private ChatbotConfidence confidence;
    private List<ChatbotFlag> flags = new ArrayList<>();
    private String requestId;
    private long processingTimeMs;
    private String model;
    private String provider;
    private Map<String, Object> traceMetadata;

    public void setCitations(List<CitationItem> citations) {
        if (citations == null) {
            this.citations = new ArrayList<>();
            return;
        }
        if (citations.size() <= MAX_CITATIONS) {
            this.citations = new ArrayList<>(citations);
            return;
        }
        this.citations = new ArrayList<>(citations.subList(0, MAX_CITATIONS));
    }

    public List<CitationItem> getCitations() {
        return citations == null ? Collections.emptyList() : citations;
    }
}
