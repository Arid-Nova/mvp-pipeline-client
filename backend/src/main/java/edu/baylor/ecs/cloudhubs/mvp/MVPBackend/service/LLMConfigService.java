package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.service;

import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.llm.LLMConfigEntity;
import edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.llm.LLMConfigRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class LLMConfigService {
    
    @Autowired
    private LLMConfigRepository llmConfigRepository;
    
    @Autowired
    private EncryptionService encryptionService;
    
    public LLMConfigEntity saveLLMConfig(String userId, String provider, String uri, String token) {
        String encryptedToken = encryptionService.encrypt(token);
        
        Optional<LLMConfigEntity> existing = llmConfigRepository.findByUserIdAndProvider(userId, provider);
        
        LLMConfigEntity config;
        if (existing.isPresent()) {
            config = existing.get();
            config.setUri(uri);
            config.setEncryptedToken(encryptedToken);
            config.setUpdatedAt(Instant.now());
        } else {
            config = new LLMConfigEntity();
            config.setUserId(userId);
            config.setProvider(provider);
            config.setUri(uri);
            config.setEncryptedToken(encryptedToken);
            config.setCreatedAt(Instant.now());
            config.setUpdatedAt(Instant.now());
        }
        
        return llmConfigRepository.save(config);
    }
    
    public void setDefaultConfig(String userId, String provider) {
        // Unset all other defaults
        List<LLMConfigEntity> allConfigs = llmConfigRepository.findByUserId(userId);
        allConfigs.forEach(config -> {
            config.setDefault(false);
            llmConfigRepository.save(config);
        });
        
        // Set new default
        Optional<LLMConfigEntity> config = llmConfigRepository.findByUserIdAndProvider(userId, provider);
        if (config.isPresent()) {
            config.get().setDefault(true);
            llmConfigRepository.save(config.get());
        }
    }
    
    public Optional<LLMConfigEntity> getDefaultConfig(String userId) {
        return llmConfigRepository.findByUserIdAndIsDefault(userId, true);
    }
    
    public Optional<LLMConfigEntity> getConfig(String userId, String provider) {
        Optional<LLMConfigEntity> config = llmConfigRepository.findByUserIdAndProvider(userId, provider);
        if (config.isPresent()) {
            LLMConfigEntity entity = config.get();
            entity.setEncryptedToken(encryptionService.decrypt(entity.getEncryptedToken()));
            return Optional.of(entity);
        }
        return Optional.empty();
    }
}