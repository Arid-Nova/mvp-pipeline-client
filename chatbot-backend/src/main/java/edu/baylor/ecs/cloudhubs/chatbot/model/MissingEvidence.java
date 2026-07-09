package edu.baylor.ecs.cloudhubs.chatbot.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class MissingEvidence {
    private EvidenceArtifactType artifactType = EvidenceArtifactType.UNKNOWN;
    private String reason;
    private String expectedIdentifier;
}
