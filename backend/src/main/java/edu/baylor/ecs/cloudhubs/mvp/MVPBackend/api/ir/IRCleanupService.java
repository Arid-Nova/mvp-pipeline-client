package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.api.ir;

import lombok.extern.log4j.Log4j2;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.springframework.stereotype.Service;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;

@Log4j2
@Service
public class IRCleanupService {
    private final MongoTemplate mongoTemplate;
    private final int retentionDays;

    public IRCleanupService(
            MongoTemplate mongoTemplate, 
            @Value("${app.cleanup.ir-retention-days:30}") int retentionDays) {
        this.mongoTemplate = mongoTemplate;
        this.retentionDays = retentionDays;
    }

    // Runs every day at 2:00 AM server time
    @Scheduled(cron = "0 0 2 * * ?")
    public void cleanupUnversionedIrs() {
        Instant cutoffDate = Instant.now().minus(retentionDays, ChronoUnit.DAYS);

        // Delete IRs that does NOT have a 'version' AND 'createdAt' is older than the cutoff
        Query query = new Query();
        query.addCriteria(Criteria.where("version").exists(false));
        query.addCriteria(Criteria.where("createdAt").lt(cutoffDate));

        mongoTemplate.remove(query, "microservice_ir");
        
        log.info("Cleaned up unversioned IRs older than " + retentionDays + " days.");
    }
}
