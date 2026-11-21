import fs from "fs";
import path from "path";
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { CardType } from "../pipeline/models";
import { CARD_CONFIG, REQUIRED_USER_CONFIG } from "../pipeline/pipelineConfig";
import { composePipeline } from "../pipeline/planning/pipelineComposer";
import { IntentTier } from "../pipeline/planning/intentPlan";
import { ValidatedSuggestion, defaultValidationConfig, validatePipelineSpec } from "../pipeline/planning/pipelineValidator";
import { CHECKED_RULE_GROUPS, PipelineSuggestionCard, PipelineSuggestionItem, previewSuggestion } from "./PipelineSuggestionCard";

const ALL_CARD_TYPES = Object.keys(CARD_CONFIG) as CardType[];

const composed = (types: CardType[], text: { title?: string; rationale?: string } = {}): ValidatedSuggestion => {
    const result = composePipeline({ title: text.title ?? "Architecture and policy", rationale: text.rationale, analysisCardTypes: types });
    if (!result.ok) throw new Error(`Composition failed: ${result.reason}`);
    return result.suggestion;
};

const item = (tier: IntentTier, suggestion: ValidatedSuggestion, chosen: CardType[] = ["VISUALIZATION"]): PipelineSuggestionItem => ({
    tier,
    suggestion,
    chosenAnalyses: chosen,
});

const renderCard = (props: Partial<React.ComponentProps<typeof PipelineSuggestionCard>> = {}) => {
    const onSelect = jest.fn();
    const utils = render(
        <PipelineSuggestionCard
            item={item("focused", composed(["VISUALIZATION", "FORMAL_VIZ"], { rationale: "Shows the topology and the policy check." }))}
            position={1}
            canSelect
            applied={false}
            onSelect={onSelect}
            {...props}
        />
    );
    return { ...utils, onSelect, card: screen.getByTestId(`pipeline-suggestion-card-${props.position ?? 1}`) };
};

describe("PipelineSuggestionCard", () => {
    it.each([
        ["focused", "Focused"],
        ["balanced", "Balanced"],
        ["comprehensive", "Comprehensive"],
    ] as [IntentTier, string][])("shows the %s tier label", (tier, label) => {
        renderCard({ item: item(tier, composed(["VISUALIZATION"])) });
        expect(screen.getByText(label)).toBeInTheDocument();
    });

    it("shows the title, the generated summary and the rationale disclosure", () => {
        const { card } = renderCard();
        expect(within(card).getByRole("heading", { name: "Architecture and policy" })).toBeInTheDocument();
        expect(within(card).getByText(/^Includes System Visualization and Verification Visualization\./)).toBeInTheDocument();
        const why = within(card).getByText("Why this fits");
        expect(why.tagName).toBe("SUMMARY");
        expect(within(card).getByText("Shows the topology and the policy check.")).toBeInTheDocument();
    });

    it("omits the rationale disclosure when there is no rationale", () => {
        const { card } = renderCard({ item: item("focused", composed(["VISUALIZATION"])) });
        expect(within(card).queryByText("Why this fits")).toBeNull();
    });

    it("lists every card in spec order by its human-readable title, including repeated cards", () => {
        const suggestion = composed(["SECURITY_REGRESSION"]);
        const { card } = renderCard({ item: item("focused", suggestion, ["SECURITY_REGRESSION"]) });
        const chips = within(within(card).getByRole("list", { name: "Cards in this pipeline" })).getAllByRole("listitem");
        expect(chips.map((chip) => chip.textContent)).toEqual(suggestion.spec.nodes.map((n) => CARD_CONFIG[n.cardType as CardType].title));
        expect(chips.filter((chip) => chip.textContent === "Formal Verification")).toHaveLength(2);
    });

    it("never shows raw card-type identifiers", () => {
        const suggestion = composed(["SECURITY_REGRESSION", "TEST_EXECUTOR", "VISUALIZATION"]);
        const { card } = renderCard({ item: item("comprehensive", suggestion, ["SECURITY_REGRESSION", "TEST_EXECUTOR", "VISUALIZATION"]) });
        fireEvent.click(within(card).getByText("Checked against pipeline rules ✓"));
        const visible = card.textContent ?? "";
        ALL_CARD_TYPES.forEach((type) => expect(visible).not.toMatch(new RegExp(`\\b${type}\\b`)));
        expect(visible).toContain("Policy Drift");
    });

    it("shows card and connection counts from the validated spec", () => {
        const suggestion = composed(["VISUALIZATION", "FORMAL_VIZ", "VERIFICATION_COMPARISON"]);
        const { card } = renderCard({ item: item("balanced", suggestion) });
        expect(within(card).getByText(`${suggestion.spec.nodes.length} cards · ${suggestion.spec.edges.length} connections`)).toBeInTheDocument();
    });

    it("previews the configuration the created cards need, without inventing values", () => {
        const { card } = renderCard({ item: item("focused", composed(["CHANGE_IMPACT", "TEST_EXECUTOR"])) });
        expect(within(card).getByText("You'll need to configure:")).toBeInTheDocument();
        expect(within(card).getByText(/^System Source \(2 cards\): enter a system name and at least one repository\.$/)).toBeInTheDocument();
        expect(within(card).getByText(/^Test Executor \(during the run\): generated tests are run/)).toBeInTheDocument();
        expect(card.textContent).not.toMatch(/https:\/\/github|systemName|repoUrl/);
        expect(REQUIRED_USER_CONFIG.SYSTEM_INPUT?.hint).toBe("Enter a system name and at least one repository.");
    });

    it("previews by a pure dry run that never touches canvas state", () => {
        const suggestion = composed(["VISUALIZATION"]);
        const snapshot = JSON.stringify(suggestion);
        const preview = previewSuggestion(suggestion);
        expect(preview).toEqual({ ok: true, pendingConfiguration: [expect.objectContaining({ cardTitle: "System Source" })] });
        expect(JSON.stringify(suggestion)).toBe(snapshot);
    });

    it("shows the checked-rules disclosure with the four rule groups and the chosen analyses", () => {
        const { card } = renderCard({ item: item("focused", composed(["VISUALIZATION", "FORMAL_VIZ"]), ["VISUALIZATION", "FORMAL_VIZ"]) });
        const summary = within(card).getByText("Checked against pipeline rules ✓");
        expect(summary.tagName).toBe("SUMMARY");
        CHECKED_RULE_GROUPS.forEach((rule) => expect(within(card).getByText(`${rule} ✓`)).toBeInTheDocument());
        expect(CHECKED_RULE_GROUPS).toEqual(["Known pipeline cards", "Allowed connections", "Required inputs present", "Reachable from a pipeline source"]);
        expect(within(card).getByText(/Analyses chosen for your goal: System Visualization, Verification Visualization\./)).toBeInTheDocument();
    });

    it("names the Use button after the option and calls onSelect with the exact item", () => {
        const { onSelect } = renderCard();
        const use = screen.getByRole("button", { name: "Use this pipeline: Architecture and policy" });
        expect(use).toHaveAttribute("data-testid", "pipeline-suggestion-select-1");
        fireEvent.click(use);
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(isValidated(onSelect.mock.calls[0][0].suggestion)).toBe(true);
    });

    it("uses real disabled semantics and shows Added to canvas once applied", () => {
        const { rerender, onSelect } = renderCard({ canSelect: false });
        const use = screen.getByTestId("pipeline-suggestion-select-1");
        expect(use).toBeDisabled();
        fireEvent.click(use);
        expect(onSelect).not.toHaveBeenCalled();

        const applied = item("focused", composed(["VISUALIZATION", "FORMAL_VIZ"]));
        rerender(<PipelineSuggestionCard item={applied} position={1} canSelect applied onSelect={onSelect} />);
        expect(screen.getByText("Added to canvas ✓")).toBeInTheDocument();
        expect(screen.queryByTestId("pipeline-suggestion-select-1")).toBeNull();
    });

    it("renders hostile model text as plain text", () => {
        const title = "<script>alert('x')</script>";
        const rationale = '<img src=x onerror="alert(1)"> <b>bold</b>';
        const alert = jest.spyOn(window, "alert").mockImplementation(() => undefined);
        const { card } = renderCard({ item: item("focused", composed(["VISUALIZATION"], { title, rationale })) });

        expect(within(card).getByRole("heading", { name: title })).toBeInTheDocument();
        expect(within(card).getByText(rationale)).toBeInTheDocument();
        // No element was created from the text (it only appears escaped, or inside an attribute value).
        // eslint-disable-next-line testing-library/no-node-access
        expect(card.querySelectorAll("script, img, b")).toHaveLength(0);
        expect(within(card).queryByRole("img")).toBeNull();
        expect(alert).not.toHaveBeenCalled();
        alert.mockRestore();
    });

    it("marks a suggestion that no longer applies as stale and disables Use", () => {
        const stale = validatePipelineSpec(composed(["VISUALIZATION"]).spec, { ...defaultValidationConfig(), catalogVersion: "pcat-older" });
        if (!stale.valid) throw new Error("fixture must validate");
        renderCard({ item: item("focused", stale.suggestion) });
        expect(screen.getByTestId("pipeline-suggestion-stale-1")).toHaveTextContent("The app was updated — please reload the page.");
        expect(screen.getByTestId("pipeline-suggestion-select-1")).toBeDisabled();
    });

    it("contains no dangerouslySetInnerHTML in the suggestion UI", () => {
        ["PipelineSuggestionCard.tsx", "PipelineSuggestionList.tsx", "ChatbotPanel.tsx", "ChatMessage.tsx"].forEach((file) => {
            expect(fs.readFileSync(path.join(__dirname, file), "utf8")).not.toContain("dangerouslySetInnerHTML");
        });
    });
});

function isValidated(value: unknown): boolean {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("../pipeline/planning/pipelineValidator").isValidatedSuggestion(value);
}
