package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.health;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;

public class HealthController {
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> healthCheck() {
        return ResponseEntity.ok(Map.of(
            "status", "ok", 
            "service", "backend",
            "description", "Backend Service is running."
        ));
    }
}
