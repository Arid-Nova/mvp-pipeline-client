package edu.baylor.ecs.cloudhubs.chatbot.model;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class ChatbotQueryRequestValidationTest {

    private static ValidatorFactory validatorFactory;
    private static Validator validator;

    @BeforeAll
    static void setupValidator() {
        validatorFactory = Validation.buildDefaultValidatorFactory();
        validator = validatorFactory.getValidator();
    }

    @AfterAll
    static void closeValidator() {
        validatorFactory.close();
    }

    @Test
    void acceptsValidRequest() {
        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "Which services changed in this commit?",
            new ChatbotContext("TrainTicket", "ir-1", "index-1", "run-1", "abc123", "order-service", "GET /orders", null),
            "3f2b8c1e-9a4d-4e6f-b1c2-7d8e9f0a1b2c",
            List.of(new ChatbotMessage("user", "previous turn"))
        );

        Set<ConstraintViolation<ChatbotQueryRequest>> violations = validator.validate(request);
        assertThat(violations).isEmpty();
    }

    @Test
    void rejectsMalformedConversationId() {
        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "Which services changed in this commit?",
            null,
            "conv-2",
            null
        );

        Set<ConstraintViolation<ChatbotQueryRequest>> violations = validator.validate(request);
        assertThat(violations)
            .extracting(ConstraintViolation::getMessage)
            .containsExactly("conversationId must be a valid UUID.");
    }

    @Test
    void rejectsEmptyQuestion() {
        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "   ",
            null,
            null,
            null
        );

        Set<ConstraintViolation<ChatbotQueryRequest>> violations = validator.validate(request);
        assertThat(violations)
            .extracting(ConstraintViolation::getMessage)
            .contains("question is required and must be non-empty.");
    }

    @Test
    void rejectsOverlongQuestion() {
        String longQuestion = "q".repeat(2001);
        ChatbotQueryRequest request = new ChatbotQueryRequest(
            longQuestion,
            null,
            null,
            null
        );

        Set<ConstraintViolation<ChatbotQueryRequest>> violations = validator.validate(request);
        assertThat(violations)
            .extracting(ConstraintViolation::getMessage)
            .contains("question must be at most 2000 characters.");
    }

    @Test
    void rejectsTooManyPriorMessages() {
        List<ChatbotMessage> messages = new ArrayList<>();
        for (int i = 0; i < 9; i++) {
            messages.add(new ChatbotMessage("user", "turn " + i));
        }
        ChatbotQueryRequest request = new ChatbotQueryRequest(
            "Summarize this run.",
            null,
            "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
            messages
        );

        Set<ConstraintViolation<ChatbotQueryRequest>> violations = validator.validate(request);
        assertThat(violations)
            .extracting(ConstraintViolation::getMessage)
            .containsExactly("messages supports at most 8 prior turns.");
    }
}
