/**
 * P60-M1-008 — "Build a pipeline" mode in ChatbotPanel, with the real usePipelinePlanner,
 * parser, composer, validator and candidate assembly. Only services/api is mocked.
 */
import fs from "fs";
import path from "path";
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getChatbotHealth, refreshChatbotContext, requestPipelineIntents, sendChatbotQuery } from "../../services/api";
import { PipelineIntentRequest, PipelineIntentsCallResult } from "../../services/types";
import { ApplyResult } from "../pipeline/planning/pipelineApplier";
import { ValidatedSuggestion, isValidatedSuggestion } from "../pipeline/planning/pipelineValidator";
import ChatbotPanel from "./ChatbotPanel";

jest.mock("../../services/api", () => ({
    getChatbotHealth: jest.fn(),
    sendChatbotQuery: jest.fn(),
    refreshChatbotContext: jest.fn(),
    requestPipelineIntents: jest.fn(),
}));

const mockedHealth = getChatbotHealth as jest.Mock;
const mockedSendQuery = sendChatbotQuery as jest.Mock;
const mockedRefresh = refreshChatbotContext as jest.Mock;
const mockedIntents = requestPipelineIntents as jest.MockedFunction<typeof requestPipelineIntents>;

const G1 = "I want to visualize the architecture and check authorization problems.";
const fixture = (name: string): Record<string, unknown> =>
    JSON.parse(fs.readFileSync(path.join(__dirname, "../pipeline/planning/__fixtures__", `intent-response.${name}.json`), "utf8"));
const reply = (name: string, request: PipelineIntentRequest): PipelineIntentsCallResult => ({
    kind: "response",
    status: 200,
    data: { ...fixture(name), suggestionSetId: request.suggestionSetId, catalogVersion: request.catalogVersion },
});

/** Every intent request waits until the test releases it. */
const deferredBackend = () => {
    const calls: { request: PipelineIntentRequest; signal?: AbortSignal; release: (name: string) => void }[] = [];
    mockedIntents.mockImplementation(
        (request, options) =>
            new Promise((resolve) => {
                calls.push({ request, signal: options?.signal, release: (name) => resolve(reply(name, request)) });
            })
    );
    return calls;
};

const okResult = (): ApplyResult => ({
    ok: true,
    addedNodeIds: ["n1"],
    pendingConfiguration: [
        { cardType: "SYSTEM_INPUT", cardTitle: "System Source", kind: "before_run", hint: "Enter a system name and at least one repository.", cardCount: 1 },
    ],
});

interface PanelProps {
    onApply?: jest.Mock<ApplyResult, [ValidatedSuggestion]>;
    canvasIsEmpty?: boolean;
    isPipelineRunning?: boolean;
}

const panel = ({ onApply, canvasIsEmpty = true, isPipelineRunning = false }: PanelProps) => (
    <ChatbotPanel onApplyPipelineSuggestion={onApply} canvasIsEmpty={canvasIsEmpty} isPipelineRunning={isPipelineRunning} />
);

const openPanel = async (props: PanelProps) => {
    const utils = render(panel(props));
    fireEvent.click(screen.getByTestId("chatbot-toggle"));
    await screen.findByTestId("chatbot-panel");
    return utils;
};

const switchToBuild = () => fireEvent.click(screen.getByRole("button", { name: "Build a pipeline" }));

const submit = (text: string) => {
    fireEvent.change(screen.getByTestId("chatbot-input"), { target: { value: text } });
    fireEvent.click(screen.getByTestId("chatbot-submit"));
};

/** Builds a suggestion set: switch to Build, submit G1, let the backend answer with a fixture. */
const planSuccessfully = async (calls: ReturnType<typeof deferredBackend>, fixtureName = "valid") => {
    switchToBuild();
    submit(G1);
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => {
        calls[calls.length - 1].release(fixtureName);
    });
    await screen.findByTestId("pipeline-suggestions");
};

describe("ChatbotPanel — Build a pipeline mode (P60-M1-008)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedHealth.mockResolvedValue({ status: "healthy", provider: "OLLAMA", model: "llama3.2", baseUrl: "x", message: "ok", checkedAt: "", latencyMs: 1 });
        mockedRefresh.mockResolvedValue({ success: true, refreshedArtifactCountsByType: {}, unavailableProviders: [], refreshedAt: "", refreshVersion: "", message: "ok", staleContext: false });
        mockedSendQuery.mockResolvedValue({ answer: "A normal answer.", citations: [], confidence: "HIGH", flags: [], requestId: "r", processingTimeMs: 1, model: "llama3.2", provider: "OLLAMA" });
    });

    it("shows no mode toggle without an apply handler (plain Q&A panel)", async () => {
        await openPanel({});
        expect(screen.queryByTestId("chatbot-mode-toggle")).toBeNull();
        expect(screen.getByTestId("chatbot-input")).toHaveAttribute("placeholder", "Ask about architecture, risks...");
    });

    it("shows the toggle with Ask selected by default; switching to Build changes the placeholder and plans nothing", async () => {
        await openPanel({ onApply: jest.fn() });
        const toggle = screen.getByTestId("chatbot-mode-toggle");
        expect(toggle).toHaveAttribute("role", "group");
        expect(screen.getByRole("button", { name: "Ask" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "Build a pipeline" })).toHaveAttribute("aria-pressed", "false");

        switchToBuild();

        expect(screen.getByRole("button", { name: "Build a pipeline" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByTestId("chatbot-input")).toHaveAttribute("placeholder", "Describe what you want to analyze…");
        expect(mockedIntents).not.toHaveBeenCalled();
    });

    it("Ask mode keeps Q&A even for 'build me a pipeline' (D2)", async () => {
        const onApply = jest.fn();
        await openPanel({ onApply });

        submit("build me a pipeline");

        await waitFor(() => expect(mockedSendQuery).toHaveBeenCalledTimes(1));
        expect(mockedSendQuery.mock.calls[0][0].question).toBe("build me a pipeline");
        expect(await screen.findByText("A normal answer.")).toBeInTheDocument();
        expect(mockedIntents).not.toHaveBeenCalled();
        expect(screen.queryByTestId("pipeline-suggestions")).toBeNull();
        expect(onApply).not.toHaveBeenCalled();
    });

    it("Build mode plans without an analysis context: one request, no Q&A, progress with Cancel, Send disabled", async () => {
        const calls = deferredBackend();
        await openPanel({ onApply: jest.fn() });
        switchToBuild();

        submit(G1);

        await waitFor(() => expect(calls).toHaveLength(1));
        expect(calls[0].request.goal).toBe(G1);
        expect(calls[0].request.attempt).toBe(1);
        expect(mockedSendQuery).not.toHaveBeenCalled();
        expect(screen.getByTestId("pipeline-planning-progress")).toHaveTextContent("Designing three pipeline options… local models can take up to a minute");
        expect(screen.getByTestId("pipeline-planning-progress")).toHaveAttribute("role", "status");
        expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
        expect(screen.getByTestId("chatbot-submit")).toBeDisabled();
        expect(screen.getByTestId("chatbot-input")).toBeEnabled(); // the goal stays editable

        fireEvent.click(screen.getByTestId("chatbot-submit"));
        fireEvent.keyDown(screen.getByTestId("chatbot-input"), { key: "Enter" });
        expect(calls).toHaveLength(1);
    });

    it("Cancel aborts the plan, removes the progress line and appends nothing", async () => {
        const calls = deferredBackend();
        const onApply = jest.fn();
        await openPanel({ onApply });
        switchToBuild();
        submit(G1);
        await waitFor(() => expect(calls).toHaveLength(1));

        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(calls[0].signal?.aborted).toBe(true);
        expect(screen.queryByTestId("pipeline-planning-progress")).toBeNull();
        await act(async () => calls[0].release("valid"));
        expect(screen.queryByTestId("pipeline-suggestions")).toBeNull();
        expect(screen.queryByTestId("pipeline-planning-failure")).toBeNull();
        expect(onApply).not.toHaveBeenCalled();
    });

    it("a successful plan becomes exactly one suggestion message with three cards; prop changes never re-plan or duplicate it", async () => {
        const calls = deferredBackend();
        const onApply = jest.fn();
        const { rerender } = await openPanel({ onApply });

        await planSuccessfully(calls);

        expect(screen.getAllByTestId("pipeline-suggestions")).toHaveLength(1);
        expect(screen.getAllByRole("article")).toHaveLength(3);
        expect(screen.queryByTestId("pipeline-planning-progress")).toBeNull();
        expect(screen.getByTestId("chatbot-input")).toHaveValue("");

        rerender(panel({ onApply, canvasIsEmpty: false }));
        rerender(panel({ onApply, canvasIsEmpty: true, isPipelineRunning: true }));
        rerender(panel({ onApply, canvasIsEmpty: true }));

        expect(screen.getAllByTestId("pipeline-suggestions")).toHaveLength(1);
        expect(calls).toHaveLength(1);
        expect(onApply).not.toHaveBeenCalled(); // nothing is applied before an explicit Use click
    });

    it("selecting a card applies its exact ValidatedSuggestion once, locks the set and adds a next-step status", async () => {
        const calls = deferredBackend();
        const onApply = jest.fn<ApplyResult, [ValidatedSuggestion]>(() => okResult());
        const { rerender } = await openPanel({ onApply });
        await planSuccessfully(calls);

        fireEvent.click(screen.getByTestId("pipeline-suggestion-select-2"));

        expect(onApply).toHaveBeenCalledTimes(1);
        const applied = onApply.mock.calls[0][0];
        expect(isValidatedSuggestion(applied)).toBe(true);
        expect(applied.spec.title).toBe("Architecture, policy and scenario comparison");
        expect(screen.getByTestId("pipeline-suggestion-applied-2")).toHaveTextContent("Added to canvas ✓");
        expect(screen.getByTestId("pipeline-status")).toHaveTextContent(
            "Pipeline added. Configure System Source: enter a system name and at least one repository. Then press Run."
        );
        expect(screen.queryByText(/Pipeline added\. Next:/)).toBeNull(); // the page's toast is not duplicated here

        // As if the user pressed Undo: the canvas is empty again, but this set stays locked.
        rerender(panel({ onApply, canvasIsEmpty: false }));
        rerender(panel({ onApply, canvasIsEmpty: true }));
        expect(screen.getByTestId("pipeline-suggestion-select-1")).toBeDisabled();
        expect(screen.getByTestId("pipeline-suggestion-select-3")).toBeDisabled();
        expect(calls).toHaveLength(1);
    });

    it.each(["canvas_not_empty", "pipeline_running", "invalid", "catalog_mismatch"] as const)(
        "an apply failure (%s) shows safe guidance, adds no status and plans nothing",
        async (reason) => {
            const calls = deferredBackend();
            const onApply = jest.fn<ApplyResult, [ValidatedSuggestion]>(() => ({ ok: false, reason, message: "ignored" }));
            await openPanel({ onApply });
            await planSuccessfully(calls);

            fireEvent.click(screen.getByTestId("pipeline-suggestion-select-1"));

            expect(screen.getByTestId("pipeline-suggestions-apply-error")).toBeInTheDocument();
            expect(screen.queryByTestId("pipeline-status")).toBeNull();
            expect(calls).toHaveLength(1);
            expect(mockedSendQuery).not.toHaveBeenCalled();
        }
    );

    it("a recoverable failure clears once the canvas becomes usable again", async () => {
        const calls = deferredBackend();
        const onApply = jest.fn<ApplyResult, [ValidatedSuggestion]>(() => ({ ok: false, reason: "canvas_not_empty", message: "x" }));
        const { rerender } = await openPanel({ onApply });
        await planSuccessfully(calls);

        fireEvent.click(screen.getByTestId("pipeline-suggestion-select-1")); // UI was stale: the canvas is not empty
        rerender(panel({ onApply, canvasIsEmpty: false }));
        expect(screen.getAllByText(/can be added only to an empty canvas/)).toHaveLength(1);
        rerender(panel({ onApply, canvasIsEmpty: true }));

        expect(screen.queryByTestId("pipeline-suggestions-apply-error")).toBeNull();
        expect(screen.getByTestId("pipeline-suggestion-select-1")).toBeEnabled();
    });

    it("non-empty canvas (T24): plans and shows three disabled cards, then the same cards enable after Clear All", async () => {
        const calls = deferredBackend();
        const onApply = jest.fn<ApplyResult, [ValidatedSuggestion]>(() => okResult());
        const { rerender } = await openPanel({ onApply, canvasIsEmpty: false });
        await planSuccessfully(calls);
        const setId = calls[0].request.suggestionSetId;

        [1, 2, 3].forEach((n) => expect(screen.getByTestId(`pipeline-suggestion-select-${n}`)).toBeDisabled());
        expect(screen.getByTestId("pipeline-suggestions-empty-canvas-notice")).toBeInTheDocument();
        const titles = screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"));

        rerender(panel({ onApply, canvasIsEmpty: true }));

        [1, 2, 3].forEach((n) => expect(screen.getByTestId(`pipeline-suggestion-select-${n}`)).toBeEnabled());
        expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual(titles);
        expect(calls).toHaveLength(1);
        expect(calls[0].request.suggestionSetId).toBe(setId);
    });

    it("dismiss never applies; a new Build request creates a new, separate set", async () => {
        const calls = deferredBackend();
        const onApply = jest.fn();
        const { rerender } = await openPanel({ onApply });
        await planSuccessfully(calls);

        fireEvent.click(screen.getByTestId("pipeline-suggestions-dismiss"));
        rerender(panel({ onApply, canvasIsEmpty: true }));
        expect(screen.getByTestId("pipeline-suggestions-dismissed")).toBeInTheDocument();
        expect(screen.queryByTestId("pipeline-suggestion-select-1")).toBeNull();

        submit(G1);
        await waitFor(() => expect(calls).toHaveLength(2));
        await act(async () => calls[1].release("retry-completion"));

        await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));
        expect(calls[1].request.suggestionSetId).not.toBe(calls[0].request.suggestionSetId);
        expect(onApply).not.toHaveBeenCalled();
    });

    it("a planner failure shows no suggestion cards and no partial result", async () => {
        const calls = deferredBackend();
        await openPanel({ onApply: jest.fn() });
        switchToBuild();
        submit(G1);
        await waitFor(() => expect(calls).toHaveLength(1));
        await act(async () => calls[0].release("unsupported"));

        expect(await screen.findByTestId("pipeline-planning-failure")).toBeInTheDocument();
        expect(screen.queryByTestId("pipeline-suggestions")).toBeNull();
        // Failure actions (Retry plan, Browse templates) belong to P60-M1-009.
        expect(screen.queryByRole("button", { name: /browse templates|^retry$/i })).toBeNull();
    });

    it("pipeline messages never reach the Q&A history", async () => {
        const calls = deferredBackend();
        const onApply = jest.fn<ApplyResult, [ValidatedSuggestion]>(() => okResult());
        await openPanel({ onApply });
        await planSuccessfully(calls);
        fireEvent.click(screen.getByTestId("pipeline-suggestion-select-1"));

        fireEvent.click(screen.getByRole("button", { name: "Ask" }));
        submit("What does the IR card do?");

        await waitFor(() => expect(mockedSendQuery).toHaveBeenCalledTimes(1));
        const history = JSON.stringify(mockedSendQuery.mock.calls[0][0].messages);
        expect(history).not.toMatch(/Pipeline added|pc_|SYSTEM_INPUT|Architecture and authorization/);
    });

    it("adds no telemetry, template fallback, health gating or clear/save/run shortcuts", () => {
        const sources = ["ChatbotPanel.tsx", "PipelineSuggestionList.tsx", "PipelineSuggestionCard.tsx", "ChatComposer.tsx"]
            .map((file) => fs.readFileSync(path.join(__dirname, file), "utf8"))
            .join("\n");
        expect(sources).not.toMatch(/posthog|track\(|onOpenTemplateLibrary|TemplateLibrary|clearPipeline|window\.confirm|saveSession|runPipeline|requestPipelineIntents|\/chatbot\/pipeline/);
    });
});
