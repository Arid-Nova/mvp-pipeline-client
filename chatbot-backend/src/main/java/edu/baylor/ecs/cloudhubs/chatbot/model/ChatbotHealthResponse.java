package edu.baylor.ecs.cloudhubs.chatbot.model;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ChatbotHealthResponse {
    private String status;
    private String provider;
    private String model;
    private String baseUrl;
    private String message;

    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Instant checkedAt;

    private Long latencyMs;
}
