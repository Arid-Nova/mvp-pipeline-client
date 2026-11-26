package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.endpoint.extractors;

import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.models.AuthenticationMechanism;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class Java21SecurityConfigTest {
    @TempDir Path temporary;
    private final ObjectMapper mapper = new ObjectMapper();

    @Test void siblingRecordDoesNotDiscardSecurityRulesFromAnExistingConfiguration() throws Exception {
        var baseline = SecurityConfigParser.parseSecurityConfig(configuration(false));
        var withRecord = SecurityConfigParser.parseSecurityConfig(configuration(true));
        assertEquals(1, baseline.size());
        assertEquals("/private", baseline.getFirst().getPattern());
        assertEquals(List.of("ADMIN"), baseline.getFirst().getRequiredRoles());
        assertFalse(baseline.getFirst().isPermitAll());
        assertEquals(mapper.valueToTree(baseline), mapper.valueToTree(withRecord));
    }

    @Test void siblingRecordPreservesTheObservedBasicAuthenticationMechanism() throws Exception {
        var baseline = AuthenticationConfigParser.parseSecurityConfig(configuration(false));
        var withRecord = AuthenticationConfigParser.parseSecurityConfig(configuration(true));
        assertNotNull(baseline.authenticationMechanism);
        assertEquals(AuthenticationMechanism.AuthenticationType.BASIC, baseline.authenticationMechanism.getType());
        assertEquals(AuthenticationMechanism.TokenLocation.HEADER, baseline.authenticationMechanism.getTokenLocation());
        assertEquals("Authorization", baseline.authenticationMechanism.getTokenHeaderName());
        assertEquals(mapper.valueToTree(baseline.authenticationMechanism), mapper.valueToTree(withRecord.authenticationMechanism));
        assertEquals(mapper.valueToTree(baseline.securityFeatures), mapper.valueToTree(withRecord.securityFeatures));
    }

    private Path configuration(boolean includeRecord) throws Exception {
        Path source = temporary.resolve(includeRecord ? "WithRecord.java" : "WithoutRecord.java");
        Files.writeString(source, """
                class SecurityConfig {
                    protected void configure(HttpSecurity http) {
                        http.authorizeRequests().antMatchers("/private").hasRole("ADMIN");
                        http.httpBasic();
                    }
                }
                """ + (includeRecord ? "record RuleValue(String value) {}\n" : ""));
        return source;
    }
}
