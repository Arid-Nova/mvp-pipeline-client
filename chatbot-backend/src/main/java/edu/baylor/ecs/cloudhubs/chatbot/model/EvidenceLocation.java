package edu.baylor.ecs.cloudhubs.chatbot.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class EvidenceLocation {
    private String sourcePath;
    private String sourceEndpoint;
    private String locationHint;
    private Integer lineStart;
    private Integer lineEnd;
}
