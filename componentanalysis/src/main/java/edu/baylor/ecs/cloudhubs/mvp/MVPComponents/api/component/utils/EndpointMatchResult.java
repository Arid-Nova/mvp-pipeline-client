package edu.baylor.ecs.cloudhubs.mvp.MVPComponents.api.component.utils;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * Result of endpoint pattern matching operation.
 *
 * Returned by EndpointPatternIndex when trying to resolve a concrete URL
 * to an endpoint template. Provides information about whether the match
 * succeeded, the resolved endpoint ID, and the type of matching used.
 *
 * Example usage:
 * <pre>
 * EndpointMatchResult result = patternIndex.resolve(
 *     "user-service",
 *     "/api/users/123",
 *     HttpMethod.GET
 * );
 *
 * if (result.isMatched()) {
 *     String endpointId = result.getEndpointId();
 *     String template = result.getTemplateUrl();
 *     MatchType type = result.getMatchType();
 * }
 * </pre>
 */
@Getter
@AllArgsConstructor
public class EndpointMatchResult {

    /**
     * Whether a match was found
     */
    private boolean matched;

    /**
     * Endpoint ID of the matched endpoint (null if not matched).
     * Format: "serviceName:hash"
     */
    private String endpointId;

    /**
     * Template URL of the matched endpoint (null if not matched).
     * For concrete URL "/api/users/123", this would be "/api/users/{id}"
     */
    private String templateUrl;

    /**
     * Type of matching that was performed
     */
    private MatchType matchType;

    /**
     * Confidence score (0-100) indicating how confident we are in this match.
     * - 100: Perfect structural match (can be via EXACT or FUZZY_HIGH_CONFIDENCE)
     * - 90-99: Fuzzy high-confidence match, position-based with very high similarity
     * - 70-89: Fuzzy low-confidence match (not used - we reject these)
     * - 0: No match
     */
    private int confidence;

    /**
     * Type of endpoint matching
     */
    public enum MatchType {
        /**
         * Exact match against an indexed endpoint pattern.
         * Confidence: 100
         * High confidence - the URL structure exactly matches a known endpoint.
         */
        EXACT,

        /**
         * Position-based fuzzy match with high confidence (≥90%).
         * Confidence: 90-100
         * Pattern matched by structure and static segments, ignoring variable names.
         * Only returned if confidence meets the threshold.
         */
        FUZZY_HIGH_CONFIDENCE,

        /**
         * Match using heuristic normalization (ID detection).
         * Confidence: varies
         * Lower confidence - URL doesn't match any known pattern,
         * but we applied heuristics (replacing numbers/UUIDs with {id})
         *
         * @deprecated This type is deprecated and will be removed.
         * Use FUZZY_HIGH_CONFIDENCE instead which only references real endpoints.
         */
        @Deprecated
        HEURISTIC,

        /**
         * No match found.
         * Confidence: 0
         * Either service is unknown or URL structure doesn't match any pattern.
         */
        NONE
    }

    // ============== FACTORY METHODS ==============

    /**
     * Create a "no match" result.
     *
     * @return EndpointMatchResult indicating no match was found
     */
    public static EndpointMatchResult noMatch() {
        return new EndpointMatchResult(false, null, null, MatchType.NONE, 0);
    }

    /**
     * Create an "exact match" result.
     *
     * @param endpointId Endpoint ID that was matched
     * @param templateUrl Template URL from the pattern
     * @return EndpointMatchResult indicating exact match with 100% confidence
     */
    public static EndpointMatchResult exactMatch(String endpointId, String templateUrl) {
        return new EndpointMatchResult(true, endpointId, templateUrl, MatchType.EXACT, 100);
    }

    /**
     * Create a "fuzzy high-confidence match" result.
     *
     * @param endpointId Endpoint ID from the real endpoint that matched
     * @param templateUrl Template URL from the matched pattern
     * @param confidence Confidence score (90-100, where 100 indicates perfect structural match)
     * @return EndpointMatchResult indicating fuzzy match with high confidence
     */
    public static EndpointMatchResult fuzzyMatch(String endpointId, String templateUrl, int confidence) {
        if (confidence < 90 || confidence > 100) {
            throw new IllegalArgumentException("Fuzzy match confidence must be 90-100, got: " + confidence);
        }
        return new EndpointMatchResult(true, endpointId, templateUrl, MatchType.FUZZY_HIGH_CONFIDENCE, confidence);
    }

    /**
     * Create a "heuristic match" result.
     *
     * @param endpointId Endpoint ID generated from heuristic template
     * @param templateUrl Template URL generated heuristically
     * @return EndpointMatchResult indicating heuristic match
     * @deprecated Use fuzzyMatch instead which only references real endpoints
     */
    @Deprecated
    public static EndpointMatchResult heuristicMatch(String endpointId, String templateUrl) {
        return new EndpointMatchResult(true, endpointId, templateUrl, MatchType.HEURISTIC, 50);
    }

    // ============== UTILITY METHODS ==============

    /**
     * Check if this is an exact match.
     *
     * @return true if match type is EXACT
     */
    public boolean isExactMatch() {
        return matchType == MatchType.EXACT;
    }

    /**
     * Check if this is a fuzzy high-confidence match.
     *
     * @return true if match type is FUZZY_HIGH_CONFIDENCE
     */
    public boolean isFuzzyMatch() {
        return matchType == MatchType.FUZZY_HIGH_CONFIDENCE;
    }

    /**
     * Check if this is a heuristic match.
     *
     * @return true if match type is HEURISTIC
     * @deprecated Heuristic matches are deprecated
     */
    @Deprecated
    public boolean isHeuristicMatch() {
        return matchType == MatchType.HEURISTIC;
    }

    /**
     * Check if no match was found.
     *
     * @return true if match type is NONE
     */
    public boolean isNoMatch() {
        return matchType == MatchType.NONE;
    }

    /**
     * Check if this is a high-confidence match (exact or fuzzy with ≥90% confidence).
     *
     * @return true if confidence is high enough to use
     */
    public boolean isHighConfidence() {
        return confidence >= 90;
    }

    @Override
    public String toString() {
        return "EndpointMatchResult{" +
               "matched=" + matched +
               ", endpointId='" + endpointId + '\'' +
               ", templateUrl='" + templateUrl + '\'' +
               ", matchType=" + matchType +
               ", confidence=" + confidence +
               '}';
    }
}
