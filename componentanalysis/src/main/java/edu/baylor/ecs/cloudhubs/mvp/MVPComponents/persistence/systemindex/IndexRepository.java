package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.systemindex;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface IndexRepository
        extends MongoRepository<IndexEntity, String> {
}
