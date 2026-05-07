package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmFailureCode;
import lombok.Getter;

@Getter
public class LocalLlmException extends RuntimeException {
    private final LocalLlmFailureCode code;

    public LocalLlmException(LocalLlmFailureCode code, String message) {
        super(message);
        this.code = code;
    }

    public LocalLlmException(LocalLlmFailureCode code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }
}
