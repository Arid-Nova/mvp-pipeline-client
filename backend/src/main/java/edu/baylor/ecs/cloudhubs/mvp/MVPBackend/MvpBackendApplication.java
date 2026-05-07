package edu.baylor.ecs.cloudhubs.mvp.MVPBackend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class MvpBackendApplication {
	public static void main(String[] args) {
		SpringApplication.run(MvpBackendApplication.class, args);
	}
}
