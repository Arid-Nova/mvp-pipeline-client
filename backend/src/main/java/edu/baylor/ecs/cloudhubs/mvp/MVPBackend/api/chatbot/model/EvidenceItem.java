package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class EvidenceItem {
    private String artifactType;
    private String artifactId;
    private String artifactName;
    private String locationHint;
    private String version;
    private String content;

    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Instant timestamp;
}
