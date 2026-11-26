export type ApplyErrorReason = 'invalid' | 'catalog_mismatch';

export type ApplyFailureReason = 'canvas_not_empty' | 'pipeline_running' | ApplyErrorReason;

/** Fixed, user-safe messages (P60-M1-009); never internal validator or exception text. */
export const APPLY_FAILURE_MESSAGES: Record<ApplyFailureReason, string> = {
    canvas_not_empty:
        'Pipeline suggestions can be added only to an empty canvas in Milestone 1. Save your current session if needed, then use Clear All in the toolbar.',
    pipeline_running: 'Wait for the current run to finish.',
    invalid: 'This suggestion no longer matches the pipeline rules; please regenerate.',
    catalog_mismatch: 'The app was updated — please reload the page.',
};
