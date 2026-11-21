import { CardType } from "../pipeline/models";
import { ANALYSIS_CATEGORIES, CARD_CONFIG, CATEGORIES } from "../pipeline/pipelineConfig";
import { FAILURE_MESSAGES, PlanFailure } from "../pipeline/planning/pipelinePlanner";

/**
 * What the chatbot shows for a failed pipeline plan (Issue #60, P60-M1-009). Pure and
 * deterministic: fixed, user-safe copy per failure reason, never server, model or exception text
 * (only the planner's bounded, cleaned `unsupportedReason`, rendered as plain text).
 */
export interface CapabilityArea {
    name: string;
    cards: string[];
}

export interface PipelineFailurePresentation {
    message: string;
    showRetry: boolean;
    showBrowseTemplates: boolean;
    /** unsupported_goal only. */
    unsupportedReason?: string;
    /** unsupported_goal only: what AridNova pipelines can do, from the live card configuration. */
    capabilityAreas?: CapabilityArea[];
}

export const PLANNING_FAILURE_COPY = {
    modelUnavailable: "The assistant's model isn't reachable right now.",
    unexpected: "Something went wrong while preparing pipeline suggestions.",
    timeout: "That took too long. Local models can be slow — try again or a shorter description.",
    invalidModelOutput: "The assistant couldn't produce usable analysis options for that goal.",
    insufficientCandidates: "I couldn't find three valid, different pipelines for that goal. Try describing it differently.",
    unsupportedIntro: "AridNova pipelines can:",
    catalogMismatch: "The app was updated — please reload the page.",
};

/** Human-readable analysis areas (category names with their card titles); never CardType IDs. */
export const capabilityAreas = (): CapabilityArea[] =>
    ANALYSIS_CATEGORIES.filter((name) => CATEGORIES[name]?.length).map((name) => ({
        name,
        cards: CATEGORIES[name].map((type: CardType) => CARD_CONFIG[type]?.title).filter((title): title is string => Boolean(title)),
    }));

/** Presentation for a failed plan, or null when nothing should be shown (cancelled). */
export const getPipelineFailurePresentation = (failure: Pick<PlanFailure, "reason" | "cause" | "unsupportedReason">): PipelineFailurePresentation | null => {
    const retryable = (message: string): PipelineFailurePresentation => ({ message, showRetry: true, showBrowseTemplates: true });
    switch (failure.reason) {
        case "cancelled":
            return null;
        case "model_unavailable":
            // The planner reports unexpected internal errors as model_unavailable; don't blame the model.
            return retryable(failure.cause === "UNEXPECTED_ERROR" ? PLANNING_FAILURE_COPY.unexpected : PLANNING_FAILURE_COPY.modelUnavailable);
        case "timeout":
            return retryable(PLANNING_FAILURE_COPY.timeout);
        case "invalid_model_output":
            return retryable(PLANNING_FAILURE_COPY.invalidModelOutput);
        case "insufficient_valid_candidates":
            return retryable(PLANNING_FAILURE_COPY.insufficientCandidates);
        case "unsupported_goal":
            return {
                message: PLANNING_FAILURE_COPY.unsupportedIntro,
                showRetry: false,
                showBrowseTemplates: true,
                unsupportedReason: failure.unsupportedReason,
                capabilityAreas: capabilityAreas(),
            };
        case "catalog_mismatch":
            return { message: PLANNING_FAILURE_COPY.catalogMismatch, showRetry: false, showBrowseTemplates: false };
        case "request_invalid":
            return { message: FAILURE_MESSAGES.request_invalid, showRetry: false, showBrowseTemplates: false };
        default:
            // A reason this UI doesn't know yet: fail closed with generic copy, not "model unreachable".
            return retryable(PLANNING_FAILURE_COPY.unexpected);
    }
};
