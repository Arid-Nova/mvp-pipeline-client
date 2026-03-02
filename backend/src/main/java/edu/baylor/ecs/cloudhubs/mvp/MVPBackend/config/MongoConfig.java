package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.config;

import jakarta.annotation.PostConstruct;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.core.convert.MappingMongoConverter;
import org.springframework.beans.factory.annotation.Autowired;

@Configuration
public class MongoConfig {

    @Autowired
    private MappingMongoConverter mongoConverter;

    @PostConstruct
    public void addDotReplacement() {
        mongoConverter.setMapKeyDotReplacement("_");
    }
}
