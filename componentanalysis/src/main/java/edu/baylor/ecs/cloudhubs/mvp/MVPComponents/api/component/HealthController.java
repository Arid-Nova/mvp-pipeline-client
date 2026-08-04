package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> healthCheck() {
        return ResponseEntity.ok(Map.of(
            "status", "ok", 
            "service", "component",
            "description", "Component Service is running."
        ));
    }
}