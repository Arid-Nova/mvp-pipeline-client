package edu.baylor.ecs.cloudhubs.chatbot.pipeline;

import edu.baylor.ecs.cloudhubs.chatbot.pipeline.model.PipelineIntentOutcome;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Random;

import static edu.baylor.ecs.cloudhubs.chatbot.pipeline.PipelineIntentTestData.validPlanJson;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class PipelineIntentJsonExtractorTest {

    private final PipelineIntentJsonExtractor extractor = new PipelineIntentJsonExtractor();

    @Test
    void acceptsValidIntentJsonAndPassesOptionsThroughUnchanged() {
        PipelineIntentJsonExtractor.Extraction result = extractor.extract(validPlanJson());

        assertThat(result.outcome()).isEqualTo(PipelineIntentOutcome.OK);
        assertThat(result.parseErrors()).isEmpty();
        assertThat(result.unsupportedReason()).isNull();
        assertThat(result.options()).extracting(option -> option.get("tier").asText())
            .containsExactly("focused", "balanced", "comprehensive");
        // No semantic normalization: order, unknown IDs and missing rationale are kept for the frontend.
        assertThat(result.options().get(2).get("analysisCardTypes").toString())
            .isEqualTo("[\"QUX_COMPARE\",\"FOO_ANALYSIS\",\"UNKNOWN_X\"]");
        assertThat(result.options().get(1).has("rationale")).isFalse();
    }

    @Test
    void stripsMarkdownFences() {
        PipelineIntentJsonExtractor.Extraction result = extractor.extract("```json\n" + validPlanJson() + "\n```");

        assertThat(result.outcome()).isEqualTo(PipelineIntentOutcome.OK);
        assertThat(result.options()).hasSize(3);
    }

    @Test
    void findsTheObjectInsideLeadingAndTrailingProse() {
        String text = "Sure! Here is the plan you asked for: " + validPlanJson() + " Let me know if {you} need more.";

        PipelineIntentJsonExtractor.Extraction result = extractor.extract(text);

        assertThat(result.outcome()).isEqualTo(PipelineIntentOutcome.OK);
        assertThat(result.options()).hasSize(3);
    }

    @Test
    void handlesBracesInsideStrings() {
        String text = "Plan: {\"options\":[{\"tier\":\"focused\",\"title\":\"a } tricky \\\" title {\",\"analysisCardTypes\":[\"X\"]}]}";

        PipelineIntentJsonExtractor.Extraction result = extractor.extract(text);

        assertThat(result.outcome()).isEqualTo(PipelineIntentOutcome.OK);
        assertThat(result.options().get(0).get("title").asText()).isEqualTo("a } tricky \" title {");
    }

    @Test
    void reportsMalformedJson() {
        PipelineIntentJsonExtractor.Extraction result = extractor.extract("{\"options\": [ {\"tier\": focused} ]}");

        assertThat(result.outcome()).isEqualTo(PipelineIntentOutcome.INVALID_MODEL_OUTPUT);
        assertThat(result.options()).isEmpty();
        assertThat(result.parseErrors()).containsExactly("Model output contains malformed JSON.");
    }

    @Test
    void reportsTruncatedJson() {
        String truncated = validPlanJson().substring(0, validPlanJson().length() / 2);

        PipelineIntentJsonExtractor.Extraction result = extractor.extract(truncated);

        assertThat(result.outcome()).isEqualTo(PipelineIntentOutcome.INVALID_MODEL_OUTPUT);
        assertThat(result.parseErrors()).containsExactly("No complete JSON object found; the output may be truncated.");
    }

    @Test
    void reportsProseWithoutJson() {
        PipelineIntentJsonExtractor.Extraction result = extractor.extract("I would suggest visualizing the architecture.");

        assertThat(result.outcome()).isEqualTo(PipelineIntentOutcome.INVALID_MODEL_OUTPUT);
        assertThat(result.parseErrors()).containsExactly("No JSON object found in model output.");
    }

    @ParameterizedTest
    @ValueSource(strings = {"[{\"tier\":\"focused\",\"analysisCardTypes\":[\"X\"]}]", "\"just a string\"", "42", "null"})
    void rejectsANonObjectTopLevelValue(String text) {
        PipelineIntentJsonExtractor.Extraction result = extractor.extract(text);

        assertThat(result.outcome()).isEqualTo(PipelineIntentOutcome.INVALID_MODEL_OUTPUT);
        assertThat(result.parseErrors()).containsExactly("Top-level JSON value must be an object.");
    }

    @Test
    void reportsEmptyOutput() {
        assertThat(extractor.extract(null).parseErrors()).containsExactly("Model returned no content.");
        assertThat(extractor.extract("   ").outcome()).isEqualTo(PipelineIntentOutcome.INVALID_MODEL_OUTPUT);
    }

    @Test
    void reportsMissingEmptyOrWronglyTypedOptions() {
        assertThat(extractor.extract("{\"version\":1}").parseErrors()).containsExactly("options is missing.");
        assertThat(extractor.extract("{\"version\":1,\"options\":[]}").parseErrors()).containsExactly("options is empty.");
        assertThat(extractor.extract("{\"version\":1,\"options\":{\"tier\":\"focused\"}}").parseErrors())
            .containsExactly("options must be an array.");
        assertThat(extractor.extract("{\"options\":\"FOO\"}").outcome()).isEqualTo(PipelineIntentOutcome.INVALID_MODEL_OUTPUT);
    }

    @Test
    void keepsWellShapedOptionsAndReportsMalformedOnes() {
        String text = "{\"options\":[{\"tier\":\"focused\",\"analysisCardTypes\":[\"A\"]},\"oops\","
            + "{\"tier\":\"balanced\",\"analysisCardTypes\":\"A\"},{\"tier\":\"comprehensive\",\"analysisCardTypes\":[\"B\"]}]}";

        PipelineIntentJsonExtractor.Extraction result = extractor.extract(text);

        assertThat(result.outcome()).isEqualTo(PipelineIntentOutcome.OK);
        assertThat(result.options()).extracting(option -> option.get("tier").asText()).containsExactly("focused", "comprehensive");
        assertThat(result.parseErrors()).containsExactly(
            "options[1] is not an object.",
            "options[2].analysisCardTypes must be an array."
        );
    }

    @Test
    void reportsInvalidWhenNoOptionIsWellShaped() {
        PipelineIntentJsonExtractor.Extraction result = extractor.extract("{\"options\":[\"a\",{\"tier\":\"focused\"}]}");

        assertThat(result.outcome()).isEqualTo(PipelineIntentOutcome.INVALID_MODEL_OUTPUT);
        assertThat(result.options()).isEmpty();
        assertThat(result.parseErrors()).hasSize(2);
    }

    @Test
    void capsTheNumberOfOptionsAtSix() {
        StringBuilder options = new StringBuilder();
        for (int i = 0; i < 8; i++) {
            options.append(i == 0 ? "" : ",").append("{\"tier\":\"t").append(i).append("\",\"analysisCardTypes\":[\"A\"]}");
        }

        PipelineIntentJsonExtractor.Extraction result = extractor.extract("{\"options\":[" + options + "]}");

        assertThat(result.outcome()).isEqualTo(PipelineIntentOutcome.OK);
        assertThat(result.options()).hasSize(6);
        assertThat(result.parseErrors()).hasSize(2);
    }

    @Test
    void ignoresExtraTopLevelFieldsAndPassesExtraOptionFieldsThrough() {
        String text = "{\"version\":1,\"nodes\":[{\"key\":\"a\"}],\"edges\":[],\"options\":["
            + "{\"tier\":\"focused\",\"analysisCardTypes\":[\"A\"],\"edges\":[{\"from\":\"a\",\"to\":\"b\"}],\"config\":{}}]}";

        PipelineIntentJsonExtractor.Extraction result = extractor.extract(text);

        assertThat(result.outcome()).isEqualTo(PipelineIntentOutcome.OK);
        // The frontend parser strips these; the backend never uses them.
        assertThat(result.options().get(0).has("edges")).isTrue();
        assertThat(result.options().get(0).has("config")).isTrue();
    }

    @Test
    void reportsAnUnsupportedGoal() {
        PipelineIntentJsonExtractor.Extraction result = extractor.extract(
            "{\"version\":1,\"options\":[],\"unsupportedReason\":\"AridNova cannot order pizza.\"}");

        assertThat(result.outcome()).isEqualTo(PipelineIntentOutcome.UNSUPPORTED_GOAL);
        assertThat(result.unsupportedReason()).isEqualTo("AridNova cannot order pizza.");
        assertThat(result.options()).isEmpty();
        assertThat(result.parseErrors()).isEmpty();
    }

    @Test
    void boundsTheUnsupportedReason() {
        String reason = "r".repeat(5000);

        PipelineIntentJsonExtractor.Extraction result = extractor.extract("{\"options\":[],\"unsupportedReason\":\"" + reason + "\"}");

        assertThat(result.unsupportedReason()).hasSize(PipelineIntentJsonExtractor.MAX_UNSUPPORTED_REASON_CHARS);
    }

    @Test
    void neverQuotesModelTextInParseErrors() {
        PipelineIntentJsonExtractor.Extraction result = extractor.extract("{\"options\":[\"secret goal text\"]}");

        assertThat(String.join(" ", result.parseErrors())).doesNotContain("secret");
    }

    @Test
    void neverThrowsOnArbitraryText() {
        Random random = new Random(60);
        String alphabet = "{}[]\":,\\ abcAZ09\n`json";
        for (int run = 0; run < 2000; run++) {
            StringBuilder text = new StringBuilder();
            int length = random.nextInt(120);
            for (int i = 0; i < length; i++) {
                text.append(alphabet.charAt(random.nextInt(alphabet.length())));
            }
            assertThatCode(() -> {
                PipelineIntentJsonExtractor.Extraction result = extractor.extract(text.toString());
                assertThat(result.outcome()).isNotNull();
                assertThat(result.options()).isNotNull();
                assertThat(result.parseErrors()).isNotNull();
            }).doesNotThrowAnyException();
        }
        assertThatCode(() -> extractor.extract("{".repeat(100_000))).doesNotThrowAnyException();
    }
}
