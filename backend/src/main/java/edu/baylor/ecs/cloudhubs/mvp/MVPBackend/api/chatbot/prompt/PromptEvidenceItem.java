package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class PromptEvidenceItem {
    private String evidenceId;
    private String artifactType;
    private String artifactName;
    private String locationHint;
    private String summary;
}
