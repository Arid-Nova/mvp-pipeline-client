/**
 * P60-M1-009 — ChatbotPanel failure states. usePipelinePlanner is replaced by a controllable fake so
 * every PlanFailure (including causes the real planner rarely produces) can be rendered directly.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getChatbotHealth, refreshChatbotContext, sendChatbotQuery } from "../../services/api";
import { PlanFailure, PlanOutcome } from "../pipeline/planning/pipelinePlanner";
import ChatbotPanel from "./ChatbotPanel";
import { PipelinePlannerState } from "./usePipelinePlanner";

jest.mock("../../services/api", () => ({
    getChatbotHealth: jest.fn(),
    sendChatbotQuery: jest.fn(),
    refreshChatbotContext: jest.fn(),
    requestPipelineIntents: jest.fn(),
}));

const mockPlanner: {
    state: PipelinePlannerState;
    plan: jest.Mock<Promise<PlanOutcome>, [string]>;
    cancel: jest.Mock;
} = { state: { status: "idle" }, plan: jest.fn(), cancel: jest.fn() };

jest.mock("./usePipelinePlanner", () => ({
    usePipelinePlanner: () => ({
        state: mockPlanner.state,
        isPlanning: mockPlanner.state.status === "planning",
        suggestions: null,
        plan: mockPlanner.plan,
        cancel: mockPlanner.cancel,
    }),
}));

const mockedHealth = getChatbotHealth as jest.Mock;
const mockedSendQuery = sendChatbotQuery as jest.Mock;
const mockedRefresh = refreshChatbotContext as jest.Mock;

const GOAL = "I want to visualize the architecture and check authorization problems.";
const healthy = { status: "healthy", provider: "OLLAMA", model: "llama3.2", baseUrl: "x", message: "ok", checkedAt: "", latencyMs: 1 };
const unavailable = { ...healthy, status: "unavailable", message: "down" };

const failure = (reason: string, cause: string, extra: Partial<PlanFailure> = {}): PlanFailure =>
    ({ status: "failure", suggestionSetId: "set-1", reason, cause, message: "planner text", attempts: 2, rejectedByCode: {}, ...extra } as PlanFailure);

const props = (overrides: Record<string, unknown> = {}) => ({
    onApplyPipelineSuggestion: jest.fn(),
    onOpenTemplateLibrary: jest.fn(),
    canvasIsEmpty: true,
    isPipelineRunning: false,
    ...overrides,
});

/** Opens the panel in Build mode and submits the goal (the fake planner records it). */
const startInBuild = async (panelProps = props()) => {
    const utils = render(<ChatbotPanel {...panelProps} />);
    fireEvent.click(screen.getByTestId("chatbot-toggle"));
    await screen.findByTestId("chatbot-panel");
    await waitFor(() => expect(mockedHealth).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Build a pipeline" }));
    await waitFor(() => expect(screen.queryByTestId("pipeline-planning-unavailable")).toBeNull());
    fireEvent.change(screen.getByTestId("chatbot-input"), { target: { value: GOAL } });
    fireEvent.click(screen.getByTestId("chatbot-submit"));
    expect(mockPlanner.plan).toHaveBeenCalledWith(GOAL);
    return { ...utils, panelProps, rerenderWith: (state: PipelinePlannerState) => {
        mockPlanner.state = state;
        utils.rerender(<ChatbotPanel {...panelProps} />);
    } };
};

describe("ChatbotPanel — planning failures (P60-M1-009)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPlanner.state = { status: "idle" };
        mockPlanner.plan.mockImplementation(async () => failure("cancelled", "CANCELLED"));
        mockedHealth.mockResolvedValue(healthy);
        mockedRefresh.mockResolvedValue({ success: true, refreshedArtifactCountsByType: {}, unavailableProviders: [], refreshedAt: "", refreshVersion: "", message: "ok", staleContext: false });
        mockedSendQuery.mockResolvedValue({ answer: "An answer.", citations: [], confidence: "HIGH", flags: [], requestId: "r", processingTimeMs: 1, model: "m", provider: "p" });
    });

    it.each([
        ["model_unavailable", "MODEL_UNAVAILABLE", "The assistant's model isn't reachable right now.", true, true],
        ["model_unavailable", "UNEXPECTED_ERROR", "Something went wrong while preparing pipeline suggestions.", true, true],
        ["timeout", "DEADLINE_EXCEEDED", "That took too long. Local models can be slow — try again or a shorter description.", true, true],
        ["invalid_model_output", "INVALID_MODEL_OUTPUT", "The assistant couldn't produce usable analysis options for that goal.", true, true],
        ["insufficient_valid_candidates", "INSUFFICIENT_DISTINCT", "I couldn't find three valid, different pipelines for that goal. Try describing it differently.", true, true],
        ["unsupported_goal", "UNSUPPORTED_GOAL", "AridNova pipelines can:", false, true],
        ["catalog_mismatch", "CATALOG_VERSION_MISMATCH", "The app was updated — please reload the page.", false, false],
        ["request_invalid", "BAD_REQUEST", "Please describe your goal in 1 to 1000 characters.", false, false],
    ])("%s (%s): safe message and the right actions, never cards", async (reason, cause, message, retry, browse) => {
        const { rerenderWith, panelProps } = await startInBuild();

        rerenderWith({ status: "failure", outcome: failure(reason, cause) });

        const box = screen.getByTestId("pipeline-planning-failure");
        expect(box).toHaveAttribute("role", "alert");
        expect(box).toHaveTextContent(message);
        expect(box).not.toHaveTextContent(/planner text|UNEXPECTED_ERROR|MODEL_UNAVAILABLE/);
        expect(Boolean(screen.queryByRole("button", { name: "Retry" }))).toBe(retry);
        expect(Boolean(screen.queryByRole("button", { name: "Browse templates" }))).toBe(browse);
        expect(screen.queryAllByRole("article")).toHaveLength(0);
        expect(screen.queryByTestId("pipeline-suggestion-select-1")).toBeNull();
        expect(screen.getByTestId("chatbot-input")).toBeEnabled();
        expect(panelProps.onApplyPipelineSuggestion).not.toHaveBeenCalled();
    });

    it("the unexpected-error cause never says the model is unreachable", async () => {
        const { rerenderWith } = await startInBuild();
        rerenderWith({ status: "failure", outcome: failure("model_unavailable", "UNEXPECTED_ERROR") });
        expect(screen.queryByText("The assistant's model isn't reachable right now.")).toBeNull();
        expect(screen.getByText("Something went wrong while preparing pipeline suggestions.")).toBeInTheDocument();
    });

    it("a cancelled plan shows no failure and no actions", async () => {
        const { rerenderWith } = await startInBuild();
        rerenderWith({ status: "failure", outcome: failure("cancelled", "CANCELLED") });
        expect(screen.queryByTestId("pipeline-planning-failure")).toBeNull();
        expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    });

    it("an unsupported goal shows the bounded reason as plain text plus the capability areas", async () => {
        const { rerenderWith } = await startInBuild();
        const hostile = '<img src=x onerror="alert(1)"> We only analyse microservices.';
        rerenderWith({ status: "failure", outcome: failure("unsupported_goal", "UNSUPPORTED_GOAL", { unsupportedReason: hostile }) });

        expect(screen.getByTestId("pipeline-unsupported-reason")).toHaveTextContent(hostile);
        expect(screen.queryByRole("img")).toBeNull();
        const areas = screen.getByTestId("pipeline-capability-areas");
        expect(areas).toHaveTextContent("Processes: Formal Verification, Scenario Generation, LLM Prompter, Test Suite Generation");
        expect(areas).toHaveTextContent("Version Control: Change Impact, Policy Drift");
        expect(areas.textContent).not.toMatch(/FORMAL_VERIFY|SECURITY_REGRESSION|Input|Generators/);
    });

    it("Retry starts one new plan for the original goal, even if the input was edited, and ignores double clicks", async () => {
        const { rerenderWith } = await startInBuild();
        rerenderWith({ status: "failure", outcome: failure("timeout", "DEADLINE_EXCEEDED") });
        fireEvent.change(screen.getByTestId("chatbot-input"), { target: { value: "something else" } });

        const retry = screen.getByRole("button", { name: "Retry" });
        fireEvent.click(retry);
        fireEvent.click(retry);

        expect(mockPlanner.plan).toHaveBeenCalledTimes(2); // the submit and exactly one retry
        expect(mockPlanner.plan).toHaveBeenLastCalledWith(GOAL);

        rerenderWith({ status: "planning" });
        expect(screen.queryByTestId("pipeline-planning-failure")).toBeNull();
        expect(screen.getByTestId("pipeline-planning-progress")).toBeInTheDocument();
        expect(screen.getByTestId("chatbot-submit")).toBeDisabled();
    });

    it("Browse templates opens the template library once and plans nothing", async () => {
        const { rerenderWith, panelProps } = await startInBuild();
        rerenderWith({ status: "failure", outcome: failure("invalid_model_output", "INVALID_MODEL_OUTPUT") });

        fireEvent.click(screen.getByRole("button", { name: "Browse templates" }));

        expect(panelProps.onOpenTemplateLibrary).toHaveBeenCalledTimes(1);
        expect(mockPlanner.plan).toHaveBeenCalledTimes(1);
        expect(panelProps.onApplyPipelineSuggestion).not.toHaveBeenCalled();
    });

    it("without a template-library handler, Browse templates is not offered", async () => {
        const { rerenderWith } = await startInBuild(props({ onOpenTemplateLibrary: undefined }));
        rerenderWith({ status: "failure", outcome: failure("model_unavailable", "MODEL_UNAVAILABLE") });
        expect(screen.queryByRole("button", { name: "Browse templates" })).toBeNull();
        expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });

    it("health unavailable: Build Send and Retry are disabled, Browse templates stays; recovers without remounting", async () => {
        const { rerenderWith } = await startInBuild();
        rerenderWith({ status: "failure", outcome: failure("model_unavailable", "MODEL_UNAVAILABLE") });
        mockedHealth.mockResolvedValue(unavailable);
        fireEvent.click(screen.getByTestId("chatbot-toggle"));
        fireEvent.click(screen.getByTestId("chatbot-toggle")); // reopening refreshes health

        await screen.findByTestId("pipeline-planning-unavailable");
        expect(screen.getByTestId("chatbot-submit")).toBeDisabled();
        expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Browse templates" })).toBeEnabled();
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(mockPlanner.plan).toHaveBeenCalledTimes(1);

        mockedHealth.mockResolvedValue(healthy);
        fireEvent.click(screen.getByRole("button", { name: "Check again" }));

        await waitFor(() => expect(screen.queryByTestId("pipeline-planning-unavailable")).toBeNull());
        expect(screen.getByTestId("chatbot-submit")).toBeEnabled();
        expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    });

    it("health unavailable does not change Ask mode", async () => {
        mockedHealth.mockResolvedValue(unavailable);
        render(<ChatbotPanel {...props()} />);
        fireEvent.click(screen.getByTestId("chatbot-toggle"));
        await waitFor(() => expect(mockedHealth).toHaveBeenCalled());

        fireEvent.change(screen.getByTestId("chatbot-input"), { target: { value: "What changed?" } });
        expect(screen.getByTestId("chatbot-submit")).toBeEnabled();
        expect(screen.queryByTestId("pipeline-planning-unavailable")).toBeNull();
        fireEvent.click(screen.getByTestId("chatbot-submit"));

        await waitFor(() => expect(mockedSendQuery).toHaveBeenCalledTimes(1));
        expect(mockPlanner.plan).not.toHaveBeenCalled();
    });

    it("the health gate never cancels or hides a plan that is already running", async () => {
        const { rerenderWith } = await startInBuild();
        mockedHealth.mockResolvedValue(unavailable);
        rerenderWith({ status: "planning" });
        rerenderWith({ status: "planning" });

        expect(mockPlanner.cancel).not.toHaveBeenCalled();
        expect(screen.getByTestId("pipeline-planning-progress")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    });

    it("closing the panel during planning cancels the plan", async () => {
        const { rerenderWith } = await startInBuild();
        rerenderWith({ status: "planning" });

        fireEvent.click(screen.getByTestId("chatbot-toggle"));

        expect(mockPlanner.cancel).toHaveBeenCalledTimes(1);
    });

    it("switching to Ask during planning cancels the plan", async () => {
        const { rerenderWith } = await startInBuild();
        rerenderWith({ status: "planning" });

        fireEvent.click(screen.getByRole("button", { name: "Ask" }));

        expect(mockPlanner.cancel).toHaveBeenCalledTimes(1);
    });

    it("failure text and the Build goal never enter the Q&A history", async () => {
        const { rerenderWith } = await startInBuild();
        rerenderWith({ status: "failure", outcome: failure("model_unavailable", "MODEL_UNAVAILABLE") });

        fireEvent.click(screen.getByRole("button", { name: "Ask" }));
        fireEvent.change(screen.getByTestId("chatbot-input"), { target: { value: "What does the IR card do?" } });
        fireEvent.click(screen.getByTestId("chatbot-submit"));
        await waitFor(() => expect(mockedSendQuery).toHaveBeenCalledTimes(1));
        expect(JSON.stringify(mockedSendQuery.mock.calls[0][0].messages)).not.toMatch(/reachable|authorization problems/);
    });
});
