package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class PromptEvidenceItem {
    private String evidenceId;
    private String artifactType;
    private String artifactId;
    private String artifactVersion;
    private String locationHint;
    private String entityName;
    private String serviceName;
    private String endpointPath;
    private String summary;
    private String antiPatternMarkers;

    public PromptEvidenceItem(
        String evidenceId,
        String artifactType,
        String artifactId,
        String artifactVersion,
        String locationHint,
        String entityName,
        String serviceName,
        String endpointPath,
        String summary
    ) {
        this.evidenceId = evidenceId;
        this.artifactType = artifactType;
        this.artifactId = artifactId;
        this.artifactVersion = artifactVersion;
        this.locationHint = locationHint;
        this.entityName = entityName;
        this.serviceName = serviceName;
        this.endpointPath = endpointPath;
        this.summary = summary;
    }
}
