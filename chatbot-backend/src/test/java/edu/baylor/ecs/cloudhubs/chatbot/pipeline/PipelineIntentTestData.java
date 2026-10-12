package edu.baylor.ecs.cloudhubs.chatbot.pipeline;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentRequest;

import java.util.ArrayList;
import java.util.List;

/** Synthetic catalogs and requests: deliberately not the real card vocabulary. */
final class PipelineIntentTestData {
    static final ObjectMapper MAPPER = new ObjectMapper();
    static final String SUGGESTION_SET_ID = "3f2b8c1e-9a4d-4e6f-b1c2-7d8e9f0a1b2c";
    static final String CATALOG_VERSION = "pcat-test0000000001";
    static final String GOAL = "Show me the zebra topology and check the walrus policy.";

    private PipelineIntentTestData() {
    }

    static JsonNode catalog() {
        try {
            return MAPPER.readTree("""
                {
                  "catalogVersion": "pcat-test0000000001",
                  "inputCardTypes": ["BAR_INPUT"],
                  "analysisCategories": ["Visualization", "Version Control"],
                  "cards": [
                    {"cardType": "BAR_INPUT", "title": "Bar Source", "category": "Inputs", "purpose": "Holds the source.",
                     "outcome": "A source.", "isInput": true, "isAnalysis": false, "allowedTargets": ["FOO_ANALYSIS"]},
                    {"cardType": "BAZ_HOLDER", "title": "Baz Holder", "category": "Intermediate Results", "purpose": "Holds data.",
                     "outcome": "Data.", "isInput": false, "isAnalysis": false, "allowedTargets": []},
                    {"cardType": "FOO_ANALYSIS", "title": "Foo Analysis", "category": "Visualization", "purpose": "Draws the foo.",
                     "outcome": "A foo picture.", "isInput": false, "isAnalysis": true, "allowedTargets": [],
                     "inputRequirement": {"requiresAllOf": [["BAZ_HOLDER"]]}},
                    {"cardType": "QUX_COMPARE", "title": "Qux Compare", "category": "Version Control", "purpose": "Compares two qux.",
                     "outcome": "A qux diff.", "isInput": false, "isAnalysis": true, "allowedTargets": []}
                  ],
                  "examples": [{"templateId": "foo-template", "title": "Foo", "summary": "s",
                                "nodes": [{"key": "bar", "cardType": "BAR_INPUT"}], "edges": [{"from": "bar", "to": "foo"}]}]
                }
                """);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    static PipelineIntentRequest request() {
        return new PipelineIntentRequest(GOAL, SUGGESTION_SET_ID, 1, catalog(), CATALOG_VERSION, new ArrayList<>(), new ArrayList<>());
    }

    static PipelineIntentRequest retryRequest(List<List<String>> exclude, List<String> feedback) {
        PipelineIntentRequest request = request();
        request.setAttempt(2);
        request.setExcludeCapabilitySets(exclude);
        request.setRejectionFeedback(feedback);
        return request;
    }

    static String validPlanJson() {
        return """
            {"version":1,"options":[
              {"tier":"focused","title":"Foo only","rationale":"Shows the foo.","analysisCardTypes":["FOO_ANALYSIS"]},
              {"tier":"balanced","title":"Foo and qux","analysisCardTypes":["FOO_ANALYSIS","QUX_COMPARE"]},
              {"tier":"comprehensive","title":"Everything","rationale":"All of it.","analysisCardTypes":["QUX_COMPARE","FOO_ANALYSIS","UNKNOWN_X"]}
            ]}
            """;
    }
}
