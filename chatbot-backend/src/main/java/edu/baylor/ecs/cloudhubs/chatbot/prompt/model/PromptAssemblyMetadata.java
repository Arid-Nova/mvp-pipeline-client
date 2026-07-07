package edu.baylor.ecs.cloudhubs.chatbot.prompt.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class PromptAssemblyMetadata {
    private boolean truncated;
    private boolean staleContext;
}
