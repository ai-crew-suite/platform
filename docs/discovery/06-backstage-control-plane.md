# Discovery: 06 - Backstage Control Plane & Surface Layer

This staging file collects all raw research and design notes related to the Backstage backend plugin lifecycle, plugin extension points, identity resolution (`BackstageCredentials`), RBAC policy evaluation via the Backstage Permission Framework, and REST/SSE APIs exposed to frontend clients. All notes captured here govern how the core platform integrates into Spotify Backstage as a native, multi-tenant service.

### Observability Plugin Surface & Usage Read API
<!-- Source: incoming/_AGENT_Q_AND_A.md (Question 1) -->

* **Dedicated Observability Plugin Support:** The control plane must expose a clean, queryable read surface over the structured `UsageSink` (`usage_records`) so a dedicated Backstage frontend/backend plugin (e.g., `plugin-ai-observability`) can render org-wide spend, token efficiency ratios, and budget-burn alerts without scraping raw run-step logs.
* **Multi-Dimensional Aggregation:** The control plane API must support filtering and aggregating usage records by `agentId`, `workflowRef`, `node`, `modelRef`, team/ownership, and time window, applying the config-driven pricing map at query time.

### Backstage Configuration Surface for Redaction (`ai.redaction.*`)
<!-- Source: incoming/_AGENT_Q_AND_A.md (Question 2) -->

* **App-Config Schema (`config.d.ts`):** Expose `ai.redaction` in the Backstage backend plugin's configuration schema so operators can supply additional `keyPatterns` and `valuePatterns` via `app-config.yaml` without modifying code, while enforcing the immutable built-in pattern floor at startup.

### Capability Category Extensibility (The Module Contract Pattern)
<!-- Source: incoming/_AGENT_Q_AND_A.md (Section 4) -->

* **Core Extensibility Invariant:** Modules self-register through typed Backstage extension points in `core-node`, and core never switches on provider identity at runtime. Adding a new provider for an existing category (e.g., a Grafana driver for observability or feature flags) must require **zero core PRs** and zero core config knowledge; third-party modules read their own config namespace (e.g., `ai.featureFlags.grafana.*`) via `coreServices.rootConfig`.
* **v1 Shortcoming (Closed Provider ID Unions):** Closed union types like `VcsProviderId = 'github' | 'gitlab' | 'bitbucket' | 'azuredevops'` block third-party providers. All driver `providerId` fields in `core-node` must be widened to open `string` (or `string & {}` for autocomplete) with runtime map lookups.
* **Five-Artifact Anatomy per Capability Category:**
  1. **Driver Contract (`core-node/src/@types/<category>.ts`):** Provider-neutral I/O using shared primitives (`ServiceActor`, `TimeRange`, `EntityFilterShape`) and open `providerId: string`. Unsupported operations must surface as typed `limitations` in results rather than optional methods or silent empty arrays.
  2. **Extension Point (`core-node/src/extensions.ts`):** Typed `registerDriver(driver)` interface registered via `createExtensionPoint`.
  3. **Capability Module (`plugin-ai-core-backend-module-<category>`):** Translates registered drivers into uniform tools and pushes them to `toolExtensionPoint.addTool()`.
  4. **Driver Module (`plugin-ai-<category>-<provider>`):** External or internal Backstage backend module that instantiates and registers the concrete driver.
  5. **Contract Test Suite (`core-node` `test-utils`):** Reusable Vitest suite verifying every driver against the category contract.
* **Explicit Non-Goals (Guardrails):**
  * **No Runtime Extension Point Escape Hatches:** Do not expose a generic "define your own extension point" API; arbitrary dynamism breaks audit, allow-list, and effect-gating guarantees.
  * **No Config-Driven Tool Generation:** Do not generate tools dynamically from YAML/JSON schemas, as this moves type safety out of the TypeScript compiler and into runtime config validation.

### Operator Config Overrides for Agent Provider Policies
<!-- Source: incoming/_AGENT_Q_AND_A.md (Section 6) -->

* **Installation-Level Provider Overrides (`ai.agents.<id>.providers`):** Expose a Backstage `app-config.yaml` surface allowing platform operators to restrict or override the allowed provider IDs per category for any registered agent without modifying workflow code.

### Backstage App-Config Surface for Model Pricing
<!-- Source: incoming/_AGENT_Q_AND_A.md (Usage Table Add) -->

* **Config-Driven Pricing Map (`ai.pricing.*`):** Expose a model pricing map (`modelRef -> $/1K input/output tokens`) in the Backstage `app-config.yaml` schema so operators can update provider token rates without database migrations or code deployments.

### Non-Blocking Webhook/API Gateway & Duplicate Ingestion Guard
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Concurrency & Lifecycle Flaws) -->

* **Immediate Acknowledge (`202 Accepted`):** Incoming workflow triggers (REST endpoints, Backstage UI actions, Slack/chat webhooks) must immediately validate, enqueue/start the Temporal workflow, and return a `runId` without waiting for LLM completion.
* **Webhook Deduplication:** Gateway endpoints must enforce delivery-ID / idempotency-key deduplication so upstream webhook retries (e.g., Slack or GitHub retries on slow responses) never spawn duplicate workflow runs.

### Transparent Execution Streaming & Approval APIs
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Autonomy & UX Design Flaws) -->

* **Live Progress & Trace Visibility:** The control plane's SSE/REST run-status endpoints must expose lightweight, structured execution summaries—including active step status, tools invoked, and resources/files touched—so Backstage UI consumers can render transparent progress timelines instead of silent loading spinners.
* **Approval Resolution Endpoints:** Expose authenticated Backstage API endpoints allowing authorized users to inspect pending tool-approval payloads and submit approve/reject decisions that signal the waiting workflow.

### Backstage Governance, Approval UI & Catalog Resolution
<!-- Source: incoming/AGENT_RECONCILIATION_CONTROLLER_KAZI.md -->

* **Catalog Context Without Implicit Authorization:** Use the Backstage Software Catalog to resolve repository URLs, entity metadata, and team ownership for a goal, but never treat catalog metadata alone as an authorization grant.
* **Human-in-the-Loop Contract Approval & Audit UI:** Expose Backstage backend APIs and frontend views for:
  * Reviewing drafted `GoalRevision` proposals, unresolved specification gaps, estimated cost budgets, and dangerous commands.
  * Recording explicit cryptographic/identity-stamped approvals (`approvedBy`, `approvedAt`, `contractDigest`) before execution begins.
  * Inspecting iteration history, predicate verdicts, evidence artifacts, degraded-isolation warnings, and terminal stop reasons (`converged`, `stuck`, `over_budget`, `error`, `cancelled`).
* **Separate Publication Authorization:** Require independent Backstage permission checks and/or human approval gates before promoting a verified candidate patch to a PR merge or production deployment.

### HTTP Boundary Error Mapping (`@backstage/errors`)
<!-- Source: incoming/CODING_STANDARDS.md (Section A.1) -->

* **Centralized Controller Error Translation:** All REST and SSE controller endpoints in the Backstage backend plugin must translate internal domain `ErrorCode` values into typed `@backstage/errors` classes via a single explicit mapping utility/switch at the HTTP boundary so status codes and error serialization stay uniform:
  * `invalid_input` -> `InputError` (HTTP 400)
  * Missing resource / missing checkpoint -> `NotFoundError` (HTTP 404)
  * Stale approval state / optimistic concurrency race condition -> `ConflictError` (HTTP 409)
  * Permission rejection / RBAC policy block -> `NotAllowedError` (HTTP 403)
* **No Raw HTTP Coupling Inside Core:** Core domain packages must never import `@backstage/errors` or hardcode HTTP status codes; translation happens strictly at the Backstage control-plane API boundary.

### Backstage Error Middleware Integrity (`MiddlewareFactory`)
<!-- Source: incoming/CODING_STANDARDS.md (Section A.2) -->

* **Centralized Error Middleware:** The Backstage backend router must mount `MiddlewareFactory.create({ config, logger }).error()` as its sole terminal error handler.
* **No Manual `500` Responses in Controllers:** Express route handlers and controllers must **never** catch unhandled system exceptions to manually construct or return `500` JSON status objects. After mapping expected domain `ErrorCode` values to `@backstage/errors` classes (per Section A.1), all unexpected errors must bubble directly to Backstage's centralized error middleware so stack traces and internal diagnostics are safely sanitized.

### SSE Asynchronous Error Propagation (`AgentEvent` v2)
<!-- Source: incoming/CODING_STANDARDS.md (Section A.3) -->

* **Structured SSE Error Events:** Because HTTP status codes cannot be changed once a Server-Sent Events (SSE) stream has opened, runtime failures occurring mid-stream must be emitted as structured `AgentEvent` v2 frames with `type: 'error'`.
* **Required Error Event Payload:** Every SSE `type: 'error'` event must include the canonical `ErrorCode`, a sanitized client-safe message, and an explicit `retryable: boolean` flag so frontend clients know whether to reconnect/retry or surface a terminal failure.

### Backstage Frontend `ErrorApi` Discipline & Stream Drop Handling
<!-- Source: incoming/CODING_STANDARDS.md (Section A.4) -->

* **Never Abuse `ErrorApi` as a Logging Sink:** Backstage frontend components must **not** forward telemetry events, background diagnostics, or transient stream hiccups into Backstage's global `ErrorApi` (which triggers disruptive global toast banners).
* **Regional Status Components for Connection Drops:** Handle transient SSE/network connection drops locally within the workflow/chat UI using regional status alert components (with automatic reconnection/backoff state) rather than global fatal error modals.

### SSE Reconnection (`Last-Event-ID`) & Live-Tail Handover
<!-- Source: incoming/CODING_STANDARDS.md (Section B.2) -->

* **`Last-Event-ID` Replay Handshake:** When an SSE client reconnects with a `Last-Event-ID` header (or cursor), the Backstage controller must query the durable run store and replay every persisted event recorded after that sequence ID.
* **Seamless Replay-to-Live Transition:** Upon completing historical event playback, if the run's status is still `running`, the controller must immediately attach the open HTTP response stream to the active live-tail event hub without dropping or duplicating boundary events. If the run has already reached a terminal state (`completed`, `failed`, `cancelled`), close the stream cleanly after the final event.

### Mandatory `httpAuth` Identity Resolution & Zero Anonymous Fallbacks
<!-- Source: incoming/CODING_STANDARDS.md (Section E.1) -->

* **Eliminate All `'anonymous'` Identity Fallbacks:** Delete every hardcoded `'anonymous'` user fallback across the codebase. Every incoming API request must undergo strict, non-nullable identity evaluation via Backstage's `coreServices.httpAuth`.
* **Cryptographically Verified Principal Extraction:** Extract a verified human `UserRef` (e.g., `user:default/alice`) or system Service Principal token at the gateway boundary before admitting any workflow run, approval, or query.
* **Explicit Service Principal Labeling for Automation:** Scheduled jobs, webhook handlers, and event-driven pipeline triggers must execute under an explicitly provisioned, cryptographically verified Service Principal designation rather than an ambiguous or unauthenticated default identity.

### Backstage `PermissionsService` Integration & Separation of Duties
<!-- Source: incoming/CODING_STANDARDS.md (Section E.2) -->

* **Controller Entry-Boundary Authorization:** Inject Backstage's `PermissionsService` (`coreServices.permissions`) into the HTTP controller layer and enforce explicit authorization checks **before** invoking any execution or state-mutating action (`startRun`, `approveRun`, `streamRunEvents`).
* **Standardized Permission Asset Namespacing:** Register all AI platform permission definitions under the plugin's structural identity prefix (e.g., `kernel.agent.run`, `kernel.agent.approve`, `kernel.run.read`) so Backstage permission policies can target resources predictably.
* **Separation of Duties (Anti-Self-Approval Enforcement):** Enforce explicit organizational separation-of-duties rules at the API routing/approval boundary—preventing the initiating principal (`UserRef`) from self-approving their own generated deployment or mutating workflow iterations.

### Modern Backstage `PermissionsService` DI & Decision Parsing
<!-- Source: incoming/CODING_STANDARDS.md (Section E.2 - Modern Backstage Permissions Service Architecture) -->

* **Ban Legacy Permission Routers:** Do **not** use legacy `@backstage/plugin-permission-node` orchestration routers or old-style backend environment blocks.
* **New Backend System DI (`coreServices.permissions`):** Declare a strict dependency on `coreServices.permissions` (`PermissionsService` from `@backstage/backend-plugin-api`) inside the backend plugin's `createBackendPlugin` / service factory registration.
* **Pluggable External Policy Engine Support:** Invoke `permissions.authorize(...)` with typed permission payloads and `BackstageCredentials` so external enterprise policy backends (e.g., Open Policy Agent / OPA or custom RBAC modules) can evaluate decisions without internal plugin code changes.
* **Explicit `AuthorizeResult` Evaluation:** Always inspect the returned authorization decision array explicitly (e.g., checking `decision[0].result === AuthorizeResult.DENY`) and immediately throw a typed `NotAllowedError` on any non-allow decision.

### SSE Stream Authorization & Anti-IDOR Control (`streamRunEvents`)
<!-- Source: incoming/CODING_STANDARDS.md (Section E.3) -->

* **Pre-Stream Resource Lookup & Authorization:** Inside `streamRunEvents`, **never** open an SSE response stream or subscribe to the live event hub using an unverified `runId` URL parameter alone.
* **Mandatory Execution Sequence:** Before writing SSE headers or replaying historical events:
  1. Look up the target run record to verify existence (`NotFoundError` if absent) and resolve its owner/tenant resource attributes.
  2. Authorize the `kernel.run.read` permission via `permissions.authorize(...)` against the caller's verified `BackstageCredentials` and the resolved run resource context, throwing `NotAllowedError` on denial.

### Backstage `LoggerService` Structured Metadata Usage
<!-- Source: incoming/CODING_STANDARDS.md (Section F.1) -->

* **Native `coreServices.logger` Structured Calls:** All Backstage plugin controllers, modules, and extension adapters must use the injected `LoggerService` (`coreServices.logger`) with structured metadata second-arguments (`this.logger.info(msg, { runId, nodeId, workflowId })`) rather than flat string formatting.

### No Custom APM/Tracing Extension Points
<!-- Source: incoming/CODING_STANDARDS.md (Section F.2) -->

* **Exclude Tracing Hooks from Plugin Extension Points:** Do **not** define custom tracing or APM lifecycle extension points on the Backstage backend plugin (`core-node`). External observability integrations consume standard OpenTelemetry spans emitted by the runtime rather than registering in-process callbacks.

### Strict `config.d.ts` Schema & Boot-Blocking Initialization Probes
<!-- Source: incoming/CODING_STANDARDS.md (Section G.1) -->

* **Strict `config.d.ts` Validation:** Every plugin and capability module configuration option must be strictly defined and validated via `config.d.ts` schemas—no unvalidated runtime `config.getOptional()` fallbacks for critical settings.
* **Fail-Fast Boot Probes in `registerInit`:** During Backstage backend plugin initialization (`env.registerInit`), execute proactive connectivity probes **before** opening routes to traffic:
  1. Execute a lightweight database connectivity check (e.g., `SELECT 1`) against the configured `CheckpointStore`.
  2. Send a lightweight status/auth inquiry ping to the configured LLM gateway provider.
* **Block Startup on Probe Failure:** If either probe fails or times out, immediately throw an unrecoverable startup exception to abort process boot ("fail boot, not first run").

### Backstage App-Config Surface for Data Retention
<!-- Source: incoming/CODING_STANDARDS.md (Section G.2) -->

* **`retention` Schema Configuration (`config.d.ts`):** Expose explicit `retention` duration parameters in the backend plugin/runtime-store `config.d.ts` schema so operators can configure retention thresholds in `app-config.yaml`.

### Pluggable `AuditLogSink` Extension Point & Identity Binding
<!-- Source: incoming/CODING_STANDARDS.md (Section H.1) -->

* **Modular Audit Sink Registration:** Expose a typed Backstage extension point in `core-node` allowing operators to plug in compliance storage modules (e.g., S3 Object Lock or enterprise SIEM forwarders) without modifying core plugin code.
* **`httpAuth` Principal Injection:** Bind the `UserRef` or Service Principal resolved via `coreServices.httpAuth` into the execution context so every downstream `AuditLogSink` emission carries verified caller identity.

### v1 Operational Gaps: Run Lifecycle Control & Dispatcher APIs
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (What Exists Today) -->

* **v1 Gap — Fire-and-Forget HTTP Surface:** Currently, `routes.ts` (`POST /execute`) and `temporal-dispatcher.ts` only start a Temporal workflow and provide no endpoints or client methods to query run state, deliver human-approval/resume signals, cancel in-flight runs, or reconcile terminal outcomes.
* **Required Full-Lifecycle Control API:** The Backstage backend router and Temporal dispatcher must expose authenticated operations for the complete run lifecycle: start, inspect/query status & evidence, submit approval/rejection signals, cancel execution, and reconcile stuck or uncertain runs.

### Goal Revision Approval Provenance & Mid-Run Change Governance (P0)


* **Persist Approval Provenance:** When a goal revision is approved, the control plane must persist the canonical contract digest alongside non-repudiable approval metadata: `approvedBy` (`UserRef` or policy principal), `approvedAt` timestamp, and the governing `approvalPolicy`.
* **Require Re-Approval on Material Changes:** Enforce that any mid-run or post-approval modification to acceptance predicates, regression guards, or repository scope requires creating and approving a new goal revision rather than silently redefining "done" during execution.

### Post-`202 Accepted` Run Lifecycle Control Plane & Notifications (P3)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P3 - Durable lifecycle controls and status) -->

* **Complete Authenticated Run Control Surface:** Extend the HTTP router and Temporal dispatcher beyond `POST /execute` to expose authenticated, run-scoped operations for:
  * Querying live run status, phase/iteration progress, stop reason, candidate identity, evidence references, and event history.
  * Submitting a decision (`approve` / `reject`) bound to a specific pending approval ID.
  * Cancelling an in-flight run.
  * Resuming or retrying a run strictly when its current lifecycle state permits.
* **Tenant & Entity Scope Enforcement (Anti-IDOR):** Never authorize control operations on a caller-supplied `runId` alone; resolve the run's tenant and Backstage `entityRef` scope and verify caller permissions prior to executing any query, signal, cancellation, or retry.
* **Auditable Escalation Notifications:** Transitioning into a `stuck` or human-escalation state must trigger a deliberate, auditable operator notification or actionable Backstage task/alert rather than silently updating a status string.

### Operator-Visible Iteration Timeline & Evidence Inspection Surface (P5)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P5 - Operator-visible run history and outcome quality) -->

* **Ordered Iteration Timeline API & UI:** Expose a chronological, operator-inspectable timeline for every reconciliation run containing:
  * Approved `GoalRevision` and contract digest.
  * Initial baseline and subsequent per-iteration predicate vectors (`pass`, `fail`, `error`, `unknown`).
  * Individual repair dispatch attempts and candidate snapshots.
  * Human/policy approval decisions and reviewer identities.
  * Cumulative token/monetary budget consumption (explicitly surfacing any `'unknown'` usage).
  * Bound `evidenceRef` artifacts and final terminal stop reason.
* **Distinguish `converged` from Landed/Accepted Work:** UI views and API payloads must present `converged` strictly as "all declared checks passed for the observed candidate"—never conflating it with independent human acceptance, merged PRs, or safely deployed production state.

### Governed Reactive Event & Webhook Triggers (P6)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P6 - Reactive triggers and capacity policy) -->

* **Separate Trigger Entry Path:** Model reactive triggers (from CI pipelines, deployment events, or incident alerts) as an explicit, governed ingress adapter separate from the core reconciliation loop.
* **Trusted Source Verification & Goal Binding:** Validate webhook signatures/authenticity, bind incoming events strictly to pre-approved agent definitions or approved `GoalRevision` contracts, and execute under an explicitly scoped Service Principal.
* **Webhook Delivery Deduplication:** Deduplicate repeated event deliveries (via provider delivery IDs or deterministic idempotency keys) at the gateway boundary so retried webhooks never spawn duplicate workflow executions.

### Governed Task Session APIs & Cross-Surface Re-Authorization (P7)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P7 - Resumable, steerable task sessions) -->

* **v1 Gap — Missing Session Discovery & Continuation Endpoints:** While the existing persistence layer stores session messages, the HTTP router exposes no endpoints to list, inspect, reopen, or continue sessions.
* **First-Class Session Control API:** Expose authenticated REST/SSE operations to:
  * List and search user/team sessions and inspect full session history.
  * Reopen a session and launch a follow-up run inheriting accumulated task context.
  * Send steering instructions to an active in-flight run without spawning duplicate work.
* **Zero-Trust Re-Authorization Across Surface Handoffs:** When a session is resumed or handed off across surfaces (e.g., Backstage UI -> IDE extension -> ChatOps/Slack), re-evaluate the acting user's current `BackstageCredentials` and RBAC permissions on every action. Prior session participation or read visibility must **never** implicitly authorize new runs, approvals, or tool executions.

### Live Run Supervision Feed & Durable Intervention API (P8)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P8 - Live supervision and durable intervention points) -->

* **v1 Gap — Post-Dispatch Blind Spot:** The existing execution endpoint returns a workflow ID at dispatch time but lacks a live activity subscription or generalized mid-run intervention protocol, making approvals and status inspection unusable until after a long-running workflow finishes.
* **Live Run Activity Feed:** Expose a real-time SSE/streaming activity feed alongside persisted event history reporting structured operational milestones: current workflow phase, completed tool/step operations, pending approvals or clarification prompts, predicate verification progress, and user-visible artifacts/results.
* **Mid-Run Operator Intervention Surface:** Expose authenticated endpoints allowing authorized users to interact with a live run by:
  * Pausing or cancelling execution.
  * Answering an agent clarification request.
  * Approving or rejecting a specific pending side-effect (`effect: 'write'`).
  * Submitting steering instructions at a durable checkpoint and resuming the same logical run.

### User-Managed Schedules & Automation History Surface (P11)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P11 - User-managed schedules and automation history) -->

* **v1 Gap — Incomplete Schedule Lifecycle:** While earlier notes cover inbound event/webhook triggers, the control plane lacks a user-manageable schedule resource with editable job definitions, delivery policies, and execution history.
* **First-Class Automation / Schedule Resource API:** Expose authenticated Backstage REST endpoints and UI management views for one-shot and recurring automations supporting:
  * Per-job instructions, target `entityRef`/context, and explicit delivery/notification policies (e.g., Backstage notification, Slack channel, or silent audit-only).
  * Binding each schedule strictly to a pre-approved `AgentDefinition` or immutable `GoalRevision` digest.
  * Inspecting `lastRunAt`, `nextRunAt`, schedule state (`active` / `paused`), and linked historical `runId` executions.
  * Full lifecycle mutations: `create`, `edit`, `pause`, `resume`, and `delete`.

### Staged Agent Release Rollouts, Rollbacks & Operator Feedback API (P12)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P12 - Continuous evaluation and safe agent releases) -->

* **Staged Rollout & Instant Rollback Controls:** Support promoting tested agent/workflow revisions through staged rollouts (e.g., canary/percentage or team-scoped cohorts) and rolling back immediately to a known-good revision if live completion, escalation, latency, or cost metrics regress.
* **Run-Linked User & Operator Feedback Capture:** Expose an authenticated Backstage API and UI control allowing users and operators to submit structured outcome feedback linked directly to a specific `runId` and `agentRevision`.

### Authenticated Provider Callback Ingress for Async Operations (P13)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P13 - Durable waiting for external operations) -->

* **Callback Webhook-to-Signal Bridge:** Expose authenticated ingress endpoints to receive asynchronous completion callbacks from external providers (CI systems, deployment controllers, VCS webhooks), verify provider signatures, deduplicate delivery IDs, and signal the corresponding waiting Temporal workflow with the `OperationHandle` correlation key.

### Mid-Run User Reauthorization Flow & Distinct Audit Facts (P14)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P14 - Reauthorization and credential renewal during a run) -->

* **Re-Consent & Reauthorization Endpoint:** When a run enters `reauth_required`, surface the prompt in the Backstage UI/API so the user can refresh delegated consent, trigger a fresh Backstage RBAC check, and signal the paused workflow to resume.
* **Separate Auditable Governance Facts:** Record the initiating actor (`UserRef`), mid-run credential standing/reauthorization event, and human approval decision as three distinct, non-conflated records in the audit ledger.

### Operator Fleet Health & Administrative Recovery Controls (P16)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P16 - Worker-fleet operational controls) -->

* **Admin Fleet Health & Stalled-Run Surface:** Expose authenticated operator endpoints/views summarizing task-queue backlog age, active worker versions, and stalled/abandoned runs, alongside admin-authorized actions to trigger recovery or safe termination.

### Schedule Occurrence Transparency & Policy Configuration API (P17)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P17 - Schedule overlap and missed-run semantics) -->

* **Expose Full Schedule Policy Controls:** Extend the schedule create/update REST API and UI to accept and validate `overlapPolicy`, `timezone`, `jitter`, `catchupWindow`, and `pauseOnFailure` settings.
* **Surface Skipped & Recovered Occurrences in Job History:** Job history views and API responses must display the computed `nextRunAt` timestamp as well as explicit audit entries for ticks that were `skipped` (due to overlap), `coalesced`, `recovered` (after an outage), or `paused_on_failure`.

### Backstage `rootConfig` Secret Resolution & Router Factory DI Wiring
<!-- Source: incoming/SECRETS_MANAGEMENT.md -->

* **Consume Secrets Exclusively via `coreServices.rootConfig`:** Because Backstage provides no native `coreServices.secrets` API, all backend plugins and capability modules must read credentials through `coreServices.rootConfig` (e.g., `config.getString(...)`) backed by `${ENV_VAR}` substitution in `app-config.yaml` rather than reading `process.env` directly inside business logic.
* **Centralized Factory Dependency Wiring (`createRouter` / Factory):** Wire both `StateSerializer` (cryptographic checkpoint guard) and `ToolRegistry` (tool pack registry, functional executors, and Zod parameter schemas) at the backend plugin/router factory boundary so core execution modules remain decoupled from concrete encryption and tool implementations.

### `runtimeStoreExtensionPoint` & Per-Contract Registration Guards
<!-- Source: incoming/STORAGE_RUNTIME_README_PERSISTENT_STATE.md -->

* **Storage-Agnostic Core Plugin via `runtimeStoreExtensionPoint`:** The core backend plugin must not depend directly on any storage implementation. Expose `runtimeStoreExtensionPoint` in `core-node` with granular per-contract setters (`SessionStore`, `CheckpointStore`, `RunStore`, `ArtifactSink`, `AuditLogSink`) so alternative backends (SQL, Redis, DynamoDB) can register modularly.
* **Reject Duplicate Store Registrations at Boot:** `runtimeStoreExtensionPoint` setters must throw an immediate startup error if two modules attempt to register the same persistence contract.
* **Default Core Database & Startup Schema Migrations:** Default all five contracts to Backstage's `coreServices.database` (supporting Postgres, MySQL, and SQLite) with automatic migration execution on startup, and validate at boot that `ai.runtime.stores.redis.connection` is present whenever any store selects the `redis` backend.

### Stateless `BackstageTemporalBridge` & Commercial Licensing Posture
<!-- Source: incoming/TEMPORAL_BRIDGE.md -->

* **Stateless Request-to-Workflow Bridge:** Keep Backstage backend singleton services completely stateless. At the HTTP router boundary, resolve request-scoped `BackstageCredentials` (`httpAuth.credentials(req)`) and pass serializable `tenantId` and `initiatedBy` principal identifiers into `BackstageTemporalBridge.startAgentThread(...)` so multi-tenant runs never leak request state across concurrent requests.
* **Permissive Commercial Licensing Invariant:** Maintain strict dependency hygiene around permissive open-source licenses (MIT-licensed Temporal SDK + Apache 2.0-licensed Vercel AI SDK) with zero copyleft dependencies so the platform can be white-labeled and distributed in commercial managed Backstage deployments.

### Lightweight Backstage `@temporalio/client` Gateway Configuration
<!-- Source: incoming/TEMPORAL_WORKER.md -->

* **Thin Pass-Through Client Role:** Keep the Backstage backend plugin lightweight by depending solely on `@temporalio/client` (gRPC) to enqueue runs onto the configured Temporal cluster (`temporal.address`, `temporal.taskQueue`) and immediately return `202 Accepted` with `{ workflowId, runId }`, leaving all heavy runtime dependencies isolated in the standalone worker fleet.

### Schedule Backfill, Immediate Trigger & Visibility Consistency Handling
<!-- Source: incoming/TEMPORAL_WORKERS_AND_SCHEDULES.md -->

* **Manual Trigger & Historical Backfill Actions:** In addition to CRUD and pause/resume controls, expose admin/authorized endpoints for triggering an immediate ad-hoc execution (`schedule.trigger`) and executing bounded historical backfills (`schedule.backfill` with explicit overlap policy).
* **Handle Visibility Eventual Consistency in UI/API:** Because Temporal's schedule listing APIs are eventually consistent, persist authoritative schedule metadata in the control-plane database (or handle read-after-write lag gracefully) so newly created or deleted schedules reflect immediately in Backstage UI lists.

### Non-Circular Extension Collection & Boot Freezing (`plugin.ts`)
<!-- Source: incoming/TOOL_REGISTRY_AND_STATE_SERIALIZER_IMPLEMENTATION_PLAN.md -->

* **Two-Phase Staging & Freeze Boot Pattern:** Eliminate circular dependency loops during Backstage backend startup by:
  1. **Collection Phase (`register(env)`):** Register `toolExtensionPoint` against a stateless in-memory staging array so capability modules can register tools before database or logger services initialize.
  2. **Initialization Phase (`registerInit`):** Once `coreServices.database` and `coreServices.logger` resolve, synchronize staged tool schemas into persistent inventory, seal the active `InMemoryToolRegistry` via `.freeze()`, and inject it into `createAiBackendServices` and `createRouter`.

### Backstage Frontend Capability Preflight Endpoint
<!-- Source: incoming/TOOLS_EXPLANATIONS.md (Section 1.5) -->

* **Pre-Run Readiness & Account-Connection Check:** Expose an authenticated Backstage REST endpoint returning the per-caller capability preflight report (`ready`, `connect_account`, `not_served`, `denied`) so frontend task wizards can prompt users to connect missing OAuth accounts or select valid providers before launching a run.

### OAuth Callback Binding & CSRF / Substitution Protection
<!-- Source: incoming/TOOLS_EXPLANATIONS.md (Section 5) -->

* **Bind OAuth State to Initiating User & Provider Instance:** At the Backstage HTTP OAuth callback endpoint, cryptographically bind the single-use `state` nonce and PKCE `code_verifier` to both the initiating Backstage `UserRef` (`coreServices.httpAuth`) and the target `providerId` instance—rejecting mismatched callers, replayed states, or callback-substitution attempts.

### Two-Sided Backstage RBAC, Capability Report API & Token Broker Endpoints
<!-- Source: incoming/TOOLS_INTERFACE_OPTIONS.md (Sections 2.3 - 2.5, 3) -->

* **Conditional `driver-capability` Permissions & Two-Sided Authorization:** Register a `driver-capability` resource type with `driver.capability.invoke` and `driver.capability.read` permissions, evaluating conditional rules (`capabilityIs`, `capabilityLayerIs`, `categoryIs`, `providerIs`, `providerInstanceIs`, `effectIs`, `standingIs`, `serviceScopeIs`, `targetOwnedBy`, `dataClassAtMost`, `invokedByAgent`). Enforce two-sided authorization on every call:
  `effective = userPolicy(user, capability, standing, target) ∩ agentManifest(agent) ∩ adminKillSwitch` (an agent's declared manifest acts as a strict ceiling).
* **Per-Caller Capability Report Endpoint (`GET /capabilities?agent=<id>`):** Expose the solver's preflight matrix (`ready`, `connect_account`, `unbound`, `not_served`, `not_permitted`, `disabled`, `degraded`, `not_declared`) so Backstage UI wizards can render targeted prompts (e.g., "Connect GitHub to enable Publish").
* **Server-Side Token Broker Consent & Account Management Endpoints:** Expose Backstage frontend/backend OAuth 2.0 + PKCE consent endpoints (`github-prod`, `jira-corp`, etc.) and user/admin connected-account revocation views backed by the KMS-encrypted Token Broker.
* **Exact-Intent Write Approval UX:** For `write` / `destructive` capabilities using pure `HttpIntent` drivers, render the exact resolved HTTP method, path, and redacted body on Backstage human-approval screens.

### Backstage RBAC Permissions, OBO Identity Extraction & HITL Approval Surfaces
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 3: Unintended Actions and Permissions) -->

The Backstage control-plane plugin binds every workflow run and tool invocation directly to Backstage's native identity and permission framework:

- **Authenticated Caller Extraction (`HttpAuthService` / `AuthService`):**
  - Every API request and SSE subscription validates the caller via `HttpAuthService` (no `'anonymous'` fallbacks). The control plane extracts the canonical `userEntityRef` and initiates an OBO credential grant via `AuthService` / Token Broker, passing only an opaque `oboGrantRef`—never raw bearer tokens—to Temporal.
- **Granular RBAC (`@backstage/plugin-permission-node`):**
  - Register fine-grained permission rules per capability and risk tier (e.g., `agent.workflow.execute`, `agent.tool.scaffolder.execute`, `agent.tool.k8s.delete`) evaluated via `PermissionsService` against user group membership and target Backstage Catalog entity ownership (`spec.owner`).
- **HITL Approval Dispatch & Callback Endpoints:**
  - When a workflow enters a `WRITE_HIGH` gate, the control plane publishes the `dryRun` diff preview, target `catalogEntityRef`, and expiration deadline to Backstage Notifications (and optional Slack webhook integrations) and exposes an RBAC-protected `/runs/:runId/approvals/:approvalId` endpoint that validates approver authority before signaling Temporal.

### UI Markdown Exfiltration Hardening
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 4: Prompt Injection) -->

To prevent indirect prompt injections from leaking sensitive catalog or repository context via rendered chat responses:

- **Blocked External Image Beacons:** The Backstage UI chat and run-detail Markdown renderer must disable rendering of external `<img>` / Markdown image embeds (`![alt](https://...)`) and enforce a strict Content Security Policy (`img-src 'self' data:`) so crafted URLs cannot trigger automatic browser GET requests to attacker-controlled servers.
- **Link Domain Allowlisting:** Render outbound hyperlinks with `rel="noopener noreferrer"` and restrict auto-linked URLs to approved enterprise domains (e.g., internal Backstage, GitHub Enterprise, observability portals), displaying explicit visual warnings on unverified external links.

### SSE Step-Progress Streaming & Speculative Context Pre-Fetching
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 5: Latency and Token Costs) -->

To eliminate perceived latency during multi-step agent runs, the Backstage control plane pairs real-time progress streaming with parallel context warming:

- **Granular SSE Step Events:** Stream structured progress events (`step.started`, `tool.executing`, `approval.required`, `step.completed`) with human-readable status labels (e.g., *"Querying Software Catalog..."*, *"Validating Scaffolder parameters..."*) over the authenticated SSE stream rather than holding the UI silent until final completion.
- **Speculative Pre-Fetching on Session Open:** Upon authenticated drawer or workflow launch (`HttpAuthService`), asynchronously pre-fetch the caller's `userEntityRef`, group memberships, and owned Backstage Catalog components in parallel so initial prompt assembly starts with warm context.

### Unified Multi-Channel Ingress Gateway, Identity Resolution & Egress Renderers
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 6: Gateway and Channel Routing) -->

To avoid duplicating agent logic across the Backstage Web UI, Slack/Microsoft Teams, GitHub/GitLab webhooks, and CLI clients, the Backstage control plane implements a channel-agnostic ingress and egress gateway:

1. **Canonical `NormalizedEventEnvelope`:**
   - Thin ingress routers (Backstage React UI HTTP/SSE, Slack/Teams bot endpoints, GitHub/PagerDuty webhook receivers, CLI RPC) validate transport signatures and translate platform-specific payloads into a single internal envelope:
     - `source` (`backstage-ui` | `slack` | `teams` | `github-webhook` | `cli`)
     - `actorUserRef` (canonical Backstage `user:<namespace>/<name>` or verified automation principal)
     - `sessionKey` (deterministic composite routing key)
     - `targetEntityRef` (optional Backstage Catalog entity context)
     - `idempotencyKey` (platform event/delivery ID)
     - `payload` & `attachmentRefs` (oversized files/images offloaded to `ArtifactSink` at ingress)
2. **Cross-Channel Identity Resolver (Zero `'anonymous'` Fallbacks):**
   - External channel adapters verify webhook/signing secrets and resolve external handles (Slack user IDs, Teams AAD OIDs, GitHub logins) to a verified Backstage Catalog `User` entity via Backstage's identity/OAuth bindings *before* dispatching to Temporal.
   - Unresolved external identities are rejected with `PERMISSION_DENIED`; the gateway never falls back to `'anonymous'` or shared default identities.
3. **Deterministic Entity-Scoped Composite Session Keys:**
   - Interactive sessions use `tenant:<tenantId>:user:<userEntityRef>:entity:<catalogEntityRef>:thread:<threadId>`.
   - Event-driven automations use `tenant:<tenantId>:webhook:<provider>:<repoOrService>:<eventSubjectId>`.
   - Sharing the same composite key across surfaces allows a developer to start an incident triage in a Slack thread and continue the exact same session inside the Backstage entity drawer.
4. **Channel-Aware Egress Formatters:**
   - The reasoning runtime emits standard GitHub-Flavored Markdown paired with structured metadata blocks (HITL approval cards, catalog entity refs, trace links).
   - Lightweight egress adapters render surface-appropriate views (Backstage MUI components over SSE, Slack Block Kit cards with character chunking, or GitHub PR Markdown comments) and enforce channel rate-limit backoff.

### Event Broker Debouncing, Cooldowns & Notification Hand-Off
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 7: Proactive Triggers and Scheduling) -->

The Backstage control plane coordinates inbound infrastructure events, alert storm suppression, and asynchronous user hand-offs:

- **Event Ingress & Redis Debounce / Cooldown Windows:**
  - Subscribe to GitHub, PagerDuty, CI/CD, and Software Catalog mutations via `@backstage/plugin-events-node`.
  - Apply a configurable Redis debounce window (e.g., 60 seconds) and per-entity cooldown TTL so correlated multi-service alert bursts are batched into a single root-cause workflow run rather than spawning duplicate investigations.
- **Quiet Hours & `@backstage/plugin-notifications` Hand-Off:**
  - Enforce configurable active-hour windows for low/medium-severity proactive findings so routine checks do not page developers off-hours.
  - When a background run produces an actionable finding or reaches a `WRITE_HIGH` HITL gate, emit a structured notification via `@backstage/plugin-notifications` (in-app Backstage UI + Slack DM) containing a deep link that transitions the isolated trigger session into an interactive user session.

### Stateless SSE Reconnection & Mid-Stream Recovery
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 14: Crash Recovery and State Durability) -->

When a user refreshes their browser tab or a Backstage web pod restarts mid-generation, the control plane recovers live streaming state seamlessly:

- **Temporal Query + Redis Stream Replay:** `llmStepActivity` publishes scrubbed token and step-status deltas to a short-TTL, tenant-scoped Redis Stream (`tenant:<tenantId>:run:<runId>:stream`), while Temporal maintains the authoritative checkpoint state via `getWorkflowProgress`.
- **Authenticated Reconnect (`Last-Event-ID`):** On SSE reconnect, the Backstage endpoint authenticates the caller via `HttpAuthService`, verifies run ownership/RBAC via `PermissionsService`, snapshots current state from `getWorkflowProgress`, and replays missed Redis Stream events from `Last-Event-ID` without interrupting the active Temporal workflow.

### Auth-Wall Notification Hand-Off & Manual Unblock Endpoints
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 16: Bot Detection and Authentication Walls) -->

When a workflow suspends on `AuthenticationRequiredError`, the Backstage control plane provides two RBAC-verified unblock paths via `@backstage/plugin-notifications`:

- **User-Scoped Remote Browser Session:** Dispatches a deep link to an ephemeral, single-user remote browser view bound strictly to the triggering `userEntityRef` so the user can complete corporate SSO/MFA once and signal Temporal to resume.
- **"Paste Content / Upload Document" Fallback:** Provides an inline Backstage drawer action allowing the user to paste the relevant runbook text or upload a file directly into `ArtifactSink`, unblocking the suspended Temporal workflow without browser automation.

### Interactive Memory Citations & User "Forget / Mark Outdated" Controls
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 19: Stale and Conflicting Facts) -->

To keep engineers in direct control of stored context and prevent stale assumptions from persisting across runs:

- **Expandable Memory Attribution Chips:** Surface retrieved Mem0 memories in the Backstage UI drawer as subtle, expandable citations (e.g., *"Using 2 saved preferences · 1 service note"*) showing provenance (`sourceType`) and last-verified timestamp.
- **Immediate Forget / Mark Outdated Endpoints:** Expose RBAC- and ownership-verified endpoints (`DELETE /memories/:memoryId`, `PATCH /memories/:memoryId/outdated`) so clicking **Forget** immediately hard-deletes the record from Mem0 and logs an `AuditLogSink` entry.

### Background Jobs Health Dashboard & One-Click Retry Endpoint
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 21: Silent Failures in Background Tasks) -->

The Backstage control plane exposes operational visibility and recovery controls over all scheduled and event-triggered background executions:

- **"Background Jobs & Health" UI Tab (`RunStore` Ledger):** Query `RunStore` (`scheduleId`, `temporalWorkflowId`, `targetEntityRef`, `status`, `consecutiveFailures`, `diagnosticSummary`, `tokenCost`, `traceUrl`) to render an auditable health view in the Backstage plugin UI.
- **Actionable Failure Cards & RBAC-Protected "Retry Now" Endpoint:** Escalated notifications include deep links to the Temporal Web UI and OTel/Langfuse trace alongside a **Retry Now** action backed by an `HttpAuthService` + `PermissionsService` (`agent.schedule.trigger`) endpoint that records an `AuditLogSink` entry on manual re-trigger.

### Real-Time Streaming Bridge, `<500ms` Acknowledgment & Channel Egress Chunking
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 23: Streaming and Latency Perception) -->

To keep multi-step Temporal executions responsive across the Backstage Web UI and messaging channels without hitting HTTP gateway timeouts or chat API rate limits:

1. **Optimistic `<500ms` First Acknowledgment:**
   - Upon authenticating the caller (`HttpAuthService`) and dispatching the run to Temporal, return an immediate `202 Accepted` / optimistic UI stream acknowledgment within `<500ms`—before Mem0 retrieval, skill hydration, or the first LLM turn begins.
2. **Tenant-Isolated Redis Stream -> Backstage SSE (`createUIMessageStream`):**
   - Temporal Activities publish scrubbed, typed delta events (`step_started`, `tool_status`, `text_delta`, `approval_required`, `done`) to a short-lived Redis Stream (`tenant:${tenantId}:run:${runId}:stream`, `15-minute` TTL).
   - The RBAC-verified Backstage SSE endpoint (`/api/agent/runs/:runId/stream`) tails this stream and adapts events to Vercel AI SDK's UI Message Stream protocol (`useChat`), supporting seamless `Last-Event-ID` replay across browser refreshes and pod restarts.
3. **Surface-Specific Egress Adapters:**
   - **Backstage React Drawer:** Renders live token-by-token `text_delta` streams paired with collapsible Material-UI step accordions (`Reasoning -> Queried Catalog -> Inspected Logs`) that collapse automatically on completion.
   - **Slack & Microsoft Teams:** Suppresses token-by-token streaming (avoiding `429` throttling) in favor of an immediate thread status reply updated in place (`chat.update`) at major step transitions. Final responses are split at paragraph or code-fence boundaries (preserving balanced ```` ``` ```` tags) to stay strictly under platform limits (`< 3,000` characters for Slack Block Kit).

### Active View Context Forwarding & Interactive Clarification Chips
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 24: Ambiguity and Over-Eagerness) -->

- **UI View Context in Ingress Envelope:** The Backstage React drawer attaches the user's current route context (`currentEntityRef`, `kind`, `namespace`, active plugin tab) to the `NormalizedEventEnvelope` so agents resolve implicit targets automatically.
- **Quick-Reply Option Rendering:** When a workflow enters `AWAITING_CLARIFICATION`, render `ask_clarification.options` as clickable quick-reply chips in the Backstage drawer and interactive buttons in Slack Block Kit, routing selections through the authenticated `/runs/:runId/clarify` endpoint.

### Notification Triage Engine, Alert Deduplication & Quiet-Hours Governance
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 28: Notification Fatigue and False Alarms) -->

To prevent proactive workflows from spamming engineers and causing alert blindness, all outbound notifications route through a deterministic triage and suppression layer atop `@backstage/plugin-notifications`:

1. **Four-Tier Urgency Routing (`SILENT` | `DIGEST` | `ACTIONABLE` | `CRITICAL`):**
   - **`SILENT`:** Expected transient noise or self-healed state; recorded in `AuditLogSink` / OTel telemetry with zero user notification.
   - **`DIGEST`:** Low-urgency hygiene items batched into a per-user / per-team 24-hour digest queue.
   - **`ACTIONABLE`:** Requires engineer review during configured active hours; delivered to Backstage in-app notifications immediately and held for external Slack/Teams delivery until `nextWorkingHourStart` if outside quiet hours.
   - **`CRITICAL`:** Production outage, security alert, or blocked deployment; bypasses quiet hours and pages immediately via Slack/PagerDuty.
2. **Tenant-Scoped Alert Deduplication Fingerprints:**
   - Compute `sha256(tenantId + ruleId + catalogEntityRef + normalizedErrorType)` and store active alert fingerprints in Redis (`tenant:${tenantId}:alert:fp:${hash}`) with a cooldown TTL (default `6h`), suppressing duplicate pings unless severity escalates to `CRITICAL`.
3. **Audited Quiet Hours, Snooze (24h) & Mute Controls:**
   - Store user/team working-hour schedules, **Snooze (24h)** timers, and **Mute Rule for This Service** suppressions in an audited PostgreSQL/Redis policy store (never in Mem0), enforcing RBAC (`PermissionsService`) before allowing team-wide rule muting.

### Multi-Party Visibility Scopes, Deterministic Trigger Gates & Per-Turn Speaker Auth
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 29: Multi-Party and Group Chat Etiquette) -->

Shared collaboration surfaces (Slack `#team-*` / `#incident-*` channels, GitHub PR/Issue threads, multi-user Backstage entity discussions) are treated as untrusted multi-party security zones distinct from 1:1 sessions:

1. **Explicit `visibilityScope` Classification (`DIRECT_PRIVATE` | `SHARED_CHANNEL`):**
   - Every `NormalizedEventEnvelope` declares `visibilityScope`:
     - **`DIRECT_PRIVATE`:** 1:1 Backstage drawer, personal Slack DM, or single-user CLI session.
     - **`SHARED_CHANNEL`:** Multi-user Slack channels, GitHub PR/Issue threads, and shared entity discussions.
2. **Deterministic Pre-LLM Ingress Trigger Gate:**
   - In `SHARED_CHANNEL` contexts, webhook ingress drops general channel chatter deterministically at zero LLM cost unless the agent is explicitly `@mentioned`, invoked via slash command (`/backstage`), or addressed inside an active bot-owned thread.
3. **Per-Turn Speaker Identity Resolution (Never Cache Thread Creator):**
   - Never reuse a thread starter's identity or `oboGrantRef` for subsequent participants. On **every turn** in a shared thread, resolve the exact speaking participant's `actorUserRef` via the Cross-Channel Identity Resolver (rejecting unmapped users with `PERMISSION_DENIED`; zero `'anonymous'` fallbacks) and mint a turn-scoped `oboGrantRef`.
4. **Shared-Channel Output Sanitization & Attribution:**
   - Pass all outbound `SHARED_CHANNEL` replies through a strict egress sanitizer stripping internal-only URLs, private user mentions, and secret patterns, and stamp actions with explicit speaker attribution (e.g., *"Triggered by `user:default/alice` via Backstage Agent"*).

### Dual Local + UTC Timestamp Echo in Schedule & HITL Confirmations
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 30: Time, Timezone, and Recurrence Math) -->

- **Unambiguous Time Display:** Whenever the Backstage UI or Slack card displays a scheduled workflow, maintenance window, or HITL expiration deadline, render both the user's resolved IANA local time and `UTC` side by side (e.g., *"Every Monday at 9:00 AM America/New_York (14:00 UTC)"*).

### Deterministic UI Verification Proof Cards
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 31: Sycophancy and Hallucinated Completion) -->

- **Activity-Sourced Proof Cards:** Alongside the agent's final summary, render deterministic Material-UI **Verification Proof Cards** populated strictly from verified Temporal activity outputs (`entityRef` links, GitHub PR URLs, commit SHAs, CI run links, and verified diff checksums) rather than trusting unverified LLM prose.

### Authenticated `/stop` & `/steer` Control Endpoints with `<100ms` SSE Feedback
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 35: Interrupting an Active Run Safely) -->

- **RBAC-Verified Run Control:** Expose `/api/agent/runs/:runId/stop` and `/api/agent/runs/:runId/steer` endpoints protected by `HttpAuthService` and `PermissionsService` (verifying session ownership or admin override) and audited in `AuditLogSink`.
- **Optimistic `<100ms` UI Feedback:** Immediately upon dispatching `abortSignal` or `steerSignal` to Temporal, publish a `cancelling` / `steered` status delta to the run's Redis Stream (`tenant:${tenantId}:run:${runId}:stream`) so the Backstage drawer's **Stop** button and input controls respond in `<100ms`.

### Idempotent Approval Card Lifecycle & Expired-Link UX
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 36: Resuming Paused Workflows Across Days) -->

- **Control-Plane Fresh Grant Minting on Approval:** When an authorized reviewer clicks **Approve** on a delayed notification card, the `/runs/:runId/approvals/:checkpointId` endpoint validates caller identity (`HttpAuthService`) and RBAC (`PermissionsService`), mints a fresh `oboGrantRef`, and signals Temporal with `(checkpointId, decision, oboGrantRef)`.
- **Card State Synchronization (`Pending` -> `Approved` | `Expired` | `Drifted`):** Update Backstage Notification records and Slack Block Kit messages in place whenever a checkpoint settles or expires after `7 days`, ensuring double-clicks or days-old links return clear status feedback rather than silent errors.

### Stateless Multi-Surface Thin Clients & Cross-Tab UI Synchronization
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 37: Split-Brain State Across Devices) -->

- **Zero Client-Side State Ownership:** Backstage Web UI drawers, Slack/Teams threads, and CLI clients operate strictly as stateless thin clients—never storing conversation history, workflow checkpoints, or tokens in browser `localStorage` or local CLI files. Every surface binds to the same canonical `sessionKey` and renders authoritative state from Temporal (`getWorkflowProgress`) and Redis Streams.
- **Cross-Tab Synchronization (`SSE` + `BroadcastChannel`):** Multiple open Backstage browser tabs subscribe to `/api/agent/runs/:runId/stream` and coordinate lightweight UI state notifications (`{ type: 'RUN_STATE_CHANGED', runId, checkpointId }`) via `BroadcastChannel` so an approval click or message in one tab updates all open tabs immediately without duplicate submissions.

### Passive Connectivity Banner & Chat Error-Spam Suppression
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 40: Network Offline and Captive Portal Handling) -->

- **Suppress Raw Transport Errors in Chat Transcripts:** Never inject `ENOTFOUND`, `ECONNRESET`, or `ConnectivityDegradedError` messages into `SessionStore` transcripts or Slack threads during transient outages. Surface a passive connection-status indicator (`Offline — Queued, will resume automatically` / `Workstation offline — waiting for reconnect or run in cloud?`) in the Backstage UI drawer and escalate alerts only if an outage exceeds `15 minutes`.

### Streaming Attachment Quarantine Ingress
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 44: Malicious File & Media Payloads) -->

- **Zero Pod-Memory Buffering:** Backstage UI and Slack/Teams ingress endpoints stream binary attachments directly into KMS-encrypted, tenant-prefixed quarantine storage (`tenants/${tenantId}/quarantine/${runId}/${artifactId}`) with `25 MB` size enforcement—never buffering raw user uploads in Backstage backend pod memory or passing raw bytes through Temporal payloads.

### Break-Glass Admin Endpoints, Slack Freeze Command & Safe-Boot Flags
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 45: Out-of-Band Disaster Recovery ("Break Glass")) -->

- **Out-of-Band Admin Break-Glass API & Slack Command:** Expose a dedicated mTLS/OIDC-protected `POST /api/agent/admin/break-glass` endpoint (authenticated via a dedicated SRE IAM/RBAC role distinct from agent OBO flows) and a `/backstage-agent-freeze` Slack slash command restricted to `@platform-oncall`.
- **Safe-Boot & GitOps Pin Overrides (`BACKSTAGE_AGENT_SAFE_BOOT=true`):** Support startup environment toggles (`BACKSTAGE_AGENT_SAFE_BOOT=true`, `AGENT_DISABLE_DYNAMIC_SKILLS=true`, `AGENT_PINNED_SKILL_SHA=<sha>`) alongside `@backstage/plugin-feature-flags` so SREs can recover from a broken prompt or skill merge via a single Helm/ArgoCD rollback.

### Two-Plane Voice Architecture, Sub-Second Barge-In & Visual Offloading
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 46: Voice, Audio, and Real-Time Interruption) -->

Real-time voice interactions (on-call hands-free triage, incident war rooms, pair-debugging) split the **Sub-Second Media Edge** from the **Durable Temporal Control Plane**:

1. **WebRTC Media Edge (LiveKit / Pipecat) vs. Temporal Action Plane:**
   - Run a dedicated WebRTC voice edge service handling browser/OS Acoustic Echo Cancellation (`echoCancellation: true`), noise suppression, jitter buffers, and transformer-based semantic endpointing at `< 250ms` latency.
   - Delegate actual Backstage queries and infrastructure actions asynchronously to Temporal Workflows while speaking an immediate status acknowledgment.
2. **Sub-Second Barge-In (`< 50ms` Local Flush + Temporal Signal Bridge):**
   - When speech onset is detected during TTS playback, the WebAudio client flushes its local playback buffer in `< 50ms`, cancels the active TTS stream, and forwards a `steerSignal` or `abortSignal` to any in-flight Temporal Workflow.
3. **Out-of-Band Visual Offloading & Authenticated UI Approval:**
   - Push verbose stack traces, diffs, and `WRITE_HIGH` HITL approval cards silently to the caller's Backstage Web Drawer or Slack DM via Redis Streams rather than reading tables/SHAs aloud or accepting voice-only approvals for high-risk mutations.
4. **Multi-Party War-Room Acoustic Privacy:**
   - Require explicit Push-to-Talk, wake-phrase activation (*"Hey Backstage"*), or an explicit `/join-war-room` invite with a visible active-listening indicator—never leaving an unmuted always-listening bot in shared war rooms.

### "Save to Service Runbook" UI Confirmation Action
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 52: Organizational Memory vs. Personal Memory Governance (Who Owns Learned Knowledge?)) -->

- **One-Click Stage-2 Promotion Chip:** When an untainted incident triage or debugging run uncovers a reusable operational finding for an active `catalogEntityRef`, render an interactive **"Save note for ``"** action chip in the Backstage drawer backed by an RBAC-checked (`PermissionsService`) endpoint that promotes the DLP-scrubbed fact into `entityRef`-scoped Mem0 (`verifiedBy: 'user'`).

### Per-Turn Developer Feedback Endpoint & PR Outcome Webhook Ingestion
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 53: Developer Feedback Loops, Calibration & Trust Metrics (Beyond Technical Telemetry)) -->

- **Inline Drawer Feedback Controls (`POST /api/agent/runs/:runId/turns/:turnId/feedback`):** Render Thumbs Up/Down buttons with structured `"Why?"` category chips (`Incorrect Entity/Context`, `Hallucinated Tool/Fact`, `Too Verbose`, `Wrong Environment`, `Other`) on every assistant turn in the Backstage drawer, authenticated via `HttpAuthService` and scrubbed before telemetry ingestion.
- **PR Outcome Event Subscription (`@backstage/plugin-events-node`):** Subscribe to repository `pull_request.closed` webhook events matching agent branch prefixes to record merge vs. close-without-merge outcomes against the originating `RunStore` record.

### Token Broker OAuth / GitHub App Consent & Callback Endpoints
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section A: Provider and authorization design) -->

- **Authenticated Consent Initiation & Callback Routes:** Expose `GET /api/agent/auth/:provider/authorize` and `GET /api/agent/auth/:provider/callback` protected by `HttpAuthService`, CSRF `state` nonces bound to `(tenantId, userEntityRef)`, and PKCE verifiers.
- **KMS-Encrypted Grant Storage & Opaque Handle Issuance:** Store exchanged access/refresh token pairs exclusively inside the Token Broker's KMS-encrypted database table (`agent_oauth_grants`) and return only an opaque `oboGrantRef` handle to the workflow control plane.

### Connection Settings UI, OAuth Callback Binding & Recovery State Machine
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section B: Connection and consent UX) -->

The Backstage control plane provides a dedicated **Agent Connections** settings surface and hardened OAuth lifecycle endpoints:

1. **Connection Lifecycle State Machine:**
   - Track and surface five explicit states per `(tenantId, userEntityRef, providerId, providerInstanceId)`:
     - `connected` (valid grant with required permissions)
     - `insufficient_permission` (connected account lacks scopes/permissions needed by requested capabilities)
     - `expired` (access token expired and refresh unavailable/failed)
     - `revoked` (upstream grant revoked by user or org admin)
     - `reconnect_required` (active run paused awaiting re-authentication)
2. **Connection Settings UI & Endpoints:**
   - Render connected upstream account identity (`providerAccountLogin` / ID), provider instance URL (e.g., `github.com` vs. GHES instance), granted permissions summary, and current state.
   - Expose `HttpAuthService`-authenticated endpoints:
     - `GET /api/agent/connections` (list connections and status)
     - `POST /api/agent/connections/:providerInstanceId/connect` (initiates consent with human-readable permission breakdown)
     - `GET /api/agent/connections/:providerInstanceId/callback` (exchanges code, updates grant, and signals paused runs if applicable)
     - `DELETE /api/agent/connections/:providerInstanceId` (invokes upstream provider token/grant revocation where supported, purges encrypted grant, and logs `AuditLogSink` event)
3. **CSRF, PKCE & Callback-Substitution Protection:**
   - Store a single-use, `10-minute` TTL state record in Redis binding `(stateNonce, pkceCodeVerifier, tenantId, initiatingUserEntityRef, providerId, providerInstanceId, pausedRunId?)`.
   - At callback time, verify the active `HttpAuthService` caller matches `initiatingUserEntityRef` and consume `stateNonce` atomically—preventing CSRF and cross-user callback substitution.

### Backstage Module Extension Points, Package Exports & Principal-Filtered Discovery
<!-- Source: incoming/TOOLS_REGISTRY.md (Sections: Fit with B/C and the possible D deployment, Lifecycle and governance requirements, Recommended implementation sequence) -->

- **Public Package Boundary (`@ai-crew-suite/plugin-platform-node`):** Export canonical `CapabilityDescriptor`, `CapabilityCatalogReader`, and `CapabilityGatewayClient` contracts exclusively from the public `plugins/platform-node/src/index.ts` barrel (removing internal `plugins/_node` cross-imports) and require structured `LoggerService` injection.
- **Boot-Time Snapshot Freeze:** Collect extension-point registrations during Backstage backend module initialization and freeze the compiled `CapabilityCatalog` snapshot before mounting HTTP/SSE routes.
- **Principal-Aware Discovery Endpoint:** Expose `GET /api/agent/capabilities` authenticated via `HttpAuthService` and filtered by `PermissionsService` + active user connection state, returning deterministic availability reasons (`available`, `connect_account`, `not_permitted`, `disabled`, `unbound`) without leaking cross-tenant or unauthorized capability bindings.

### Backstage New Backend System RBAC Wiring (`coreServices.httpAuth` & `coreServices.permissions`)
<!-- Source: incoming/TOOLS_PERMISSIONS_RBAC.md (Sections: What you must write in your plugin code, Core Crew Suite Backend Plugin Router Implementation of RBAC) -->

- **Standard Backstage Permission Exports:** Export canonical `@backstage/plugin-permission-common` definitions (`agentWorkflowExecutePermission`, `agentToolExecutePermission`) from the shared common package so Backstage administrators and external policy wrappers can reference them directly.
- **New Backend System Credential & Permission Wiring:** Backend routes depend on `coreServices.httpAuth` and `coreServices.permissions` (never legacy `coreServices.identity` or `'anonymous'` fallbacks). Every request extracts `credentials = await httpAuth.credentials(req)` and evaluates `permissions.authorize([...], { credentials })` with structured `resourceContext` attributes before dispatching to Temporal or `CapabilityGateway`.

### Backstage Kubernetes & `API` Entity Capability Wiring
<!-- Source: incoming/TOOLS_CATEGORIES.md (Section: Major Missing Categories in the Backstage Ecosystem — Part 2) -->

- **First-Party Kubernetes & API Entity Resolution:** Route `runtime` read queries (`getPodStatus`, `getClusterEvents`) through `@backstage/plugin-kubernetes-backend` using entity-bound annotations (`backstage.io/kubernetes-id`, `backstage.io/kubernetes-label-selector`) and forwarded `BackstageCredentials`, and bind `api-management` actions to Backstage `kind: API` entities (`spec.definition`) so permissions and ownership resolve natively from the Software Catalog.

### Backstage React Drawer Typed UI Stream Parts (`useChat` / SSE Adapter)
<!-- Source: incoming/PI_AGENT.md (Section: How Vercel AI SDK Compares to Pi for a Backstage Plugin) -->

- **Typed UI Event Stream Protocol:** Backstage's React drawer consumes typed SSE stream parts (`text-delta`, `tool-call`, `tool-approval-request`, `tool-result` carrying `uiDetails`) bridged from Redis Streams, enabling native React card rendering for catalog lookups, diff previews, and interactive HITL approval prompts.

### Frontend/Backend AI SDK Package Split & UI Message Stream Protocol
<!-- Source: incoming/PI_AGENT.md (Section: Are Vercel AI SDK's React Hooks a Separate Package from the Backend?) -->

- **Zero Server-SDK Leakage in Frontend Bundles:** Install `@ai-crew-suite/ai-sdk-react` (`@ai-sdk/react` `useChat`) exclusively in Backstage frontend plugins (`packages/app` / UI plugins) and restrict `ai` + `@ai-sdk/*` provider packages strictly to backend/worker packages.
- **UI Message Stream Protocol Over SSE:** Format the Backstage SSE endpoint (`GET /api/agent/runs/:runId/stream`, backed by Redis Streams) using Vercel AI SDK's **UI Message Stream Protocol** so `@ai-sdk/react` (`useChat`) natively renders streamed text deltas, tool execution states, `uiDetails` cards, and `tool-approval-request` prompts across page reloads.

### Backstage Frontend `ContextCollectorProvider` & Reactive Event Router
<!-- Source: incoming/OVERALL_BLUEPRINT.md (Sections: Strategic Flow: Launching a Backstage Agent, Similarities Between Desktop Agents and AI Crew Suite, Semantic Event Bus & Reactive Triggers) -->

- **Frontend `ContextCollectorProvider` (Non-Secret UI Telemetry Only):** A Backstage React provider captures active UI context (`catalogEntityRef`, active tab/route, selected `environment` filter, `sessionId`) and attaches it to agent launch requests. It **never** reads or serializes raw OAuth/access tokens into JSON payloads; user identity is extracted exclusively server-side via `coreServices.httpAuth`.
- **Reactive Event Bus & Webhook `AgentRouter`:** Ingests signed webhooks and broker events (GitHub/GitLab CI failures, PR events, ArgoCD sync failures, PagerDuty alerts) via Kafka/EventBridge/HTTP ingress, normalizes them into typed `TriggerEvent` envelopes, resolves owning Backstage `Component` entities and authorized agent definitions, and starts deduplicated Temporal workflows.
  - **Anti-Loop & Flood Guards:** Verify webhook HMAC/OIDC signatures, deduplicate by `tenantId:source:eventId` in Redis, ignore self-authored agent commits/PRs/comments to prevent feedback loops, and enforce per-entity concurrency caps.

### "Manage My Memory" Backstage UI & Control Plane API
<!-- Source: incoming/MEM0.md (Sections: "Manage My Memory" UI Layout) -->

To satisfy enterprise transparency, GDPR data-subject access/rectification/erasure rights, and human-in-the-loop correction requirements, the Backstage frontend plugin provides a self-service **"Manage My Memory"** settings view backed by authenticated plugin REST endpoints.

#### 1. Backstage UI/UX Structure
* **Category Grouping Tabs:** Group discrete memory items by metadata `category` tags (e.g., *Preferences, Facts, Work Context, Tech Stack*) rather than displaying an unorganized list.
* **Reverse-Chronological / Importance Sort:** Display most recently extracted or updated records first.
* **Inline Edit & One-Click Delete:** Support inline text editing and immediate single-click deletion without page navigation, plus an **Add Custom Memory** modal/input for explicit user seeding.
* **Provenance Tooltips:** Render a metadata pill/tooltip on hover showing creation/update timestamps and origin lineage (e.g., *"Extracted from Workflow Run #... on Oct 14"* or *"Manually added by user"*).

#### 2. Control Plane REST Endpoints & Security Enforcement
Frontend components must never talk to Mem0 or PostgreSQL directly; all operations route through the Backstage backend plugin (`core-backend`):
* `GET /api/<plugin>/memories` — Lists active memories scoped strictly to `(tenant_id, user_id)` resolved from `httpAuth` + `UserInfoService`, grouped by category metadata.
* `POST /api/<plugin>/memories` — Manually seeds a user memory (`infer: false` in Mem0 so exact user phrasing is preserved without LLM re-interpretation), tagged with `provenance: 'user_manual'`.
* `PATCH /api/<plugin>/memories/:memoryId` — Verifies record ownership against `(tenant_id, user_id)` and routes the edit through the Memory Manager.
* `DELETE /api/<plugin>/memories/:memoryId` — Verifies ownership and invokes transactional revocation/erasure, emitting an immutable audit entry.
* **Auth & RBAC:** Every endpoint enforces `httpAuth` credential extraction (no `'anonymous'` fallbacks) and `PermissionsService` checks so users can only view/mutate their own user-scoped memories (while tenant-scoped policies require elevated admin permissions).

### Replacing Mem0 Cloud Dashboard with Native Backstage Governance Views
<!-- Source: incoming/MEM0.md (Sections: OSS vs. Platform Versions) -->

Because self-hosted Mem0 OSS ships with no administrative or user-facing UI, the Backstage frontend plugin provides the sole visual governance surface:

* **End-User View ("Manage My Memory"):** Self-service inspection, inline editing, custom memory seeding, and one-click GDPR deletion scoped to the authenticated user.
* **Tenant Admin View (Policy & Audit):** Governance interface for authoring non-auto-promoted `Policy` records, reviewing `provisional` tenant-scoped facts before activation, and triggering compliant tenant/user data exports.

### Memory Feedback Endpoint (`POST /api/<plugin>/memories/:memoryId/feedback`)
<!-- Source: incoming/MEM0.md (Sections: Implementing Platform Features in Open Source Version) -->

The Backstage control plane exposes an authenticated feedback endpoint wired to the chat UI's thumbs-down / correction drawer:

* **Identity & Ownership Verification:** Resolves `(tenant_id, user_id)` from `httpAuth` / `UserInfoService` (rejecting unauthenticated calls) and verifies via `PermissionsService` that the caller has read/feedback access to `memoryId` within their tenant.
* **Immediate Penalty + Workflow Trigger:** Atomically persists the metadata down-ranking penalty (`feedback_score`) in PostgreSQL/Mem0 and triggers the asynchronous Temporal `memoryRepairWorkflow`, returning `202 Accepted` without blocking the user's UI session.

### Backstage Auth Provider Delegation for Downstream Capabilities
<!-- Source: incoming/MCP.md (Sections: Auth Brokering for External Service MCPs) -->

The Backstage backend plugin leverages Backstage's native Authentication Provider subsystem to broker downstream user-delegated OAuth access without exposing raw tokens to the workflow engine:

* **Control Plane vs. Execution Plane Split:** The Backstage backend plugin owns OAuth consent flows, callback validation (`callbackIssuer`), and encrypted grant persistence, issuing opaque credential references to the Token Broker rather than acting as a stateful workflow graph executor.

### Backstage Trace Deep-Linking for Workflow Runs
<!-- Source: incoming/LLM_OBSERVABILITY_WITH_LANGFUSE.md (Sections: What Your Dashboard Looks Like) -->

Because Temporal `workflowId` serves directly as the root Langfuse `traceId`, the Backstage plugin's workflow run inspector renders a direct deep-link (`${langfuseBaseUrl}/project/${projectId}/traces/${workflowId}`) alongside run status and step history, letting platform engineers jump straight from a Backstage run card to the full LLM/tool/memory waterfall.

### Core Orchestrator Plugin Registry & Unified Control Plane Routes
<!-- Source: incoming/GRAPH_ORCHESTRATOR_INTEGRATION.md (Sections: The Plugin Architecture & Route Registry) -->

Rather than having each domain agent plugin stand up bespoke execution routes and Temporal client wiring, the **Core Orchestrator Backend Plugin** (`plugins-agent-orchestrator-backend`) exposes a singleton workflow registry and a unified REST API surface.

#### 1. Backstage New Backend System Workflow Registration
* **Root-Scoped Registry (`agentWorkflowRegistryRef`):** The core orchestrator exposes a root-scoped service reference (`scope: 'root'`)—or paired `createExtensionPoint`—holding registered `WorkflowBuilder` definitions (`registerWorkflow`, `getWorkflow`, `listWorkflows`) so every domain plugin registers into the same singleton registry instance during `env.registerInit(...)`.
* **Domain Agent Plugin Registration:** Domain backend plugins (e.g., `plugins-alert-tuner-backend`) declare `agentWorkflowRegistryRef` in `deps`, register their compiled workflow definitions at startup, and only mount custom Express routers if domain-specific non-execution endpoints are needed:

```typescript
import { coreServices, createBackendPlugin } from '@backstage/backend-plugin-api';
import {
  agentWorkflowRegistryRef,
  type WorkflowBuilder,
} from '@backstage/plugin-agent-orchestrator-backend';
import { alertTunerWorkflow } from './workflows/alertTuner';

export interface AgentWorkflowRegistry {
  registerWorkflow(workflow: WorkflowBuilder<unknown, unknown>): void;
  getWorkflow(id: string): WorkflowBuilder<unknown, unknown> | undefined;
}

export const alertTunerPlugin = createBackendPlugin({
  id: 'alert-tuner',
  register(env) {
    env.registerInit({
      deps: {
        registry: agentWorkflowRegistryRef,
        httpRouter: coreServices.httpRouter,
      },
      async init({ registry }) {
        registry.registerWorkflow(alertTunerWorkflow);
      },
    });
  },
});
```

#### 2. Standardized Orchestrator HTTP Routes (`/api/agent-orchestrator/v1`)
All Backstage frontend views and external triggers interact with the platform through four unified, `httpAuth`- and `PermissionsService`-protected routes:

| Method | Route                                                        | Description & Governance Enforcement                         |
| :----- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| `POST` | `/api/agent-orchestrator/v1/workflows/:workflowId/execute`   | Validates input against the workflow's Zod schema, verifies tenant/RBAC permissions, resolves caller identity (`tenantId`, `userId`), and starts a Temporal execution. |
| `GET`  | `/api/agent-orchestrator/v1/instances/:instanceId`           | Verifies tenant/owner read access and returns current Temporal execution state, step history, and Langfuse trace deep-link metadata. |
| `GET`  | `/api/agent-orchestrator/v1/instances/:instanceId/artifacts` | Retrieves typed UI artifacts emitted during execution (`ctx.emitArtifact`), scoped strictly to authorized callers. |
| `POST` | `/api/agent-orchestrator/v1/instances/:instanceId/signal`    | Validates HITL approval or external event payloads and dispatches a Temporal Signal to the suspended workflow instance. |

### Backstage Extension Point Packaging (`-node` + `createBackendModule`) & Hardened `/execute` Flow
<!-- Source: incoming/GRAPH_ORCHESTRATOR_INTEGRATION.md (Sections: Core Engine Execution Flow, The Core Plugin Defines an Extension Point) -->

#### 1. Canonical Plugin & Module Topology
To guarantee deterministic startup ordering in Backstage's New Backend System, the Core Orchestrator exposes an **Extension Point** from its `-node` library package (`@backstage/plugin-agent-orchestrator-backend-node`), and each domain agent workflow is packaged as a targeted **Backend Module** (`createBackendModule`):

```typescript
// plugins/agent-orchestrator-backend-node/src/extensions.ts
import { createExtensionPoint } from '@backstage/backend-plugin-api';
import type { WorkflowBuilder } from './builder';

export interface AgentWorkflowExtensionPoint {
  registerWorkflow(workflow: WorkflowBuilder<unknown, unknown>): void;
}

export const agentWorkflowExtensionPointRef =
  createExtensionPoint<AgentWorkflowExtensionPoint>({
    id: 'agent.orchestrator.workflows',
  });
```

```typescript
// plugins/alert-tuner-backend-module/src/module.ts
import { createBackendModule } from '@backstage/backend-plugin-api';
import { agentWorkflowExtensionPointRef } from '@backstage/plugin-agent-orchestrator-backend-node';
import { alertTunerWorkflow } from './workflows/alertTuner';

export const alertTunerBackendModule = createBackendModule({
  pluginId: 'agent-orchestrator',
  moduleId: 'alert-tuner-workflow',
  register(reg) {
    reg.registerInit({
      deps: { orchestrator: agentWorkflowExtensionPointRef },
      async init({ orchestrator }) {
        orchestrator.registerWorkflow(alertTunerWorkflow);
      },
    });
  },
});
```

Host applications compose the core plugin and any number of domain workflow modules in `packages/backend/src/index.ts` via `backend.add(...)`.

#### 2. Hardened `POST /v1/workflows/:workflowId/execute` Handler
Before dispatching a workflow start request to Temporal, the control-plane route enforces four invariants:
1. **Identity & RBAC Verification:** Extract authenticated credentials via `httpAuth` / `UserInfoService` (resolving `tenantId` and `userId`) and verify `workflow.execute` permission via `PermissionsService`.
2. **Schema Validation (`safeParse`):** Validate `req.body` against `workflowDef.meta.inputSchema.safeParse(input)`, returning a structured `400 Bad Request` on validation failure rather than leaking unhandled exceptions.
3. **Collision-Free Instance IDs:** Generate workflow execution IDs using `agent-${tenantId}-${workflowId}-${crypto.randomUUID()}` (or a tenant-scoped idempotency key) rather than `Date.now()`.
4. **Scoped Metadata Propagation:** Attach `tenantId`, `userId`, and `workflowId` to Temporal `searchAttributes` / `memo` (never raw secrets or unredacted PII) and return `202 Accepted` with `{ instanceId }`.

### Control-Plane Isolation & Worker Mode Configuration
<!-- Source: incoming/GRAPH_ORCHESTRATOR_INTEGRATION.md (Sections: Embedded vs. Pooled Temporal Workers) -->

To protect core Backstage IDP responsiveness (Software Catalog, Scaffolder, TechDocs) from CPU- and memory-intensive agent workloads:

* **Config-Driven Worker Toggle:** `plugins-agent-orchestrator-backend` exposes a `app-config.yaml` flag (`agentOrchestrator.worker.embedded: boolean`, defaulting to `true` in local development and `false` in production).
* **Control-Plane-Only Role in Production:** When `embedded` is `false`, Backstage backend pods register only workflow metadata and input/output schemas via `agentWorkflowExtensionPointRef` to power API validation and UI discovery, delegating all step execution over `temporalClient` to the dedicated `agent-workflows` Temporal worker pool.

### Authenticated SSE Stream Endpoint & Live Markdown UI Card
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addStreamingStep(name, handler, options?)) -->

* **Control-Plane Stream Endpoint (`GET /api/agent-orchestrator/v1/instances/:instanceId/stream`):** Verifies caller identity (`httpAuth`) and tenant/instance read permissions (`PermissionsService`) before subscribing to the instance's `agent:stream_chunk` relay channel and forwarding SSE events to the browser.
* **Dynamic Frontend Rendering:** When an execution enters a node marked as a streaming step in the compiled Graph IR, the Backstage run inspector automatically transitions that node's panel from a standard progress spinner into a **Live Markdown Typing Card** rendering incremental chunks in real time.

### Dynamic Branch Highlighting in the Backstage DAG Visualizer
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addChoice(name, router)) -->

* **Multi-Directional Split Rendering:** The Backstage frontend DAG visualizer renders `.addChoice()` nodes as multi-directional decision diamonds.
* **Live Path Telemetry:** As `evaluateChoiceActivity` records the chosen target edge in run history, the UI dynamically highlights the active execution path while dimming bypassed branches for immediate auditability.

### Loop Container & Iteration Telemetry in the Backstage DAG UI
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .repeatUntil(name, config)) -->

* **Grouped Loop Container:** The Backstage frontend DAG visualizer renders `.repeatUntil()` blocks inside a distinct bounding-box container enclosing its nested sub-pipeline steps.
* **Live Iteration Counter:** While execution is active inside a loop block, the UI displays a rotating sync indicator alongside a live iteration badge (e.g., `Turn 2 of 3`) driven by workflow progress telemetry.

### Concurrent Track Grid Visualization in the Backstage UI
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addParallelForEach(name, config)) -->

* **Multi-Column Track Grid:** When execution enters an `.addParallelForEach()` node, the Backstage run inspector expands from a vertical step list into a multi-column **Concurrent Dashboard Track Grid**, rendering each active item as an independent progress lane.
* **Per-Lane Drill-Down:** Expanding any lane displays that specific branch's activity status, retry attempts, and scrubbed execution logs in real time.

### Comparative Simulation Lanes in the Backstage DAG Visualizer
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addHypothesisFork(name, config)) -->

* **Side-by-Side Hypothesis Lanes:** When execution enters an `.addHypothesisFork()` node, the Backstage run inspector splits into parallel **Comparative Simulation Lanes** showing real-time step progress and intermediate metrics per hypothesis.
* **Winner Highlighting:** Once `merge` resolves, the UI highlights the selected winning branch with a confirmation badge while dimming discarded hypothesis tracks for clear operator auditability.

### Backstage HITL Action Hub Panel & Signed Signal Validation
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .requireApproval(name, config)) -->

* **Dynamic Zod Form Projection:** When a workflow enters a `.requireApproval()` gate, the Backstage frontend run inspector locks forward progress and renders a **Prominent Action Hub Panel** displaying the markdown prompt and dynamically generating validated form inputs from the gate's Zod/JSON Schema.
* **Control-Plane RBAC & Schema Enforcement (`POST /api/agent-orchestrator/v1/instances/:instanceId/signal`):** Before forwarding an approval signal to Temporal:
  1. Authenticate the caller via `httpAuth` / `UserInfoService` and verify tenant membership + required role/permission clearance (`assignedRole` / `PermissionsService`).
  2. Parse and validate the submitted form body against the gate's `schema.safeParse(payload)` on the backend (never trusting client-side validation alone).
  3. Attach the verified `approverEntityRef` and timestamp to the Temporal Signal envelope.

### Dynamic Webhook Callback Ingress & Listening Pulse UI State
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .waitForSignal(name, config)) -->

* **Signed Callback Receiver (`POST /api/agent-orchestrator/v1/webhooks/callback/:tokenId`):** Configured with a dedicated Backstage `httpRouter` auth policy for external webhook ingress. Before signaling Temporal, the endpoint atomically validates:
  1. Cryptographic signature / HMAC verification and `allowedSource` origin checks.
  2. Token expiration (`expiresAt > now`) and single-use consumption (`consumed_at IS NULL`) in PostgreSQL to prevent replay attacks.
  3. Resolution of `(tenantId, instanceId, gateName)` strictly from the server-side token record—never from untrusted URL query parameters or body fields.
* **Listening Pulse UI Component:** When a workflow suspends on `.waitForSignal()`, the Backstage run inspector renders a **Listening Pulse** badge with a live countdown timer (`timeout` remaining) and, for authorized operators, masked diagnostic metadata for the active callback registration (never exposing raw signing secrets).

### Milestone Progress Bar in the Backstage Workflow Inspector
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .checkpoint(name)) -->

* **Macro Phase Stepper:** The Backstage frontend run inspector projects `.checkpoint()` nodes from the compiled Graph IR onto a top-level **Workflow Progress Bar**, grouping intermediate micro-steps beneath each milestone.
* **Live Completion Locking:** As execution passes each `.checkpoint(name)`, its milestone indicator transitions to a locked completed state with timestamp and state-digest metadata, giving operators an immediate phase-level summary during multi-hour runs.

### Middleware Extension Badges in the Backstage Run Inspector
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .extend(extensionPlugin)) -->

* **Compiled Middleware Manifest:** `.compile()` records active extension names and `uiBadgeIcon` metadata in the Graph IR manifest.
* **Step Log Panel Decorators:** The Backstage frontend run inspector renders active extension badges (e.g., OpenTelemetry or Slack alert indicators) on wrapped step cards so operators immediately see which cross-cutting policies govern each node.

### Live Billing Tracker Widget & Cost-Center Attribution
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureFinOps(config)) -->

* **Live Billing Tracker UI:** When a workflow includes `.configureFinOps()`, the Backstage run inspector renders a real-time **Live Billing Tracker** progress bar displaying accrued spend vs. `maxWorkflowBudget`, soft-threshold warning indicators (`thresholdPercent`), and per-step cost breakdowns.
* **Tenant & Department Cost-Center Stamping:** Global platform interceptors automatically attach corporate department billing codes and `tenant_id` metadata onto workflow execution records and final compliance attestations (`agent:attestation_signed`) for enterprise chargeback reporting.

### Security Compliance Hub & Redaction Counter Badge in Backstage UI
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureCompliance(config)) -->

* **Security Compliance Hub Widget:** When a workflow runs with `.configureCompliance()`, the Backstage run inspector displays an active **Security Compliance Hub** banner indicating active regulatory rule sets (`HIPAA_PHI`, `FINRA_MNPI`, `GDPR_PII`) and retention classification.
* **Live Masking Counter (Zero Plaintext Exposure):** Each `ModelExecutor` call emits redaction counts by category (`{ phiMasked: 3, ssnMasked: 1 }`), allowing the UI to display live confirmation (*"Security Shield Active: 3 PHI elements automatically masked before processing"*) without ever exposing masked values or plaintext PHI to browser logs.

### Quota Optimization Monitor Widget in the Backstage Run Inspector
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureThrottling(config)) -->

* **Live Throttle Telemetry:** When a workflow includes `.configureThrottling()`, the Backstage run inspector displays a **Quota Optimization Monitor** widget showing active tenant concurrency slots, rolling TPM utilization, and per-capability pacing.
* **Self-Stabilizing Wait Banner:** Whenever `CapabilityGateway` or `ModelExecutor` delays an invocation to honor a rate ceiling, the active step node displays an amber status banner (e.g., *"Rate Limit Enforced: GitHub requests temporarily throttled for 12s to prevent rate exhaustion"*) so operators know the workflow is pacing intentionally rather than stalled.

### History Compaction Timeline Marker in the Backstage UI
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureStorage(config)) -->

* **Seamless `instanceId` Continuity:** Because `continueAsNew` preserves the workflow's `workflowId` (`instanceId`), Backstage's instance inspector, SSE stream, and signal endpoints remain bound to the same `instanceId` across compactions.
* **Performance Optimization Badge (`agent:history_compacted`):** When a compaction rollover occurs, the orchestrator emits an `agent:history_compacted` event rendered in the Backstage timeline as an informational marker (*"Performance Optimization: Workflow history compressed and continued natively"*), explaining the reset event counter while keeping macro `.checkpoint()` milestones intact.

### In-Flight Workflow Upgrade Banner in the Backstage Run Inspector
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureVersion(config)) -->

* **Migration Diagnostic Event (`agent:workflow_migrated`):** Whenever an awakened workflow executes an on-the-fly state migration (`v1 -> v3`), the orchestrator emits an `agent:workflow_migrated` event.
* **Operator UI Banner:** The Backstage run inspector surfaces an informational banner (*"Workflow state upgraded from v1 to v3 dynamically by engine"*), giving engineers and auditors clear visibility into why the active state schema shifted mid-execution.

### Outbound SSE Event Shaping & Mandatory Platform Interceptors
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addInterceptor(interceptor)) -->

* **Platform-First Interceptor Precedence:** The Core Orchestrator prepends platform-managed interceptors ahead of workflow-authored `.addInterceptor()` hooks—guaranteeing that every outbound SSE envelope carries verified `tenantId` metadata and strips internal worker debug keys (`internalDebugMetadata`) before reaching the Backstage browser client.
* **Null-Drop Stream Suppression:** Events suppressed (`return null`) by `transformEvent` are dropped prior to Redis Pub/Sub / SSE broadcast, reducing browser noise and bandwidth overhead.

### Circuit Breaker Status Alerting in the Backstage Run Inspector
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureResilience(config)) -->

* **Circuit Breaker Tripped Event (`agent:circuit_breaker_tripped`):** When `CapabilityGateway` trips a capability circuit breaker, it emits an `agent:circuit_breaker_tripped` diagnostic event on the workflow's SSE stream.
* **Capability Health Badge:** The Backstage run inspector highlights the affected capability badge in red with an explanatory banner (*"Direct integration calls to Kubernetes temporarily paused by platform safety circuit breaker"*), distinguishing intentional circuit protection from unhandled worker crashes.

### Terminal Outcome Badges in the Backstage DAG Visualizer
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .setTerminalOutcome(name, handler)) -->

* **Semantic Exit Node Rendering:** The Backstage frontend DAG visualizer renders `.setTerminalOutcome()` declarations as distinct terminal end-caps on the workflow graph.
* **Status-Mapped Visual Indicators:** When a run concludes at a named outcome, the UI locks the run timeline and renders a semantic badge matching the outcome classification (green check for zero-action/success paths, amber shield for short-circuited/insufficient-evidence exits, or red cross for failure terminations).

### Registering & Introspecting `CompiledWorkflowBlueprint` in Backstage
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .compile()) -->

* **Fail-Fast Boot Validation:** Domain backend modules export the result of `.compile()` and pass it to `agentWorkflowExtensionPointRef.registerWorkflow(compiledBlueprint)`. Any topological defect throws immediately during Backstage backend startup (`backend.start()`) before serving traffic.
* **Control-Plane Discovery & UI DAG Rendering:** The Core Orchestrator Backend uses `blueprint.schemas.inputSchema` for `POST /v1/workflows/:workflowId/execute` request validation and serves `blueprint.graphIR` to the Backstage frontend to render the interactive DAG visualizer, RBAC badges, SLA timers, and milestone progress bar prior to execution.

### Dynamic Child-Node Expansion in the React Flow DAG Visualizer
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.catalog.getSystemDependencies(systemId)) -->

* **Live Topology Sub-Graph Rendering:** When an impact-analysis step emits discovered system dependencies (`targetReposForAuditing` / `discoveredComponentCount`) into `TState` or `ArtifactSink`, the Backstage **React Flow** DAG visualizer dynamically expands child component badges beneath the active step node so operators can inspect every downstream service under evaluation.

### Emergency Triage Alert Banner in the Backstage Run Inspector
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.health.flagLivenessFailure(reason)) -->

* **Emergency Triage Event (`agent:emergency_triage_active`):** When a worker flags a liveness failure, the control plane broadcasts `agent:emergency_triage_active` on the run's SSE stream.
* **Operator Lockout & Recovery Banner:** The Backstage run inspector locks forward step controls and displays a high-priority system alert banner (*"System Warning: Unrecoverable node deadlock encountered. Automated container recycling sequence initiated by agent"*), directing operators to the recorded compliance attestation and quarantine state.

### Control-Plane Notification Relay & Tenant Target Fencing
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.notifications.send(targetRef, content)) -->

* **Authenticated Notification Bridge:** The Backstage control plane exposes an internal service-authenticated bridge to `@backstage/plugin-notifications-node` that validates `targetRef` (`user:*` or `group:*`) against the caller's verified `tenantId` boundary—blocking cross-tenant notification routing with `TenantIsolationViolationError`.
* **Run Deep-Link Resolution:** Notification `link` fields route directly to the Backstage run inspector (`/agent-workflows/runs/${instanceId}`) so recipients land on the exact execution graph, approval prompt, or artifact output.

### Backstage Inbox Action Card Projection & Atomic Single-Responder Resolution
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.notifications.requestAction(targetRef, responseSchema)) -->

* **Dynamic Inbox Form Rendering:** The Backstage Notifications frontend renders `requestAction` items as interactive task cards in the user's central notification inbox, projecting form controls directly from `responseSchema`'s JSON Schema definition.
* **Identity/Group Membership Verification & Atomic Claim (`POST /api/agent-orchestrator/v1/tasks/:taskId/submit`):**
  1. Authenticate the caller via `httpAuth` / `UserInfoService` and verify tenant isolation + membership in `targetRef` (matching the exact `user:*` entity ref or resolving transitive group ownership via Backstage Catalog `group:*` relations).
  2. Validate the submitted payload server-side with `responseSchema.safeParse(body)`.
  3. Atomically claim the task (`UPDATE ... SET resolved_at = NOW(), resolved_by = :actor WHERE task_id = :id AND resolved_at IS NULL`) so group-targeted tasks resolve exactly once before signaling Temporal.

### Internal Backstage Policy Evaluation Bridge for Remote Workers
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.permissions.authorize(options)) -->

* **Service-Authenticated Principal Impersonation Endpoint:** The Core Orchestrator Backend exposes an internal endpoint (`POST /api/agent-orchestrator/v1/internal/permissions/authorize`) restricted strictly to Token Broker service tokens (`targetPluginId: 'agent-orchestrator'`), verifying `tenantId` scope and evaluating `PermissionsService.authorize(...)` on behalf of the workflow's verified `actorEntityRef`.

### Schedule Management & Static Control-Plane Housekeeping Split
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.scheduler.scheduleTask(config)) -->

* **Backstage `coreServices.scheduler` vs. Temporal Schedules:** Backstage's native `coreServices.scheduler` is used by `plugins-agent-orchestrator-backend` during `init()` for internal control-plane maintenance tasks (such as memory retention sweeps and expired webhook token cleanup), while user/workflow-registered recurring agent runs use **Temporal Schedules** visible and pausable from the Backstage orchestrator UI.
* **Schema & RBAC Verification on Schedule Creation:** Before creating a schedule targeting `targetWorkflowId`, the runtime validates `config.input` against `targetWorkflowId`'s Zod `inputSchema` and verifies that the creating principal holds `workflow.execute` permission for that target workflow within `tenantId`.

### Related Context Documents Sidebar in the Backstage Run Inspector
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.search.query(text, options)) -->

* **Automated Citation Drawer:** Whenever a step invokes `ctx.search.query()` (and records referenced locations in step telemetry or state), the Backstage run inspector populates a **"Related Context Documents"** sidebar panel with clickable links directly to the inspected TechDocs pages and catalog entities for operator auditability.

### Ingress Principal Extraction & Internal Identity Resolution Endpoint
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.userInfo.getUserInfo(token)) -->

* **Control-Plane Ingress Extraction:** On every authenticated workflow start (`/execute`) or signal (`/signal`) request, the Backstage backend invokes `httpAuth.credentials(req)` and `userInfo.getUserInfo(credentials)` at the HTTP boundary, attaching verified `actorEntityRef` and `ownershipEntityRefs` to the Temporal header envelope.
* **Internal Profile Lookup Bridge:** For asynchronous webhook or scheduled runs needing profile metadata (`displayName`, `ownershipEntityRefs`) by `userEntityRef`, the control plane exposes a Token-Broker-authenticated internal lookup backed by Backstage's Software Catalog `User` entities.

### Control Plane `coreServices.cache` Dependency Wiring
<!-- Source: incoming/CACHE_MEMCACHE_AND_REDIS.md (Section: How to Use It Programmatically inside your Plugin) -->

* **New Backend System Injection:** The `agentic-workflow-engine` backend plugin registers `cache: coreServices.cache` alongside `logger: coreServices.logger` in `createBackendPlugin({ pluginId, deps, register })` and passes both into `env.registerInit({ deps, init })` to share the host Backstage instance's configured cache backend.

### Voice Ingress & Turn-Detection Architecture (Backstage Frontend to Control Plane)
<!-- Source: incoming/AUDIO_PROMPTS_AND_TRANSCRIPTION.md (Sections: Detecting When a User is Done Speaking, Processing Audio, Terminating Audio Stream, Cloud Infrastructure Topology) -->

To keep the Backstage control plane stateless and horizontally scalable while supporting hands-free engineer voice prompts, audio capture and endpointing are split across a three-layer client/edge pipeline before invoking the standard authenticated Backstage workflow run API:

* **Layer 1 — Browser Acoustic Preprocessing (`getUserMedia` / Web Audio API):** The Backstage frontend captures microphone audio at `16000 Hz` with browser-native Acoustic Echo Cancellation (`echoCancellation: true`) and Noise Suppression (`noiseSuppression: true`) enabled to strip room hum and speaker feedback before transmission.
* **Layer 2 — Edge / Managed Turn Detection (Preferred Over Self-Hosted WebRTC):**
  * **Recommended Topology (Stateless Control Plane):** Terminate WebRTC/WebSocket audio streams at an approved managed edge media/voice gateway (e.g., self-hosted/VPC-isolated LiveKit or compliant ASR gateway) that executes Silero VAD (v5) + semantic turn detection and posts completed utterance events/transcripts to the Backstage plugin over authenticated HTTPS. This avoids opening UDP port ranges (`30000–40000`), operating `coturn` STUN/TURN infrastructure, or pinning stateful WebRTC peers (`werift` + `opusscript`) to control-plane pods.
  * **Self-Hosted Container Fallback:** If compliance mandates on-prem/VPC-only media termination without an external media fabric, isolate WebRTC termination (`werift` + Opus decoding to 16 kHz PCM + `avr-vad` Silero VAD v5 ONNX with ~800–1000 ms hangover time + semantic endpointing) into a dedicated, stateful media-gateway deployment with UDP ingress—never inside stateless Backstage control-plane replicas or serverless functions.
* **Layer 3 — Control-Plane Handoff:** Once an utterance is finalized and transcribed, the resulting text prompt enters the Backstage plugin via the standard `httpAuth`-authenticated, `PermissionsService`-authorized run submission endpoint, preserving identical RBAC, Temporal workflow execution, and SSE streaming semantics as typed prompts.

### Reference Monorepo Package & Dual-Runtime Topology (Non-Normative Iteration)
<!-- Source: incoming/ARCHITECTURE_FILE_LAYOUT.md (Section: Proposed File Architecture -- backstage-plugin-agent-node & backstage-plugin-agent-backend) -->

> **Status Note:** This directory tree represents an early architectural iteration and is a non-binding reference topology; package names and internal module boundaries may evolve in the greenfield rewrite.

The architecture splits the platform across a shared **Node contract package** (`core-node`) and a **Core Backend Orchestration package** (`core-backend`) supporting two execution runtimes from a shared engine core:

* **`backstage-plugin-agent-node` (`core-node` — Contracts, Extension Points & Blueprints):**
  * `extension-points/`: Declares Backstage New Backend System extension points (`platform-driver`, `storage-driver`, `security-driver`) so external driver modules can register capabilities cleanly.
  * `blueprints/`: Enforces strict driver interface contracts via Backstage blueprints.
  * `events/` & `api/`: Houses shared TypeScript contracts (`audit.types.ts`, `system.types.ts`, `workflow.types.ts`, `fluent-api.types.ts`, `context.types.ts`).
  * `utils/validation.ts`: Shared PII/PHI masking and schema validation primitives consumed by drivers.
* **`backstage-plugin-agent-backend` (`core-backend` — Dual-Runtime Orchestration Engine):**
  * **Shared Engine Core (`engine/`):** Hosts the fluent builder trait modules (`agent/`, `memory/`, `retrieval/`, `tools/`, `workflow/`) and `compiler/serialization.ts` (compiling builder state into a serializable JSON Graph IR), accessible to both runtimes.
  * **Runtime 1 — Synchronous HTTP Control Plane (`http/`):** Exposes Backstage HTTP routes (`routes.ts`), authentication/compliance/error middleware (`auth.ts`, `compliance-ctx.ts`, `error.ts`), and `temporal-dispatcher.ts` to validate requests and start/signal workflows.
  * **Runtime 2 — Asynchronous Temporal Worker Loop (`worker/temporal/`):** Runs the worker process (`worker.ts`), workflow interpreter (`workflows/`), side-effecting activities (`activities/`), and injected activity helpers (`context/`).
  * **Cross-Cutting Platform & Low-Level Services (`platform/`, `services/`):** Encapsulates Temporal/Mem0 config, compliance sinks (`audit-logger.ts`, `encryption.ts`, `retention.ts`), Vercel AI SDK clients/streams, RAG pipelines (`chunking.ts`, `embedding.ts`, `reranking.ts`), and Mem0 guardrails.

### Three-Tier Global System Architecture & Live SSE Control Plane
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Sections: Executive Summary & Design Philosophy, Global System Architecture & Tier Diagram) -->

The platform is segregated into three isolated tiers to decouple user-facing streaming UX, control-plane governance, and durable background execution:

1. **Backstage Frontend Tier:**
   * **Reactive Progress Stepper:** Subscribes to Server-Sent Events (SSE) telemetry from the control plane to render live step-by-step execution state, human-in-the-loop approval gates, and recovery progress.
   * **Live FinOps Planner Card:** Consumes real-time token, model, and capability cost telemetry over the SSE client to surface live spend allocation and budget guardrails during workflow runs.
2. **Backstage Node Core Backend Plugin (`core-backend`):**
   * **`WorkflowRegistry` Map:** Stores validated, compiled workflow definitions and ingests blueprint-registered definitions into Temporal (`genericAgenticGraphWorkflow`).
   * **Hardened Event Broker Engine:** Bridges activity/worker lifecycle events (`executeStepActivity` interceptor hooks) to connected clients via internal broadcast channels (with tenant/principal access checks before fan-out).
   * **Express SSE Router:** Exposes authenticated Server-Sent Events endpoints streaming real-time workflow progress and FinOps metrics to the Backstage frontend.
3. **Durable Execution & State Tier:**
   * **Temporal Workflow Engine (`genericAgenticGraphWorkflow`):** Executes compiled graph definitions deterministically and persists visual/run state logs to **PostgreSQL**.
   * **Temporal Worker Containers (Isolated Activity Sandboxes):** Poll Temporal over gRPC to execute side-effecting activities (`executeStepActivity` with interceptor hooks) and coordinate semantic memory and vector retrieval.

### Control-Plane RBAC Guard Activity & Event Emission Contract
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: The Master Deterministic Runtime (Temporal Loop)) -->

* **`evaluateRBACGuard` Activity:** Bridges Temporal workflow step authorization to Backstage's `PermissionsService` (`coreServices.permissions`), evaluating the caller's `BackstageCredentials` / resolved `principalRef` and `tenantId` against the step's required permission rule before allowing privileged capability or model execution.
* **`emitEvent` Activity:** Publishes sanitized, tenant-tagged lifecycle events (`agent:step_enter`, `agent:state_delta`, `agent:step_bypassed_by_permission`, `agent:history_compacted`, `agent:budget_exhausted`) into the Backstage control plane's Hardened Event Broker Engine for SSE delivery and `AuditLogSink` persistence.

### Real-Time SSE Event Broker & Pre-Wire Egress Pipeline (`HardenedEventBroker`)
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Real-Time Telemetry & Egress Filters (EventBroker) — plugins/agent-orchestrator-backend/src/service/EventBroker.ts) -->

`HardenedEventBroker` mediates outbound Server-Sent Events (SSE) between workflow execution activities and connected Backstage frontend clients through a staged pre-wire transformation and filtering pipeline:

* **Event Envelope Structure (`WorkflowEventEnvelope`):** Wraps outbound telemetry with `{ type, payload, timestamp, runId, tenantId, sequenceId }`.
* **Ordered Pre-Wire Transformer Pipeline (`publishAndTransform`):** Runs registered transformation/redaction hooks sequentially before wire emission. Returning `null` from any hook suppresses the event completely from SSE delivery.
* **Subscription Lifecycle (`subscribe`):** Registers stream listeners and returns an explicit unsubscribe closure (`() => void`) invoked when the HTTP/SSE client connection closes (`req.on('close')`).

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
The prototype `EventBroker.ts` contains five architectural and security flaws that **must be reconciled** in the greenfield control plane:

1. **Key Streams by `(tenantId, runId)` — Never Template `workflowId`:** The prototype emits on `stream:${workflowId}` where `workflowId` is the blueprint/agent definition ID. Multiple concurrent users running the same agent would receive each other's live events, violating tenant and principal isolation! Channel keys must be scoped to `tenant:${tenantId}:run:${runId}`, and the SSE HTTP route must verify caller ownership/RBAC via `PermissionsService` before subscribing.
2. **Replace Process-Local Singleton `EventEmitter` with Distributed Pub/Sub (Redis / PostgreSQL `LISTEN/NOTIFY`):** In a multi-replica Backstage deployment—and because Temporal workers run in separate containers from HTTP API pods—an in-memory `export const globalEventBroker = new HardenedEventBroker()` will drop events whenever the worker and SSE client hit different processes. Back the broker with a distributed pub/sub transport (Redis Pub/Sub or PostgreSQL `LISTEN/NOTIFY`) paired with a bounded replay buffer (`Last-Event-ID` support) for SSE reconnects.
3. **Mandatory Platform Redaction Before Custom Transformers:** `publishAndTransform` must execute `deepSanitizeStateDelta` and the platform's deterministic PII/PHI/Secret redactor **unconditionally** before invoking any workflow-specific `transformerHooks` or emitting to the wire—never relying solely on optional user-registered hooks for compliance safety.
4. **Prevent `MaxListenersExceededWarning` & Memory Leaks:** Node's default `EventEmitter` warns at 10 concurrent listeners per channel. Configure explicit listener limits, enforce per-run SSE subscriber caps, and clean up `transformerHooks` when a workflow blueprint is unregistered or a run terminates.
5. **Strict Typing & Deep Clone:** Replace `Function[]` and `any` with typed `EventTransformer<TState>` signatures and `structuredClone(rawPayload)` (since shallow `{ ...rawPayload }` leaves nested objects mutable across hooks).

### Headless Control-Plane vs. Worker Pod Separation
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Production Deployment Topology Configuration) -->

* **Split Deployment Topology:** Backstage API/UI pods handle synchronous HTTP routing, `httpAuth` / `PermissionsService` checks, Temporal client dispatch, and outbound SSE streaming, while `agentWorker` pods run headless in worker-only mode (`worker.ts`) without exposing HTTP ingress routes.

### Frontend Curated Handoff Actions & Transition Authorization
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 5: First-Class Handoffs Between Scoped Agents (.agent.md)) -->

* **Interactive Handoff Controls:** Curated handoff transitions defined on an agent profile are surfaced in the Backstage Frontend Tier (Reactive Progress Stepper) as explicit human-in-the-loop transition triggers accompanied by the structured plan artifact.
* **Re-Authorization on Handoff Execution:** Triggering a handoff into a write-capable Execution Agent requires an authenticated Backstage POST endpoint that re-validates `PermissionsService` RBAC for the approving principal (`principalRef`) and signs a Temporal approval signal bound to the exact handoff plan hash (preventing plan tampering between review and execution).

### Control-Plane Pre-Dispatch Intent & Entity Routing
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 10: Context-Aware Intent Routing (IIntentService) Before Loop Entry) -->

* **Synchronous Fast-Path vs. Durable Temporal Dispatch:** At HTTP run submission, the control-plane router evaluates explicit `@participant` / `/command` prefixes and active Backstage Catalog entity context (`entityRef`) before enqueuing a heavy multi-step Temporal workflow:
  * Single-turn read-only `@catalog` queries can execute via a lightweight bounded activity/fast-path while still emitting standard SSE stream frames (`agent:step_enter`, `agent:state_delta`, `agent:completed`) so the Backstage frontend UX remains uniform.
  * Multi-step `@ops` / `@scaffolder` workflows dispatch directly to Temporal's version-isolated task queue with the resolved intent's narrowed capability profile.

### Webhook & External Event Provenance Gatekeeping
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 11: Workspace-Level Sandboxing & Untrusted Input Gates) -->

* **Ingress Trust Classification:** Backstage webhook and event-ingestion endpoints (GitHub, Jira, PagerDuty, Sentry) verify cryptographic webhook signatures and resolve the upstream actor's organizational identity and repository/entity write permissions via Backstage Catalog + `PermissionsService` before dispatching workflows. Events from unauthenticated or read-only external actors are either dropped, routed to a human triage queue, or restricted to zero-write diagnostic workflows.

### Control-Plane Step Rollback Endpoint & UI Trigger
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 12: Two-Tier Edits & Reversible Workspace Checkpoints) -->

* **One-Click Checkpoint Rollback API:** The Backstage control plane exposes an authenticated `POST /runs/:runId/checkpoints/:checkpointId/rollback` endpoint that verifies `PermissionsService` write/rollback authorization for the requesting `principalRef`, records an audit entry, and sends a signed `rollbackToCheckpoint` Temporal Signal to rewind workflow state and trigger compensating rollback activities.

### Transport-Agnostic Client / Agent Host Architecture
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 13: The Client / Agent Host Split (Transport-Agnostic Sessions)) -->

Modeled on VS Code's Agent Host architecture, the Backstage React frontend is completely decoupled from workflow execution and session ownership:

* **Agent Host (Backstage Control Plane + Temporal Execution Engine):**
  * Owns the canonical session lifecycle (`SessionStore`, `RunStore`, `CheckpointStore`), capability execution, and reasoning loop independently of any connected UI tab or chat thread.
  * Closing a browser tab or restarting a frontend pod never interrupts or orphans an active workflow run.
* **Thin, Attachable Multi-Channel Clients:**
  * Multiple clients—the **Backstage React UI**, **Slack bots**, **developer CLIs**, and **CI/CD webhooks**—attach to an active `runId` via standardized, transport-agnostic control-plane endpoints:
    * **Read / Observe Stream (`GET /runs/:runId/events`):** Subscribes to live SSE telemetry (`HardenedEventBroker`) with `Last-Event-ID` catch-up replay.
    * **Mid-Run Steering & Signals (`POST /runs/:runId/steer`, `POST /runs/:runId/signals/:signalName`):** Injects user steering instructions, approval decisions, or cancellation requests into the running Temporal workflow.
* **Hardening Note:** Every attachable client channel (Web UI, Slack bot, CLI, CI webhook) must authenticate via Backstage `httpAuth` (or verified service/bot identity mapped to a canonical Backstage `principalRef` + `tenantId`) and pass `PermissionsService` authorization before reading stream events or injecting steering commands.

### Built-In Workflow Self-Troubleshooting (`Diagnose Workflow` / `/troubleshoot`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 16: Built-In Self-Troubleshooting (/troubleshoot Over Session Logs)) -->

Modeled on VS Code Copilot Chat's structured Agent Debug Logs and `/troubleshoot` slash command, the Backstage control plane exposes a one-click **"Diagnose Workflow"** action (and `/troubleshoot` chat command) for failed, timed-out, or Stop-Hook-blocked runs:

* **Diagnostic Endpoint & UI Action (`POST /runs/:runId/diagnose`):**
  * Triggered from the Backstage Frontend Tier (Reactive Progress Stepper failure banner) or chat command `/troubleshoot <runId>`.
  * Collects the target run's structured execution record from `RunStore` / `AuditLogSink`—including loaded skills/annotations, resolved capability cluster decisions, `PermissionsService` RBAC outcomes, Stop-Hook failure evidence, cache hit/divergence stats, and normalized `ErrorCode` records—and routes them to a dedicated **read-only Diagnostic Meta-Agent**.
* **Actionable Root-Cause Explanation:**
  * Synthesizes a developer-friendly explanation pinpointing exact failure classes (e.g., missing Backstage Catalog annotation, `PermissionsService` role denial, upstream `HttpIntent` timeout, FinOps budget exhaustion, or failing post-condition Stop Hook) along with concrete remediation steps.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
1. **Strict Run Ownership & Tenant RBAC Verification:** Before retrieving any trace or invoking `/troubleshoot`, `POST /runs/:runId/diagnose` must authenticate via `httpAuth` and verify via `PermissionsService` that the requesting `principalRef` is the initiating owner or an authorized tenant administrator for `(tenantId, runId)`.
2. **Pre-Diagnostic Trace Scrubbing & Safe RBAC Error Messaging:** Trace logs fed into the diagnostic model must be pre-scrubbed of `SecretEnvelope` markers, raw stack internals, and cross-user PII/PHI, and RBAC denial explanations must report only the missing user-facing permission/role requirement without leaking internal policy rule internals.

### Control-Plane Outcome Webhook Reconciliation (`RunStore` Survival Updates)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 17: Downstream "Survival" Metrics Over Simple Completion Counts) -->

* **Linking External Lifecycle Events to `runId`:** Agent-generated PRs, commits, and Catalog patches embed a deterministic correlation trailer/annotation (`backstage-agent-run-id: <runId>`). When GitHub/GitLab PR webhooks (`merged`, `closed`), Catalog entity processing events, or PagerDuty resolution/re-open webhooks arrive at the Backstage control plane, the event handler updates the corresponding `RunStore` survival record (scoped strictly by `tenantId`).

### Normalized `ErrorCode` Mapping for Quota vs. Throttling Failures
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 18: Rate-Limit Velocity vs. Quota Exhaustion Classification) -->

* **Actionable User Error Surfacing:** Non-retryable failures (`QUOTA_EXHAUSTED`, `FINOPS_BUDGET_EXCEEDED`, `RBAC_DENIED`, `UPSTREAM_AUTH_INVALID`) map to canonical Backstage control-plane `ErrorCode` payloads streamed immediately over SSE (`HardenedEventBroker`) so the Backstage UI renders an actionable remediation banner instead of appearing hung while Temporal exhausts retries.

### Backstage UI Clarification Card & Authenticated Resume Endpoint
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 22: Interactive Mid-Turn Clarification Tools (ask_questions)) -->

* **Live SSE Clarification Card:** When the Backstage Frontend Tier (Reactive Progress Stepper) receives an `agent:clarification_requested` SSE frame from `HardenedEventBroker`, it renders an interactive JSON-Schema-driven choice/input card inline within the active run timeline.
* **Authenticated Clarification Submission (`POST /runs/:runId/clarifications/:questionId`):**
  * Authenticates the caller via `httpAuth`, verifies via `PermissionsService` that the caller owns `(tenantId, runId)` (or holds required approver RBAC when `isApprovalGate: true`), validates the submitted answers against the question's Zod/JSON Schema, and dispatches the `submitClarification` Temporal Signal.

### Versioned Agent Capability Packs (`@internal/agent-pack-*`) via New Backend System
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 24: Bundled "Agent Plugins" as Versioned Capability Packages) -->

Modeled on VS Code's self-contained, versioned **Agent Plugins** and aligned directly with Backstage's New Backend System (`createBackendModule`), domain teams publish **Agent Capability Packs** (e.g., `@internal/agent-pack-kubernetes`, `@internal/agent-pack-finops`, `@internal/agent-pack-scaffolder`) as versioned NPM packages that wire cohesively into the core orchestrator at startup:

* **Cohesive Pack Registration Surface (`AgentCapabilityPack`):**
  * Using `core-node` extension points (`platformDriverExtensionPoint`, `capabilityPackExtensionPoint`), a single Backstage backend module atomically registers:
    1. **Scoped Agent Personas & Handoff Definitions:** Domain-specific read-only triage and approval-gated execution agent profiles.
    2. **Entity-Scoped `SKILL.md` Playbooks & Glob Rules:** Procedural runbooks bound to Backstage entity kinds, annotations (`agent.io/skills`), or file globs.
    3. **Typed `CapabilityDescriptor` Sets:** Governed `HttpIntent` and `NativeAdapter` tools grouped under a dedicated virtual tool cluster (e.g., `k8s_diagnostics`, `finops_queries`).
    4. **Post-Edit Validators & Stop Hooks:** Domain-specific OPA/Conftest policies, schema checks, and predicate verifiers.
    5. **Ordered Lifecycle Hooks:** Domain telemetry enrichers or redaction rules attached to `before_prompt_build` / `after_tool_call`.
* **Fail-Fast Boot & Conflict Detection:** During `registerInit`, the control plane validates all registered packs—rejecting duplicate capability IDs, invalid schemas, or circular agent handoffs before opening HTTP routes or polling Temporal task queues.

### Live Checklist Progress Streaming to Backstage UI
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 25: First-Class In-Context Todo List State (manage_todo_list)) -->

* **Real-Time UI Progress Synchronization:** Whenever `manage_todo_list` updates task states, `HardenedEventBroker` emits a sanitized `agent:todo_updated` SSE event (`tenantId`, `runId`, `items`) so the Backstage Frontend Tier (Reactive Progress Stepper) displays live step-by-step checklist progress to engineers in real time.

### Multi-Channel Approval Gates (Backstage UI & Slack) with Owner RBAC
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 29: Interactive vs. Autonomous Terminal & Tool Risk Classification) -->

* **Consistent Approval Cards Across Channels:** Both the Backstage Frontend Tier (Reactive Progress Stepper) and connected Slack bot clients render the staged diff, target Catalog entity owner, blast radius, and Approve/Reject actions for `DESTRUCTIVE_MUTATION` requests.
* **Authorized Approver Verification:** The `POST /runs/:runId/approvals/:approvalId` endpoint verifies via `PermissionsService` and Backstage Catalog ownership (`spec.owner`) that the approving `principalRef` is authorized to approve mutations on the target resource (enforcing four-eyes / non-self-approval when required by tenant policy) before signaling Temporal.

### Catalog & TechDocs Incremental Re-Index Event Hooks
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 31: Content-Addressed Workspace Indexing & Merkle Tree Sync) -->

* **Event-Driven Manifest Reconciliation:** The Backstage control plane subscribes to Catalog entity processing updates (`catalog.entity.updated` / `deleted`) and authenticated VCS push webhooks, passing the entity UID and Git blob/tree SHAs to the incremental indexer to trigger delta-only re-embedding.

### Typed Discriminated-Union SSE Protocol (`AgentStreamPart` / `ChatResponsePart` Pattern)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 32: Typed Streaming Response Parts (ChatResponsePart Protocol)) -->

Modeled on VS Code Copilot Chat's typed `ChatResponsePart` discriminated union, the Backstage control plane never streams raw, unstructured text blobs alone over SSE. Instead, `HardenedEventBroker` and the Express SSE Router emit a **versioned, Zod-validated discriminated union** (`AgentStreamPart`) keyed by `(tenantId, runId, sequenceId)` so the Backstage React frontend renders rich, interactive IDP components inline while keeping the underlying run transcript cleanly structured:

* **Canonical `AgentStreamPart` Discriminated Union:**
  * `markdown_delta` — Incremental assistant narrative tokens (`chunk`, `messageId`).
  * `status_progress` — Live phase/spinner updates (`stepId`, `label`, `state: 'running' | 'completed' | 'failed'`).
  * `todo_list_update` — Live `manage_todo_list` checklist state (`items[]`).
  * `tool_execution_trace` — Collapsible capability invocation card (`toolCallId`, `capabilityId`, `riskTier`, `status`, `durationMs`, redacted `summary`).
  * `catalog_entity_card` — Embedded Backstage Software Catalog entity summary card (`entityRef`, `kind`, `owner`, `lifecycle`, `healthStatus`).
  * `staged_diff_preview` — Interactive unified diff / Terraform plan / `catalog-info.yaml` patch viewer (`artifactId`, `targetPath`, `diffSummary`).
  * `approval_gate` / `clarification_request` — Interactive human-in-the-loop approval or `ask_questions` choice card (`gateId`, `questionId`, `schema`, `expiresAt`).
  * `citation_reference` — Grounded source pointer linking claims to Backstage Catalog entities, TechDocs pages, or `AuditLogSink` records (`sourceType`, `uri`, `title`).
  * `final_report` / `error_notice` — Terminal outcome summary (including FinOps cost rollup) or normalized Backstage `ErrorCode` remediation banner.
* **Replayable `Last-Event-ID` Stream Semantics:** Every SSE frame includes an incrementing `id: <sequenceId>` header so browser reconnects resume seamlessly from `Last-Event-ID` without duplicating rendered UI cards.

### Explicit Stop Endpoint (`POST /runs/:runId/cancel`) vs. Browser Disconnect
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 35: Cooperative Cancellation Tokens (CancellationToken) Propagated Down to Tools) -->

* **Intentional Stop vs. Passive Tab Close:** Closing a browser SSE connection (`req.on('close')`) only unsubscribes the UI listener from `HardenedEventBroker`—preserving transport-agnostic background execution. Conversely, clicking **Stop** invokes `POST /runs/:runId/cancel`, which verifies `PermissionsService` ownership/admin RBAC for `(tenantId, runId)` and issues a Temporal workflow cancellation request, streaming an `agent:cancelled` confirmation frame once active activities unwind.

### Pluggable Model Provider Registry & Per-Tenant Routing Configuration
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 36: Custom LM Provider & Endpoint Abstraction (LanguageModelChatProvider)) -->

* **Extension-Point Provider Wiring:** Concrete LLM provider adapters (AWS Bedrock, Azure OpenAI, Google Vertex AI, private VPC inference endpoints) register against `core-node` model provider extension points and resolve endpoint URLs, regional routing, and Token Broker credentials from Backstage configuration (`app-config.yaml`).

### Backstage Mention Autocomplete & RBAC-Checked Reference Expansion
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 39: Contextual Reference Expansion & Implicit Mention Resolution (# / @ Resolvers)) -->

* **Frontend Mention Picker & Server-Side Verification:** The Backstage React chat input provides typeahead autocomplete for `@` and `#techdocs:` references via the Catalog Search API, while the backend run-submission pipeline re-verifies `PermissionsService` (`catalog.entity.read`) for the submitting `principalRef` on every parsed mention before hydrating entity metadata (preventing reference-injection probing of restricted entities).

### Interactive Follow-Up Action Chips in Backstage UI (`followup_suggestions` SSE Part)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 40: Speculative Next-Step Suggestions (ChatFollowupProvider)) -->

* **One-Click Workflow Chaining:** `HardenedEventBroker` emits a typed `followup_suggestions` `AgentStreamPart` at turn completion containing the RBAC-filtered next-action chips. Clicking a chip in the Backstage React frontend either dispatches a follow-up turn in the active session or deep-links directly to the relevant Backstage plugin view (e.g., Scaffolder template, PR review, or Kubernetes/observability tab).

### Frontend Capability Manifest & Graceful UI Degradation
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 42: Graceful Feature Degradation & Capability Negotiation) -->

* **UI Feature Discovery (`GET /sessions/:sessionId/capabilities` / Init SSE Frame):** The control plane sends the negotiated `SessionCapabilities` summary (active plugins, supported input modalities such as audio/image attachments, and read-only vs. write-capable mode) to the Backstage React frontend so unsupported attachment buttons or disabled plugin actions render cleanly as disabled/unavailable with clear tooltips rather than failing on submission.

### Dynamic Enterprise Policy & Admin Kill-Switch Hooks
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 46: Enterprise Policy & Admin Governance Hooks (Org-Level Kill Switches)) -->

Modeled on GitHub Copilot's organization-level enterprise policy flags, the Backstage control plane provides **zero-redeploy centralized governance hooks** backed by Backstage dynamic configuration (`ConfigService` hot-reload) and/or a feature-flag provider:

* **Org- & Domain-Scoped Governance Controls:**
  * **Global & Tenant Tool Kill Switches:** Security administrators can immediately disable specific capabilities (`fetch_external_url`, `k8s:scale-deployment`), entire capability categories (`external_mcp_servers`, `destructive_mutations`), or specific `@internal/agent-pack-*` modules without redeploying backend pods.
  * **Dynamic Approval Elevation Rules:** Policy flags can force mandatory human-in-the-loop approval (`requireApproval: true`) across targeted Backstage `Domain`s, `System`s, or lifecycle tiers (`spec.lifecycle: production`) regardless of individual workflow or agent settings.
  * **Model & Telemetry Policy Locks:** Enforce org-wide model allowlists (blocking preview/non-ZDR models) and lock audit logging (`auditLevel: 'strict'`) against local workflow overrides.
* **Admin Policy Management API & RBAC:**
  * Any runtime policy mutation API (`PUT /admin/policies/:tenantId`) requires strict Backstage `PermissionsService` security-admin authorization (`agent.policy.admin`), validates policy schemas with Zod, broadcasts cache invalidation via Redis Pub/Sub, and records full before/after diffs in `AuditLogSink`.

### Thin Host Adapter Layer Between Backstage and `@internal/agent-core`
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 48: Zero-Dependency Core Prompt & Evaluation Separation) -->

* **Adapter Inversion of Control:** `backstage-plugin-agent-backend` acts as a thin host adapter that implements `@internal/agent-core`'s pure TypeScript ports using Backstage `coreServices` (`permissions`, `httpAuth`, `catalog`, `cache`, `database`, `logger`) and Temporal activity/workflow bridges.
