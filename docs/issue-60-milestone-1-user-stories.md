# Issue #60 — Milestone 1 User Stories

**Issue:** #60 "Can produce or edit a pipeline automatically using the chatbot"
**Milestone:** 1 — Chatbot-assisted creation of a new analysis pipeline
**Story prefix:** `P60-M1-xxx`
**Baseline inspected:** branch `60-can-produce-or-edit-a-pipeline-automatically-using-the-chatbot` @ `3aee1b0`
**Revision:** 6 (product decisions frozen before implementation; see §0 and §11)

---

## 0. Product Decisions Frozen for Milestone 1

These decisions are settled. Implementation shouldn't reopen them; changing one needs a new planning revision, normally for Milestone 2+. Details live in the sections cited.

| # | Decision | Status | Milestone 1 rule |
|---|---|---|---|
| D1 | Empty-canvas-only application | **Frozen** | Generating and inspecting suggestions is allowed on any canvas; **Use this pipeline** works only on an empty canvas, re-checked immediately before any change. The chatbot never clears, replaces, deletes, rewires, patches, or adds next to existing work; the user clears with the existing **Clear All**. Non-empty-canvas behaviour is Milestone 2+ (§3, P60-M1-007/008) |
| D2 | Explicit Build mode | **Frozen** | "Ask" (Q&A) and "Build a pipeline" are separate modes. Q&A messages never change the canvas. The canvas changes only after Build mode → 3 validated suggestions shown → the user clicks **Use this pipeline** (P60-M1-008) |
| D3 | Exactly three suggestions | **Frozen** | Exactly 3 selectable suggestions, all structurally valid and meaningfully distinct (different analysis-card sets, not just different text). Never show invalid, partly validated, or raw LLM options, or 1–2 suggestions as a degraded success. Fewer than 3 after the bounded retry → the typed failure (P60-M1-004/006/009) |
| D4 | Explicit user selection | **Frozen** | The user chooses 1, 2, or 3. No auto-apply and no preselection based on model confidence, tier ("Balanced"), past behaviour, size, or ranking. Tier labels are informational only (P60-M1-004/008) |
| D5 | Auto-run | **Out of scope** | Apply only builds the graph and shows configuration guidance. The user presses the **existing Run**. The chatbot never runs, triggers Run, or executes cards; "Use this pipeline" ≠ "Use and Run" (§10) |
| D6 | Model-supplied runtime config | **Out of scope** | `PipelineSpec` v1 has graph structure and explanatory text only. The model can't supply repositories, system name, IR uploads, target URLs, execution model, tokens or credentials, card data, IDs, or coordinates; the parser strips such fields. The UI tells the user what still needs configuring (P60-M1-002, §10) |
| D7 | Validation authority | **Frozen** | LLM output is advisory and untrusted. Deterministic code is authoritative for card types, connections, required inputs, reachability, structural limits, duplicate edges, candidate identity, deduplication and diversity, and apply-time re-validation. Prompting is never sufficient validation (§4, P60-M1-003) |
| D8 | Execution guarantee | **Frozen** | Guaranteed: structural validity, deterministic conversion to the canvas, compatibility with the existing execution path. Not guaranteed: every analysis completing, runtime dependencies being available, user configuration being correct, downstream services succeeding (§4, §7 criterion 6) |
| D9 | Telemetry and preference learning | **Non-blocking / out of scope** | Lightweight selection telemetry (P60-M1-010, P1) is desirable but **not** required for Milestone 1 completion. Preference learning, model-weight updates, and personalized ranking are not part of Milestone 1 |
| D10 | Stale chatbot tests (P60-M1-012) | **Frozen policy** | Per failing test: compare it with the *currently intended* UI. If the change was intentional, update or remove the test. If the UI is actually broken, log a separate product bug and don't change production behaviour in this story. Record each disposition in the PR. Old tests aren't product requirements just because they exist |
| R1 | Reference and demo local model | **Risk-gated** | Decided by P60-M1-014 (outcome A/B/C/D), starting from the configured default (`llama3.2` on Ollama). This is a runtime choice and doesn't change product scope. After P60-M1-014, the team records the reference model |
| R2 | E2E test strategy | **Risk-gated** | Decided by P60-M1-013 (Outcome A/B). **No production refactor of `PipelinePage` is authorized solely for testing until P60-M1-013 shows it's necessary and the team explicitly approves it** |
| R3 | llama.cpp JSON or grammar support | **Non-blocking** | The local-LLM abstraction stays compatible with all adapters. The reference provider may be Ollama. Without JSON mode, llama.cpp uses tolerant extraction (P60-M1-005). Not a Milestone 1 blocker, unless the team explicitly chooses llama.cpp as the reference runtime |

**Implementation-tunable parameters (not product decisions).** Developers may tune these from repository or runtime evidence without reopening scope, as long as defaults are safe, important limits are covered by tests, and values are documented where they're defined:

- layout: `ROW_GAP`, x/y spacing;
- graph size: `SIZE_LIMIT` (node and edge caps);
- inputs: per-card `maxIncoming`;
- LLM: prompt token budget, `temperature`, context window (`num_ctx`), number of prompt examples;
- planning time: per-call timeout, `PLAN_TOTAL_BUDGET_MS`, retry timing.

Escalate to a product decision only if a change alters user-visible behaviour or milestone scope (for example, showing fewer than 3 suggestions or allowing larger pipelines than a user could reasonably review).

---

## 1. Milestone Objective

A user who doesn't know AridNova's card vocabulary describes an analysis goal in plain language, for example "I want to visualize the architecture and check authorization problems", in the existing AI Assistant panel on the Pipeline page. The assistant returns exactly three structurally valid and clearly different pipeline suggestions. Each suggestion has a title, a short explanation, the cards it uses, and why it fits. The user picks one, and its cards and connections are applied to the empty pipeline canvas without being dragged or linked by hand. This is a "new pipeline" as defined by the Milestone 1 empty-canvas policy (§3).

The milestone leaves everything after that alone. The user still configures repositories, presses **Run**, and watches results through the current `runPipeline` / `processNextNodes` mechanism in `PipelinePage.tsx`. The language model only *proposes* pipelines. Deterministic TypeScript code checks every proposal against the real `VALID_CONNECTIONS` and card rules before it can be shown, and creates canvas state from validated data only.

The planner guarantees that the applied graph is **structurally valid**. It also guarantees the graph is **operationally runnable**: once the user supplies the required configuration and the AridNova services it uses are available, it enters the existing Run path just like a hand-built pipeline. It does **not** guarantee that every analysis in every generated pipeline completes successfully in every environment (see "Validity, runnability, and execution" in §4).

## 2. Demo Scenario

**User**, with an empty canvas on `/pipeline`, the AI Assistant open, and "Build a pipeline" mode selected:

> "I want to visualize the architecture and check authorization problems."

**System:**

1. Calls the new planning endpoint on `chatbot-backend` (`POST /chatbot/pipeline/plan`, port 8081). That endpoint prompts the configured local LLM (Ollama `llama3.2` by default) with a capability catalog built from the frontend's pipeline config.
2. Parses the model output, then validates every candidate in the browser against `CardType`, `VALID_CONNECTIONS`, and the new explicit card input requirements. It drops invalid or near-duplicate candidates and retries once, with feedback, if fewer than three distinct valid ones are left.
3. Shows three suggestion cards. The examples below are illustrative: each chain was checked by hand against `VALID_CONNECTIONS` at `3aee1b0`, but real output depends on the model.

| Tier | Example cards (titles from `CARD_CONFIG`) | Edges, all legal in `VALID_CONNECTIONS` |
|---|---|---|
| Focused | System Source → Generate Snapshot → IR Card → System Visualization; IR Card → Formal Verification → Verification Visualization | `SYSTEM_INPUT→MULTI_REPO→IR_HOLDER→VISUALIZATION`, `IR_HOLDER→FORMAL_VERIFY→FORMAL_VIZ` |
| Balanced | Focused, plus Get Components → Component Card → Scenario Generation, with Formal Verification and Scenario Generation feeding Quick Compare | `+ SYSTEM_INPUT→COMPONENT_GENERATE→COMPONENT_HOLDER→SCENARIO_GENERATE`, `FORMAL_VERIFY→SCENARIO_GENERATE`, `FORMAL_VERIFY→VERIFICATION_COMPARISON`, `SCENARIO_GENERATE→VERIFICATION_COMPARISON` |
| Comprehensive | Balanced, plus Aegis and LLM Prompter → Test Suite Generation → Test Executor | `+ IR_HOLDER→AEGIS`, `SCENARIO_GENERATE→PROMPT_GENERATE→TEST_GENERATE→TEST_EXECUTOR` |

4. The user clicks **Use this pipeline** on "Balanced". The cards appear in a left-to-right layered layout, joined by connections. The chat then says: "Next: add your repository in *System Source*, then press Run."
5. The user fills in System Source and presses the existing **Run** button. The generated pipeline enters and uses the same execution path as a hand-built pipeline. The demo uses a known-good repository and running services, so it gets further; that shows this environment working, not a guarantee for every pipeline.

## 3. Scope

### In Scope

- An explicit "Build a pipeline" action in the existing `ChatbotPanel`, separate from Q&A.
- A machine-readable pipeline capability catalog derived from `pipelineConfig.tsx`, with no duplicated hand-written card knowledge in prompts.
- Making implicit runtime requirements explicit as config. Today they exist only inside `runPipeline` / `processNextNodes`: multi-input dependencies, and the configuration each card needs before it can run.
  - **Validation vs execution:** planner validation checks only structural correctness. User and runtime prerequisites remain execution concerns: repository configuration, an uploaded IR, choices made during a run, and the availability of the analysis services and models. A generated pipeline may need configuration before **Run**. A run that stops because a runtime prerequisite is missing is **not** automatically a planner-validation failure. `REQUIRED_USER_CONFIG` and `RUNTIME_INTERACTION_HINTS` are guidance only.
- `PipelineSpec` v1: a JSON contract for one candidate pipeline, covering nodes, edges, and descriptive text, with **no** positions, IDs, or config values.
- A deterministic validator, plus candidate deduplication, diversity checks, deterministic candidate IDs, and enforcement of exactly three candidates.
- A new planning endpoint in `chatbot-backend` that builds the prompt, calls the LLM, and extracts and parses JSON.
- Suggestion rendering, explicit selection, and cancel or dismiss.
- A deterministic layout, plus an atomic applier that applies the selected suggestion to the empty pipeline canvas (see "Milestone 1 empty-canvas policy" below).
- Safe failure for every error path, with canvas state left unchanged.
- Lightweight, non-blocking PostHog events through the existing `track()`.
- Restoring the existing chatbot test suites to green, because they are currently failing (see P60-M1-012).
- Two timeboxed risk-reduction spikes that run before the main build: PipelinePage testability (P60-M1-013) and local-model feasibility (P60-M1-014). They produce decisions and measurements, not product features.
- Unit, component, backend, and integration tests.

### Milestone 1 empty-canvas policy (approved)

**Status: approved and frozen for Milestone 1** (Revision 4). It isn't an open question; changing it belongs to Milestone 2 planning.

**Definition.** For Milestone 1, a **new pipeline** means *"a validated pipeline graph applied to a currently empty AridNova pipeline canvas."* It does **not** mean:

- a second independent pipeline on the same canvas;
- appending another graph;
- merging nodes;
- modifying or replacing existing nodes;
- automatically clearing the previous pipeline.

**Policy (the empty-canvas-only apply policy).** Users may generate and inspect suggestions whatever the canvas holds. The selected suggestion can only be applied to the empty pipeline canvas, and the applier checks this again at apply time. The chatbot **never** automatically clears the canvas, deletes nodes, replaces the current pipeline, merges a generated graph with an existing one, or adds a graph next to the current one. It also never opens the **Clear All** confirmation or saves the session by itself. Saving (session controls) and clearing (the toolbar's **Clear All**, which goes through `clearPipeline` and its `window.confirm`) stay actions the user takes.

**Rationale (repository evidence):**

1. `runPipeline` (`PipelinePage.tsx:1039`) runs *every* `SYSTEM_INPUT`/`UPLOAD_IR` node on the canvas (`:1072`). Two graphs that look separate are not separate pipelines when run.
2. `chatbotContext` (`:672`) takes the *first* node of each relevant type, so a second generated graph could change or confuse the chatbot context.
3. The canvas has no pipeline boundary or pipeline identity. `NodeData` and `Connection` (`models.tsx`) form one flat graph.
4. Adding a generated graph next to an existing one is therefore not just "create". It brings in execution, context, ownership, undo, conflict, and layout questions equivalent to pipeline editing.
5. The undo history (`:107`) isn't synced on restore or session load (see P60-M1-007), and Milestone 1 shouldn't compound that.
6. Milestone 1 only needs to show: natural language → 3 validated suggestions → explicit selection → a new pipeline created safely.

**States:**

| State | Condition (evaluated live) | Behaviour |
|---|---|---|
| **A. Empty canvas** | `nodes.length === 0` and `!isRunning` | Generate allowed; exactly three validated suggestions shown; **Use this pipeline** enabled. Selecting triggers deterministic re-validation and application (P60-M1-007); nodes and connections are created atomically; the existing **Run** remains how execution happens. |
| **B. Non-empty canvas** | `nodes.length > 0` | Generate still allowed, and suggestions stay inspectable. **Use this pipeline** is disabled, with the guidance: *"Pipeline suggestions can be added only to an empty canvas in Milestone 1. Save your current session if needed, then use **Clear All** in the toolbar."* Nothing is opened, saved, cleared, or altered automatically. When `nodes.length` later becomes 0, the same suggestions become selectable again without regenerating. Each is still re-validated immediately before application. |
| **C. Pipeline running** | `isRunning === true` (rare with an empty canvas: **Clear All** is disabled during a run, but card delete buttons are not) | Application disabled, with the explanation *"Wait for the current run to finish."* No state changes. |
| **D. Canvas changed between generation and selection** | Any | The apply handler **never trusts** the UI's earlier `canvasIsEmpty` value. At apply time it re-checks `nodes.length === 0`, `!isRunning`, matching `catalogVersion`, and that `validatePipelineSpec` still passes. Any failure returns a typed reason (`canvas_not_empty`, `pipeline_running`, `catalog_mismatch`, `invalid`) and leaves nodes, connections, `history`, `historyIndex`, and the rest of the canvas unchanged. |

Editing, merging, patching, extending, or adding next to an existing pipeline are **Milestone 2+** capabilities (§10).

### Out of Scope

- Applying a suggestion to a non-empty canvas in any form: modifying, patching, deleting, replacing, merging with, or adding next to existing pipeline nodes and edges. Automatically clearing or saving on the user's behalf is also out. All of this is Milestone 2+ (§10).
- Keeping a layout stable across modifications.
- Running the pipeline automatically after selection, or running it from chat.
- Having the model fill in card config values, such as repository URLs, system names, LLM choice, or target URLs.
- Deterministic auto-repair of invalid candidates.
- Preference learning, personalized ranking, preference-weight updates, model fine-tuning, or SLM fine-tuning.
- Long-term personalization, memory across sessions, or sophisticated analytics such as dashboards or funnels.
- Adding CI. There are no `.github/workflows` today; "tests pass" means the local commands in §7.
- The editing half of Issue #60 (Milestone 2+).

## 4. Architectural Approach

```
 ChatbotPanel ("Build a pipeline" mode)
        │  goal text
        ▼
 usePipelinePlanner (frontend) ── builds catalog from pipelineConfig.tsx ──┐
        │  POST /chatbot/pipeline/plan {goal, catalog, catalogVersion,     │
        │                               suggestionSetId, attempt, ...}     │
        ▼                                                                  │
 chatbot-backend: PipelinePlanService                                      │
   prompt built ONLY from request.catalog → LocalLlmClient (JSON mode)     │
   → JSON extraction + shape check (no semantics)                          │
        │  raw candidates  (UNTRUSTED)                                     │
        ▼                                                                  │
 Frontend gate (pure, deterministic):                                      │
   parsePipelineSpec ── strips unknown fields (positions, ids, config)     │
   validatePipelineSpec ◄── CARD_CONFIG keys / VALID_CONNECTIONS /  ◄──────┘
        │                    CARD_INPUT_REQUIREMENTS / CATEGORIES
        ▼
   assembleCandidateSet: dedupe → diversity → exactly 3 → candidateId + tier
        │   (<3 → ONE retry with exclusions + rejection codes; still <3 → typed failure)
        ▼
 PipelineSuggestionList: 3 ValidatedSuggestions (Select / Dismiss)
        │  user clicks Select (canvas must be empty)
        ▼
 applyPipelineSuggestion (PipelinePage):
   assert empty canvas & !isRunning → re-validate → layout → materialize (pure)
   → setNodes + setConnections + history push in ONE synchronous handler
        ▼
 Existing canvas → existing Run → runPipeline / processNextNodes
```

**Trust boundary.** Everything the LLM produces is untrusted until the frontend validator accepts it. That includes the backend's parsed output, because the backend only checks the JSON shape.

- `parsePipelineSpec` copies only whitelisted fields. The model can't supply node IDs, coordinates, `status`, `logs`, or `NodeData.data`.
- The UI renders only the branded `ValidatedSuggestion` type, which only the validator module can build.
- The applier re-validates against the live config, then builds all new state in a pure function before calling any React setter.

**Validated deterministically in code, not by prompting:**

| Concern | Where |
|---|---|
| Malformed candidate structure | `parsePipelineSpec` (P60-M1-002) and backend extractor (P60-M1-005) |
| Known card types | `UNKNOWN_CARD_TYPE` (P60-M1-003) |
| Valid connections | `ILLEGAL_CONNECTION` against `VALID_CONNECTIONS` (P60-M1-003) |
| Required predecessors and inputs | `MISSING_UPSTREAM`, `UNREACHABLE_NODE`, `INPUT_REQUIREMENT_UNMET` (P60-M1-001, P60-M1-003) |
| Duplicate edges | `DUPLICATE_EDGE`, `SELF_LOOP` (P60-M1-003) |
| Duplicate or near-identical suggestions | Canonical signature plus analysis-card-set distinctness (P60-M1-004) |
| Required node configuration | The model can't set config (parser strips it). The configuration each new card still needs comes from `REQUIRED_USER_CONFIG` and is shown to the user as guidance. The **existing** Run-time checks enforce it (P60-M1-001, P60-M1-007) |
| Exactly three usable candidates | `assembleCandidateSet` (P60-M1-004) |
| Can't produce three | Typed `insufficient_valid_candidates` failure; nothing selectable is shown (P60-M1-006, P60-M1-009) |

**Validity, runnability, and execution.** These three terms are used precisely throughout this document:

| Term | Meaning | Guaranteed by Milestone 1? |
|---|---|---|
| **Structurally valid** | Passes the deterministic card, connection, input-requirement, and graph rules (`validatePipelineSpec`), turns into canvas nodes and connections deterministically, and is applied without corrupting canvas state | **Yes.** This is the planner's main correctness guarantee |
| **Operationally runnable** | Once the required user configuration and runtime prerequisites are in place, it enters the existing Run → `runPipeline` → `processNextNodes` path exactly like a hand-built pipeline, with no planner-specific execution code | **Yes** (execution-path compatibility) |
| **Successful execution** | A particular run completes with its actual services, data, and configuration | **No.** It depends on the environment and input |

How responsibilities are split:

- **The pipeline validator (P60-M1-003) owns graph structural correctness only.**
- **The existing runtime** (`runPipeline` / `processNextNodes` and the card components) **owns**:
  - card configuration checks (for example "System Name and at least one Repository URL are required.");
  - service and model availability;
  - project-specific execution;
  - card-level runtime failures.
- The planner doesn't duplicate the runtime. It doesn't call services, check repositories, probe models, or predict whether a run will succeed.
- `REQUIRED_USER_CONFIG` and `RUNTIME_INTERACTION_HINTS` are guidance and pre-flight metadata shown to the user, not proof that a run will succeed.

**Why the validator lives in the frontend.** `CardType`, `VALID_CONNECTIONS`, `CATEGORIES`, and the card handlers in `processNextNodes` all live in `frontend/src/components/pipeline/`. A TypeScript validator can import them directly, which gives one source of truth. A Java copy would drift. The backend gets the catalog and its `catalogVersion` with each request, and echoes the version back.

**Why `chatbot-backend` hosts the planner.** It already has the local-LLM abstraction (`LocalLlmClient` plus the Ollama, llama.cpp, and OpenAI-compatible adapters), `/chatbot/health`, the 503 mapping for an unavailable runtime, and CORS on `/**`. A separate controller keeps the evidence-grounded `/chatbot/query` untouched.

**Diversity definition.** Two candidates are *meaningfully distinct* only if their **sets of analysis card types** differ. Analysis types are those in the `CATEGORIES` buckets Processes, Execution, Visualization, and Version Control. Differences in titles, wording, node keys, node order, or in Input, Generator, or Intermediate-Result cards (an extra `IR_HOLDER`, say) don't count.

## 5. User Stories

Stories are ordered by dependency. Three technical stories come first because they reduce risk before the main build:

- P60-M1-012, green baseline (Revision 2);
- P60-M1-013, PipelinePage testability spike (Revision 3);
- P60-M1-014, local-model feasibility spike (Revision 3), which comes right after the catalog it needs (P60-M1-001).

Existing IDs were not renumbered. See §6, "Early Risk-Reduction Checkpoint".

---

### P60-M1-012 — Restore a green baseline for the existing chatbot test suites

**User story**
As a developer changing the chatbot for Issue #60,
I want the existing chatbot test suites to pass before I start,
so that regressions caused by Milestone 1 can be told apart from failures that were already there.

**Rationale**
Audit run on `3aee1b0`:

- `CI=true npx react-scripts test --watchAll=false` in `frontend/`: **9 of 16 tests fail** in `ChatbotPanel.test.tsx`. The tests look for UI that has since been redesigned or removed, for example `data-testid="chatbot-refresh-context"`, the text "Runtime: unavailable", "No active analysis context", and `aria-expanded` on citation toggles.
- `mvn test` in `chatbot-backend/`: **1 of 110 tests fails**. `ChatbotQueryRequestValidationTest.acceptsValidRequest` uses `conversationId = "conv-2"`, which fails the UUID `@Pattern` on `ChatbotQueryRequest`.

P60-M1-005 and P60-M1-008 change these modules and require "existing tests stay green", which can't be met until this is fixed.

**Implementation scope**
- **Modify** `frontend/src/components/chatbot/ChatbotPanel.test.tsx` to match the current `ChatbotPanel`, `ChatMessage`, `CitationList`, and `RuntimeStatus` markup. For each failing test, decide whether the behaviour was removed on purpose (delete or rewrite the test) or is actually broken. If it's broken, log it as a separate product bug and leave the test failing or skipped with a reference to the bug; **don't change production behaviour in this story** (decision D10). Record each disposition in the PR.
- **Modify** `chatbot-backend/src/test/java/.../model/ChatbotQueryRequestValidationTest.java` so `acceptsValidRequest` uses a valid UUID.
- No production behaviour changes in this story.

**Acceptance criteria**
- Given `frontend/`, when `CI=true npm test -- --watchAll=false` runs, then every suite passes, apart from tests explicitly skipped with a linked product-bug reference (D10).
- Given `chatbot-backend/`, when `mvn test` runs, then all tests pass (110 at baseline).
- Given each removed, rewritten, or skipped test, then the PR lists it with its disposition (intentional UI change, or separate bug).

**Testing** This story is test maintenance. Its output is the regression net for P60-M1-005 and P60-M1-008.

**Dependencies** None.
**Priority** P0
**Estimate** 3. Mostly the 9 frontend tests; the backend fix is trivial.

**Definition of Done**
- Both commands are green locally on the milestone branch, and the PR description records the per-test decisions.

---

### P60-M1-013 — PipelinePage integration-test feasibility spike

**User story**
As the developer responsible for Milestone 1's test strategy,
I want to find out within one day whether the real `PipelinePage` can be rendered and driven under the existing Jest/React Testing Library setup,
so that the end-to-end tests in P60-M1-011 are planned on a proven approach, instead of discovering at the end of the milestone that they can't be written.

**Rationale**
P60-M1-011 must cover T1, T12, and T15 against the real page. There is no `PipelinePage` test today. Evidence at `3aee1b0`:

- **Size and imports:** `PipelinePage.tsx` is 2,046 lines and imports all 17 card components, `ChatbotPanel`, `PipelineTour` (`react-joyride`), and PostHog analytics.
- **Service calls:** `PipelinePage.tsx`, `canvas/PiplelineHeader.tsx` (`getAvailableSessions`, plus `useNavigate`, which needs a router), `SystemInputCard`, `UploadIRCard`, `IRHolderCard`, and `ChangeImpactCard` all import `services/api`.
- **Side effects on mount:**
  - an activity `setInterval` (`PipelinePage.tsx:320`);
  - `Notification.requestPermission` (`:471`, guarded by `'Notification' in window`);
  - `sessionStorage` / `inMemoryPipelineCache` hydration (`:477-498`);
  - the demo-warning modal when `IS_DEMO_VERSION === 'true'` (`:238`).
- **Lower risk than Revision 2 assumed:**
  - `react-joyride` 3.1.0 and `posthog-js` ship CommonJS builds (`dist/index.cjs`, `dist/main.js`);
  - the ESM-only `react-force-graph` (1.48.1, `type: module`) is **not** imported anywhere under `components/pipeline/`;
  - the toolchain is CRA 5 with Jest 27.5.1 and no custom `transformIgnorePatterns`.

  The main risk is therefore the page's size and side effects, not ESM transforms. *The spike confirms or refutes this.*

**Implementation scope** (timebox: **at most 1 working day**; no Issue #60 functionality; no production code changes)
- **New** `frontend/src/components/pipeline/__testutils__/renderPipelinePage.tsx`:
  - renders `<MemoryRouter initialEntries={['/pipeline']}><PipelinePage /></MemoryRouter>`;
  - centralizes only the mocks that are needed: `jest.mock` of `services/api` (inert resolved values for every export the page, header, and cards use), `analytics/posthog` (`track` as a no-op), and `react-joyride` *only if* the real one breaks rendering;
  - adds anything ESM-only the spike turns up;
  - clears `sessionStorage` and ensures `IS_DEMO_VERSION !== 'true'`.
- **New** proof test `frontend/src/components/pipeline/PipelinePage.harness.test.tsx` with these probes:
  1. **Render:** the page mounts, and the toolbox and header **Run** button are present.
  2. **Chatbot entry point:** click `data-testid="chatbot-toggle"`, and `chatbot-panel` becomes visible.
  3. **Pipeline-state effect:** open the Template Library and select "Architecture Reconstruction". Four cards and three connections render. This exercises the same `setNodes` / `setConnections` / `saveHistory` path the P60-M1-007 applier will use.
  4. **Run reachable:** click **Run** with System Source unconfigured, and the existing failure ("System Name and at least one Repository URL are required.") shows as that card's failed status or log. *Check how logs render in `PipelineCanvas`.*
  5. *Optional stretch:* configure System Source through its inputs, resolve a mocked `fetchIRFromRepo`, and Generate Snapshot reaches `completed`.
- Use role, text, or existing `data-testid` queries. If a probe would need a production change (for example a missing test ID), **record it instead of making it**.
- Record the result in the "Spike result" block below and in the test file's header comment.

**Outcomes**
- **Outcome A, feasible:** probes 1–4 pass with module-level mocks only, i.e. no mocking of pipeline components or `PipelinePage` internals.
  - Record the mock list and the test runtime.
  - P60-M1-011 builds its integration test on `renderPipelinePage()` and keeps its estimate.
- **Outcome B, not feasible in the timebox:** stop at the timebox.
  - Record exactly what blocked it, with the import or effect and its file and line.
  - Recommend **one** of: (1) extract a small, testable apply/run-entry layer out of `PipelinePage` (for example a hook owning `nodes`/`connections`/history and `applyPipelineSuggestion`); or (2) a smaller integration harness plus a scripted manual browser check for T1/T12/T15.
  - **Do not perform the refactor in this spike.** Re-estimate P60-M1-011 for the chosen option. A refactor needs team sign-off as its own change.

**Acceptance criteria**
- Given the spike starts, then it ends within one working day, with Outcome A or B recorded.
- Given Outcome A, then `CI=true npx react-scripts test --watchAll=false PipelinePage.harness` passes, and the header lists every mock with a one-line reason.
- Given Outcome B, then the blocking imports or architecture are named with file and line, exactly one recommendation is made, and P60-M1-011's estimate is updated.
- Given the spike's diff, then it touches only `__testutils__/`, the `*.harness.test.tsx` file, and this document. No production behaviour changes.
- Given the result, then P60-M1-011's scope states which strategy it uses and doesn't repeat the investigation.

**Testing** The spike's own proof test (T31).

**Dependencies** None. It doesn't need P60-M1-012: the spike runs its own file by pattern, so the stale failures in `ChatbotPanel.test.tsx` don't affect it. If probe 2 fails because of `ChatbotPanel` itself rather than the stale tests, record that in the result.
**Priority** P0
**Estimate** 2. A one-day timebox, plus writing up the result. The evidence above makes Outcome A likely but not certain.

**Definition of Done**
- The spike-result block below is filled in, the proof test is merged if Outcome A, and P60-M1-011 has been updated to the chosen strategy.

> **Spike result (completed 2026-10-07): Outcome A, feasible.** The real `PipelinePage` renders and can be driven under the existing CRA 5 / Jest 27 / RTL 13 setup with module-level mocks only. No pipeline component, `PipelinePage` internals, or production code was mocked or changed, and no test IDs were added.
>
> - **Proof test:** `frontend/src/components/pipeline/PipelinePage.harness.test.tsx` (6 tests, all passing). The harness is `frontend/src/components/pipeline/__testutils__/renderPipelinePage.tsx`. Probes:
>   1. The page renders, with the toolbox and a disabled **Run Pipeline**.
>   2. The chatbot opens.
>   3. The "Architecture Reconstruction" template puts 4 cards and 3 connections on the canvas.
>   4. **Run** reaches the existing "System Name and at least one Repository URL are required." check.
>   5. *(Stretch, done.)* System Source configured through its inputs → **Run** → mocked `fetchIRFromRepo` called → Generate Snapshot logs "IR generated."
>   6. An isolation check.
>
>   Each test also passes on its own.
> - **Mocks and shims required** (all module-level, documented in the harness header):
>   - **`services/api`:** a factory mock with every export as `jest.fn`, plus inert defaults for mount-time calls (`getChatbotHealth`, `refreshChatbotContext`, `checkGitHubTokenStatus`, `getAvailableSessions`). It must be a factory, never an automock: the real module imports `axios` 1.12.2, which ships as ESM and can't be loaded by Jest 27.
>   - **`analytics/posthog`:** `track` is a `jest.fn`; everything else is real.
>   - **Resolution shims (not behaviour mocks):**
>     - `react-router-dom` 7.9.1 declares `"main": "./dist/main.js"`, which doesn't exist. Its real entry points, and its `react-router/dom` subpath, are only in the `exports` map, which Jest 27 doesn't read. The shims load the real files and polyfill `TextEncoder`/`TextDecoder`, which React Router 7 needs and Jest 27's jsdom lacks.
>     - `date-fns/{format,isValid,formatDistanceToNow}` resolve to ESM `.js` files under Jest 27; the shims load the published `.cjs` builds.
>   - **Wrappers and environment:** `MemoryRouter` at `/pipeline`; a fresh `QueryClientProvider` (`SystemInputCard` uses react-query); `sessionStorage` cleared; `localStorage.pipeline_feedback_handled = 'true'` so the 15-minute feedback timer (`PipelinePage.tsx:320`) never starts; `window.confirm` stubbed to `true` for the existing **Clear All**.
>   - **`react-joyride`:** didn't need mocking (3.1.0 ships CommonJS, and the tour doesn't run).
> - **Isolation caveat:**
>   - `PipelinePage` keeps canvas state in a module-level `inMemoryPipelineCache` (`PipelinePage.tsx:70`) that survives unmounts.
>   - The harness empties the canvas through the existing toolbar **Clear All** before each test.
>   - Verified: with that reset disabled, the isolation test fails because state leaks between tests.
>   - P60-M1-011 tests must start through `renderPipelinePage()`.
> - **Runtime:** the harness file runs in ≈2.3–2.7 s for 6 tests; the full frontend suite (`ChatbotPanel.test.tsx` + harness) takes ≈3.0 s.
> - **Known noise (non-blocking):** about 6 console warnings per harness run: `act()` warnings from `ChatbotPanel`'s async health and context-refresh updates, and the `ReactDOMTestUtils.act` deprecation from RTL 13 on React 18.3. The existing `ChatbotPanel.test.tsx` produces the same kinds.
> - **Blockers:** none. **Risk to note:** the root cause of the friction is that Jest 27 (CRA 5) doesn't support package `exports`. Any new `exports`-only or ESM-only dependency added under `PipelinePage` will need another shim in the harness, or a later test-config change such as `moduleNameMapper` or a custom resolver. That isn't done or authorized here.
> - **Recommendation:** none needed (Outcome A). Decision R2 is resolved: no production refactor of `PipelinePage` is needed for testing.
> - **P60-M1-011:** proceeds on the Outcome A path, building `PipelinePlanning.integration.test.tsx` on `renderPipelinePage()` and `mockedApi`. **Estimate of 3 points confirmed.**

---

### P60-M1-001 — Pipeline capability catalog, input requirements, and required user configuration

**User story**
As a planner developer,
I want a serializable catalog of every pipeline card, its purpose, its legal connections, its runtime input requirements, and the configuration a user must supply, all derived from the real pipeline config,
so that the LLM prompt, the validator, and the "what to configure next" guidance use the same facts as the canvas.

**Rationale**
- `CARD_CONFIG` (`pipelineConfig.tsx`) holds JSX icons and can't be serialized.
- `VALID_CONNECTIONS` only says whether one card may link to another.
- Multi-input requirements and required user configuration exist only as runtime checks in `PipelinePage.tsx`.
- Without `CARD_INPUT_REQUIREMENTS`, a graph could pass `VALID_CONNECTIONS` and still be miswired, for example Quick Compare with only one of its two required inputs. That is a structural defect the validator must catch.
- `REQUIRED_USER_CONFIG` and `RUNTIME_INTERACTION_HINTS` are a different kind of thing. They are user guidance, not validation rules, and don't predict whether a run succeeds.

**Implementation scope**
- **Modify** `frontend/src/components/pipeline/pipelineConfig.tsx` to add, next to `VALID_CONNECTIONS`:
  - `CARD_INPUT_REQUIREMENTS: Partial<Record<CardType, CardInputRequirement>>`, where:
    ```ts
    interface CardInputRequirement {
      requiresAllOf?: CardType[][];                              // each inner array = "≥1 upstream of these types"
      exactUpstreamCount?: { type: CardType; count: number };
      maxIncoming?: number;
    }
    ```
    Fill it from the current handlers:
    - `SCENARIO_GENERATE`: `[['COMPONENT_HOLDER']]` (`PipelinePage.tsx:1342`, which throws "No endpoints found…");
    - `VERIFICATION_COMPARISON`: `[['FORMAL_VERIFY'],['SCENARIO_GENERATE']]` (`:1672`);
    - `CHANGE_IMPACT`: `[['MULTI_REPO','IR_HOLDER'],['SYSTEM_INPUT']]` (`:1728`);
    - `SECURITY_REGRESSION`: `exactUpstreamCount {FORMAL_VERIFY, 2}` (`:1805`, `fvNodes.length !== 2`);
    - `FORMAL_VIZ`: `[['FORMAL_VERIFY']]` (`:1611`).
  - `maxIncoming`: set it only for single-input cards where `runFromNode` uses `connections.find(...)`, i.e. only the first upstream (`:992`). Leave it **unset** for cards with several inputs in the shipped templates:
    - `FORMAL_VIZ` (Formal Verification and Policy Drift in "Policy Drift Comparison");
    - `SCENARIO_GENERATE` (Component Card and Change Impact in "Regressive Auth Testing");
    - `CHANGE_IMPACT`, `VERIFICATION_COMPARISON`, and `SECURITY_REGRESSION`;
    - `VISUALIZATION`, which stacks IRs into `timelineIRs` (`:967-988`).

    *Verify per-card values while implementing.* The "all templates validate" test guards against values that are too strict.
  - `INPUT_CARD_TYPES: CardType[] = ['SYSTEM_INPUT','UPLOAD_IR']`, the start-node filter in `runPipeline` (`:1072`).
  - `ANALYSIS_CATEGORIES = ['Processes','Execution','Visualization','Version Control']`, a subset of the `CATEGORIES` keys.
  - `REQUIRED_USER_CONFIG: Partial<Record<CardType, { fields: string[]; hint: string }>>`. Mirror the existing pre-run checks and nothing more:
    - `SYSTEM_INPUT`: `systemName` and `repositories` (≥1) (`runPipeline` `:1082`, `runFromNode` `:1002`);
    - `UPLOAD_IR`: an uploaded IR (`:1097`).

    Cards with defaults need **no** entry: `TEST_GENERATE` (`selectedLlm` defaults to `'gpt-5-mini'` in `TestGenerateCard.tsx:23`), `TEST_EXECUTOR` (`targetUrl` defaults to `http://localhost:1234` in `TestExecutorCard.tsx:51`), and `PROMPT_GENERATE` (`language` defaults to `'java'`).
  - `RUNTIME_INTERACTION_HINTS: Partial<Record<CardType, string>>`, for steps that need user action *during* a run. Example: `PROMPT_GENERATE` needs scenarios chosen after Scenario Generation completes (`:1483`).
- **New** `frontend/src/components/pipeline/planning/pipelineCapabilities.ts`:
  - `buildPipelineCapabilityCatalog()` is pure. Per card it returns `{cardType, title, description, purpose, outcome, category, isInput, isAnalysis, allowedTargets, inputRequirement, requiredUserConfig, runtimeHint}`, built from `CARD_CONFIG` (dropping `icon`/`color`), `CATEGORIES`, `VALID_CONNECTIONS`, and the constants above.
  - `examples`: the 7 `PIPELINE_TEMPLATES` (`configs/PipelineTemplates.tsx`) converted to `PipelineSpec` form, without positions or icons.
  - `catalogVersion`: a deterministic hash of the stable-stringified catalog, excluding `examples`.

**Acceptance criteria**
- Given the current `CardType` union, when the catalog is built, then it has exactly one entry per `CardType` (17 at baseline), and each entry's `allowedTargets` deep-equals `VALID_CONNECTIONS[cardType]`.
- Given a new `CardType` added to `models.tsx` and `CARD_CONFIG`, when the catalog is rebuilt, then it appears with no planner changes, and a test fails if `CATEGORIES` doesn't list it.
- Given the catalog, when it goes through `JSON.stringify`/`parse`, then it round-trips with no functions or React elements.
- Given each of the 7 templates as a spec, when validated with P60-M1-003, then it is valid.
- Given the same config, when built twice, then `catalogVersion` is identical. When any `VALID_CONNECTIONS` entry changes, the version changes.
- Given `REQUIRED_USER_CONFIG`, then every entry has a code comment citing the `runPipeline`/`runFromNode` check it mirrors.

**Testing**
- Unit (Jest), `planning/pipelineCapabilities.test.ts`: card count, connection parity, serializability, stable and changed version, category coverage, and that every referenced type is a real `CardType`.

**Dependencies** None. Template validation in the acceptance criteria runs once P60-M1-003 lands.
**Priority** P0
**Estimate** 3

**Definition of Done**
- The constants and catalog module are merged, and `npm test -- --watchAll=false pipelineCapabilities` is green.
- No canvas behaviour changes; manual linking still reads `VALID_CONNECTIONS` as before.

---

### P60-M1-014 — Local-model pipeline-planning feasibility spike

**User story**
As the team building the planner,
I want early evidence that the configured local model can turn real AridNova goals into usable structured pipeline candidates from the real capability catalog, within the planned latency budget,
so that the model and prompt approach is settled before retry orchestration, the suggestion UI, and the demo are built on top of it.

**Rationale**
The milestone assumes a small local model can emit valid JSON pipeline graphs. The compose default is Ollama `CHATBOT_MODEL=llama3.2` (`docker-compose.yaml`; `chatbot-backend/src/main/resources/application.properties`). The current `OllamaLocalLlmAdapter` sends neither `format` nor `num_ctx`. Revision 2 placed the first live measurement in P60-M1-011, at the very end. This spike asks, *"Is this approach and model viable early enough to continue?"* P60-M1-011 still asks, *"Is the finished milestone reliable enough to demonstrate and sign off?"*

**Implementation scope** (timebox: **at most 2 working days**; no production code; no fine-tuning; local-only objective unchanged)
- **Environment:** `docker compose --profile local-llm up ollama` and `docker exec cloudhub_ollama ollama pull llama3.2`. Record the Ollama version (`GET /api/version`) and the host hardware, because latency depends on both.
- **Harness, new** `frontend/src/components/pipeline/planning/__spike__/localModelFeasibility.live.test.ts`:
  - annotated `/** @jest-environment node */` and **skipped unless `RUN_LIVE_LLM=1`**, so normal `npm test` makes no network calls;
  - builds the **real** catalog with `buildPipelineCapabilityCatalog()` (P60-M1-001), with no invented card vocabulary;
  - assembles a **draft planning prompt** from the catalog: cards, allowed edges, input requirements, output schema, three-tier instruction, and 1–2 template examples. This draft becomes the starting text for P60-M1-005's `PipelinePlanPromptBuilder`, so the prompt-design work carries forward;
  - calls Ollama `POST /api/chat` directly, with the options P60-M1-005 plans to send: `stream:false`, `temperature`, `num_predict`, `format:"json"`, `options.num_ctx`. Use `axios`, which is already a dependency, because Jest 27's node environment may not expose global `fetch` (*verify*). The Java backend isn't involved yet;
  - evaluates each response with P60-M1-002/003 if they are merged. Otherwise it uses a **temporary evaluator inside the spike file** (to be removed once P60-M1-003 lands) that reports two separate classes:
    - **Syntax:** not JSON, no `candidates` array, or a candidate that isn't an object with `nodes`/`edges`.
    - **Semantic:** unknown card type (vs `CARD_CONFIG`), illegal connection (vs `VALID_CONNECTIONS`), missing upstream or unmet requirement (vs `CARD_INPUT_REQUIREMENTS`), and duplicate or equivalent candidates (same analysis-card set).
  - writes raw responses and per-run metrics to a git-ignored local file, and summarizes them in the result block below.
- **Run plan** (about 22 calls, roughly 20–60 minutes of wall time):
  - **Main runs** (JSON mode on, `num_ctx` 8192), 17 runs in total:
    - G1 "I want to visualize the architecture and check authorization problems." ×5;
    - G2 "Just show me the architecture." ×3;
    - G3 "I want to test authorization of my endpoints." ×3;
    - G4 "Find security or architecture risks." ×3;
    - G5 "Compare policy or verification results across versions." ×3.
  - **Control:** G1 ×2 with JSON mode **off**, to show whether `format:"json"` is needed.
  - **Retry probe:** for every G1 main run without 3 distinct valid candidates, send one retry containing the accepted candidates' card lists and the rejection codes (the P60-M1-006 algorithm, done by hand in the harness). Record whether it recovers.
- **Record per run:**
  - JSON ok (y/n);
  - number of candidate structures;
  - count of unknown card types, illegal connections, and missing upstream or unmet requirements;
  - duplicate or equivalent count;
  - distinct valid count;
  - whether a usable set of 3 exists (for G1, after the retry probe);
  - wall latency, plus Ollama `total_duration`, `eval_count`, and `prompt_eval_count`. Comparing `prompt_eval_count` with `num_ctx` shows truncation risk;
  - whether a retry would plausibly recover, with a one-line reason.

**Early feasibility threshold**
These numbers come from P60-M1-006: `PLAN_TOTAL_BUDGET_MS` = 150 s and `MAX_PLAN_ATTEMPTS` = 2, so each call must stay within about 75 s for a retry to fit. They are early signals, *not* the P60-M1-011 demo gate.

| Signal | Early threshold |
|---|---|
| Structured output | JSON parse succeeds in ≥ 80% of the 17 main runs |
| Candidate volume | ≥ 3 candidate structures, before filtering, in ≥ 60% of main runs |
| Primary goal | G1 yields 3 valid, meaningfully distinct candidates after validation and ≤ 1 retry in ≥ 3 of 5 reps |
| Latency | Per-call p95 ≤ 75 s on the demo-class machine |
| Prompt fit | `prompt_eval_count` ≤ 75% of `num_ctx` (no silent truncation) |

**Decision** (record exactly one, with evidence)
- **A. Adequate:** all thresholds met. Continue. P60-M1-005 adopts the spike prompt and settings as defaults.
- **B. Usable with tuning:** structured output and latency are met, but semantic validity or distinctness falls short, with failures concentrated in a few codes. Do one prompt, example, or JSON-mode tuning iteration within the timebox, re-run G1, and continue with the tuned prompt.
- **C. Not reliable enough:** structured output is under 80% even with JSON mode, latency is over threshold, or tuning under B doesn't reach the G1 threshold. Re-run the same harness against a larger local model supported by Ollama (the team picks a model that fits the demo hardware) and record its hardware needs. Update the `CHATBOT_MODEL` recommendation.
- **D. Reconsider architecture:** no tested local model reaches the G1 threshold. Pause before P60-M1-006/008 and replan. One direction to evaluate (not decided here): the model selects analysis goals and deterministic code composes the graphs from the catalog. No fine-tuning, no preference learning, no RAG.

**Acceptance criteria**
- Given the harness, then the card vocabulary comes only from `buildPipelineCapabilityCatalog()`, with no hand-written card list.
- Given each run, then syntax failures and semantic rule violations are reported separately.
- Given the spike ends, then the result block contains the results table (17 main runs, the control, and the retry probe), threshold pass or fail per signal, decision A–D with justification, and provisional values for P60-M1-005: JSON mode, `num_ctx`, `num_predict`, temperature, and per-call timeout.
- Given decision C, then at least one alternative model has been measured with the same harness before the spike closes, or the spike is extended by explicit team decision.
- Given `CI=true npm test -- --watchAll=false` without `RUN_LIVE_LLM`, then the harness is skipped and no network call happens.
- Given the spike's diff, then no production source file changed.

**Testing** A measurement, not part of the milestone's regression suite (T32). P60-M1-011 may re-point the harness at the real endpoint for the final smoke test.

**Dependencies** P60-M1-001 (the real catalog; the catalog builder and constants are the whole story). It uses P60-M1-002/003 if merged but doesn't need them. Environment: Ollama with the model pulled.
**Priority** P0
**Estimate** 3. Harness and draft prompt about 1 day, runs and analysis about 1 day.

**Checkpoint role** This is an implementation checkpoint, not a compile-time dependency. Its decision must be recorded **before P60-M1-006 and P60-M1-008 start**. It also sets the prompt and runtime defaults that P60-M1-005 finalizes. Work on P60-M1-002/003/004/005/007 continues meanwhile (see §6).

**Definition of Done**
- The result block is filled in, the decision has been reviewed by the team, and the P60-M1-005 defaults have been updated to match.

> **Spike result (completed 2026-10-07): Decision D. No tested local model reaches the G1 threshold. Pause before P60-M1-006/008 and replan.**
>
> - **Setup:**
>   - Harness: `frontend/src/components/pipeline/planning/__spike__/localModelFeasibility.live.test.ts`, skipped unless `RUN_LIVE_LLM=1`.
>   - Catalog: the real `buildPipelineCapabilityCatalog()`, `catalogVersion = pcat-0861a6885a178a` (17 cards, inputs `SYSTEM_INPUT`/`UPLOAD_IR`).
>   - Prompt: v1 draft, 6,622 characters, built entirely from the catalog. It includes allowed edges, structural requirements, the schema, the exactly-three and focused/balanced/comprehensive instruction, and two template examples (`arch-reconstruction`, `auth-test-generation`).
>   - Settings: `format: "json"`, `num_ctx` 8192, `num_predict` 2048, temperature 0.4.
>   - Evaluator: a temporary one inside the spike file, reporting syntax and semantic failures separately. P60-M1-002/003 don't exist yet.
> - **Hardware:** Apple M4, 10 cores, 24 GB RAM, macOS 26.6.2. Docker Desktop VM: 10 CPUs, 8.3 GB, **CPU-only inference** (no GPU passthrough on macOS).
> - **Models and runtimes measured:**
>   1. **Reference:** `llama3.2` (3.2B, Q4_K_M) in the compose container `cloudhub_ollama`, Ollama **0.23.4**, reached at `http://[::1]:11434`.
>   2. **Decision C larger model:** `llama3.1:8b` on the host's native Ollama **0.35.1** (Metal GPU), at `http://127.0.0.1:11434`. This changes the model and the runtime at the same time; a native macOS Ollama also listens on 127.0.0.1:11434, so `localhost` is ambiguous on this machine.
>
>   Both ran the full matrix: G1×5, G2–G5×3, G1×2 with JSON mode off, and one retry for every G1 run without a usable set.
>
> | Signal (17 main runs) | Early threshold | `llama3.2` (container, CPU) | `llama3.1:8b` (native, Metal) |
> |---|---|---|---|
> | Structured output (JSON parses) | ≥ 80% | **100% ✓** | **100% ✓** |
> | ≥ 3 candidate structures before filtering | ≥ 60% | **12% ✗** (2/17)¹ | **100% ✓** (17/17) |
> | G1: 3 valid, distinct after ≤ 1 retry | ≥ 3/5 | **0/5 ✗** (best: 2) | **0/5 ✗** (best: 2) |
> | Per-call p95 (main + retry calls, n=22) | ≤ 75 s | **91.7 s ✗** (p50 51.2 s, max 111.8 s) | **61.3 s ✓** (p50 48.3 s, max 64.0 s) |
> | Prompt usage of `num_ctx` | ≤ 75% | **33% ✓** (max 2,688 / 8,192 tokens) | **34% ✓** (max 2,757 / 8,192) |
> | Runs with any usable 3-set | — | 0/17 | 0/17 |
> | Valid candidates / well-formed candidates | — | 6/20 (30%) | 11/51 (22%) |
> | Output truncated (`done_reason: length`) | — | 0 | 0 (max 1,316 output tokens) |
>
> ¹ `llama3.2` usually returned one candidate in `candidates` and put the other options under extra top-level `focused`/`balanced`/`comprehensive` keys, violating the schema. Even counted leniently, only 8/17 runs (47%) had three structures.
>
> - **Most common semantic rejections:** for `llama3.2` / `llama3.1:8b` respectively:
>   - `ILLEGAL_CONNECTION`: 22 / 46.
>   - `INPUT_REQUIREMENT_UNMET`: 21 / 27.
>   - Graph-shape failures, `NOT_CONNECTED` / `MISSING_UPSTREAM` / `UNREACHABLE_NODE`: 9 each for `llama3.2`; 2–3 each for `llama3.1:8b`.
>   - The larger model's illegal edges are systematic. It places Get Components after the snapshot chain: `MULTI_REPO→COMPONENT_GENERATE` 14×, `IR_HOLDER→COMPONENT_GENERATE` 10×, `COMPONENT_GENERATE→IR_HOLDER` 7×. The catalog allows only `SYSTEM_INPUT→COMPONENT_GENERATE`.
>   - Both models often leave out the required inputs of Scenario Generation (Component Card), Quick Compare (FV + Scenario Generation), and Policy Drift (exactly two FV).
>   - No config-like fields were emitted by `llama3.1:8b`; `llama3.2` emitted 6 extra fields.
> - **JSON mode:** keep it on. In the JSON-off control, `llama3.2` produced prose with no JSON in 1 of 2 runs; `llama3.1:8b` produced JSON both times.
> - **Retry:** the single bounded retry never produced a usable set. It raised `llama3.1:8b`'s distinct valid count by at most one per run.
> - **Why D, not B or C:**
>   - `llama3.2` failed latency, candidate volume, and G1, which is C. C requires measuring a larger model.
>   - `llama3.1:8b` passes structure, volume, latency (on native Metal), and context, but still scores 0/5 on G1.
>   - Under the frozen definition this is **D**, so no tuning iteration was run.
> - **Evidence for the replanning discussion:**
>   - `llama3.1:8b`'s failure profile is concentrated in a few error patterns and has near misses: candidates often one edge away from valid. That's the shape B was designed for.
>   - The harness already contains a catalog-derived tuning prompt (`LIVE_LLM_PROMPT=v2`: incoming-edge restatement plus an edge self-check), which was **not run**.
>   - The cheapest next experiment, *only with explicit team approval*, is one v2 run of `llama3.1:8b` with `LIVE_LLM_PLAN=g1` (about 10 minutes).
>   - Alternatives raised in §5 remain for the team: the model chooses analysis goals and deterministic code composes the graphs; or a GPU-backed or native Ollama runtime.
>   - The 75 s per-call budget isn't achievable for the compose container on macOS (CPU only) with either model size.
> - **Provisional P60-M1-005 settings, if work resumes:**
>   - `format: "json"` on;
>   - `num_ctx` 8192 (peak usage 34%; 4096 would leave little room for retries);
>   - `num_predict` 2048 (peak output 1,316 tokens, never truncated);
>   - temperature 0.4 (unchanged; not a factor in the failures);
>   - per-call timeout 75 s only on a GPU or native runtime. On the CPU-only compose container, p95 is 92 s, so the 150 s two-attempt budget can't hold.
>   - Reference model: **unresolved (R1)**. `llama3.2` is not adequate; `llama3.1:8b` meets everything except G1.
> - **Raw data:** per-run JSON results, including prompts and model outputs, were written outside the repository (`LIVE_LLM_RESULTS_DIR`). Re-run with:
>
>   ```
>   RUN_LIVE_LLM=1 OLLAMA_BASE_URL=... OLLAMA_MODEL=... CI=true npm test -- --watchAll=false localModelFeasibility
>   ```

---

### P60-M1-002 — `PipelineSpec` v1 contract and strict parser

**User story**
As a developer integrating the planner,
I want a stable, versioned, minimal description of one candidate pipeline, plus a parser that turns untrusted JSON into it,
so that model output, API payloads, validation, rendering, and canvas creation share one contract and the model can never inject runtime state.

**Rationale**
`NodeData` and `Connection` (`models.tsx`) carry runtime state (`status`, `logs`, `data` payloads) and generated IDs and coordinates. The model must supply none of these.

**Implementation scope**
- **New** `frontend/src/components/pipeline/planning/pipelineSpec.ts`:
  ```ts
  interface PipelineSpecV1 {
    specVersion: 1;
    title: string;          // 1..60 chars
    summary: string;        // 1..280 chars, plain text
    rationale?: string;     // 0..400 chars, "why this fits"
    nodes: { key: string; cardType: string }[];   // key: /^[a-z][a-z0-9_-]{0,31}$/
    edges: { from: string; to: string }[];
  }
  interface PlannerEnvelope { candidates: unknown[]; unsupportedReason?: string }
  ```
  - `parsePipelineSpec(raw: unknown)` returns `{ ok: true; spec; ignoredFields: string[] } | { ok: false; issues: SpecIssue[] }`. It copies only whitelisted fields and reports dropped ones (for example `data`, `config`, `x`, `id`) in `ignoredFields`. It trims, strips control characters, enforces types and lengths, and rejects `specVersion !== 1`. It **never throws**.
  - `parsePlannerEnvelope(raw)` parses each candidate on its own, so one malformed candidate doesn't discard the others.
  - Shared `SpecIssue { code: string; message: string; path?: string }`.
- **Modify** `frontend/src/services/types.ts` to add `PipelinePlanRequest` and `PipelinePlanResponse`. Response candidates are typed `unknown[]`, because they are untrusted.
- **New (backend)** `chatbot-backend/src/main/java/edu/baylor/ecs/cloudhubs/chatbot/pipeline/model/` request and response DTOs: Lombok POJOs following `model/ChatbotResponse.java`. Candidates are passed through as `JsonNode` after the shape check.

**Acceptance criteria**
- Given a well-formed candidate, when parsed, then `ok: true` with exactly the whitelisted fields.
- Given extra fields such as `"x": 10` or `"data": {"repositories": [...]}`, when parsed, then `ok: true`, the fields are absent, and `ignoredFields` lists them.
- Given a missing `title`, non-array `nodes`, key `"Bad Key!"`, a 61-character title, or `specVersion: 2`, when parsed, then `ok: false` with a coded issue and a `path` for each problem.
- Given `cardType: "VECTOR_GENERATE"`, when parsed, then parsing succeeds. Card membership is the validator's job.
- Given an envelope `[valid, null, valid]`, when parsed, then 2 specs are returned plus 1 per-candidate issue.
- Given a non-object, an empty string, or a 1 MB string, when parsed, then the parser returns issues and doesn't throw.

**Testing**
- Unit (Jest), `planning/pipelineSpec.test.ts`: happy path, field stripping and `ignoredFields`, every length boundary (0/1/max/max+1), wrong types, per-candidate isolation, and a loop over random JSON values asserting the parser never throws.
- Backend: `PipelinePlanDtoSerializationTest`, following `ChatbotDtoSerializationTest`.
- Fixture `planning/__fixtures__/plan-response.valid.json`, mirrored by an identical backend test resource.

**Dependencies** P60-M1-001 (card vocabulary for fixtures).
**Priority** P0
**Estimate** 3

**Definition of Done**
- Parser, types, and DTOs are merged with tests green, and the header comment documents `PipelineSpecV1` with an example.

---

### P60-M1-003 — Deterministic pipeline validator

**User story**
As a user who doesn't understand AridNova's card rules,
I want every suggested pipeline checked against the real pipeline rules before I see it,
so that anything I can select is **structurally valid**: it builds on the canvas and is wired the way the pipeline engine expects.

**Rationale**
The only connection check today is inline in `handleLinkClick` (`PipelinePage.tsx:877-908`), which silently ignores illegal links. There is no reusable validator.

**Boundary:** this story promises **structural validation only** (see §4, "Validity, runnability, and execution"). The validator doesn't call external or internal services, check repositories or uploaded IRs, probe model availability, run cards, or predict whether a run will succeed. Those remain the existing runtime's job.

**Implementation scope**
- **New** `frontend/src/components/pipeline/planning/pipelineValidator.ts`:
  - `validatePipelineSpec(spec, config = defaultValidationConfig): ValidationResult`. The default config reads `CARD_CONFIG` keys, `VALID_CONNECTIONS`, `CARD_INPUT_REQUIREMENTS`, `INPUT_CARD_TYPES`, `ANALYSIS_CATEGORIES`/`CATEGORIES`, and `catalogVersion`. The config can be injected for tests.
  - Returns `{ valid: true; suggestion: ValidatedSuggestion } | { valid: false; issues: SpecIssue[] }` and reports **all** issues, not just the first.
  - `ValidatedSuggestion` is a branded type that only this module can build:
    ```ts
    { readonly __validated: unique symbol; spec: PipelineSpecV1;
      signature: string; candidateId: string; catalogVersion: string }
    ```
  - **Deterministic IDs:**
    - `signature = canonicalSignature(spec)`: the sorted multiset of `cardType`s plus the sorted multiset of `"SRC_TYPE>DST_TYPE"` edges, ignoring keys, order, and text;
    - `candidateId = "pc_" + first 10 hex characters of a stable hash of signature`. The same graph always gets the same ID, across retries and sessions. It is used for selection, deduplication, and telemetry.
  - Rules, each with a stable `code`:
    | Code | Rule |
    |---|---|
    | `UNKNOWN_CARD_TYPE` | `cardType` not a key of `CARD_CONFIG` |
    | `DUPLICATE_NODE_KEY` | Two nodes share a `key` |
    | `EDGE_UNKNOWN_NODE` | Edge endpoint doesn't match a node key |
    | `SELF_LOOP` | `from === to` |
    | `DUPLICATE_EDGE` | Same `(from,to)` twice (mirrors `PipelinePage.tsx:891`) |
    | `ILLEGAL_CONNECTION` | `to.cardType ∉ VALID_CONNECTIONS[from.cardType]` |
    | `CYCLE` | Not a DAG (defensive) |
    | `MISSING_INPUT` | No node of an `INPUT_CARD_TYPES` type |
    | `INPUT_WITHOUT_OUTPUT` | Input node with no outgoing edge |
    | `MISSING_UPSTREAM` | Non-input node with no incoming edge |
    | `UNREACHABLE_NODE` | Not reachable from an input (`runPipeline` only starts from inputs) |
    | `NOT_CONNECTED` | More than one weakly-connected component |
    | `INPUT_REQUIREMENT_UNMET` | A `CARD_INPUT_REQUIREMENTS` rule fails |
    | `NO_ANALYSIS_CARD` | No card of an `ANALYSIS_CATEGORIES` type |
    | `SIZE_LIMIT` | Nodes outside 2..16 or edges > 24 (largest template has 11 nodes; *tune while implementing*) |
  - `describeIssuesForRetry(issues)` returns short, deduplicated, model-readable feedback strings.

**Acceptance criteria**
- Given each Demo Scenario chain (§2) and every template, when validated, then `valid: true`.
- Given `SYSTEM_INPUT → FORMAL_VERIFY`, when validated, then `ILLEGAL_CONNECTION` is reported with the edge path.
- Given `VERIFICATION_COMPARISON` fed only by `FORMAL_VERIFY`, or `SCENARIO_GENERATE` fed only by `FORMAL_VERIFY`, when validated, then `INPUT_REQUIREMENT_UNMET` names the missing type.
- Given `SECURITY_REGRESSION` with 1, 2, or 3 upstream `FORMAL_VERIFY` nodes, when validated, then only the 2-node case passes.
- Given two disjoint valid chains in one spec, when validated, then `NOT_CONNECTED`.
- Given a spec with 3 illegal edges and an unknown card, when validated, then all 4 issues are returned.
- Given two specs that differ only in node keys, node order, or text, when validated, then they get the same `signature` and `candidateId`.
- Given the same input, when validated repeatedly, then the result is identical.
- Given code outside the module that builds a `ValidatedSuggestion`, then TypeScript compilation fails.

**Testing**
- Unit (Jest), `planning/pipelineValidator.test.ts`, table-driven:
  - every rule code, with positive and negative cases;
  - a **full 17×17 pairwise legality matrix**: a minimal two-node spec gets `ILLEGAL_CONNECTION` exactly where `VALID_CONNECTIONS` forbids the pair;
  - size boundaries at 1/2/16/17 nodes and 24/25 edges;
  - all templates pass;
  - `canonicalSignature` and `candidateId` stability and sensitivity (changing one edge's target type changes the ID).

**Dependencies** P60-M1-001, P60-M1-002.
**Priority** P0
**Estimate** 5

**Definition of Done**
- All rule codes are implemented and documented in the module header, with tests green.
- The validator is pure (no React, network, `Date`, or `Math.random`), and checks structure only, with no service, repository, or model checks.
- Review confirms the brand can't be built outside the module.

---

### P60-M1-004 — Candidate set assembly: dedupe, diversity, exactly three

**User story**
As a non-expert user,
I want the three suggestions to be meaningfully different options rather than the same pipeline worded three ways,
so that the choice I make is a real choice between scope and depth.

**Rationale**
Small local models often repeat themselves. Diversity has to be enforced by code, using the definition in §4.

**Implementation scope**
- **New** `frontend/src/components/pipeline/planning/candidateSet.ts`:
  - `assembleCandidateSet(validated: ValidatedSuggestion[])` returns `{ ok: true; suggestions: [S,S,S] } | { ok: false; reason: 'INSUFFICIENT_DISTINCT'; distinctCount: number }`.
  - **Duplicate:** same `candidateId`. The first occurrence wins.
  - **Near-identical:** same analysis-card-type set as an already accepted candidate. The first occurrence wins.
  - **More than 3 distinct:** choose the triple with the largest minimum pairwise Jaccard distance between analysis-card sets, breaking ties by original order. At most 5 candidates means at most 10 triples.
  - **Tier labels, assigned by code:** sort the three by (distinct analysis types, node count, original index), then label them `focused`, `balanced`, `comprehensive`. If the first and third have the same number of distinct analysis types, use `Option A/B/C` instead, so labels never claim a size difference that isn't there.
  - The 3 chosen candidates are displayed in this sorted order, so "candidate 1/2/3" is deterministic.
  - `excludeIdsFor(accepted)` returns the `candidateId`s and readable card lists to send on retry.

**Acceptance criteria**
- Given 3 valid candidates with distinct analysis sets, when assembled, then `ok: true` and the tiers come out in size order.
- Given candidates that differ only by an extra `IR_HOLDER`, or identical graphs with different titles, when assembled, then they count as one.
- Given 4 or 5 valid distinct candidates, when assembled, then exactly 3 are returned, and the same input always returns the same 3.
- Given 0, 1, or 2 distinct valid candidates, when assembled, then `ok: false` and no partial set is returned.
- Given three equally sized but different pipelines, when assembled, then `ok: true` with `Option A/B/C`.

**Testing**
- Unit (Jest), `planning/candidateSet.test.ts`: every criterion above, the count boundaries 0–5, and a shuffle test showing the result doesn't depend on input order when there are no ties.

**Dependencies** P60-M1-002, P60-M1-003.
**Priority** P0
**Estimate** 3

**Definition of Done**
- The module is merged with tests green, and the pipeline layer can never return a count other than exactly 3.

---

### P60-M1-005 — Pipeline-planning endpoint in `chatbot-backend`

**User story**
As the AridNova assistant,
I want a dedicated planning endpoint that turns a goal and the capability catalog into candidate pipeline specs using the configured local LLM,
so that pipeline generation is an explicit action with its own contract, and the evidence-grounded Q&A path stays untouched.

**Rationale**
`/chatbot/query` (`ChatbotController`, `ChatbotQueryService`) is built around evidence retrieval and citations, and returns free text. Planning needs structured JSON, a bigger context window and token budget, and its own timeout.

**Implementation scope**
- **New package** `chatbot-backend/src/main/java/edu/baylor/ecs/cloudhubs/chatbot/pipeline/`:
  - `PipelinePlanController`: `@RestController @RequestMapping("/chatbot/pipeline")`, `@PostMapping("/plan")`. Error mapping:
    - `LocalLlmException` → **503** (same as `ChatbotController.query`);
    - bean-validation failure → **400**;
    - anything else → **200** with an explicit `outcome`.
  - `model/PipelinePlanRequest`:
    - `goal`: `@NotBlank`, `@Size(max=1000)`;
    - `suggestionSetId`: UUID pattern;
    - `attempt`: 1..2;
    - `catalog`: `@NotNull`, bounded (≤64 cards, bounded strings, ≤10 examples);
    - `catalogVersion`;
    - `excludeCandidates`: ≤10;
    - `rejectionFeedback`: ≤20 strings of ≤200 characters.
  - `model/PipelinePlanResponse`:
    - `outcome`: `OK | INVALID_MODEL_OUTPUT | UNSUPPORTED_GOAL | MODEL_UNAVAILABLE`;
    - `suggestionSetId`, `requestId`, `catalogVersion` (echoed);
    - `candidates: List<JsonNode>` (0..5, shape-checked only), `parseErrors`, `unsupportedReason`;
    - `model`, `provider`, `processingTimeMs`.

    **Don't reuse `ChatbotFlag`.** The Java enum serializes as UPPERCASE (`MODEL_UNAVAILABLE`), while the frontend `ChatbotFlag` type expects lowercase. That mismatch already exists and is out of scope. The planning contract uses its own `outcome` enum.
  - `PipelinePlanPromptBuilder` builds the system instruction **only** from `request.catalog`; there are no card names in Java. It includes:
    - cards (`cardType`, title, purpose), allowed edges, input requirements, and hard rules;
    - the output JSON schema and "return exactly three candidates: one focused, one balanced, one comprehensive; vary the *analysis* cards";
    - "never include configuration, positions, or IDs";
    - "for Policy Drift list the base Formal Verification first";
    - 1–2 `examples`;
    - on retry, `excludeCandidates` and `rejectionFeedback`;
    - "if unsupported, return `{"candidates":[],"unsupportedReason":...}`".
  - `PipelinePlanService` builds a `ChatbotPrompt` with `jsonOutput=true` and calls `LocalLlmClient.generate(prompt, planningConfig)`.
  - `PipelineSpecJsonExtractor` does tolerant extraction:
    - strips Markdown fences, finds the first balanced top-level JSON object, and parses it with Jackson;
    - shape-checks candidates (objects with `nodes`/`edges` arrays) and caps the list at 5;
    - never throws for bad model output, returning `outcome=INVALID_MODEL_OUTPUT` with `parseErrors` instead.
- **Modify** `ChatbotConfig` and `application.properties` to add planning overrides, bound like the existing properties (`ChatbotConfigBindingTest`). All defaults are **provisional until P60-M1-014 records its measured values**:
  - `chatbot.pipeline-plan.max-tokens` (default 2048; the global `CHATBOT_MAX_TOKENS` default of 1024 is likely too small for 3 specs);
  - `chatbot.pipeline-plan.temperature` (default 0.4);
  - `chatbot.pipeline-plan.timeout-ms` (default 75000, i.e. half of `PLAN_TOTAL_BUDGET_MS`, so two attempts fit the 150 s budget; the global `CHATBOT_TIMEOUT_MS` of 240000 is too long);
  - `chatbot.pipeline-plan.context-tokens` (default 8192).
- **Prompt text:** start `PipelinePlanPromptBuilder` from the draft prompt validated in P60-M1-014. Port it from the TypeScript harness to Java and keep it catalog-driven. Don't redesign the prompt from scratch.
- **Modify** `runtime/model/ChatbotPrompt` to add optional `boolean jsonOutput` and `Integer contextTokens`, both defaulting to off so `/chatbot/query` is unchanged.
- **Modify** `OllamaLocalLlmAdapter.buildPayload`. When the flags are set, send `"format":"json"` and `options.num_ctx`. The adapter sets only `temperature` and `num_predict` today, so Ollama's default context window applies. That default is small (2048–4096 tokens depending on Ollama version; *verify the deployed version*), and the catalog, examples, and output may not fit, which would truncate the prompt silently.
- **Modify** `OpenAiStyleLocalLlmAdapter` to send `response_format: {type: "json_object"}` when `jsonOutput` is set. For `LlamaCppLocalLlmAdapter`, *verify JSON or grammar support while implementing*; if it isn't supported, ignore the flag and let the extractor handle prose. This isn't a Milestone 1 blocker unless llama.cpp is chosen as the reference runtime (R3).
- Logging, in the style of `ChatbotController`: `chatbot.pipeline_plan.completed requestId suggestionSetId attempt outcome candidates parseErrors latencyMs model promptChars`. **Never log the goal text.**
- No semantic validation in Java (see §4).

**Acceptance criteria**
- Given a stub LLM returning 3 specs inside Markdown fences, when the endpoint is called, then 200, `outcome=OK`, 3 candidates, and `catalogVersion` echoed.
- Given the stub returns prose or truncated JSON, then 200, `outcome=INVALID_MODEL_OUTPUT`, and non-empty `parseErrors`.
- Given the stub returns 7 candidates, then 5 are returned. Given candidate #2 is `"oops"`, then #1 and #3 are returned plus one parse error.
- Given `{"candidates":[],"unsupportedReason":"…"}`, then 200, `outcome=UNSUPPORTED_GOAL`.
- Given `LocalLlmException` (`MODEL_UNAVAILABLE` or `TIMEOUT`), then 503, `outcome=MODEL_UNAVAILABLE`.
- Given a blank or 1001-character goal, a missing catalog, or a bad UUID, then 400.
- Given a catalog containing `FOO_CARD`, when the prompt is built, then `FOO_CARD` is in the system instruction (catalog-driven).
- Given `jsonOutput=true` and `contextTokens=8192`, when the Ollama payload is built, then it contains `format:"json"` and `options.num_ctx=8192`. Given the defaults, then neither key is present.
- Given the existing suite (green after P60-M1-012), when run, then it still passes.

**Testing**
- Backend unit: `PipelineSpecJsonExtractorTest`, `PipelinePlanPromptBuilderTest`, `PipelinePlanRequestValidationTest`. Extend `LocalLlmAdapterTest` for `format`/`num_ctx`/`response_format`, and `ChatbotConfigBindingTest` for the new properties.
- Controller: `PipelinePlanControllerTest`, using standalone `MockMvcBuilders` like `ChatbotControllerTest` (no Spring context).
- Command: `mvn -f chatbot-backend/pom.xml test`.

**Dependencies** P60-M1-001 (catalog shape), P60-M1-002 (DTOs), P60-M1-012 (green baseline). Soft dependency: P60-M1-014. DTOs, the extractor, and the controller can start before it; the prompt text and runtime defaults are finalized from its result.
**Priority** P0
**Estimate** 5

**Definition of Done**
- `POST http://localhost:8081/chatbot/pipeline/plan` works under compose, and all tests are green.
- `chatbot-backend/README.md` documents the endpoint with a curl example and the new properties.
- Q&A behaviour is unchanged.

---

### P60-M1-006 — Frontend planning orchestration (`usePipelinePlanner`)

**User story**
As a user typing an analysis goal,
I want the assistant to produce exactly three valid suggestions or tell me clearly why it couldn't,
so that I never see a half-baked or invalid option.

**Rationale**
This is where untrusted output meets the deterministic gate. The hook owns parse → validate → assemble → one bounded retry, so the UI deals with a single typed outcome.

**Implementation scope**
- **Modify** `frontend/src/services/api.ts` to add `requestPipelinePlan(req, { signal })` via `CHATBOT_API.post('/chatbot/pipeline/plan', …)` (`utils/axiosSetup.ts`; base URL `env.CHATBOT_SERVICE_URL`). It reuses `normalizeChatbotError`.
- **New** `frontend/src/components/chatbot/usePipelinePlanner.ts`:
  ```ts
  type PlanOutcome =
    | { status: 'success'; suggestionSetId: string; suggestions: [ValidatedSuggestion, ValidatedSuggestion, ValidatedSuggestion]; attempts: number }
    | { status: 'failure'; suggestionSetId: string;
        reason: 'model_unavailable' | 'invalid_model_output' | 'insufficient_valid_candidates'
              | 'unsupported_goal' | 'request_invalid' | 'catalog_mismatch' | 'timeout' | 'cancelled';
        message: string; attempts: number; rejectedByCode: Record<string, number> };
  ```
  1. Build the catalog and a `suggestionSetId` (UUID). Call attempt 1.
  2. If the echoed `catalogVersion` differs from the local one, return `catalog_mismatch`.
  3. `parsePlannerEnvelope` → `validatePipelineSpec` each → accumulate. The frontend re-parses even though the backend checked the shape.
  4. `assembleCandidateSet`. If `ok`, return success.
  5. If `outcome=UNSUPPORTED_GOAL` and nothing is valid, return `unsupported_goal` without a retry.
  6. Otherwise, if `attempt < MAX_PLAN_ATTEMPTS` (= 2), call again with `excludeCandidates` and `rejectionFeedback`, merge, and go back to step 4.
  7. Otherwise return `insufficient_valid_candidates`, or `invalid_model_output` if nothing ever parsed.
  - **Latency budget:** `PLAN_TOTAL_BUDGET_MS` (default 150000) across all attempts. Past the budget, abort and return `timeout`. HTTP 503 returns `model_unavailable` immediately, with no retry.
  - **Concurrency:** one plan in flight. A new `plan()`, `cancel()`, or unmount aborts it through `AbortController`. Responses with a stale `suggestionSetId` are ignored.
  - The hook **never** touches canvas state.

**Acceptance criteria**
- Given 3 valid distinct candidates, when `plan()` runs, then `success` after 1 attempt.
- Given attempt 1 has 2 valid candidates plus 1 with `ILLEGAL_CONNECTION`, and attempt 2 adds a new valid distinct one, then `success` after 2 attempts. Request 2 carries 2 exclusions and feedback containing `ILLEGAL_CONNECTION`.
- Given both attempts yield fewer than 3 distinct valid candidates, then `insufficient_valid_candidates` with no suggestions exposed.
- Given both attempts are unparseable, then `invalid_model_output`.
- Given 503 or a network error, then `model_unavailable` after exactly 1 call.
- Given `UNSUPPORTED_GOAL`, then `unsupported_goal` after 1 call.
- Given a mismatched `catalogVersion`, then `catalog_mismatch`.
- Given the budget is exceeded (fake timers), then `timeout` and the in-flight request is aborted.
- Given `plan("A")` followed immediately by `plan("B")`, then A is aborted and its late response is ignored.
- Given a backend candidate with `cardType:"VECTOR_GENERATE"`, then it is rejected with `UNKNOWN_CARD_TYPE`; the frontend doesn't trust the backend.

**Testing**
- Hook tests (Jest + RTL v13 `renderHook` from `@testing-library/react`; *confirm 13.4 exports it, otherwise use a small test component*) with `jest.mock("../../services/api", …)`, as in `ChatbotPanel.test.tsx`.
- Fixtures in `planning/__fixtures__/`: `plan-response.valid.json`, `.partial-invalid.json`, `.retry-completion.json`, `.duplicates.json`, `.five-candidates.json`, `.prose.json`, `.unsupported.json`.

**Dependencies** P60-M1-003, P60-M1-004, P60-M1-005. **Checkpoint:** P60-M1-014's decision must be recorded before this story starts, because the retry design assumes the model can produce usable candidates.
**Priority** P0
**Estimate** 5

**Definition of Done**
- The hook and API function are merged with tests green, and `PlanOutcome` is checked exhaustively by consumers (`never` check).
- Constants (`MAX_PLAN_ATTEMPTS`, `PLAN_TOTAL_BUDGET_MS`, size limits) live in one module.

---

### P60-M1-007 — Deterministic layout and atomic empty-canvas applier

**User story**
As a user who selected a suggestion,
I want the pipeline to appear on my empty canvas laid out readably and wired correctly, all at once,
so that I can configure it and start it with the normal **Run** control right away, and undo it in one step.

**Rationale**
`applyTemplate` (`PipelinePage.tsx:595-648`) shows the pattern: fresh IDs, `data: {}`, `status: 'idle'`, `logs: []`, then `setNodes`/`setConnections`/`saveHistory`. Three things found in the code must be handled:

1. **Undo baseline bug.** The history starts as `[{nodes:[],connections:[]}]` (`:107`). It isn't updated when the canvas is restored from `sessionStorage`/`inMemoryPipelineCache` (`:477-498`) or loaded from a session (`handleLoadSession` `:191`), and link creation (`handleLinkClick`) never records history. So `history[historyIndex]` often differs from what's on screen, and a blind `saveHistory(after)` followed by Undo can restore a wrong earlier canvas.
2. **Layout affects meaning.** `SECURITY_REGRESSION` chooses base vs. PR by sorting upstream Formal Verification nodes on **y** (`:1805` onward).
3. **Atomicity.** The app uses `ReactDOM.createRoot` (`index.tsx:32`), so React 18 batches `setNodes` + `setConnections` from one synchronous handler into a single render.

**Implementation scope**
- **New** `planning/pipelineLayout.ts`, `layoutPipelineSpec(spec, origin={x:100,y:200})`:
  - layer = longest path from any input; `x = origin.x + layer*350` (template spacing; collapsed cards are `w-80` = 320px in `PipelineCanvas.tsx`);
  - within a layer, nodes keep their spec order, with `y = origin.y + row*ROW_GAP` (about 300; *verify against rendered card height*);
  - the first-listed upstream `FORMAL_VERIFY` of a `SECURITY_REGRESSION` therefore sits higher, i.e. it is the base.
- **New** `planning/pipelineApplier.ts`, `materializeSuggestion(s: ValidatedSuggestion): { nodes; connections; pendingConfiguration }`:
  - pure; throws `ApplyError` on any problem;
  - re-runs `validatePipelineSpec(s.spec)` against the live config (throws `ApplyError('invalid')`), and checks that `s.catalogVersion` matches the current one (throws `ApplyError('catalog_mismatch')`);
  - IDs come from the same generator as `applyTemplate`, checked for uniqueness within the batch;
  - each node gets `data: {}`, `status: 'idle'`, `logs: []`, and every edge is mapped through key → ID;
  - `pendingConfiguration` comes from `REQUIRED_USER_CONFIG` and `RUNTIME_INTERACTION_HINTS` for the created card types, e.g. `[{cardTitle:'System Source', hint:'Enter a system name and at least one repository'}]`.
- **Modify** `frontend/src/components/pipeline/PipelinePage.tsx` to add `applyPipelineSuggestion(s): ApplyResult`, where `ApplyResult = { ok: true; addedNodeIds; pendingConfiguration } | { ok: false; reason: 'canvas_not_empty' | 'pipeline_running' | 'catalog_mismatch' | 'invalid'; message }`.
  - **Apply invariants (Milestone 1 empty-canvas policy, §3 states A–D):**
    - It reads the page's *current* `nodes` and `isRunning` at call time, and **never** trusts the `canvasIsEmpty` prop the UI rendered with.
    - No setter runs until every check has passed and the full new state has been computed.
    - There is no partial apply: either all new nodes, all new connections, and the history entry are committed together, or nothing is.
    - It never deletes, replaces, merges, or adds next to existing nodes, and never calls `clearPipeline` or `handleSaveSession`.

  Order of operations:
  1. Guards, returning `{ok:false, reason}` with **no** setter called: `nodes.length > 0` → `canvas_not_empty`; `isRunning` → `pipeline_running`.
  2. `materializeSuggestion` inside try/catch. `ApplyError` maps to `{ok:false, reason: 'catalog_mismatch' | 'invalid'}`; no setter has run.
  3. In the same synchronous block: `setNodes(new)`, `setConnections(new)`, and a history push that **first records the current (empty) state if `history[historyIndex]` differs from it, then records the new state**. That way one Undo returns exactly to the pre-apply canvas. Implement this as a small local helper next to `saveHistory`; don't refactor how history works across the app. Then reset the viewport the way `applyTemplate` does (`setScale(1)`, `setOffset({x:0,y:0})`) and show a success toast through `setNotification`.
  4. Return `{ ok: true, addedNodeIds, pendingConfiguration }`.
  - Pass the handler to `<ChatbotPanel … onApplyPipelineSuggestion={applyPipelineSuggestion} canvasIsEmpty={nodes.length === 0} isPipelineRunning={isRunning} />` (`:2032`). The two props drive button state only. The handler re-checks both itself.
  - Leave `applyTemplate` unchanged.

**Acceptance criteria**
- Given an empty canvas and the "Balanced" demo suggestion, when applied, then the canvas holds exactly the spec's card types and counts, and every connection matches a spec edge's source and target types.
- Given the created graph, when each connection is checked against `VALID_CONNECTIONS`, then all pass, and running `validatePipelineSpec` on the canvas converted back to a spec returns `valid` (T14).
- Given an empty canvas, when a suggestion is applied, then all new nodes and connections appear in the same render, and no intermediate render shows nodes without their connections (T12).
- Given `nodes.length > 0`, when apply is called, then `{ok:false, reason:'canvas_not_empty'}`, and nodes, connections, `history`, and `historyIndex` are unchanged.
- Given suggestions generated on an empty canvas, and the user then adds a card before Select, when apply is called (including with a stale `canvasIsEmpty=true` prop), then `canvas_not_empty`, and the canvas holds exactly the user's own card with nothing else changed (T33).
- Given `isRunning`, a re-validation failure, or a `catalogVersion` mismatch, then `{ok:false, reason:'pipeline_running' | 'invalid' | 'catalog_mismatch'}` with no state change.
- Given any apply call, then `clearPipeline`, `handleSaveSession`, and `window.confirm` are never invoked by the applier (T34).
- Given the canvas was emptied from a restored or loaded session (so `history[historyIndex]` is stale), when a suggestion is applied and the user clicks **Undo** once, then the canvas is empty, i.e. exactly the pre-apply state.
- Given a `SECURITY_REGRESSION` suggestion, when laid out, then the first-listed `FORMAL_VERIFY` has a smaller `y` than the second.
- Given an applied pipeline, when the session is saved and reloaded through the existing session controls, then it round-trips like a hand-built one.
- **Execution-path compatibility.** Given an applied pipeline with System Source configured, when the existing **Run** is pressed, then `runPipeline` starts from the new `SYSTEM_INPUT`, the existing `processNextNodes` handles the generated cards, and the first downstream card goes to `running`. No planner-specific execution code is involved. This proves the generated nodes are compatible with the existing Run; it does **not** require every downstream service to succeed (T15; automated in P60-M1-011).

**Testing**
- Unit (Jest): `planning/pipelineLayout.test.ts` (layers, no overlap, spec order kept within a layer, Policy Drift ordering, determinism) and `planning/pipelineApplier.test.ts` (node and edge mapping, ID uniqueness, `pendingConfiguration`, re-validation failure throws, catalog mismatch throws).
- `PipelinePage`-level guard, undo, and atomicity behaviour is covered in P60-M1-011.

**Dependencies** P60-M1-002, P60-M1-003.
**Priority** P0
**Estimate** 5

**Definition of Done**
- The applier is wired into `PipelinePage` with unit tests green.
- Manual check: apply → Undo → Redo → save → reload, and apply after loading and then clearing a session, with no console errors.
- `applyTemplate` behaviour is unchanged.

---

### P60-M1-008 — "Build a pipeline" mode and suggestion cards in the chatbot

**User story**
As a non-expert user,
I want to switch the assistant into "Build a pipeline", describe my goal, compare three clearly explained options, and choose one with a single click,
so that I can get a structurally valid analysis pipeline, ready to configure and run, without learning the card vocabulary.

**Rationale**
`ChatbotPanel`, `useChatbotState`, and `ChatMessage` only handle Q&A answers. Suggestions need their own message kind and interactive cards, and the mode must be explicit so Q&A is never mistaken for a build command.

**Implementation scope**
- **Modify** `frontend/src/components/chatbot/ChatbotPanel.tsx`:
  - New optional props `onApplyPipelineSuggestion?`, `canvasIsEmpty?`, `isPipelineRunning?`, `onOpenTemplateLibrary?`. The panel receives no clear or save callback, so it can't clear or save the canvas.
  - Build mode and generation are available **whether or not the canvas is empty** (Milestone 1 empty-canvas policy, state B). Only applying is gated. The mode toggle renders only when `onApplyPipelineSuggestion` is provided (at baseline the panel is mounted only in `PipelinePage`).
  - Toggle "Ask" | "Build a pipeline" (`data-testid="chatbot-mode-toggle"`), defaulting to "Ask".
  - Build mode works **without** an active analysis context. On an empty canvas, `chatbotContext` is all-undefined, so `useChatbotState` receives `undefined`. That is the normal case here.
  - In build mode, submit calls `usePipelinePlanner.plan(goal)`. While planning, show a progress line ("Designing three pipeline options… local models can take up to a minute") and a **Cancel** button that calls `cancel()`.
- **Modify** `ChatComposer.tsx`: mode-dependent placeholder ("Describe what you want to analyze…"), and Send disabled while a plan is in flight.
- **Modify** `useChatbotState.ts`:
  - Extend `ChatMessageModel` with `kind?: 'answer' | 'pipeline_suggestions' | 'pipeline_status'` and `pipeline?: { suggestionSetId; suggestions; appliedCandidateId?; dismissed? }`.
  - Leave pipeline messages out of `toHistoryMessage` and Q&A history.
  - Known behaviour: messages are cleared when the context ID changes. After applying, as soon as the user fills in *System Source* the context changes and the chat history resets. So the next-step hints also go into the success toast (P60-M1-007), and nothing depends on the chat message surviving.
- **New** `PipelineSuggestionList.tsx` and `PipelineSuggestionCard.tsx`. Each card shows:
  - tier label;
  - `title` and `summary`;
  - "Why this fits" (`rationale`, collapsible);
  - ordered card chips using `CARD_CONFIG[type].title` and its colour classes (never raw enums);
  - card and connection counts;
  - "You'll need to configure: …" from `pendingConfiguration` (computed with a dry-run `materializeSuggestion`);
  - a collapsible **"Checked against pipeline rules ✓"** disclosure listing the passed rule groups (known cards, allowed connections, required inputs, reachable from a source). This lets a demo show rule compliance without dev tools.
  - **Use this pipeline** (`data-testid="pipeline-suggestion-select-{1|2|3}"`, accessible name includes the title). It is enabled only in state A (`canvasIsEmpty && !isPipelineRunning`).
    - **State B (non-empty canvas):** disabled, and the set shows the guidance once (`data-testid="pipeline-suggestions-empty-canvas-notice"`): *"Pipeline suggestions can be added only to an empty canvas in Milestone 1. Save your current session if needed, then use **Clear All** in the toolbar."* The panel doesn't open the Clear All confirmation, save the session, or change the canvas.
    - **State C (running):** disabled, with *"Wait for the current run to finish."*
    - **Transition:** when the props change to state A, for example after the user clicks **Clear All**, the same suggestions become selectable again **without regenerating**. The applier re-validates on click (state D).
  - The list has **Dismiss** (`pipeline-suggestions-dismiss`).
  - All model text is rendered as React text nodes (no `dangerouslySetInnerHTML`).
- Selection flow: click → `onApplyPipelineSuggestion(s)`.
  - On `ok`: mark the set applied (`appliedCandidateId`), disable all Select buttons, show "Added to canvas ✓" on the chosen card, and add a status message with `pendingConfiguration` and "then press **Run**". An applied set stays locked even if the user later Undoes back to an empty canvas. Applying again needs a new request. The "re-enable when empty" rule covers sets that were never applied (state B).
  - On `!ok`: show the reason inline and keep the set selectable unless the reason is `invalid` or `catalog_mismatch`:
    - `canvas_not_empty` → the state B guidance;
    - `pipeline_running` → "Wait for the current run to finish";
    - `invalid` → "This suggestion no longer matches the pipeline rules; please regenerate";
    - `catalog_mismatch` → "The app was updated — please reload the page".
- The component accepts only `ValidatedSuggestion[]` from a `success` outcome. There is no prop or path that renders raw candidates.
- No suggestion is preselected, auto-applied, or emphasised as a default action (D4). Tier labels are informational, and the three Select buttons are visually equal.

**Acceptance criteria**
- Given `ChatbotPanel` without `onApplyPipelineSuggestion`, then no toggle is shown and the existing tests (green after P60-M1-012) pass unchanged.
- Given build mode and a mocked `success`, when a goal is submitted, then exactly 3 cards render, each with a title, summary, tier, `CARD_CONFIG`-title chips, and the rules disclosure.
- Given an empty canvas, when Select is clicked on candidate 1, 2, or 3, then `onApplyPipelineSuggestion` is called once with that candidate's `ValidatedSuggestion` (matched by `candidateId`), and all Select buttons are then disabled.
- Given `canvasIsEmpty=false`, when a goal is submitted, then planning still runs and three suggestions render with all three Select buttons disabled and the state B guidance shown (T24).
- Given that state, when `canvasIsEmpty` flips to `true` (the user clicked **Clear All**), then the same three Select buttons enable, and `requestPipelinePlan` isn't called again (T24).
- Given `isPipelineRunning=true`, then the Select buttons are disabled with the run-in-progress text.
- Given any interaction with the suggestions on a non-empty canvas, then the panel never calls `clearPipeline`, `handleSaveSession`, or `window.confirm`, and never calls `onApplyPipelineSuggestion` from a disabled button (T34).
- Given Dismiss, Cancel during planning, or closing the panel without selecting, then the callback is never called.
- Given the callback returns `{ok:false}`, then the inline reason appears.
- Given "Ask" mode, when the user submits anything, including text like "build me a pipeline", then `sendChatbotQuery` is called, `requestPipelinePlan` isn't, no suggestion cards render, and `onApplyPipelineSuggestion` is never called (D2).

**Testing**
- Component (Jest + RTL): extend `ChatbotPanel.test.tsx` and add `PipelineSuggestionList.test.tsx`, mocking `../../services/api` as the existing tests do. Cover each criterion, including select 1/2/3 (`it.each`) and the disabled/enabled toggle.

**Dependencies** P60-M1-006, P60-M1-007, P60-M1-012. **Checkpoint:** P60-M1-014's decision is recorded (already implied by P60-M1-006).
**Priority** P0
**Estimate** 5

**Definition of Done**
- Build mode works in the browser against mocked and real `chatbot-backend`, with component tests green.
- UI copy has been reviewed for non-expert wording (no raw `CardType` names visible).

---

### P60-M1-009 — Failure handling and canvas-safety guarantees

**User story**
As a user,
I want clear, recoverable messages when the assistant can't produce or apply a pipeline,
so that a model hiccup never breaks my canvas or leaves me stuck.

**Rationale**
Each component reports its own failures. This story owns the user-facing states and the guarantee that applies across all of them: **no failure path changes canvas state**. It reuses `TemplateLibraryModal` as the fallback.

**Implementation scope**
- **Modify** `ChatbotPanel.tsx` and the pipeline message rendering to map each `PlanOutcome.failure.reason`:
  | Reason | Message (draft) | Actions |
  |---|---|---|
  | `model_unavailable` | "The assistant's model isn't reachable right now." | Retry · Browse templates |
  | `timeout` | "That took too long. Local models can be slow — try again or a shorter description." | Retry · Browse templates |
  | `invalid_model_output` | "The assistant couldn't produce a usable pipeline description." | Retry · Browse templates |
  | `insufficient_valid_candidates` | "I couldn't find three valid, different pipelines for that goal. Try describing it differently." | Retry · Browse templates |
  | `unsupported_goal` | `unsupportedReason`, then "AridNova pipelines can:" and the `CATEGORIES` names | Browse templates |
  | `catalog_mismatch` | "The app was updated — please reload the page." | — |
  | `request_invalid` | Validation message (e.g. goal too long) | — |
  | `cancelled` | (no message) | — |
- **Apply-time reasons** (`ApplyResult.reason` from P60-M1-007), shown inline on the suggestion set. `canvas_not_empty` and `pipeline_running` are **normal, recoverable states, not errors**: no error toast, and the suggestions stay available.
  | Reason | Message | What the user does next | Set stays selectable? |
  |---|---|---|---|
  | `canvas_not_empty` | "Pipeline suggestions can be added only to an empty canvas in Milestone 1. Save your current session if needed, then use **Clear All** in the toolbar." | Save if wanted, click **Clear All** themselves, then select again (no regeneration needed) | Yes (enables when the canvas is empty) |
  | `pipeline_running` | "Wait for the current run to finish." | Wait, or stop the run | Yes (enables when the run ends) |
  | `invalid` | "This suggestion no longer matches the pipeline rules; please regenerate." | Regenerate | No |
  | `catalog_mismatch` | "The app was updated — please reload the page." | Reload | No |
- **Modify** `PipelinePage.tsx` to pass `onOpenTemplateLibrary={() => setIsTemplateLibraryOpen(true)}` (modal at `:2006`).
- In build mode, disable Send when `health.status === 'unavailable'` (`/chatbot/health`, already polled by `refreshHealth`), with an explanation. Ask mode is unchanged.
- Closing the panel or navigating away during planning aborts the request (`cancel()` on toggle-close and on unmount).
- **New** test helper `frontend/src/components/pipeline/planning/__testutils__/canvasSnapshot.ts`, `snapshotCanvas()`, used by P60-M1-007, P60-M1-008, and P60-M1-011 tests.

**Acceptance criteria**
- Given each failure reason, then the message and actions in the table render, the input stays editable, and **no** suggestion cards or Select buttons render.
- Given any failure reason or a `{ok:false}` apply, then nodes, connections, `history`, and `historyIndex` are unchanged.
- Given `canvas_not_empty`, then the message tells the user what to do next (save if needed, then **Clear All**), no error toast appears, and nothing is cleared, saved, or opened automatically.
- Given runtime `unavailable`, then Send is disabled in build mode and enabled in Ask mode.
- Given "Browse templates", then `TemplateLibraryModal` opens.
- Given the panel is closed during planning, then the request is aborted and no message is appended later.

**Testing**
- Component (Jest + RTL): one test per reason (`it.each`), plus the abort-on-close test.
- Integration (P60-M1-011): canvas invariance on `model_unavailable`, `insufficient_valid_candidates`, the `canvas_not_empty` apply (T13), and the generation-then-change race (T33).

**Dependencies** P60-M1-006, P60-M1-007, P60-M1-008.
**Priority** P0
**Estimate** 3

**Definition of Done**
- Every failure reason has a rendered state and a test, the invariance helper is used in at least 3 tests, and the demo has been rehearsed with Ollama stopped.

---

### P60-M1-010 — Suggestion telemetry for future preference learning (non-blocking)

**User story**
As the AridNova research team,
I want lightweight, privacy-safe events recording which suggestions were shown, which one was chosen, and whether the resulting pipeline was run,
so that later milestones have data for ranking and preference learning without building any learning now.

**Rationale**
`frontend/src/analytics/posthog.ts` already provides `track()`, a typed `PipelineEvent` catalog, and a no-op when no key is set. This story is P1. **Milestone 1 doesn't depend on it**, and none of the other stories need it.

**Implementation scope**
- **Modify** `analytics/posthog.ts` to add to `PipelineEvent`:
  - `PLAN_REQUESTED`, with `{suggestionSetId, goalLength, canvasEmpty}`;
  - `PLAN_SUGGESTIONS_SHOWN`, with `{suggestionSetId, attempts, latencyMs, candidateIds[3], tiers[3], nodeCounts[3], rejectedByCode, ignoredFieldCount}`;
  - `PLAN_FAILED`, with `{suggestionSetId, reason, attempts, rejectedByCode}`;
  - `PLAN_SUGGESTION_SELECTED`, with `{suggestionSetId, candidateId, position, tier}`;
  - `PLAN_SUGGESTIONS_DISMISSED`, with `{suggestionSetId}`;
  - `PLAN_APPLIED`, with `{suggestionSetId, candidateId, nodeCount}`.
- **Modify** `PipelinePage.tsx` to keep `suggestionOriginRef: Map<nodeId, {suggestionSetId, candidateId}>`, filled on apply. Add `fromSuggestion: {suggestionSetId, candidateId}[]` (sets with at least one node still present) to the existing `RUN_STARTED` and `RUN_COMPLETED` properties. The map is in memory only and lost on a full reload; that is documented.
- Privacy: **never** send goal text or repository data. The "request category" for later analysis is the selected `candidateId`/signature, not the user's words.
- No dashboards, funnels, or storage beyond PostHog.

**Acceptance criteria**
- Given plan → select → apply, then `PLAN_REQUESTED`, `PLAN_SUGGESTIONS_SHOWN`, `PLAN_SUGGESTION_SELECTED`, and `PLAN_APPLIED` fire once each with the same `suggestionSetId`, and the selected and applied events share the same `candidateId`.
- Given a subsequent Run, then `RUN_STARTED.fromSuggestion` contains that pair. After all suggestion nodes are deleted, it is empty.
- Given no PostHog key, then nothing throws.
- Given any payload, then it contains no goal text.

**Testing**
- Unit (Jest), with `track` mocked: event sequence for success, failure, and dismiss, and a privacy assertion on the serialized payloads.

**Dependencies** P60-M1-006, P60-M1-007, P60-M1-008.
**Priority** P1
**Estimate** 2

**Definition of Done**
- The events are defined and fire as specified, with tests green and names and properties documented in `posthog.ts`.

---

### P60-M1-011 — End-to-end integration tests and demo readiness

**User story**
As the team demonstrating Milestone 1,
I want automated tests that cover the whole path from natural-language goal to canvas to the start of the normal Run, plus a measured check against the real local model,
so that we can show the milestone confidently and catch regressions.

**Rationale**
The stories are unit-tested, but the milestone's promise only holds end to end. This story answers *"Is the finished Milestone 1 reliable enough to demonstrate and sign off?"* Two earlier questions are already answered by the time it starts:

- P60-M1-013 settled **how** the end-to-end path can be tested;
- P60-M1-014 settled **which** model and prompt approach is viable.

This story doesn't repeat either investigation.

**Implementation scope**
- **Frontend end-to-end, using the strategy chosen in P60-M1-013:**
  - *Outcome A (expected):* build the test below on `renderPipelinePage()` from `pipeline/__testutils__/`, reusing its mock set.
  - *Outcome B:* implement the single alternative P60-M1-013 recommended and the team approved. That is either a smaller harness plus a scripted manual browser check for T1/T12/T15, or tests against a separately approved extracted layer. Any refactor is its own approved change; this story's estimate is revised as P60-M1-013 records.
- **New** `frontend/src/components/pipeline/planning/PipelinePlanning.integration.test.tsx` (Outcome A):
  - mocks: `requestPipelinePlan` returns `plan-response.partial-invalid.json`, then `plan-response.retry-completion.json`; `getChatbotHealth` reports healthy; `fetchIRFromRepo` resolves a small IR (e.g. `src/data/pipeline_ir.json`);
  - happy path, **starting from an empty canvas**: open chatbot → Build mode → type the demo goal → 3 suggestion cards → Select #2 → canvas cards match the spec by title, and the connection count equals the spec edges → configure System Source through its inputs → click **Run** → `fetchIRFromRepo` is called and Generate Snapshot reaches `completed` → **Undo** (header button) → empty canvas.
    - The Run step checks **execution-path compatibility (T15)** in a small, controlled, mocked environment. It shows that the generated graph enters the existing `runPipeline` / `processNextNodes` path and that the expected first mocked downstream call happens.
    - The test does **not** assert that the other cards of the suggestion complete. Their services are inert mocks, and they may legitimately stop at runtime checks.
    - Integration tests never require every possible candidate pipeline to complete every card;
  - **empty-canvas policy variants:**
    - *non-empty canvas:* apply a template first, then generate; 3 suggestions render, all Select buttons are disabled, the guidance is shown, and a forced apply returns `canvas_not_empty` with `snapshotCanvas()` unchanged (T13, T24);
    - *transition:* from that state, click the toolbar **Clear All** (with `window.confirm` mocked to true), and the same Select buttons enable with no second `requestPipelinePlan` call. Select #1 and apply succeeds (T24);
    - *race:* generate on an empty canvas, add a card from the toolbox, then a forced apply with the stale handler returns `canvas_not_empty`, and the canvas holds only the user's card (T33);
    - *no automatic clear or save:* across all the above, the chatbot never triggered `window.confirm`, `clearPipeline`, or the session-save API (T34);
  - failure variants: `model_unavailable`, `insufficient_valid_candidates`, and Dismiss, each with `snapshotCanvas()` unchanged.
- **New** `chatbot-backend/src/test/java/edu/baylor/ecs/cloudhubs/chatbot/pipeline/PipelinePlanIntegrationTest.java`, using service-level wiring with a stub `LocalLlmClient` (pattern: `ChatbotS12M2IntegrationTest`) plus standalone MockMvc. It asserts the HTTP contract for `OK`, `INVALID_MODEL_OUTPUT`, `UNSUPPORTED_GOAL`, and 503.
- **Contract alignment:** the frontend fixture `plan-response.valid.json` and the backend test resource are identical, and a backend test deserializes it.
- **Final live-model smoke (manual, not automated):** a release-qualification run of the *finished* system, distinct from the early P60-M1-014 feasibility signal.
  - Setup: `docker compose --profile local-llm up --build`, then `docker exec cloudhub_ollama ollama pull <model>`. Use the model selected by P60-M1-014 (`llama3.2` unless it chose otherwise). Ollama runs only under the `local-llm` profile, and nothing pulls the model automatically.
  - Run goals G1–G5 (as defined in P60-M1-014, for comparability) **5 times each, 25 runs**, through the real `POST /chatbot/pipeline/plan` plus the P60-M1-006 parse → validate → assemble → retry logic. The P60-M1-014 harness may be re-pointed at the endpoint for this; don't build a new one.
  - Record the **planning success rate** (exactly 3 structurally valid, distinct suggestions), mean attempts, p50/p95 total planning time, and top rejection codes in the PR, and compare them with the P60-M1-014 baseline. Pipeline execution isn't part of this metric.
  - **Demo gate:** at least 70% planning success and p95 total planning time under 150 s (`PLAN_TOTAL_BUDGET_MS`) on the demo machine. If the gate isn't met, tune the prompt and examples within P60-M1-005's settings, or escalate the model choice (*team decision*).
- **Docs:** add a "Chatbot-assisted pipeline creation" paragraph to `CLAUDE.md`'s pipeline section, list `chatbot-backend` (8081) in its services table (currently missing), and add the Ollama profile and model-pull steps.

**Acceptance criteria**
- Given `CI=true npm test -- --watchAll=false PipelinePlanning`, then the integration test passes, covering goal → exactly 3 validated suggestions → select → canvas → Run enters the existing execution path (first mocked downstream call observed) → Undo. Under P60-M1-013 Outcome B, the approved alternative passes and the manual check is recorded in the PR.
- Given `mvn -f chatbot-backend/pom.xml test`, then the backend integration test passes.
- Given the failure variants and the rejected policy variants, then the canvas snapshots are unchanged, apart from the card the user added in the race variant.
- Given the policy variants, then successful application happens only on an empty canvas, Select is disabled on a non-empty canvas, and no test expects append, merge, or edit behaviour.
- Given the smoke run, then results are recorded and the demo gate decision is noted.

**Testing** This story is the end-to-end test work.

**Dependencies** P60-M1-001 … P60-M1-009, P60-M1-012, P60-M1-013 (test strategy and harness), and P60-M1-014 (selected model, harness, and baseline). P60-M1-010 is optional (telemetry assertions).
**Priority** P0
**Estimate** 3 (down from 5, because the spike moved to P60-M1-013). Remaining work: the integration test on the existing harness, the backend integration test, contract alignment, a 25-run smoke on the existing harness, docs, and rehearsal. Under P60-M1-013 Outcome B, use the estimate recorded there.

**Definition of Done**
- Both suites are green locally (no CI exists), the smoke results are in the PR, the §9 demo has been rehearsed once end to end with its known-good demo fixture, and `CLAUDE.md` is updated.

---

## 6. Story Dependency Map

| Story | Title | Pri | Pts | Depends on | Unlocks |
|---|---|---|---|---|---|
| Story | Title | Pri | Pts | Depends on | Unlocks |
|---|---|---|---|---|---|
| P60-M1-012 | Restore green chatbot test baseline | P0 | 3 | — | 005, 008, 011 |
| P60-M1-013 | PipelinePage integration-test feasibility spike | P0 | 2 | — | 011 (test strategy) |
| P60-M1-001 | Capability catalog, input requirements, required config | P0 | 3 | — | 002, 003, 005, 014 |
| P60-M1-014 | Local-model pipeline-planning feasibility spike | P0 | 3 | 001 | checkpoint for 006/008; 005 defaults; 011 baseline |
| P60-M1-002 | `PipelineSpec` v1 and parser | P0 | 3 | 001 | 003, 004, 005, 007 |
| P60-M1-003 | Deterministic validator and candidate IDs | P0 | 5 | 001, 002 | 004, 006, 007 |
| P60-M1-004 | Candidate set: dedupe, diversity, exactly 3 | P0 | 3 | 002, 003 | 006 |
| P60-M1-005 | Backend planning endpoint | P0 | 5 | 001, 002, 012; soft: 014 | 006 |
| P60-M1-006 | Frontend planning orchestration | P0 | 5 | 003, 004, 005; checkpoint: 014 | 008, 009, 010 |
| P60-M1-007 | Layout and atomic empty-canvas applier | P0 | 5 | 002, 003 | 008, 009, 010 |
| P60-M1-008 | Chatbot build mode and suggestion UI | P0 | 5 | 006, 007, 012; checkpoint: 014 | 009, 010, 011 |
| P60-M1-009 | Failure handling and canvas safety | P0 | 3 | 006, 007, 008 | 011 |
| P60-M1-010 | Suggestion telemetry (non-blocking) | P1 | 2 | 006, 007, 008 | (Milestone 2) |
| P60-M1-011 | End-to-end tests and demo readiness | P0 | 3 | 001–009, 012, 013, 014 | Milestone 1 sign-off |

How to read the dependency column:

- "soft" means work can start, but defaults are finalized from the named story.
- "checkpoint" means the named spike's decision must be recorded before the story starts. It isn't a code dependency.

Summary:

- No cycles. No story is larger than 5 points.
- **Total: 14 stories, 50 points.** P0: 13 stories / 48 pts; P1: 1 story / 2 pts; P2: none.
- **Critical path (unchanged chain; 30 pts, down from 32 because P60-M1-011 is now 3):** 001 → 002 → 003 → 004 → 006 → 008 → 009 → 011.
  - P60-M1-014 is not on it: 001 → 014 takes 6 pts to reach 006, while 001 → 002 → 003 → 004 takes 14.
  - P60-M1-013 is not on it: it only has to finish before 011.
- **Parallel tracks:**
  - 012 and 013 in the first days, with no dependencies (013 is a one-day timebox);
  - 014 right after 001, alongside 002/003 (two-day timebox);
  - 005 after 002 (DTOs, extractor, and controller first; prompt and defaults once 014 reports);
  - 007 after 003, alongside 004/006;
  - 010 after 008, off the critical path.
- **Vertical slice:** first clear the Early Risk-Reduction Checkpoint below. Then take one pass through 002 → 003 → 005 → 006 → 007 → 008, with 004 implemented only as dedupe plus exactly-3. Then harden with full diversity (004), failure states (009), and E2E (011). Every story ships its own tests, so no testing is left disconnected at the end.

### Early Risk-Reduction Checkpoint

This is a checkpoint, not a milestone. Before investing in the planning orchestration (P60-M1-006) and the polished suggestion UX (P60-M1-008), and before fixing any demo assumptions, the team should have:

1. **Green existing chatbot tests** (P60-M1-012).
2. **A decided end-to-end testing strategy:** Outcome A or B recorded (P60-M1-013).
3. **The real pipeline capability catalog available** (P60-M1-001).
4. **Evidence that the local model and prompt approach is viable:** decision A, B, or C recorded with measurements (P60-M1-014). Decision D stops the main build for replanning.

Work that doesn't depend on the model or the test strategy (002, 003, 004, 007, and 005's DTOs, extractor, and controller) may continue while the checkpoint is open. In the expected schedule, all four items close at roughly the same point that 002/003 finish, so the checkpoint adds review time rather than calendar time.

## 7. Milestone Acceptance Criteria

Milestone 1 is complete only when all of the following are true:

1. On `/pipeline`, the user opens the AI Assistant, switches to "Build a pipeline", and describes an analysis goal in natural language.
2. The system shows **exactly three** suggestions, all **structurally valid** (they pass `validatePipelineSpec` against the live `VALID_CONNECTIONS` and `CARD_INPUT_REQUIREMENTS`) and **meaningfully distinct** (different analysis-card sets), each with a deterministic `candidateId`. Otherwise it shows a clear failure state with **no** selectable suggestions.
3. No invalid pipeline can be rendered as selectable or applied. Only `ValidatedSuggestion` renders, and the applier re-validates.
4. Nothing changes on the canvas until the user explicitly clicks **Use this pipeline**. The **Milestone 1 empty-canvas policy** (§3) holds:
   1. A generated suggestion can only be applied to an empty pipeline canvas.
   2. Nothing on the current canvas is ever automatically removed, replaced, cleared, saved, merged, or extended by the chatbot. Automatic clearing is **not** a success criterion.
   3. A non-empty canvas prevents application but does **not** prevent generating and inspecting suggestions.
   4. The applier re-checks canvas emptiness (and `!isRunning`, `catalogVersion`, validity) immediately before any change.
   5. If the canvas isn't empty, all canvas state (nodes, connections, `history`, `historyIndex`) stays unchanged.
   6. Editing, appending to, or merging with an existing pipeline is deferred to Milestone 2+.
5. The selected pipeline's cards and connections appear together in one render. The result passes the current connection rules, and one **Undo** returns to the empty canvas.
6. **Operationally runnable.** Once the required user configuration and runtime prerequisites are available, the generated pipeline can enter the existing Run → `runPipeline` → `processNextNodes` execution flow without a planner-specific execution path. It also saves and loads through the existing sessions.
   - **Milestone 1 guarantees structural validity, not successful completion of every analysis under every runtime or environment condition.** A run that stops because configuration, source data, a service, or a model is missing, or that reports analysis findings, is runtime behaviour, not a Milestone 1 failure.
7. No failure, whether model unavailable, timeout, malformed output, too few valid candidates, unsupported goal, non-empty canvas, run in progress, re-validation failure, or cancellation, changes nodes, connections, or undo history.
8. All automated tests pass locally: `CI=true npm test -- --watchAll=false` in `frontend/`, and `mvn -f chatbot-backend/pom.xml test`. That includes the pre-existing suites restored by P60-M1-012. The live-model smoke results are recorded.

These criteria don't require P60-M1-010 (telemetry, P1). If the team defers it, Milestone 1 can still be signed off; if it's implemented, its tests (T28) are part of criterion 8. Frozen product decisions D1–D10 are listed in §0.

## 8. Test Matrix

Frontend tests use Jest + React Testing Library 13 via `react-scripts test`, with `jest.mock("../../services/api")` as in `ChatbotPanel.test.tsx`. Backend tests use JUnit 5 + AssertJ with standalone `MockMvcBuilders`, as in `ChatbotControllerTest`. Frontend paths below are relative to `frontend/src/components/`.

**Required coverage (T1–T15):**

| Test ID | Scenario | Level / file | Expected result | Stories |
|---|---|---|---|---|
| T1 | Happy-path natural-language request | Integration: `pipeline/planning/PipelinePlanning.integration.test.tsx` | 3 validated suggestions render from the demo goal | 006, 008, 011 |
| T2 | Model returns malformed structured output (prose, truncated, fenced, non-object candidates) | Unit (BE): `PipelineSpecJsonExtractorTest`; Hook (FE): `usePipelinePlanner.test.ts` | BE `INVALID_MODEL_OUTPUT`, never throws; FE retries once, then `invalid_model_output` | 002, 005, 006 |
| T3 | Unknown card type (`VECTOR_GENERATE`) | Unit: `pipelineValidator.test.ts`; Hook | `UNKNOWN_CARD_TYPE`; rejected even after passing the BE shape check | 003, 006 |
| T4 | Invalid edge (full 17×17 matrix; `SYSTEM_INPUT→FORMAL_VERIFY`) | Unit: `pipelineValidator.test.ts` | `ILLEGAL_CONNECTION` exactly where `VALID_CONNECTIONS` forbids | 003 |
| T5 | Missing required predecessor/input (no input; orphan; Quick Compare without Scenario Generation; Policy Drift with ≠2 FVs; Scenario Generation without Component Card) | Unit: `pipelineValidator.test.ts` | `MISSING_INPUT` / `MISSING_UPSTREAM` / `UNREACHABLE_NODE` / `INPUT_REQUIREMENT_UNMET` | 001, 003 |
| T6 | Only 1 or 2 valid candidates generated | Unit: `candidateSet.test.ts`; Hook | `INSUFFICIENT_DISTINCT`; one retry; then `insufficient_valid_candidates`, nothing selectable | 004, 006, 009 |
| T7 | More than 3 candidates generated (4, 5, and 7 from the model) | Unit (BE) cap at 5; Unit (FE): `candidateSet.test.ts` | Exactly 3, chosen deterministically | 004, 005 |
| T8 | Duplicate or equivalent candidates (same graph with different text; differs only by an extra holder card) | Unit: `candidateSet.test.ts`, `pipelineValidator.test.ts` | Same `candidateId` / same analysis set → counted once | 003, 004 |
| T9 | Model or runtime unavailable (503, network error, health `unavailable`, timeout) | Controller (BE): `PipelinePlanControllerTest`; Hook; Component: `ChatbotPanel.test.tsx` | 503 → `model_unavailable` after 1 call; Send disabled in build mode; `timeout` past budget | 005, 006, 009 |
| T10 | User selects candidate 1 / 2 / 3 on an empty canvas (state A) | Component: `chatbot/PipelineSuggestionList.test.tsx` (`it.each`) | Select enabled; callback called once with the matching `candidateId`; all Select buttons then disabled | 008 |
| T11 | User closes, cancels, or dismisses without selecting | Component; Integration | Callback never called; canvas snapshot unchanged; in-flight request aborted | 008, 009, 011 |
| T12 | Canvas application succeeds on an empty canvas | Unit: `pipelineApplier.test.ts`; Integration | Cards and connections match the spec; committed together in one render; one Undo → empty canvas | 007, 011 |
| T13 | Application rejected leaves canvas unchanged: non-empty canvas (`canvas_not_empty`), `isRunning` (`pipeline_running`), re-validation failure (`invalid`), catalog mismatch (`catalog_mismatch`) | Unit: `pipelineApplier.test.ts`; Integration: `PipelinePlanning.integration.test.tsx` | Typed `{ok:false, reason}`; nodes, connections, `history`, and `historyIndex` unchanged (`snapshotCanvas()`); no error toast for `canvas_not_empty` | 007, 009, 011 |
| T14 | Created pipeline is **structurally valid** (passes existing connection rules) | Unit + Integration | Every created connection satisfies `VALID_CONNECTIONS`, and the canvas round-trips through `validatePipelineSpec` as valid | 003, 007, 011 |
| T15 | Generated pipeline is **compatible with the existing execution path** | Integration in a controlled, mocked environment, using the strategy chosen in P60-M1-013 (Outcome A: `PipelinePlanning.integration.test.tsx`; Outcome B: approved harness plus scripted manual check) | Configure the required input (System Source) → press the existing **Run** → `runPipeline` starts from the generated input card → the expected mocked downstream call (`fetchIRFromRepo`) happens and Generate Snapshot reaches `completed` → no planner-specific execution path used. It does **not** require every card of every suggestion to complete | 007, 011, 013 |

**Additional coverage:**

| Test ID | Scenario | Level / file | Expected result | Stories |
|---|---|---|---|---|
| T16 | Baseline suites green before changes | Existing `ChatbotPanel.test.tsx`; `mvn test` | 16/16 FE and 110/110 BE pass | 012 |
| T17 | Catalog parity, serializability, stable version | Unit: `pipelineCapabilities.test.ts` | 17 cards; `allowedTargets` equals `VALID_CONNECTIONS` | 001 |
| T18 | All 7 `PIPELINE_TEMPLATES` validate | Unit: `pipelineValidator.test.ts` | All valid | 001, 003 |
| T19 | Parser strips `data`/`x`/`id`/`config` and reports `ignoredFields`; never throws | Unit: `pipelineSpec.test.ts` | Whitelisted spec only | 002 |
| T20 | Prompt built only from catalog (`FOO_CARD`); Ollama payload has `format:"json"` and `num_ctx` only when requested | Unit (BE): `PipelinePlanPromptBuilderTest`, `LocalLlmAdapterTest` | As stated; Q&A payload unchanged | 005 |
| T21 | Retry carries exclusions and rejection codes; superseded request ignored | Hook | Request 2 body asserted; stale response dropped | 006 |
| T22 | Policy Drift layout: base FV above PR FV | Unit: `pipelineLayout.test.ts` | FV#1.y < FV#2.y | 007 |
| T23 | Undo after apply on a restored or loaded-then-cleared canvas (stale history) | Integration | Undo → empty canvas, not an earlier graph | 007, 011 |
| T24 | Non-empty canvas, then manual **Clear All** | Component: `chatbot/PipelineSuggestionList.test.tsx`, `ChatbotPanel.test.tsx`; Integration | (a) With `canvasIsEmpty=false`, generation still runs and 3 suggestions render; (b) all three Select buttons disabled and the empty-canvas guidance shown; (c) after the user's **Clear All**, the same buttons enable with **no** new `requestPipelinePlan` call; (d) Select then succeeds (re-validated on click); (e) with `isPipelineRunning=true`, buttons disabled with the run-in-progress text | 008, 011 |
| T25 | Each failure reason renders its message and actions | Component (`it.each`) | Per the P60-M1-009 table; no Select buttons | 009 |
| T26 | Unsupported goal | Hook + Component | `unsupported_goal` after 1 call; capability list shown | 005, 006, 009 |
| T27 | Ask mode unaffected | Component | `sendChatbotQuery` called; no planning call | 008 |
| T28 | Telemetry sequence and privacy | Unit (`track` mocked) | 4 events, shared `suggestionSetId`/`candidateId`; no goal text | 010 |
| T29 | Backend HTTP contract | Integration (BE): `PipelinePlanIntegrationTest` | `OK` / `INVALID_MODEL_OUTPUT` / `UNSUPPORTED_GOAL` / 503 | 005, 011 |
| T30 | **Final** live-model smoke on the finished system, G1–G5 × 5 runs through the real endpoint | Manual (re-pointed P60-M1-014 harness) | Planning success rate (3 structurally valid, distinct suggestions; execution not measured), attempts, and p50/p95 total planning time recorded and compared with the T32 baseline; demo gate (≥70%, p95 < 150 s) decided | 011 |
| T33 | Canvas changed between generation and selection (race) | Unit: `pipelineApplier.test.ts` (handler with live state) and Integration | Suggestions generated on an empty canvas → user adds a card → apply (even with a stale `canvasIsEmpty=true`) returns `canvas_not_empty`; canvas holds exactly the user's card; `history`/`historyIndex` reflect only the user's action | 007, 011 |
| T34 | Milestone 2 boundary: no automatic clear, save, append, or merge | Component and Integration (spies on `window.confirm`, `clearPipeline` path, and session-save API) | Across all suggestion interactions on empty and non-empty canvases, the chatbot never opens the Clear All confirmation, clears, saves, or adds next to existing nodes. No Milestone 1 test expects chatbot append, merge, or edit behaviour | 007, 008, 011 |

**Risk-reduction spikes** (results inform the plan; not Milestone 1 acceptance criteria):

| Test ID | Scenario | Level / file | Expected result | Stories |
|---|---|---|---|---|
| T31 | PipelinePage testability spike | Proof test: `pipeline/PipelinePage.harness.test.tsx` + `pipeline/__testutils__/renderPipelinePage.tsx` | Probes 1–4 pass with module-level mocks only (Outcome A), or blockers are recorded with file:line and one recommendation (Outcome B); within one working day | 013 |
| T32 | Early local-model feasibility | Live harness, skipped by default: `pipeline/planning/__spike__/localModelFeasibility.live.test.ts` (`RUN_LIVE_LLM=1`) | 17 main runs, the JSON-mode-off control, and the G1 retry probe recorded, with syntax and semantic failures kept separate; early thresholds evaluated; decision A/B/C/D recorded | 014 |

## 9. Suggested Demonstration Script

About 4 minutes. **Prerequisites:**

- `docker compose --profile local-llm up --build`;
- `docker exec cloudhub_ollama ollama pull llama3.2`, or the reference model selected by P60-M1-014 and confirmed at the P60-M1-011 demo gate;
- a warm-up plan request run once beforehand, so the model is loaded;
- the browser on `http://localhost:3000/pipeline` with an **empty** pipeline canvas (the presenter clears it beforehand with **Clear All** if needed).

1. **(0:00) Pipeline screen.** "Building a pipeline today means knowing 17 card types and which ones may connect." Show the empty canvas and the toolbox.
2. **(0:15) Open chatbot.** Click the assistant button, then switch to **Build a pipeline**.
3. **(0:25) Type the goal.** Enter *"I want to visualize the architecture and check authorization problems."* and press Send. The progress line appears.
4. **(0:30–1:30) Three choices.** Walk through Focused, Balanced, and Comprehensive: plain-language card names, "Why this fits", and what each needs to be configured.
5. **(1:45) Rule compliance.** Expand **"Checked against pipeline rules ✓"** on one card. "Every option was checked by code against the same connection rules the canvas uses. Anything the model got wrong was dropped before you saw it."
6. **(2:00) Select.** Click **Use this pipeline** on Balanced. The cards and connections appear together. Click a card's link button to show that the canvas's own valid-target highlighting agrees with the created connections. Click the header **Undo** to show the whole addition reverts in one step, then **Redo**. Use the header buttons: keyboard Ctrl/Cmd+Z is ignored while focus is in the chat textarea.
7. **(2:45, optional) Run normally.** Following the hint, enter the system name and the known-good demo repository in System Source, then press the existing **Run**. Watch Generate Snapshot → IR Card progress. "Execution is unchanged; the assistant constructed the graph, and the existing runtime executes it." The repository and running services are a **demo fixture**: they show this environment executing, not that every pipeline completes in every environment.
8. **(3:30, optional) Failure safety.** Run `docker stop cloudhub_ollama`, ask again, and show "model isn't reachable" with **Browse templates**. The canvas is untouched.
9. **(3:50) Close.** "Next milestone: editing an existing pipeline through chat."

**Optional add-on: the empty-canvas policy (about 1 minute; not part of the timed main flow).** Use this only if the audience asks what happens to existing work.

1. Start with a graph already on the canvas, for example by applying a template from the Template Library.
2. In **Build a pipeline**, ask for suggestions. Three suggestions are still generated and can be inspected.
3. Point out that every **Use this pipeline** button is disabled, with the notice: "Pipeline suggestions can be added only to an empty canvas in Milestone 1. Save your current session if needed, then use Clear All in the toolbar." The assistant changed nothing.
4. Click the toolbar **Clear All** yourself and confirm the browser dialog.
5. The **same** suggestions become selectable without regenerating. Select one, and it is applied to the empty pipeline canvas.

## 10. Explicitly Deferred to Milestone 2+

**Non-empty-canvas semantics** are deliberately not designed here; the Milestone 1 empty-canvas policy (§3) is the boundary. Deferred:

- Adding generated cards to an existing pipeline (append).
- Merging generated and existing graphs.
- Modifying or rewiring existing nodes, i.e. **editing the current pipeline through chat**.
- Preserving existing configured card state (repositories, results, selections) while editing.
- A graph-diff or patch representation (for example a patch form of `PipelineSpec`).
- Collision and conflict handling between generated and existing cards.
- Deciding whether separate graph regions on the canvas count as separate pipelines. Today `runPipeline` runs every input node on the canvas.
- Pipeline boundary and identity semantics. Today `NodeData`/`Connection` form one flat graph, and `chatbotContext` takes the first node of each type.
- Keeping layout stable while editing.
- Intelligent replacement or deletion of existing cards, and any chatbot-initiated clear.
- Undo/redo semantics for graph patches, beyond the Milestone 1 single-step undo of an apply.
- **Model-filled configuration** (repository URLs, system names, LLM choice, target URLs) and a `config` section in `PipelineSpec`.
- **Deterministic auto-repair** of nearly valid candidates.
- **Showing partial result sets** (1–2 valid suggestions) instead of a failure.
- **Preference ranking**, personalized defaults, preference-weight updates, and **learning from selections**, including SLM or model fine-tuning on the P60-M1-010 data.
- **Auto-run** after selection, or chat-triggered execution.
- **More advanced agentic planning:** multi-turn clarification ("which repo?"), tool use against IR or history, and planning that uses evidence context.
- Long-term personalization, memory across sessions, and sophisticated analytics.
- A server-side copy of the validator, if a non-browser client ever needs validated plans.
- CI for the frontend and chatbot-backend suites, and fixing the existing `ChatbotFlag` casing mismatch between Java (UPPERCASE) and TypeScript (lowercase).

## 11. Revision History

**Revision 2: implementation-readiness audit.** Re-inspected `PipelinePage.tsx`, `PipelineCanvas.tsx`, `PiplelineHeader.tsx`, `pipelineConfig.tsx`, `models.tsx`, `PipelineTemplates.tsx`, the chatbot frontend and backend, `docker-compose.yaml`, `index.tsx`, and the card components, and ran both test suites.

| # | Finding in code | Change to this plan |
|---|---|---|
| 1 | `ChatbotPanel.test.tsx`: 9/16 failing on stale selectors; `chatbot-backend`: 1/110 failing (`conv-2` isn't a UUID) | **Added P60-M1-012** (3 pts). 005, 008, and 011 depend on it |
| 2 | `runPipeline` runs every input node on the canvas; `chatbotContext` uses the first node of each type | **Empty-canvas-only apply** for Milestone 1; append moved to Milestone 2; §3 Canvas policy added |
| 3 | Undo history starts empty and isn't synced on restore or session load; link creation doesn't record history | P60-M1-007: pre-apply snapshot before the post-apply state; test T23 |
| 4 | `createRoot` means React 18 automatic batching | P60-M1-007 defines atomic apply: pure materialization, then setters in one synchronous handler |
| 5 | No deterministic candidate identifiers | `candidateId` from the canonical signature (P60-M1-003); used by selection (008) and telemetry (010) |
| 6 | "Required configuration" was only vague setup hints | `REQUIRED_USER_CONFIG` mirrors the actual `runPipeline` checks; parser reports `ignoredFields`; applier returns `pendingConfiguration` |
| 7 | Ollama adapter sends only `temperature`/`num_predict`; the default context window may truncate the catalog prompt | P60-M1-005 adds `num_ctx`, JSON mode, and planning timeout and token settings |
| 8 | Java `ChatbotFlag` serializes UPPERCASE vs frontend lowercase | Planning response uses its own `outcome` enum and doesn't touch `ChatbotFlag` |
| 9 | Ollama runs only under the `local-llm` compose profile, and the model isn't pulled automatically | Prerequisites added to §9 and P60-M1-011 |
| 10 | Up to 2 calls with a 240 s default timeout don't fit a 2–5 minute demo | `PLAN_TOTAL_BUDGET_MS`, a `timeout` outcome, a progress line with Cancel, and the p95 demo gate |
| 11 | `PipelinePage` is 2,046 lines with ESM-heavy imports, and there's no existing page test | P60-M1-011 starts with a timeboxed spike and a documented fallback; estimate 3 → 5. *Superseded in Revision 3:* spike moved to P60-M1-013, and the ESM claim was corrected |
| 12 | Keyboard undo is ignored when focus is in the chat textarea | Demo uses the header Undo button |
| 13 | No CI workflows | "Tests pass" is defined as local commands; CI deferred |
| 14 | Test matrix didn't map 1:1 to the required T1–T15 | §8 restructured with T1–T15 plus T16–T30, with file names |
| 15 | Demo needed visible proof of rule compliance | "Checked against pipeline rules ✓" disclosure added to P60-M1-008 |

**Revision 3: early risk-reduction spikes.** Two risks were discovered too late in the plan, so they were moved earlier. No other stories were redesigned, and existing IDs and T1–T30 are unchanged.

| # | Change | Effect |
|---|---|---|
| 1 | **Added P60-M1-013**, PipelinePage integration-test feasibility spike (P0, 2 pts, no dependencies, ≤1 day), extracted from P60-M1-011 | Testing strategy (Outcome A/B) is decided at the start; P60-M1-011 builds on it instead of discovering it |
| 2 | **Added P60-M1-014**, local-model pipeline-planning feasibility spike (P0, 3 pts, depends on 001, ≤2 days), with early thresholds and decision A–D | Model and prompt viability is known before 006/008; 005 starts from a measured prompt and settings |
| 3 | P60-M1-011 lost its spike; estimate 5 → 3; depends on 013 and 014; smoke now uses G1–G5 from 014 and re-points the 014 harness | Final smoke stays as release qualification; no duplicate investigation |
| 4 | Added the §6 "Early Risk-Reduction Checkpoint" (012, 013, 001, 014) as a gate for 006/008, not a code dependency | Critical path chain unchanged, now 30 pts |
| 5 | **Fixed inconsistency:** P60-M1-005's per-call timeout default of 90 s × 2 attempts = 180 s exceeded P60-M1-006's 150 s total budget | Default changed to 75 s; all planning defaults marked provisional pending 014 |
| 6 | **Corrected Revision 2 finding #11:** `react-joyride` 3.1.0 and `posthog-js` ship CommonJS; the ESM-only `react-force-graph` isn't imported under `components/pipeline/` | P60-M1-013's rationale now targets page size and mount-time side effects as the main risk |
| 7 | Aligned the smoke goals: Revision 2's P60-M1-011 goal wording differed from the spike goals | 011 and 014 share G1–G5, so results can be compared |
| 8 | Added T31 and T32 as spike results in a separate table in §8 | Not milestone acceptance criteria |

Totals: 14 stories, 50 points. P0: 13 stories / 48 pts; P1: 1 / 2; P2: 0.

**Revision 4: empty-canvas policy approved.** The Milestone 1 empty-canvas-only application policy is formally approved. Pipeline suggestions may be generated on a non-empty canvas, but applying one requires an empty canvas. Automatic clearing, append, merge, and editing remain deferred to Milestone 2+.

The reasons come from the repository:

- `runPipeline` runs every input node on the canvas (`PipelinePage.tsx:1039`/`:1072`);
- `chatbotContext` uses the first node of each type (`:672`);
- the canvas has no pipeline boundary or identity;
- adding next to an existing graph brings in editing-level execution, context, undo, conflict, and layout questions;
- undo history isn't synced on restore or session load (`:107`).

No estimates, dependencies, or story counts changed.

| # | Change |
|---|---|
| 1 | §3 "Canvas policy" replaced by **"Milestone 1 empty-canvas policy (approved)"**, with the definition of "new pipeline", the rationale, and states A (empty), B (non-empty), C (running), D (changed between generation and selection) |
| 2 | §1 objective now refers to applying the suggestion to the empty pipeline canvas and points to the §3 definition; In Scope and Out of Scope wording aligned |
| 3 | P60-M1-007: explicit apply invariants (live state, never the prop; no mutation before all checks pass; no partial apply; never clears or saves); typed `ApplyResult` reasons including `catalog_mismatch`; `isPipelineRunning` prop; new criteria for the atomic commit, the race (T33), and no clear or save (T34) |
| 4 | P60-M1-008: generation allowed on a non-empty canvas; Select enabled only in state A; exact guidance text; re-enable after **Clear All** without regenerating; running-state text; no clear or save callback passed to the panel |
| 5 | P60-M1-009: apply-time reasons table; `canvas_not_empty` and `pipeline_running` treated as normal, recoverable states with next steps |
| 6 | P60-M1-011: happy path starts from an empty canvas; policy variants added (non-empty, transition, race, no automatic clear or save) |
| 7 | §7 criterion 4 expanded into six policy criteria; automatic clearing explicitly not a success criterion |
| 8 | §8: T10, T12, T13, and T24 tightened; **T33** (race) and **T34** (Milestone 2 boundary) added; no IDs renumbered |
| 9 | §9: optional, untimed policy demo added; main flow unchanged and starts from an empty canvas |
| 10 | §10: non-empty-canvas semantics listed item by item as Milestone 2+ |
| 11 | Terminology: the toolbar button is labelled **"Clear All"** in `PiplelineHeader.tsx` (shown only when nodes exist; disabled while running), so guidance text uses that label |
| 12 | Unresolved decision #1 (empty-canvas policy) removed; the remaining items renumbered |

**Revision 5: structural validity vs operational runnability.** This revision clarifies wording and tests only. No stories, points, or dependencies changed.

- The planner guarantees **graph correctness** (structurally valid).
- It guarantees that a generated pipeline enters the **existing** Run path once its prerequisites are met (operationally runnable).
- Completing a run still depends on user configuration, source data, and available services and models. That isn't a universal Milestone 1 guarantee.

| # | Change |
|---|---|
| 1 | §4: added the three-row terminology table (structurally valid / operationally runnable / successful execution) and the split of responsibilities: the validator owns structural correctness; the existing runtime owns configuration checks, service availability, project-specific execution, and card-level failures. `REQUIRED_USER_CONFIG` and `RUNTIME_INTERACTION_HINTS` are labelled guidance, not proof of success |
| 2 | §1 objective, §2 demo step 5, and the §3 In Scope "Validation vs execution" note now state structural validity as the guarantee; the demo's known-good repository is a fixture, not a universal guarantee |
| 3 | P60-M1-001 rationale and P60-M1-003 boundary: the validator is structural only (no service, repository, or model checks, card execution, or success prediction) |
| 4 | P60-M1-007: the Run criterion is relabelled **execution-path compatibility**; P60-M1-008 user story now says "structurally valid … ready to configure and run" |
| 5 | P60-M1-011: integration Run check scoped to a controlled, mocked first downstream call; "end-to-end success rate" renamed **planning success rate** (it never measured execution) |
| 6 | §7 criterion 6 now reads "operationally runnable … without a planner-specific execution path", plus the explicit statement that Milestone 1 guarantees structural validity, not successful completion. Criterion 2 now says "structurally valid" |
| 7 | §8: T14 labelled the structural-validity test; **T15 renamed** "Generated pipeline is compatible with the existing execution path" (no longer implies universal downstream success); T30 wording aligned to planning success |
| 8 | §9 step 7: "the assistant constructed the graph, and the existing runtime executes it"; the demo repository and services are labelled a demo fixture |

**Revision 6: product decisions frozen before implementation.** Product-scope decisions were frozen in the new §0. No stories, points, dependencies, or critical path changed.

Frozen:

- D1: empty-canvas-only application (approved in Revision 4);
- D2: explicit Build mode, so Q&A never changes the canvas;
- D3: exactly three structurally valid, distinct suggestions, otherwise a typed failure;
- D4: explicit user selection, with no auto-apply or preselection;
- D5: no auto-run;
- D6: no model-filled runtime configuration;
- D7: the deterministic validator stays authoritative;
- D8: the structural-validity scope from Revision 5;
- D9: telemetry is non-blocking, and preference learning is out of scope;
- D10: the disposition policy for stale tests.

Still risk-gated: the reference model (R1, decided by P60-M1-014) and the E2E strategy (R2, decided by P60-M1-013, with no testing-only refactor of `PipelinePage` without explicit approval). llama.cpp JSON support is non-blocking (R3).

| # | Change |
|---|---|
| 1 | Added §0 "Product Decisions Frozen for Milestone 1" (D1–D10, R1–R3) and the list of implementation-tunable parameters |
| 2 | **Contradiction fixed:** P60-M1-012 told developers to "fix the component" when a stale test reveals a real UI break, which conflicted with its own "no production behaviour changes" rule. It now logs a separate bug, skips the test with a bug reference, and records the disposition; its criteria allow bug-linked skips |
| 3 | §7: added an explicit note that sign-off doesn't require P60-M1-010 (telemetry). Previously this was only implied by the dependency table |
| 4 | P60-M1-005: llama.cpp JSON support marked as not a Milestone 1 blocker (R3) |
| 5 | P60-M1-008: no preselection or emphasised default (D4); Ask-mode criterion now asserts that no suggestions render and no apply happens, even for build-like text (D2) |
| 6 | Unresolved decisions reduced to risk-gated items. Removed: the stale-test disposition (now D10), `maxIncoming`/`ROW_GAP`/`SIZE_LIMIT` (now tunable parameters in §0), and llama.cpp JSON support (now R3) |

**Unresolved decisions** (risk-gated; each closes when its spike reports):

1. **R1, reference and demo model:** decided by P60-M1-014 (outcome A/B/C/D), starting from `llama3.2` on Ollama. P60-M1-011's demo gate confirms it. This is a runtime choice and doesn't change product scope.
2. **R2, E2E strategy:** decided by P60-M1-013 (Outcome A/B). If it returns Outcome B and recommends extracting a small apply/run-entry layer from `PipelinePage`, that refactor needs explicit team approval as a separate change before P60-M1-011 relies on it.

*Decided, no longer open:* D1–D10 and R3 (§0). Implementation-tunable parameters are listed in §0 and aren't tracked as decisions.
