package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.session;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SessionRepository 
        extends MongoRepository<SessionEntity, String> {
}
