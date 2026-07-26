package edu.baylor.ecs.cloudhubs.chatbot.retrieval.model;

import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import edu.baylor.ecs.cloudhubs.chatbot.model.MissingEvidence;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class HybridRetrievalResult {
    private QuestionIntent intent = QuestionIntent.UNSUPPORTED_SPECULATIVE;
    private RetrievalStrategy strategy = RetrievalStrategy.NONE;
    private List<String> matchedEntities = new ArrayList<>();
    private List<EvidenceItem> rankedEvidence = new ArrayList<>();
    private int evidenceCount;
    private List<MissingEvidence> missingEvidence = new ArrayList<>();

    public List<EvidenceItem> getRankedEvidence() {
        if (rankedEvidence == null) rankedEvidence = new ArrayList<>();
        return rankedEvidence;
    }

    public List<String> getMatchedEntities() {
        if (matchedEntities == null) matchedEntities = new ArrayList<>();
        return matchedEntities;
    }

    public List<MissingEvidence> getMissingEvidence() {
        if (missingEvidence == null) missingEvidence = new ArrayList<>();
        return missingEvidence;
    }
}
