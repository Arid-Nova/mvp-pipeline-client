package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir;

import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface MicroserviceIRRepository
        extends MongoRepository<MicroserviceEntity, String> {

    @Query("{ '$or': [ { 'systemName': { $regex: ?0, $options: 'i' } }, { 'payload.name': { $regex: ?0, $options: 'i' } } ] }")
    List<MicroserviceEntity> findByPayloadNameMatching(String namePattern, Pageable pageable);

    @Query(value = "{ '$or': [ { 'systemName': { $regex: ?0, $options: 'i' } }, { 'payload.name': { $regex: ?0, $options: 'i' } } ] }", exists = true)
    boolean existsByPayloadName(String namePattern);
}
