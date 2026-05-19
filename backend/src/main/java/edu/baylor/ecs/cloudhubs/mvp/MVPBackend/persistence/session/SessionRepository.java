package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

@Repository
public interface SessionRepository 
        extends MongoRepository<SessionEntity, String> {
    
    @Query(value = "{}", fields = "{ 'canvasData' : 0 }")
    Page<SessionEntity> findAllWithoutCanvasData(Pageable pageable);
}
