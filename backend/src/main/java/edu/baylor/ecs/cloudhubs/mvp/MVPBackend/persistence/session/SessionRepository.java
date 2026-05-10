package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SessionRepository 
        extends MongoRepository<SessionEntity, String> {
    
    @Query(value = "{}", fields = "{ 'canvasData' : 0 }")
    List<SessionEntity> findAllWithoutCanvasData();
}
