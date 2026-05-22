package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.persistence.ir;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface DeltaRepository
        extends MongoRepository<DeltaEntity, String> {
}
