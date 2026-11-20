# Agent-Operation Gaps for the Platform

## Executive assessment

The Kazi analysis points to a useful, bounded capability for this platform: an optional **goal reconciliation controller** around an existing agent workflow. The controller owns an approved outcome contract, independent verification, repair feedback, budgets, and the decision to stop. The existing agent and its fluent workflow definition remain the executor; Temporal remains the durable orchestrator. This should not become a second workflow engine or a replacement for the fluent API.

The current rough-in has important foundations—Temporal dispatch and signals, runtime persistence contracts for runs, checkpoints, approvals, artifacts and audit records, and a standalone worker. But the visible implementation does not yet connect those pieces into an operable agent lifecycle. In particular, the dynamic workflow is a single model call, not an execution / reconciliation loop; the HTTP surface only starts a run; and the runtime stores are not obviously wired to workflow state transitions or Temporal outcomes. These are gaps in agent operation, not gaps in RAG, Mem0, tool registration, or workflow authoring.

Kazi is most applicable to remediation tasks where outcomes can be checked repeatedly. It should be an opt-in execution mode, not a requirement that every agent run iterate until a verifier passes. A verified result means only that the approved checks passed for the observed candidate and environment; it is not a blanket correctness or publication guarantee.

## What exists today

- [dynamic-agent-executor.workflow.ts](./plugins/platform-backend/src/worker/temporal/workflows/dynamic-agent-executor.workflow.ts) establishes approval/interruption signals and makes one model dispatch, but does not interpret a workflow graph, run predicates, issue repair iterations, or make a convergence / stop decision.
- [routes.ts](./plugins/platform-backend/src/http/router/routes.ts) exposes `POST /execute`. [temporal-dispatcher.ts](./plugins/platform-backend/src/http/client/temporal-dispatcher.ts) starts a workflow, but exposes no run query, signal, cancellation, or lifecycle reconciliation operations.
- [SqlAgentRuntimeStore.ts](./plugins/platform-backend/src/runtime-persistence/src/service/SqlAgentRuntimeStore.ts) and its migrations provide useful run, event, checkpoint, approval, artifact, and audit persistence primitives. Their presence does not itself make them the authoritative projection of Temporal execution or wire them into the workflow lifecycle.
- The architecture notes already describe pieces of the intended foundation: Temporal state transitions and budget guards in [ARCHITECTURE_WHITE_PAPER.md](../_NOTES/Implementation/ARCHITECTURE_WHITE_PAPER.md), persistence in [STORAGE_RUNTIME_README_PERSISTENT_STATE.md](../_NOTES/Implementation/STORAGE_RUNTIME_README_PERSISTENT_STATE.md), and contextual/event-driven operation in [OVERALL_BLUEPRINT.md](../_NOTES/Implementation/OVERALL_BLUEPRINT.md). These should be treated as plans and sketches, not as evidence that the behavior is implemented.

## Missing operational capabilities

### P0 — Goal contract, approval, and immutable identity

Add a runtime-validated, versioned goal contract for reconciliation runs. It should identify the desired outcome, target entity/repository and scope, acceptance predicates and regression guards, verifier/provider configuration, and explicit limits. Give each approved revision a canonical digest and record who approved it, when, and under which policy. A material change to the checks or scope must require a new revision/approval rather than silently changing what “done” means mid-run.

Do not treat a prompt, fluent workflow definition, TypeScript type, Mem0 result, or model-authored checklist as authorization or a verified contract. Generated criteria can be proposed, but they need review or an explicit policy approval. Reject missing or empty predicate sets for reconciliation runs.

### P1 — Predicate evaluation and evidence

Provide a verifier / provider contract that runs checks independently of the agent's completion claim. Each observation needs a distinct `pass`, `fail`, `error`, or `unknown` verdict and evidence metadata bound to the exact candidate digest, verifier version, environment, and observation time. Persist references to evidence, not secrets or oversized logs, in workflow history.

Convergence must require a nonempty result set in which every required acceptance predicate passes and every guard remains satisfied for the same candidate. `error` and `unknown` are not success: retry transient observation failures within limits, and stop or request help for permanent checker or configuration failures. Re-run the full predicate set after each repair so previously passing guards can catch regressions. Stale evidence for a changed candidate or environment must not count.

### P2 — Bounded outer loop and honest stop reasons

Implement the operation sequence that is currently missing:

1. Establish the initial candidate and baseline observations.
2. If checks fail, send only actionable failure evidence to the existing agent workflow for repair.
3. Capture the resulting candidate, re-run the full verifier set, and repeat while limits permit.
4. Stop with an explicit outcome such as `converged`, `stuck`, `over_budget`, `error`, or `cancelled`; never infer success from a model response.

Bound a logical run by iterations/dispatches, elapsed time, and configured model/compute or monetary budgets. Preserve those limits across Temporal activity retries and worker restarts. Add a conservative no-progress/stuck policy (for example, repeated failing predicate IDs over a window), while recognizing it is a heuristic rather than proof that no solution exists. Separate retryable observation errors from actionable failures and terminal policy/configuration errors.

### P3 — Durable lifecycle controls and status

Make the run operable after the initial `202 Accepted` response. Add authenticated, run-scoped operations to retrieve status and event history, submit a decision for a specific pending approval, cancel execution, and resume or retry only where the run's state permits. The dispatcher currently starts workflows but does not expose Temporal query/signal/cancel handles; signals declared in the workflow are not yet a complete control plane.

Use Temporal as the execution authority and treat SQL run/event data as a projection that can be reconciled or rebuilt from durable workflow outcomes. Persist and expose the logical run identity, workflow/run IDs, goal revision, current phase/iteration, stop reason, approval/publication state, candidate identity, and evidence references. Enforce authorization and tenant/entity scope on every operation; do not rely on a caller-supplied run ID alone. Cancellation must propagate to activities and terminate any child process or remote job the run owns. A stuck/escalated state must produce a deliberate, auditable notification or operator action, not merely a status label.

### P4 — Recovery-safe side effects, budgets, and provenance

Temporal activity execution can be repeated, and an external request can complete just before a worker loses its result. For LLM calls, verifier jobs, workspace operations, PR creation, or deployment, use stable operation keys where supported and reconcile uncertain external outcomes before retrying. Reserve and settle budget against the logical run, not an individual activity attempt; represent unknown provider usage as unknown rather than zero. Keep publication separate from verification and require its own authorization.

For patch/remediation use cases, provide an isolated candidate workspace and artifact lifecycle. Keep verifier configuration and protected checks outside the agent's write access; record candidate/base digests and any degraded isolation. A worktree or separate process alone is not a security sandbox. Return a verified candidate plus evidence first; independently approve and perform PR, merge, or deployment actions.

Temporal-specific operation also needs explicit activity start-to-close and schedule-to-close timeouts, heartbeats for long jobs, retry classification, cancellation cleanup, replay-safe workflow versioning, and a history-growth policy (including Continue-As-New where needed). The planning notes mention these concepts, but the current workflow has only a simple maximum-attempts retry setting and no visible execution of these lifecycle safeguards.

### P5 — Operator-visible run history and outcome quality

Expose an ordered iteration timeline: contract revision, initial and subsequent predicate vectors, repair attempts, approval decisions, usage/budget, artifacts, and final stop reason. Make evidence and uncertainty inspectable. Connect the run projection to tracing/metrics so operators can measure time, retries, failures, unknown usage, and human supervision. Avoid equating `converged` with independently accepted or safely landed work.

Before scaling reconciliation, compare it with the platform's direct-agent path on representative tasks using the same model, tools, verifier, and review standard. Measure independently accepted results, false-success rate, cost, elapsed time, human effort, and recovery behavior; the small Kazi evaluation described in [AGENT_RECONCILIATION_CONTROLLER.md](./AGENT_RECONCILIATION_CONTROLLER.md) does not establish that the controller is cheaper or more correct.

### P6 — Reactive triggers and capacity policy

If autonomous operation is in scope, add governed event/webhook triggers that map trusted CI, deployment, or incident events to an approved agent/goal and deduplicate repeated deliveries. This is a separate entry path from the reconciliation loop and should use the existing scheduler/Temporal rather than introducing a competing fleet scheduler. Add tenant-aware admission limits and worker capacity policies before enabling high-volume or parallel runs.

### P7 — Resumable, steerable task sessions

Treat a durable user task/session as a first-class object distinct from an individual Temporal run. Support listing and reopening sessions, reading history, starting a follow-up run with the accumulated task context, and steering an active run without accidentally creating duplicate work. Preserve links among the session, runs, approvals, and artifacts. On handoff to another Backstage surface or a future IDE/ChatOps surface, re-check the acting user's current authorization; session visibility or prior participation must not silently grant authority to perform an action.

The existing session store persists messages, but the current HTTP surface has no session discovery or continuation API. OpenClaw exposes session create / list / history / status and cross-session messaging/delegation, while GitHub Copilot supports continuing cloud sessions across clients. The platform-specific opportunity is governed continuity, not copying either product's UI.

### P8 — Live supervision and durable intervention points

Provide a live run activity feed in addition to the persisted event history: current phase, completed operations, approvals needed, verification progress, and user-visible results. Let an authorized user pause or cancel, answer a clarification request, approve a specific pending effect, or steer the task at a durable checkpoint and then resume the same logical run. Keep this to operational progress and evidence; do not expose private model reasoning as a substitute for an auditable action log.

The current endpoint returns a workflow ID after dispatch, and the persistence plan already calls for event logs. There is no visible live event subscription or general checkpoint/intervention protocol yet. This would make the existing approval and status concepts usable during—not only after—a long-running workflow.

### P9 — Reproducible execution environment profiles

For code- or environment-changing agents, define a versioned execution profile that provisions the candidate workspace: base revision(s), runtime/container image, setup steps, permitted network/egress, resource limits, and cleanup policy. Record the resolved profile and environment digest with each observation so a repair or verifier can be reproduced and evidence can be judged against the environment that produced it. Support multiple repositories only through explicitly declared scope and authorization.

The platform plan calls for isolated workspaces, but does not yet specify a reproducible setup contract. GitHub Copilot's cloud and Actions-based sessions make the execution environment an explicit session choice and support repository-specific setup; this is a practical complement to candidate provenance, not a reason to require a particular sandbox vendor.

### P10 — Bounded child-agent delegation

If agent workflows need parallel investigation or specialist handoffs, add first-class child-run semantics: a parent can create, await, inspect, and cancel child runs; each child has a declared subgoal, bounded budget/depth, policy scope, and provenance; and the parent records how child results affect its final decision. Enforce child-count and nesting limits and aggregate cost and deadlines at the logical parent run. Preserve the initiating actor and re-evaluate authorization for each child effect rather than inheriting authority merely because a parent spawned it.

The current rough-in models a single dispatched workflow and has no visible parent/child execution lifecycle. OpenClaw's session tools demonstrate delegated runs and status inspection; the platform should implement this only where measured workflows benefit from delegation, not make every agent multi-agent by default.

### P11 — User-managed schedules and automation history

Expand governed triggers into a manageable automation resource: one-shot and recurring schedules, per-job instructions and context, delivery/notification policy, last/next execution, run history, and pause / edit / resume / delete controls. Authenticate and deduplicate inbound events, bind each execution to an approved agent / goal revision, and reuse the platform scheduler and Temporal. This is distinct from allowing arbitrary users or agents to create unbounded background jobs.

The current plan mentions event/webhook triggers but not the complete schedule-management lifecycle. OpenClaw automations and ChatGPT scheduled tasks provide user-visible examples of editable jobs with execution history and delivery behavior.

### P12 — Continuous evaluation and safe agent releases

Add a versioned evaluation suite for agent/workflow revisions, separate from the online predicate verifier. Replay representative scenarios and known failure cases before promoting changes to instructions, models, workflow definitions, or execution profiles. Link operator/user feedback and production failures to traceable examples, then use them as regression cases. Track quality, completion, escalation, latency, and cost by agent revision and trigger type, and support staged rollout/rollback when results regress.

The existing recommendation to compare a reconciliation controller with a direct-agent baseline is a one-time adoption experiment; it does not provide ongoing regression protection or operational quality monitoring. Copilot Studio documents automated multi-query agent tests, real-time activity inspection, and monitoring for conversational and trigger-based runs. These are useful reference patterns for a platform-owned evaluation lifecycle.

### P13 — Durable waiting for external operations

Model long-running external work as a durable operation with a stable handle and explicit states, rather than as an activity that must remain running until completion. The workflow should be able to await provider callbacks as Temporal signals, fall back to bounded timer-driven status inquiries when a callback is missing, deduplicate callback delivery, and stop on a deadline or terminal provider failure. Verify the resulting external state before treating the operation as complete. This matters for workflows that start CI, a deployment, provisioning, or a PR review and then need to wait minutes or hours.

The prior sections cover idempotency and run-level cancellation, but not this full asynchronous-operation lifecycle. The design is called out in [TOOLS_INTERFACE_OPTIONS.md](./TOOLS_INTERFACE_OPTIONS.md), under its sync / async operation and Temporal execution options.

### P14 — Reauthorization and credential renewal during a run

Long-running runs must handle a user's delegated authorization expiring or being revoked after admission. Resolve credentials from references at activity execution time; never put tokens in workflow inputs/history. If authorization is no longer valid, pause in an explicit `reauth_required` state and resume only after fresh consent and a new authorization check. Do not silently fall back from a user credential to a broader service credential. Keep the initiating actor, credential standing, and approval decision as separate auditable facts.

The earlier list covers authorization on control operations and child effects, but not this mid-run recovery path. It is particularly important when a human approval or external operation leaves a workflow waiting for a long period.

### P15 — Long-session context compaction and restoration

Define how a durable task session continues when its conversation exceeds the model context window. Create bounded, versioned checkpoints that retain the approved goal, decisions, current workflow position, unresolved questions, and references to source messages and artifacts. On resume, rebuild context from the checkpoint and authorized source records instead of resending the full transcript. Make summaries traceable and correctable; they are a compressed view, not an authority that can override the approved contract. This is short-term task continuity, distinct from Mem0 retrieval and Temporal's workflow-history compaction.

### P16 — Worker-fleet operational controls

Add operator visibility and controls for task-queue age/backlog, worker availability and version, activity failure/retry rates, resource saturation, and runs that stop making progress. Support safe worker drain and rollout, queue-specific capacity limits, and a documented recovery path for exhausted or abandoned work. The existing list covers per-tenant admission and run history, but not the health and deployment lifecycle of the worker fleet that executes those runs.

### P17 — Schedule overlap and missed-run semantics

For recurring automations, require an explicit policy for a due time arriving while the prior run is still active (skip, queue/coalesce, or allow bounded overlap), plus timezone/jitter, catch-up after outages, and pause-on-failure behavior. Surface the next due time and any skipped or recovered occurrence in the job history. These policies complete the schedule lifecycle already identified above and prevent duplicate or unexpectedly accumulated agent work.