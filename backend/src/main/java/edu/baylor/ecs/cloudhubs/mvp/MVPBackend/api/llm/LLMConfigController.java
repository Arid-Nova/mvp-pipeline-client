package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.llm;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.llm.LLMConfigEntity;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.service.LLMConfigService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Optional;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/llm-config")
@CrossOrigin(origins = "*")
public class LLMConfigController {
    
    @Autowired
    private LLMConfigService llmConfigService;
    
    @PostMapping("/save")
    public ResponseEntity<LLMConfigEntity> saveLLMConfig(@RequestBody SaveLLMConfigRequest request) {
    LLMConfigEntity saved = llmConfigService.saveLLMConfig(
        request.getUserId(), request.getProvider(), request.getUri(), request.getToken());
    return ResponseEntity.ok(saved);
}
    
    @PostMapping("/set-default/{provider}")
    public ResponseEntity<String> setDefaultConfig(
            @RequestParam String userId,
            @PathVariable String provider) {
        llmConfigService.setDefaultConfig(userId, provider);
        return ResponseEntity.ok("Default config set to " + provider);
    }
    
    @GetMapping("/default")
    public ResponseEntity<LLMConfigEntity> getDefaultConfig(@RequestParam String userId) {
        Optional<LLMConfigEntity> config = llmConfigService.getDefaultConfig(userId);
        return config.map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }
    
    @GetMapping("/{provider}")
    public ResponseEntity<LLMConfigEntity> getConfig(
            @RequestParam String userId,
            @PathVariable String provider) {
        Optional<LLMConfigEntity> config = llmConfigService.getConfig(userId, provider);
        return config.map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/service/{provider}")
    public ResponseEntity<?> getConfigForService(
            @RequestParam String userId,
            @PathVariable String provider) {
        Optional<LLMConfigEntity> config = llmConfigService.getConfig(userId, provider);
        if (config.isPresent()) {
            LLMConfigEntity entity = config.get();
            Map<String, String> response = new HashMap<>();
            response.put("uri", entity.getUri());
            response.put("token", entity.getEncryptedToken());
            return ResponseEntity.ok(response);
        }
        return ResponseEntity.notFound().build();
    }
}