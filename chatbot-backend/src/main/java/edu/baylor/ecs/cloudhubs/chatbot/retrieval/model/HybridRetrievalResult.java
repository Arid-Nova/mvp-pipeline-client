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
        return rankedEvidence == null ? List.of() : rankedEvidence;
    }

    public List<String> getMatchedEntities() {
        return matchedEntities == null ? List.of() : matchedEntities;
    }

    public List<MissingEvidence> getMissingEvidence() {
        return missingEvidence == null ? List.of() : missingEvidence;
    }
}
