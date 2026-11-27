package edu.baylor.ecs.cloudhubs.chatbot.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotConfidence;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotFlag;
import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotResponse;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceScope;
import edu.baylor.ecs.cloudhubs.chatbot.retrieval.model.QuestionIntent;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorkflowResultEvidenceContextProviderTest {

    private static final String FORMAL_VERIFICATION_QUESTION =
        "Explain the formal verification result and its supporting findings.";

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final WorkflowResultEvidenceContextProvider provider = new WorkflowResultEvidenceContextProvider();
    private final EvidenceGuardrailService guardrail = new EvidenceGuardrailService();

    @Test
    void completedFormalVerificationResultDirectlySupportsItsMatchingStrictQuestion() {
        EvidenceRetrievalResult retrieval = collectFormalVerificationEvidence();
        EvidenceItem evidence = retrieval.getEvidenceItems().get(0);

        assertEquals(EvidenceArtifactType.CONTEXT_METADATA, evidence.getArtifactType());
        assertEquals(WorkflowResultEvidenceContextProvider.DIRECT_FORMAL_VERIFICATION_SOURCE, evidence.getConfidenceSource());

        ChatbotResponse response = guardrail.enforcePreGeneration(
            FORMAL_VERIFICATION_QUESTION,
            QuestionIntent.UNSUPPORTED_SPECULATIVE,
            retrieval.getEvidenceItems(),
            retrieval.getMissingEvidence(),
            new ChatbotResponse(),
            true
        );
        assertFalse(response.getFlags().contains(ChatbotFlag.INSUFFICIENT_EVIDENCE));

        response.setAnswer("The completed verification result reports no policy violations. [E1]");
        response = guardrail.enforcePostGeneration(
            FORMAL_VERIFICATION_QUESTION,
            QuestionIntent.UNSUPPORTED_SPECULATIVE,
            retrieval.getEvidenceItems(),
            response,
            true
        );

        assertFalse(response.getFlags().contains(ChatbotFlag.INSUFFICIENT_EVIDENCE));
        assertEquals(1, response.getCitations().size());
    }

    @Test
    void formalVerificationEvidenceDoesNotDirectlySupportAnUnrelatedArchitectureQuestion() {
        EvidenceRetrievalResult retrieval = collectFormalVerificationEvidence();
        ChatbotResponse response = guardrail.enforcePreGeneration(
            "Describe the system architecture.",
            QuestionIntent.ARCHITECTURE_TOPOLOGY,
            retrieval.getEvidenceItems(),
            retrieval.getMissingEvidence(),
            new ChatbotResponse(),
            true
        );

        assertEquals(
            ChatbotConfidence.INSUFFICIENT_EVIDENCE,
            response.getConfidence()
        );
        assertTrue(response.getFlags().contains(ChatbotFlag.INSUFFICIENT_EVIDENCE));
    }

    @Test
    void formalVerificationResultAloneDoesNotSupportAComparisonQuestion() {
        EvidenceRetrievalResult retrieval = collectFormalVerificationEvidence();
        String comparisonQuestion = "Compare the formal verification results with the generated scenarios.";
        ChatbotResponse response = new ChatbotResponse();
        response.setAnswer("The verification result agrees with the generated scenarios. [E1]");

        response = guardrail.enforcePostGeneration(
            comparisonQuestion,
            QuestionIntent.UNSUPPORTED_SPECULATIVE,
            retrieval.getEvidenceItems(),
            response,
            true
        );

        assertTrue(response.getFlags().contains(ChatbotFlag.INSUFFICIENT_EVIDENCE));
    }

    private EvidenceRetrievalResult collectFormalVerificationEvidence() {
        ObjectNode record = objectMapper.createObjectNode();
        record.put("cardType", "FORMAL_VERIFY");
        record.put("cardId", "verification-1");
        record.put("summary", "Verification completed with no policy violations.");

        ChatbotContext chatbotContext = new ChatbotContext();
        chatbotContext.setWorkflowEvidence(List.<JsonNode>of(record));
        EvidenceQueryContext context = new EvidenceQueryContext(
            FORMAL_VERIFICATION_QUESTION,
            chatbotContext,
            new EvidenceScope(),
            List.of(),
            null,
            false
        );
        return provider.collectEvidence(context, FORMAL_VERIFICATION_QUESTION);
    }
}
