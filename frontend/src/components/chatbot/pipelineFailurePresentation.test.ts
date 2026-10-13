import { CARD_CONFIG, CATEGORIES } from "../pipeline/pipelineConfig";
import { CardType } from "../pipeline/models";
import { PlanFailure } from "../pipeline/planning/pipelinePlanner";
import { PLANNING_FAILURE_COPY, capabilityAreas, getPipelineFailurePresentation } from "./pipelineFailurePresentation";

const failure = (reason: string, cause = "X", unsupportedReason?: string) =>
    ({ reason, cause, unsupportedReason } as unknown as Pick<PlanFailure, "reason" | "cause" | "unsupportedReason">);

describe("getPipelineFailurePresentation", () => {
    it.each([
        ["model_unavailable", "MODEL_UNAVAILABLE", "The assistant's model isn't reachable right now.", true, true],
        ["model_unavailable", "NETWORK_ERROR", "The assistant's model isn't reachable right now.", true, true],
        ["model_unavailable", "UNEXPECTED_ERROR", "Something went wrong while preparing pipeline suggestions.", true, true],
        ["timeout", "DEADLINE_EXCEEDED", "That took too long. Local models can be slow — try again or a shorter description.", true, true],
        ["invalid_model_output", "INVALID_MODEL_OUTPUT", "The assistant couldn't produce usable analysis options for that goal.", true, true],
        ["insufficient_valid_candidates", "COMPOSITION_FAILED", "I couldn't find three valid, different pipelines for that goal. Try describing it differently.", true, true],
        ["unsupported_goal", "UNSUPPORTED_GOAL", "AridNova pipelines can:", false, true],
        ["catalog_mismatch", "CATALOG_VERSION_MISMATCH", "The app was updated — please reload the page.", false, false],
        ["request_invalid", "GOAL_TOO_LONG", "Please describe your goal in 1 to 1000 characters.", false, false],
        ["some_future_reason", "WHATEVER", "Something went wrong while preparing pipeline suggestions.", true, true],
    ])("%s (%s) → %s", (reason, cause, message, showRetry, showBrowseTemplates) => {
        expect(getPipelineFailurePresentation(failure(reason, cause))).toMatchObject({ message, showRetry, showBrowseTemplates });
    });

    it("never blames the model for an unexpected internal error", () => {
        const presentation = getPipelineFailurePresentation(failure("model_unavailable", "UNEXPECTED_ERROR"));
        expect(presentation?.message).not.toBe(PLANNING_FAILURE_COPY.modelUnavailable);
        expect(JSON.stringify(presentation)).not.toContain("UNEXPECTED_ERROR");
    });

    it("shows nothing for a cancelled plan", () => {
        expect(getPipelineFailurePresentation(failure("cancelled", "CANCELLED"))).toBeNull();
    });

    it("adds the bounded unsupportedReason and human-readable capability areas for an unsupported goal", () => {
        const presentation = getPipelineFailurePresentation(failure("unsupported_goal", "UNSUPPORTED_GOAL", "AridNova cannot book flights."));
        expect(presentation?.unsupportedReason).toBe("AridNova cannot book flights.");
        expect(presentation?.capabilityAreas?.map((a) => a.name)).toEqual(["Processes", "Execution", "Visualization", "Version Control"]);
        const text = JSON.stringify(presentation);
        (Object.keys(CARD_CONFIG) as CardType[]).forEach((type) => expect(text).not.toMatch(new RegExp(`\\b${type}\\b`)));
        expect(capabilityAreas().find((a) => a.name === "Processes")?.cards).toEqual(
            CATEGORIES.Processes.map((type) => CARD_CONFIG[type].title)
        );
    });

    it("is deterministic", () => {
        const f = failure("timeout", "CALL_TIMEOUT");
        expect(getPipelineFailurePresentation(f)).toEqual(getPipelineFailurePresentation(f));
    });
});
