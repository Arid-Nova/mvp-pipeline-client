import { ChatbotResponse } from "../../services/types";
import { ChatMessageModel, buildHistoryMessages, isConversationalMessage } from "./useChatbotState";

// The hook module imports services/api (axios ESM); only the pure history helpers are tested here.
jest.mock("../../services/api", () => ({ getChatbotHealth: jest.fn(), sendChatbotQuery: jest.fn(), refreshChatbotContext: jest.fn() }));

const answer = (text: string): ChatMessageModel => ({
    role: "assistant",
    content: text,
    response: {
        answer: text,
        citations: [{ artifactType: "SERVICE", artifactId: "svc-1", artifactName: "order-service" }],
        confidence: "HIGH",
        flags: [],
        requestId: "r",
        processingTimeMs: 1,
        model: "llama3.2",
        provider: "OLLAMA",
    } as unknown as ChatbotResponse,
});

const suggestionsMessage: ChatMessageModel = {
    role: "assistant",
    content: "",
    kind: "pipeline_suggestions",
    pipeline: { suggestionSetId: "set-1", goal: "secret goal", items: [] as never, appliedCandidateId: "pc_0123456789" },
};
const statusMessage: ChatMessageModel = { role: "assistant", content: "Pipeline added. Then press Run.", kind: "pipeline_status" };

describe("chat history for Q&A", () => {
    it("keeps ordinary questions and answers exactly as before", () => {
        const history = buildHistoryMessages([{ role: "user", content: "Which services changed?" }, answer("Two services changed.")], "ctx-1");
        expect(history).toEqual([
            { role: "user", content: "PREV_USER_QUESTION: Which services changed?\nACTIVE_CONTEXT_ID: ctx-1" },
            { role: "assistant", content: "PREV_ANSWER_SUMMARY: Two services changed.\nCITED_ENTITIES: order-service, svc-1\nACTIVE_CONTEXT_ID: ctx-1" },
        ]);
    });

    it("excludes pipeline suggestion and status messages, including their IDs and specs", () => {
        const messages: ChatMessageModel[] = [
            { role: "user", content: "Q1" },
            answer("A1"),
            suggestionsMessage,
            statusMessage,
            { role: "user", content: "Q2" },
            answer("A2"),
        ];

        const history = buildHistoryMessages(messages, "ctx");

        expect(history).toHaveLength(4);
        expect(JSON.stringify(history)).not.toMatch(/Pipeline added|set-1|pc_0123456789|secret goal|PREV_ANSWER_SUMMARY: n\/a/);
        expect(isConversationalMessage(suggestionsMessage)).toBe(false);
        expect(isConversationalMessage(statusMessage)).toBe(false);
        expect(isConversationalMessage({ role: "user", content: "x" })).toBe(true);
        expect(isConversationalMessage({ ...answer("x"), kind: "answer" })).toBe(true);
    });

    it("still sends the last four conversational turns when pipeline messages are interleaved", () => {
        const messages: ChatMessageModel[] = [
            { role: "user", content: "Q1" },
            answer("A1"),
            { role: "user", content: "Q2" },
            answer("A2"),
            suggestionsMessage,
            statusMessage,
        ];
        expect(buildHistoryMessages(messages, "ctx").map((m) => m.content.split("\n")[0])).toEqual([
            "PREV_USER_QUESTION: Q1",
            "PREV_ANSWER_SUMMARY: A1",
            "PREV_USER_QUESTION: Q2",
            "PREV_ANSWER_SUMMARY: A2",
        ]);
    });
});
