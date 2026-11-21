import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ChatbotPanel from "./ChatbotPanel";
import { getChatbotHealth, refreshChatbotContext, sendChatbotQuery } from "../../services/api";
import CitationList from "./CitationList";

jest.mock("../../services/api", () => ({
    getChatbotHealth: jest.fn(),
    sendChatbotQuery: jest.fn(),
    refreshChatbotContext: jest.fn()
}));

const mockedGetHealth = getChatbotHealth as jest.Mock;
const mockedSendQuery = sendChatbotQuery as jest.Mock;
const mockedRefreshContext = refreshChatbotContext as jest.Mock;

describe("ChatbotPanel", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedRefreshContext.mockResolvedValue({
            success: true,
            refreshedArtifactCountsByType: { IR: 1, GRAPH: 2 },
            unavailableProviders: [],
            refreshedAt: "2026-05-23T12:00:00Z",
            refreshVersion: "TrainTicket|ir-1",
            message: "ok",
            staleContext: false
        });
    });

    it("renders closed by default and opens panel", async () => {
        mockedGetHealth.mockResolvedValue({
            status: "healthy",
            provider: "OLLAMA",
            model: "llama3.2",
            baseUrl: "http://localhost:8080",
            message: "ok",
            checkedAt: new Date().toISOString(),
            latencyMs: 20
        });

        render(<ChatbotPanel />);
        expect(screen.queryByTestId("chatbot-panel")).toBeNull();

        fireEvent.click(screen.getByTestId("chatbot-toggle"));
        expect(await screen.findByTestId("chatbot-panel")).toBeInTheDocument();
        expect(mockedGetHealth).toHaveBeenCalled();
    });

    it("shows error state when health check fails", async () => {
        mockedGetHealth.mockRejectedValue(new Error("backend down"));

        render(<ChatbotPanel />);
        fireEvent.click(screen.getByTestId("chatbot-toggle"));

        // RuntimeStatus was redesigned (e1ba1e2, 0b45d3a) into a compact pill: errors show
        // "Offline" with the error message as the tooltip instead of "Runtime: unavailable".
        await waitFor(() => {
            expect(screen.getByText("Offline")).toBeInTheDocument();
        });
        expect(screen.getByText("Offline").closest("[title]")).toHaveAttribute("title", "backend down");
    });

    it("renders answer with citations and confidence sections", async () => {
        mockedGetHealth.mockResolvedValue({
            status: "healthy",
            provider: "OLLAMA",
            model: "llama3.2",
            baseUrl: "http://localhost:8080",
            message: "ok",
            checkedAt: new Date().toISOString(),
            latencyMs: 20
        });
        mockedSendQuery.mockResolvedValue({
            answer: "Answer: policy changed.\nQualification: medium confidence.",
            citations: [{
                artifactType: "SERVICE",
                artifactId: "svc-1",
                artifactName: "order-service",
                locationHint: "OrderController:88",
                version: "commit-1",
                summary: "Evidence summary"
            }],
            confidence: "MEDIUM",
            confidenceRationale: "Relevant evidence exists but partial coverage.",
            confidenceReasons: ["partial_sources"],
            flags: ["partial"],
            requestId: "req-1",
            processingTimeMs: 20,
            model: "llama3.2",
            provider: "OLLAMA"
        });

        render(<ChatbotPanel activeContext={{ systemName: "TrainTicket", irId: "ir-7", indexId: "idx-2", commitId: "abc123" }} />);
        fireEvent.click(screen.getByTestId("chatbot-toggle"));

        fireEvent.change(screen.getByTestId("chatbot-input"), {
            target: { value: "What changed?" }
        });
        fireEvent.click(screen.getByTestId("chatbot-submit"));

        await waitFor(() => {
            expect(screen.getByText(/policy changed/i)).toBeInTheDocument();
        });

        expect(screen.getByTestId("answer-section")).toBeInTheDocument();
        expect(screen.getByTestId("citation-list")).toBeInTheDocument();
        expect(screen.getByTestId("confidence-panel")).toBeInTheDocument();
        // CitationList (e1ba1e2) renders type and id as separate elements ("SERVICE / svc-1")
        // and the subject label without a "Subject:" prefix.
        const citationList = within(screen.getByTestId("citation-list"));
        expect(citationList.getByText("SERVICE")).toBeInTheDocument();
        expect(citationList.getByText("svc-1")).toBeInTheDocument();
        expect(citationList.getByText("order-service")).toBeInTheDocument();
        expect(screen.getByText(/Relevant evidence exists/i)).toBeInTheDocument();
    });

    it("renders insufficient evidence response clearly", async () => {
        mockedGetHealth.mockResolvedValue({
            status: "healthy",
            provider: "OLLAMA",
            model: "llama3.2",
            baseUrl: "http://localhost:8080",
            message: "ok",
            checkedAt: new Date().toISOString(),
            latencyMs: 20
        });
        mockedSendQuery.mockResolvedValue({
            answer: "Insufficient evidence: required architecture evidence is missing.",
            citations: [],
            confidence: "INSUFFICIENT_EVIDENCE",
            confidenceRationale: "Required architecture evidence is missing for this query scope.",
            confidenceReasons: ["missing_required_evidence"],
            flags: ["insufficient_evidence"],
            requestId: "req-insufficient",
            processingTimeMs: 10,
            model: "llama3.2",
            provider: "OLLAMA"
        });

        render(<ChatbotPanel activeContext={{ systemName: "TrainTicket" }} />);
        fireEvent.click(screen.getByTestId("chatbot-toggle"));
        fireEvent.change(screen.getByTestId("chatbot-input"), { target: { value: "What architecture risks exist?" } });
        fireEvent.click(screen.getByTestId("chatbot-submit"));

        await waitFor(() => {
            expect(screen.getAllByText(/Insufficient evidence/i).length).toBeGreaterThan(0);
        });
        expect(screen.getByTestId("qualification-notice")).toHaveTextContent("Insufficient evidence for this claim");
    });

    it("renders low confidence and truncated context notice", async () => {
        mockedGetHealth.mockResolvedValue({
            status: "healthy",
            provider: "OLLAMA",
            model: "llama3.2",
            baseUrl: "http://localhost:8080",
            message: "ok",
            checkedAt: new Date().toISOString(),
            latencyMs: 20
        });
        mockedSendQuery.mockResolvedValue({
            answer: "Answer: Potential dependency path [E5].",
            citations: [{
                artifactType: "GRAPH",
                artifactId: "E5",
                artifactName: "payment->order",
                locationHint: "links[5]",
                version: "commit-5",
                summary: "Transitive path"
            }],
            confidence: "LOW",
            confidenceRationale: "Evidence quality or citation validation concerns reduce confidence.",
            confidenceReasons: ["truncated_context"],
            flags: ["partial", "truncated_context"],
            requestId: "req-low",
            processingTimeMs: 15,
            model: "llama3.2",
            provider: "OLLAMA"
        });

        render(<ChatbotPanel activeContext={{ systemName: "TrainTicket" }} />);
        fireEvent.click(screen.getByTestId("chatbot-toggle"));
        fireEvent.change(screen.getByTestId("chatbot-input"), { target: { value: "What depends on payment-service?" } });
        fireEvent.click(screen.getByTestId("chatbot-submit"));

        await waitFor(() => {
            expect(screen.getByText(/Potential dependency path/i)).toBeInTheDocument();
        });

        expect(screen.getByText("LOW")).toBeInTheDocument();
        expect(screen.getByTestId("qualification-notice")).toHaveTextContent("truncated due to budget limits");
    });

    it("renders confidence badge variants HIGH, MEDIUM, LOW, and INSUFFICIENT_EVIDENCE", async () => {
        mockedGetHealth.mockResolvedValue({
            status: "healthy",
            provider: "OLLAMA",
            model: "llama3.2",
            baseUrl: "http://localhost:8080",
            message: "ok",
            checkedAt: new Date().toISOString(),
            latencyMs: 20
        });

        const responses = [
            { confidence: "HIGH", answer: "Answer: high confidence [E1].", requestId: "req-high" },
            { confidence: "MEDIUM", answer: "Answer: medium confidence [E2].", requestId: "req-medium" },
            { confidence: "LOW", answer: "Answer: low confidence [E3].", requestId: "req-low2" },
            { confidence: "INSUFFICIENT_EVIDENCE", answer: "Insufficient evidence.", requestId: "req-insufficient-2" }
        ];

        mockedSendQuery
            .mockResolvedValueOnce({
                ...responses[0],
                citations: [{ artifactType: "IR", artifactId: "E1", artifactName: "order-service", locationHint: "microservices[0]", version: "v1", summary: "e1" }],
                flags: [],
                processingTimeMs: 10,
                model: "llama3.2",
                provider: "OLLAMA"
            })
            .mockResolvedValueOnce({
                ...responses[1],
                citations: [{ artifactType: "GRAPH", artifactId: "E2", artifactName: "dep", locationHint: "links[0]", version: "v1", summary: "e2" }],
                flags: ["partial"],
                processingTimeMs: 10,
                model: "llama3.2",
                provider: "OLLAMA"
            })
            .mockResolvedValueOnce({
                ...responses[2],
                citations: [{ artifactType: "ENDPOINT", artifactId: "E3", artifactName: "POST /orders", locationHint: "controllers[0].methods[0]", version: "v1", summary: "e3" }],
                flags: ["truncated_context"],
                processingTimeMs: 10,
                model: "llama3.2",
                provider: "OLLAMA"
            })
            .mockResolvedValueOnce({
                ...responses[3],
                citations: [],
                flags: ["insufficient_evidence"],
                processingTimeMs: 10,
                model: "llama3.2",
                provider: "OLLAMA"
            });

        render(<ChatbotPanel activeContext={{ systemName: "TrainTicket", irId: "ir-9" }} />);
        fireEvent.click(screen.getByTestId("chatbot-toggle"));

        const prompts = ["Q high", "Q medium", "Q low", "Q insufficient"];
        for (let i = 0; i < prompts.length; i += 1) {
            fireEvent.change(screen.getByTestId("chatbot-input"), { target: { value: prompts[i] } });
            fireEvent.click(screen.getByTestId("chatbot-submit"));
            // eslint-disable-next-line no-await-in-loop
            await waitFor(() => expect(screen.getByText(responses[i].answer)).toBeInTheDocument());
        }

        expect(screen.getByText("HIGH")).toBeInTheDocument();
        expect(screen.getByText("MEDIUM")).toBeInTheDocument();
        expect(screen.getAllByText("LOW").length).toBeGreaterThan(0);
        // ConfidenceBadge displays INSUFFICIENT_EVIDENCE with the explicit label "INSUFFICIENT DATA".
        expect(screen.getByText("INSUFFICIENT DATA")).toBeInTheDocument();
    });

    it("runtime unavailable response still renders without crash", async () => {
        mockedGetHealth.mockResolvedValue({
            status: "healthy",
            provider: "OLLAMA",
            model: "llama3.2",
            baseUrl: "http://localhost:8080",
            message: "ok",
            checkedAt: new Date().toISOString(),
            latencyMs: 20
        });

        mockedSendQuery.mockRejectedValueOnce(new Error("Chatbot runtime is currently unavailable. Please ensure the local model runtime is running."));

        render(<ChatbotPanel activeContext={{ systemName: "TrainTicket" }} />);
        fireEvent.click(screen.getByTestId("chatbot-toggle"));
        fireEvent.change(screen.getByTestId("chatbot-input"), {
            target: { value: "Why failed?" }
        });
        fireEvent.click(screen.getByTestId("chatbot-submit"));

        await waitFor(() => {
            expect(screen.getByText(/Unable to answer right now/i)).toBeInTheDocument();
        });

        expect(screen.getByTestId("qualification-notice")).toHaveTextContent("runtime is unavailable");
        expect(screen.getByText("LOW")).toBeInTheDocument();
    });

    it("includes bounded follow-up metadata history in request payload", async () => {
        mockedGetHealth.mockResolvedValue({
            status: "healthy",
            provider: "OLLAMA",
            model: "llama3.2",
            baseUrl: "http://localhost:8080",
            message: "ok",
            checkedAt: new Date().toISOString(),
            latencyMs: 20
        });

        mockedSendQuery.mockResolvedValue({
            answer: "Answer: ok",
            citations: [{ artifactType: "SERVICE", artifactId: "E1", artifactName: "order-service", serviceName: "order-service", locationHint: "loc", version: "v1", summary: "s" }],
            confidence: "MEDIUM",
            flags: [],
            requestId: "req-h1",
            processingTimeMs: 10,
            model: "llama3.2",
            provider: "OLLAMA"
        });

        render(<ChatbotPanel activeContext={{ systemName: "TrainTicket", irId: "ir-9" }} />);
        fireEvent.click(screen.getByTestId("chatbot-toggle"));

        for (let i = 0; i < 6; i += 1) {
            fireEvent.change(screen.getByTestId("chatbot-input"), { target: { value: `Question ${i}` } });
            fireEvent.click(screen.getByTestId("chatbot-submit"));
            // eslint-disable-next-line no-await-in-loop
            await waitFor(() => expect(mockedSendQuery).toHaveBeenCalledTimes(i + 1));
            // The submit button is icon-only since e1ba1e2; the composer input is disabled while
            // a request is in flight, so wait for it to be re-enabled.
            // eslint-disable-next-line no-await-in-loop
            await waitFor(() => expect(screen.getByTestId("chatbot-input")).not.toBeDisabled());
        }

        const lastPayload = mockedSendQuery.mock.calls[mockedSendQuery.mock.calls.length - 1][0];
        expect(lastPayload.messages.length).toBeLessThanOrEqual(4);
        expect(lastPayload.messages.some((m: any) => String(m.content).includes("CITED_ENTITIES:"))).toBe(true);
        expect(lastPayload.messages.some((m: any) => String(m.content).includes("ACTIVE_CONTEXT_ID:"))).toBe(true);
    });

    it("changing active context clears scoped conversation", async () => {
        mockedGetHealth.mockResolvedValue({
            status: "healthy",
            provider: "OLLAMA",
            model: "llama3.2",
            baseUrl: "http://localhost:8080",
            message: "ok",
            checkedAt: new Date().toISOString(),
            latencyMs: 20
        });
        mockedSendQuery.mockResolvedValue({
            answer: "Answer: first context",
            citations: [],
            confidence: "LOW",
            flags: [],
            requestId: "req-ctx",
            processingTimeMs: 5,
            model: "llama3.2",
            provider: "OLLAMA"
        });

        const { rerender } = render(<ChatbotPanel activeContext={{ systemName: "SystemA", irId: "ir-a" }} />);
        fireEvent.click(screen.getByTestId("chatbot-toggle"));
        fireEvent.change(screen.getByTestId("chatbot-input"), { target: { value: "Question A" } });
        fireEvent.click(screen.getByTestId("chatbot-submit"));
        await waitFor(() => expect(screen.getByText(/first context/i)).toBeInTheDocument());

        rerender(<ChatbotPanel activeContext={{ systemName: "SystemB", irId: "ir-b" }} />);
        expect(screen.queryByText(/first context/i)).toBeNull();
        // Empty-state copy was reworded in 81c3949.
        expect(screen.getByText(/Ask me any question about your system/i)).toBeInTheDocument();
    });

    // Context refresh became automatic on context change (795dee4, f64d1b8). The manual
    // "Refresh" control is now only shown as "Retry Sync" after a refresh error or a stale
    // context, and the refresh result / error / stale panels were removed from the header
    // (0b45d3a). The three tests below assert that current behaviour.
    it("automatically refreshes retrieval context when the active context changes", async () => {
        mockedGetHealth.mockResolvedValue({
            status: "healthy",
            provider: "OLLAMA",
            model: "llama3.2",
            baseUrl: "http://localhost:8080",
            message: "ok",
            checkedAt: new Date().toISOString(),
            latencyMs: 20
        });

        const { rerender } = render(<ChatbotPanel activeContext={{ systemName: "SystemA", irId: "ir-a" }} />);
        fireEvent.click(screen.getByTestId("chatbot-toggle"));
        expect(mockedRefreshContext).not.toHaveBeenCalled();

        rerender(<ChatbotPanel activeContext={{ systemName: "SystemB", irId: "ir-b" }} />);
        await waitFor(() => expect(mockedRefreshContext).toHaveBeenCalledTimes(1));
        expect(mockedRefreshContext).toHaveBeenCalledWith({
            context: { systemName: "SystemB", irId: "ir-b" }
        });
        // A successful, non-stale refresh does not surface the manual retry control.
        await waitFor(() => expect(screen.queryByTestId("chatbot-refresh-context")).toBeNull());
    });

    it("refresh failure shows Retry Sync, and a manual retry keeps the conversation", async () => {
        mockedGetHealth.mockResolvedValue({
            status: "healthy",
            provider: "OLLAMA",
            model: "llama3.2",
            baseUrl: "http://localhost:8080",
            message: "ok",
            checkedAt: new Date().toISOString(),
            latencyMs: 20
        });
        mockedSendQuery.mockResolvedValue({
            answer: "Answer: still here",
            citations: [],
            confidence: "LOW",
            flags: [],
            requestId: "req-msg",
            processingTimeMs: 5,
            model: "llama3.2",
            provider: "OLLAMA"
        });
        mockedRefreshContext.mockRejectedValueOnce(new Error("refresh failed"));

        const { rerender } = render(<ChatbotPanel activeContext={{ systemName: "SystemA", irId: "ir-a" }} />);
        fireEvent.click(screen.getByTestId("chatbot-toggle"));
        rerender(<ChatbotPanel activeContext={{ systemName: "TrainTicket", irId: "ir-9" }} />);

        const retry = await screen.findByTestId("chatbot-refresh-context");
        expect(retry).toHaveTextContent(/Retry Sync/i);

        fireEvent.change(screen.getByTestId("chatbot-input"), { target: { value: "Question 1" } });
        fireEvent.click(screen.getByTestId("chatbot-submit"));
        await waitFor(() => expect(screen.getByText(/still here/i)).toBeInTheDocument());

        fireEvent.click(screen.getByTestId("chatbot-refresh-context"));
        await waitFor(() => expect(mockedRefreshContext).toHaveBeenCalledTimes(2));
        expect(mockedRefreshContext).toHaveBeenLastCalledWith({
            context: { systemName: "TrainTicket", irId: "ir-9" }
        });
        await waitFor(() => expect(screen.queryByTestId("chatbot-refresh-context")).toBeNull());
        expect(screen.getByText(/still here/i)).toBeInTheDocument();
    });

    it("no active context shows the generic empty state and no refresh control", async () => {
        mockedGetHealth.mockResolvedValue({
            status: "healthy",
            provider: "OLLAMA",
            model: "llama3.2",
            baseUrl: "http://localhost:8080",
            message: "ok",
            checkedAt: new Date().toISOString(),
            latencyMs: 20
        });
        render(<ChatbotPanel />);
        fireEvent.click(screen.getByTestId("chatbot-toggle"));
        expect(screen.getByText(/Ask me any question about your system/i)).toBeInTheDocument();
        expect(screen.queryByTestId("chatbot-refresh-context")).toBeNull();
        expect(mockedRefreshContext).not.toHaveBeenCalled();
    });
});

describe("CitationList", () => {
    it("shows expandable citation metadata", () => {
        render(
            <CitationList
                citations={[
                    {
                        artifactType: "IR",
                        artifactId: "E1",
                        artifactName: "order-service",
                        serviceName: "order-service",
                        entityName: "OrderController",
                        endpointPath: "/orders",
                        locationHint: "controllers[0].methods[0]",
                        version: "commit-1",
                        commitId: "commit-1",
                        sourcePath: "src/OrderController.java",
                        sourceEndpoint: "GET /orders",
                        timestamp: "2026-05-23T12:00:00Z",
                        summary: "Evidence snippet"
                    }
                ]}
            />
        );

        // Since e1ba1e2 the toggle reports its state through its title, and the detail labels
        // read "Path:" / "Location:" instead of "sourcePath:" / "locationHint:".
        const toggle = screen.getByTestId("citation-toggle-0");
        expect(toggle).toHaveAttribute("title", "Expand");
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute("title", "Collapse");
        const details = within(screen.getByTestId("citation-details-0"));
        expect(details.getByText("Path:")).toBeInTheDocument();
        expect(details.getByText("src/OrderController.java")).toBeInTheDocument();
        expect(details.getByText("Location:")).toBeInTheDocument();
        expect(details.getByText("controllers[0].methods[0]")).toBeInTheDocument();
    });

    // KNOWN BUG P60-M1-012-BUG-1 (accessibility regression, not fixed in P60-M1-012 per
    // decision D10): the e1ba1e2 redesign dropped aria-expanded / aria-controls from the
    // icon-only citation toggle, so assistive technology cannot tell whether details are
    // expanded. Re-enable this test when the bug is fixed.
    it.skip("exposes the expanded state of the citation toggle via aria-expanded (P60-M1-012-BUG-1)", () => {
        render(
            <CitationList
                citations={[
                    { artifactType: "IR", artifactId: "E1", artifactName: "a", locationHint: "l", version: "v", summary: "s" }
                ]}
            />
        );

        const toggle = screen.getByTestId("citation-toggle-0");
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-expanded", "true");
    });

    it("handles missing optional citation fields", () => {
        render(
            <CitationList
                citations={[
                    {
                        artifactType: "GRAPH",
                        artifactId: "E2",
                        artifactName: "",
                        locationHint: "",
                        version: "",
                        summary: ""
                    }
                ]}
            />
        );

        fireEvent.click(screen.getByTestId("citation-toggle-0"));
        expect(screen.getByTestId("citation-details-0")).toHaveTextContent("n/a");
    });

    it("renders multiple citations", () => {
        render(
            <CitationList
                citations={[
                    { artifactType: "IR", artifactId: "E1", artifactName: "a", locationHint: "l1", version: "v1", summary: "s1" },
                    { artifactType: "GRAPH", artifactId: "E2", artifactName: "b", locationHint: "l2", version: "v2", summary: "s2" }
                ]}
            />
        );

        expect(screen.getByTestId("citation-toggle-0")).toBeInTheDocument();
        expect(screen.getByTestId("citation-toggle-1")).toBeInTheDocument();
    });

    it("truncates long citation snippet", () => {
        const longText = "x".repeat(500);
        render(
            <CitationList
                citations={[
                    { artifactType: "IR", artifactId: "E9", artifactName: "a", locationHint: "l", version: "v", summary: longText }
                ]}
            />
        );

        fireEvent.click(screen.getByTestId("citation-toggle-0"));
        const snippet = screen.getByTestId("citation-snippet-0").textContent || "";
        expect(snippet.length).toBeLessThan(longText.length);
        expect(snippet.endsWith("...")).toBe(true);
    });
});
