package edu.baylor.ecs.cloudhubs.mvp.MVPBackend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Global CORS configuration, replacing the per-controller {@code @CrossOrigin}
 * annotations. The base allowlist comes from {@code CORS_ALLOWED_ORIGINS};
 * endpoints needing extra origins are declared below and layered on top of it.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("${app.cors.allowed-origins}")
    private List<String> allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // Endpoints with a wider allowlist go first (Spring uses the first matching pattern).
        // /ir/create also trusts the aegis (8900) and formal-verifier (9000) origins.
        addMapping(registry, "/ir/create", "http://localhost:8900", "http://localhost:9000");
        addMapping(registry, "/**");
    }

    private void addMapping(CorsRegistry registry, String path, String... extraOrigins) {
        List<String> origins = new ArrayList<>(allowedOrigins);
        origins.addAll(Arrays.asList(extraOrigins));
        registry.addMapping(path)
                .allowedOrigins(origins.toArray(new String[0]))
                .allowedMethods("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS")
                .allowedHeaders("*")
                .maxAge(3600);
    }
}
