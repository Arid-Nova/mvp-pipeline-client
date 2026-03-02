package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component;

import lombok.RequiredArgsConstructor;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;

import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.model.Errors;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.model.ForbiddenException;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.request.IRRequestModel;

@RestController
@RequiredArgsConstructor(onConstructor = @__(@Autowired))
@RequestMapping("/component")
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:8080"}, maxAge = 3600, allowedHeaders = "*")
public class ComponentController {

    protected final ComponentService componentService;

    @PostMapping("/create")
    @CrossOrigin(
            origins = {"http://localhost:3000", "http://localhost:8080"},
            maxAge = 3600,
            allowedHeaders = "*"
    )
    public ResponseEntity<?> createIndexedIR(@RequestBody IRRequestModel irRequestModel) {
        JsonNode responseModel;
        try {
            responseModel = componentService.createComponentIndex(irRequestModel);
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

    @GetMapping("/{id}")
    @CrossOrigin(
            origins = {"http://localhost:3000", "http://localhost:8080"},
            maxAge = 3600,
            allowedHeaders = "*"
    )
    public ResponseEntity<?> getComponent(@PathVariable String id) {
        try {
            JsonNode response = componentService.getComponentById(id);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return Errors.Response400BadRequest(e.getMessage());
        } catch (Exception e) {
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
    }

    @GetMapping("/endpoints/{id}")
    @CrossOrigin(
            origins = {"http://localhost:3000", "http://localhost:8080"},
            maxAge = 3600,
            allowedHeaders = "*"
    )
    public ResponseEntity<?> getEndpoints(@PathVariable String id) {
        try {
            JsonNode response = componentService.getEndpointsById(id);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return Errors.Response400BadRequest(e.getMessage());
        } catch (Exception e) {
            return Errors.Response500InternalServerError(e.getCause(), e.getMessage());
        }
    }
}
