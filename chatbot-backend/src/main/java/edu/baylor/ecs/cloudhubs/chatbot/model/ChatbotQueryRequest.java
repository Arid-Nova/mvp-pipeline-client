package edu.baylor.ecs.cloudhubs.chatbot.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ChatbotQueryRequest {
    @NotBlank(message = "question is required and must be non-empty.")
    @Size(max = 2000, message = "question must be at most 2000 characters.")
    private String question;

    @Valid
    private ChatbotContext context;

    @Pattern(
        regexp = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        message = "conversationId must be a valid UUID."
    )
    private String conversationId;

    @Valid
    @Size(max = 8, message = "messages supports at most 8 prior turns.")
    private List<ChatbotMessage> messages;
}
