package edu.baylor.ecs.cloudhubs.chatbot.service;

import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceRetrievalResult;

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
