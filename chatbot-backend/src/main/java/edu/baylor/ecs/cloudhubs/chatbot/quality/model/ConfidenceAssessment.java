package edu.baylor.ecs.cloudhubs.chatbot.quality.model;

import edu.baylor.ecs.cloudhubs.chatbot.model.ChatbotConfidence;
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
public class ConfidenceAssessment {
    private ChatbotConfidence confidence = ChatbotConfidence.INSUFFICIENT_EVIDENCE;
    private String rationale;
    private List<String> reasons = new ArrayList<>();
}
