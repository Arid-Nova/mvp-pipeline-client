package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.llm;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface LLMConfigRepository extends MongoRepository<LLMConfigEntity, String> {
    List<LLMConfigEntity> findByUserId(String userId);
    Optional<LLMConfigEntity> findByUserIdAndProvider(String userId, String provider);
    Optional<LLMConfigEntity> findByUserIdAndIsDefault(String userId, boolean isDefault);
}