import React, { useEffect, useMemo, useState } from "react";
import {
    ChatbotContext,
    ChatbotHealthResponse,
    CitationItem,
    ChatbotConfidence
} from "../../services/types";
import { ChatMessageModel, useChatbotState } from "./useChatbotState";

interface ChatbotPanelProps {
    activeContext?: ChatbotContext;
}

const getContextEntries = (context?: ChatbotContext): Array<{ label: string; value: string }> => {
    if (!context) {
        return [];
    }

    const entries: Array<{ label: string; value: string | undefined }> = [
        { label: "System", value: context.systemName },
        { label: "IR", value: context.irId },
        { label: "Index", value: context.indexId },
        { label: "Run", value: context.runId },
        { label: "Commit", value: context.commitId },
        { label: "Service", value: context.selectedService },
        { label: "Endpoint", value: context.selectedEndpoint }
    ];

    return entries
        .filter((entry): entry is { label: string; value: string } => Boolean(entry.value && entry.value.trim()))
        .map((entry) => ({ label: entry.label, value: entry.value }));
};

export const ConfidenceBadge: React.FC<{ confidence?: ChatbotConfidence }> = ({ confidence }) => {
    const value = confidence || "LOW";
    const colorClass =
        value === "HIGH"
            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
            : value === "MEDIUM"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : value === "INSUFFICIENT_EVIDENCE"
                    ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                    : "bg-slate-500/20 text-slate-300 border-slate-500/40";

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-semibold ${colorClass}`}>
            {value}
        </span>
    );
};

export const RuntimeStatus: React.FC<{
    health: ChatbotHealthResponse | null;
    loading: boolean;
    error: string | null;
}> = ({ health, loading, error }) => {
    if (loading) {
        return <div className="text-xs text-slate-300">Runtime: checking...</div>;
    }
    if (error) {
        return <div className="text-xs text-rose-300">Runtime: unavailable ({error})</div>;
    }
    if (!health) {
        return <div className="text-xs text-slate-400">Runtime: unknown</div>;
    }
    const statusColor =
        health.status === "healthy"
            ? "text-emerald-300"
            : health.status === "degraded"
                ? "text-amber-300"
                : "text-rose-300";
    return (
        <div className={`text-xs ${statusColor}`}>
            Runtime: {health.status} ({health.provider}/{health.model})
        </div>
    );
};

export const CitationList: React.FC<{ citations: CitationItem[] }> = ({ citations }) => {
    return (
        <div className="mt-2">
            <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">Citations</div>
            {citations.length === 0 ? (
                <div className="text-xs text-slate-400 mt-1">No citations available.</div>
            ) : (
                <ul className="mt-1 space-y-1">
                    {citations.map((citation, idx) => (
                        <li key={`${citation.artifactId}-${idx}`} className="text-xs text-slate-300 border border-slate-700 rounded-md p-2 bg-slate-900/70">
                            <div className="font-semibold text-slate-200">
                                {citation.artifactType} · {citation.artifactName || citation.artifactId}
                            </div>
                            <div className="text-slate-400">{citation.locationHint || "n/a"} · {citation.version || "n/a"}</div>
                            <div className="mt-1 text-slate-300">{citation.summary || "No summary provided."}</div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export const ChatMessage: React.FC<{ message: ChatMessageModel }> = ({ message }) => {
    const isUser = message.role === "user";
    return (
        <div className={`rounded-lg p-3 ${isUser ? "bg-cyan-900/40 border border-cyan-700/50" : "bg-slate-800/70 border border-slate-700"}`}>
            <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">{isUser ? "You" : "AridNova Assistant"}</div>
            <div className="text-sm text-slate-100 whitespace-pre-wrap">{message.content}</div>

            {!isUser && message.response && (
                <div className="mt-2 border-t border-slate-700 pt-2">
                    <div className="flex items-center gap-2">
                        <ConfidenceBadge confidence={message.response.confidence} />
                        <div className="text-xs text-slate-400">
                            Flags: {message.response.flags?.length ? message.response.flags.join(", ") : "none"}
                        </div>
                    </div>
                    <CitationList citations={message.response.citations || []} />
                </div>
            )}
        </div>
    );
};

export const ChatComposer: React.FC<{
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    disabled?: boolean;
}> = ({ value, onChange, onSubmit, disabled }) => {
    return (
        <div className="border-t border-slate-700 p-3 bg-slate-900/80">
            <textarea
                data-testid="chatbot-input"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Ask about architecture, risks, changes, or tests..."
                className="w-full h-20 resize-none rounded-md bg-slate-950 border border-slate-700 text-slate-100 text-sm p-2 focus:outline-none focus:ring-2 focus:ring-cyan-600"
                disabled={disabled}
            />
            <div className="mt-2 flex justify-end">
                <button
                    data-testid="chatbot-submit"
                    onClick={onSubmit}
                    disabled={disabled || !value.trim()}
                    className="px-3 py-1.5 rounded-md text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-400 text-white"
                >
                    {disabled ? "Sending..." : "Send"}
                </button>
            </div>
        </div>
    );
};

const ChatbotPanel: React.FC<ChatbotPanelProps> = ({ activeContext }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState("");
    const contextEntries = useMemo(() => getContextEntries(activeContext), [activeContext]);
    const {
        messages,
        loading,
        error,
        health,
        healthLoading,
        healthError,
        sendQuestion,
        retryLastFailed,
        clearConversation,
        refreshHealth,
        canRetry
    } = useChatbotState(contextEntries.length > 0 ? activeContext : undefined);

    useEffect(() => {
        refreshHealth();
    }, [refreshHealth]);

    useEffect(() => {
        if (isOpen) {
            refreshHealth();
        }
    }, [isOpen, refreshHealth]);

    const onSubmit = async () => {
        const question = input.trim();
        if (!question || loading) {
            return;
        }
        await sendQuestion(question);
        setInput("");
    };

    return (
        <>
            <button
                data-testid="chatbot-toggle"
                onClick={() => setIsOpen((prev) => !prev)}
                className="fixed bottom-24 right-4 z-[120] px-4 py-2 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold shadow-xl border border-cyan-400/40"
            >
                {isOpen ? "Close Chat" : "Chatbot"}
            </button>

            {isOpen && (
                <div data-testid="chatbot-panel" className="fixed bottom-36 right-4 z-[120] w-[360px] max-w-[92vw] h-[520px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col">
                    <div className="p-3 border-b border-slate-700 bg-slate-800/90 rounded-t-xl">
                        <div className="text-sm font-bold text-slate-100">AridNova Chatbot</div>
                        <RuntimeStatus health={health} loading={healthLoading} error={healthError} />
                        <div data-testid="chatbot-active-context" className="mt-2 text-[11px] text-slate-300">
                            {contextEntries.length === 0 ? (
                                <span>No active analysis context.</span>
                            ) : (
                                <span>
                                    Active scope: {contextEntries.map((entry) => `${entry.label}: ${entry.value}`).join(" | ")}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {messages.length === 0 ? (
                            <div className="text-sm text-slate-400">
                                Ask a question about your current system context. Responses are grounded in available evidence.
                            </div>
                        ) : (
                            messages.map((message, idx) => (
                                <ChatMessage key={`${message.role}-${idx}`} message={message} />
                            ))
                        )}

                        {error && (
                            <div data-testid="chatbot-error" className="text-xs text-rose-300 border border-rose-700/40 rounded-md p-2 bg-rose-900/20">
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="px-3 pb-2 flex justify-between items-center bg-slate-900/80">
                        <button
                            data-testid="chatbot-clear"
                            onClick={clearConversation}
                            className="text-xs text-slate-300 hover:text-white"
                        >
                            Clear conversation
                        </button>
                        <button
                            data-testid="chatbot-retry"
                            onClick={retryLastFailed}
                            disabled={!canRetry}
                            className="text-xs text-cyan-300 hover:text-cyan-200 disabled:text-slate-500"
                        >
                            Retry last failed
                        </button>
                    </div>

                    <ChatComposer
                        value={input}
                        onChange={setInput}
                        onSubmit={onSubmit}
                        disabled={loading}
                    />
                </div>
            )}
        </>
    );
};

export default ChatbotPanel;
