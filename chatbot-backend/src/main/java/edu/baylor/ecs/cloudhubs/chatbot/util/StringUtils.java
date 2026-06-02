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
}
