package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.llm;

import lombok.Data;

@Data
public class SaveLLMConfigRequest {
    private String userId;
    private String provider;
    private String uri;
    private String token;
}
