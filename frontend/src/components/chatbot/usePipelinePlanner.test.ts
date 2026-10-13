import fs from "fs";
import path from "path";
import { act, renderHook, waitFor } from "@testing-library/react";
import { requestPipelineIntents } from "../../services/api";
import { PipelineIntentRequest, PipelineIntentsCallResult } from "../../services/types";
import { validatePipelineSpec } from "../pipeline/planning/pipelineValidator";
import { PlanOutcome } from "../pipeline/planning/pipelinePlanner";
import { usePipelinePlanner } from "./usePipelinePlanner";

jest.mock("../../services/api", () => ({ requestPipelineIntents: jest.fn() }));

const mockRequest = requestPipelineIntents as jest.MockedFunction<typeof requestPipelineIntents>;
const G1 = "I want to visualize the architecture and check authorization problems.";

const fixture = (name: string): Record<string, unknown> =>
    JSON.parse(fs.readFileSync(path.join(__dirname, "../pipeline/planning/__fixtures__", `intent-response.${name}.json`), "utf8"));

const reply = (name: string, request: PipelineIntentRequest): PipelineIntentsCallResult => ({
    kind: "response",
    status: 200,
    data: { ...fixture(name), suggestionSetId: request.suggestionSetId, catalogVersion: request.catalogVersion },
});

/** Each call waits until the test releases it with a fixture name. */
const controllableBackend = () => {
    const pending: { request: PipelineIntentRequest; signal?: AbortSignal; release: (name: string) => void }[] = [];
    mockRequest.mockImplementation(
        (request, options) =>
            new Promise((resolve) => {
                pending.push({ request, signal: options?.signal, release: (name) => resolve(reply(name, request)) });
            })
    );
    return pending;
};

describe("usePipelinePlanner", () => {
    beforeEach(() => mockRequest.mockReset());

    it("starts idle with no suggestions and no failure", () => {
        const { result } = renderHook(() => usePipelinePlanner());

        expect(result.current.state).toEqual({ status: "idle" });
        expect(result.current.isPlanning).toBe(false);
        expect(result.current.suggestions).toBeNull();
    });

    it("plans, then exposes exactly three validated suggestions", async () => {
        const backend = controllableBackend();
        const { result } = renderHook(() => usePipelinePlanner());

        let outcome: Promise<PlanOutcome> | undefined;
        act(() => {
            outcome = result.current.plan(G1);
        });
        expect(result.current.state.status).toBe("planning");
        expect(result.current.isPlanning).toBe(true);
        expect(result.current.suggestions).toBeNull();

        await waitFor(() => expect(backend).toHaveLength(1));
        await act(async () => {
            backend[0].release("valid");
            await outcome;
        });

        expect(result.current.state.status).toBe("success");
        expect(result.current.isPlanning).toBe(false);
        expect(result.current.suggestions).toHaveLength(3);
        result.current.suggestions?.forEach((s) => expect(validatePipelineSpec(JSON.parse(JSON.stringify(s.spec))).valid).toBe(true));
        expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it("retries once through the real chain and succeeds on the complete second plan", async () => {
        mockRequest
            .mockImplementationOnce(async (request) => reply("unknown-capability", request))
            .mockImplementationOnce(async (request) => reply("retry-completion", request));
        const { result } = renderHook(() => usePipelinePlanner());

        await act(async () => {
            await result.current.plan(G1);
        });

        expect(mockRequest.mock.calls.map(([request]) => request.attempt)).toEqual([1, 2]);
        expect(mockRequest.mock.calls[1][0].suggestionSetId).toBe(mockRequest.mock.calls[0][0].suggestionSetId);
        expect(result.current.suggestions).toHaveLength(3);
    });

    it("exposes a typed failure and no partial suggestions", async () => {
        mockRequest.mockImplementation(async (request) => reply("prose", request));
        const { result } = renderHook(() => usePipelinePlanner());

        await act(async () => {
            await result.current.plan(G1);
        });

        expect(result.current.state.status).toBe("failure");
        expect(result.current.state.status === "failure" && result.current.state.outcome.reason).toBe("invalid_model_output");
        expect(result.current.suggestions).toBeNull();
        expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it("cancel aborts the request, returns to idle and ignores the late reply", async () => {
        const backend = controllableBackend();
        const { result } = renderHook(() => usePipelinePlanner());

        let outcome: Promise<PlanOutcome> | undefined;
        act(() => {
            outcome = result.current.plan(G1);
        });
        await waitFor(() => expect(backend).toHaveLength(1));
        act(() => result.current.cancel());

        expect(result.current.state).toEqual({ status: "idle" });
        expect(backend[0].signal?.aborted).toBe(true);
        await act(async () => {
            backend[0].release("valid");
            expect((await outcome)?.status).toBe("failure");
        });
        expect(result.current.state).toEqual({ status: "idle" });
        expect(result.current.suggestions).toBeNull();
        expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it("unmount aborts the active request and never updates state afterwards", async () => {
        const backend = controllableBackend();
        const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);
        const { result, unmount } = renderHook(() => usePipelinePlanner());

        let outcome: Promise<PlanOutcome> | undefined;
        act(() => {
            outcome = result.current.plan(G1);
        });
        await waitFor(() => expect(backend).toHaveLength(1));
        unmount();

        expect(backend[0].signal?.aborted).toBe(true);
        backend[0].release("valid");
        expect((await outcome)?.status === "failure" && (await outcome)?.status).toBe("failure");
        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();
    });

    it("latest plan wins: a superseded plan's late success cannot overwrite the newer result", async () => {
        const backend = controllableBackend();
        const { result } = renderHook(() => usePipelinePlanner());

        let first: Promise<PlanOutcome> | undefined;
        let second: Promise<PlanOutcome> | undefined;
        act(() => {
            first = result.current.plan("Just show me the architecture.");
        });
        await waitFor(() => expect(backend).toHaveLength(1));
        act(() => {
            second = result.current.plan(G1);
        });
        await waitFor(() => expect(backend).toHaveLength(2));
        expect(backend[0].signal?.aborted).toBe(true);
        expect(backend[1].request.suggestionSetId).not.toBe(backend[0].request.suggestionSetId);

        await act(async () => {
            backend[1].release("unsupported");
            await second;
        });
        expect(result.current.state.status === "failure" && result.current.state.outcome.reason).toBe("unsupported_goal");

        await act(async () => {
            backend[0].release("valid");
            const stale = await first;
            expect(stale?.status === "failure" && stale.reason).toBe("cancelled");
        });
        expect(result.current.state.status === "failure" && result.current.state.outcome.reason).toBe("unsupported_goal");
        expect(result.current.suggestions).toBeNull();
    });

    it("a new plan after a success clears the old suggestions while planning", async () => {
        const backend = controllableBackend();
        const { result } = renderHook(() => usePipelinePlanner());

        let outcome: Promise<PlanOutcome> | undefined;
        act(() => {
            outcome = result.current.plan(G1);
        });
        await waitFor(() => expect(backend).toHaveLength(1));
        await act(async () => {
            backend[0].release("valid");
            await outcome;
        });
        const oldIds = result.current.suggestions?.map((s) => s.candidateId);
        expect(oldIds).toHaveLength(3);

        act(() => {
            outcome = result.current.plan(G1);
        });
        expect(result.current.state.status).toBe("planning");
        expect(result.current.suggestions).toBeNull();
        await waitFor(() => expect(backend).toHaveLength(2));
        await act(async () => {
            backend[1].release("retry-completion");
            await outcome;
        });
        expect(result.current.suggestions?.map((s) => s.candidateId)).not.toEqual(oldIds);
    });

    it("a new plan after a failure resets to planning without the old failure", async () => {
        mockRequest.mockImplementationOnce(async (request) => reply("unsupported", request));
        const backend: PipelineIntentRequest[] = [];
        const { result } = renderHook(() => usePipelinePlanner());

        await act(async () => {
            await result.current.plan("Book me a flight.");
        });
        expect(result.current.state.status).toBe("failure");

        mockRequest.mockImplementationOnce(async (request) => {
            backend.push(request);
            return reply("valid", request);
        });
        let outcome: Promise<PlanOutcome> | undefined;
        act(() => {
            outcome = result.current.plan(G1);
        });
        expect(result.current.state).toEqual({ status: "planning" });
        await act(async () => {
            await outcome;
        });
        expect(result.current.state.status).toBe("success");
    });

    it("cancel with nothing running is a no-op", () => {
        const { result } = renderHook(() => usePipelinePlanner());
        act(() => result.current.cancel());
        expect(result.current.state).toEqual({ status: "idle" });
        expect(mockRequest).not.toHaveBeenCalled();
    });
});
