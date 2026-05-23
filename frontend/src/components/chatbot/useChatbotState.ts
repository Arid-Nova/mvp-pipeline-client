import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getChatbotHealth, refreshChatbotContext, sendChatbotQuery } from "../../services/api";
import { ChatbotContext, ChatbotContextRefreshResponse, ChatbotHealthResponse, ChatbotResponse } from "../../services/types";

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

const toContextId = (context?: ChatbotContext): string => {
    if (!context) {
        return "no-context";
    }
    return [
        context.systemName,
        context.irId,
        context.indexId,
        context.runId,
        context.commitId,
        context.selectedService,
        context.selectedEndpoint
    ].map((v) => (v || "").trim()).join("|");
};

const summarizeAnswer = (response?: ChatbotResponse): string => {
    const text = response?.answer?.replace(/\s+/g, " ").trim() || "";
    if (text.length <= 180) {
        return text;
    }
    return `${text.slice(0, 180)}...`;
};

const citedEntities = (response?: ChatbotResponse): string[] => {
    if (!response?.citations?.length) {
        return [];
    }
    const values = response.citations.flatMap((c) => [
        c.serviceName,
        c.entityName,
        c.endpointPath,
        c.artifactName,
        c.artifactId
    ]);
    return Array.from(new Set(values.filter((v): v is string => Boolean(v && v.trim())).map((v) => v.trim())));
};

const toHistoryMessage = (msg: ChatMessageModel, contextId: string): { role: string; content: string } => {
    if (msg.role === "user") {
        return {
            role: "user",
            content: `PREV_USER_QUESTION: ${msg.content}\nACTIVE_CONTEXT_ID: ${contextId}`
        };
    }
    const summary = summarizeAnswer(msg.response);
    const entities = citedEntities(msg.response);
    return {
        role: "assistant",
        content: [
            `PREV_ANSWER_SUMMARY: ${summary || "n/a"}`,
            `CITED_ENTITIES: ${entities.length ? entities.join(", ") : "none"}`,
            `ACTIVE_CONTEXT_ID: ${contextId}`
        ].join("\n")
    };
};

export const useChatbotState = (activeContext?: ChatbotContext) => {
    const [messages, setMessages] = useState<ChatMessageModel[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [health, setHealth] = useState<ChatbotHealthResponse | null>(null);
    const [healthLoading, setHealthLoading] = useState(false);
    const [healthError, setHealthError] = useState<string | null>(null);
    const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
    const [refreshLoading, setRefreshLoading] = useState(false);
    const [refreshResult, setRefreshResult] = useState<ChatbotContextRefreshResponse | null>(null);
    const [refreshError, setRefreshError] = useState<string | null>(null);
    const [localStaleContext, setLocalStaleContext] = useState(false);

    const context = useMemo(() => toRequestContext(activeContext), [activeContext]);
    const contextId = useMemo(() => toContextId(context), [context]);
    const lastContextIdRef = useRef(contextId);
    const historyMessages = useMemo(
        () => messages.slice(-HISTORY_MESSAGES).map((msg) => toHistoryMessage(msg, contextId)),
        [messages, contextId]
    );

    useEffect(() => {
        if (lastContextIdRef.current !== contextId) {
            setMessages([]);
            setError(null);
            setLastFailedQuestion(null);
            setRefreshResult(null);
            setRefreshError(null);
            setLocalStaleContext(false);
            lastContextIdRef.current = contextId;
        }
    }, [contextId]);

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

    const refreshContext = useCallback(async () => {
        if (!context) {
            setRefreshResult(null);
            setRefreshError("No active context selected. Choose a system/IR/session before refresh.");
            setLocalStaleContext(true);
            return;
        }

        try {
            setRefreshLoading(true);
            setRefreshError(null);
            const result = await refreshChatbotContext({ context });
            setRefreshResult(result);
            setLocalStaleContext(Boolean(result.staleContext));
        } catch (requestError: any) {
            setRefreshResult(null);
            setRefreshError(requestError?.message || "Failed to refresh context.");
            setLocalStaleContext(true);
        } finally {
            setRefreshLoading(false);
        }
    }, [context]);

    return {
        messages,
        loading,
        error,
        health,
        healthLoading,
        healthError,
        refreshLoading,
        refreshResult,
        refreshError,
        localStaleContext,
        context,
        sendQuestion,
        retryLastFailed,
        clearConversation,
        refreshHealth,
        refreshContext,
        canRetry: Boolean(lastFailedQuestion) && !loading
    };
};
