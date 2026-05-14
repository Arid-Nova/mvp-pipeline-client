package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.*;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt.PromptAssemblyResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt.PromptAssemblyService;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.prompt.PromptEvidenceItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.LocalLlmClient;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.LocalLlmException;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.runtime.model.LocalLlmResult;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.config.ChatbotConfig;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class ChatbotQueryService {

    private final ChatbotConfig chatbotConfig;
    private final ChatContextService chatContextService;
    private final EvidenceGuardrailService evidenceGuardrailService;
    private final PromptAssemblyService promptAssemblyService;
    private final LocalLlmClient localLlmClient;

    public ChatbotQueryService(
        ChatbotConfig chatbotConfig,
        ChatContextService chatContextService,
        EvidenceGuardrailService evidenceGuardrailService,
        PromptAssemblyService promptAssemblyService,
        LocalLlmClient localLlmClient
    ) {
        this.chatbotConfig = chatbotConfig;
        this.chatContextService = chatContextService;
        this.evidenceGuardrailService = evidenceGuardrailService;
        this.promptAssemblyService = promptAssemblyService;
        this.localLlmClient = localLlmClient;
    }

    public ChatbotResponse query(ChatbotQueryRequest request) {
        long startMs = System.currentTimeMillis();
        ChatbotResponse response = baseResponse(generateRequestId());

        List<EvidenceItem> evidenceItems = chatContextService.collectEvidence(request);
        response = evidenceGuardrailService.enforce(request.getQuestion(), evidenceItems, response);

        if (response.getFlags() != null && response.getFlags().contains(ChatbotFlag.insufficient_evidence)) {
            response.setConfidence(ChatbotConfidence.INSUFFICIENT_EVIDENCE);
            response.setProcessingTimeMs(System.currentTimeMillis() - startMs);
            return response;
        }

        PromptAssemblyResult assembled = promptAssemblyService.assemble(
            request.getQuestion(),
            request.getContext(),
            toPromptEvidence(evidenceItems),
            request.getMessages()
        );

        LocalLlmResult llmResult = localLlmClient.generate(assembled.toChatbotPrompt(), chatbotConfig);
        response.setAnswer(llmResult.getText());
        response.setModel(llmResult.getModel() == null || llmResult.getModel().isBlank() ? chatbotConfig.getModel() : llmResult.getModel());
        response.setProvider(llmResult.getProvider() == null || llmResult.getProvider().isBlank() ? chatbotConfig.getProvider().name() : llmResult.getProvider());
        response.setConfidence(ChatbotConfidence.MEDIUM);
        response = evidenceGuardrailService.enforce(request.getQuestion(), evidenceItems, response);
        response.setProcessingTimeMs(System.currentTimeMillis() - startMs);
        return response;
    }

    public ChatbotResponse unavailableResponse(ChatbotQueryRequest request, LocalLlmException ex, String requestId) {
        ChatbotResponse response = baseResponse(requestId);
        response.setAnswer("Local model runtime is unavailable. " + ex.getMessage());
        response.setConfidence(ChatbotConfidence.LOW);
        response.setFlags(List.of(ChatbotFlag.model_unavailable));
        response.setCitations(List.of());
        return response;
    }

    public String generateRequestId() {
        return "req-" + UUID.randomUUID();
    }

    private ChatbotResponse baseResponse(String requestId) {
        ChatbotResponse response = new ChatbotResponse();
        response.setRequestId(requestId);
        response.setModel(chatbotConfig.getModel());
        response.setProvider(chatbotConfig.getProvider().name());
        response.setCitations(List.of());
        response.setFlags(List.of());
        return response;
    }

    private List<PromptEvidenceItem> toPromptEvidence(List<EvidenceItem> evidenceItems) {
        if (evidenceItems == null || evidenceItems.isEmpty()) {
            return List.of();
        }
        return evidenceItems.stream()
            .map(item -> new PromptEvidenceItem(
                item.getArtifactId(),
                item.getArtifactType(),
                item.getArtifactName(),
                item.getLocationHint(),
                item.getContent()
            ))
            .toList();
    }
}
