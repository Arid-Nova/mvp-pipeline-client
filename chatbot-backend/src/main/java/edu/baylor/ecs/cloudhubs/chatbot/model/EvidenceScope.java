package edu.baylor.ecs.cloudhubs.chatbot.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class EvidenceScope {
    private String systemName;
    private String irId;
    private String indexId;
    private String runId;
    private String commitId;
    private String entityType;
    private String entityName;
    private String serviceName;
    private String endpointPath;
    private String httpMethod;
    private String sessionId;
}
