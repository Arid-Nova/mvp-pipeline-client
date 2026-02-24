package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.persistence.endpoint;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface EndpointRepository
        extends MongoRepository<EndpointEntity, String> {
}
