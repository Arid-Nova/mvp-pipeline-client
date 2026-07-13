package edu.baylor.ecs.cloudhubs.chatbot.service;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Optional;

/**
 * Server-to-server seam onto {@code backend}'s existing IR REST API. Implementations must call
 * {@code backend} over HTTP only (no compile-time dependency on backend's Java classes) per the
 * m2.1 refactor constraint recorded in docs/s12/s12-m2.1-backend-refactoring.md section 12.
 */
public interface BackendIrGateway {

    Optional<JsonNode> fetchIrById(String irId);

    Optional<JsonNode> fetchLatestIrForSystem(String systemName);
}
