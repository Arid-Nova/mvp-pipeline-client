package edu.baylor.ecs.cloudhubs.chatbot.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ChatbotMessage {
    @NotBlank(message = "messages[].role is required.")
    @Size(max = 32, message = "messages[].role must be at most 32 characters.")
    private String role;

    @NotBlank(message = "messages[].content is required.")
    @Size(max = 2000, message = "messages[].content must be at most 2000 characters.")
    private String content;
}
