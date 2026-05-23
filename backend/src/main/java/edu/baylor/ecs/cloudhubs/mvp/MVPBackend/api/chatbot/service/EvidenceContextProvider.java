package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.service;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model.EvidenceRetrievalResult;

public interface EvidenceContextProvider {
    String providerId();

    boolean supports(EvidenceQueryContext context, String question);

    EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question);
}
