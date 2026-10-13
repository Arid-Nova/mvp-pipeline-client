import { useCallback, useEffect, useRef, useState } from "react";
import { requestPipelineIntents } from "../../services/api";
import {
    PlanFailure,
    PlanOutcome,
    PlanSuccess,
    PlannerDeps,
    ThreeSuggestions,
    planPipelineSuggestions,
} from "../pipeline/planning/pipelinePlanner";

/**
 * React state around planPipelineSuggestions (Issue #60, P60-M1-006). One plan in flight: a new
 * plan(), cancel() or unmount aborts the previous one, and only the latest operation may update
 * state (latest-operation-wins, independent of whether the network request was really aborted).
 * It never touches canvas state; Build mode (P60-M1-008) wires it into the chatbot.
 */
export type PipelinePlannerState =
    | { status: "idle" }
    | { status: "planning" }
    | { status: "success"; outcome: PlanSuccess }
    | { status: "failure"; outcome: PlanFailure };

export interface PipelinePlanner {
    state: PipelinePlannerState;
    isPlanning: boolean;
    /** Exactly three validated suggestions, or null unless the latest plan succeeded. */
    suggestions: ThreeSuggestions | null;
    /** Starts a new plan, superseding any running one. Resolves with that plan's own outcome. */
    plan: (goal: string) => Promise<PlanOutcome>;
    /** Aborts the running plan (if any) and returns to idle. */
    cancel: () => void;
}

export const usePipelinePlanner = (deps?: Partial<PlannerDeps>): PipelinePlanner => {
    const [state, setState] = useState<PipelinePlannerState>({ status: "idle" });
    const active = useRef<{ id: number; controller: AbortController } | null>(null);
    const nextId = useRef(0);
    const mounted = useRef(false);
    const depsRef = useRef(deps);
    depsRef.current = deps;

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            active.current?.controller.abort();
            active.current = null;
        };
    }, []);

    const plan = useCallback(async (goal: string): Promise<PlanOutcome> => {
        active.current?.controller.abort();
        nextId.current += 1;
        const operation = { id: nextId.current, controller: new AbortController() };
        active.current = operation;
        setState({ status: "planning" });

        const outcome = await planPipelineSuggestions(
            { goal, signal: operation.controller.signal },
            { requestIntents: requestPipelineIntents, ...depsRef.current }
        );

        if (mounted.current && active.current?.id === operation.id) {
            active.current = null;
            setState(outcome.status === "success" ? { status: "success", outcome } : { status: "failure", outcome });
        }
        return outcome;
    }, []);

    const cancel = useCallback(() => {
        const operation = active.current;
        if (!operation) return;
        active.current = null;
        operation.controller.abort();
        setState({ status: "idle" });
    }, []);

    return {
        state,
        isPlanning: state.status === "planning",
        suggestions: state.status === "success" ? state.outcome.suggestions : null,
        plan,
        cancel,
    };
};
