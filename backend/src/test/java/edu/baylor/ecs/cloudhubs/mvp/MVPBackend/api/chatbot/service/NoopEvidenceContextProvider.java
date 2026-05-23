package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceRetrievalResult;

public class NoopEvidenceContextProvider implements EvidenceContextProvider {
    @Override
    public String providerId() {
        return "noop";
    }

    @Override
    public boolean supports(EvidenceQueryContext context, String question) {
        return true;
    }

    @Override
    public EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question) {
        return new EvidenceRetrievalResult();
    }
}
