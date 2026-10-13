import React, { useMemo } from "react";
import { CardType } from "../pipeline/models";
import { CARD_CONFIG } from "../pipeline/pipelineConfig";
import { APPLY_FAILURE_MESSAGES, ApplyError, ApplyErrorReason, PendingConfiguration, materializeSuggestion } from "../pipeline/planning/pipelineApplier";
import { IntentTier } from "../pipeline/planning/intentPlan";
import { ValidatedSuggestion } from "../pipeline/planning/pipelineValidator";

/**
 * One planned pipeline as the chatbot shows it (Issue #60, P60-M1-008). Built only from a
 * successful planner outcome: the graph is a branded ValidatedSuggestion; tier and chosen analyses
 * are display metadata from candidate assembly and never change the graph.
 */
export interface PipelineSuggestionItem {
    tier: IntentTier;
    suggestion: ValidatedSuggestion;
    /** The analyses chosen for the goal (before AridNova added inputs and prerequisites). */
    chosenAnalyses: readonly CardType[];
}

export const TIER_LABELS: Record<IntentTier, string> = {
    focused: "Focused",
    balanced: "Balanced",
    comprehensive: "Comprehensive",
};

export const CHECKED_RULE_GROUPS = [
    "Known pipeline cards",
    "Allowed connections",
    "Required inputs present",
    "Reachable from a pipeline source",
];

export type PreviewResult = { ok: true; pendingConfiguration: PendingConfiguration[] } | { ok: false; reason: ApplyErrorReason };

/**
 * Dry run of the P60-M1-007 materializer for the configuration preview. Pure: it touches no canvas
 * state and uses throwaway local IDs. A suggestion that would no longer apply is reported stale.
 */
export const previewSuggestion = (suggestion: ValidatedSuggestion): PreviewResult => {
    let next = 0;
    try {
        const { pendingConfiguration } = materializeSuggestion(suggestion, {
            generateId: () => {
                next += 1;
                return `preview-${next}`;
            },
        });
        return { ok: true, pendingConfiguration };
    } catch (error) {
        return { ok: false, reason: error instanceof ApplyError ? error.reason : "invalid" };
    }
};

const cardTitle = (type: string): string => CARD_CONFIG[type as CardType]?.title ?? "Unknown card";
const cardColor = (type: string): string => CARD_CONFIG[type as CardType]?.color ?? "border-slate-600 bg-slate-800/40";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const lowerFirst = (text: string) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);

interface PipelineSuggestionCardProps {
    item: PipelineSuggestionItem;
    /** 1, 2 or 3; used for the select button test ID. */
    position: number;
    /** Whether "Use this pipeline" can be pressed (decided by the list from canvas/run state). */
    canSelect: boolean;
    /** True once this card's pipeline was added to the canvas. */
    applied: boolean;
    onSelect: (item: PipelineSuggestionItem) => void;
}

export const PipelineSuggestionCard: React.FC<PipelineSuggestionCardProps> = ({ item, position, canSelect, applied, onSelect }) => {
    const { suggestion } = item;
    const { spec } = suggestion;
    const preview = useMemo(() => previewSuggestion(suggestion), [suggestion]);
    const stale = !preview.ok;
    const enabled = canSelect && !stale && !applied;

    return (
        <article
            data-testid={`pipeline-suggestion-card-${position}`}
            aria-label={`${TIER_LABELS[item.tier]} option: ${spec.title}`}
            className="rounded-xl border border-white/10 bg-slate-900/60 p-3.5 flex flex-col gap-2.5 text-slate-200"
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/80">{TIER_LABELS[item.tier]}</span>
                <span className="text-[10px] text-slate-400">
                    {plural(spec.nodes.length, "card", "cards")} · {plural(spec.edges.length, "connection", "connections")}
                </span>
            </div>

            <h4 className="text-[13.5px] font-semibold leading-snug break-words">{spec.title}</h4>
            <p className="text-[12px] text-slate-300 leading-relaxed break-words">{spec.summary}</p>

            {spec.rationale && (
                <details className="text-[12px] text-slate-300">
                    <summary className="cursor-pointer text-slate-400 hover:text-slate-200">Why this fits</summary>
                    <p className="mt-1.5 leading-relaxed break-words">{spec.rationale}</p>
                </details>
            )}

            <ol aria-label="Cards in this pipeline" className="flex flex-wrap gap-1.5">
                {spec.nodes.map((node) => (
                    <li key={node.key} className={`text-[10.5px] px-2 py-0.5 rounded-md border ${cardColor(node.cardType)}`}>
                        {cardTitle(node.cardType)}
                    </li>
                ))}
            </ol>

            {preview.ok && preview.pendingConfiguration.length > 0 && (
                <div className="text-[11.5px] text-slate-300">
                    <div className="font-semibold text-slate-400">You'll need to configure:</div>
                    <ul className="mt-1 list-disc pl-4 space-y-0.5">
                        {preview.pendingConfiguration.map((entry) => (
                            <li key={`${entry.cardType}-${entry.kind}`}>
                                {entry.cardTitle}
                                {entry.cardCount > 1 ? ` (${entry.cardCount} cards)` : ""}
                                {entry.kind === "during_run" ? " (during the run)" : ""}: {lowerFirst(entry.hint)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <details className="text-[11.5px] text-slate-300">
                <summary className="cursor-pointer text-emerald-300/90 hover:text-emerald-200">Checked against pipeline rules ✓</summary>
                <div className="mt-1.5 space-y-1.5">
                    <p>
                        Analyses chosen for your goal: {item.chosenAnalyses.map(cardTitle).join(", ")}. AridNova added the
                        input cards and connections they need.
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5">
                        {CHECKED_RULE_GROUPS.map((rule) => (
                            <li key={rule}>{rule} ✓</li>
                        ))}
                    </ul>
                </div>
            </details>

            {!preview.ok && (
                <p data-testid={`pipeline-suggestion-stale-${position}`} className="text-[11.5px] text-amber-300">
                    {APPLY_FAILURE_MESSAGES[preview.reason]}
                </p>
            )}

            {applied ? (
                <div data-testid={`pipeline-suggestion-applied-${position}`} className="text-[12px] font-semibold text-emerald-300">
                    Added to canvas ✓
                </div>
            ) : (
                <button
                    type="button"
                    data-testid={`pipeline-suggestion-select-${position}`}
                    aria-label={`Use this pipeline: ${spec.title}`}
                    disabled={!enabled}
                    onClick={() => onSelect(item)}
                    className="self-start text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                    Use this pipeline
                </button>
            )}
        </article>
    );
};

export default PipelineSuggestionCard;
