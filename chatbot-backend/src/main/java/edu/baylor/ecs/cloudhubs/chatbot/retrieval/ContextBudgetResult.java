package edu.baylor.ecs.cloudhubs.chatbot.retrieval;

import edu.baylor.ecs.cloudhubs.chatbot.model.EvidenceItem;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ContextBudgetResult {
    private List<EvidenceItem> retainedEvidence = new ArrayList<>();
    private int originalEvidenceCount;
    private int retainedEvidenceCount;
    private boolean truncated;
    private Map<String, Integer> omittedArtifactTypeCounts;
    private int maxEvidenceItems;
    private int maxEvidenceChars;

    public List<EvidenceItem> getRetainedEvidence() {
        return retainedEvidence == null ? List.of() : retainedEvidence;
    }
}
