package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir;

import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface MicroserviceIRRepository
        extends MongoRepository<MicroserviceEntity, String> {
        
    @Query("{ 'name': { $regex: ?0, $options: 'i' } }")
    List<MicroserviceEntity> findByPayloadNameMatching(String namePattern, Pageable pageable);

    @Query(value = "{ 'name': { $regex: ?0, $options: 'i' } }", exists = true)
    boolean existsByPayloadName(String namePattern);
}
