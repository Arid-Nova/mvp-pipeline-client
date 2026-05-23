import { useCallback, useMemo, useState } from "react";
import { getChatbotHealth, sendChatbotQuery } from "../../services/api";
import { ChatbotContext, ChatbotHealthResponse, ChatbotResponse } from "../../services/types";

export type ChatMessageModel = {
    role: "user" | "assistant";
    content: string;
    response?: ChatbotResponse;
};

const MAX_MESSAGES = 20;
const HISTORY_MESSAGES = 4;

const trimMessages = (messages: ChatMessageModel[]): ChatMessageModel[] => {
    if (messages.length <= MAX_MESSAGES) {
        return messages;
    }
    return messages.slice(messages.length - MAX_MESSAGES);
};

const toRequestContext = (context?: ChatbotContext): ChatbotContext | undefined => {
    if (!context) {
        return undefined;
    }

    const hasValue = Object.values(context).some((value) => Boolean(value && `${value}`.trim()));
    return hasValue ? context : undefined;
};

export const useChatbotState = (activeContext?: ChatbotContext) => {
    const [messages, setMessages] = useState<ChatMessageModel[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [health, setHealth] = useState<ChatbotHealthResponse | null>(null);
    const [healthLoading, setHealthLoading] = useState(false);
    const [healthError, setHealthError] = useState<string | null>(null);
    const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);

    const context = useMemo(() => toRequestContext(activeContext), [activeContext]);
    const historyMessages = useMemo(
        () => messages.slice(-HISTORY_MESSAGES).map((msg) => ({ role: msg.role, content: msg.content })),
        [messages]
    );

    const refreshHealth = useCallback(async () => {
        try {
            setHealthLoading(true);
            setHealthError(null);
            const status = await getChatbotHealth();
            setHealth(status);
        } catch (fetchError: any) {
            setHealthError(fetchError?.message || "Unable to load runtime status.");
        } finally {
            setHealthLoading(false);
        }
    }, []);

    const sendQuestion = useCallback(async (questionInput: string) => {
        const question = questionInput.trim();
        if (!question || loading) {
            return;
        }

        setError(null);
        setLoading(true);
        setLastFailedQuestion(null);

        setMessages((prev) => trimMessages([...prev, { role: "user", content: question }]));

        try {
            const response = await sendChatbotQuery({
                question,
                context,
                messages: historyMessages
            });

            setMessages((prev) =>
                trimMessages([
                    ...prev,
                    {
                        role: "assistant",
                        content: response.answer,
                        response
                    }
                ])
            );
        } catch (requestError: any) {
            const message = requestError?.message || "Failed to send query.";
            setError(message);
            setLastFailedQuestion(question);
            setMessages((prev) =>
                trimMessages([
                    ...prev,
                    {
                        role: "assistant",
                        content: `Unable to answer right now: ${message}`,
                        response: {
                            answer: `Unable to answer right now: ${message}`,
                            citations: [],
                            confidence: "LOW",
                            flags: ["model_unavailable"],
                            requestId: "n/a",
                            processingTimeMs: 0,
                            model: health?.model || "unknown",
                            provider: health?.provider || "unknown",
                            confidenceRationale: "Chatbot runtime is currently unavailable.",
                            confidenceReasons: ["provider_unavailable"]
                        }
                    }
                ])
            );
        } finally {
            setLoading(false);
        }
    }, [context, health?.model, health?.provider, historyMessages, loading]);

    const retryLastFailed = useCallback(async () => {
        if (!lastFailedQuestion || loading) {
            return;
        }
        await sendQuestion(lastFailedQuestion);
    }, [lastFailedQuestion, loading, sendQuestion]);

    const clearConversation = useCallback(() => {
        setMessages([]);
        setError(null);
        setLastFailedQuestion(null);
    }, []);

    return {
        messages,
        loading,
        error,
        health,
        healthLoading,
        healthError,
        context,
        sendQuestion,
        retryLastFailed,
        clearConversation,
        refreshHealth,
        canRetry: Boolean(lastFailedQuestion) && !loading
    };
};
