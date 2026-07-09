package edu.baylor.ecs.cloudhubs.chatbot.service;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Component
public class EvidenceProviderRegistry {
    private final List<EvidenceContextProvider> providers;

    public EvidenceProviderRegistry(List<EvidenceContextProvider> providers) {
        List<EvidenceContextProvider> safeProviders = providers == null ? List.of() : providers;
        this.providers = safeProviders.stream()
            .sorted(Comparator.comparing(EvidenceContextProvider::providerId))
            .toList();
    }

    public List<EvidenceContextProvider> getProviders() {
        return new ArrayList<>(providers);
    }
}
