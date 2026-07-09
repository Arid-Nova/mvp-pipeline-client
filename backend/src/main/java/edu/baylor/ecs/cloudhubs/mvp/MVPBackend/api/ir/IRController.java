package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import lombok.RequiredArgsConstructor;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;

import edu.university.ecs.lab.delta.models.SystemChange;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.model.Errors;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.model.ForbiddenException;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.IRRequestModel;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.IRByNameRequest;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.request.DeltaRequestModel;

@RestController
@RequiredArgsConstructor(onConstructor = @__(@Autowired))
@RequestMapping("/ir")
public class IRController {

    protected final IRService irService;
    protected final DeltaService deltaService;

    @PostMapping("/create")
    public ResponseEntity<?> createIR(@RequestBody IRRequestModel irRequestModel) {
        byte[] responseModel;
        try {
            responseModel = irService.createAndWrite(irRequestModel);
        } catch (ForbiddenException e) {
            e.printStackTrace();
            return Errors.Response403Forbidden(e.getMessage());
        } catch (IllegalArgumentException e) {
            e.printStackTrace();
            return Errors.Response400BadRequest(e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "application/gzip")
                .body(responseModel);
    }

    @GetMapping
    public ResponseEntity<?> getIRs(@ModelAttribute IRByNameRequest irRequestModel) {
        byte[] responseModel;
        try {
            responseModel = irService.getIRsByName(irRequestModel);
        } catch (ForbiddenException e) {
            e.printStackTrace();
            return Errors.Response403Forbidden(e.getMessage());
        } catch (IllegalArgumentException e) {
            e.printStackTrace();
            return Errors.Response400BadRequest(e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "application/gzip")
                .body(responseModel);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteIR(@PathVariable("id") String id) {
        try {
            irService.deleteIRById(id);
            return ResponseEntity.ok().body("Successfully deleted IR snapshot.");
        } catch (IllegalArgumentException e) {
            e.printStackTrace();
            return Errors.Response400BadRequest(e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
    }

    @GetMapping("/meta")
    public ResponseEntity<?> getIRsMeta(@ModelAttribute IRByNameRequest irRequestModel) {
        String responseModel;
        try {
            responseModel = irService.getIRMetaByName(irRequestModel);
        } catch (ForbiddenException e) {
            e.printStackTrace();
            return Errors.Response403Forbidden(e.getMessage());
        } catch (IllegalArgumentException e) {
            e.printStackTrace();
            return Errors.Response400BadRequest(e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
        return ResponseEntity.ok(responseModel);
    }

    @GetMapping("/versions")
    public ResponseEntity<?> getAvailableVersions(@RequestParam("systemName") String systemName) {
        try {
            return ResponseEntity.ok(irService.getAvailableVersions(systemName));
        } catch (IllegalArgumentException e) {
            e.printStackTrace();
            return Errors.Response400BadRequest(e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
    }

    @PostMapping("/versions")
    public ResponseEntity<?> fetchSpecificIRs(@RequestBody List<String> ids) {
        byte[] responseModel;
        try {
            responseModel = irService.getSpecificIRs(ids);
        } catch (IllegalArgumentException e) {
            e.printStackTrace();
            return Errors.Response400BadRequest(e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
        
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "application/gzip")
                .body(responseModel);
    }

    @GetMapping("/versions/metadata")
    public ResponseEntity<?> getVersionMetadata(@RequestParam("systemName") String systemName) {
        try {
            Map<String, Object> response = irService.getSuggestedVersions(systemName);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            e.printStackTrace();
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
    }

    @PutMapping("/versions/metadata")
    public ResponseEntity<?> updateVersion(
            @RequestParam("id") String id, 
            @RequestBody Map<String, String> requestBody) {
        try {
            String version = requestBody.get("version");
            String description = requestBody.get("description");
            if (version == null || version.trim().isEmpty()) {
                return Errors.Response400BadRequest("Version string is required.");
            }
            
            irService.updateIRVersion(id, version, description);
            return ResponseEntity.ok(Map.of("message", "Version updated successfully", "version", version));
            
        } catch (IllegalArgumentException e) {
            return Errors.Response400BadRequest(e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
    }

    @PostMapping("/delta")
    public ResponseEntity<?> retreiveDelta(@RequestBody DeltaRequestModel requestModel) {
        byte[] responseModel;
        try {
            responseModel = deltaService.retrieveDelta(requestModel);
        } catch (ForbiddenException e) {
            e.printStackTrace();
            return Errors.Response403Forbidden(e.getMessage());
        } catch (IllegalArgumentException e) {
            e.printStackTrace();
            return Errors.Response400BadRequest(e.getMessage());
        } catch (Exception e) {
            e.printStackTrace();
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "application/gzip")
                .body(responseModel);
    }
}
