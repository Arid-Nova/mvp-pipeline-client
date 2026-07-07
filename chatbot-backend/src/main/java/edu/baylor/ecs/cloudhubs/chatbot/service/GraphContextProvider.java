package edu.baylor.ecs.cloudhubs.chatbot.service;

import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.chatbot.model.MissingEvidence;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;

@Component
public class GraphContextProvider implements EvidenceContextProvider {

    @Override
    public String providerId() {
        return "graph-context";
    }

    @Override
    public boolean supports(EvidenceQueryContext context, String question) {
        return hasSystemName(context) || hasDependencyQuestionSignal(question);
    }

    @Override
    public EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question) {
        EvidenceRetrievalResult result = new EvidenceRetrievalResult();
        result.setMissingEvidence(List.of(new MissingEvidence(
            EvidenceArtifactType.GRAPH,
            "Graph evidence retrieval requires a shared graph contract or API client in the standalone chatbot service.",
            hasSystemName(context) ? context.getScope().getSystemName() : "systemName"
        )));
        return result;
    }

    private boolean hasSystemName(EvidenceQueryContext context) {
        return context != null
            && context.getScope() != null
            && context.getScope().getSystemName() != null
            && !context.getScope().getSystemName().isBlank();
    }

    private boolean hasDependencyQuestionSignal(String question) {
        if (question == null) {
            return false;
        }
        String normalized = question.toLowerCase(Locale.ROOT);
        return normalized.contains("depend")
            || normalized.contains("call")
            || normalized.contains("downstream")
            || normalized.contains("upstream")
            || normalized.contains("service graph");
    }
}
