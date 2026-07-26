package edu.baylor.ecs.cloudhubs.chatbot.model;

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
public class EvidenceRetrievalResult {
    private List<EvidenceItem> evidenceItems = new ArrayList<>();
    private List<MissingEvidence> missingEvidence = new ArrayList<>();

    public List<EvidenceItem> getEvidenceItems() {
        if (evidenceItems == null) evidenceItems = new ArrayList<>();
        return evidenceItems;
    }

    public List<MissingEvidence> getMissingEvidence() {
        if (missingEvidence == null) missingEvidence = new ArrayList<>();
        return missingEvidence;
    }
}
