package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.session;

import lombok.RequiredArgsConstructor;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.model.ForbiddenException;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session.SessionPageResponse;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session.SessionResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.beans.factory.annotation.Autowired;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.model.Errors;

@RestController
@RequiredArgsConstructor(onConstructor = @__(@Autowired))
@RequestMapping("/sessions")
@CrossOrigin(origins = {"http://localhost:3000", "https://aridnova-demo.eastus.cloudapp.azure.com", "http://localhost:8080"}, maxAge = 3600, allowedHeaders = "*")
public class SessionController {

    protected final SessionService sessionService;
    
    @PostMapping
    public ResponseEntity<?> saveSession(
            @RequestParam("name") String name,
            @RequestParam(value = "session_id", required = false) String sessionId,
            @RequestParam("canvas_data_file") MultipartFile canvasDataFile) 
    {
        try {
            SessionResponse response = sessionService.saveSession(name, sessionId, canvasDataFile);
            return ResponseEntity.ok(response);
        } catch (ForbiddenException e) {
            return Errors.Response403Forbidden(e.getMessage());
        } catch (IllegalArgumentException e) {
            return Errors.Response404NotFound(e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
    }

    @GetMapping
    public ResponseEntity<?> getAvailableSessions(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        try {
            SessionPageResponse response = sessionService.getAvailableSessions(page, size);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            e.printStackTrace();
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getSessionMetadata(@PathVariable("id") String id) {
        try {
            return ResponseEntity.ok(sessionService.getSessionMetadata(id));
        } catch (IllegalArgumentException e) {
            return Errors.Response404NotFound(e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
    }

    @GetMapping(value = "/{id}/canvas", produces = "application/gzip")
    public ResponseEntity<byte[]> getSessionCanvas(@PathVariable("id") String id) {
        try {
            byte[] compressedData = sessionService.getSessionCanvasData(id);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"canvas.json.gz\"")
                    .body(compressedData);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
        catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteSession(@PathVariable("id") String id) {
        try {
            sessionService.deleteSession(id);
            return ResponseEntity.ok().build(); 
        } catch (IllegalArgumentException e) {
            return Errors.Response404NotFound(e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
    }
}
