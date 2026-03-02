package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.component;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface ComponentRepository
        extends MongoRepository<ComponentEntity, String> {
}
