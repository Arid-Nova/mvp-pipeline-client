package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.session;

import lombok.extern.log4j.Log4j2;
import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session.SessionEntity;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session.SessionListResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session.SessionResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session.SessionRepository;

import java.util.*;
import java.util.stream.Collectors;
import java.time.Instant;

import org.springframework.beans.factory.annotation.Autowired;

@Log4j2
@Service
@RequiredArgsConstructor(onConstructor = @__(@Autowired))
public class SessionService {

    @Autowired
    private SessionRepository repository;

    public SessionResponse saveSession(String name, String sessionId, MultipartFile canvasDataFile) throws Exception{

        SessionEntity sessionDocument;

        if (sessionId != null && !sessionId.trim().isEmpty()) {
            // Updating an existing session
            sessionDocument = repository.findById(sessionId).orElseGet(SessionEntity::new);
            if (sessionDocument.getId() == null) {
                sessionDocument.setId(sessionId);
                sessionDocument.setCreatedAt(Instant.now());
            }
        } else {
            // New session
            sessionDocument = new SessionEntity();
            sessionDocument.setCreatedAt(Instant.now());
        }

        sessionDocument.setName(name);
        sessionDocument.setCanvasData(canvasDataFile.getBytes()); 
        sessionDocument.setUpdatedAt(Instant.now());

        SessionEntity savedSession = repository.save(sessionDocument);
        log.info("Successfully saved session with ID: {}", savedSession.getId());

        return new SessionResponse(savedSession.getId());
    }

    public SessionListResponse getAvailableSessions() {
        List<SessionEntity> documents = repository.findAllWithoutCanvasData();

        List<SessionListResponse.SessionSummary> summaries = documents.stream()
                .map(doc -> new SessionListResponse.SessionSummary(
                        doc.getId(), 
                        doc.getName(), 
                        doc.getUpdatedAt() != null ? doc.getUpdatedAt() : doc.getCreatedAt()
                ))
                .sorted(Comparator.comparing(SessionListResponse.SessionSummary::getUpdatedAt).reversed())
                .collect(Collectors.toList());

        return new SessionListResponse(summaries);
    }
}
