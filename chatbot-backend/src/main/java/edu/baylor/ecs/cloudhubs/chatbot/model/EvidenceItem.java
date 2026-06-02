package edu.baylor.ecs.cloudhubs.chatbot.model;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import edu.baylor.ecs.cloudhubs.chatbot.util.StringUtils;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@NoArgsConstructor
public class EvidenceItem {
    private EvidenceArtifactType artifactType = EvidenceArtifactType.UNKNOWN;
    private String artifactId = "unknown-artifact";
    private String artifactVersion;
    private String commitId;
    private String sourcePath;
    private String sourceEndpoint;
    private String locationHint;
    private String entityType;
    private String entityName;
    private String serviceName;
    private String endpointPath;
    private String httpMethod;
    private String confidenceSource;
    private Double supportStrength;
    private String contentText;
    private JsonNode structuredPayload;

    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Instant timestamp;

    // Legacy S12-M1 constructor retained for backward compatibility.
    public EvidenceItem(
        String artifactType,
        String artifactId,
        String artifactName,
        String locationHint,
        String version,
        String content,
        Instant timestamp
    ) {
        setArtifactType(EvidenceArtifactType.fromValue(artifactType));
        setArtifactId(artifactId);
        this.entityName = artifactName;
        this.locationHint = locationHint;
        this.artifactVersion = version;
        this.contentText = content;
        this.timestamp = timestamp;
    }

    public void setArtifactType(EvidenceArtifactType artifactType) {
        this.artifactType = artifactType == null ? EvidenceArtifactType.UNKNOWN : artifactType;
    }

    public void setArtifactId(String artifactId) {
        this.artifactId = StringUtils.isBlank(artifactId) ? "unknown-artifact" : artifactId;
    }

    @JsonIgnore
    public String getArtifactTypeValue() {
        return artifactType == null ? EvidenceArtifactType.UNKNOWN.name() : artifactType.name();
    }

    // Legacy alias: artifactName -> entityName
    @JsonProperty("artifactName")
    public String getArtifactName() {
        return StringUtils.firstNonBlank(entityName, serviceName, endpointPath, artifactId);
    }

    @JsonProperty("artifactName")
    public void setArtifactName(String artifactName) {
        this.entityName = artifactName;
    }

    // Legacy alias: version -> artifactVersion/commitId
    @JsonProperty("version")
    public String getVersion() {
        return StringUtils.firstNonBlank(artifactVersion, commitId);
    }

    @JsonProperty("version")
    public void setVersion(String version) {
        this.artifactVersion = version;
    }

    // Legacy alias: content -> contentText
    @JsonProperty("content")
    public String getContent() {
        return contentText;
    }

    @JsonProperty("content")
    public void setContent(String content) {
        this.contentText = content;
    }
}
