package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/**
 * Global CORS configuration. Allowed origins come from the
 * {@code app.cors.allowed-origins} property (comma-separated), which is
 * overridable via the {@code CORS_ALLOWED_ORIGINS} environment variable in
 * docker-compose. This replaces the per-controller {@code @CrossOrigin}
 * annotations so the allowlist lives in exactly one place.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("${app.cors.allowed-origins}")
    private List<String> allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOrigins(allowedOrigins.toArray(new String[0]))
                .allowedMethods("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS")
                .allowedHeaders("*")
                .maxAge(3600);
    }
}
