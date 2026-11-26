package edu.baylor.ecs.cloudhubs.chatbot.util;

public final class StringUtils {

    private StringUtils() {
    }

    public static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    public static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (!isBlank(value)) {
                return value;
            }
        }
        return null;
    }

    public static String valueOrDefault(String value, String fallback) {
        return isBlank(value) ? fallback : value;
    }

    public static boolean equalsIgnoreCase(String value, String normalized) {
        return value != null && value.trim().toLowerCase(java.util.Locale.ROOT).equals(normalized);
    }

    /**
     * Short, model-friendly citation label for the evidence record at the given position
     * (e.g. "E1", "E2"). Real artifact IDs (ir:v1:service:order-service, etc.) are too long and
     * punctuation-heavy for small local models to reproduce verbatim in a [Ex] citation marker, so
     * prompt assembly and citation validation both key off this positional label instead.
     */
    public static String evidenceLabel(int index) {
        return "E" + (index + 1);
    }
}
