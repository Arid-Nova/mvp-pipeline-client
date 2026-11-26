import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getChatbotHealth, refreshChatbotContext, sendChatbotQuery } from "../../services/api";
import { ChatbotContext, ChatbotContextRefreshResponse, ChatbotHealthResponse, ChatbotResponse } from "../../services/types";
import type { PipelineSuggestionSetState } from "./PipelineSuggestionList";

export type ChatMessageKind = "answer" | "pipeline_suggestions" | "pipeline_status";

export type ChatMessageModel = {
    role: "user" | "assistant";
    content: string;
    response?: ChatbotResponse;
    /** Absent for ordinary Q&A turns. Pipeline messages are UI-only (Issue #60, P60-M1-008). */
    kind?: ChatMessageKind;
    pipeline?: PipelineSuggestionSetState;
};

/** Pipeline suggestion and status messages are never sent back as conversational history. */
export const isConversationalMessage = (message: ChatMessageModel): boolean =>
    message.kind === undefined || message.kind === "answer";

/** UI retention only; model history is controlled by the backend runtime configuration. */
const MAX_UI_MESSAGES = 20;

const trimMessages = (messages: ChatMessageModel[]): ChatMessageModel[] => {
    if (messages.length <= MAX_UI_MESSAGES) {
        return messages;
    }
    return messages.slice(messages.length - MAX_UI_MESSAGES);
};

const toRequestContext = (context?: ChatbotContext): ChatbotContext | undefined => {
    if (!context) {
        return undefined;
    }

    const hasValue = Object.values(context).some((value) => Boolean(value && `${value}`.trim()));
    return hasValue ? context : undefined;
};

const toContextId = (context?: ChatbotContext, includeWorkflowEvidence = true): string => {
    if (!context) {
        return "no-context";
    }

    const evidenceFingerprint = includeWorkflowEvidence ? (context.workflowEvidence ?? []).reduce((hash, item) => {
        const value = `${item.cardId}|${item.cardType}|${item.summary}`;
        for (let index = 0; index < value.length; index++) {
            hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
        }
        return hash >>> 0;
    }, 2166136261).toString(16) : "";

    const identifiers = [
        context.systemName,
        context.irId,
        context.indexId,
        context.runId,
        context.commitId,
        context.selectedService,
        context.selectedEndpoint
    ].map((v) => (v || "").trim());

    return [...identifiers, ...(includeWorkflowEvidence ? [evidenceFingerprint] : [])].join("|");
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

/** The Q&A history sent with a question: the last conversational turns only. */
export const buildHistoryMessages = (
    messages: ChatMessageModel[],
    contextId: string,
    historyMaxMessages: number
): { role: string; content: string }[] => {
    if (historyMaxMessages <= 0) return [];
    return messages
        .filter(isConversationalMessage)
        .slice(-historyMaxMessages)
        .map((msg) => toHistoryMessage(msg, contextId));
};

export const useChatbotState = (activeContext?: ChatbotContext) => {
    const [messages, setMessages] = useState<ChatMessageModel[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [health, setHealth] = useState<ChatbotHealthResponse | null>(null);
    const [healthLoading, setHealthLoading] = useState(false);
    const [healthError, setHealthError] = useState<string | null>(null);
    const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
    const [lastFailedScope, setLastFailedScope] = useState<Partial<ChatbotContext>>({});
    const [refreshLoading, setRefreshLoading] = useState(false);
    const [refreshResult, setRefreshResult] = useState<ChatbotContextRefreshResponse | null>(null);
    const [refreshError, setRefreshError] = useState<string | null>(null);
    const [localStaleContext, setLocalStaleContext] = useState(false);

    const context = useMemo(() => toRequestContext(activeContext), [activeContext]);
    const contextId = useMemo(() => toContextId(context), [context]);
    const refreshContextId = useMemo(() => toContextId(context, false), [context]);
    const lastContextIdRef = useRef(refreshContextId);
    const lastConversationContextIdRef = useRef(contextId);

    const historyMessages = useMemo(
        () => buildHistoryMessages(messages, contextId, health?.historyMaxMessages ?? 0),
        [messages, contextId, health?.historyMaxMessages]
    );

    // Refresh the chatbot context and update the state
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

    // Automatic refresh trigger when the context changes
    useEffect(() => {
        const conversationContextChanged = lastConversationContextIdRef.current !== contextId;
        const refreshScopeChanged = lastContextIdRef.current !== refreshContextId;

        if (conversationContextChanged) {
            // A new result/context invalidates Q&A history, but build-mode pipeline cards are
            // independent UI messages and should remain visible in the transcript.
            setMessages((previous) => previous.filter((message) => !isConversationalMessage(message)));
            setError(null);
            setLastFailedQuestion(null);
            setLastFailedScope({});
            setLocalStaleContext(false);
            lastConversationContextIdRef.current = contextId;
        }

        if (refreshScopeChanged) {
            setRefreshResult(null);
            setRefreshError(null);
            lastContextIdRef.current = refreshContextId;

            if (refreshContextId !== "no-context") {
                refreshContext();
            }
        }
    }, [contextId, refreshContextId, refreshContext]);

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

    const sendQuestion = useCallback(async (
        questionInput: string,
        scopeOverride: Partial<ChatbotContext> = {}
    ) => {
        const question = questionInput.trim();
        if (!question || loading) {
            return;
        }

        setError(null);
        setLoading(true);
        setLastFailedQuestion(null);
        setLastFailedScope({});

        setMessages((prev) => trimMessages([...prev, { role: "user", content: question }]));

        try {
            const response = await sendChatbotQuery({
                question,
                context: context ? { ...context, ...scopeOverride } : undefined,
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
            setLastFailedScope(scopeOverride);
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
        await sendQuestion(lastFailedQuestion, lastFailedScope);
    }, [lastFailedQuestion, lastFailedScope, loading, sendQuestion]);

    /** Adds a UI-only pipeline message (suggestions or status). */
    const appendPipelineMessage = useCallback((message: ChatMessageModel) => {
        setMessages((prev) => trimMessages([...prev, message]));
    }, []);

    /** Updates the suggestion set with the given ID (or every set, for null) in the conversation. */
    const updatePipelineSuggestions = useCallback(
        (suggestionSetId: string | null, update: (state: PipelineSuggestionSetState) => PipelineSuggestionSetState) => {
            setMessages((prev) => {
                let changed = false;
                const next = prev.map((message) => {
                    if (message.kind !== "pipeline_suggestions" || !message.pipeline) return message;
                    if (suggestionSetId !== null && message.pipeline.suggestionSetId !== suggestionSetId) return message;
                    const updated = update(message.pipeline);
                    if (updated === message.pipeline) return message;
                    changed = true;
                    return { ...message, pipeline: updated };
                });
                return changed ? next : prev;
            });
        },
        []
    );

    const clearConversation = useCallback(() => {
        setMessages([]);
        setError(null);
        setLastFailedQuestion(null);
        setLastFailedScope({});
    }, []);

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
        lastFailedScope,
        sendQuestion,
        retryLastFailed,
        clearConversation,
        appendPipelineMessage,
        updatePipelineSuggestions,
        refreshHealth,
        refreshContext,
        canRetry: Boolean(lastFailedQuestion) && !loading
    };
};
