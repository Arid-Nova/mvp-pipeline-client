import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ChatbotPanel from "./ChatbotPanel";
import * as api from "../../services/api";

jest.mock("../../services/api");

const mockedGetHealth = api.getChatbotHealth as jest.Mock;
const mockedSendQuery = api.sendChatbotQuery as jest.Mock;

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

    it("renders loading and answer/citations/confidence", async () => {
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
            flags: ["partial"],
            requestId: "req-1",
            processingTimeMs: 20,
            model: "llama3.2",
            provider: "OLLAMA"
        });

        render(<ChatbotPanel activeContext={{ systemName: "TrainTicket", irId: "ir-7", indexId: "idx-2", commitId: "abc123" }} />);
        fireEvent.click(screen.getByTestId("chatbot-toggle"));
        expect(screen.getByTestId("chatbot-active-context")).toHaveTextContent("Active scope:");
        expect(screen.getByTestId("chatbot-active-context")).toHaveTextContent("System: TrainTicket");
        expect(screen.getByTestId("chatbot-active-context")).toHaveTextContent("IR: ir-7");

        fireEvent.change(screen.getByTestId("chatbot-input"), {
            target: { value: "What changed?" }
        });
        fireEvent.click(screen.getByTestId("chatbot-submit"));

        expect(screen.getByText("Sending...")).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByText(/policy changed/i)).toBeInTheDocument();
        });
        expect(screen.getByText(/MEDIUM/)).toBeInTheDocument();
        expect(screen.getByText(/Citations/)).toBeInTheDocument();
        expect(screen.getByText(/OrderController:88/)).toBeInTheDocument();
        expect(mockedSendQuery).toHaveBeenCalledWith(expect.objectContaining({
            context: expect.objectContaining({
                systemName: "TrainTicket",
                irId: "ir-7",
                indexId: "idx-2",
                commitId: "abc123"
            })
        }));
    });

    it("shows explicit no-context state", async () => {
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

        expect(await screen.findByTestId("chatbot-active-context")).toHaveTextContent("No active analysis context.");
    });
});
