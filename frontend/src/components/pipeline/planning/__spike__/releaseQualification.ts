/**
 * P60-M1-011 final live-model release qualification (run through localModelFeasibility.live.test.ts
 * with LIVE_LLM_TASK=release; skipped in the normal suite).
 *
 * Measures the FINISHED planning path, not the model on its own:
 *   real chatbot-backend POST /chatbot/pipeline/intents (llama3.2, intent prompt v2, JSON mode)
 *   → real frontend planner: parseIntentPlan → composer → validator → candidate set, with its one
 *     bounded retry and 150 s operation budget → exactly 3 ValidatedSuggestions or a typed failure.
 * A run counts as a success only if the planner returns three suggestions that independently
 * re-validate. One unmeasured warm-up runs first; then G1–G5 × 5 = 25 measured operations.
 * Demo gate (plan §P60-M1-011): success ≥ 70% and p95 total planning time < 150 s.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { PipelineIntentRequest, PipelineIntentsCallResult } from '../../../../services/types';
import { PLAN_TOTAL_BUDGET_MS, PlanOutcome, planPipelineSuggestions } from '../pipelinePlanner';
import { validatePipelineSpec } from '../pipelineValidator';

export interface ReleaseRun {
    id: string;
    goal: string;
    rep: number;
    status: 'success' | 'failure';
    reason?: string;
    cause?: string;
    requests: number;
    totalMs: number;
    rejectedByCode: Record<string, number>;
    suggestionTitles?: string[];
}

/** POST /chatbot/pipeline/intents over node's http, mapped exactly like services/api does. */
const postIntents = (baseUrl: string) => (body: PipelineIntentRequest, options: { signal: AbortSignal; timeoutMs: number }): Promise<PipelineIntentsCallResult> =>
    new Promise((resolve) => {
        const url = new URL('/chatbot/pipeline/intents', baseUrl);
        const data = JSON.stringify(body);
        const req = http.request(
            { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', timeout: options.timeoutMs,
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
            (res) => {
                let text = '';
                res.on('data', (chunk) => { text += chunk; });
                res.on('end', () => {
                    let json: unknown = null;
                    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
                    const status = res.statusCode ?? 0;
                    if (status === 503) resolve({ kind: 'model_unavailable', status: 503, data: json });
                    else if (status === 400) resolve({ kind: 'request_invalid', status: 400 });
                    else if (status < 200 || status >= 300) resolve({ kind: 'http_error', status });
                    else resolve({ kind: 'response', status, data: json });
                });
            }
        );
        req.on('timeout', () => { req.destroy(); resolve({ kind: 'timeout' }); });
        req.on('error', () => resolve(options.signal.aborted ? { kind: 'cancelled' } : { kind: 'network_error' }));
        options.signal.addEventListener('abort', () => req.destroy(), { once: true });
        req.write(data);
        req.end();
    });

const percentile = (values: number[], p: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
};

const tally = (runs: ReleaseRun[], pick: (run: ReleaseRun) => Record<string, number>) => {
    const totals: Record<string, number> = {};
    runs.forEach((run) => Object.entries(pick(run)).forEach(([code, n]) => { totals[code] = (totals[code] ?? 0) + n; }));
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
};

/** Independent check of a success: three suggestions, each re-validating, with graph-only specs. */
const assertValidSuccess = (outcome: PlanOutcome) => {
    if (outcome.status !== 'success') return;
    if (outcome.suggestions.length !== 3) throw new Error('A success must hold exactly 3 suggestions');
    outcome.suggestions.forEach((suggestion) => {
        const plain = JSON.parse(JSON.stringify(suggestion.spec));
        if (!validatePipelineSpec(plain).valid) throw new Error('A suggestion failed independent validation');
        plain.nodes.forEach((node: Record<string, unknown>) => {
            if (Object.keys(node).sort().join(',') !== 'cardType,key') throw new Error('A spec node carries non-graph fields');
        });
    });
};

export const runReleaseQualification = async (options: {
    baseUrl: string;
    goals: Record<string, string>;
    reps: number;
    resultsDir: string;
    log: (line: string) => void;
}) => {
    const { baseUrl, goals, reps, resultsDir, log } = options;
    const requestIntents = postIntents(baseUrl);

    const plan = async (id: string, goalId: string, rep: number): Promise<ReleaseRun> => {
        let requests = 0;
        const start = Date.now();
        const outcome = await planPipelineSuggestions(
            { goal: goals[goalId] },
            { requestIntents: (body, opts) => { requests += 1; return requestIntents(body, opts); }, reportDeveloperError: (m) => log(`DEV ERROR ${m}`) }
        );
        const totalMs = Date.now() - start;
        assertValidSuccess(outcome);
        const run: ReleaseRun = {
            id, goal: goalId, rep, status: outcome.status, requests, totalMs, rejectedByCode: outcome.rejectedByCode,
            ...(outcome.status === 'success'
                ? { suggestionTitles: outcome.candidates.map((c) => `${c.tier}: [${c.option.analysisCardTypes.join(', ')}]`) }
                : { reason: outcome.reason, cause: outcome.cause }),
        };
        log(`[${id}] ${run.status}${run.reason ? ` ${run.reason}/${run.cause}` : ''} requests=${requests} ${totalMs}ms ` +
            `rejected=${JSON.stringify(run.rejectedByCode)}${run.suggestionTitles ? ` ${run.suggestionTitles.join(' | ')}` : ''}`);
        return run;
    };

    const warmup = await plan('warmup-G2', 'G2', 0);
    const runs: ReleaseRun[] = [];
    for (const goalId of Object.keys(goals)) {
        for (let rep = 1; rep <= reps; rep += 1) {
            // eslint-disable-next-line no-await-in-loop
            runs.push(await plan(`${goalId}-${rep}`, goalId, rep));
        }
    }

    if (runs.length !== Object.keys(goals).length * reps) throw new Error('Not every planned operation ran');
    const successes = runs.filter((r) => r.status === 'success');
    const latencies = runs.map((r) => r.totalMs);
    const summary = {
        endpoint: `${baseUrl}/chatbot/pipeline/intents`,
        warmup: { status: warmup.status, totalMs: warmup.totalMs, requests: warmup.requests },
        operations: runs.length,
        successes: successes.length,
        successRate: successes.length / runs.length,
        perGoal: Object.keys(goals).map((g) => {
            const goalRuns = runs.filter((r) => r.goal === g);
            return { goal: g, successes: goalRuns.filter((r) => r.status === 'success').length, runs: goalRuns.length };
        }),
        firstAttemptSuccesses: runs.filter((r) => r.status === 'success' && r.requests === 1).length,
        retries: runs.filter((r) => r.requests === 2).length,
        meanAttempts: runs.reduce((s, r) => s + r.requests, 0) / runs.length,
        p50Ms: percentile(latencies, 50),
        p95Ms: percentile(latencies, 95),
        maxMs: Math.max(...latencies),
        topRejections: tally(runs, (r) => r.rejectedByCode).slice(0, 10),
        failures: tally(runs.filter((r) => r.status === 'failure'), (r) => ({ [`${r.reason}/${r.cause}`]: 1 })),
        collisions: tally(runs, (r) => r.rejectedByCode).filter(([code]) => code === 'DUPLICATE_CANDIDATE' || code === 'DUPLICATE_ANALYSIS_SET'),
        oversized: tally(runs, (r) => r.rejectedByCode).filter(([code]) => code === 'COMPOSITION_TOO_LARGE'),
        modelUnavailable: runs.filter((r) => r.reason === 'model_unavailable').length,
        timeouts: runs.filter((r) => r.reason === 'timeout').length,
        budgetMs: PLAN_TOTAL_BUDGET_MS,
    };
    const gatePassed = summary.successRate >= 0.7 && summary.p95Ms < 150_000;
    const file = path.join(resultsDir, `p60-m1-011-release-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify({ summary, gatePassed, warmup, runs }, null, 2));
    log(`SUMMARY ${JSON.stringify(summary, null, 2)}`);
    log(`RELEASE GATE (success >= 70% and p95 < 150 s): ${gatePassed ? 'PASS' : 'FAIL'} — results in ${file}`);
    return { summary, gatePassed, runs, warmup };
};
