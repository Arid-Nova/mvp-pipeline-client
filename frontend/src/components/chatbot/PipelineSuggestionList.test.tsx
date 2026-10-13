import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { CardType } from "../pipeline/models";
import { ApplyResult } from "../pipeline/planning/pipelineApplier";
import { composePipeline } from "../pipeline/planning/pipelineComposer";
import { IntentTier } from "../pipeline/planning/intentPlan";
import { ValidatedSuggestion, defaultValidationConfig, validatePipelineSpec } from "../pipeline/planning/pipelineValidator";
import { PipelineSuggestionItem } from "./PipelineSuggestionCard";
import {
    EMPTY_CANVAS_NOTICE,
    PipelineSuggestionList,
    PipelineSuggestionSetState,
    RUNNING_NOTICE,
    appliedStatusText,
    withApplyResult,
} from "./PipelineSuggestionList";

const composed = (types: CardType[], title: string): ValidatedSuggestion => {
    const result = composePipeline({ title, analysisCardTypes: types });
    if (!result.ok) throw new Error(`Composition failed: ${result.reason}`);
    return result.suggestion;
};

const G1: [IntentTier, CardType[], string][] = [
    ["focused", ["VISUALIZATION", "FORMAL_VIZ"], "Architecture and policy"],
    ["balanced", ["VISUALIZATION", "FORMAL_VIZ", "VERIFICATION_COMPARISON"], "Plus scenario comparison"],
    ["comprehensive", ["VISUALIZATION", "FORMAL_VIZ", "VERIFICATION_COMPARISON", "AEGIS", "TEST_EXECUTOR"], "Full analysis"],
];

const makeSet = (): PipelineSuggestionSetState => {
    const items = G1.map(([tier, types, title]): PipelineSuggestionItem => ({ tier, suggestion: composed(types, title), chosenAnalyses: types }));
    return { suggestionSetId: "set-1", goal: "Check authorization", items: [items[0], items[1], items[2]] };
};

const OK: ApplyResult = { ok: true, addedNodeIds: ["a"], pendingConfiguration: [] };
const failure = (reason: "canvas_not_empty" | "pipeline_running" | "invalid" | "catalog_mismatch"): ApplyResult => ({ ok: false, reason, message: "x" });

interface HarnessProps {
    initial: PipelineSuggestionSetState;
    apply: (s: ValidatedSuggestion) => ApplyResult;
    canvasIsEmpty?: boolean;
    isPipelineRunning?: boolean;
    onDismiss?: () => void;
}

/** Holds the set's state like ChatbotPanel does, using the same pure transitions. */
const Harness: React.FC<HarnessProps> = ({ initial, apply, canvasIsEmpty = true, isPipelineRunning = false, onDismiss }) => {
    const [state, setState] = useState(initial);
    return (
        <PipelineSuggestionList
            state={state}
            canvasIsEmpty={canvasIsEmpty}
            isPipelineRunning={isPipelineRunning}
            onSelect={(item) => setState((s) => withApplyResult(s, item.suggestion.candidateId, apply(item.suggestion)))}
            onDismiss={() => {
                onDismiss?.();
                setState((s) => ({ ...s, dismissed: true }));
            }}
        />
    );
};

const useButtons = () => [1, 2, 3].map((n) => screen.queryByTestId(`pipeline-suggestion-select-${n}`) as HTMLButtonElement | null);

describe("PipelineSuggestionList", () => {
    it("renders exactly three cards, focused → balanced → comprehensive, with equal and unselected choices", () => {
        render(<Harness initial={makeSet()} apply={() => OK} />);

        expect(screen.getAllByRole("article")).toHaveLength(3);
        expect(screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"))).toEqual([
            "Focused option: Architecture and policy",
            "Balanced option: Plus scenario comparison",
            "Comprehensive option: Full analysis",
        ]);
        expect(screen.queryByText(/recommended|best choice|\bselected\b/i)).toBeNull();
        expect(screen.queryByText(/^(default|best)$/i)).toBeNull();
        const buttons = useButtons();
        expect(new Set(buttons.map((b) => b?.className)).size).toBe(1);
        buttons.forEach((b) => {
            expect(b).toBeEnabled();
            expect(b).not.toHaveAttribute("aria-pressed");
        });
    });

    it("state B: disables all Use buttons on a non-empty canvas and shows the notice once", () => {
        render(<Harness initial={makeSet()} apply={() => OK} canvasIsEmpty={false} />);
        useButtons().forEach((b) => expect(b).toBeDisabled());
        expect(screen.getAllByTestId("pipeline-suggestions-empty-canvas-notice")).toHaveLength(1);
        expect(screen.getByTestId("pipeline-suggestions-empty-canvas-notice")).toHaveTextContent(EMPTY_CANVAS_NOTICE);
        expect(EMPTY_CANVAS_NOTICE).toBe(
            "Pipeline suggestions can be added only to an empty canvas in Milestone 1. Save your current session if needed, then use Clear All in the toolbar."
        );
    });

    it("state C: disables all Use buttons while running, and the running notice wins over the non-empty one", () => {
        const apply = jest.fn(() => OK);
        render(<Harness initial={makeSet()} apply={apply} canvasIsEmpty={false} isPipelineRunning />);
        useButtons().forEach((b) => expect(b).toBeDisabled());
        expect(screen.getByTestId("pipeline-suggestions-running-notice")).toHaveTextContent(RUNNING_NOTICE);
        expect(RUNNING_NOTICE).toBe("Wait for the current run to finish.");
        expect(screen.queryByTestId("pipeline-suggestions-empty-canvas-notice")).toBeNull();
        fireEvent.click(useButtons()[0] as HTMLButtonElement);
        expect(apply).not.toHaveBeenCalled();
    });

    it("B → A: the same suggestions become selectable when the canvas empties, without re-planning", () => {
        const set = makeSet();
        const ids = set.items.map((i) => i.suggestion.candidateId);
        const { rerender } = render(<Harness initial={set} apply={() => OK} canvasIsEmpty={false} />);
        useButtons().forEach((b) => expect(b).toBeDisabled());

        rerender(<Harness initial={set} apply={() => OK} canvasIsEmpty />);

        useButtons().forEach((b) => expect(b).toBeEnabled());
        expect(screen.queryByTestId("pipeline-suggestions-empty-canvas-notice")).toBeNull();
        expect(set.items.map((i) => i.suggestion.candidateId)).toEqual(ids);
        expect(screen.getAllByRole("article")).toHaveLength(3);
    });

    it("running → finished with an empty canvas re-enables the same set", () => {
        const set = makeSet();
        const { rerender } = render(<Harness initial={set} apply={() => OK} isPipelineRunning />);
        rerender(<Harness initial={set} apply={() => OK} />);
        useButtons().forEach((b) => expect(b).toBeEnabled());
    });

    it.each([1, 2, 3])("selecting option %i applies exactly that ValidatedSuggestion once", (position) => {
        const set = makeSet();
        const apply = jest.fn(() => OK);
        render(<Harness initial={set} apply={apply} />);

        fireEvent.click(screen.getByTestId(`pipeline-suggestion-select-${position}`));

        expect(apply).toHaveBeenCalledTimes(1);
        expect(apply.mock.calls[0]).toEqual([set.items[position - 1].suggestion]);
        expect((apply.mock.calls[0] as unknown as [ValidatedSuggestion])[0]).toBe(set.items[position - 1].suggestion);
    });

    it("after a successful apply: Added to canvas on the chosen card and the whole set locks, even if the canvas empties again", () => {
        const set = makeSet();
        const apply = jest.fn(() => OK);
        const { rerender } = render(<Harness initial={set} apply={apply} />);

        fireEvent.click(screen.getByTestId("pipeline-suggestion-select-2"));

        expect(screen.getByTestId("pipeline-suggestion-applied-2")).toHaveTextContent("Added to canvas ✓");
        expect(useButtons()[1]).toBeNull();
        [useButtons()[0], useButtons()[2]].forEach((b) => expect(b).toBeDisabled());
        expect(screen.queryByTestId("pipeline-suggestions-dismiss")).toBeNull();

        // As if the user pressed Undo: the canvas is empty again, but this set stays locked.
        rerender(<Harness initial={set} apply={apply} canvasIsEmpty={false} />);
        rerender(<Harness initial={set} apply={apply} canvasIsEmpty />);
        [useButtons()[0], useButtons()[2]].forEach((b) => expect(b).toBeDisabled());
        expect(screen.queryByTestId("pipeline-suggestions-empty-canvas-notice")).toBeNull();
        expect(apply).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["canvas_not_empty", false],
        ["pipeline_running", false],
        ["invalid", true],
        ["catalog_mismatch", true],
    ] as const)("apply failure %s shows safe guidance (locks the set: %s)", (reason, locks) => {
        const messages = {
            canvas_not_empty: EMPTY_CANVAS_NOTICE,
            pipeline_running: RUNNING_NOTICE,
            invalid: "This suggestion no longer matches the pipeline rules; please regenerate.",
            catalog_mismatch: "The app was updated — please reload the page.",
        };
        const apply = jest.fn(() => failure(reason));
        render(<Harness initial={makeSet()} apply={apply} />);

        fireEvent.click(screen.getByTestId("pipeline-suggestion-select-1"));

        expect(screen.getByTestId("pipeline-suggestions-apply-error")).toHaveTextContent(messages[reason]);
        expect(screen.queryByText(/Added to canvas/)).toBeNull();
        expect(useButtons().map((b) => b?.disabled)).toEqual([locks, locks, locks]);
    });

    it("dismiss hides the set, never applies, and canvas changes do not revive it", () => {
        const apply = jest.fn(() => OK);
        const onDismiss = jest.fn();
        const set = makeSet();
        const { rerender } = render(<Harness initial={set} apply={apply} onDismiss={onDismiss} canvasIsEmpty={false} />);

        fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

        expect(onDismiss).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("pipeline-suggestions-dismissed")).toBeInTheDocument();
        expect(useButtons().every((b) => b === null)).toBe(true);
        rerender(<Harness initial={set} apply={apply} onDismiss={onDismiss} canvasIsEmpty />);
        expect(useButtons().every((b) => b === null)).toBe(true);
        expect(apply).not.toHaveBeenCalled();
    });

    it("renders a stale suggestion (dry run fails) without crashing and keeps the others usable", () => {
        const set = makeSet();
        const stale = validatePipelineSpec(set.items[1].suggestion.spec, { ...defaultValidationConfig(), catalogVersion: "pcat-older" });
        if (!stale.valid) throw new Error("fixture must validate");
        const mixed: PipelineSuggestionSetState = { ...set, items: [set.items[0], { ...set.items[1], suggestion: stale.suggestion }, set.items[2]] };

        render(<Harness initial={mixed} apply={() => OK} />);

        expect(screen.getAllByRole("article")).toHaveLength(3);
        expect(useButtons().map((b) => b?.disabled)).toEqual([false, true, false]);
        expect(screen.getByTestId("pipeline-suggestion-stale-2")).toHaveTextContent("The app was updated — please reload the page.");
    });
});

describe("appliedStatusText", () => {
    it("lists the returned configuration and ends with Run", () => {
        expect(
            appliedStatusText([
                { cardType: "SYSTEM_INPUT", cardTitle: "System Source", kind: "before_run", hint: "Enter a system name and at least one repository.", cardCount: 1 },
            ])
        ).toBe("Pipeline added. Configure System Source: enter a system name and at least one repository. Then press Run.");
        expect(appliedStatusText([])).toBe("Pipeline added. Then press Run.");
        expect(
            appliedStatusText([
                { cardType: "SYSTEM_INPUT", cardTitle: "System Source", kind: "before_run", hint: "Enter a system name and at least one repository.", cardCount: 2 },
                { cardType: "PROMPT_GENERATE", cardTitle: "LLM Prompter", kind: "during_run", hint: "After Scenario Generation runs, select the scenarios.", cardCount: 1 },
            ])
        ).toBe(
            "Pipeline added. Configure System Source (2 cards): enter a system name and at least one repository. During the run, LLM Prompter: after Scenario Generation runs, select the scenarios. Then press Run."
        );
    });
});
