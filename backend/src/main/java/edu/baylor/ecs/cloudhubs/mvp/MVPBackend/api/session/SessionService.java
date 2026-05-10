package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.session;

import lombok.extern.log4j.Log4j2;
import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.Sort;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.multipart.MultipartFile;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session.SessionDetailResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session.SessionEntity;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session.SessionResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session.SessionRepository;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session.SessionPageResponse;

import java.util.*;
import java.time.Instant;
import java.util.stream.Collectors;

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
            // Strictly updating an existing session only if it exists
            sessionDocument = repository.findById(sessionId)
                    .orElseThrow(() -> new IllegalArgumentException("No existing session found with ID " + sessionId));
            log.info("Updating existing session: {}", sessionId);
        } else {
            // New session
            sessionDocument = new SessionEntity();
            sessionDocument.setCreatedAt(Instant.now());
            log.info("Creating new session workspace");
        }

        sessionDocument.setName(name);
        sessionDocument.setCanvasData(canvasDataFile.getBytes()); 
        sessionDocument.setUpdatedAt(Instant.now());

        SessionEntity savedSession = repository.save(sessionDocument);
        log.info("Successfully saved session with ID: {}", savedSession.getId());

        return new SessionResponse(savedSession.getId());
    }

    public SessionPageResponse getAvailableSessions(int page, int size) {
        PageRequest pageRequest = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "updatedAt"));

        Page<SessionEntity> documentPage = repository.findAllWithoutCanvasData(pageRequest);

        List<SessionPageResponse.SessionSummary> summaries = documentPage.getContent().stream()
                .map(doc -> new SessionPageResponse.SessionSummary(
                        doc.getId(), 
                        doc.getName(), 
                        doc.getUpdatedAt() != null ? doc.getUpdatedAt() : doc.getCreatedAt()
                ))
                .collect(Collectors.toList());

        return new SessionPageResponse(
                summaries,
                documentPage.getNumber(),
                documentPage.getTotalPages(),
                documentPage.getTotalElements()
        );
    }

    public SessionDetailResponse getSessionMetadata(String id) {
        SessionEntity document = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Session not found"));
                
        return new SessionDetailResponse(
                document.getId(),
                document.getName(),
                document.getUpdatedAt() != null ? document.getUpdatedAt() : document.getCreatedAt()
        );
    }

    public byte[] getSessionCanvasData(String id) {
        SessionEntity document = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Session not found"));
        return document.getCanvasData();
    }

    public void deleteSession(String id) {
        if (!repository.existsById(id)) {
            throw new IllegalArgumentException("Session not found with ID: " + id);
        }
        repository.deleteById(id);
        log.info("Successfully deleted session with ID: {}", id);
    }
}
