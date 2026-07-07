package edu.baylor.ecs.cloudhubs.chatbot.runtime.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class LocalLlmResult {
    private String text;
    private String model;
    private String provider;
    private Integer rawStatus;
    private String finishReason;
}
