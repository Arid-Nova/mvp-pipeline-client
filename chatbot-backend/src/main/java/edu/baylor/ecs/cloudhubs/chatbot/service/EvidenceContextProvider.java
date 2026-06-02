package edu.baylor.ecs.cloudhubs.chatbot.service;

import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceQueryContext;
import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceRetrievalResult;

public interface EvidenceContextProvider {
    String providerId();

    boolean supports(EvidenceQueryContext context, String question);

    EvidenceRetrievalResult collectEvidence(EvidenceQueryContext context, String question);
}
