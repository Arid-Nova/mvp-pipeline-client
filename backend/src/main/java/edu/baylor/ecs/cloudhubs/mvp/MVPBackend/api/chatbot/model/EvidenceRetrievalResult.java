package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.chatbot.model;

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
        return evidenceItems == null ? List.of() : evidenceItems;
    }

    public List<MissingEvidence> getMissingEvidence() {
        return missingEvidence == null ? List.of() : missingEvidence;
    }
}
