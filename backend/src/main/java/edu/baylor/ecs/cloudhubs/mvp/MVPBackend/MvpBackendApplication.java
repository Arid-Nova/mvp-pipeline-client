package edu.baylor.ecs.cloudhubs.mvp.MVPBackend;

import org.springframework.boot.SpringApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import com.fasterxml.jackson.datatype.jsonorg.JsonOrgModule;

@SpringBootApplication
@EnableScheduling
public class MvpBackendApplication {
	public static void main(String[] args) {
		SpringApplication.run(MvpBackendApplication.class, args);
	}

	@Bean
    public JsonOrgModule jsonOrgModule() {
        return new JsonOrgModule();
    }
}
