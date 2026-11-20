# Discovery: 02 - Durable Execution & Orchestration Engine

This staging file collects all raw research and design notes related to workflow lifecycle execution, deterministic graph traversal, Temporal worker and bridge mechanics, payload codecs and state serialization, retries, timers, reconciliation controllers, and human-in-the-loop signals. All notes captured here govern how the platform reliably steps through a compiled Graph IR across process restarts and long-running pauses.

### Checkpoint & State-Patch Secret Rejection Guard
<!-- Source: incoming/_AGENT_Q_AND_A.md (Question 2) -->

* **Pre-Persistence Credential Sweep:** Before writing workflow state patches, run events, or checkpoints to durable storage (or Temporal payload codecs), the engine must pass payloads through the configured `RedactionPolicy` and reject (`mode: 'reject'`) any checkpoint payload containing raw credential-shaped strings as defense-in-depth.

### Authoritative Workflow State vs. Conversation History
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (State & Memory Design Flaws) -->

* **Decouple Task State from Message Arrays:** Authoritative workflow execution state (current graph node cursor, completed step outputs, modified files/resources, and idempotency keys) must be persisted in structured workflow/checkpoint state—never inferred from or stored solely inside the LLM conversation history.
* **Survive Context Compaction:** Trimming, summarizing, or resetting the chat message window to save tokens must have zero impact on durable workflow state or step-completion tracking.

### Stateful Tool Affinity & Activity Boundaries
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Tool & Environment Interface Flaws) -->

* **No Implicit Worker Memory Across Turns:** Because Temporal activities may execute across different worker processes or resume after restarts, stateful tool environments (such as working directories, browser tabs, or multi-step transactions) must never rely on implicit process-local memory across separate workflow steps. State must either be serialized explicitly into workflow/checkpoint state between activities or executed within a single bounded activity session.

### Asynchronous Dispatch, Replay Idempotency & Event-Driven Triggers
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Concurrency & Lifecycle Flaws) -->

* **Decouple Ingestion from Durable Execution:** Workflow execution must run asynchronously on Temporal workers and never block inside incoming HTTP, chat, or webhook request lifecycles, preventing gateway timeouts and dropped long-running executions.
* **Idempotency Across Crashes & Activity Retries:** Every workflow step and external side effect must be safe against worker crashes, restarts, and Temporal activity retries. Workflows must propagate deterministic idempotency keys (derived from `runId` + `nodeId` + `attempt`/`stepSeq`) and verify prior side-effect completion before re-executing mutations.
* **Event-Driven Signals Over LLM Polling:** Never schedule recurring cron loops that wake an LLM merely to poll whether state has changed. Use deterministic event listeners, webhooks, file/catalog watchers, or Temporal signals to wake or trigger LLM workflows strictly when a concrete state transition occurs.

### Human-in-the-Loop Approval Suspension & Structured Activity Audits
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Autonomy & UX Design Flaws) -->

* **Durable Pause on Irreversible Actions:** When `ToolExecutor` encounters a tool requiring confirmation, the engine must durably suspend the workflow (via Temporal signal + configurable timeout) and persist a pending approval payload (tool ID, sanitized arguments, preview/blast radius) until approved or rejected.
* **Structured Step & Mutation Ledger:** Every workflow run must record a queryable trail of tools invoked, inputs/outputs (post-redaction), and resources or files modified so execution history is never opaque.

### Durable Reconciliation Loop, Temporal Isolation & Recovery
<!-- Source: incoming/AGENT_RECONCILIATION_CONTROLLER_KAZI.md -->

* **One Durable Workflow per Logical Goal:** Execute each goal reconciliation loop as a durable Temporal workflow owning state transitions, timers, human-approval signals, cancellation, and `Continue-As-New` history compaction. Keep all repository I/O, model calls, predicate verifiers, Mem0 queries, and publication steps inside Temporal Activities.
* **Full-Vector Re-Observation & Stuck Detection:** After every repair dispatch, re-evaluate the **entire** predicate vector (including previously passing `guard` predicates) to catch regressions. Implement stuck detection over a sliding window of failing predicate IDs and eligible score deltas, terminating honestly with explicit terminal statuses (`converged`, `stuck`, `over_budget`, `error`, `cancelled`).
* **Artifact-Bound Evidence & Staleness Invalidation:** Bind every `Observation` to an exact `candidateDigest`, `verifierVersion`, environment, and `observedAt` timestamp. Any modification to the candidate invalidates prior observations.
* **Activity Reliability, Fencing & Budget Accounting:**
  * Store compact artifact/evidence references in Temporal workflow history—never raw logs or secrets.
  * Configure activity timeouts, heartbeats for long verification jobs, retry classifications (distinguishing transient probe errors from permanent checker failures), and process-tree cleanup on cancellation.
  * Preserve logical job identity and reserve/settle budgets across retries and worker restarts so crashes never reset spend caps or duplicate external publication.
  * When parallel goals touch overlapping files or deployment targets, enforce resource leases with explicit ownership, expiry, renewal, and fencing tokens.
* **Reconcilable Read Projections:** Treat UI/search read models as best-effort projections that can be rebuilt or reconciled from authoritative Temporal execution state after crashes.

### Monotonic Event Cursors for Gapless Replay-to-Live Streaming
<!-- Source: incoming/CODING_STANDARDS.md (Section B.2) -->

* **Consistent Event Cursor & Pub/Sub Ordering:** The run event store and in-flight event hub must assign strictly monotonic event IDs (`seq`) and support race-free subscription handover so an SSE consumer replaying historical events up to `seq = N` transitions smoothly to live events starting at `seq = N + 1`.

### Append-Only Checkpoints & Resume Version Validation
<!-- Source: incoming/CODING_STANDARDS.md (Section C.1) -->

* **Append-Only, Idempotent Checkpoints:** All workflow execution checkpoints must be persisted as append-only records keyed uniquely by `(runId, seq)` so retried writes are idempotent and historical state snapshots are never overwritten in place.
* **Strict `stateVersion` & Structural Validation on Resume:** Every checkpoint record must embed an explicit `stateVersion` field. When resuming a workflow from a checkpoint, the engine must validate both `stateVersion` compatibility and structural schema integrity, rejecting resumption with a deterministic error if a version mismatch or corrupted state layout is detected.

### Decouple Core Orchestration Loops from Encryption & Byte Serialization
<!-- Source: incoming/CODING_STANDARDS.md (Section C.2) -->

* **Typed `CheckpointRecord` Boundary:** Core graph orchestration loops must interact solely with structured `CheckpointRecord` domain objects and remain completely unaware of encryption configurations, KMS keys, or raw byte encoding.

### Replay Determinism & Continuation Verification
<!-- Source: incoming/CODING_STANDARDS.md (Section D.1) -->

* **Deterministic Resumption Tracks:** The orchestration engine must ensure that replaying a recorded sequence of events and checkpoints yields a byte-identical execution state prior to executing new continuation steps, protecting Temporal workflow replay safety.

### Non-Nullable Principal Propagation on Scheduled & Triggered Runs
<!-- Source: incoming/CODING_STANDARDS.md (Section E.1) -->

* **Explicit Service Principal on Background Workflows:** Temporal schedules, cron triggers, and event-driven workflow starts must attach an explicit, verified Service Principal identity in the workflow execution context so downstream activities, audit logs, and token brokers never operate without a concrete principal.

### Infrastructure-Agnostic Audit Emission in Core Engine
<!-- Source: incoming/CODING_STANDARDS.md (Section H.1) -->

* **Zero Vendor Storage Logic in Core Loops:** Core workflow orchestration and activity wrappers must emit audit events exclusively through the abstract `AuditLogSink` seam and never import or invoke vendor-specific compliance storage SDKs directly.

### v1 Operational Gaps: Multi-Step Graph Traversal & Runtime Store Wiring
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (Executive Assessment & What Exists Today) -->

* **v1 Gap — Single-Call Workflow Stub:** The existing `dynamic-agent-executor.workflow.ts` establishes basic approval/interruption signals and performs a single LLM call, but does **not** traverse a compiled workflow graph, evaluate verification predicates, dispatch iterative repair steps, or compute convergence/stop decisions. The rewrite must implement full multi-step Graph IR traversal plus an opt-in outer reconciliation loop inside Temporal.
* **v1 Gap — Disconnected Persistence Projections:** While `SqlAgentRuntimeStore` provides database tables for runs, events, checkpoints, approvals, artifacts, and audit logs, it is not wired to actual Temporal workflow state transitions or terminal outcomes. Every workflow state transition, checkpoint, and terminal outcome must durably synchronize with the runtime persistence projection.

### Reconciliation Admission Gate on Approved Contract Digest (P0)


* **Verify Approved Digest Before Execution:** The reconciliation workflow must validate at startup (and on resume) that the referenced goal revision has a recorded approval matching its canonical digest and a non-empty predicate vector, failing admission immediately if unapproved or tampered with.

### Predicate Convergence Semantics, Full-Vector Re-Runs & Staleness Rules (P1)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P1 - Predicate evaluation and evidence) -->

* **Strict Convergence Definition:** A reconciliation workflow converges **only** when the observation vector is non-empty, every required `acceptance` predicate evaluates to `'pass'`, and every `guard` predicate evaluates to `'pass'` against the **exact same `candidateDigest` and environment**.
* **Never Treat `error` or `unknown` as Success:** Distinguish actionable code/product failures (`'fail'`) from checker/infrastructure failures (`'error'` or `'unknown'`). Retry transient observation failures within configured retry/backoff limits, and halt or escalate for human intervention on permanent checker or configuration errors.
* **Full-Vector Re-Evaluation & Staleness Invalidation:** Re-execute the entire predicate vector (including previously passing `guard` checks) after every repair iteration so regressions are caught immediately. Invalidate and ignore any prior `Observation` whose `candidateDigest` or environment no longer matches the active candidate.
* **Compact Workflow History:** Persist only compact `evidenceRef` pointers in Temporal workflow history—never raw verification logs or secret material.

### Bounded Outer Reconciliation Loop & Honest Stop Taxonomy (P2)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P2 - Bounded outer loop and honest stop reasons) -->

* **Four-Phase Reconciliation Loop:** Implement the missing durable outer loop in the Temporal workflow:
  1. Provision initial candidate and capture baseline predicate observations.
  2. When checks fail, dispatch the inner agent workflow with **only** actionable failure evidence (not full historical transcripts).
  3. Snapshot the updated candidate, re-evaluate the **full** predicate vector, and repeat while budgets permit.
  4. Terminate with an explicit, auditable terminal status—never inferring success from an agent's text response.
* **Explicit Terminal Outcome Taxonomy:** Every reconciliation workflow must conclude with one of five concrete stop states: `'converged' | 'stuck' | 'over_budget' | 'error' | 'cancelled'`.
* **Conservative No-Progress / Stuck Heuristic:** Detect repeated identical failing predicate ID sets across a configurable sliding window and terminate with `stuck` (treating the heuristic as an operational circuit breaker rather than mathematical proof that no fix exists).
* **Three-Way Failure Classification:** Explicitly separate:
  * *Transient observation errors* (retryable with bounded backoff).
  * *Actionable predicate failures* (routed back to the inner agent for repair).
  * *Terminal policy or configuration errors* (halt immediately with `error`).
* **Crash- & Retry-Proof Budget Enforcement:** Track iterations, dispatches, elapsed wall time, and monetary/token spend at the **logical run level** inside durable Temporal workflow state so activity retries and worker restarts never reset counters or exceed caps.

### Temporal Execution Authority, Projection Reconciliation & Cascading Cancellation (P3)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P3 - Durable lifecycle controls and status) -->

* **Temporal as Execution Authority (SQL as Reconcilable Projection):** Temporal workflow state is the authoritative source of truth for execution lifecycle. SQL run/event tables (`SqlAgentRuntimeStore`) act as queryable read projections that must synchronize with workflow transitions and remain rebuildable/reconcilable from durable Temporal history.
* **Complete Temporal Query/Signal/Cancel Contract:** Expose typed Temporal workflow query and signal handlers alongside `temporal-dispatcher.ts` client methods covering status inspection, approval resolution, cancellation, and state-validated resumption.
* **Required Run Projection Metadata:** Persist and expose logical run ID, Temporal `workflowId` and `runId`, approved `goalRevision`, current phase/iteration, terminal stop reason, approval and publication states, `candidateDigest`, and `evidenceRef` pointers.
* **Cascading Cancellation to Child Processes & Remote Jobs:** Cancelling a workflow must propagate cancellation signals into active Temporal activities, terminating any spawned OS process groups, sandbox containers, or remote verification/CI jobs owned by that run.

### Temporal Production Safeguards, History Growth & Logical Budget Settlement (P4)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P4 - Recovery-safe side effects, budgets, and provenance) -->

* **v1 Gap — Bare Retry Config Without Lifecycle Safeguards:** The current workflow relies only on a basic `maximumAttempts` retry setting and lacks production Temporal protections. Every activity and workflow must configure:
  * Explicit `startToCloseTimeout` and `scheduleToCloseTimeout` bounds.
  * Periodic activity heartbeats for long-running verification, workspace, or inference jobs.
  * Explicit non-retryable error classifications (so permanent policy/config/validation failures do not spin).
  * Deterministic cancellation cleanup handlers.
  * Replay-safe workflow versioning (`patched` / `deprecatePatch`) for evolving workflow logic safely over in-flight runs.
  * History-growth management using `Continue-As-New` when reconciliation iterations or event histories approach Temporal limits.
* **Logical-Run Budget Reservation & Settlement:** Reserve and settle token/monetary budgets against the **logical run** rather than individual activity attempts so retries and worker crashes never double-count or reset spend caps. Represent missing or unreturned provider usage explicitly as `'unknown'` rather than silently recording `0`.

### Single-Scheduler Discipline & Tenant Capacity Policies (P6)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P6 - Reactive triggers and capacity policy) -->

* **No Competing Fleet Scheduler:** All reactive, cron, and queued workflow dispatches must run through Temporal's native scheduling and task-queue mechanisms—never introduce a second custom fleet scheduler or external cron daemon.
* **Tenant-Aware Admission & Worker Capacity Limits:** Before enabling high-volume autonomous triggers or parallel reconciliation runs, enforce tenant-scoped admission quotas (max concurrent active runs/dispatches per tenant) and worker task-queue concurrency/rate limits to prevent noisy-neighbor starvation.

### Idempotent Mid-Run Steering Signals (P7)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P7 - Resumable, steerable task sessions) -->

* **Steer Active Workflows Without Duplicate Spawns:** Support delivering user steering updates into an already-running Temporal workflow via durable, deduplicated signals (applied safely at the next deterministic step boundary) rather than racing a second concurrent workflow execution on the same session.

### Generalized Durable Intervention & Pause/Resume Checkpoints (P8)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P8 - Live supervision and durable intervention points) -->

* **Unified Durable Checkpoint & Intervention Protocol:** Generalize workflow signal handling beyond one-off startup approvals so a running Temporal workflow can suspend at durable intervention checkpoints for:
  * Operator-initiated `pause` / `resume`.
  * Interactive clarification requests (`awaiting_input`).
  * Specific pending tool/publication approvals (`awaiting_approval`).
  * Checkpoint-level operator steering updates.
* **Preserve Logical Run Identity Across Interventions:** Resuming after any pause, clarification, approval, or steering intervention must continue the **same logical run** (`runId`) and append to its existing checkpoint lineage rather than spawning an orphaned run.

### Bounded Child-Run Lifecycle, Depth Caps & Parent Budget Rollup (P10)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P10 - Bounded child-agent delegation) -->

* **v1 Gap — No Parent/Child Execution Lifecycle:** The current workflow rough-in supports only a single flat dispatched workflow with no parent-to-child orchestration, status inspection, or cascading cancellation.
* **First-Class Child-Run Operations:** Enable a parent workflow to spawn (via Temporal Child Workflows), await, inspect status/progress of, and deterministically cancel child runs when the parent finishes, fails, or is cancelled.
* **Hard Fan-Out & Nesting Limits:** Enforce configurable caps on maximum concurrent/total child runs per parent (`maxChildren`) and maximum delegation depth (`maxNestingDepth`) to prevent runaway recursive agent spawning.
* **Logical Parent Budget & Deadline Rollup:** Bound every child run by its parent's remaining wall-clock deadline and allocated sub-budget, aggregating all child token, compute, and monetary spend back into the logical parent run's budget ledger.

### Temporal Schedule Integration & Overlap Policies (P11)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P11 - User-managed schedules and automation history) -->

* **Back Automations Directly with Temporal Schedules:** Implement one-shot and recurring automations using Temporal's native Schedule APIs rather than building a custom polling loop or external cron service.
* **Synchronized Lifecycle & Overlap Policies:** Propagate control-plane `create`, `update`, `pause`, `resume`, and `delete` operations deterministically to Temporal Schedules, enforcing explicit overlap policies (e.g., skip or buffer if a prior scheduled run is still active) and deterministic trigger deduplication.

### Durable Waiting for Long-Running External Operations (P13)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P13 - Durable waiting for external operations) -->

* **Never Hold Activities Open for Minutes/Hours:** Long-running external operations (CI pipelines, deployments, infrastructure provisioning, PR reviews) must **not** block inside a single long-lived Temporal activity until completion. Model them as two-phase durable operations: a short start activity returning a stable operation handle, followed by a durable workflow wait loop.
* **Hybrid Signal + Bounded Timer-Polling Loop:** While awaiting a long-running operation, the Temporal workflow must:
  1. Listen for push completion callbacks via a typed Temporal signal.
  2. Use bounded, backoff-scheduled Temporal timers (`condition(..., timeout)`) to trigger fallback status-inquiry activities when a webhook callback is missing or delayed.
  3. Deduplicate repeated callback signals by operation handle / delivery ID.
  4. Terminate deterministically on an overall operation deadline or terminal provider failure.
* **Verify External State Before Advancing:** Never trust a webhook payload alone as proof of completion; run a final status verification activity against the external provider before marking the operation complete in workflow state.

### Zero Token Persistence in History & Durable `reauth_required` Pause (P14)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P14 - Reauthorization and credential renewal during a run) -->

* **Zero Raw Tokens in Temporal Inputs or History:** Workflow start payloads, signals, and Temporal history events must carry only opaque actor/credential references—never raw OAuth tokens, PATs, or API secrets.
* **Durable `reauth_required` Suspension & Resumption:** When an activity reports expired or revoked delegated authorization (common after long human-approval gates or multi-hour external waits), the workflow must transition into an explicit `reauth_required` paused state and resume execution only upon receiving a verified reauthorization signal.

### Worker-Fleet Deployment Lifecycle, Queue Capacity & Abandoned-Run Recovery (P16)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P16 - Worker-fleet operational controls) -->

* **Safe Worker Drain & Versioned Rollouts:** Configure Temporal workers with graceful shutdown drain windows (completing in-flight activities and heartbeating cleanly before termination) and Temporal Worker Versioning / Build-ID routing so new workflow/activity deployments roll out without breaking replay on in-flight runs.
* **Per-Queue Capacity & Concurrency Limits:** Enforce task-queue-specific concurrency limits (maximum concurrent workflow tasks, activities, and local subprocess slots) separate from per-tenant admission quotas so heavy verification or LLM queues do not starve lightweight control-plane queues.
* **Recovery Path for Exhausted or Abandoned Runs:** Implement explicit detection and recovery mechanics (via heartbeats, `scheduleToClose` timeouts, and reconciliation queries) for runs whose workers died, exhausted retries, or stopped making progress.

### Recurring Schedule Overlap, Catch-Up & Failure-Pause Semantics (P17)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P17 - Schedule overlap and missed-run semantics) -->

* **Mandatory Explicit Overlap Policy:** Every recurring Temporal Schedule must specify an explicit overlap policy governing behavior when a scheduled trigger fires while a prior run is still active: `skip` (default safe choice), `buffer`/`coalesce` (collapse missed ticks into one follow-up run), or `allow_bounded` (capped concurrent runs).
* **Timezone, Jitter & Outage Catch-Up Bounds:** Configure schedules with explicit IANA timezones, randomized dispatch jitter (to prevent synchronized fleet spikes), and a bounded outage `catchupWindow` (preventing a thundering herd of backlogged runs after worker or Temporal downtime).
* **Automatic `pauseOnFailure`:** Support configuring Temporal Schedules to automatically pause after consecutive workflow failures so broken recurring automations stop burning budget until an operator intervenes.

### Temporal Bridge Architecture & Single-Turn Deterministic Stepping
<!-- Source: incoming/TEMPORAL_BRIDGE.md -->

* **Eliminate Ad-Hoc v1 `GraphExecutor` Boilerplate:** Replace v1's manual loop-counter (`seq++`), ad-hoc state serialization, and custom crash-recovery `while` loops with Temporal's native deterministic workflow replay and activity orchestration.
* **Single-Turn Stepping (`maxSteps: 1`) for Mid-Loop Governance:** Inside the durable workflow loop, execute LLM inference one turn at a time (`maxSteps: 1`) rather than letting the AI SDK run an opaque multi-step tool loop unchecked. Stepping per turn allows the workflow to inspect proposed tool calls, enforce approval gates (suspending via Temporal signals), and record step ledger entries deterministically before executing side effects.
* **Serializable Tenant & Principal Isolation per Workflow:** Start each execution with a deterministic `workflowId` (`run-${runId}`) and pass strictly JSON-serializable multi-tenant metadata (`tenantId`, `initiatedBy` principal ref) in workflow `args`—never passing live DB handles, functions, or raw secrets across the Temporal boundary.
* **Caveats on Stale Prototype Code in Source:** Ignore prototype shortcuts in this file's sample snippets: (a) use `@temporalio/vercel-ai-sdk` (`temporalProvider.languageModel`), not `@temporalio/ai-sdk`; (b) pass serializable `toolIds` rather than live `Tool` function objects in `args`; and (c) gate writes via typed `effect`/`reversibility` metadata rather than `toolName.startsWith('destructive_')`.

### Standalone Temporal Worker Microservice & Determinism Boundary
<!-- Source: incoming/TEMPORAL_WORKER.md -->

* **Standalone Worker Microservice Over Embedded Plugin Worker:** Run the Temporal Worker (`@ai-crew-suite/temporal-worker`) as an isolated, independently scalable Node.js container/process polling the Temporal Cluster via gRPC—never embedded inside the Backstage HTTP backend process—so heavy LLM loops, sandbox orchestration, and dependency versions cannot block or crash the Backstage API event loop.
* **Strict Workflow vs. Activity Determinism Split:**
  * *Workflows:* Pure deterministic orchestration logic (state transitions, loops, timers, signal handlers, retry policies)—zero direct network I/O, filesystem access, or non-deterministic calls.
  * *Activities:* All non-deterministic operations (LLM inference, Mem0 retrieval/updates, tool execution, database/API calls).
* **Decouple Backend Client from Worker Bundle:** The Backstage backend plugin must invoke workflows by registered workflow name string and shared contract types—never importing `@ai-crew-suite/temporal-worker/dist/workflows` directly into the Backstage server bundle.
* **Caveats on Prototype Snippets in Source:** Ignore prototype shortcuts in this file's sample Express handler: never trust `userId` from `req.body` (extract via `coreServices.httpAuth`), never catch-and-return manual `res.status(500)` responses, and use structured `logger.info(msg, { ... })` metadata objects per `CODING_STANDARDS.md`.

### Pull-Based Worker Polling & Temporal Scheduling Primitive Selection
<!-- Source: incoming/TEMPORAL_WORKERS_AND_SCHEDULES.md -->

* **Pull-Based Worker Polling & Slot Tuning:** Workers must operate strictly on an outbound pull-based polling model against designated Temporal Namespaces and Task Queues, with tunable concurrent workflow/activity execution slots matched to container CPU/memory limits.
* **Ban Legacy Temporal Cron Jobs (Use Explicit Timing Primitives):** Never use legacy Temporal Cron Jobs (`cronSchedule` on workflow start). Select the exact Temporal timing primitive per use case:
  1. **Temporal Schedules:** Default for all recurring or calendar-driven automations (supporting intervals, cron/calendar specs, timezones, exclusions, jitter, `catchupWindow`, `pauseOnFailure`, and historical backfills).
  2. **`startDelay` Option:** Use for one-shot delayed workflow starts rather than creating a single-action Schedule (`remainingActions: 1`).
  3. **In-Workflow Timers (`workflow.sleep`):** Use for relative delays inside an active workflow execution.
  4. **Long-Running Workflow (`Continue-As-New`):** Use when intervals change dynamically per entity or external callers must inspect/mutate shared cross-iteration state via signals/updates/queries.
* **Temporal Schedule Edge-Case Invariants:**
  * Pausing a Schedule halts future triggers only—it does **not** pause already-running workflows (which must be signalled/cancelled separately).
  * A paused workflow execution still counts as an open execution when evaluating Schedule overlap policies (`Skip`, `BufferOne`, etc.).
  * Do not rely on `LastCompletionResult` across scheduled workflows that invoke `Continue-As-New` (it resets across `Continue-As-New` boundaries).
  * Account for eventual consistency in Temporal Visibility APIs (`ListSchedules` / `CountSchedules`) immediately after creating or deleting schedules.

### Decouple Active Workflow Control from Passive Event Reactions
<!-- Source: incoming/TOOLS_EXPLANATIONS.md (Workflow vs. Subscription Semantics) -->

* **Non-Invasive Event Observers:** Cross-cutting downstream reactions (team notifications, compliance audits, post-run triggers) must consume recorded workflow events asynchronously as independent subscribers—never dynamically altering, wrapping, or injecting steps into an active workflow's compiled execution graph.

### Per-Provider Task Queues, `awaitOperation` Hybrid Wait & Claim-Check Payloads
<!-- Source: incoming/TOOLS_INTERFACE_OPTIONS.md (Sections 2.4, 2.8, 3 Option C) -->

* **Per-Provider-Instance Task Queues & Backpressure:** Execute write, async, and background capability activities on dedicated per-provider-instance Temporal Task Queues (e.g., `drivers.github-ghes-prod`), pairing worker `maxTaskQueueActivitiesPerSecond` caps with Redis token buckets for cluster-wide rate-limit backpressure and independent horizontal scaling.
* **Transparent `awaitOperation(handle, { timeout })` Workflow Primitive:** When an `async` capability returns an `OperationHandle { id, capability, provider, startedAt }`, persist it in a SQL operations table keyed by idempotency key and suspend inside Temporal until either a provider webhook signal arrives or a durable timer triggers the driver's `*.status` inquiry fallback with bounded backoff.
* **Zero Credentials in Temporal Payloads + KMS `PayloadCodec` & Claim-Check:** Pass only `{ principal, standingRef, capability, argsRef }` in workflow inputs/outputs—never raw tokens. If a user's token expires mid-run, return a typed `connect_account` result so the workflow pauses cleanly for a re-consent signal. Encrypt all agent payloads at rest via a Temporal `PayloadCodec` (KMS-backed AES-GCM) and store oversized/regulated payloads by reference (claim-check pattern) in encrypted object storage.

### Error Taxonomy, Idempotency Keys & Saga Compensation

<!-- Source: incoming/WRITING_AN_AGENT.md (Section 1: Cascading Errors and Infinite Loops) -->

To prevent agent retries from causing duplicate side effects or orphaned infrastructure across Backstage Scaffolder, CI/CD, and Kubernetes APIs, the Temporal execution engine enforces strict failure classification and transactional hygiene:

- **Retryable vs. Terminal Error Taxonomy:**
  - **Retryable (Transient):** HTTP `429`, `502`/`503`/`504`, and network timeouts use Temporal Activity retry policies with exponential backoff and jitter.
  - **Terminal (Non-Retryable):** `4xx` schema validation failures, RBAC/permission denials, and unregistered tool invocations throw Temporal non-retryable `ApplicationFailure` errors immediately—bypassing activity retries and surfacing structured error feedback directly to the reasoning loop.
- **Mandatory Idempotency Keys:** Every state-mutating Temporal Activity must accept and forward a deterministic idempotency token derived from `(workflowId, runId, stepId, argsHash)` so timeout-triggered retries never duplicate catalog entities, pull requests, or pipeline runs.
- **Multi-Step Saga Compensation:** Workflows orchestrating mutations across multiple external systems must register compensating rollback activities per step. If a downstream step fails terminal validation, the workflow executes registered compensations in reverse order rather than leaving orphaned cloud or repository state.

### Durable HITL Approval Suspension & TTL Enforcement
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 3: Unintended Actions and Permissions) -->

High-stakes tool invocations (`WRITE_HIGH`) must never block worker threads or lose state while awaiting human review:

- **Signal-Driven Pause & Resume:** Upon receiving a `dryRun` preview from a `WRITE_HIGH` capability, the Temporal workflow persists the pending approval request in checkpoint state and suspends deterministically via `Workflow.condition(() => approvalDecision !== undefined, approvalTtl)`.
- **Bounded TTL & Safe Timeout:** Every approval gate enforces a strict TTL (configurable per capability policy). If the TTL expires without an authorized approval signal, the workflow transitions the step to `DENIED_TIMEOUT` and feeds a structured timeout observation back to the reasoning loop (or aborts cleanly) without executing the mutation.
- **Zero Raw Credentials in Workflow State:** Approval payloads and workflow histories store only the `approvalId`, `userEntityRef`, `oboGrantRef`, and `dryRun` diff hash—never raw OBO access tokens.

### Workflow Taint Tracking & Dynamic Risk Escalation
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 4: Prompt Injection) -->

To contain indirect prompt injections across multi-step durable executions, Temporal workflow state tracks data-provenance taint deterministically:

- **Persistent Taint Flag & Provenance List:** Whenever a workflow step ingests external or user-authored untrusted data (e.g., external HTTP fetch, GitHub issue/PR body, pod logs, TechDocs), the workflow marks its durable state as `tainted = true` and appends the source identifier to `taintSources` (persisted across checkpoints and replay).
- **Child Workflow & Sub-Agent Propagation:** Any sub-agent or child workflow invoked from a tainted parent inherits `tainted = true` automatically.
- **Deterministic Policy Escalation:** While `tainted === true`, the workflow engine automatically upgrades all subsequent `WRITE_LOW` capabilities to `WRITE_HIGH` (mandating explicit HITL approval with a `dryRun` preview) and enforces strict egress allowlists on outbound network activities.

### Per-Session FIFO Serialization & Multi-Lane Concurrency
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 6: Gateway and Channel Routing) -->

Because Backstage backend pods scale horizontally behind a load balancer, per-session ordering cannot rely on single-node in-memory queues:

- **Temporal-Backed Session Serialization:** Map each composite `sessionKey` deterministically to a durable Temporal workflow execution (or per-session signal queue). Rapid follow-up messages in the same interactive thread are delivered as ordered Temporal signals and processed strictly **FIFO** within the workflow loop, preventing concurrent state corruption across pod replicas.
- **Global & Tenant Lane Concurrency:** Isolate interactive user sessions from high-volume webhook/cron automations using separate Temporal Task Queues and worker concurrency limits so background webhook bursts cannot starve interactive developer sessions.
- **Ingress Idempotency Deduplication:** Deduplicate inbound channel events using `(sessionKey, idempotencyKey)` before signaling Temporal so platform webhook retries (Slack, GitHub, PagerDuty) never trigger duplicate agent turns.

### Temporal Schedules, Isolated Trigger Sessions & Priority Task Queues
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 7: Proactive Triggers and Scheduling) -->

Rather than running local cron files (`jobs.json`), `setInterval`, or a secondary BullMQ queue alongside Temporal, all durable proactive execution is governed natively by Temporal:

1. **Temporal Schedules for Periodic & One-Shot Jobs:**
   - Manage cron expressions, interval checks, jitter windows, and overlap policies (`SKIP` or `BUFFER_ONE`) via Temporal `ScheduleClient`, guaranteeing single-execution semantics across horizontally scaled pods.
2. **Isolated Background Sessions:**
   - Proactive workflows execute under isolated session keys (`tenant:<tenantId>:trigger:<ruleId>:<timestamp>`) rather than injecting automated turns into a developer's active interactive thread—preventing noisy monitoring logs from polluting conversational history.
3. **Two-Tier Priority Task Queues & Rate Limiting:**
   - Route interactive user sessions to a dedicated high-priority Temporal Task Queue (`agent-interactive`) and proactive cron/webhook runs to a throttled background Task Queue (`agent-background`) configured with `taskQueueActivitiesPerSecond` rate limits so alert storms cannot starve live user sessions or trigger upstream API `429` throttling.

### Two-Dimensional Concurrency: Temporal Session Serialization, Steering & Resource Leases
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 8: Concurrency and Lane Locking) -->

In a multi-pod Backstage deployment, concurrency collisions occur both **within a session** (rapid follow-up messages or overlapping triggers) and **across sessions** (two workflows mutating the same catalog entity or repository simultaneously). The engine enforces two-dimensional concurrency control:

1. **Dimension 1 — Per-Session Serialization, Coalescing & Steering (Temporal Signals):**
   - Rather than maintaining fragile in-memory queues or a separate BullMQ stack, each active `sessionKey` maps to a deterministic Temporal workflow execution that processes turns strictly **FIFO**.
   - Rapid inbound signals arriving mid-turn follow the workflow's configured queue mode:
     - **`collect` (Coalesce):** Buffers consecutive user messages and merges them into the next turn once the active step commits.
     - **`steer`:** Injects updated user constraints into workflow state at the next ReAct loop boundary without discarding completed tool work.
     - **`interrupt`:** Cancels in-flight LLM generation or `READ` activities via Temporal Activity Cancellation (propagating `AbortSignal` to `ModelExecutor`), commits clean transcript state, and restarts reasoning with the new intent.
2. **Dimension 2 — Cross-Session Resource Leases (`catalogEntityRef` / Repo Locks):**
   - Before executing `WRITE_LOW` or `WRITE_HIGH` mutations, the runtime acquires a short-TTL **Redis distributed lease** keyed by `(tenantId, normalizedResourceId)` (e.g., `entity:component:default/payments-api` or `repo:org/payments`) renewed via Temporal Activity heartbeats.
   - Concurrent `READ` steps proceed unblocked, while conflicting mutations serialize cleanly; if a worker pod is OOMKilled, lease TTL expiration prevents permanent deadlocks.
3. **Failure Quarantine & Dead-Letter Visibility:**
   - Unrecoverable workflow or poisoned-signal failures transition to an explicit `FAILED_QUARANTINED` status in `RunStore` with full Temporal execution history and trace links for operator replay.

### Temporal `Continue-As-New` Compaction & Async Post-Turn Mem0 Extraction
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 10: Cross-Session Memory Hygiene) -->

Long-running interactive agent sessions must neither exceed Temporal's event history limits nor block user-facing streaming responses on memory indexing:

- **Async Post-Turn Memory Extraction Activity:** After an assistant turn streams to completion (and immediately prior to `Continue-As-New` compaction), the workflow schedules a decoupled Temporal Activity (with standard retry policies) to run Mem0 fact extraction, deduplication, and embedding off the critical response path.
- **Temporal `Continue-As-New` History Compaction:** When a long-lived session workflow approaches event-history or payload thresholds, it executes a pre-compaction memory flush to Mem0, serializes a compact checkpoint summary (`sessionKey`, `tainted`, active skills, distilled state), and calls `Workflow.continueAsNew(...)` to reset event history cleanly.
- **Ephemeral `runId` Memory Sweeper:** Upon workflow completion or cancellation, a final cleanup activity (backed by a scheduled retention sweeper) purges `runId`-scoped scratchpad entries from Mem0.

### Isolated Sandbox Worker Fleet & Split Untrusted/Trusted Execution
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 11: System-Level Blast Radius) -->

To prevent code generation, linters, Terraform plans, or third-party skill scripts from compromising Backstage control-plane pods or stealing shared credentials, execution is partitioned across isolated worker fleets:

- **Dedicated `sandbox-execution-queue` Worker Pool:** Route all filesystem, repository-clone, CLI-execution, and skill-script activities to an unprivileged, credential-free Temporal worker pool (`sandbox-execution-queue`), completely separated from Backstage API pods and LLM reasoning workers.
- **Two-Phase Untrusted Compute / Trusted Mutation Split:**
  1. **Phase 1 (Untrusted Sandbox Activity):** Runs inside an ephemeral sandbox with zero ambient credentials, producing diffs or build outputs into `ArtifactSink`.
  2. **Phase 2 (Trusted Deterministic Activity):** A non-LLM control-plane activity inspects the generated artifact, exchanges the opaque `oboGrantRef` in memory via the Token Broker, and executes the external Git push or API mutation—keeping credentials completely out of both Temporal history and untrusted sandbox processes.

### Temporal Payload Encryption (`DataConverter`) & Opaque Secret Handles
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 12: Secret Isolation) -->

Because Temporal persists workflow and activity inputs/outputs in its event history store, strict payload hygiene is mandatory for SOC-2, HIPAA, and FINRA compliance:

- **Custom Encrypting `DataConverter`:** Configure all Temporal clients and workers with a custom `PayloadCodec` / `DataConverter` backed by KMS-managed envelope encryption so all serialized workflow arguments, checkpoints, and tool outputs are encrypted at rest and in transit.
- **Zero Raw Secrets in Event History:** Even with payload encryption enabled, raw API keys, OAuth tokens, and passwords are prohibited in Temporal payloads. Workflows and activities pass only opaque `SecretRef` identifiers or short-lived `oboGrantRef` handles resolved at execution time by the Token Broker.

### HITL `Approve / Reject / Modify` Signals & Unattended Background Fail-Closed Policy
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 13: Approval Fatigue vs. Autonomy) -->

Temporal governs human approval suspensions across both interactive and unattended background workflows:

- **Interactive `Approve / Reject / Modify` Signal Contract:** When suspended at a Tier 3 gate (`Workflow.condition`), the workflow accepts a typed approval signal supporting three outcomes:
  - `APPROVE`: Proceeds to execute the exact `dryRun`-hashed payload.
  - `REJECT`: Cancels the pending mutation and feeds the reviewer's rejection reason back to the reasoning loop so the agent can replan.
  - `MODIFY`: Applies reviewer-edited parameters, re-runs `dryRun` validation, and executes the revised action.
- **Unattended Background Fail-Closed Rule:** Proactive cron and webhook workflows run without a live interactive user (`ask: 'off'` equivalent). Safe `READ` and reversible draft actions execute autonomously, while any attempt to invoke an unapproved `WRITE_HIGH` capability transitions the run to `AWAITING_APPROVAL`, dispatches a `@backstage/plugin-notifications` alert with a session deep link, and fails closed upon TTL expiration.

### Step-Granular ReAct Loop, Determinism Boundary & Crash Recovery
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 14: Crash Recovery and State Durability) -->

To ensure Kubernetes pod OOMKills, deployments, or upstream API timeouts never force re-execution of completed reasoning steps or duplicate side effects, the Temporal Workflow owns the outer ReAct control loop at **single-step activity granularity**:

1. **Step-Granular Activity Decomposition:**
   - **Never** wrap a multi-step agent loop (`maxSteps > 1`) inside a single Temporal Activity.
   - Each iteration of the Workflow `while` loop dispatches:
     1. One `llmStepActivity` (invoking `ModelExecutor` with `maxSteps: 1`) to produce either proposed tool call(s) or a final assistant response.
     2. One individual `toolExecutionActivity` per tool call (or parallel activity batch for read-only calls).
   - If a worker crashes on Step 8, Temporal replays Steps 1–7 deterministically from encrypted event history with zero duplicate LLM calls or tool mutations and resumes cleanly at Step 8.
2. **Strict Workflow Determinism Rules:**
   - All non-deterministic operations—LLM inference, `Date.now()`, `Math.random()`, network I/O, Mem0 queries, and Redis reads/writes—are forbidden inside Workflow code and isolated strictly inside Temporal Activities.
3. **Crash-Safe Activity Idempotency Keys:**
   - Derive a deterministic idempotency token (`${workflowId}-${stepIndex}-${toolCallId}`) for every mutating `toolExecutionActivity` so if a worker crashes after an external API succeeds (e.g., GitHub PR creation or Scaffolder run) but before acknowledging Temporal, the automatic retry deduplicates safely.
4. **Temporal Query State Recovery & `Continue-As-New`:**
   - Expose a synchronous Temporal Query handler (`getWorkflowProgress`) returning current step status, accumulated transcript references, and any pending HITL approval card.
   - Trigger `workflow.continueAsNew(compactedState)` every ~50 turns (after flushing durable facts to Mem0) to prevent unbounded event-history replay latency.

### Zero-LLM Gatekeeper Activities & Cursor Watermarking (Eliminating Idle Burn)
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 15: Idle Token Burn) -->

Proactive workflows never wake an LLM on a timer merely to check whether work exists. All scheduled and periodic workflows enforce zero-token pre-checks:

1. **Zero-LLM Step-1 Gatekeeper Activity:**
   - Every scheduled Temporal Workflow executes a deterministic TypeScript `gatekeeperActivity` as Step 1 (querying Backstage Catalog REST filters, Prometheus, or Git APIs directly).
   - If the deterministic check returns zero actionable anomalies, the workflow terminates immediately at **$0.00 LLM cost**.
2. **State-Hash & Cursor Watermarking:**
   - Persist a lightweight state watermark (`lastCheckedCommitSha`, `lastEventCursor`, or SHA-256 hash of observed failing pod/entity states) in Temporal Workflow state or Redis.
   - If the current state hash matches the prior watermark, exit immediately before invoking `ModelExecutor`.
3. **Stateless Fresh-Session Execution:**
   - Scheduled audits run in fresh, isolated Temporal workflow executions rather than loading multi-week conversational transcripts, keeping baseline input tokens near zero.

### Non-Retryable `AuthenticationRequiredError` & Auth-Wall Suspension
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 16: Bot Detection and Authentication Walls) -->

When a browser or authenticated HTTP activity encounters an expired corporate SSO session, MFA prompt, or CAPTCHA:

- **Zero Activity Retries on Auth Walls:** `AuthenticationRequiredError` is registered as a non-retryable `ApplicationFailure` type in Temporal Activity retry policies so worker retries never lock out corporate Okta/Entra ID accounts.
- **Durable Suspension & Resume Signal:** The Temporal Workflow transitions to `AWAITING_USER_ACTION`, dispatches a notification to the triggering user, and suspends via `Workflow.condition` until either an `authRefreshed` signal or a `manualContentProvided` signal arrives (or the suspension TTL expires).

### Header-Aware Backoff, LIFO Saga Compensation & Partial-Success State Ledger
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 18: API Rate Limits and Partial Failures) -->

When chaining mutations across GitHub, Backstage Catalog, cloud resources, and ArgoCD, the Temporal engine pairs header-aware retry scheduling with deterministic Saga rollbacks:

1. **Temporal `RetryPolicy` & Header-Driven `nextRetryDelay`:**
   - Configure mutating activities with bounded exponential backoff (`initialInterval: '1s'`, `backoffCoefficient: 2`, `maximumInterval: '60s'`, `maximumAttempts: 5`).
   - Classify permanent client/policy errors (`400`, `403`, `404`, `422`, `AuthenticationRequiredError`) as `ApplicationFailure.nonRetryable(...)` so Temporal stops retrying immediately and surfaces a structured error observation to the reasoning loop.
   - When an upstream tool throws a rate-limit error carrying `Retry-After` or `X-RateLimit-Reset` metadata, raise a retryable `ApplicationFailure` with explicit `nextRetryDelay` matching the upstream reset window.
2. **LIFO Saga Compensation Stack:**
   - Whenever a mutating capability declares a compensating rollback action, the workflow pushes the compensation descriptor onto a durable `compensations[]` stack immediately upon step completion (e.g., `createGitHubRepo` -> `deleteGitHubRepo`).
   - If a subsequent step fails permanently (and the agent cannot replan around it), the workflow executes registered compensations in reverse LIFO order so orphaned repositories, cloud buckets, or catalog entries are never left behind.
3. **Partial-Success State Ledger (`completedMutations[]`) & Resume Support:**
   - Maintain a structured `completedMutations[]` ledger in Temporal workflow state (exposed via `getWorkflowProgress` to the Backstage UI) recording each step's status (`SUCCEEDED`, `ROLLED_BACK`, `FAILED`, `PENDING`), resource IDs, and timestamps.
   - Operators can trigger one-click **Resume from Failed Step** once an upstream outage resolves (after re-authenticating and minting a fresh `oboGrantRef`).

### Scheduled Temporal "Memory Janitor" & Event-Driven Invalidation Workflows
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 19: Stale and Conflicting Facts) -->

Background memory maintenance runs as durable, rate-limited Temporal workflows on the `agent-background` task queue:

- **Catalog Mutation Invalidation Activity:** Triggered on `catalog.entity.updated` / `deleted` events to archive or re-tag affected `entityRef` memories in Mem0 with automatic retry handling.
- **Weekly "Memory Janitor" Temporal Schedule:** Managed via Temporal `ScheduleClient` per active `(tenantId, scopeKey)` to cluster high-similarity memories, merge duplicates and resolve contradictions via a Zod-constrained `generateObject` consolidation step (preferring newer timestamps and higher `sourceType` authority), and soft-archive expired records.

### Background Failure Interceptors, Consecutive-Error Tracking & Dead-Man's Switch
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 21: Silent Failures in Background Tasks) -->

Proactive scheduled workflows must never fail silently when running unattended:

1. **Temporal Workflow Failure Interceptor (`notifyBackgroundFailureActivity`):**
   - Wrap all scheduled/background workflows in a Workflow interceptor (or top-level `try/catch`) that catches terminal `ApplicationFailure` exceptions after `RetryPolicy` exhaustion and invokes `notifyBackgroundFailureActivity` before marking the workflow `Failed`.
2. **Consecutive-Failure Counter & Schedule Backoff:**
   - Persist `consecutiveFailures` per `scheduleId` in `RunStore` / Schedule metadata. Apply exponential backoff on recurring failures (`30s -> 1m -> 5m -> 15m -> 60m`) so a broken job neither floods logs nor burns idle tokens while still recovering automatically once the upstream issue clears.
3. **Success-Only Dead-Man's Switch Heartbeat:**
   - The final activity of every recurring background workflow emits a success timestamp metric (`backstage_agent_job_last_success_timestamp{scheduleId, tenantId}`) to internal Prometheus / PagerDuty monitoring—catching silent scheduler stalls or zero-replica worker outages where the workflow fails to start at all.

### Sub-Agent Execution via Temporal Child Workflows & Budget Inheritance
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 22: Sub-Agent Delegation and Context Isolation) -->

Heavy exploration, parallel diagnostics, and long-running background audits are modeled as isolated **Temporal Child Workflows** (`subagent-${parentWorkflowId}-${taskId}`):

1. **Synchronous Fan-Out (`executeChild`) vs. Async Background Delegation (`startChild`):**
   - **Parallel Fan-Out:** Use `Promise.all([executeChild(...), executeChild(...)])` inside the parent Workflow to inspect multiple services, repositories, or log streams concurrently in isolated context windows.
   - **Async Background Jobs:** Use `startChild` with `ParentClosePolicy.ABANDON` so the developer's main interactive session stays responsive immediately, delivering a `@backstage/plugin-notifications` summary alert when the child workflow finishes.
2. **Permission Downscoping, Depth Ceilings & Budget Caps:**
   - Child Workflows inherit a narrowed capability allowlist (stripping `delegate_subagent` by default to enforce `maxSpawnDepth = 1` and blocking control-plane/session tools), an opaque downscoped `oboGrantRef` (never a raw token), and hard execution ceilings (e.g., `maxSteps: 8`, `maxTokens: 30_000`) deducted from the parent run's budget.
   - Propagate `tainted = true` from parent to child automatically whenever the parent workflow has ingested untrusted data.

### Zero-Compute Clarification Suspension (`ask_clarification`)
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 24: Ambiguity and Over-Eagerness) -->

- **Signal-Driven Clarification Pause:** When `ModelExecutor` emits an `ask_clarification` tool call, the Temporal Workflow persists the question and options in checkpoint state (`status: 'AWAITING_CLARIFICATION'`), emits an SSE/channel prompt event, and suspends via `await Workflow.condition(() => clarificationReply !== undefined, clarificationTtl)`—consuming zero worker compute or LLM tokens while awaiting human input.
- **Deterministic Resumption:** Upon receiving a verified `clarificationReply` signal from the session owner, the workflow appends the structured answer to transcript state and resumes the ReAct loop at the next step.

### Consecutive-Failure Auto-Rollback for Newly Edited Schedules & Skills
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 26: Self-Inflicted Regressions) -->

- **Automatic Revision Rollback:** When a user-scoped schedule or skill revision (`vN`) fails **2 consecutive times** after an edit, the Temporal reconciliation/failure handler automatically reverts the active revision pointer back to the previous known-good snapshot (`vN-1`), logs an `AuditLogSink` event, and alerts the owner via `@backstage/plugin-notifications`.

### Temporal Alert Aggregator Workflows & Quiet-Hour `sleepUntil` Holding
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 28: Notification Fatigue and False Alarms) -->

- **Per-Team Signal Aggregator Workflow:** Route `DIGEST` and `ACTIONABLE` alerts into a durable Temporal Aggregator Workflow keyed by `(tenantId, ownerGroupRef)`. Collect incoming alert signals across a batch window (`15 minutes` for `ACTIONABLE`, `24 hours` for `DIGEST`), deduplicate correlated alerts, and emit a single consolidated notification card.
- **Durable Quiet-Hours Holding (`Workflow.sleepUntil`):** When an `ACTIONABLE` alert arrives outside the recipient's active hours, persist the passive in-app notification immediately and suspend external chat delivery via `await Workflow.sleepUntil(nextWorkingHourStart)` without holding worker threads.

### Native Temporal Schedule Timezone & DST Governance
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 30: Time, Timezone, and Recurrence Math) -->

- **Native IANA Timezone Scheduling:** Never implement custom `setTimeout` math or manual epoch-addition loops for recurring jobs. Pass validated 5-field cron expressions and explicit IANA timezone identifiers directly to Temporal Schedules (`ScheduleClient.create({ spec: { cronExpressions, timezone } })`) so Temporal handles DST shifts, leap years, and calendar boundaries natively.
- **Deterministic Replay Clock:** Anchor per-turn temporal context using Temporal's deterministic workflow clock so crash replays never diverge on wall-clock drift.

### Paired `Act -> Verify` Temporal Activities
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 31: Sycophancy and Hallucinated Completion) -->

- **Two-Phase Mutation & Post-Condition Polling:** State-mutating steps never terminate on a fire-and-forget `202 Accepted`. Temporal executes `executeMutationActivity` followed by a bounded, heartbeating `verifyStateActivity` that polls the capability's `verifyPostCondition` predicate until the expected state materializes in Backstage Catalog, Git, or Kubernetes—failing the step if verification times out.

### Workflow Replay Compatibility & Safe Versioning (`Workflow.patched`)
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 32: Regression Testing Across Prompt and Model Updates) -->

- **Mandatory CI Replay Gate:** All workflow and activity signature updates must pass `Worker.runReplayHistory()` against archived, scrubbed event histories prior to deployment.
- **Explicit Patch Versioning:** Any behavioral change to an in-flight workflow loop must use Temporal's `Workflow.patched('<patch-id>')` API (with corresponding `deprecatePatch` cleanup after drain) so active multi-hour HITL or long-running sessions never fail with `NonDeterminismError` across rolling worker deploys.

### Temporal Namespace Retention & Nightly Compliance Sweeper Workflow
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 34: Data Retention and Sensitive Content Scrubbing) -->

- **Namespace History Retention:** Configure the Temporal Namespace with a bounded workflow execution retention period (`7–30 days`) so closed workflow histories are automatically purged from Temporal persistence after completion.
- **Nightly Compliance & Retention Sweeper Schedule:** Run a recurring Temporal Schedule (`agent-background` queue) that purges expired `SessionStore` transcripts, soft-archived and `expiresAt`-expired `MemoryStore` records, orphaned `ArtifactSink` objects, and any pending offboarding erasure requests.

### Graceful Run Interruption: `steerSignal`, `abortSignal`, `CancellationScope` & Transcript Repair
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 35: Interrupting an Active Run Safely) -->

To allow engineers to pivot or halt multi-step workflows safely without orphaned subprocesses, indeterminate mutations, or broken message histories:

1. **Dual Temporal Control Signals (`steerSignal` & `abortSignal`):**
   - **`steerSignal(payload)`:** Buffers mid-run user redirections (`pendingSteeringMessages[]`) and injects them deterministically at the top of the next ReAct loop iteration—preserving already-gathered read context while pivoting strategy.
   - **`abortSignal(reason)`:** Triggered on UI **Stop** or `/stop`, cancelling active work immediately.
2. **Cooperative `CancellationScope` & Heartbeat-Driven Signal Delivery:**
   - Wrap `llmStepActivity` and `toolExecutionActivity` inside a Temporal `CancellationScope`. All long-running activities emit periodic heartbeats (`2–5s`) so `scope.cancel()` delivers `Context.current().cancellationSignal` immediately—severing upstream LLM HTTP streams and sending `SIGTERM` -> `SIGKILL` + workspace teardown to sandbox containers.
3. **Atomic `nonCancellable` Commit Windows + Saga Compensation:**
   - Wrap short (`< 2s`), single-request external mutations in `CancellationScope.nonCancellable(...)` so external state never halts mid-packet. If `abortSignal` arrives during or immediately after an atomic commit, execute the LIFO Saga `compensations` stack to roll back committed side effects cleanly.
4. **Synthetic `tool_result` Repair on `CancelledFailure`:**
   - Catch `CancelledFailure` in the workflow loop and append a synthetic `toolResult` (`{ status: 'CANCELLED_BY_USER', message: 'Execution halted by user interrupt.' }`) for every pending `toolCallId`, preserving strict `(assistant tool_call -> tool_result)` pairing so subsequent turns never fail with provider `400 Bad Request` errors.

### Multi-Day Stateless Workflow Suspension, Escalation Timers & Wake-Up Drift Checks
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 36: Resuming Paused Workflows Across Days) -->

Temporal workflows can remain suspended for days without holding worker RAM, open sockets, or active sandboxes, provided pre-suspend cleanup and wake-up re-validation are enforced:

1. **Zero-Resource Pre-Suspend Teardown:**
   - Before entering `Workflow.condition(...)` for an HITL approval, clarification, or SSO wall, destroy any active sandbox container and close any Playwright instance (persisting KMS-encrypted `storageState` to `ArtifactSink` if required).
2. **Idempotent `checkpointId` Deduplication & Stepped Escalation Timers:**
   - Tag every suspension point with a unique `checkpointId` (UUID) in workflow state and ignore duplicate signals referencing an already-settled `checkpointId`.
   - Structure long waits as stepped `Workflow.condition` intervals (`24h` reminder nudge -> `72h` owner-group escalation -> `7d` terminal auto-expiration) so forgotten approvals do not hang indefinitely.
3. **Mandatory Wake-Up State-Drift Guard (`> 15m` Staleness Threshold):**
   - Whenever a workflow resumes after sleeping longer than `15 minutes`, execute `reverifyPreconditionsActivity` before running the approved mutation. Compare live Catalog `metadata.etag`, Git `HEAD` commit SHA, or Kubernetes `resourceVersion` against the pre-pause snapshot; if state drifted, abort the mutation, regenerate a fresh `dryRun` diff, and re-prompt for confirmation.

### Single-Writer Temporal State Machine & Serialized Mem0 Writer Workflows
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 37: Split-Brain State Across Devices) -->

To prevent split-brain state across horizontally scaled Kubernetes pods and concurrent multi-surface clients (Backstage Web UI, Slack, CLI, webhooks):

- **Shard-Level Single-Writer Workflow Execution:** Backstage API pods and Temporal Worker pods remain 100% stateless. Temporal's shard-level history locking guarantees at-most-one active state transition per `workflowId` globally across rolling deploys and pod auto-scaling.
- **Per-Scope Serialized Mem0 Writer (`memory-writer-${tenantId}-${scopeId}`):** Because Mem0's `add()` pipeline performs read-modify-write LLM deduplication (`ADD` / `UPDATE` / `DELETE`), concurrent post-turn activities targeting the same `userId` or `entityRef` can race and produce contradictory facts. Serialize all Mem0 writes per `(tenantId, scopeType, scopeId)` using a dedicated single-writer Temporal entity workflow (or per-scope distributed mutex inside the extraction activity).

### Hybrid Cloud/Local Routing via User-Scoped Temporal Task Queues
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 38: Local vs. Cloud Capability Routing) -->

Rather than building custom inbound WebSocket tunnels through corporate firewalls, hybrid workstation execution uses outbound-polling Temporal workers:

- **Tenant- & User-Scoped Local Task Queues (`local-node:${tenantId}:${userEntityRef}`):** When permitted by tenant security policy (`allowLocalCompanionNodes`), an authenticated Local Companion CLI (`@internal/backstage-agent-node`) polls a dedicated user-scoped Temporal Task Queue outbound over mTLS/HTTPS.
- **Live Poller Presence & Fast Lid-Close Failover (`scheduleToStartTimeout: '10s'`):** Before scheduling a local activity, the runtime checks active poller presence via Temporal `describeTaskQueue` and a 15-second Redis heartbeat. Every local activity enforces `scheduleToStartTimeout: '10s'` so if a developer closes their laptop mid-run, Temporal fails fast and falls back to cloud capabilities rather than stalling.

### Temporal Worker Memory & Concurrency Governance
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 39: Runaway Processes and Resource Leaks) -->

- **Bounded Worker Concurrency & Cache Sizing:** Configure Temporal Workers with explicit `maxConcurrentActivityTaskExecutions`, `maxConcurrentWorkflowTaskExecutions`, `maxCachedWorkflows`, and Temporal's **Resource-Based Tuner** (targeting CPU/memory utilization watermarks) so traffic spikes queue cleanly in Temporal Server rather than exhausting Node.js V8 heap memory.

### Connectivity-Degraded Holds & Local-Node `15s` Heartbeat Failover
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 40: Network Offline and Captive Portal Handling) -->

- **Two-Tier Network-Loss Handling:**
  - Brief socket drops (`ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `ConnectivityDegradedError`) retry with capped exponential backoff (`maximumInterval: '5m'`) without burning terminal failure budgets.
  - Sustained connectivity loss transitions background workflows into a durable `Workflow.condition` hold backed by a lightweight periodic reachability probe activity rather than failing workflows permanently.
- **Local Workstation Lid-Close Detection (`heartbeatTimeout: '15s'`):** Activities routed to `local-node:${tenantId}:${userEntityRef}` enforce a `15s` `heartbeatTimeout`. If a developer closes their laptop mid-task, Temporal detects the missed heartbeat within 15 seconds, pauses the step cleanly without wasting LLM tokens, and offers a cloud-fallback option.

### Hierarchical Sub-Agent Budget Slicing & Run Spend Enforcement
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 41: Financial Spend Caps and Runaway Loops) -->

- **Upfront Sub-Agent Budget Carving:** Before spawning a Temporal Child Workflow (`executeChild` / `startChild`), the parent workflow carves an explicit sub-budget (`childBudget <= remainingParentBudget * 0.5`) and reserves it upfront in the Redis spend ledger, crediting back unused balance when the child completes. Even if a bug spawns multiple sub-agents, total tree spend cannot exceed the root workflow's original cap.
- **Deterministic `80%` Downgrade / `100%` Halt:** `llmStepActivity` checks the run's remaining budget before every inference call—downshifting `reasoning-tier` to `fast-triage-tier` at `80%` and raising a non-retryable `BudgetExceededError` at `100%`.

### Zero-LLM Out-of-Band Kill Switch & Temporal Activity Interceptors
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 45: Out-of-Band Disaster Recovery ("Break Glass")) -->

Platform SREs can freeze or restrict the entire agent fleet in `< 50ms` without relying on the LLM or Backstage UI:

1. **Temporal Activity Inbound Interceptor Kill-Switch Check:**
   - Before every `llmStepActivity` and `toolExecutionActivity` executes, an Activity Inbound Interceptor performs a single `MGET` against fast Redis control keys (`agent:killswitch:global`, `agent:killswitch:tenant:${tenantId}`, `agent:killswitch:tenant:${tenantId}:team:${ownerGroup}`, `agent:killswitch:tool:${capabilityId}`):
     - **`PAUSED_ALL`:** Halts inference and tool execution immediately without dropping in-flight workflow state; the workflow suspends deterministically until the pause flag clears.
     - **`READ_ONLY_SAFE_MODE`:** Deterministically blocks all `WRITE_LOW` and `WRITE_HIGH` activities while allowing read-only Catalog/TechDocs triage to remain online during an incident.
2. **Direct Temporal Server SRE Emergency Runbook:**
   - Maintain pre-tested `temporal workflow terminate` / batch-signal CLI runbooks using Temporal Visibility queries (`WorkflowType="AgentRunWorkflow" AND ExecutionStatus="Running"`) so SREs can drain or terminate runaway workflows directly against Temporal Server even if Backstage pods are unreachable.

### Voice-to-Temporal Boundary & Barge-In Signal Bridging
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 46: Voice, Audio, and Real-Time Interruption) -->

- **Zero Raw Audio Frames in Temporal History:** Real-time PCM/Opus audio streams and word-by-word TTS packets never traverse Temporal Workflows or Activities; Temporal receives only finalized, DLP-scrubbed text intents and emits structured action milestones.
- **Voice Barge-In Signal Mapping:** Spoken mid-execution redirections (*"Wait—check `auth-service` instead"*) translate directly into `steerSignal` or `abortSignal` invocations on the active session's Temporal Workflow.

### Workflow-Pinned `modelGenerationProfile` Across Long-Lived Runs
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 47: Prompt and Skill Decay Across Model Generations) -->

- **Immutable Run Model Profile:** Capture `modelGenerationProfile` and `promptVersion` in the Temporal Workflow's initial input state at start time so workflows suspended across days (HITL approvals or auth walls) do not experience incompatible prompt-format shifts mid-execution during rolling model upgrades.

### Post-Restore Temporal Schedule & Paused-Workflow Verification
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 48: Backup Verification and Restore Drills) -->

- **Clean-Room Temporal Recovery Assertions:** Automated DR restore drills verify that Temporal Schedules resume cleanly from synchronized PITR state, `DataConverter` decrypts persisted workflow payloads without key-version mismatches, and suspended HITL workflows replay deterministically from checkpoint state.

### Cross-Team Sibling Workflow Collision Detection
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 51: Multi-Agent & Cross-Team Workflow Coordination ("The Organizational Collision Problem")) -->

- **Active Sibling Mutation Check:** Before dispatching a `WRITE_HIGH` activity, the Temporal execution layer checks active sibling workflows via Temporal Visibility tags (`targetEntityRef`, `systemRef`, `status = "Running"`) and Redis blast-radius leases—suspending or surfacing a structured collision warning (`SIBLING_MUTATION_IN_PROGRESS`) with the conflicting workflow ID and owning team if an upstream or downstream dependency is currently mid-mutation.

### Monthly Knowledge-Promotion Consolidation Workflow
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 52: Organizational Memory vs. Personal Memory Governance (Who Owns Learned Knowledge?)) -->

- **Scheduled TechDocs / Skill PR Proposal:** A monthly Temporal Schedule (`agent-background` queue) queries `agent_memories_canonical` for active, high-retrieval-count `entityRef` memories lacking a `promotedPrUrl`, runs DLP secret/PII scrubbing plus `generateObject` synthesis, and opens a Branch-and-PR update against the target component's TechDocs repository for team owner review.

### Paused-Run Connection Recovery (`reconnect_required`)
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section B: Connection and consent UX) -->

- **Deterministic Resume After Re-Auth:** When a capability raises a non-retryable `AuthenticationRequiredError` / `reconnect_required` status, the workflow suspends at its checkpoint (`checkpointId`) and resumes automatically only after the Token Broker emits a verified `connectionRestored` signal matching the run's original `providerInstanceId` and `providerAccountId`.

### Mid-Run Access Revocation Policy, Re-Consent State Transitions & Retry Idempotency
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section F: Temporal and long-running behavior) -->

Temporal workflows persist only opaque identifiers (`tenantId`, `userEntityRef`, `grantId`, `providerInstanceId`, `checkpointId`)—never raw access or refresh tokens—and enforce explicit state transitions when user access changes mid-run:

1. **Per-Action Authorization & Standing Recheck:**
   - Every `toolExecutionActivity` re-evaluates user standing, Backstage RBAC (`PermissionsService`), and Token Broker grant validity immediately before execution rather than trusting run-start authorization.
2. **Explicit State Transitions on Mid-Run Access Loss:**
   - **Recoverable Grant Expiry / Upstream Disconnect (`RUNNING` -> `AWAITING_REAUTH`):** If the user remains active and RBAC-authorized in Backstage but their provider grant expired or requires re-consent, suspend the workflow via `Workflow.condition` with a bounded TTL (`24h`–`7d`) and notify the user.
   - **User Offboarded / Disabled or RBAC Revoked (`RUNNING` -> `TERMINATED_ACCESS_REVOKED`):** If the Backstage `User` is disabled/deleted or loses required RBAC permissions mid-run, fail closed immediately without offering reconnection, cancel pending HITL gates, and log an `AuditLogSink` termination record.
   - **TTL Expiration (`AWAITING_REAUTH` -> `EXPIRED`):** If re-consent is not completed within the suspension TTL, transition cleanly to `EXPIRED` and update any pending UI/Slack cards.
3. **Identity-Verified Reconnection Resume:**
   - An `AWAITING_REAUTH` workflow resumes only upon receiving a Token Broker-signed `reauthCompleted` signal confirming the exact `runId`, `checkpointId`, `initiatingUserRef`, `providerInstanceId`, and `providerAccountId`.
4. **Orthogonal Write Idempotency Across Retries:**
   - Obtaining a valid or refreshed token from the broker does not deduplicate external side effects; mutating activities must still enforce deterministic `Idempotency-Key` headers (`${workflowId}:${stepIndex}:${toolCallId}`) and OCC version stamps across Temporal retries.

### Temporal Payload Codec Encryption, Failure Converter & Codec Server Governance
<!-- Source: incoming/TOOLS_TEMPORAL_PAYLOAD_CODEC.md (Sections: Why credentials should stay out of Temporal, What the payload codec does, What encryption does not automatically cover, What the optional codec server does) -->

Temporal coordinates execution while activities obtain authority at execution time. Sensitive workflow payloads (prompts, incident descriptions, API responses, PHI) are protected via a two-layer defense:

1. **Zero Credentials in Temporal Payloads + Trusted Run Binding:**
   - Never pass raw access tokens, refresh tokens, or API keys in workflow/activity inputs, outputs, or signals—even when payload encryption is active. Pass only minimal references (`{ runId, principal, standingRef, changeRef }`), which `CapabilityGateway` validates against the authoritative `RunStore` record before resolving credentials in memory.
2. **KMS-Backed `PayloadCodec` (Fail-Closed):**
   - Configure a custom AES-256-GCM `PayloadCodec` (`encoding: 'binary/encrypted'`, `encryption-key-id` metadata) on **all** Temporal Clients and Workers backed by KMS/Vault keys.
   - **Fail-Closed Guarantee:** If KMS is unreachable, the codec fails explicitly rather than writing plaintext payloads. Retain historical key versions across rotations for the full namespace retention period.
3. **Custom `FailureConverter` & Unencrypted Metadata Hygiene:**
   - Because `PayloadCodec` does not cover `workflowId`, task-queue names, Temporal Search Attributes, or uncaught exception strings, never place PII/PHI or sensitive text in workflow IDs or search attributes, and configure a custom **`FailureConverter`** to scrub/encrypt failure messages and stack traces before persistence.
   - Offload large or highly sensitive payloads to KMS-encrypted `ArtifactSink` storage and pass only opaque URI references in Temporal history.
4. **Explicit Operational Choice on Codec Server:**
   - Omit the Temporal Codec Server by default in regulated deployments (workers and clients decrypt in-process without it). If operator UI/CLI inspection is required, deploy the Codec Server behind private network/VPN boundaries with OIDC authentication, `X-Namespace` RBAC authorization, and mandatory audit logging on every `/decode` and `/download` call.

### Pinned `catalogDigest` & Deterministic Capability References in Workflows
<!-- Source: incoming/TOOLS_REGISTRY.md (Sections: What the registry should own, Fit with B/C and the possible D deployment, Minimum acceptance tests) -->

- **Deterministic Workflow Capability References:** Temporal workflow code never performs registry network lookups, holds driver instances, or carries credentials. Workflow state carries only `capabilityId`, validated arguments, `principal` / `standingRef` references, and the run's pinned `catalogDigest`.
- **API vs. Worker Digest Skew Governance:** Temporal workers verify their loaded `catalogDigest` against the workflow's pinned `catalogDigest` at activity execution time—failing closed (or routing to version-pinned task queues during rolling upgrades) if an unapproved version mismatch occurs.

### External Change-Management & HITL Approval State-Machine Integration
<!-- Source: incoming/TOOLS_CATEGORIES.md (Section: Approval) -->

- **Unified Approval Lifecycle Signals:** Temporal workflows orchestrating `approval` capabilities support full lifecycle transitions beyond binary yes/no—persisting `requestId` state across `approveRequest`, `rejectRequest`, `reassignApprovalRequest` (delegating to alternate reviewers), `escalateApprovalRequest` (timer-driven escalation), and `cancelApprovalRequest` (recall/closure), whether backed internally by Temporal or bridged via webhooks/polling to ServiceNow, Jira Service Management, or GitHub Environments.

### Parallel Multi-Destination Category Fan-Out Activities
<!-- Source: incoming/TOOLS.md (Section: The Workflow Orchestrator Multi-Dispatch Execution Blueprint) -->

- **Fault-Isolated Concurrent Fan-Out:** When a workflow broadcasts an intent across multiple authorized capabilities in a category (e.g., `communication` + `incident-management`), dispatch each capability as an independent parallel Temporal Activity (`Promise.allSettled`) with its own deterministic `Idempotency-Key` (`${workflowId}:${stepIndex}:${capabilityId}`) and Saga compensation entry—preventing a transient failure on one destination from causing duplicate retries on already-delivered destinations.

### Dual-Mode Message Queues (`steering` vs. `followUp`) & Source-Ordered Parallel Tool Execution
<!-- Source: incoming/PI_AGENT.md (Sections: Agent Loop Step 1 & Step 4) -->

- **Dual-Mode Mid-Run User Message Routing:** Distinguish incoming user messages while a workflow is active into **`steering`** signals (injected immediately before the next reasoning/tool step to redirect in-flight work) versus **`followUp`** messages (queued cleanly to execute after the current turn completes).
- **Parallel Tool Execution With Deterministic Source-Order Reassembly:** When a single LLM turn emits multiple independent read-only tool calls, execute their Temporal Activities concurrently (`Promise.allSettled`) while appending `toolResult` entries back into the conversation transcript in the LLM's exact original `toolCallId` emission order.

### Temporal Child-Workflow Sub-Agent Orchestration & Session Isolation
<!-- Source: incoming/PI_AGENT.md (Section: Step 4 (Execute Tools): Multi-Agent & Session Orchestration) -->

- **Durable Sub-Agent Delegation (`sessions_spawn` -> Temporal Child Workflows):** Sub-agent delegation spawns an isolated Temporal Child Workflow (`promptMode: 'minimal'`, `maxSubAgentDepth: 1`, strictly narrowed `allowedCapabilityIds`, and shared parent FinOps token/cost budget) rather than an untracked in-memory process.
- **Strict Parent-Tree Scoping on Session Inspection (`sessions_list` / `sessions_send` / `session_status`):** Cross-session inspection and message injection tools are scoped exclusively to child workflows belonging to the active parent `runId` (and verified against `(tenantId, userEntityRef)`), preventing cross-user or cross-tenant session enumeration and prompt injection.

### Mid-Batch Steering Interruption & Synthetic `toolResult` Pairing
<!-- Source: incoming/PI_AGENT.md (Section: Tool Management — Mid-Batch Steering Interruption) -->

- **Valid Transcript Pairing on Mid-Batch Steering:** When a single LLM turn emits multiple tool calls and an urgent user `steering` signal arrives before all calls execute, the Temporal workflow cancels/skips the remaining unexecuted calls and appends synthetic `toolResult` records (`status: 'skipped'`, `reason: 'Skipped due to queued user steering message'`) for each skipped `toolCallId`—preserving strict `tool_use` <-> `tool_result` pairing required by Anthropic, OpenAI, and Gemini APIs.
- **Bounded Progress Streaming (`tool_execution_update`):** Long-running activities (sandbox execution, CI runs, IaC previews) emit DLP-scrubbed progress summaries directly to the run's Redis Stream alongside Temporal heartbeats, keeping Temporal event history compact while updating the UI in real time.

### Transient Activity Retries vs. Non-Retryable `isError: true` Tool Results
<!-- Source: incoming/PI_AGENT.md (Section: What Pi's API for Adding New Tools Looks Like) -->

- **Two-Class Tool Failure Boundary:** Temporal Activity workers distinguish transient infrastructure faults (`429`, `5xx`, socket timeouts -> retried automatically by Temporal with exponential backoff) from permanent domain/validation/policy errors (`404 Not Found`, `422 Invalid Argument`, `403 Denied` -> caught at the activity boundary and returned to the workflow as a sanitized `isError: true` `toolResult` so the LLM can adapt or report the issue cleanly).

### Temporal + Vercel AI SDK Dual-Layer Execution Split
<!-- Source: incoming/OVERALL_BLUEPRINT.md (Section: The Complete Component Architecture) -->

- **Control vs. Execution Separation:** Temporal owns durable workflow state, multi-turn chronological history, retry/compensation semantics, and HITL pause/resume lifecycles, while individual Temporal Activities invoke stateless Vercel AI SDK steps (`streamText` / `generateText`) and standardized MCP/provider capability drivers.

### Temporal Determinism Boundary for Memory Persistence
<!-- Source: incoming/MEM0.md (Sections: Architecture for Vercel AI SDK & Temporal) -->

Because Temporal workflows must remain strictly deterministic during replay, all Mem0 read/write operations are isolated inside **Temporal Activities**:

* **Workflow-to-Episode Anchoring:** Memory persistence activities receive `tenantId`, `userId`, and `temporalWorkflowId` (passed into Mem0's `runId`) to anchor distilled episodic summaries to the exact workflow execution that produced them.
* **Activity-Scoped Side Effects:** Embedding generation, safety screening, Promotion Gate transactions, and Mem0 API calls execute exclusively inside non-deterministic activities with explicit retry policies and idempotency keys, never inside workflow functions.

### Temporal Dispatch for Asynchronous Memory Repair
<!-- Source: incoming/MEM0.md (Sections: Implementing Platform Features in Open Source Version) -->

To avoid introducing redundant queue infrastructure (such as BullMQ or Inngest) alongside our core execution plane, asynchronous memory self-healing runs as a **Temporal Workflow** (`memoryRepairWorkflow`):

* **Signal / Workflow Dispatch:** The Backstage feedback endpoint starts a detached Temporal workflow keyed by `memory-repair:${tenantId}:${memoryId}` (with `WorkflowIdReusePolicy` preventing duplicate concurrent repairs on the same record).
* **Activity Isolation:** Fetching the run trace, invoking `ModelExecutor` for conflict resolution, and committing atomic supersession or tombstone erasure execute inside retryable **Temporal Activities**, keeping workflow orchestration deterministic.

### Executing MCP Capabilities via Temporal Activities
<!-- Source: incoming/MCP.md (Sections: Model Context Protocol (MCP)) -->

To preserve Temporal workflow determinism, payload security, and HITL approval gates, MCP tools must **not** execute inline via `mcpClient.tools()` inside `llmStepActivity`:

* **Split Reasoning & Execution:** During `llmStepActivity`, pass only the pinned, schema-validated MCP tool definitions (without live `execute` handlers) to `generateText` / `streamText` so the LLM emits structured `toolCalls`.
* **Activity-Scoped MCP Client Lifecycle:** Execute the actual `tools/call` (or `readResource` / `getPrompt`) inside a dedicated `toolExecutionActivity`. Initialize the `@ai-sdk/mcp` client using Token Broker credentials, enforce drift/RBAC checks, handle MCP `elicitation` / `input_required` loops via Temporal Signals when user input is needed, and deterministically close both `mcpClient.close()` and `guardedFetch.close()` in a `finally` block.

### Preventing Worker Process Hoarding via Activity-Scoped MCP Calls
<!-- Source: incoming/MCP.md (Sections: Mapping External Services to their MCP Endpoints, Auth Brokering for External Service MCPs) -->

Temporal workers must remain stateless and horizontally scalable across pods:

* **No Long-Lived Cross-Step MCP Connections:** Workflows never hold open MCP client handles across activity boundaries. Each `toolExecutionActivity` establishes a transient, stateless Streamable HTTP MCP request, executes the single tool call, and tears down transport resources before returning the serialized result to the workflow.

### Multi-MCP Tool Orchestration Across Temporal Activities
<!-- Source: incoming/MCP.md (Sections: Writing MCP Servers) -->

When a workflow step combines tools from multiple MCP servers (such as a vendor read-only MCP and a custom internal write MCP):

* **No Direct `mcpClient.getTools()` Execution in Workflows:** `llmStepActivity` loads only pinned tool definitions (schemas + descriptions, stripped of `execute` handlers) and returns requested `toolCalls` to the Temporal workflow.
* **Per-Tool Activity Dispatch & Cleanup:** The Temporal workflow routes each requested tool call to `toolExecutionActivity`, which connects lazily to the target MCP server over Streamable HTTP, enforces HITL/RBAC gates for mutating tools, executes the single call, and closes the transport in a `finally` block.

### Temporal Trace Correlation & Activity-Scoped Telemetry Flush
<!-- Source: incoming/LLM_OBSERVABILITY_WITH_LANGFUSE.md (Sections: How Langfuse Integrates with Your Stack) -->

Long-running workflows (including multi-day Human-in-the-Loop approval pauses and activity retries) require unified trace correlation without breaking Temporal workflow determinism:

* **Workflow ID / Run ID as Root Trace Anchor:** When a workflow starts, propagate `temporalWorkflowId` and `temporalRunId` into activity execution metadata as the root Langfuse `traceId` (and parent span context). Every retry, child workflow (`sessions_spawn`), and post-HITL resumption binds automatically to the same hierarchical trace.
* **Activity-Only Span Emission & Flush:** Never emit network telemetry directly from deterministic workflow functions. All Langfuse spans (`fetchMem0Memory`, `llmStepActivity`, `toolExecutionActivity`) execute inside Temporal Activities and invoke `await langfuse.flushAsync()` prior to activity return so buffered spans are durably exported before worker shutdown.

### Temporal Bridge: Mapping Compiled Graph IR to Generic Workflows & Activities
<!-- Source: incoming/GRAPH_ORCHESTRATOR_INTEGRATION.md (Sections: The Plugin Architecture & Route Registry) -->

When `POST /api/agent-orchestrator/v1/workflows/:workflowId/execute` is invoked, the Core Orchestrator Backend bridges the declarative workflow definition into Temporal's deterministic execution model:

* **Compiled Graph IR Dispatch:** The fluent `WorkflowBuilder` compiles into a serializable graph configuration / intermediate representation (IR) registered in `AgentWorkflowRegistry`.
* **Deterministic Workflow Loop + Activity Step Execution:** Because Temporal workflow code must be strictly deterministic during replay, user-authored step handlers (`async (state, ctx) => ...`) that invoke LLMs, call external APIs via `CapabilityGateway`, or query memory never run directly inside the workflow function. Instead, a generic deterministic Temporal Workflow traverses the compiled graph topology, manages state transitions, checkpoints, and HITL signal waits, and dispatches each step handler as a **Temporal Activity**.

### `GenericAgentOrchestrator` Temporal Workflow Execution Loop
<!-- Source: incoming/GRAPH_ORCHESTRATOR_INTEGRATION.md (Sections: Core Engine Execution Flow, The Generic Temporal Workflow Concept) -->

The core engine runs a single generic, deterministic Temporal Workflow (`GenericAgentOrchestrator`) capable of executing any registered Graph IR blueprint without requiring per-agent Temporal workflow definitions:

#### 1. Execution Lifecycle
1. **Pinned Blueprint Resolution:** At workflow initialization, `workflowActivities.getWorkflowBlueprint({ workflowId, tenantId })` resolves and pins the compiled Graph IR (`initialState`, `steps`, `choices`, and `outcomes`) into Temporal's durable event history so mid-flight plugin deployments cannot alter step ordering during replay.
2. **Step Execution Activity:** Each node runs inside `workflowActivities.executeStepActivity(...)` with configured retry policies and heartbeats, returning compact `stateMutations` (offloading large outputs to `ArtifactSink` to stay well below Temporal's 2 MB payload limit).
3. **Conditional Choice Routing & Loop Guard:** After each step, `workflowActivities.evaluateChoiceActivity(...)` (or deterministic expression evaluation over compact state) resolves the next target node, enforcing a strict `maxSteps` iteration ceiling to prevent infinite graph cycles.
4. **Terminal Outcome Handling:** When routing reaches a terminal outcome (`completeWithoutAction`, `insufficientEvidence`, or final completion), `workflowActivities.executeTerminalOutcome(...)` persists final audit/episodic state before exiting cleanly.

### Temporal Worker Deployment Topologies: Embedded vs. Dedicated Worker Pool
<!-- Source: incoming/GRAPH_ORCHESTRATOR_INTEGRATION.md (Sections: The Workflow Lifecycle in a Monolith, Embedded vs. Pooled Temporal Workers) -->

The platform supports two deployment modes for Temporal workers while sharing identical workflow and activity definitions:

#### 1. Embedded Mode (Local Dev & Low-Volume Deployments)
* The Temporal worker (`Worker.create(...)`) runs in-process inside the Backstage backend plugin (`plugins-agent-orchestrator-backend`), reading live `WorkflowBuilder` step handlers directly from the in-memory registry with zero extra container orchestration overhead.

#### 2. Dedicated Worker Pool Pattern (Production Scale)
For production environments running heavy LLM reasoning loops, embedding pipelines, or long-lived tool executions, worker execution is stripped out of the Backstage API pods (`worker.embedded: false`) and isolated into a dedicated, horizontally autoscaled Node.js **Temporal Worker Pool**:

| Architectural Dimension    | Backstage Control-Plane API Tier                             | Dedicated Temporal Worker Tier                               |
| :------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| **Primary Responsibility** | Serves Backstage UI/Catalog, authenticates callers (`httpAuth`), validates inputs, and starts/signals Temporal workflows. | Polls Temporal task queues via outbound gRPC and executes deterministic workflows + heavy LLM/tool/memory activities. |
| **Network Posture**        | Exposes ingress HTTP APIs behind Backstage auth/RBAC.        | **Zero inbound ports / zero ingress required**; opens outbound-only gRPC connections to the Temporal cluster. |
| **Scaling Signal**         | Scaled on HTTP request rate and Backstage user concurrency.  | Scaled independently on Temporal task queue backlog depth, CPU, and memory. |
| **Failure Blast Radius**   | Worker spikes or OOMs never degrade Backstage Software Catalog or TechDocs availability. | Pod crashes/restarts pause in-flight steps safely and resume from the last Temporal checkpoint. |

#### 3. Shared Monorepo Package Structure & Worker Bootstrapping
* **Decoupled Workflow Libraries:** Author domain workflows (Zod schemas, Graph IR builders, and step handlers) in shared workspace libraries (e.g., `@internal/workflows-*`) free of Backstage HTTP server dependencies so both the Backstage backend module and the minimal Temporal worker image import the exact same workflow code.
* **Production Activity Context & Lifecycle:** Inside the dedicated worker process, `executeStepActivity` resolves the target handler from the shared workflow registry, hydrates a real tenant-scoped `StepExecutionContext` (`ModelExecutor`, `MemoryManager`, `CapabilityGateway`, `ArtifactSink`, structured `LoggerService`—never a mock context), and wires `SIGTERM`/`SIGINT` to `worker.shutdown()` for clean task draining.

### Decoupled Worker Interceptors: Context Propagation, Logging & OpenTelemetry
<!-- Source: incoming/GRAPH_ORCHESTRATOR_INTEGRATION.md (Sections: Auth, Logging, and Telemetry in a decoupled worker pool.) -->

When running a dedicated Temporal Worker Pool outside the Backstage process, three runtime interceptors maintain identity continuity, structured logging parity, and unbroken distributed traces across the gRPC boundary:

#### 1. Identity & Grant Reference Propagation (`ContextPropagator` + `ActivityInboundInterceptor`)
* **Zero Raw Tokens in Temporal Headers:** Never inject raw Backstage user JWTs or downstream OAuth tokens into Temporal payload headers (`backstage-user-token`). Raw tokens risk persistence in Temporal event histories and expire during long-running HITL pauses or activity retries.
* **Opaque Context Propagation:** The Backstage `TemporalClient` outbound interceptor propagates verified caller claims (`tenantId`, `userId`, `actorEntityRef`, `sessionGrantRef`, and `traceparent`) in Temporal headers.
* **Worker Activity Binding:** On the worker, `WorkerAuthInterceptor` (implementing `ActivityInboundInterceptor`) extracts these verified identity claims from `input.headers` and binds them into `AsyncLocalStorage` / `StepExecutionContext`. When a step invokes `CapabilityGateway`, the **Token Broker** exchanges `sessionGrantRef` for a fresh, short-lived downstream token just-in-time.

#### 2. Backstage-Consistent Worker Logging (`Runtime.install`)
* Standalone worker containers instantiate a structured **Winston** JSON logger matching Backstage's production log schema (`timestamp`, `level`, `service`, `workflowId`, `runId`, `activityId`, `tenantId`) with a secret-redaction filter, and register it globally via `Runtime.install({ logger })` so both Temporal SDK internals and step handlers emit uniform logs.

#### 3. Distributed Trace Stitching (`@temporalio/interceptors-opentelemetry`)
* Both the Backstage `TemporalClient` (`OpenTelemetryWorkflowClientInterceptor`) and the dedicated `Worker` (`OpenTelemetryActivityInboundInterceptor`) register Temporal's OpenTelemetry interceptors so spans initiated in Backstage HTTP handlers stitch seamlessly to remote worker activities, `ModelExecutor` LLM calls, and Langfuse traces.

### Out-of-Process Activity Context Hydration & Serialization Boundary
<!-- Source: incoming/GRAPH_ORCHESTRATOR_INTEGRATION.md (Sections: Shared Memory in Backstage Backend Modules vs. Temporal Workers) -->

Because dedicated Temporal workers execute in a separate Node.js process outside Backstage's in-memory Dependency Injection (DI) container, they cannot access live Backstage `coreServices` instances (`coreServices.database`, `coreServices.httpAuth`, or `coreServices.logger`). Every value crossing the Backstage-to-Temporal boundary must be a JSON-serializable primitive.

#### 1. In-Memory DI vs. Out-of-Process Worker Boundary

| Operational Capability      | Inside Backstage Control Plane (In-Memory DI) | Inside Dedicated Temporal Worker (Out-of-Process)            |
| :-------------------------- | :-------------------------------------------- | :----------------------------------------------------------- |
| **Identity & Auth**         | `coreServices.httpAuth` / `UserInfoService`   | Verified identity claims (`tenantId`, `userId`, `sessionGrantRef`) unpacked via `WorkerAuthInterceptor` (never raw JWTs in activity inputs). |
| **Capability Execution**    | Direct `CapabilityGateway` service injection  | Standalone `CapabilityGateway` client wired to the **Token Broker** and framework-agnostic `agent-drivers` / MCP clients. |
| **Logging**                 | `coreServices.logger`                         | Standalone secret-redacting **Winston** child logger (`{ workflowId, runId, stepName, tenantId }`). |
| **Persistence & Artifacts** | `coreServices.database` (Knex)                | Direct `ArtifactSink` / `RunStore` persistence for large blobs; lightweight `stateMutations` + `ArtifactReference[]` returned over gRPC. |

#### 2. `executeStepActivity` Hydration Lifecycle
1. **Handler Lookup:** Resolve the pure step handler from the shared workflow definition package by `workflowId` and `stepName`.
2. **Context Hydration:** Construct a tenant-scoped `StepExecutionContext` binding `ModelExecutor` (for `ctx.ai.*`), `CapabilityGateway` (for `ctx.tools.invoke`), `MemoryManager`, `ArtifactSink`, and the scrubbed Winston child logger.
3. **Deterministic Clock Injection:** Supply workflow-anchored timestamps (`ctx.config.now`) derived from Temporal workflow time rather than uncoordinated local wall clocks where determinism matters.
4. **Compact Wire Return:** Persist bulky artifacts via `ArtifactSink` during the activity and return only compact `stateMutations` and `ArtifactReference[]` back to the Temporal workflow history.

### Compiling `.addStep()` Safeguards into Temporal Execution Semantics
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addStep(name, handler, options?)) -->

The Generic Temporal Orchestrator translates declarative `StepOptions` into durable runtime guarantees:

* **Saga Compensation Stack:** Whenever a step defining `onRollback` succeeds, its step identifier and input snapshot are pushed onto a durable compensation stack in Temporal workflow state. If a downstream step fails fatally without recovery, the workflow unwinds the stack in strict LIFO (reverse) order, executing each `onRollback` compensation as a retryable Temporal activity.
* **Activity Timeout Budgeting:** `StepOptions.timeout` maps directly to Temporal's `startToCloseTimeout`. If a step also uses inner `ctx.resilience.runWithRetry` for transient sub-calls, the inner retry budget must stay strictly bounded below the outer activity timeout.
* **HITL Escalation & Override Suspension:** Both `onUnauthorized: { strategy: 'escalate-to-approval' }` and `onMaxRetriesExceeded` admin-override paths suspend the workflow cleanly via `condition(() => resolved)` and resume upon receiving a signed Backstage control-plane Temporal Signal.

### Out-of-Band Stream Relay for `.addStreamingStep()` Activities
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addStreamingStep(name, handler, options?)) -->

To keep Temporal workflow histories lightweight (well below the 2 MB payload limit) while still delivering real-time token streams from decoupled worker pods:

* **Activity-to-Relay Emission:** Inside the Temporal streaming activity, `ctx.ai.streamText` publishes ordered `agent:stream_chunk` events (`{ tenantId, instanceId, stepName, seq, delta }`) to the platform's low-latency stream relay (Redis Pub/Sub / SSE broker) and heartbeats the activity periodically so long generations do not trigger false worker timeouts.
* **Durable Checkpoint at Stream End:** Only the final consolidated output reference and compact `Partial<TState>` delta are returned across the gRPC wire into Temporal's durable event history.

### Temporal Replay Determinism for `.addChoice()` Routing
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addChoice(name, router)) -->

To preserve Temporal workflow replay determinism across both pure state checks and dynamic feature-flag reads:

* **Activity-Backed Choice Evaluation (`evaluateChoiceActivity`):** Because choice routers may inspect live runtime configuration (such as `ctx.config.getDynamicValue(...)`) that could change between initial execution and workflow replay, the Generic Temporal Orchestrator evaluates `addChoice` nodes inside `evaluateChoiceActivity` (or records the resolved target string in Temporal event history) so replay always follows the exact branch taken during initial execution.
* **Backward-Jump Loop Guard:** When a choice router jumps backward to an earlier step (e.g., `return 'selfCorrect'`), the orchestrator increments the workflow's step-execution counter and enforces `maxSteps` to prevent runaway infinite loops.

### Temporal `continueAsNew` History Compaction for `.repeatUntil()` Loops
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .repeatUntil(name, config)) -->

Long-running `.repeatUntil()` loops can generate thousands of activity events, risking Temporal's hard **50,000-event** per-execution history ceiling:

* **Automated `continueAsNew` Thresholding:** At every loop iteration boundary, the Generic Temporal Orchestrator inspects `workflowInfo().continueAsNewSuggested` and `workflowInfo().historyLength` against the configured storage threshold (e.g., `10,000` events).
* **Zero-Loss State Rollover:** When the threshold is exceeded, the workflow checkpoints the current `TState`, active loop cursor (`loopName`, `iterationCount`), and verified identity headers, and invokes Temporal `continueAsNew(...)` to continue the loop cleanly in a fresh history segment without losing state or trace correlation.
* **Iteration Ceiling Enforcement:** Enforces `maxIterations` (throwing `LoopIterationLimitExceededError` if breached) to prevent runaway token spend when an exit condition fails to converge.

### Deterministic Temporal Fan-Out / Fan-In for `.addParallelForEach()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addParallelForEach(name, config)) -->

To keep concurrent execution deterministic during Temporal replay while protecting worker pools and upstream APIs:

* **Bounded Chunked Fan-Out:** The Generic Temporal Orchestrator snapshots the `iterator(currentState)` array once before spawning branches (ensuring deterministic branch count on replay) and executes branches in bounded batches governed by `maxConcurrency` using deterministic `Promise.all` / `Promise.allSettled`.
* **Per-Branch Fault & Retry Isolation:** Each branch invokes its own Temporal Activity executions with independent retry policies. A transient timeout or retry on item #7 does not cancel or discard completed outputs from items #1–#6.
* **History Size Protection:** Large per-branch outputs (e.g., full repository scan reports) are persisted to `ArtifactSink` inside the branch activity, returning compact summaries + `ArtifactReference` pointers across the fan-in boundary so Temporal event history stays well below 2 MB.

### Deterministic Temporal Replay & Isolation for `.addHypothesisFork()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addHypothesisFork(name, config)) -->

* **Fixed-Order Branch Execution:** The Generic Temporal Orchestrator iterates over `Object.keys(config.branches).sort()` using deterministic `Promise.all` / `Promise.allSettled` so activity scheduling order remains identical across Temporal workflow replays.
* **Pure `merge` Execution in Workflow Thread:** Because `merge(branchResults, currentState)` is a pure deterministic function over completed branch states, it executes directly inside the Temporal workflow loop immediately upon branch join, recording the winning branch key and resulting state delta in workflow history.

### Temporal Signal Suspension & Activity Execution for `.requireApproval()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .requireApproval(name, config)) -->

* **Zero-Compute Durable Sleep (`condition`):** When the Generic Temporal Orchestrator reaches a `.requireApproval()` node, it emits an `agent:human_in_the_loop_required` status event (including the gate `name`, serialized prompt, and JSON Schema projection of `config.schema`) and suspends via Temporal `condition(() => signalReceived, timeout)`—consuming zero worker threads or polling loops while waiting.
* **Activity-Wrapped `onApprove` / `onReject` Handlers:** Because `onApprove` and `onReject` invoke external side-effecting capabilities (e.g., creating GitHub PRs or applying cluster rollouts), they execute inside retryable **Temporal Activities** upon signal receipt—never directly inside the deterministic workflow replay loop.
* **Approver Identity Propagation:** The signal payload carries the verified `approverUserId` and `approverEntityRef` into the activity `StepExecutionContext` so downstream capability calls run with full approver attribution.

### Temporal `condition()` Timeout Semantics & Signal Correlation for `.waitForSignal()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .waitForSignal(name, config)) -->

* **Durable Timer + Signal Race:** The Generic Temporal Orchestrator registers a Temporal Signal handler for `gateName`, evaluates incoming payloads against `signalSchema` and `matchCondition(payload, currentState)`, and suspends via `await condition(() => verifiedSignal !== undefined, timeout)`.
* **Deterministic Timeout vs. Signal Winner:** Temporal's durable timer guarantees that if `timeout` expires before a matching signal arrives, `condition(...)` returns `false` and the workflow executes `onTimeout` inside a retryable Temporal Activity—avoiding race conditions between late webhooks and timeout rollbacks.
* **Activity-Wrapped Side Effects:** Both `onSuccess` and `onTimeout` closures execute inside Temporal Activities so external capability calls (`rollbackManifest`, `compliance.attest`) retain retry semantics and replay determinism.

### Deterministic Checkpoint Hashing & Search Attribute Indexing
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .checkpoint(name)) -->

When the Generic Temporal Orchestrator crosses a `.checkpoint(name)` node:

* **Deterministic State Digest:** The workflow computes a deterministic canonical SHA-256 hash of the validated `TState` snapshot at that exact boundary and records a `CheckpointRecord` (`{ name, stateHash, workflowTime, stepIndex }`) in durable workflow state.
* **Temporal Visibility Indexing (`upsertSearchAttributes`):** Updates workflow search attributes (`LastCheckpoint = name`) so operators and control-plane queries can filter running or failed instances by their last committed macro phase without replaying full event histories.
* **Fault-Isolation Baseline:** If a downstream step fails unrecoverably, the orchestrator reports both the failing node and the last committed `.checkpoint()` baseline to aid safe operator triage and recovery.

### Temporal Retry & Determinism Guardrails for `.extend()` Middleware
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .extend(extensionPlugin)) -->

* **Activity-Scoped Middleware Execution:** `onStepRun` middleware chains execute inside `executeStepActivity` on the Temporal worker—never inside the deterministic workflow replay loop—so network calls (such as Slack alerts or OpenTelemetry exporters) remain replay-safe.
* **Retry-Attempt Awareness (`ctx.activityInfo`):** Because Temporal retries transient activity failures automatically, failure-notification extensions inspecting caught errors must check `ctx.activityInfo.isFinalAttempt` (or gate alerts on non-retryable errors) to avoid spamming alert channels on transient retries.

### Durable Spend Ledger & Saga Unwind on `BudgetExhaustionException`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureFinOps(config)) -->

To preserve accurate cost accounting across Temporal activity retries, parallel branches, and `continueAsNew` history rollovers:

* **Deterministic Workflow Spend Ledger:** Each completed activity returns its metered `stepCostUsd` (combining LLM token spend and `capabilityCostWeights`) as part of the activity result envelope. The Generic Temporal Orchestrator accumulates `totalSpendUsd` in durable workflow state (persisting across `continueAsNew` boundaries) and supplies the current ledger balance into `ctx.finops.getCurrentSpend()` for subsequent steps.
* **Atomic Pre-Step Gate & Saga Rollback:** Before scheduling the next step or capability activity, the workflow checks `totalSpendUsd >= maxWorkflowBudget.amount`. On breach, the workflow raises `BudgetExhaustionException` (marked non-retryable in Temporal) and executes the LIFO `onRollback` compensation stack so partially provisioned cloud resources are torn down cleanly.

### Temporal History Hygiene & WORM Archival Export for `.configureCompliance()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureCompliance(config)) -->

* **Zero Raw PHI/PII in Temporal Workflow History:** When steps fetch sensitive records (such as medical billing notes or financial ledgers), raw payloads stay inside `ArtifactSink` / encrypted storage referenced by opaque `artifactRef` handles—never serialized directly into `TState` or Temporal activity return payloads.
* **Immutable Regulatory Archival Export:** For workflows declaring long-term regulatory retention (e.g., `duration: '7-years'`, `immutableArchive: true`), a terminal archival activity packages the complete Temporal execution history, cryptographic checkpoint digests, and signed attestation receipts into an immutable WORM cold-storage archive (e.g., AWS S3 with Object Lock) upon workflow completion.

### Temporal Queue Throttling & Distributed Rate-Bucket Heartbeating
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureThrottling(config)) -->

To enforce `.configureThrottling()` deterministically across horizontally scaled Temporal worker pods:

* **Per-Tenant Concurrency Admission (`maxConcurrentRunsPerTenant`):** Before starting a new execution in `POST /v1/workflows/:workflowId/execute` (or via Temporal Visibility count / distributed semaphore), the control plane checks active running instances for `(tenantId, workflowId)`. Excess runs are queued cleanly rather than starving sibling tenants.
* **Task Queue Dispatch & Distributed Token Buckets:** Temporal worker `maxTaskQueueActivitiesPerSecond` provides coarse queue-level dispatch pacing, paired with a distributed Redis/PostgreSQL token-bucket limiter governing cross-pod `maxLLMTokensPerMinute` and `capabilityRateLimits`.
* **Activity Heartbeating During Throttle Waits:** When an activity pauses to await token-bucket replenishment (e.g., pacing a batch loop at `2 req/s` to GitHub Enterprise), the wrapper emits periodic Temporal activity heartbeats (`Context.current().heartbeat(...)`) and status telemetry so long throttled runs never trigger false `heartbeatTimeout` failures.

### Temporal `continueAsNew` Compaction Mechanics for `.configureStorage()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureStorage(config)) -->

When `historyOptimization.autoContinueAsNew` is enabled:

* **Event Count & Payload Size Triggers:** Before entering any step or loop turn, the Generic Temporal Orchestrator checks `workflowInfo().historyLength >= maxEventsBeforeSnapshot` (clamped safely below Temporal's 50,000-event hard limit) *or* `workflowInfo().continueAsNewSuggested` (which triggers early if history byte size grows large).
* **Complete Execution Envelope Rollover:** Prior to invoking `continueAsNew(...)`, the workflow drains any in-flight signal handlers (`condition(() => workflowInfo().handlersFinished)`), packages the validated `TState`, active graph/loop cursor, cumulative FinOps spend ledger (`totalSpendUsd`), committed checkpoint history, and propagated identity/OpenTelemetry headers, and resumes cleanly in a fresh Temporal `runId` under the identical `workflowId`.

### Temporal Versioning (`patched` / `getVersion`) & State Upgrade Mechanics
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureVersion(config)) -->

To evolve Graph IR topologies and `TState` shapes safely across rolling worker deployments:

* **Version Marker Injection (`Workflow.getVersion`):** The Generic Temporal Orchestrator stamps the workflow's starting `schemaVersion` at initialization and uses Temporal `getVersion` / `patched` markers around topology transitions so replaying historical events follows the exact path recorded when the run started.
* **On-Wakeup State Pipeline Upgrade:** When a sleeping workflow awakens on a newer worker deployment (`workerVersion > runSchemaVersion`), the orchestrator pipes `currentState` sequentially through `migrations['vX-to-v(X+1)']`, validates the output against the active `stateSchema`, updates `runSchemaVersion = currentVersion`, and resumes execution cleanly.
* **Combined Compaction + Upgrade Rollover:** When `autoContinueAsNew` triggers on a migrated run, the newly spawned execution thread starts cleanly at `currentVersion` with the upgraded `TState`.

### Activity-Scoped Execution of `.addInterceptor()` Lifecycle Hooks
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addInterceptor(interceptor)) -->

* **Activity Boundary Placement:** `onStepEnter` and `onStepExit` execute inside `executeStepActivity` alongside the step handler—never inside the deterministic Temporal workflow replay loop—so pre-flight checks, telemetry spans, and wall-clock timestamps (`workflowUpdatedAt`) are captured once and recorded in the activity's return delta.
* **Pre-Flight Failure Semantics:** Throwing inside `onStepEnter` (such as a missing `ctx.tenant.id` check) aborts the step before business logic or capability calls execute, propagating into standard retry or Saga compensation rules.

### Temporal `RetryPolicy` Compilation & Fast-Fail Circuit Breaking
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureResilience(config)) -->

* **Native Temporal `RetryPolicy` Mapping:** `.compile()` maps `WorkflowResilienceConfig` (and step-level `retryPolicy` overrides) directly onto Temporal activity `retry` options (`initialInterval`, `backoffCoefficient`, `maximumAttempts`, `maximumInterval`, `nonRetryableErrorTypes`), ensuring attempt counters and backoff timers survive worker pod restarts.
* **Fast-Fail Routing to Recovery Handlers:** When a non-retryable error or `CircuitBreakerOpenError` occurs—or when `maximumAttempts` is exhausted—Temporal immediately stops retrying the activity and routes control to the step's `onMaxRetriesExceeded` escape hatch or triggers the LIFO `onRollback` Saga compensation stack.

### Activity-Backed Terminal Outcome Execution & Visibility Indexing
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .setTerminalOutcome(name, handler)) -->

* **Durable Terminal Activity (`executeTerminalOutcome`):** When the Generic Temporal Orchestrator routes to a declared terminal outcome, it invokes `executeTerminalOutcome` as a retryable Temporal Activity so side effects (`ctx.notifications.send`, `ctx.emitArtifact`, `ctx.compliance.attest`, and WORM regulatory archival) execute safely outside the deterministic workflow replay loop.
* **Search Attribute Indexing & Clean Exit:** Upon activity completion, the workflow updates Temporal visibility attributes (`TerminalOutcome = name`), emits the final completion event, and exits the workflow function cleanly without executing subsequent linear steps.

### Blueprint Split Across Control Plane & Temporal Workers (`graphIR` vs. `handlers`)
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .compile()) -->

Separating `CompiledWorkflowBlueprint` into `graphIR` and `handlers` enables seamless execution in both embedded and pooled Temporal worker topologies:

* **`graphIR` in Workflow Orchestration:** The Generic Temporal Orchestrator consumes the pure JSON-serializable `graphIR` to traverse node order, enforce `StepOptions` timeouts/retries, evaluate `.configureFinOps()` / `.configureStorage()` thresholds, and track checkpoints deterministically.
* **`handlers` in Worker Activities:** Dedicated Temporal worker pods import the exported `CompiledWorkflowBlueprint` and look up live TypeScript functions from `blueprint.handlers` inside `executeStepActivity`, `evaluateChoiceActivity`, and `executeTerminalOutcome`—keeping non-serializable closures completely off the Temporal gRPC wire.

### Out-of-Process Worker Reconciliation for `ctx.auth.getPluginRequestToken()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.auth.getPluginRequestToken(options)) -->

Because standalone Temporal workers execute outside the Backstage Node.js process and lack in-memory access to Backstage's `coreServices.auth` key-signing singleton:

* **Token Broker Delegation (Never Raw History Replay):** Instead of calling in-memory Backstage `AuthService` directly or recording raw signed JWTs into Temporal event history (which violates secret-free history rules and fails on replay after token expiry), the worker's `StepExecutionContext` hydrates `ctx.auth.getPluginRequestToken()` as an RPC client to the platform **Token Broker** (or internal Backstage token-minting endpoint / workload OIDC exchange).
* **Activity-Scoped Execution Only:** Token minting and the outbound HTTP request occur within the same `executeStepActivity` invocation so the short-lived token is minted fresh on every retry attempt and discarded when the activity finishes.

### Temporal Determinism & History Size Protection for `ctx.cache.get()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.cache.get(key)) -->

* **Activity-Scoped Execution (Never in Choice Routers):** Because `ctx.cache.get()` is asynchronous and volatile (a key may expire between initial run and replay), it is exposed exclusively inside activity-backed step contexts (`.addStep()`, `.addStreamingStep()`)—never inside pure workflow-thread `.addChoice()` routers or `.repeatUntil()` predicates.
* **Keeping Large Cached Payloads Out of Temporal History:** Executing `ctx.cache.get()` inside `executeStepActivity` allows the step to inspect large cached artifacts (e.g., manifests or dependency trees) locally on the worker and return only a compact `Partial<TState>` delta (`{ isVulnerable: true }`), preventing large cached JSON blobs from bloating Temporal's 2 MB / 50 MB history limits.

### Temporal Activity Side-Effect & Retry Semantics for `ctx.cache.set()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.cache.set(key, value, ttlMs?)) -->

* **Activity-Scoped Execution & Replay Safety:** Because `ctx.cache.set()` executes inside `executeStepActivity` (never inside the deterministic Temporal workflow replay loop), Temporal history replays skip re-executing the activity body and replay only the step's returned `Partial<TState>` delta.
* **Idempotent Overwrites on Activity Retry:** If an activity fails mid-step *after* calling `ctx.cache.set()` and Temporal retries the activity attempt, `ctx.cache.set()` performs an idempotent `SET ... PX <ttlMs>` overwrite in Redis/Valkey without corrupting state.

### Temporal Activity Isolation & History Hygiene for `ctx.catalog.*`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.catalog.getSystemDependencies(systemId)) -->

* **Activity-Scoped Catalog Queries:** `ctx.catalog.getSystemDependencies()` executes exclusively inside `executeStepActivity` (never inside pure workflow replay loops). Because the live catalog can change between initial execution and workflow replay, Temporal replays the step's compact returned `Partial<TState>` delta from event history without re-querying the live catalog.

### Temporal Replay Determinism for `ctx.discovery.getBaseUrl()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.discovery.getBaseUrl(pluginId)) -->

* **Activity-Scoped Execution Only:** Service discovery topology can shift between pod deployments and cluster rollouts. `ctx.discovery.getBaseUrl()` is restricted to activity-backed steps (`executeStepActivity`)—never inside pure workflow `.addChoice()` routers—so Temporal replays the step's returned `Partial<TState>` delta deterministically from event history rather than re-resolving network routes during replay.

### Preventing Poison-Pill Pod Eviction Storms on `flagLivenessFailure()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.health.flagLivenessFailure(reason)) -->

If a worker pod kills itself via `/healthz` without quarantining the triggering activity, Temporal will treat the pod loss as a transient worker crash and immediately reschedule the exact same step onto healthy replacement pods—creating a cluster-wide pod-eviction storm. To prevent this:

1. **Quarantine Before Eviction:** `ctx.health.flagLivenessFailure(reason)` first reports a non-retryable terminal failure (`ApplicationFailure.nonRetryable(reason, 'WORKER_LIVENESS_EVICTION')`) to Temporal (or parks the workflow in an administrative triage state) so the poison-pill run is not automatically re-dispatched to fresh pods.
2. **Worker Probe Flip & Graceful Drain:** The worker pod's local health server flips `/healthz` to `503 Service Unavailable`, emits `agent:emergency_triage_active`, flushes pending audit/telemetry buffers, and initiates `worker.shutdown()` so Kubernetes recycles the container cleanly.

### Worker Graceful Shutdown & Cancellation Signal Wiring for `ctx.lifecycle`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.lifecycle.addShutdownHook(hookFn)) -->

* **Unified Shutdown & Cancellation Dispatch:** During `executeStepActivity`, the runtime maintains a per-activity `Set<() => Promise<void> | void>` cleared in the activity's `finally` block. If either the worker process receives `SIGTERM`/`SIGINT` (`worker.shutdown()`) or Temporal aborts the activity via `Context.current().cancellationSignal`, all active step shutdown hooks execute concurrently with a bounded per-hook timeout before the worker exits.
* **Durable State Handled by Temporal:** Shutdown hooks manage volatile OS/process resources only; Temporal automatically preserves completed step checkpoints and `TState` transitions across pod evictions.

### Temporal Replay & Activity-Retry Idempotency for `ctx.notifications.send()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.notifications.send(targetRef, content)) -->

* **Activity-Scoped Execution Only:** `ctx.notifications.send()` is exposed exclusively inside activity-backed step and terminal-outcome handlers—never inside pure workflow `.addChoice()` routers—so workflow replays never re-trigger notification side effects.
* **Retry Deduplication Key:** Because an activity could crash *after* sending a notification and before returning its state delta, every `ctx.notifications.send()` call injects a deterministic idempotency key (`${instanceId}:${stepName}:${callSeq}`) so the control-plane notification receiver deduplicates duplicate attempts across Temporal activity retries.

### Split-Execution & Workflow Suspension for `ctx.notifications.requestAction()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.notifications.requestAction(targetRef, responseSchema)) -->

To prevent long-lived human inbox tasks from holding Temporal worker threads open or timing out activities:

1. **Dispatch & Workflow Park:** The runtime persists a task transaction record (`taskId`, `tenantId`, `instanceId`, `targetRef`, JSON Schema projection, `expiresAt`) via a short-lived dispatch activity, notifies the Backstage inbox bridge, and suspends the parent Temporal Workflow via `await condition(() => taskSignalReceived, timeout)`.
2. **Deterministic Resume on Replay:** Upon receiving the validated Temporal Signal (`actionTaskResolved`), the workflow records `actionResult` in its durable event history and resumes execution from the continuation point without re-dispatching duplicate inbox cards during replay.

### Temporal Replay Safety & Fail-Closed Evaluation for `ctx.permissions.authorize()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.permissions.authorize(options)) -->

* **Activity-Scoped Policy Queries:** `ctx.permissions.authorize()` executes exclusively inside `executeStepActivity` (never inside pure workflow `.addChoice()` routers). During Temporal replay, the workflow replays the step's recorded `Partial<TState>` delta from event history rather than re-evaluating live RBAC policies that may have changed since initial execution.
* **Fail-Closed Policy Error Handling:** Transient network errors calling the policy evaluation bridge retry per the step's `retryPolicy`; persistent failures or unknown policy responses fail closed (`DENY` / authorization exception) and never default to `'ALLOW'`.

### Propagating `ownerPluginId` Across the Temporal Execution Envelope
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.plugin.getId()) -->

* **Immutable Envelope Metadata:** When `POST /v1/workflows/:workflowId/execute` starts a workflow, the control plane stamps the blueprint's verified `ownerPluginId` into Temporal `memo` / `searchAttributes` (`OwnerPluginId`) and activity headers—never trusting caller-supplied body overrides.
* **Deterministic Synchronous Access:** Because `ownerPluginId` is immutable for the lifetime of the workflow execution (including across `continueAsNew` rollovers), `ctx.plugin.getId()` executes synchronously with zero I/O and full Temporal replay determinism.

### Temporal Schedules Backing for `ctx.scheduler.scheduleTask()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.scheduler.scheduleTask(config)) -->

* **Native Temporal Schedule Provisioning:** Inside `executeStepActivity`, `ctx.scheduler.scheduleTask()` idempotently creates or updates a **Temporal Schedule** (`scheduleId = tenant:${tenantId}:${pluginId}:${id}`) configured to launch `GenericAgentOrchestrator` for `targetWorkflowId` on the `agent-workflows` task queue.
* **Cluster-Wide Single Execution & Overlap Control:** Temporal Schedules guarantee single-leader firing across horizontally scaled pods, persist across worker restarts, enforce `overlapPolicy` (defaulting to `'SKIP'` so slow sweeps do not pile up), and stamp `triggerType: 'scheduler'` plus verified `(tenantId, ownerPluginId)` metadata onto every triggered execution.

### Temporal Replay Determinism & Payload Bounds for `ctx.search.query()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.search.query(text, options)) -->

* **Activity-Scoped RAG Queries:** `ctx.search.query()` is restricted to activity-backed steps (`executeStepActivity`)—never inside pure workflow `.addChoice()` routers. During Temporal replay, the workflow replays the step's compact `Partial<TState>` output delta from event history rather than re-querying live search indices that may have been re-indexed since initial execution.
* **Per-Document Truncation:** The runtime enforces a maximum character ceiling per returned search document inside the activity so multi-megabyte TechDocs pages cannot exhaust worker memory or LLM context windows.

### Temporal Replay Determinism & Byte-Size Limits for `ctx.urlReader.readUrl()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.urlReader.readUrl(url)) -->

* **Activity-Scoped Execution Only:** `ctx.urlReader.readUrl()` is restricted to activity-backed steps (`executeStepActivity`)—never inside pure workflow `.addChoice()` routers—so Temporal replays the step's returned `Partial<TState>` delta deterministically from event history rather than re-fetching mutable remote repository files during replay.
* **Memory & History Ceiling:** The worker adapter enforces a streaming byte cap (`maxBytes`, defaulting to `5 MB`) while reading the response stream so oversized repository binaries cannot OOM worker containers or bloat Temporal event history.

### Activity-Scoped Profile Resolution & Zero-JWT History Rules for `ctx.userInfo`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.userInfo.getUserInfo(token)) -->

* **No Raw Tokens in Temporal History or `.waitForSignal()` Payloads:** External webhooks must authenticate via single-use signed callback tokens (`.waitForSignal()`), never by transmitting user session JWTs in webhook JSON bodies.
* **Activity-Only Execution:** `ctx.userInfo.getUserInfo()` executes exclusively inside `executeStepActivity` (never inside pure workflow `.addChoice()` routers), recording only the step's compact, PII-minimized `Partial<TState>` delta (`{ executingUserRef }`) in Temporal event history so replays never fail with `AuthTokenExpiredException` when original session tokens expire.

### Single Generic Workflow Interpreter & Discrete Activity Decomposition
<!-- Source: incoming/ARCHITECTURE_FILE_LAYOUT.md (Section: Proposed File Architecture -- worker/temporal & tests/temporal) -->

* **Generic Workflow Interpreter Pattern:** Rather than registering a separate Temporal workflow function per user-authored agent, the worker registers a single deterministic workflow (`dynamic-agent-executor.workflow.ts`) that interprets compiled JSON Graph IR definitions and coordinates signals/timers.
* **Side-Effect Activity Partitioning:** All non-deterministic operations execute inside discrete Temporal activities:
  * `llm-call.activity.ts` — Wraps Vercel AI SDK model invocations (using `@temporalio/ai-sdk` primitives safely).
  * `retrieval.activity.ts` — Executes chunking, embedding, vector search, and reranking.
  * `compliance-reporting.activity.ts` — Emits tamper-evident audit and compliance records.
  * Capability execution activities (see reconciliation note below).
* **Deterministic Replay Testing (`tests/temporal/`):** Temporal workflow suites test the generic interpreter against sample compiled Graph IR payloads (and must include `@temporalio/testing` workflow replay checks to prevent non-determinism regressions).

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
1. **Replace Generic `driver-proxy.activity.ts` with Governed `CapabilityGateway` Execution:** The early tree includes a generic `driver-proxy.activity.ts`. Per our hardened architecture (Option B/C/D `CapabilityGateway`), activities must never act as blind pass-through proxies; tool execution must route through `CapabilityGateway` using typed `CapabilityDescriptor` contracts, `HttpIntent` vs. `NativeAdapter` isolation, Token Broker credential injection (never raw tokens in Temporal payloads), and predicate post-condition verifiers.

### Generic Graph Workflow, Activity Interceptors & Isolated Worker Sandboxes
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Global System Architecture & Tier Diagram) -->

* **Workflow & Activity Execution Loop:**
  * `WorkflowRegistry` dispatches compiled workflow blueprints into Temporal's `genericAgenticGraphWorkflow`.
  * Version-isolated **Temporal Worker Containers** communicate with the Temporal cluster via the **gRPC polling loop**, executing discrete steps inside isolated activity sandboxes.
  * An `executeStepActivity` interceptor wraps activity execution to emit structured lifecycle telemetry and FinOps metering events to the control plane's Event Broker Engine.
* **Reconciliation Note:** While `executeStepActivity` interceptors emit telemetry to the Event Broker, **every streamed event must be tagged with `tenantId`, `principalRef`, and `runId`**, and the Express SSE Router must enforce `PermissionsService` / ownership checks before broadcasting events to a client stream.

### Graph Node Execution Primitives (`step`, `choice`, `checkpoint`, `approval`)
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: The Fluent Core Interface Engine — GraphNode & AgentContext) -->

* **Supported Durable Node Types:** The Temporal workflow interpreter (`dynamic-agent-executor.workflow.ts`) executes four canonical `GraphNode` types compiled from `WorkflowBlueprint`:
  1. `step` — Dispatches an activity invocation (LLM reasoning step or governed capability execution).
  2. `choice` — Evaluates deterministic branching conditions over typed workflow state to select `routingTargets`.
  3. `checkpoint` — Persists an explicit state snapshot to `CheckpointStore` for deterministic recovery and audit replay.
  4. `approval` — Suspends workflow execution via `workflow.condition()` waiting on a signed human-in-the-loop Temporal Signal (`onSignal` / approval token verification) with configurable timeout escalation.
* **Distributed Locking (`locks.runExclusive`):** Short-lived mutual exclusion locks (e.g., preventing concurrent duplicate runs on the same entity/resource key) execute inside activities backed by Redis/PostgreSQL advisory locks with bounded TTLs—never inside deterministic workflow code.

### Bounded Iteration (`.repeatUntil()`) & Temporal History Protection
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Pre-Flight Graph Validation Engine (graphValidator)) -->

* **No Arbitrary Graph Cycles:** Arbitrary cyclic transitions in workflow graphs are disallowed at compile time to guarantee predictable termination and prevent unbounded Temporal event-history growth.
* **Bounded `.repeatUntil()` Sub-Pipelines:** Iterative refinement loops must use `.repeatUntil()` nodes configured with an explicit `maxIterations` ceiling (and `ContinueAsNew` threshold monitoring in `dynamic-agent-executor.workflow.ts` when iteration payloads accumulate large state).

### Master Deterministic Workflow Loop (`genericAgenticGraphWorkflow`)
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: The Master Deterministic Runtime (Temporal Loop) — framework/runtime/master-engine-workflow.ts) -->

`genericAgenticGraphWorkflow` is the single deterministic Temporal workflow interpreter executing compiled `WorkflowBlueprint` graphs step by step with built-in history compaction, budget enforcement, and step-level RBAC:

* **History Bloat Protection (`ContinueAsNew`):** Before executing each node, the workflow inspects `info().historyLength` (and `info().isContinueAsNewSuggested()`). When event history reaches the configured threshold (`maxEventsBeforeSnapshot`, default `10000`), it emits `agent:history_compacted` and invokes `continueAsNew(...)` carrying forward `currentState`, `accumulatedSpend`, `currentStepIndex`, and tenant/principal context.
* **Live Spend Inspection Query (`getCurrentSpend`):** Registers a deterministic Temporal Query handler (`defineQuery<SpendSnapshot>('getCurrentSpend')`) returning `{ amount: accumulatedSpend, currency: 'USD' }` so the control plane can poll live workflow spend on demand.
* **Per-Step RBAC Gate (`evaluateRBACGuard`):** If a node specifies `options.authorize`, the workflow invokes `evaluateRBACGuard(principalContext, node.options.authorize)` prior to step execution. Unauthorized steps either abort the workflow or emit `agent:step_bypassed_by_permission` and advance when `onUnauthorized === 'skip'`.
* **Step Execution & State Reduction:** Emits `agent:step_enter`, executes `executeStepActivity`, accumulates `result.__stepCost` into `accumulatedSpend`, merges `result.stateMutation` into `currentState`, and emits `agent:state_delta`.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
The prototype `master-engine-workflow.ts` has six critical issues that **must be reconciled** in the greenfield runtime:

1. **Use `ApplicationFailure.nonRetryable()` for Budget & Security Violations:** Throwing a standard `new Error('FinOps Safety Violation...')` or `new Error('Security Exception...')` causes Temporal's default workflow retry policy to treat the error as a transient workflow task failure and retry indefinitely. Throw `ApplicationFailure.nonRetryable(...)` from `@temporalio/workflow` for hard budget breaches and RBAC denials.
2. **Eliminate `any` & Propagate Verified `tenantId` / `principalRef`:** Replace `proxyActivities<any>()` and `params: any` with strongly typed activity interfaces (`WorkflowActivities`) and typed `WorkflowExecutionParams` carrying mandatory `tenantId`, `principalRef`, and `runId` (never bare `userRef` or `'anonymous'` fallbacks).
3. **Never Emit Unredacted `currentState` in `agent:state_delta` Events:** Emitting `{ currentState }` raw via `emitEvent` risks leaking PII/PHI/MNPI into Temporal history and SSE streams. `emitEvent` must pass through the local PII/PHI redaction engine and scope every event to `(tenantId, runId, principalRef)`, while Temporal Data Converters (custom `PayloadCodec` backed by KMS) encrypt workflow arguments, state, and results at rest.
4. **Separate Activity Timeouts & Retry Policies by Activity Class:** Do not lump `emitEvent`, `evaluateRBACGuard`, and `executeStepActivity` under a single 5-minute `proxyActivities` block. Fast control-plane checks (`evaluateRBACGuard`, `emitEvent`) require short timeouts (`10s–15s`), whereas LLM/capability steps (`executeStepActivity`) require configurable per-step `startToCloseTimeout`, `heartbeatTimeout`, and explicit non-retryable error types.
5. **Drain Pending Signals Before `continueAsNew`:** Before calling `continueAsNew(...)`, check `workflow.allHandlersFinished()` so in-flight human-in-the-loop approval signals are not dropped during history rollover.
6. **Handle Non-Linear Graph Nodes (`choice`, `checkpoint`, `approval`, `repeatUntil`):** The prototype `while` loop increments `currentStepIndex++` linearly; the production interpreter must dispatch node-type handlers for conditional `choice` jumps, `checkpoint` persistence, `approval` signal waits (`condition()`), and bounded `repeatUntil` sub-pipelines.

### Pre-Serialization State Scrubber (`deepSanitizeStateDelta`)
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: The Hardened Egress & Serialization Boundaries — Circular JSON Deep Scrubber) -->

Before step outputs (`stateMutation`) or event payloads are returned from activities into Temporal's `PayloadConverter` / event history, `deepSanitizeStateDelta` normalizes arbitrary runtime objects into safe, JSON-serializable structures:

* **Cycle Elimination (`WeakSet`):** Tracks visited object references and replaces circular back-references with `'[CIRCULAR_REFERENCE_STRIPPED]'` so Temporal's JSON serializer never crashes worker threads on cyclic SDK/HTTP response objects.
* **Non-Serializable Primitive Stripping:** Drops `function` and `symbol` properties cleanly.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
1. **Respect Custom `.toJSON()` Methods (e.g., `SecretEnvelope`, `Date`, `URL`) Before `Object.entries()`:** In the prototype, `deepSanitizeStateDelta` iterates `Object.entries(obj)` directly without checking `typeof obj.toJSON === 'function'`. Calling `Object.entries()` on a `SecretEnvelope` or `Date` bypasses its `.toJSON()` redaction/formatting method! Always invoke `obj.toJSON()` first when present (and recurse on its return value).
2. **DAG Shared References vs. True Cycles:** Using a single `WeakSet` across sibling branches marks shared non-circular sub-objects (DAG nodes) as `[CIRCULAR_REFERENCE_STRIPPED]`. Track the **active ancestor stack** (adding on entry and deleting on exit, or using a `Map<object, number>` depth counter) so only true cycles are replaced while legitimate shared references serialize intact.
3. **Binary `Buffer` / `Uint8Array` Guardrails:** Converting arbitrary `Buffer` payloads blindly via `value.toString('utf-8')` risks bloating Temporal's 2 MB payload limit with binary files or corrupting non-UTF-8 bytes. Offload large or binary payloads (>64 KB or non-UTF-8) to `ArtifactSink` and replace them in workflow state with a signed artifact reference URI.

### Idempotent FinOps Ledger Activity Execution
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Permanent Financial Accounting Ledger (PostgreSQL)) -->

* **At-Least-Once Retry Safety:** `commitTransactionToLedger` must derive a deterministic `step_execution_id` from Temporal's `Context.current().info` (`workflowExecution.workflowId`, `runId`, `activityId`) so Temporal activity retries are idempotent via PostgreSQL `ON CONFLICT DO NOTHING`.

### Virtual Time Advancement & Workflow Replay Testing
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: The Isolated Verification Harness (createTestHarness)) -->

* **Time-Skipping Temporal Verification:** While `TestHarness` validates isolated step reducers synchronously, end-to-end graph execution—including `approval` signal waits, escalation timers (`workflow.sleep`), activity retries, and `continueAsNew` rollovers—must be tested using `@temporalio/testing`'s `TestWorkflowEnvironment.createTimeSkipping()` for deterministic virtual-time advancement.

### Headless Worker Deployment Topology & Version-Isolated Task Queues
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Sections: Production Deployment Topology Configuration, Core System Compliance Checklist) -->

Production deployments enforce **headless separation** between synchronous Backstage HTTP/SSE API pods and asynchronous Temporal worker pools:

* **Version-Isolated Task Queues:** Worker task queue names append a version suffix (`v{version}`, e.g., `agentic-workflows-v{version}`), isolating active workflow topologies during rolling container upgrades so in-flight executions drain safely on their original worker version without replay incompatibilities.
* **Dedicated Auto-Scaling Worker Pool (`agentWorker`):**
  * Runs as an independent Kubernetes Deployment (`minReplicas: 5`, `maxReplicas: 30`, CPU target `80%`, `500m`–`2` CPU, `1Gi`–`4Gi` RAM per pod) polling `TEMPORAL_ADDRESS` over gRPC without serving public HTTP traffic.
  * For high-throughput LLM/I/O workloads, pair CPU-based HPA with Temporal **Schedule-to-Start latency** / task-queue backlog metrics (via KEDA) so I/O-bound workers scale ahead of queue saturation.
* **Strict Deterministic Workflow Thread Boundary:** Arbitrary callbacks, non-deterministic clocks/RNG, and external network/database I/O must never execute inside the master Temporal workflow isolate; all side effects execute inside Temporal activities.

### Durable Handoff State Transitions & Approval-Gated Agent Switching
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 5: First-Class Handoffs Between Scoped Agents (.agent.md)) -->

* **Checkpoint & Signal Boundary on Handoff:** When a workflow reaches an agent handoff node, `dynamic-agent-executor.workflow.ts` persists the structured handoff artifact to `CheckpointStore`, suspends via `workflow.condition()` if human sign-off is required, and then initializes the target agent phase with its narrowed `CapabilityDescriptor` set and fresh prompt context—ensuring clean replay boundaries and zero privilege bleed from the prior agent profile.

### Bounded Subagent Execution & Temporal Payload Size Protection
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 7: Noise-Filtering Execution Subagents (execution_subagent)) -->

* **Preventing Temporal 2 MB Payload Breaches:** Routing noisy diagnostic queries through distillation subagents inside Temporal activities keeps raw log payloads out of workflow state and event history, ensuring activity return payloads remain small, deterministic, and well below Temporal's payload size limits.

### Deterministic Replay Compatibility for Per-Turn State Refreshes
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 8: Per-Turn Prompt Rebuilding Over Append-Only History) -->

* **Activity-Mediated State Polling:** Per-turn live state refreshes execute exclusively inside Temporal activities (or `prepareStep` callbacks wrapped inside an LLM activity execution), persisting the fetched state delta into workflow state / `CheckpointStore` so Temporal history replay remains 100% deterministic.

### Stop-Hook Re-Entry & Bounded Repair Loop in Temporal Execution
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 9: Loop-Control Guardrails and Stop Hooks) -->

* **Activity-Backed Stop Hook Execution:** Stop Hooks run as deterministic post-step verification activities inside `dynamic-agent-executor.workflow.ts`. Failed verifications append structured failure evidence to workflow state and increment an explicit `repairAttemptCount` counter; exceeding `maxRepairIterations` or detecting a repeated failure hash halts the workflow cleanly with an honest failure outcome (and optional human-escalation signal) rather than infinite retries.

### Ephemeral Activity Sandboxes & Trigger Provenance Propagation
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 11: Workspace-Level Sandboxing & Untrusted Input Gates) -->

* **Sandbox Lifecycle Binding:** Multi-step repository or code-mutation workflows provision an ephemeral `/workspace` sandbox bound to the `runId` (persisting intermediate artifacts to KMS-encrypted `ArtifactSink` across activity boundaries) and tear down the sandbox deterministically on workflow completion, cancellation, or timeout.
* **Trigger Author Provenance:** Workflow start parameters must record both the triggering webhook/event author (`triggerActorRef`, `authorTrustLevel: 'verified_writer' | 'external_untrusted'`) and the authorizing Backstage principal (`principalRef`), enforcing read-only execution mode whenever `authorTrustLevel !== 'verified_writer'`.

### Two-Tier Mutations & Reversible Saga Checkpoints (`CheckpointStore`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 12: Two-Tier Edits & Reversible Workspace Checkpoints) -->

For workflows that modify repositories, configuration, or infrastructure (e.g., updating Terraform variables, opening GitOps PRs, modifying `catalog-info.yaml` metadata), the execution engine enforces **two-tier staged mutations** paired with **reversible checkpoints** (modeled on VS Code Copilot Chat's diff-based edits and snapshot checkpoints):

* **Stage-Then-Commit Execution Model:**
  * **Tier 1 (Propose / Stage):** Mutating steps first generate a deterministic diff, patch, or dry-run plan (e.g., unified git diff, Terraform plan artifact, proposed catalog patch) without applying irreversible production side effects.
  * **Tier 2 (Pre-Mutation Snapshot + Commit):** Before committing the mutation, the activity captures the exact **pre-mutation baseline** (e.g., base Git commit SHA, original Kubernetes manifest/ConfigMap snapshot, prior catalog entity YAML) in `CheckpointStore` alongside the current workflow state and compensating rollback descriptor.
* **One-Click & Automated Verifier Rollback (Saga Compensation):**
  * If a downstream deterministic **Stop Hook** fails or a human reviewer rejects/reverts a step in the Backstage UI, the workflow can execute a **point-in-time rollback** to checkpoint $N$—restoring both the workflow's logical state (`currentState`, `SessionStore`) and invoking the registered compensating rollback capability (e.g., closing/reverting the GitOps PR, resetting to the recorded Git SHA, or re-applying the captured pre-mutation manifest) without discarding the entire session.

### Durable Session Ownership & Mid-Run Steering Signals
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 13: The Client / Agent Host Split (Transport-Agnostic Sessions)) -->

* **Client-Independent Run Durability:** Because the Temporal workflow (`dynamic-agent-executor.workflow.ts`) is the durable Agent Host, active runs survive client disconnects and accept asynchronous mid-turn steering signals (`steerExecution`, `approveTransition`, `abortRun`) queued deterministically into the workflow loop between activity steps.

### Distributed Trace Context Propagation Across Temporal Boundaries
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 15: Native GenAI OpenTelemetry Span Trees (invoke_agent -> chat -> execute_tool)) -->

* **End-to-End W3C Trace Continuity:** Temporal client interceptors and worker workflow/activity interceptors (`@temporalio/interceptors-opentelemetry`) propagate the initiating HTTP request's `traceparent` context into `dynamic-agent-executor.workflow.ts` and every dispatched `executeStepActivity`, ensuring `chat` and `execute_tool` spans attach cleanly under the root `invoke_agent` trace tree across async worker hops.

### Delayed Outcome & Survival Reconciliation Checks
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 17: Downstream "Survival" Metrics Over Simple Completion Counts) -->

* **Post-Completion Verification Windows:** For workflows producing durable external artifacts (PRs, `catalog-info.yaml` updates, incident remediations), the platform schedules lightweight, read-only reconciliation checks (via Temporal scheduled workflows or webhook-triggered activities at `+24h`, `+7d`, and `+30d`) to verify whether the artifact merged, remained un-reverted, or avoided incident recurrence.

### Rate-Limit Velocity vs. Quota Exhaustion Error Classification
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 18: Rate-Limit Velocity vs. Quota Exhaustion Classification) -->

Adapted from VS Code Copilot Chat's rate-limit taxonomy, Temporal activities (`llm-call.activity.ts` and `CapabilityGateway` activities) explicitly separate **transient velocity throttling** from **terminal quota, budget, or authorization exhaustion** so concurrent multi-team workloads never burn worker slots on unrecoverable errors:

* **Transient Velocity Throttling (`RATE_LIMITED_VELOCITY` — Retryable with `Retry-After`):**
  * **Trigger:** Upstream LLM gateway or SaaS API returns HTTP `429` (or `503`) with a short-window `Retry-After` / `x-ratelimit-reset` header, or `ModelExecutor` exhausts all local fallback models momentarily.
  * **Temporal Handling:** Throws a retryable `ApplicationFailure` with explicit `nextRetryDelay` honored from the parsed `Retry-After` header (clamped to a safe ceiling with jitter), letting Temporal release the worker slot cleanly during the backoff window rather than sleeping inside the worker thread.
* **Hard Quota, Budget, or RBAC Exhaustion (`QUOTA_EXHAUSTED` / `BUDGET_EXCEEDED` / `FORBIDDEN` — Non-Retryable):**
  * **Trigger:** Monthly/org credit depletion, tenant token quota exhaustion, FinOps workflow budget ceiling breach, `401`/`403` RBAC denial, or invalid schema validation (`400`/`422`).
  * **Temporal Handling:** Throws `ApplicationFailure.nonRetryable(...)` immediately (bypassing Temporal's exponential retry schedule), emits a structured `agent:error` SSE frame to the user, and marks the step/run failed cleanly without wasting worker retries.

### Poison-Pill Protection Against `context_length_exceeded` Activity Retries
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 19: Deterministic Emergency Truncation Fallback (EmergencyTruncation / Last-Resort Dropping)) -->

* **No Blind Activity Retries on Oversized Prompts:** Because retrying a Temporal LLM activity with an identical oversized payload deterministically fails every attempt, `llm-call.activity.ts` performs emergency head/tail tool-output truncation in-process before retrying; if the irreducible base prompt still exceeds model limits, the activity throws `ApplicationFailure.nonRetryable('CONTEXT_LIMIT_IRREDUCIBLE')` so Temporal never wastes worker retries on a poison-pill payload.

### Mid-Turn Interactive Clarification Pause & Temporal Signal Resumption (`ask_questions`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 22: Interactive Mid-Turn Clarification Tools (ask_questions)) -->

Modeled on VS Code Copilot Chat's `ask_questions` mid-turn clarification tool, the execution engine supports pausing an active reasoning loop to collect structured human choices or parameter inputs without aborting the workflow or holding a worker thread idle:

* **Non-Blocking Workflow Suspension (`workflow.condition` + Signal):**
  1. When the reasoning runtime emits a typed `ask_questions` tool invocation (`questionId`, `prompt`, `fields` / `options`, `isApprovalGate`), the step activity returns a `CLARIFICATION_REQUIRED` suspension payload (persisted to `CheckpointStore`).
  2. `dynamic-agent-executor.workflow.ts` emits an `agent:clarification_requested` event via `emitEvent` and suspends deterministically on `await condition(() => pendingClarifications.has(questionId), timeoutMs)`—releasing the worker slot completely while waiting.
  3. When the user submits the form in Backstage, the control plane sends a typed `submitClarification` Temporal Signal carrying `{ questionId, answers, responderPrincipalRef, submittedAt }`.
  4. The workflow wakes, validates that `questionId` matches the active suspension (ignoring duplicate/stale signals), injects the verified response as the `ask_questions` tool result, and resumes the exact agent loop seamlessly.
* **Timeout & Escalation Policy:** If `condition(..., timeoutMs)` expires without a response, the workflow transitions cleanly to `TIMED_OUT_AWAITING_INPUT` (or triggers an escalation notification) rather than hanging indefinitely.

### Capability Pack Revision Pinning Across Long-Running Workflows
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 24: Bundled "Agent Plugins" as Versioned Capability Packages) -->

* **Immutable Pack Version Snapshot per Run:** When a workflow execution starts, `RunStore` and the Temporal workflow initial parameters record the exact resolved `(packId, version)` manifest map active at launch, routing execution to the matching `v{version}` worker task queue so rolling upgrades of `@internal/agent-pack-*` packages never break deterministic replay of in-flight runs.

### Temporal-Backed Workflow Checklist Durability
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 25: First-Class In-Context Todo List State (manage_todo_list)) -->

* **Durable Checklist State & `ContinueAsNew` Carry-Over:** Checklist mutations emitted by `manage_todo_list` are persisted in `dynamic-agent-executor.workflow.ts` state and `CheckpointStore` (and carried forward across `continueAsNew` rollovers), ensuring worker failovers or approval pauses never reset task progress.

### Automatic Temporal Suspension on `DESTRUCTIVE_MUTATION` Capabilities
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 29: Interactive vs. Autonomous Terminal & Tool Risk Classification) -->

* **Zero-Worker-Hold Approval Suspension:** When an agent invokes a `DESTRUCTIVE_MUTATION` capability, the activity returns an `APPROVAL_REQUIRED` suspension envelope containing the HMAC-signed argument digest and diff preview; `dynamic-agent-executor.workflow.ts` persists a checkpoint, emits `agent:approval_requested`, and suspends via `workflow.condition()` until a verified approval signal is received.

### Incremental RAG Sync Temporal Activities & Backpressure Control
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 31: Content-Addressed Workspace Indexing & Merkle Tree Sync) -->

* **Idempotent Diff-Based Indexing Activities:** Webhook-triggered indexing runs execute as low-priority background Temporal workflows/activities (`rag-incremental-sync`) with bounded concurrency and per-tenant rate limits so massive monorepo pushes never starve interactive user agent workflows on primary task queues.

### Cooperative Cancellation Propagation (`CancellationScope` -> `AbortSignal`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 35: Cooperative Cancellation Tokens (CancellationToken) Propagated Down to Tools) -->

Modeled on VS Code Copilot Chat's hierarchical `CancellationToken` propagation, clicking **Stop** or injecting a mid-turn **Steer** override in the Backstage UI propagates cancellation cooperatively all the way from the Temporal workflow down to active worker activities, LLM streams, MCP connections, and sandboxed child processes:

* **End-to-End Cancellation Chain:**
  1. **Control-Plane Cancellation Signal:** Backstage sends a Temporal workflow cancellation request (or mid-turn `steer` signal) for `(tenantId, runId)`.
  2. **Temporal `CancellationScope` & Activity Heartbeats:** Inside `dynamic-agent-executor.workflow.ts`, steps execute within scoped `CancellationScope` blocks with `cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED` and periodic activity heartbeats (`Context.current().heartbeat()`), ensuring Temporal delivers cancellation notifications to running workers promptly rather than silently abandoning zombie activities.
  3. **Native `AbortSignal` Bridge (`Context.current().cancellationSignal`):** Every Temporal activity extracts `Context.current().cancellationSignal` (standard Web `AbortSignal`) and threads it into `ModelExecutor`, `CapabilityGateway`, MCP transports, and sandboxed subprocesses.
* **Non-Cancellable Atomic Commit Shield:**
  * Short, irreversible commit/compensation boundaries (e.g., recording a pre-mutation checkpoint or committing a FinOps ledger entry) execute inside `CancellationScope.nonCancellable(...)` so a mid-millisecond user cancel never leaves a partial state record without its compensating rollback pointer.

### Separating Recoverable LLM Tool-Call Errors from Temporal Activity Retries
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 37: Tool-Call Self-Healing & Malformed JSON Repair Middleware) -->

* **No Temporal Activity Retries on LLM Argument Typos:** Because retrying an LLM activity with identical history reproduces or wastes full inference turns, `CapabilityGateway` returns Zod validation errors as structured tool-result messages inside the active reasoning loop rather than throwing Temporal activity exceptions—reserving Temporal activity retries strictly for transient infrastructure/network failures.

### Temporal History & Thrashing Circuit Breaker
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 43: Semantic Loop & Thrashing Detection (LoopDetector Heuristics)) -->

* **Cross-Turn Signature Persistence:** `dynamic-agent-executor.workflow.ts` carries a bounded rolling window (e.g., last `20` action-signature hashes) in workflow state and across `continueAsNew` boundaries so thrashing loops spanning multiple activities or history compactions are still caught and terminated cleanly via `ApplicationFailure.nonRetryable('LOOP_THRASHING_DETECTED')` or human-escalation suspension.

### Deterministic Ordering for Parallel Read Activities & Serialized Writes
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 44: Read-Only vs. Mutating Tool Partitioning for Parallel Execution) -->

* **Replay-Safe Batch Execution:** When dispatching parallel `READ` activities from `dynamic-agent-executor.workflow.ts`, workflow code sorts/reduces completed promises in canonical `toolCallId` index order before mutating `currentState`, ensuring Temporal history replay produces identical state transitions regardless of network completion order.

### Deployment-Safe State Upcasting Across Temporal `ContinueAsNew` & Replays
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 45: Session Transcript Serialization & Versioned Schema Migration) -->

* **Coordinated Worker & Schema Evolution:** When long-running workflows resume after an approval pause or roll over via `continueAsNew`, activity loaders upcast `SessionStore` / `CheckpointStore` snapshots to the active `schemaVersion`, while any structural changes inside `dynamic-agent-executor.workflow.ts` itself use Temporal's `patched()` / Worker Versioning APIs so historical event replays remain deterministic across deploys.