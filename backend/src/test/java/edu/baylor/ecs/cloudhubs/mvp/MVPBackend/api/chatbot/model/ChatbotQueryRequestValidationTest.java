package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model;

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
            new ChatbotContext("TrainTicket", "ir-1", "index-1", "run-1", "abc123", "order-service", "GET /orders"),
            "conv-2",
            List.of(new ChatbotMessage("user", "previous turn"))
        );

        Set<ConstraintViolation<ChatbotQueryRequest>> violations = validator.validate(request);
        assertThat(violations).isEmpty();
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
            "conv-3",
            messages
        );

        Set<ConstraintViolation<ChatbotQueryRequest>> violations = validator.validate(request);
        assertThat(violations)
            .extracting(ConstraintViolation::getMessage)
            .contains("messages supports at most 8 prior turns.");
    }
}
