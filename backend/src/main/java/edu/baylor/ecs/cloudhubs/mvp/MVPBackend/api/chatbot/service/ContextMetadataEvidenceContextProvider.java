package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceArtifactType;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceRetrievalResult;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Component
public class ContextMetadataEvidenceContextProvider implements EvidenceContextProvider {

    @Override
    public String providerId() {
        return "context-metadata";
    }

    @Override
    public boolean supports(EvidenceQueryContext context, String question) {
        return context != null && context.getScope() != null;
    }

    @Override
    public EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question) {
        if (context == null || context.getScope() == null) {
            return new EvidenceRetrievalResult();
        }

        EvidenceItem item = new EvidenceItem();
        item.setArtifactType(EvidenceArtifactType.CONTEXT_METADATA);
        item.setArtifactId(contextIdentifier(context));
        item.setEntityName(valueOrNA(context.getScope().getSystemName()));
        item.setLocationHint("active-context");
        item.setArtifactVersion(valueOrNA(context.getScope().getCommitId()));
        item.setCommitId(context.getScope().getCommitId());
        item.setServiceName(context.getScope().getServiceName());
        item.setEndpointPath(context.getScope().getEndpointPath());
        item.setContentText(buildContextContent(context));
        item.setConfidenceSource("context-provider");
        item.setSupportStrength(1.0);
        item.setTimestamp(Instant.now());

        EvidenceRetrievalResult result = new EvidenceRetrievalResult();
        result.setEvidenceItems(new ArrayList<>(List.of(item)));
        return result;
    }

    private String contextIdentifier(EvidenceQueryContext context) {
        if (hasValue(context.getScope().getCommitId())) {
            return "commit:" + context.getScope().getCommitId().trim();
        }
        if (hasValue(context.getScope().getIrId())) {
            return "ir:" + context.getScope().getIrId().trim();
        }
        if (hasValue(context.getScope().getRunId())) {
            return "run:" + context.getScope().getRunId().trim();
        }
        if (hasValue(context.getScope().getSystemName())) {
            return "system:" + context.getScope().getSystemName().trim();
        }
        return "active-context";
    }

    private String buildContextContent(EvidenceQueryContext context) {
        return "Active context selected"
            + "; system=" + valueOrNA(context.getScope().getSystemName())
            + "; irId=" + valueOrNA(context.getScope().getIrId())
            + "; indexId=" + valueOrNA(context.getScope().getIndexId())
            + "; runId=" + valueOrNA(context.getScope().getRunId())
            + "; commitId=" + valueOrNA(context.getScope().getCommitId())
            + "; selectedService=" + valueOrNA(context.getScope().getServiceName())
            + "; selectedEndpoint=" + valueOrNA(context.getScope().getEndpointPath());
    }

    private boolean hasValue(String value) {
        return value != null && !value.isBlank();
    }

    private String valueOrNA(String value) {
        return hasValue(value) ? value.trim() : "n/a";
    }
}
