import React from "react";
import { APPLY_FAILURE_MESSAGES, ApplyFailureReason, ApplyResult, PendingConfiguration } from "../pipeline/planning/pipelineApplier";
import { PlanSuccess } from "../pipeline/planning/pipelinePlanner";
import { PipelineSuggestionCard, PipelineSuggestionItem } from "./PipelineSuggestionCard";

/**
 * The three planned pipelines in one chat message (Issue #60, P60-M1-008). Controlled: the set's
 * state lives in the chat message, and transitions go through the pure helpers below.
 *
 * Use is enabled only on an empty canvas with no run in progress (UX only; the page's apply
 * handler re-checks live state). The three options are equal choices: none is recommended,
 * preselected or reordered.
 */
export interface PipelineSuggestionSetState {
    suggestionSetId: string;
    goal: string;
    /** Exactly three, ordered focused, balanced, comprehensive. */
    items: readonly [PipelineSuggestionItem, PipelineSuggestionItem, PipelineSuggestionItem];
    appliedCandidateId?: string;
    dismissed?: boolean;
    /** Last apply failure reported by the page's handler, if any. */
    applyFailure?: ApplyFailureReason;
}

/** invalid and catalog_mismatch mean the set can no longer be applied; the others can recover. */
const LOCKING_FAILURES: readonly ApplyFailureReason[] = ["invalid", "catalog_mismatch"];

export const RUNNING_NOTICE = APPLY_FAILURE_MESSAGES.pipeline_running;
export const EMPTY_CANVAS_NOTICE = APPLY_FAILURE_MESSAGES.canvas_not_empty;

/** Builds the set state from a successful planner outcome; tiers come from candidate assembly. */
export const suggestionSetFromOutcome = (outcome: PlanSuccess, goal: string): PipelineSuggestionSetState => {
    const [a, b, c] = outcome.candidates.map(
        (candidate): PipelineSuggestionItem => ({
            tier: candidate.tier,
            suggestion: candidate.suggestion,
            chosenAnalyses: [...candidate.option.analysisCardTypes],
        })
    );
    return { suggestionSetId: outcome.suggestionSetId, goal, items: [a, b, c] };
};

/** The set after the page answered an apply request. */
export const withApplyResult = (state: PipelineSuggestionSetState, candidateId: string, result: ApplyResult): PipelineSuggestionSetState => {
    if (state.appliedCandidateId) return state; // an applied set stays as it is
    return result.ok ? { ...state, appliedCandidateId: candidateId, applyFailure: undefined } : { ...state, applyFailure: result.reason };
};

/** Clears a recoverable failure once the canvas is usable again. */
export const withoutRecoverableFailure = (state: PipelineSuggestionSetState): PipelineSuggestionSetState =>
    state.applyFailure && !LOCKING_FAILURES.includes(state.applyFailure) ? { ...state, applyFailure: undefined } : state;

export const isSetLocked = (state: PipelineSuggestionSetState): boolean =>
    Boolean(state.appliedCandidateId || state.dismissed || (state.applyFailure && LOCKING_FAILURES.includes(state.applyFailure)));

/** Next-step text for the chat after a successful apply. Uses only the page's returned guidance. */
export const appliedStatusText = (pendingConfiguration: readonly PendingConfiguration[]): string => {
    const lowerFirst = (text: string) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);
    const steps = pendingConfiguration.map((entry) => {
        const cards = entry.cardCount > 1 ? ` (${entry.cardCount} cards)` : "";
        const hint = lowerFirst(entry.hint).replace(/\.$/, "");
        return entry.kind === "before_run"
            ? `Configure ${entry.cardTitle}${cards}: ${hint}.`
            : `During the run, ${entry.cardTitle}${cards}: ${hint}.`;
    });
    return ["Pipeline added.", ...steps, "Then press Run."].join(" ");
};

interface PipelineSuggestionListProps {
    state: PipelineSuggestionSetState;
    canvasIsEmpty: boolean;
    isPipelineRunning: boolean;
    onSelect: (item: PipelineSuggestionItem) => void;
    onDismiss: () => void;
}

export const PipelineSuggestionList: React.FC<PipelineSuggestionListProps> = ({ state, canvasIsEmpty, isPipelineRunning, onSelect, onDismiss }) => {
    if (state.dismissed) {
        return (
            <div data-testid="pipeline-suggestions-dismissed" className="text-[11.5px] text-slate-500 italic px-1 mb-4">
                Pipeline suggestions dismissed.
            </div>
        );
    }

    const locked = isSetLocked(state);
    const notice = locked ? null : isPipelineRunning ? RUNNING_NOTICE : !canvasIsEmpty ? EMPTY_CANVAS_NOTICE : null;
    const failureText = state.applyFailure ? APPLY_FAILURE_MESSAGES[state.applyFailure] : null;
    const canSelect = !locked && canvasIsEmpty && !isPipelineRunning;

    return (
        <section data-testid="pipeline-suggestions" aria-label="Pipeline suggestions" className="w-full mb-6 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2 px-1">
                <p className="text-[12px] text-slate-300 break-words">
                    Three pipeline options for: <span className="text-slate-100">{state.goal}</span>
                </p>
                {!state.appliedCandidateId && (
                    <button
                        type="button"
                        data-testid="pipeline-suggestions-dismiss"
                        onClick={onDismiss}
                        className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-white/5"
                    >
                        Dismiss
                    </button>
                )}
            </div>

            {notice === RUNNING_NOTICE && (
                <p data-testid="pipeline-suggestions-running-notice" role="status" className="text-[11.5px] text-amber-300 px-1">
                    {RUNNING_NOTICE}
                </p>
            )}
            {notice === EMPTY_CANVAS_NOTICE && (
                <p data-testid="pipeline-suggestions-empty-canvas-notice" role="status" className="text-[11.5px] text-amber-300 px-1">
                    {EMPTY_CANVAS_NOTICE}
                </p>
            )}
            {failureText && failureText !== notice && (
                <p data-testid="pipeline-suggestions-apply-error" role="alert" className="text-[11.5px] text-rose-300 px-1">
                    {failureText}
                </p>
            )}

            {state.items.map((item, index) => (
                <PipelineSuggestionCard
                    key={item.suggestion.candidateId}
                    item={item}
                    position={index + 1}
                    canSelect={canSelect}
                    applied={state.appliedCandidateId === item.suggestion.candidateId}
                    onSelect={onSelect}
                />
            ))}
        </section>
    );
};

export default PipelineSuggestionList;
