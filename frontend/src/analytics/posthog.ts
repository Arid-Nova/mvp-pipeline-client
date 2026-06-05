import posthog from 'posthog-js';

/**
 * Central analytics module for the pipeline frontend.
 *
 * This is the single source of truth for PostHog. Components never import
 * `posthog-js` directly — they call the typed helpers below. That keeps event
 * names consistent (all `pipeline:`-prefixed) and lets analytics degrade to a
 * no-op when no project key is configured (dev without a key keeps working).
 *
 * Separation from marketing analytics:
 * We share ONE PostHog project with the marketing site. To keep the two
 * trivially separable, every event carries a registered super property
 * `app: "pipeline"` (marketing registers `app: "marketing"`), and every custom
 * event name is prefixed with `pipeline:`. Dashboards/insights can then filter
 * or break down by the `app` property.
 */

const POSTHOG_KEY = process.env.REACT_APP_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
    process.env.REACT_APP_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

/** Super-property value that distinguishes this app from the marketing site. */
export const APP_NAME = 'pipeline';

/** True once `initAnalytics()` has run with a valid key. Gates every helper. */
let enabled = false;

/**
 * Catalog of every pipeline event name. All values are `pipeline:`-prefixed so
 * they group cleanly and never collide with marketing events in the shared
 * project. `$pageview` is intentionally PostHog's native name (still carries the
 * `app` super property), so it lives outside this catalog.
 */
export const PipelineEvent = {
    CARD_ADDED: 'pipeline:card_added',
    CARD_DELETED: 'pipeline:card_deleted',
    LINK_CREATED: 'pipeline:link_created',
    LINK_DELETED: 'pipeline:link_deleted',
    TEMPLATE_LIBRARY_OPENED: 'pipeline:template_library_opened',
    TEMPLATE_APPLIED: 'pipeline:template_applied',
    PREVIEW_FEATURES_CLICKED: 'pipeline:preview_features_clicked',
    RUN_STARTED: 'pipeline:run_started',
    RUN_COMPLETED: 'pipeline:run_completed',
    RUN_STOPPED: 'pipeline:run_stopped',
    NODE_RUN_STARTED: 'pipeline:node_run_started',
    NODE_RUN_COMPLETED: 'pipeline:node_run_completed',
    SESSION_SAVED: 'pipeline:session_saved',
    SESSION_LOADED: 'pipeline:session_loaded',
    CLEARED: 'pipeline:cleared',
    UNDO: 'pipeline:undo',
    REDO: 'pipeline:redo',
} as const;

export type PipelineEventName =
    (typeof PipelineEvent)[keyof typeof PipelineEvent];

type EventProperties = Record<string, unknown>;

/**
 * Initialize PostHog once, at module load (called from index.tsx — NOT inside a
 * React effect, so StrictMode's double-invoke can't double-init). When no key is
 * configured, leaves analytics disabled and every helper becomes a no-op.
 */
export function initAnalytics(): void {
    if (!POSTHOG_KEY) {
        // No key configured (e.g. local dev). Stay disabled and silent.
        return;
    }

    posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        // SPA: we send pageviews manually on route change (see trackPageview).
        capture_pageview: false,
        // Curated, intentional events only — no broad click autocapture.
        autocapture: false,
        // Config below mirrors the marketing app for cross-app parity: only
        // create person profiles for identified users (pipeline always
        // identifies via the backend session id), and skip pageleave events.
        capture_pageleave: false,
        person_profiles: 'identified_only',
    });

    // Rides on EVERY event (custom + $pageview) so pipeline vs marketing is
    // always separable in the shared project.
    posthog.register({ app: APP_NAME });

    enabled = true;
}

/** Emit a curated pipeline event. No-op when analytics is disabled. */
export function track(
    event: PipelineEventName,
    properties?: EventProperties
): void {
    if (!enabled) return;
    posthog.capture(event, properties);
}

/** Manual SPA pageview. No-op when analytics is disabled. */
export function trackPageview(path: string): void {
    if (!enabled) return;
    posthog.capture('$pageview', {
        $current_url: window.location.href,
        path,
    });
}

/**
 * Attach the backend session id (`active_session_id` from startUserSession) to
 * every event as a super property, so pipeline events join up with backend
 * session/demographics records.
 *
 * We deliberately do NOT call posthog.identify(): this is a no-login app, and
 * the backend session id is session-scoped (sessionStorage), so using it as the
 * distinct_id would make every tab a brand-new "person". Instead we let PostHog
 * keep its own stable, localStorage-persisted anonymous id (so a returning
 * browser stays one person) and carry the session id alongside as a property.
 */
export function setBackendSession(sessionId: string): void {
    if (!enabled || !sessionId) return;
    posthog.register({ backend_session_id: sessionId });
}

/**
 * Clear the backend session property on session end (tab close). We unregister
 * just that property rather than calling posthog.reset(), which would rotate
 * the anonymous id and make the same browser look like a new person next visit.
 */
export function clearBackendSession(): void {
    if (!enabled) return;
    posthog.unregister('backend_session_id');
}
