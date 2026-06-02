package edu.baylor.ecs.cloudhubs.chatbot.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
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

    @Size(max = 128, message = "conversationId must be at most 128 characters.")
    private String conversationId;

    @Valid
    @Size(max = 8, message = "messages supports at most 8 prior turns.")
    private List<ChatbotMessage> messages;
}
