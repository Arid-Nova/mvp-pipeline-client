import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ChatbotPanel, { CitationList } from "./ChatbotPanel";
import { getChatbotHealth, sendChatbotQuery } from "../../services/api";

jest.mock("../../services/api", () => ({
    getChatbotHealth: jest.fn(),
    sendChatbotQuery: jest.fn()
}));

const mockedGetHealth = getChatbotHealth as jest.Mock;
const mockedSendQuery = sendChatbotQuery as jest.Mock;

describe("ChatbotPanel", () => {
    beforeEach(() => {
        jest.clearAllMocks();
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

        await waitFor(() => {
            expect(screen.getByText(/Runtime: unavailable/i)).toBeInTheDocument();
        });
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
        expect(screen.getByText(/SERVICE · svc-1/)).toBeInTheDocument();
        expect(screen.getByText(/Subject: order-service/)).toBeInTheDocument();
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

        const toggle = screen.getByTestId("citation-toggle-0");
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByTestId("citation-details-0")).toBeInTheDocument();
        expect(screen.getByText(/sourcePath:/i)).toBeInTheDocument();
        expect(screen.getByText(/locationHint:/i)).toBeInTheDocument();
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
