package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import lombok.RequiredArgsConstructor;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.model.Errors;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.model.ForbiddenException;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir.IRRequestModel;

@RestController
@RequiredArgsConstructor(onConstructor = @__(@Autowired))
@RequestMapping("/ir")
@CrossOrigin(origins = {"http://localhost:3000", "http://localhost:8080"}, maxAge = 3600, allowedHeaders = "*")
public class IRController {

    protected final IRService irService;

    @PostMapping("/create")
    @CrossOrigin(origins = {"http://localhost:3000", "http://localhost:8080"}, maxAge = 3600, allowedHeaders = "*")
    public ResponseEntity<?> createIR(@RequestBody IRRequestModel irRequestModel) {
        JsonNode responseModel;
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
        return ResponseEntity.ok(responseModel);
    }
}
