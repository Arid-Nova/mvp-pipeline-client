package edu.baylor.ecs.cloudhubs.chatbot.service;

import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceRetrievalResult;
import edu.baylor.ecs.cloudhubs.chatbot.model.MissingEvidence;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class IrContextProvider implements EvidenceContextProvider {

    @Override
    public String providerId() {
        return "ir-context";
    }

    @Override
    public boolean supports(EvidenceQueryContext context, String question) {
        return context != null && context.getScope() != null && (
            hasValue(context.getScope().getIrId())
                || hasValue(context.getScope().getSystemName())
                || hasValue(context.getScope().getIndexId())
                || hasValue(context.getScope().getRunId())
        );
    }

    @Override
    public EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question) {
        EvidenceRetrievalResult result = new EvidenceRetrievalResult();
        result.setMissingEvidence(List.of(new MissingEvidence(
            EvidenceArtifactType.IR,
            "IR evidence retrieval requires a shared IR contract or API client in the standalone chatbot service.",
            resolveSelector(context)
        )));
        return result;
    }

    private String resolveSelector(EvidenceQueryContext context) {
        if (context == null || context.getScope() == null) {
            return "irId|systemName";
        }
        if (hasValue(context.getScope().getIrId())) {
            return context.getScope().getIrId();
        }
        if (hasValue(context.getScope().getSystemName())) {
            return context.getScope().getSystemName();
        }
        if (hasValue(context.getScope().getIndexId())) {
            return context.getScope().getIndexId();
        }
        if (hasValue(context.getScope().getRunId())) {
            return context.getScope().getRunId();
        }
        return "irId|systemName";
    }

    private boolean hasValue(String value) {
        return value != null && !value.isBlank();
    }
}
