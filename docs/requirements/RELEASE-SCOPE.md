# Release Scope — First Public Release

**Status:** Draft (KICKOFF pass, 2026-11-19). Nothing in this document is approved until the product owner signs off on the relevant item.

This document records what the first public release of AI Crew Suite must deliver, what is explicitly deferred, and what is still undecided. It does **not** define build order; internal implementation layers exist for sequencing and validation, and a feature implemented in a late layer is still a launch requirement.

See [00-INDEX.md](./00-INDEX.md) for scope labels, the requirement template, and ID blocks.

Citation shorthand: `01 §Heading` means `docs/discovery/01-workflow-authoring-sdk.md`, section `### Heading` (likewise `02`-`07`).

---

## 1. Review Coverage of This Kickoff Pass

**Reviewed:**

- All seven `docs/discovery/` files at the `#`/`##`/`###` heading level: 841 `###` sections in total (01: 74, 02: 155, 03: 111, 04: 133, 05: 70, 06: 138, 07: 160).
- About 35 sections read in full or in part. They were chosen because their headings suggested scope, ownership, or conflicts. They include: 01 §Three-Tier Monorepo Package Split, §Fluent `WorkflowBuilder` DSL, §Goal Reconciliation Contracts, §Opt-In Goal Reconciliation Mode, §Runtime-Validated Goal Contract (P0), §Stale `ONBOARDING.md` API Reconciliation, §`.addInterceptor()` (opening lines); 02 §Checkpoint & State-Patch Secret Rejection Guard, §Authoritative Workflow State vs. Conversation History, §Temporal Execution Authority (P3), §Single-Scheduler Discipline (P6), §Temporal Bridge Architecture, §Standalone Temporal Worker Microservice, §Pull-Based Worker Polling, §Temporal Worker Deployment Topologies, §Two-Tier Mutations & Reversible Saga Checkpoints; 03 §Model-Agnostic Failover Router (opening), §Single-Runtime Standardization, §Reversible PII / PHI Tokenization Proxy; 04 §Open Architectural Decisions to Resolve Before Build, §Recommended Tool Architecture, §`CredentialStore` Interface (opening), §Four-Tier Progressive Autonomy (opening), §Distributed Capability Circuit Breakers, §Three-Tier Capability Side-Effect Risk Classification (opening); 05 §Short-Term Checkpoint Store Schema, §Decoupled Runtime Persistence Contracts, §Vector Store Connection Sharing, §Database-Agnostic RAG Abstraction Layer, §Converged Storage Substrate, §Architectural Boundary: Stateless RAG vs. Governed Stateful Memory, §Mem0 Integration Architecture (opening), §Mem0 API Modes, Shared Contract & Platform-Only Capabilities, §Backstage CacheService Backing Store, §Persistence Split; 06 §Capability Category Extensibility, §SSE Asynchronous Error Propagation, §No Custom APM/Tracing Extension Points, §Stateless `BackstageTemporalBridge` & Commercial Licensing Posture, §Lightweight Backstage `@temporalio/client` Gateway, §Control-Plane Isolation & Worker Mode Configuration, §Frontend/Backend AI SDK Package Split, §Schedule Management & Static Control-Plane Housekeeping Split, §Reference Monorepo Package & Dual-Runtime Topology, §Three-Tier Global System Architecture, §Headless Control-Plane vs. Worker Pod Separation, §Transport-Agnostic Client / Agent Host Architecture, §Typed Discriminated-Union SSE Protocol (opening), §Thin Host Adapter Layer; 07 §Lightweight Local Cooldowns, §OpenTelemetry Standardization & Ban on Custom Tracing Hooks, §Irreversible Egress Redaction, §Environment-Driven Credentials Policy, §Pending Compliance Sign-Offs, §Tamper-Evident Audit Records, §Unified Observability (opening).
- `docs/PLANNING.md` (process guidance and proposed layout).
- The `docs/incoming/` file listing, together with a count of the `<!-- Source: incoming/... -->` citations in discovery. No file contents in `docs/incoming/` were read during the original kickoff pass.

**Not reviewed during the original kickoff pass:**

- Body text of the other ~800 discovery sections and all `####` subsections. Classifications below for those sections come from headings alone and are **provisional**. SUBSYSTEM passes must confirm them.
- Every file in `docs/incoming/`, including the `_`-prefixed notes.
- Existing source code in `plugins/` and `packages/`.

**Source-coverage gaps found:**

- `TOOLS_DEFAULT_DRIVERS.md` is now represented in 04 §Default Driver Candidates & Base Intent Catalog. It supplies default integration candidates and a Conduit-derived method/slot catalog, but does not establish which providers ship at launch. Its `finops` and `scorecards` semantics are project-specific proposals because Conduit has no corresponding categories.
- **Addressed since kickoff:** `CAPABILITIES_EXTENSION_POINTS.md` has been reviewed, and its relevant inference and storage-boundary findings are incorporated in discovery 03 and 05. `FLUENT_GRAPH_BUILDER_ROUGH.md` informed `FLUENT_GRAPH_BUILDER.md`, so it is not an independent coverage gap.
- The `INTEGRATIONS_*_ENGINE_ROADMAP_IMPLEMENTATION.md` files are outside this review's scope.
- `CREW_AGENT_LIST_WITH_SHORT_DESCRIPTION.md` is outside the Platform scope; it describes production agents for a separate project. The Platform may need non-production test-agent or workflow fixtures, but those are not production deliverables.
- **Still unresolved:** the default-driver candidates do not establish which providers are launch commitments. See SD-07.

---

## 2. Confirmed Direction (`CD-xx`)

Each item below comes either from the kickoff Project Direction or from a constraint that discovery states repeatedly with no contrary note. Requirements that trace to these items may use `Scope Basis: Confirmed`.

| ID | Direction | Basis |
| :-- | :-- | :-- |
| CD-01 | Greenfield platform. LangGraph was used only in V1; the refactor has no LangGraph compatibility, integration, or dependency relationship. V1 notes are historical learning material only and imply no API, data, or workflow compatibility. | Kickoff Project Direction |
| CD-02 | The first public release delivers the agreed launch scope. Internal layers are for sequencing and validation, not releases. | Kickoff Project Direction |
| CD-03 | Plugin and package layout is provisional. Requirements specify contracts and ownership, not packages. | Kickoff Project Direction; 06 §Reference Monorepo Package & Dual-Runtime Topology (self-declared non-normative) |
| CD-04 | Temporal is the durable execution engine. Workflow code is deterministic orchestration, and all non-deterministic I/O (LLM, tools, memory, DB, network) runs in Activities. | 02 §Standalone Temporal Worker Microservice & Determinism Boundary; 02 §Temporal Bridge Architecture; 01 §Stale `ONBOARDING.md` API Reconciliation (preserved invariants) |
| CD-05 | Workflows are authored with a typed fluent builder that compiles to a portable, serializable Graph IR, which a generic interpreter workflow executes. | 01 §Fluent `WorkflowBuilder` DSL; 02 §Single Generic Workflow Interpreter; 02 §Temporal Bridge: Mapping Compiled Graph IR |
| CD-06 | The Vercel AI SDK (`ai` + `@ai-sdk/*`) is the only runtime for platform-owned agent reasoning and user-facing model/message execution; there is no parallel `pi-ai` or second platform agent model/message hierarchy. This does not prohibit Mem0's internal model operations: OSS may use its configured LLM/embedder drivers, while the managed Platform API runs its own provider stack. These operations remain within Mem0's memory pipeline and are not a second platform agent runtime. | 03 §Single-Runtime Standardization; 05 §Mem0 Integration Architecture; 05 §Model Tier Separation: Reasoning LLM vs. Mem0 Extraction LLM |
| CD-07 | The control plane is the Backstage New Backend System, with mandatory `httpAuth` identity resolution, `PermissionsService` authorization, no anonymous fallback, and fail-closed denials. | 06 §Mandatory `httpAuth` Identity Resolution; 06 §Modern Backstage `PermissionsService` DI; 01 §Stale `ONBOARDING.md` (ban on `onUnauthorized: 'skip'`) |
| CD-08 | No raw secrets or live credentials in workflow state, Temporal history, checkpoints, or telemetry. Only opaque references cross the boundary. | 02 §Zero Token Persistence in History (P14); 01 §Stale `ONBOARDING.md`; 02 §Checkpoint & State-Patch Secret Rejection Guard |
| CD-09 | Tracing uses the standard OpenTelemetry SDK with W3C propagation. Core packages define no bespoke tracing or APM extension points. | 06 §No Custom APM/Tracing Extension Points; 07 §OpenTelemetry Standardization |
| CD-10 | Dependencies use permissive licenses only (no copyleft), so commercial white-label distribution stays possible. | 06 §Stateless `BackstageTemporalBridge` & Commercial Licensing Posture |
| CD-11 | When Mem0 memory is enabled, both self-hosted OSS and the managed Mem0 Platform API are supported backend modes, selected through validated configuration and tenant/data-class policy. Platform-only features are optional and are not implied by the shared contract. | 05 §Mem0 API Modes, Shared Contract & Platform-Only Capabilities; [Mem0 Platform vs. Open Source](https://docs.mem0.ai/platform/platform-vs-oss) |
| CD-12 | New providers for an existing capability category require zero core changes. Core never switches on provider identity, and provider IDs are open strings. | 06 §Capability Category Extensibility |
| CD-13 | Prohibitions: no runtime "define your own extension point" escape hatch; no config-driven (YAML/JSON) tool generation; no legacy Temporal `cronSchedule`; no in-memory `SimpleVectorStore` outside dev/test. | 06 §Capability Category Extensibility (Non-Goals); 02 §Pull-Based Worker Polling; 05 §Database-Agnostic RAG Abstraction Layer |
| CD-14 | Startup fails on invalid configuration or registrations ("fail boot, not first run"), and the tool/capability registry freezes after boot. | 07 §"Fail Boot, Not First Run"; 07 §Post-Boot Tool Registry Immutability Gate; 06 §Strict `config.d.ts` Schema |
| CD-15 | Before first release, decide which surfaces are public and stable. Show that a representative upgrade from the first release to the next preserves workflow definitions and in-flight Temporal runs. | `docs/PLANNING.md` (post-migration revision) |
| CD-16 | The canonical capability category IDs are `scm`, `incidents`, and `scorecards`. The former labels `vcs`, `incident-management`, and `quality-scorecards` are historical names, not aliases; they must not be used as category values, category requirements, or category-prefixed capability IDs. | `docs/incoming/TOOLS_CATEGORIES.md` (Koine-to-Crew Suite mapping and category standardization) |

---

## 3. Proposed Launch Scope — Capability Map by Subsystem

Unless something is listed in §4 (Deferred) or §5 (Undecided), every capability outlined in discovery is a **launch candidate** (`Scope: Launch`, `Scope Basis: Proposed`). This section groups the main capability clusters so each SUBSYSTEM pass has a starting frame. It is not exhaustive. The Source Coverage Table in each requirements file is the authoritative mapping.

### 3.1 Subsystem 01 — Workflow Authoring & Graph Definition SDK

| Category | Capabilities |
| :-- | :-- |
| Confirmed Direction | CD-04, CD-05, CD-13, CD-16 (typed fluent builder → serializable IR; determinism invariants in authored code; standardized category IDs) |
| Explicit Deferrals | None stated in discovery. |

**Proposed Launch**

- Core builder primitives: `.addStep`, `.addChoice`, `.repeatUntil` (explicit exit predicates), `.addParallelForEach`, `.requireApproval`, `.waitForSignal`, `.checkpoint`, `.setTerminalOutcome`, `.compile` with static DFS topology validation.
- Deterministic code nodes as first-class primitives.
- Sub-agent / child-workflow delegation primitives.
- Zod input/state schemas with end-to-end type propagation (`z.any()` banned).
- Immutable revision identity on agent and workflow definitions.
- `AgentDefinition` provider restrictions, logical `modelRef` / tier slots, data-sensitivity routing.
- Declarative guardrail configuration (`.configureFinOps`, `.configureThrottling`, `.configureResilience`, `.configureStorage`, `.configureCompliance`).
- Declarative schedules and triggers.
- `AgentContext` (`ctx.*`) facade.
- Isolated test harness (`createTestHarness`) with trajectory record/replay.
- Capability-pack contract (`defineAgentCapabilityPack`).

**Unresolved**

- `.addHypothesisFork`, `.addStreamingStep`, `.configureVersion` mid-flight state migrations (SD-15).
- Goal-reconciliation opt-in mode (SD-06).
- GitOps skill bundles and agent-authored skill PRs (SD-18).
- Type guarantees at branch joins (BD-03).
- Whether `ctx.*` primitives stay a separate facade or become governed capabilities (OWN-07; 04 §Reconciling `AgentContext` Primitives into Governed Capabilities).
- `.addInterceptor` / `.extend` vs. the tracing-hook ban (CF-04).

### 3.2 Subsystem 02 — Durable Execution & Orchestration Engine

| Category | Capabilities |
| :-- | :-- |
| Confirmed Direction | CD-04, CD-08. Temporal Schedules for user and workflow runs, with no second fleet scheduler (02 §Single-Scheduler Discipline; reconciled with 06 §Schedule Management & Static Control-Plane Housekeeping Split). |
| Explicit Deferrals | None stated. |

**Proposed Launch**

- Generic graph interpreter workflow with per-node Activity decomposition.
- Single-turn LLM stepping (`maxSteps: 1`).
- Durable HITL suspension with TTL and approve/reject/modify signals.
- Durable external wait (`awaitOperation`, callbacks).
- Steering, abort, and cancel signals with cooperative cancellation.
- Child workflows with depth caps and budget roll-up.
- `continueAsNew` compaction and history-size protection.
- Replay-safe versioning (`patched` / `getVersion`) and state upcasting.
- Error taxonomy split between retryable Activity failures and non-retryable tool errors (`AuthenticationRequiredError`, `context_length_exceeded`).
- Idempotency keys and saga compensation.
- Payload codec encryption and claim-check payloads.
- Temporal as execution authority, with SQL run projections reconcilable from history.
- Worker graceful shutdown and abandoned-run recovery.
- Replay testing in CI. Durable spend ledger and budget exhaustion.
- Trace-context propagation across Temporal boundaries.

**Unresolved**

- Worker topology (CF-01 / SD-02). Checkpoint authority vs. `CheckpointStore` (CF-11 / BD-02).
- Hybrid cloud/local routing and local-node heartbeat failover (SD-10).
- Voice-to-Temporal barge-in bridging (SD-05).
- Goal-reconciliation outer loop P0-P17 (SD-06).
- Cross-team sibling workflow collision detection, alert aggregator / quiet-hours workflows, and monthly knowledge-promotion consolidation (SD-17, SD-22).

### 3.3 Subsystem 03 — Agent Reasoning & Inference Runtime

| Category | Capabilities |
| :-- | :-- |
| Confirmed Direction | CD-06. |
| Explicit Deferrals | None stated. |

**Proposed Launch**

- `ModelExecutor` single-step contract over the AI SDK provider registry.
- Logical model tiers with failover.
- Per-node token usage emission and run budget enforcement.
- Rate-card metering with mid-stream budget cutoff.
- Egress redaction gate before provider calls.
- Prompt assembly with per-turn deterministic reassembly, cache-boundary architecture, and token-budgeted slots.
- Safe context compaction with schema-enforced summaries and emergency truncation fallback.
- Loop, stall, and thrashing detection with programmable stop hooks.
- Evidence-backed completion gate.
- Indirect prompt-injection containment (provenance wrapping, quarantine).
- Tool-schema sanitization per provider.
- Malformed-JSON repair.
- `ask_clarification` / `ask_questions`.
- In-context checklist state.
- Sub-agent clean context windows.
- Typed stream-part mapping.
- AbortSignal` threading.
- Fault-injection seams.
- Gateway readiness ping.

**Unresolved**

- Reversible vs. irreversible PII tokenization (CF-02).
- Distributed vs. local breakers (CF-03).
- Voice input pipeline and voice output mode (SD-05).
- Hybrid `local-private` tier and sovereign / ZDR routing depth (SD-10, SD-14).
- Read-only diagnostic meta-agent `/troubleshoot` (SD-22).
- Speculative follow-ups, `#`/`@` mention expansion, pre-loop intent routing (SD-22).
- Framework-agnostic core ports-and-adapters boundary (BD-08).

### 3.4 Subsystem 04 — Tool & Capability Registry

| Category | Capabilities |
| :-- | :-- |
| Confirmed Direction | CD-12, CD-13, CD-14, CD-16. |
| Explicit Deferrals | Option D standalone Driver Gateway service (04 §Recommended Tool Architecture: "Future Deployment Topology"). **Constraint:** the gateway must stay separable. WASM sandbox tier, conditional on confirmation (SD-11; 04 §Open Architectural Decisions #5). |

**Proposed Launch**

- Immutable capability catalog with single-source `CapabilityDescriptor` (effect, mode, slot provenance, standing, idempotency, cache, dataClass, approval, `trustTier`).
- `CapabilityGateway` as the uniform dispatch point (`ctx.tools.invoke`) with allow-lists, tenant/RBAC enforcement, rate-limit normalization, output projection and redaction, and `ArtifactSink` offload.
- Drivers with zero network imports, plus a central `HttpConnector` with SSRF guard and a `NativeAdapter` escape hatch.
- Requirement algebra and preflight matrix.
- Risk-tiered approval policies with dry-run previews.
- Two-phase `stage`/`commit`/`compensate` contracts.
- Write idempotency keys.
- Token Broker (OBO, standing modes, no privilege-escalation fallback, post-pause re-minting, account-pinned reconnection).
- Kill switches at the top of the policy cascade.
- Backstage extension points for drivers.
- Contract test suite per category.
- Catalog graph hydration.
- AI SDK `tool()` projection.
- MCP server integration with digest pinning.

**Unresolved**

- Side-effect taxonomy (CF-09).
- Canonical category list and which categories ship drivers (CF-10, SD-07).
- Token Broker day-one providers and refresh-token storage (SD-08, CF-05).
- Multi-instance provider binding and per-user selection (04 §Open Architectural Decisions #2).
- Approval-policy authority (CF-13 / SD-13).
- `regulated` data-class caching rule (04 §Open Architectural Decisions #4).
- Browser automation, local companion capabilities, and workstation consent (SD-10).
- Sandboxed container/microVM execution depth (SD-11).
- Custom write-capability MCP server authoring (SD-09).
- Embedding-guided virtual tool clustering (SD-22).

### 3.5 Subsystem 05 — Context, Memory & Knowledge Retrieval

| Category | Capabilities |
| :-- | :-- |
| Confirmed Direction | CD-11. PostgreSQL is the system of record for `RunStore`, `ArtifactSink`, `AuditLogSink`, and the FinOps ledger (05 §Decoupled Runtime Persistence Contracts; 05 §Persistence Split). `coreServices.cache` is a best-effort ephemeral cache, never a system of record (05 §Backstage CacheService Backing Store). |
| Explicit Deferrals | Mem0 Platform-only capabilities beyond the shared API contract (DF-04); the managed API mode itself is not deferred or excluded. |


**Proposed Launch**

- Persistence contracts: `SessionStore`, `RunStore`, `CheckpointStore`, `ArtifactSink`, `AuditLogSink`, with a pluggable `StateSerializer`.
- Append-only session/step transcript with schema versioning and forward upcasters.
- Ephemeral run artifact spillover with windowed reads.
- Collection-level separation of memory and RAG.
- Stateless RAG over catalog and TechDocs through Backstage Search, with hybrid retrieval.
- Deterministic pre-loop entity/TechDocs hydration.
- Tenant/principal-scoped memory with poisoning write-gates.
- User memory CRUD and right-to-forget erasure.
- Retention sweepers and TTL.
- Pre-persistence redaction gate.

**Unresolved**

- Whether Mem0 long-term memory ships at launch (SD-03).
- Vector backend(s) (CF-06).
- Memory taxonomy (CF-07).
- Redis vs. SQL for `SessionStore` / `CheckpointStore` (BD-02).
- Three-stage organizational knowledge promotion, self-healing memory loop, and learning user defaults from clarifications (SD-17).
- Asynchronous AST indexing / code-graph weaver (SD-17).

### 3.6 Subsystem 06 — Backstage Control Plane & Surface Layer

| Category | Capabilities |
| :-- | :-- |
| Confirmed Direction | CD-03, CD-07, CD-09, CD-12, CD-14. A thin control plane with `@temporalio/client` only that returns `202 Accepted` (06 §Lightweight Backstage `@temporalio/client` Gateway). The agent host owns sessions independently of UI clients (06 §Transport-Agnostic Client / Agent Host Architecture). |
| Explicit Deferrals | None stated. |

**Proposed Launch**

- Launch  Run lifecycle APIs: start, cancel/stop, steer, signal, resume, rollback step.
- Authenticated SSE run stream with anti-IDOR checks, `Last-Event-ID` resume, and structured error events.
- HITL approval surfaces with separation of duties and idempotent single-responder resolution.
- Clarification card and resume endpoint.
- Run inspector and DAG visualizer (core).
- Schedule management UI/API.
- Capability preflight and connection-settings (OAuth consent/callback) UI with CSRF binding.
- "Manage My Memory" UI / API (if SD-03 is Launch).
- Operator fleet health, background-jobs dashboard, admin kill switch, and break-glass endpoints.
- Usage / cost read API.
- Typed `config.d.ts` for redaction, retention, pricing, and provider-policy overrides.
- `AuditLogSink` and `runtimeStoreExtensionPoint` extension points.
- `@backstage/errors` mapping.
- Frontend `ErrorApi` discipline.
- UI Markdown exfiltration hardening.
- Trace deep-links.
- Catalog / TechDocs re-index hooks.
- Webhook / event trigger ingress with provenance gatekeeping.

**Unresolved**

- Stream wire protocol (CF-08 / BD-06).
- Non-Backstage channels (Slack, CLI, CI webhook clients, email) (SD-04).
- Voice ingress (SD-05).
- Advanced visualizer widgets: comparative simulation lanes, billing tracker, quota monitor, upgrade banner, emergency triage banner, etc. (SD-16).
- Staged agent release rollouts and operator feedback API (SD-21).
- Mention autocomplete, follow-up chips, context collector (SD-22).
- Pluggable model provider registry and per-tenant routing (SD-01).

### 3.7 Cross-Cutting — NFRs, Security, Observability & Testing (`07`)

| Category | Capabilities |
| :-- | :-- |
| Confirmed Direction | CD-08, CD-09, CD-10, CD-14. |
| Explicit Deferrals | Reversible re-identification vaults are prohibited by 07 §Irreversible Egress Redaction (pending CF-02). |

**Proposed Launch**

- Canonical `ErrorCode` taxonomy and client-facing error sanitization.
- Structured key-value logging.
- OTel span conventions, including GenAI span trees.
- Configurable redaction policy and credential scanning.
- Append-only `AuditLogSink` standard covering HITL decisions, authorization decisions, credential usage, and capability invocations.
- Anti-IDOR resource-scoped access.
- Separation of duties.
- Token usage and query-time cost computation.
- Per-run multi-dimensional budgets and runaway-loop kill switch.
- Environment-driven credentials.
- Field-level checkpoint encryption.
- Outbound-only worker perimeter.
- Deterministic test fixtures, byte-identical replay, boundary fault-injection standard, secret-leak assertions in harnesses, and driver contract tests.
- Offline CI evaluation with trajectory replay and golden datasets.
- Data-retention purge standard. Architecture lint gates (core package boundary, driver network imports).

**Unresolved**

- Compliance regimes claimed at launch (SOC-2 / HIPAA / FINRA), WORM archival, DSSE attestation, PITR/DR drills, cryptographic per-tenant isolation (SD-14).
- Langfuse as a launch dependency (SD-12).
- Online production evals and developer-trust KPIs (SD-20).
- Four-stage model rollout protocol (SD-21).
- Tool-poisoning semantic CI audit and agent-authored skill PR gates (SD-18).

## 4. Explicit Deferrals (`DF-xx`)

Only items recorded here may carry `Scope: Deferred`. Each still constrains architecture where noted.

| ID | Deferred Item | Source | Architectural Constraint at Launch |
| :-- | :-- | :-- | :-- |
| DF-01 | LangGraph compatibility, integration, or dependency relationship | Kickoff Project Direction | Explicitly out of scope, not deferred for later. LangGraph was used only in V1; that is historical context, not a technical relationship to preserve. No LangGraph APIs, data formats, workflow definitions, or adapters carry forward. Platform-owned agent runtime uses the Vercel AI SDK (CD-06). |
| DF-02 | Option D standalone Driver Gateway service (extracted gateway, MCP facade, network-isolated OBO) | 04 §Recommended Tool Architecture | The gateway must be extractable without rewriting drivers or workflows. |
| DF-03 | *(Proposed, pending SD-11)* WASM `prepare`/`fill` sandbox tier for untrusted third-party drivers | 04 §Open Architectural Decisions #5 | Driver contract must not preclude a later sandboxed tier. |
| DF-04 | Mem0 Platform-only capabilities beyond the shared memory operations (for example Graph Memory, Dream, Memory Decay, Temporal Reasoning, and product-specific dashboard or event surfaces) | 05 §Mem0 API Modes, Shared Contract & Platform-Only Capabilities | Optional extensions; the managed Platform API and self-hosted OSS API are both supported modes under CD-11. |

---

## 5. Unresolved Scope Decisions (`SD-xx`)

Requirements that depend on these decisions are marked `Scope: Undecided` and link the `SD-##`. Items marked **Blocking** must be decided before the named SUBSYSTEM pass can draft stable requirements.

- **`SD-01`, tenancy:** what is a "tenant" in a Backstage install? Every subsystem assumes a tenantId, so this affects all passes.
- **`SD-06`, goal-reconciliation mode:** does it ship at launch? This blocks passes 01 and 02.
- **`SD-02`, worker topology:** dedicated workers only, or embedded mode too (and if so, only for local dev)? This blocks pass 02.
- **`SD-03`, long-term memory:** does Mem0 ship at launch? This blocks pass 05.
- **`SD-14`, compliance:** which regimes (SOC-2, HIPAA, FINRA) are launch claims rather than designed-for? This blocks pass 07.
- **`SD-08`, `SD-11`, `SD-13`:** Token Broker day-one providers and refresh-token storage, the sandbox tier, and who owns approval policy. These block pass 04.
- **`SD-07`, launch integrations and agents:** not needed for the contract passes, but needed before release readiness.

| ID | Decision | Affects | Blocking? |
| :-- | :-- | :-- | :-- |
| SD-01 | **Tenancy model.** What a "tenant" is in a Backstage installation: single organization with logical tenant IDs, multiple organizations per installation, or SaaS-hosted. Discovery assumes `tenantId` everywhere (RLS, per-tenant encryption domains, per-tenant routing, tenant admission quotas). | All | **Blocking** (all passes) |
| SD-02 | **Worker topology at launch.** Dedicated worker pool only, or embedded mode supported (and if so, for development only or also for low-volume production). See CF-01. | 02, 06, 07 | **Blocking** (02) |
| SD-03 | **Long-term memory (Mem0) at launch.** Ship governed cross-run memory, or launch with session memory plus stateless RAG only. | 05, 03, 06, 07 | **Blocking** (05) |
| SD-04 | **Interaction channels at launch.** Backstage UI only, or also Slack, CLI, CI webhook clients, and email. | 06, 07, 04 | Blocking (06) |
| SD-05 | **Voice** (STT ingress, barge-in, voice output mode). | 02, 03, 06, 07 | No (likely isolated) |
| SD-06 | **Goal-reconciliation mode** (Kazi controller, P0-P17 items: goal revisions, predicate verifiers, outer loop, publication separation). | 01, 02, 04, 06, 07 | **Blocking** (01, 02) |
| SD-07 | **Launch integrations and test fixtures.** Which of the default-driver candidates and base intents in 04 §Default Driver Candidates & Base Intent Catalog ship, and what minimal non-production test-agent or workflow fixtures are needed to validate the Platform. Production Crew Suite agents belong to a separate project and are out of scope. Candidate defaults alone do not set launch scope. | 04, 06, release readiness | **Blocking** for release readiness; non-blocking for contract passes |
| SD-08 | **Token Broker day-one scope.** Providers that need `user` standing, and approval of KMS-encrypted server-side refresh-token storage. | 04, 07 | Blocking (04) |
| SD-09 | **MCP at launch.** Consuming external MCP servers, and authoring custom write-capability MCP servers. | 04, 07 | No |
| SD-10 | **Local and browser execution.** Browser automation capabilities, local companion / workstation capabilities, hybrid cloud/local task queues, and `local-private` model tier. | 02, 03, 04, 07 | No |
| SD-11 | **Sandbox tier at launch.** Ephemeral container/microVM sandbox for untrusted execution; whether third-party drivers are ever supported (triggers the WASM tier). | 02, 04, 07 | Blocking (04) |
| SD-12 | **Langfuse.** Required launch dependency, optional OTel exporter target, or deferred. | 03, 07 | No |
| SD-13 | **Approval-policy authority.** Backstage Permission Policy, `AgentDefinition` manifests, or an external engine (OPA / Cedar / OpenFGA). See CF-13. | 04, 06, 07 | Blocking (04) |
| SD-14 | **Compliance posture at launch.** Which regimes (SOC-2, HIPAA, FINRA) are launch claims vs. designed-for. Also the scope of `regulated` data class, WORM archival, DSSE attestation, PITR/DR drills, and BYOK. | 05, 07, 04 | Blocking (07) |
| SD-15 | **Advanced builder primitives:** `.addHypothesisFork`, `.addStreamingStep`, `.configureVersion` mid-flight migrations. | 01, 02, 06 | No |
| SD-16 | **Visualizer depth.** Which run-inspector and DAG widgets ship (06 §Dynamic Branch Highlighting through §Emergency Triage Alert Banner). | 06 | No |
| SD-17 | **Advanced memory.** Organizational knowledge promotion, self-healing memory, consolidation workflows, AST / code-graph indexing, learned user defaults. | 05, 02 | No (if SD-03 is resolved) |
| SD-18 | **Skills supply chain.** GitOps skill bundles, agent-authored skill PRs, third-party capability-pack distribution, tool-poisoning CI audit. | 01, 04, 07 | No |
| SD-19 | **Public stable surface.** Which SDK/IR/API surfaces are semver-stable at first release, and the upgrade-evidence bar (CD-15). | 01, 02, 06 | Blocking for release readiness |
| SD-20 | **Evaluations.** Offline CI evals only, or also online production evals, continuous eval loop, and trust KPIs. | 03, 07 | No |
| SD-21 | **Release and rollout governance.** Staged agent rollouts and rollback, the four-stage model migration protocol, consecutive-failure auto-rollback. | 02, 06, 07 | No |
| SD-22 | **UX accelerators.** Speculative follow-ups, mention autocomplete, context collector, `/troubleshoot` meta-agent, intent routing, virtual tool clustering, alert aggregation / quiet hours. | 03, 04, 06 | No |

---

## 6. Conflicting Notes (`CF-xx`)

Each conflict must be resolved by a `PROP-###` / `ADR-###` (architectural) or an `SD-##` (scope) before dependent requirements can be `Launch`.

- **`CF-01`, worker placement:** one set of notes supports running the Temporal worker inside Backstage; another says it must never be embedded.
- **`CF-02`, redaction:** a reversible PII tokenization proxy is proposed, while another note explicitly bans reversible vaults.
- **`CF-03`, failure handling:** distributed circuit breakers are proposed, while the coding standards ban them in favour of local cooldowns.
- **`CF-08`, stream format:** three competing formats for the run event stream.
- **`CF-09`, tool risk levels:** four competing ways to classify tool side effects and autonomy.
- **`CF-11`, resume state:** the notes say Temporal is the source of truth for execution, but `CheckpointStore` (optionally in Redis) also holds resumable state.

| ID | Conflict | Side A | Side B | Resolution path |
| :-- | :-- | :-- | :-- | :-- |
| CF-01 | **Worker placement** | Embedded worker inside the Backstage backend is supported (dev / low volume): 02 §Temporal Worker Deployment Topologies; 06 §Control-Plane Isolation & Worker Mode Configuration; 01 §Three-Tier Monorepo Package Split | Worker is "never embedded" in the Backstage process: 02 §Standalone Temporal Worker Microservice; 06 §Headless Control-Plane vs. Worker Pod Separation | SD-02 → BD-04 |
| CF-02 | **PII/PHI redaction reversibility** | Reversible session-scoped tokenization proxy in `ModelExecutor`: 03 §Reversible PII / PHI Tokenization Proxy | Explicit ban on reversible vaults: 07 §Irreversible Egress Redaction & Ban on Re-Identification Vaults | BD-09 |
| CF-03 | **Circuit breakers** | Distributed three-state breakers in Redis/PostgreSQL: 04 §Distributed Capability Circuit Breakers; 03 §Model-Agnostic Failover Router, Redis Circuit Breakers; 01 §`.configureResilience`; 02 §Temporal `RetryPolicy` Compilation & Fast-Fail Circuit Breaking | Ban on distributed breakers in favor of local cooldowns: 07 §Lightweight Local Cooldowns; 03 §Local Per-Model Cooldowns; 04 §Local Failure-Count Cooldowns | BD-10 |
| CF-04 | **Lifecycle hooks vs. tracing-hook ban** | `.addInterceptor()` / `.extend()` lifecycle middleware (01); Langfuse bridge (07 §Unified Observability; §Self-Hosted Langfuse Trace Anatomy) | No custom tracing/APM hooks: 06 §No Custom APM/Tracing Extension Points; 07 §OpenTelemetry Standardization | Likely reconcilable (business middleware ≠ tracing hooks; Langfuse via OTel exporter) → BD-11 + SD-12 |
| CF-05 | **Secret storage** | No vendor KMS SDKs in core; environment-injected secrets: 07 §Environment-Driven Credentials Policy | KMS envelope-encrypted `CredentialStore` for OAuth tokens: 04 §`CredentialStore` Interface; 04 §Open Architectural Decisions #1 | Reconcilable via a pluggable KMS port → SD-08 + BD-05 |
| CF-06 | **Vector backend** | Qdrant as primary production backend via `@vectorstores/*`: 05 §Database-Agnostic RAG Abstraction Layer (source file missing) | Converged PostgreSQL + `pgvector` substrate: 05 §Converged Storage Substrate; 05 §Mem0 Integration Architecture | SD-03 → BD-02 |
| CF-07 | **Memory taxonomy** | Three-tier hierarchy: 05 §Three-Tier Memory Hierarchy; 05 §Three-Tier Scoped Memory Hierarchy | Five-type / five-tier architecture: 05 §Five-Type Memory Architecture; 05 §Mem0 Integration Architecture | 05 SUBSYSTEM pass (scope axis vs. type axis may be orthogonal) |
| CF-08 | **Run stream wire protocol** | `AgentEvent` v2 frames: 06 §SSE Asynchronous Error Propagation; 03 §Node-Level Token Usage | AI SDK UI Message Stream Protocol over Redis Streams: 06 §Frontend/Backend AI SDK Package Split. Zod `AgentStreamPart` union: 06 §Typed Discriminated-Union SSE Protocol; 03 §Mapping AI SDK 7 Stream Events | BD-06 |
| CF-09 | **Side-effect / autonomy taxonomy** | `effect: read | write | destructive` + `reversibility`: 04 §Recommended Tool Architecture; 04 §Provider-Independent Tool IDs & Effect Classification | `READ | REVERSIBLE_STAGE | DESTRUCTIVE_MUTATION`: 04 §Three-Tier Capability Side-Effect Risk Classification; 02 §Automatic Temporal Suspension on `DESTRUCTIVE_MUTATION`. Four-tier autonomy: 04 §Four-Tier Progressive Autonomy; 04 §Tiered Autonomy by Reversibility | BD-07 |
| CF-10 | **Capability category count** | 20 → 22 → 24 → 26 → 28 categories across successive 04 headings | — | CD-16 fixes the three standardized category IDs; the 04 SUBSYSTEM pass + SD-07 still resolve the total count and launch set. |
| CF-11 | **Checkpoint authority** | Temporal is execution authority; SQL is a rebuildable projection: 02 §Temporal Execution Authority (P3) | `CheckpointStore` holds resumable orchestration state, optionally in Redis with sliding TTL: 05 §Decoupled Runtime Persistence Contracts; 05 §Short-Term Checkpoint Store Schema; 02 §Append-Only Checkpoints & Resume Version Validation; 02 §Two-Tier Mutations & Reversible Saga Checkpoints | BD-02 |
| CF-12 | **Package naming** | `plugin-agent-orchestrator-common` / `agent-drivers` (01); `@ai-crew-suite/plugin-platform-node` / `plugin-kernel-backend` (01 §Stale `ONBOARDING.md`); `core-node` / `core-backend` (06); `@internal/agent-core` (03, 07); `@ai-crew-suite/temporal-worker` (02) | `.ai-rules/prompts/general-instructions.md` describes `plugins/backend/` and `plugins/frontend/`, but the repository currently has `plugins/platform-backend/`, `plugins/platform-node/`, etc. | CD-03: requirements name contracts only. Package boundaries are decided in BD-08 and the implementation plan. |
| CF-13 | **Policy engine** | Backstage `PermissionsService` only (06, 07 §Anti-IDOR) | External OPA / Cedar / OpenFGA: 04 §Hybrid Auth Matrix; 07 §Shift-Left Policy-as-Code; 06 §Dynamic Enterprise Policy | SD-13 |
| CF-14 | **Clarification primitive naming** | `ask_clarification`: 02 §Zero-Compute Clarification Suspension; 03 §Ambiguity Containment | `ask_questions`: 02 §Mid-Turn Interactive Clarification Pause; 03 §Structured Clarification Tool | 03 SUBSYSTEM pass (treat as duplicate; choose one contract) |

Resolved during kickoff (not a conflict): Backstage `coreServices.scheduler` handles internal housekeeping, and Temporal Schedules handle user/workflow runs (06 §Schedule Management & Static Control-Plane Housekeeping Split is consistent with 02 §Single-Scheduler Discipline).

---

## 7. Architectural Boundary Decisions (ADR Candidates, `BD-xx`)

These boundaries change subsystem contracts. The **first** SUBSYSTEM pass that depends on a boundary creates the `PROP-###` in its own PROP block, using the suggested slug. Later passes append their dependent `REQ-###` IDs to that existing entry. **Blocks drafting** means the named pass will produce mostly `Undecided` requirements until the boundary is proposed.

| ID | Boundary | Suggested Slug | Expected First Pass | Blocks Drafting Of | Related |
| :-- | :-- | :-- | :-- | :-- | :-- |
| BD-01 | **Determinism boundary and retry semantics.** What runs in workflow code vs. Activities, and how Activity retries, idempotency keys, and tool-level `isError` results interact. Replay-safe does not mean exactly-once external writes. | `determinism-boundary` | 01 | 01, 02, 03, 04 | CD-04 |
| BD-02 | **State and memory lifecycle.** Execution authority (Temporal) vs. product records and projections (PostgreSQL) vs. `CheckpointStore` / `SessionStore` (which can drive resume?) vs. long-term memory (Mem0) vs. ephemeral cache (Redis). Includes vector backend placement. | `state-and-memory-lifecycle` | 02 | 02, 05, 06 | CF-06, CF-11, SD-03 |
| BD-03 | **Fluent API type inference.** What `.addStep()` carries forward, and what `.addChoice()` / `.addParallelForEach()` guarantee at branch joins. Proved with compile-pass and compile-fail examples. | `fluent-api-type-inference` | 01 | 01 | — |
| BD-04 | **Control-plane / worker deployment boundary.** Embedded vs. dedicated workers, and the `graphIR` vs. `handlers` split across processes. | `control-plane-worker-topology` | 02 | 02, 06 | CF-01, SD-02 |
| BD-05 | **Identity and tenant context across Temporal.** Which principal and tenant identifiers may enter workflow args and history, how the tool boundary gets fresh, narrowly scoped authority (Token Broker / OBO), and behavior on mid-run revocation. No live Backstage credentials in history. | `identity-and-tenant-context` | 02 | 02, 04, 06, 07 | SD-01, SD-08, CF-05 |
| BD-06 | **Run event / stream protocol.** Canonical event schema, sequence cursors, persistence for replay-to-live, and the mapping to the frontend rendering protocol. | `run-event-stream-protocol` | 03 | 03, 06 | CF-08 |
| BD-07 | **Capability side-effect and autonomy taxonomy.** One classification that drives approval, checkpointing, batching, and hypothesis-branch restrictions. | `capability-effect-taxonomy` | 04 | 02, 03, 04 | CF-09 |
| BD-08 | **Framework-agnostic core boundary.** Which contracts must be free of Backstage, Temporal, and AI SDK imports (authoring SDK, reasoning core), enforced by architecture lint. | `framework-agnostic-core` | 01 | 01, 03, 06 | CF-12; 07 §Zero-Framework Core Package Boundary |
| BD-09 | **Egress redaction model.** Reversible vs. irreversible, and its placement across `ModelExecutor`, `CapabilityGateway` output, SSE egress, telemetry, and persistence. | `egress-redaction-model` | 03 | 03, 04, 06 | CF-02 |
| BD-10 | **Resilience model.** Local cooldowns vs. distributed breakers vs. Temporal retry policy, for model calls and capabilities. | `resilience-and-backpressure` | 03 | 03, 04 | CF-03 |
| BD-11 | **Extension and middleware model.** Builder `.extend()` / `.addInterceptor()`, Temporal interceptors, mandatory platform interceptors, and the no-custom-tracing rule. | `workflow-middleware-model` | 01 | 01, 02, 06 | CF-04 |

---

## 8. Unclear Ownership (`OWN-xx`)

The SUBSYSTEM pass named under **Proposed Owner** holds the canonical requirements. Other passes link to them or raise `[CONTRACT-STUB]`s.

| ID | Concern | Appears In | Proposed Owner | Rationale |
| :-- | :-- | :-- | :-- | :-- |
| OWN-01 | Checkpoints (resume state, saga baselines) | 02, 05 | 02 owns semantics; 05 owns store contracts | Pending BD-02 |
| OWN-02 | Budgets and FinOps ledger | 01 (`.configureFinOps`), 02 (spend ledger), 03 (metering), 05 (`FinOpsLedgerStore`), 06 (usage API), 07 (accounting) | 07: platform guarantee and accounting model. 03: metering at the call site. 02: run-level enforcement and settlement. 05: persistence. | Classic duplication risk |
| OWN-03 | Redaction | 02, 03, 04, 05, 06, 07 | 07: policy and guarantees. Each subsystem: its own enforcement point. | BD-09 |
| OWN-04 | HITL approvals | 01 (primitive), 02 (suspension), 04 (risk policy), 06 (UI/API), 07 (audit, SoD) | 02: approval state machine. 04: when approval is required. 06: surfaces. 07: audit and SoD. | — |
| OWN-05 | Audit (`AuditLogSink`) | 05 (store), 06 (extension point), 07 (standard) | 07: record schema and guarantees. 06: extension point. 05: default store. | — |
| OWN-06 | Sub-agents / child runs | 01, 02, 03, 04 (least-privilege cascade), 07 | 02: lifecycle and budget roll-up. 03: context isolation. 04: capability narrowing. | — |
| OWN-07 | `AgentContext` (`ctx.*`) primitives | 01 (API), 02 (execution semantics per primitive), 04 (§Reconciling `AgentContext` Primitives into Governed Capabilities) | 01: author-facing surface. 04: execution via `CapabilityGateway`. | Decide whether `ctx.catalog`, `ctx.search`, `ctx.urlReader`, etc. are capabilities. |
| OWN-08 | Skills (bundles, disclosure, `load_skill`, hydration, supply chain) | 01, 03, 04, 05, 07 | 04: skill as a governed capability artifact. 03: disclosure in the prompt. 07: supply-chain gates. | SD-18 |
| OWN-09 | Evaluations | 03, 07 | 07 | Test and eval standards are cross-cutting. |
| OWN-10 | Error taxonomy (`ErrorCode`, quota vs. throttling) | 02, 03, 06, 07 | 07: taxonomy. Others: mapping. | — |
| OWN-11 | Schedules | 01 (declaration), 02 (Temporal Schedules semantics), 06 (UI/API), 07 (anti-proliferation governance) | 02 | — |
| OWN-12 | Tenant / principal propagation | 02, 04, 06, 07 | 07: guarantee. 06: ingress resolution. 02: propagation. 04: enforcement. | BD-05, SD-01 |

---

## 9. Release Readiness (Draft Criteria)

The first public release is ready when all of the following hold. Final evidence is gathered in the last implementation layer, but checks should start earlier.

1. Every `Scope: Launch` requirement has passing verification by its stated Method.
2. No `Scope: Undecided` requirements remain. Each has been resolved to `Launch` or `Deferred`.
3. No unresolved `PROP-###` links remain in any requirements file.
4. The promised launch workflows and integrations (SD-07) run end to end from a clean installation, including recovery after a worker restart, fail-closed authorization, HITL suspension and resumption, and cancellation.
5. V1 failure modes cited in requirement Notes have corresponding acceptance tests where they still apply.
6. The public stable surface is documented, and a representative upgrade preserves workflow definitions and in-flight runs (CD-15, SD-19).

---

## 10. Recommended SUBSYSTEM Pass Order

| Order | Pass | Why this position | Prerequisites |
| :-- | :-- | :-- | :-- |
| 1 | **01 Workflow Authoring SDK** (pilot) | Defines the Graph IR and authoring contracts that every other subsystem consumes. It is the smallest file (74 sections), so it is a good test of the template. Raises BD-01, BD-03, BD-08, BD-11. | SD-01, SD-06 answered (or explicitly left `Undecided`) |
| 2 | **02 Durable Execution Engine** | Consumes the IR. Settles the determinism, state authority, worker topology, and identity-across-Temporal boundaries before any runtime subsystem builds on them. Raises BD-02, BD-04, BD-05. | 01 drafted; SD-02 answered |
| 3 | **07 Cross-Cutting** | Establishes canonical platform-wide guarantees (errors, audit, redaction policy, identity, secrets, telemetry, budgets, test standards) so later passes link rather than duplicate. 01 and 02 will have raised cross-cutting stubs by then for this pass to absorb. | SD-14 answered |
| 4 | **04 Tool & Capability Registry** | Defines `CapabilityGateway`, the effect taxonomy, and the Token Broker. 03 and 05 depend on these. Raises BD-07. | SD-08, SD-11, SD-13 answered |
| 5 | **03 Agent Reasoning Runtime** | Builds on the determinism boundary, capability contracts, and redaction policy. Raises BD-06, BD-09, BD-10. | 04 drafted |
| 6 | **05 Context, Memory & RAG** | Depends on the state-lifecycle boundary, prompt assembly (03), and store ownership. | SD-03 answered; BD-02 proposed |
| 7 | **06 Backstage Control Plane** | Surfaces every other subsystem's contracts (run APIs, streams, approvals, memory UI, settings). Doing it last resolves the most `[CONTRACT-STUB]`s against already-drafted contracts. | SD-04 answered; BD-06 proposed |

After pass 3, run the ADR_BATCH mode once for BD-01 through BD-05 and BD-08 before passes 4-7. That way the remaining passes link to proposed ADRs instead of multiplying `PROP-###` entries. Run a final ADR_BATCH and then AUDIT after pass 7.
