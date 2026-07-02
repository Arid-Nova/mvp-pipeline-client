package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir;

import org.springframework.data.domain.Sort;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface MicroserviceIRRepository
        extends MongoRepository<MicroserviceEntity, String> {
        
    @Query(
        value = "{ 'name': { $regex: ?0, $options: 'i' }, 'version': { $exists: true, $ne: null } }", 
        collation = "{ 'locale': 'en', 'numericOrdering': true }"
    )
    List<MicroserviceEntity> findByPayloadNameMatching(String namePattern, Pageable pageable);

    @Query(value = "{ 'name': { $regex: ?0, $options: 'i' }, 'version': { $exists: true, $ne: null } }", exists = true)
    boolean existsByPayloadName(String namePattern);

    @Query(value = "{ 'name': { $regex: ?0, $options: 'i' }, 'version': { $exists: true, $ne: null } }", 
       fields = "{ 'version': 1, 'id': 1, 'createdAt': 1 }", 
       collation = "{ 'locale': 'en', 'numericOrdering': true }")
    List<MicroserviceEntity> findAvailableVersions(String namePattern, Sort sort);

    @Query("{ '_id': { $in: ?0 } }")
    List<MicroserviceEntity> findByIds(List<String> ids);
}
