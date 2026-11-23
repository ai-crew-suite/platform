# Discovery: 07 - Cross-Cutting NFRs, Security, Observability & Testing

This staging file collects all raw research and design notes related to system-wide non-functional requirements, including secrets management, payload encryption, Langfuse and OpenTelemetry observability, caching and resilience, offline agent evaluation suites, testing harnesses, and enterprise coding standards. All notes captured here define horizontal quality gates and operational rules enforced across subsystems 01 through 06.

### Structured Token Usage & Cost Observability
<!-- Source: incoming/_AGENT_Q_AND_A.md (Question 1) -->

* **v1 Shortcoming (Unstructured Event Blobs):** In v1, `usage` events are persisted only as unstructured JSON rows inside `SqlAgentRuntimeStore` (`appendRunStep`) alongside OpenTelemetry span attributes (`ai.usage.input`, `ai.usage.output`, `ai.usage.total`). Nothing aggregates usage across runs, agents, models, or teams, and no dollar cost is computed.
* **Hard Constraint — Structured Usage Persistence (`UsageSink`):** The new runtime store must expose a first-class `UsageSink` contract backed by a dedicated, queryable `usage_records` table (rather than scraping step event logs).
* **Required Schema Fields:** Every usage record must capture `runId`, `agentId`, `workflowRef`, `node` (required per `AgentEvent` v2), `modelRef`, `input` tokens, `output` tokens, `total` tokens, and `createdAt`.
* **Config-Driven Pricing Model:** Maintain a `modelRef -> $/1K input/output tokens` pricing map in platform configuration. Compute dollar spend at query time rather than denormalizing `costUsd` at write time so historical usage can be repriced when provider rates change.
* **Future Consumer Readiness:** Design the `usage_records` schema and query surface to feed a dedicated Backstage observability/cost-insights plugin (`plugin-ai-observability`) for spend breakdowns, token efficiency ratios, and budget-burn alerts.

### Configurable Redaction Policy & Credential Value Scanning
<!-- Source: incoming/_AGENT_Q_AND_A.md (Question 2) -->

* **v1 Shortcomings (Hardcoded & Key-Only):** In v1, `SENSITIVE_KEYS` is a hardcoded array (`authorization`, `token`, `apikey`, `api_key`, `secret`, `password`, `cookie`) checked via case-insensitive key-name substring matching. Neither `config.d.ts` nor the runtime store exposes configuration to customize patterns, and secrets embedded inside innocuous value fields (e.g., `notes: "ghp_abc123..."`) pass through unredacted.
* **Hard Constraint — `RedactionPolicy` Contract:** Core must define a `RedactionPolicy` interface supporting:
  * `keyPatterns: RegExp[]` for key-name matching (covering all v1 baseline keys).
  * `valuePatterns: RegExp[]` for scanning payload values against credential-shaped formats (e.g., GitHub tokens, AWS keys, JWTs).
  * `mode: 'redact' | 'reject'` to either mask matched data (`[REDACTED]`) or hard-fail persistence.
* **Append-Only Security Floor:** Platform configuration (`ai.redaction.*`) must ship with secure built-in defaults. Operators may *append* custom organizational key or value regexes, but must **not** be able to disable or remove the built-in baseline patterns ("widen, never weaken").
* **Boundary Enforcement:** The execution harness must enforce the active `RedactionPolicy` across all state-patch, run-event, and checkpoint serialization boundaries.

### Driver Contract Testing, Scaffolding & Governance Gates
<!-- Source: incoming/_AGENT_Q_AND_A.md (Section 4) -->

* **Reusable Driver Contract Test Harness:** `core-node` `test-utils` must export `defineDriverContractTests<TDriver>({ makeDriver, category })`, a standardized Vitest suite every capability and driver module must pass to verify contract-shaped outputs, non-empty `providerId`, typed `limitations` degradation, and zero provider-type leakage.
* **Monorepo Scaffolding (`backstage-cli`):** Extend `@backstage/cli-node` with a custom CLI module (`new-extension-category-plugin`) using Handlebars templates to scaffold new capability categories, extension points, and contract-test wiring so following the standard pattern is faster than ad-hoc shortcuts.
* **Core-Node PR Governance Checklist:**
  * **New Category:** Requires new driver contract + extension point in `core-node` (justified core PR).
  * **New Provider for Existing Category:** Must be implemented purely as an external/sibling driver module; any required `core-node` change is treated as a contract generalization defect.
  * **New Write Operation:** Requires contract update, `effect: 'write'` classification, and approval-policy verification.

### Query-Time Cost Computation & Pricing Map Design
<!-- Source: incoming/_AGENT_Q_AND_A.md (Usage Table Add) -->

* **Store Raw Token Counts Only:** The `usage_records` table must persist raw `input` and `output` token counts per `modelRef` and **not** denormalize a `costUsd` column at write time.
* **Query-Time Spend Calculation:** Dollar spend (`costUsd`) must be computed dynamically at query time using a config-driven pricing map (`modelRef -> $/1K input and output tokens`). Computing cost at query time ensures historical usage data can be accurately repriced retroactively whenever LLM provider rates change or pricing corrections are applied.

### Code-Enforced Security Boundaries & Trace-Driven Eval Suites
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Security & Evaluation Blind Spots) -->

* **Zero Prompt-Based Security Assumptions:** Security and safety invariants (preventing destructive mutations, unauthorized resource access, or credential exfiltration) must **never** rely on system prompt instructions (e.g., `"Never delete files or leak API keys"`), which are vulnerable to prompt injection and hallucination. All security boundaries must be enforced deterministically in code via RBAC policies, approval gates, sandboxing/container isolation, and redaction filters.
* **Full Trace Capture for Failure Replay:** Every agent run must emit complete, structured execution traces (inputs, tool calls, errors, token/auth state, and intermediate steps) so production failures can be inspected and reproduced deterministically.
* **Adversarial & Failure-Mode Eval Datasets:** Offline evaluation suites must go beyond clean happy-path prompts to include adversarial and degraded-state scenarios—specifically malformed inputs, expired authentication tokens, partially completed workflows, and ambiguous multi-turn follow-ups—continuously harvested from real production failure traces.

### Subprocess Lifecycle & Orphan Process Prevention
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Tool & Execution Blind Spots) -->

* **Bounded Subprocess Execution:** Every spawned child process across tools and workers must run inside an isolated process group with a mandatory wall-clock timeout and deterministic `SIGKILL` cleanup on expiry to prevent hung Temporal activities or zombie process leaks.

### Per-Workflow Token Economics & Runaway-Loop Kill Switches
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Maintenance & Upgrade Traps) -->

* **Granular Cost Attribution Across Foreground & Background Tasks:** Token usage and Langfuse/OpenTelemetry traces must be tagged by `workflowRef`, `sessionId`, and task `purpose` (including background cron workflows and internal memory-compaction jobs) so operators can audit unit economics per workflow rather than only seeing aggregate monthly API bills.
* **Automated Budget Kill Switches:** The observability and runtime layers must support per-workflow and per-schedule token/spend thresholds capable of automatically terminating or circuit-breaking expensive background or runaway summarization loops early.

### Tiered Output Verification & Step-Granular Observability
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Core Best Practices for Agent Design) -->

* **Two-Tier Output Verification (Never Rely on Self-Grading Alone):** Both runtime guardrails and offline evaluation harnesses must verify agent outputs using a tiered pipeline:
  1. **Tier 1 — Fast Deterministic Checks:** Validate JSON/Zod schemas, syntax, file/resource existence, and invariants in pure code first.
  2. **Tier 2 — LLM-as-a-Judge:** Use a smaller, dedicated judge model strictly for subjective quality criteria (e.g., completeness, tone, policy adherence) only after deterministic checks pass.
* **Step-Granular Execution Tracing:** Observability and run-step stores must record every LLM call, reasoning turn, and tool execution as distinct, correlated child spans/events under a parent `runId`—never collapsed into a single coarse run log—so token spikes and logic regressions can be pinpointed to the exact step.

### Reconciliation Platform Invariants, Budgets & Comparative Evals
<!-- Source: incoming/AGENT_RECONCILIATION_CONTROLLER_KAZI.md -->

* **Cross-Boundary Budget & Unknown-Cost Accounting:** Enforce aggregate limits across iterations, dispatches, wall-clock time, and dollar/token spend (`maxCostMicros`) spanning all retries and escalations. Treat unknown provider usage as `unknown` (never silently `0`) in admission and settlement ledgers.
* **Mandatory Platform Acceptance Test Matrix:** The platform test suite must verify ten core invariants:
  1. Empty predicate vectors cannot converge.
  2. `pass`, `fail`, `error`, and `unknown` are strictly distinct.
  3. A formerly passing `guard` predicate can detect regressions on later iterations.
  4. Repeated identical failing predicate sets trigger stuck termination.
  5. Activity retries and worker crashes do not reset budgets or duplicate publication.
  6. Any change to the candidate artifact invalidates prior evidence.
  7. Tampering with protected grader paths cannot produce a `pass`.
  8. Cross-tenant memory and artifact access is denied.
  9. Workflow cancellation deterministically terminates all child processes/containers.
  10. A live/deployment predicate cannot pass based on an agent's self-assertion alone.
* **Preregistered Comparative Evaluation Before Scaling:** Before expanding to parallel goals or automated publication, benchmark the goal reconciliation controller against the platform's direct-agent workflow on representative tasks using identical models, tools, isolation, and graders—measuring independently accepted *landed* changes, false-success rate, human supervision minutes, elapsed time, and total model/compute/review cost (including failed runs).

### Continuous Agent Evaluation Loop (Offline CI/CD & Online Production Evals)
<!-- Source: incoming/AGENT_EVALS.md -->

* **Two-Loop Evaluation Architecture:** Maintain a continuous feedback loop pairing **offline evals** (pre-merge/pre-deploy CI/CD gates) with **online evals** (asynchronous background scoring on live traffic) to catch regressions from prompt edits, model swaps, or tool schema updates.
* **Offline Eval Tooling & CI/CD Gating:** Standardize offline evaluation harnesses on **Promptfoo** and **DeepEval** integrated into Vitest/CI pipelines:
  * Run fast smoke suites on every pull request and full benchmark suites prior to release, blocking merges/deploys if pass rates fall below configured thresholds.
  * Assert both final output schemas/rubrics (via pinned LLM-as-a-judge models) and **execution trajectories** (verifying the agent invoked the expected tools in valid sequence with valid arguments).
* **Versioned Dataset Management:** Maintain structured datasets (`input`, `expectedOutput`, deterministic `context`/mocked RAG & permissions, and `assertions`) across three tiers:
  * **Golden Datasets:** 50–200 version-controlled core workflow and edge-case rows stored in Git/observability platforms.
  * **Synthetic Datasets:** Generated adversarial, typo, and phrasing-variation stress tests.
  * **Production-Harvested Datasets:** PII-scrubbed failure traces promoted from live traffic.
* **Online Production Evals & Failure-to-Dataset Flywheel:**
  * Sample a configurable percentage (e.g., 5–20%) of live traces asynchronously via OpenTelemetry GenAI semantic conventions (into Langfuse / Datadog LLM Observability) so deep quality checks (hallucination, faithfulness, task completion) add **zero user latency**.
  * Alert via Slack/PagerDuty when rolling faithfulness, tool-error rates, or latency breach thresholds, and provide a human-review workflow to promote low-scoring traces into offline golden datasets.

### Canonical `ErrorCode` Taxonomy Standard
<!-- Source: incoming/CODING_STANDARDS.md (Section A.1) -->

* **Typed Domain Error Taxonomy:** All subsystems (`01`–`06`) must classify failures using a single shared, strongly typed `ErrorCode` taxonomy (e.g., `invalid_input`, `not_found`, `conflict`, `not_allowed`, `tool_denied`, `budget_exceeded`) so downstream transport layers (HTTP controllers, SSE event streams, Temporal activity retries) can deterministically map status codes, retryability, and sanitized client payloads.

### Client-Facing Error Sanitization Standard
<!-- Source: incoming/CODING_STANDARDS.md (Section A.2) -->

* **Zero Stack Trace or Internal Leak Policy:** Transport boundaries (HTTP controllers, SSE streams, and webhook handlers) must never hand-craft `500` error payloads or serialize raw exception messages/stack traces to callers; all unexpected exceptions must route through the platform's centralized error-sanitizing middleware.

### OpenTelemetry Span Conventions & Telemetry vs. UI Error Separation
<!-- Source: incoming/CODING_STANDARDS.md (Section A.4) -->

* **Standardized `ai.node.*` Span Attributes:** All execution spans across the engine and runtime must record structured correlation attributes—specifically `runId`, `nodeId`, and `workflowId`—under the `ai.node.*` OpenTelemetry namespace.
* **Strict Separation of Observability and User Error Surfaces:** Infrastructure telemetry, retries, and background diagnostics must flow exclusively through OpenTelemetry/Langfuse pipelines and never be routed into user-facing error notification APIs.

### Lightweight Local Cooldowns Over Distributed Circuit Breakers
<!-- Source: incoming/CODING_STANDARDS.md (Section B.1) -->

* **No Complex Stateful or Distributed Circuit Breakers:** Do **not** build complex open/half-open/closed circuit-breaker state machines or introduce external distributed coordination state (e.g., Redis-backed breaker state) for provider throttling.
* **Standardized `hardening.*` Throttling Contract:** Protect against cascading downstream failures using local, in-process retry classification, exponential backoff, and failure-count-throttled cooldown windows driven by `hardening.maxRetries` and `hardening.retryBackoffMs`.

### Field-Level Checkpoint Payload Encryption Policy
<!-- Source: incoming/CODING_STANDARDS.md (Section C.2) -->

* **Encrypt Opaque `payload` Only (Preserve Queryable Metadata):** At-rest encryption for persisted checkpoints must apply **field-level encryption exclusively to the central `payload` column** (which holds prompts, tool/code execution evidence, and memory arrays).
* **Plaintext Operational & Retention Columns:** Keep indexable metadata columns (`runId`, `seq`, `nextNode`, `stateVersion`, `createdAt`) in queryable plaintext so operational routing, recovery queries, and compliance-driven retention purges execute efficiently without decrypting state blobs.

### Deterministic Test Fixtures & Byte-Identical Replay Verification
<!-- Source: incoming/CODING_STANDARDS.md (Section D.1) -->

* **Zero Live External Dependencies in Core Test Suites:** Engine execution, checkpoint resumption, and graph traversal tests must run strictly against structured, scripted test fixtures and deterministic fakes (e.g., `FakeChatModel`)—never against live LLM APIs or uncontrolled network endpoints.
* **Byte-Identical Replay Baseline Assertion:** Replay and resumption test suites must verify that re-executing historical event tracks produces a byte-identical state and event output compared to the recorded baseline before validating continuation paths.

### Lightweight Boundary Fault-Injection Testing Standard
<!-- Source: incoming/CODING_STANDARDS.md (Section D.2) -->

* **Inject Faults at Executor Seams Without Heavy Infrastructure:** Integration tests for resilience and error recovery must inject simulated failures directly at the `ToolExecutor` and `ModelExecutor` boundaries rather than spinning up heavy external orchestration infrastructure (e.g., full container clusters or live external services).
* **Mandatory Fault Scenarios & Assertions:** Fault-injection suites must explicitly simulate `429 Too Many Requests` rate limits, artificial `timeoutMs` expirations, and structurally malformed payloads to verify:
  * Accurate engine cancellation and terminal error state transitions.
  * Intact token/time budget accounting across failed attempts.
  * Safe checkpoint persistence and resumption after mid-run faults.

### FINRA / SOC-2 Non-Repudiation Audit Standard
<!-- Source: incoming/CODING_STANDARDS.md (Section E.1) -->

* **Non-Nullable Actor Attribution in All Audit Logs:** To satisfy FINRA and SOC-2 non-repudiation requirements, every workflow invocation, tool execution, memory mutation, and human approval event must record a non-nullable, cryptographically verified `UserRef` or Service Principal identifier—anonymous or unattributed audit entries are strictly prohibited.

### Separation of Duties & Anti-Self-Approval Compliance Control
<!-- Source: incoming/CODING_STANDARDS.md (Section E.2) -->

* **Mandatory Dual-Control / Non-Self-Approval Invariant:** For deployment and high-impact approval gates, the principal approving an execution step must not match the principal who initiated or authored the candidate change, enforced deterministically in code at the authorization boundary.

### Anti-IDOR Resource-Scoped Access Control Standard
<!-- Source: incoming/CODING_STANDARDS.md (Section E.3) -->

* **Zero Unverified Direct Object References:** Every API endpoint, SSE live-tail subscription, and artifact retrieval route accepting a `runId`, `checkpointId`, or `evidenceRef` must resolve the target resource's ownership/tenant scope and enforce resource-level permission checks prior to streaming or returning any payload.

### Structured Key-Value Logging Standard
<!-- Source: incoming/CODING_STANDARDS.md (Section F.1) -->

* **No String-Interpolated Context Identifiers:** Never embed correlation IDs (`runId`, `nodeId`, `workflowId`, `tenantId`) inside concatenated or template-literal log message strings.
* **Mandatory Structured Metadata Objects:** Always pass operational context as explicit top-level key-value metadata objects to the logger interface (e.g., `logger.info('Node execution started', { runId, nodeId, workflowId })`) so enterprise log aggregators (Elastic, Splunk, Datadog) automatically index fields for filtering and correlation.

### OpenTelemetry Standardization & Ban on Custom Tracing Hooks
<!-- Source: incoming/CODING_STANDARDS.md (Section F.2) -->

* **Standard OTel SDK & W3C Trace Propagation Only:** All distributed tracing and APM instrumentation across the platform must use the standard OpenTelemetry SDK and standard trace-context propagation headers.
* **Ban Bespoke Tracing Hooks & Callbacks:** Explicitly forbid custom event-tracing hooks, proprietary logging callbacks, or bespoke context-factory interfaces (such as `TracingPluginHook`) inside core packages.
* **Collector-Driven Enterprise Export:** Keep application code decoupled from vendor APM SDKs (Datadog, Dynatrace, New Relic, Tempo); rely on standard OpenTelemetry agents and Collectors to capture, scrub, transform, and route span signals externally.

### "Fail Boot, Not First Run" Operational Readiness Standard
<!-- Source: incoming/CODING_STANDARDS.md (Section G.1) -->

* **Zero Lazy Infrastructure Failures:** Critical runtime dependencies (database persistence, Temporal worker connection, and LLM gateway reachability) must be verified via active lightweight health probes during process startup rather than failing lazily when the first workflow run arrives.

### Enterprise Data-Retention & Compliance Purge Standard
<!-- Source: incoming/CODING_STANDARDS.md (Section G.2) -->

* **Mandatory Bounded Lifespans:** Every persisted execution artifact category (checkpoints, event logs, temporary tool spillover files) must be governed by an explicit, config-driven retention window with automated hard-delete enforcement rather than unbounded accumulation.

### Immutable Append-Only Audit Logging Standard (`AuditLogSink`)
<!-- Source: incoming/CODING_STANDARDS.md (Section H.1) -->

* **Append-Only Interface Contract (`AuditLogSink`):** Define an immutable, append-only `AuditLogSink` contract (exposing write/append operations only—no update or delete methods) to satisfy SOC-2, HIPAA, and FINRA non-repudiation requirements.
* **Mandatory Principal Attribution:** Every audit ledger record must carry a cryptographically verified, non-nullable `UserRef` or Service Principal identifier; unattributed audit writes must be rejected at the interface boundary.
* **WORM Storage Isolation:** Isolate compliance-grade immutable storage implementations (e.g., AWS S3 Object Lock, write-once partitions, WORM drives) inside external provider modules rather than core packages.

### Irreversible Egress Redaction & Ban on Re-Identification Vaults
<!-- Source: incoming/CODING_STANDARDS.md (Section H.2) -->

* **Irreversible PII/PHI Masking Before Egress:** To comply with HIPAA and enterprise data-privacy mandates, all Protected Health Information (PHI) and Personally Identifiable Information (PII) must be stripped or irreversibly masked (using static placeholders such as `[REDACTED]` or one-way hashes) before any payload crosses the network perimeter to external LLM providers.
* **Explicit Ban on Reversible Token Vaults:** Do **not** build reversible tokenization vaults, PII substitution tables, or re-identification storage systems. Keeping redaction strictly one-way eliminates re-identification breach risks and avoids maintaining an additional sensitive data store.

### Logical-Run Multi-Dimensional Budget Accounting (P2)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P2 - Bounded outer loop and honest stop reasons) -->

* **Aggregate Run Caps:** Enforce multi-dimensional resource caps per logical run covering iteration count, agent dispatches, total elapsed wall-clock milliseconds, and cumulative model/compute monetary spend (`over_budget` termination when any limit is reached).

### Sandbox Isolation Threat Model & Degraded-Isolation Auditing (P4)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P4 - Recovery-safe side effects, budgets, and provenance) -->

* **Worktrees Are Not Security Sandboxes:** A Git worktree or separate OS process provides workspace separation only—it does **not** enforce process, credential, filesystem, or network sandboxing. Untrusted code execution and verification must run inside hardened, resource- and network-restricted containers/sandboxes.
* **Record Degraded Isolation Explicitly:** Whenever full sandbox isolation is unavailable or degrades during setup, the platform must record a degraded-isolation flag in the run's evidence and audit metadata (and enforce policy gates on whether degraded execution is permitted).

### Projection-to-Telemetry Correlation & Pre-Scale Comparative Benchmarking (P5)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P5 - Operator-visible run history and outcome quality) -->

* **Correlate Run Projections with Traces & Metrics:** Link persistent run projection records (`runId`, `workflowId`, iteration counts, stop reasons) directly to OpenTelemetry traces and metrics so operators can measure end-to-end duration, activity retry rates, checker vs. agent failures, unknown provider usage, and human supervision time.
* **Preregistered Pre-Scale Evaluation Gate:** Do not assume the reconciliation controller is cheaper or more accurate than a single direct-agent run. Before scaling reconciliation to broad workloads or automated publication, run a controlled comparative evaluation against the direct-agent path using identical models, tools, isolation, verifiers, and review standards—measuring:
  1. Independently accepted landed outcomes.
  2. False-success rate (runs marked `converged` that fail human/downstream review).
  3. Total cost (models, compute, retries, and unknown usage).
  4. Wall-clock elapsed time and human supervision minutes.
  5. Crash/retry recovery behavior.

### Environment Provenance & Multi-Repository Authorization Controls (P9)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P9 - Reproducible execution environment profiles) -->

* **Evidence-to-Environment Auditability:** Every verification `Observation` must preserve the resolved environment digest so security reviewers can distinguish evidence generated in a hardened sandbox from evidence produced under degraded or custom setups.
* **Per-Repository Authorization Enforcement:** When a workflow declares multi-repository scope, enforce independent RBAC and token-broker authorization checks for **each** target repository prior to provisioning or mounting workspaces.

### Child-Run Zero-Trust Authorization & Provenance Audit (P10)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P10 - Bounded child-agent delegation) -->

* **No Implicit Authority Inheritance:** Spawning a child run must **not** grant unrestricted or inherited execution authority. Every child run must preserve the initiating `UserRef` or Service Principal identity and independently re-evaluate RBAC policies, tool allow-lists, and approval gates for every effect it attempts.
* **End-to-End Parent-Child Provenance:** Persist bidirectional parent-child lineage (`parentRunId`, `childRunId`, `depth`, and how child outcomes influenced parent decisions) in audit and trace records.

### Autonomous Schedule Governance & Anti-Proliferation Guardrails (P11)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P11 - User-managed schedules and automation history) -->

* **No Unbounded Self-Scheduled Background Jobs:** Agents must **never** be allowed to autonomously register arbitrary recurring background schedules without explicit human RBAC authorization and tenant quota checks.
* **Approved Contract Binding & Per-Tenant Schedule Quotas:** Every scheduled automation must bind to an approved agent or immutable goal revision, run under a verified `UserRef` or Service Principal, and respect tenant-level limits on active schedules, minimum recurrence intervals, and per-run budgets.

### Continuous Versioned Evaluation Suites & Revision Telemetry (P12)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P12 - Continuous evaluation and safe agent releases) -->

* **Separate Platform Eval Suites from Online Reconciliation Verifiers:** Maintain a dedicated, versioned offline evaluation suite for testing agent and workflow revisions—kept strictly distinct from the runtime predicate verifiers used inside individual goal reconciliation runs.
* **Mandatory Pre-Promotion Regression Replay:** Replay representative multi-turn scenarios and historical failure datasets whenever changes are proposed to:
  1. System instructions or prompt templates.
  2. Target LLM `modelRef` or provider configurations.
  3. Fluent workflow graph definitions.
  4. `ExecutionEnvironmentProfile` setups.
* **Traceable Feedback-to-Dataset Promotion:** Link operator and end-user feedback (thumbs-down, escalations, false-success reports) directly to their originating `runId` traces so real failures are scrubbed and promoted into regression datasets.
* **Revision- & Trigger-Segmented Operational Metrics:** Tag all quality, completion-rate, human-escalation rate, latency, and token/dollar cost metrics by both `agentRevision` and `triggerType` (interactive UI, API, webhook, schedule) to detect silent regressions after releases.

### Worker-Fleet Telemetry, Saturation Alerts & Recovery Runbooks (P16)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P16 - Worker-fleet operational controls) -->

* **Mandatory Worker & Queue Health Metrics:** Export OpenTelemetry metrics and configure operator alerts for:
  * Task-queue backlog depth and schedule-to-start lag (queue age).
  * Active worker count, build versions, and polling slot saturation.
  * Activity failure rates, retry spikes, and heartbeat timeouts.
  * Stalled/non-progressing workflow counts.
* **Documented Operator Recovery Playbooks:** Maintain explicit operational runbooks and tested administrative commands for recovering, draining, or safely terminating exhausted or abandoned workflow executions.

### Environment-Driven Credentials Policy & Pluggable Envelope Encryption
<!-- Source: incoming/SECRETS_MANAGEMENT.md -->

* **"Environment-Driven Credentials" Policy (No Vendor KMS SDKs in Core):** Do **not** embed third-party secret-manager or KMS client SDKs (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, Doppler, OpenBao) into core platform packages.
* **Infrastructure-Layer Secret Injection:** Application secrets must be injected into the Node.js runtime as environment variables at deployment time via standard cloud-native patterns (Kubernetes Secret `valueFrom`/`envFrom`, External Secrets Operator [ESO], HashiCorp Vault Agent, or CLI entrypoint wrappers), keeping application code completely agnostic to the underlying secret store.
* **At-Rest Checkpoint Envelope Encryption:** Pair environment-injected master keys with a pluggable `StateSerializer` seam so enterprises can supply cryptographic envelope serializers (e.g., AWS KMS) that encrypt sensitive checkpoint snapshots into opaque `Uint8Array` blobs before database persistence.

### Persistence Durability Tiers & Redis Startup Readiness Probes
<!-- Source: incoming/STORAGE_RUNTIME_README_PERSISTENT_STATE.md -->

* **Compliance Records Must Use Durable SQL:** Runs, approvals, artifact references, and audit logs (`RunStore`, `ArtifactSink`, `AuditLogSink`) are compliance-relevant systems of record and must always persist to durable SQL storage—never volatile or TTL-evicting stores.
* **Redis Boot-Time Ping & TLS Support:** When Redis is enabled for sessions or checkpoints, support `rediss://` TLS connections and execute a live Redis `PING` during backend startup so misconfigurations or network blocks fail boot immediately rather than failing on the first agent run.

### Boot-First Worker OTel Instrumentation & Container Hardening
<!-- Source: incoming/TEMPORAL_WORKER.md -->

* **Pre-Load OpenTelemetry SDK Initialization (`instrumentation.ts`):** The worker process must initialize the OpenTelemetry Node SDK (`@opentelemetry/sdk-node` + OTLP gRPC exporter) **before** importing application or framework modules so auto-instrumentation hooks capture outbound HTTP/gRPC spans from boot.
* **Temporal W3C Trace Propagation Interceptors:** Register `OpenTelemetryInboundInterceptor` and `OpenTelemetryOutboundInterceptor` on the Temporal Worker so distributed trace context stitches seamlessly from Backstage HTTP requests through Temporal workflow scheduling into worker activities.
* **Non-Root Production Worker Container:** Build worker images using multi-stage Dockerfiles that strip dev dependencies and execute under an unprivileged non-root UID (`USER 1001`).

### Outbound-Only Worker Perimeter Isolation
<!-- Source: incoming/TEMPORAL_WORKERS_AND_SCHEDULES.md -->

* **Zero Inbound Access from Temporal Service to Private Infrastructure:** Because Temporal Workers poll Task Queues over outbound gRPC connections, workers must reside inside the private network perimeter alongside internal databases, secret mounts, and tool endpoints—ensuring the central Temporal Service never requires inbound network access or credentials to private resources.

### Post-Boot Tool Registry Immutability Gate (`.freeze()`)
<!-- Source: incoming/TOOL_REGISTRY_AND_STATE_SERIALIZER_IMPLEMENTATION_PLAN.md -->

* **Seal Active Tool Map After Startup:** Once the Backstage extension registration phase finishes, call `.freeze()` on the active `InMemoryToolRegistry` so any attempt to register, overwrite, or inject unverified tools at runtime throws an immediate `ConflictError` security violation.
* **Audited Registry Registration & Lookup Telemetry:** Emit structured log metadata (`{ toolId, totalRegisteredTools }`) on registration, freeze, and lookup misses to support compliance audits.

### High-Concurrency Scale & Upstream Rate-Limit Caching
<!-- Source: incoming/TOOLS_INTERFACE.md -->

* **Multi-Thousand Concurrent Developer Scale:** Architecture, worker concurrency, and connection pooling must support several thousand active developers interacting with Backstage agent workflows concurrently without bottlenecking HTTP threads or exhausting downstream API quotas.
* **Rate-Limit-Aware Caching & Request Coalescing:** Implement a tenant- and credential-scoped caching/coalescing layer in front of read-heavy external provider drivers (`scm`, `observability`, `finops`, `scorecards`) with TTLs, cache-key isolation by caller/org scope, and `429 Retry-After` backoff coordination to prevent upstream rate limiting.

### Pending Compliance Sign-Offs (Token Vault, Approval Policy & Regulated Cache)
<!-- Source: incoming/TOOLS_INTERFACE_OPTIONS.md (Open Questions) -->

* **Compliance Sign-Off Items:** Before finalizing production security controls, obtain explicit architectural decisions on: (a) KMS-backed server-side refresh token persistence in the Token Broker, (b) external policy engine (OPA/Cedar) vs. Backstage Permission Framework ownership for write approvals, and (c) L2 Redis cache prohibition vs. short-TTL policy for `dataClass: 'regulated'` payloads.

### Tamper-Evident Audit Records, PHI Data-Class Rules & Multi-Tenant Isolation
<!-- Source: incoming/TOOLS_INTERFACE_OPTIONS.md (Sections 2.2, 2.6, 2.9, 3) -->

* **Write Intent Proof vs. Read Metadata-Only Audit Rule:** Every capability call must emit a structured record to an append-only audit sink (optionally hash-chained / signed via DSSE `@sigstore/sign` for tamper evidence):
  * *Writes:* Persist the exact resolved `HttpIntent` (method, path, redacted body) plus both model-proposed and gateway-substituted `context` slots as proof of what was executed.
  * *Reads:* Persist metadata only (who, standing, capability, provider instance, target, redacted input digest, policy decision, HTTP status, latency, cache hit/miss, `runId`, `workflowId`)—never raw response payloads (mandatory for PHI/regulated data).
* **HIPAA `dataClass: 'regulated'` Cache & Storage Controls:** Disable L2 Redis caching for `regulated` capabilities (L1-only with strict TTL caps or uncached), enforce encrypted Temporal `PayloadCodec` serialization, and store large payloads via claim-check references with retention purging.
* **Architecture Lint Gate Against Driver Network Imports:** Enforce automated lint/architecture tests (`dependency-cruiser` / ESLint) prohibiting REST drivers from importing `fetch`, `axios`, `http`, `https`, or `net` directly so all egress is structurally forced through the central `HttpConnector`.

### Unified Observability: OpenTelemetry + Langfuse Bridge & Pre-Ingestion Redaction
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 2: Opaque Failure Points) -->

LLM tracing alone (e.g., Langfuse) is insufficient for an enterprise Backstage IDP because failures frequently span prompt reasoning, memory retrieval drift, and downstream infrastructure APIs (Scaffolder, Kubernetes, CI/CD). The platform bridges LLM telemetry with infrastructure APM under strict compliance controls:

1. **W3C `traceparent` Context Propagation:**
   - Bridge Vercel AI SDK / Langfuse traces with Backstage's native OpenTelemetry SDK so every agent step shares a single distributed `traceId`.
   - Inject the active W3C `traceparent` header into all outbound Temporal Activity calls, `CapabilityGateway` HTTP intents, and Backstage Scaffolder/Catalog requests so engineers can pivot directly from an LLM tool span to downstream microservice logs in Datadog, Grafana, or Jaeger.
2. **Pre-Ingestion Secret & Regulated Data Redaction:**
   - All telemetry exporters (OTel collector and Langfuse SDK masking callbacks) must pass payloads through a mandatory pre-egress scrubbing filter that strips bearer tokens, GitHub PATs, Kubernetes secrets, `ENV` credentials, and regulated PII/PHI *before* traces leave the runtime boundary.
   - For HIPAA/FINRA workloads, Langfuse must run as a self-hosted deployment within the compliant network boundary rather than an external multi-tenant SaaS endpoint.
3. **Mandatory Backstage Identity & Correlation Tagging:**
   - Attach canonical metadata attributes to every root trace, child span, and `LoggerService` entry: `userEntityRef` (authenticated caller), `catalogEntityRef` (target software component), `workflowId`, `runId`, `nodeId`, `subsystem` (`gateway`, `tools`, `memory`, `reasoning`), and `pluginVersion`.
   - Surface trace deep-links in the Backstage run detail UI for one-click post-mortem inspection.

### Sandbox Network Containment & Skill Supply-Chain Security Gates
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 11: System-Level Blast Radius) -->

Sandboxed execution environments and GitOps-managed skill bundles are treated as untrusted workloads governed by network and supply-chain controls:

- **Kubernetes `NetworkPolicy` & Egress Proxy Allowlisting:**
  - Deny all ingress and block all egress to internal RFC1918 networks, cluster services, databases, and cloud instance metadata endpoints (`169.254.169.254`).
  - Route permitted outbound traffic strictly through an authenticating HTTP/HTTPS egress proxy (Envoy/Squid) enforcing explicit domain allowlists (e.g., approved Git hosts and internal artifact registries).
- **Signed & Static-Analyzed Skill Bundles:**
  - Treat all skill Markdown files and helper scripts as production code. Require signed commits / DSSE attestations and mandatory CI security gates (Semgrep, Gitleaks) blocking raw `curl | bash`, dynamic `eval`, and unapproved binary invocations before the Backstage Catalog processor indexes a skill bundle.

### Per-Entity & Per-Team Token Budgets and Crash-Loop Circuit Breakers
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 15: Idle Token Burn) -->

To prevent a noisy or crash-looping microservice from exhausting LLM quotas via repeated webhook or alert triggers:

- **Synchronous Redis Quota Ledger:** Track cumulative prompt/completion tokens and dollar spend per sliding window (hourly/daily) in atomic Redis counters keyed by `(tenantId, ownerGroupRef, catalogEntityRef)`.
- **Automatic Circuit Breaker & Digest Rollup:** When background spend for a `catalogEntityRef` exceeds its configured threshold, trip an automated circuit breaker that pauses further autonomous LLM runs for that entity, coalesces incoming alerts into a single summary digest, and notifies the owning team via `@backstage/plugin-notifications`.

### Threshold-Based Alert Escalation, Dead-Man's Switch & Scrubbed Failure Diagnostics
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 21: Silent Failures in Background Tasks) -->

To prevent alert fatigue from transient overnight blips while guaranteeing rapid detection of broken background automations:

- **Threshold-Based Escalation Policy:**
  - **1st Transient Failure:** Emit structured OTel/Langfuse failure telemetry and `AuditLogSink` record; allow Temporal to retry without paging humans.
  - **3rd Consecutive Failure (or Immediate Non-Retryable Auth/Config Error):** Escalate immediately to the owning team via `@backstage/plugin-notifications` (in-app + Slack DM/channel).
- **Scrubbed Self-Diagnostic Failure Summary:**
  - Before dispatching a failure notification, pass the **secret- and PII-redacted** error trace and last 3 tool spans through a fast triage model (`generateObject` with Zod schema `{ plainEnglishCause, affectedEntity, suggestedFix }`) so on-call engineers receive an actionable diagnosis rather than raw stack traces.
- **Dead-Man's Switch Monitoring:**
  - Configure Alertmanager / PagerDuty rules on `backstage_agent_job_last_success_timestamp` to page platform operations whenever a scheduled job misses its expected check-in window.

### Distributed Parent-Child Span Correlation Across Sub-Agents
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 22: Sub-Agent Delegation and Context Isolation) -->

- **Unified Trace Tree:** Propagate the parent workflow's W3C `traceparent` and Langfuse `traceId` into every Temporal Child Workflow and sub-agent activity so multi-agent fan-out runs render as a single nested span hierarchy with rolled-up token and latency metrics.

### Model Data-Residency, Zero-Data-Retention (ZDR) & Resolved-Provider Telemetry
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 25: Model Lock-In and Fallback Routing) -->

- **Compliance-Gated Failover Routing:** Every model route in `ModelRegistry` declares mandatory governance attributes (`region`, `zdrApproved`, `hipaaBaaEligible`, `maxDataClassification`), restricting failover strictly to approved enterprise endpoints (e.g., AWS Bedrock, Azure OpenAI, Google Vertex AI, or VPC-hosted vLLM) matching the tenant's compliance tier.
- **Resolved-Provider Cost & SLA Attribution:** Record the *actual resolved* `providerId`, `modelId`, `fallbackDepth`, prompt/completion token counts, and latency on every OTel/Langfuse generation span so platform operators can detect silent cost shifts or vendor degradation during failovers.

### CI Validation & Security Gates for Agent-Authored Skill PRs
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 26: Self-Inflicted Regressions) -->

Every `agent-skill/*` Pull Request must pass three automated CI gates before merge or Backstage Catalog indexing:

1. **Zod Schema & Frontmatter Linting:** Validates YAML frontmatter, declared `requiredCapabilities` (confirming only registered, allowed tools are referenced), and cron expressions.
2. **Static Security & Prompt-Injection Scan:** Runs Semgrep, Gitleaks, and prompt-injection heuristics to block embedded override instructions, hardcoded secrets, `curl | bash`, or `eval` patterns.
3. **Synthetic Sandbox Dry-Run Replay:** Executes a deterministic smoke test inside an ephemeral sandbox (`sandbox-execution-queue`) to verify clean parsing and execution before deployment.

### Dual Static + Semantic "Tool-Poisoning" CI Audit & DSSE Attestation
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 27: Supply-Chain Risk in Third-Party Skills) -->

Before any third-party skill bundle or MCP server image is admitted to the internal registry or indexed by Backstage Catalog, CI runs a two-stage security gate:

1. **Static Code, Secret & Container Audit:** Executes Semgrep, Gitleaks, Trivy container/CVE scanning, and lockfile verification on all helper scripts and MCP Dockerfiles.
2. **Semantic LLM "Tool-Poisoning" Audit (`generateObject`):** Passes the raw `SKILL.md` instructions and every MCP tool `name`, `description`, and JSON parameter description through an isolated security-auditor model to flag hidden prompt overrides, cross-tool exfiltration instructions, or credential-harvesting parameters, issuing a verifiable **DSSE attestation** upon approval.

### Two-Tier CI/CD Regression & Evaluation Pipeline (Replay + Golden Datasets)
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 32: Regression Testing Across Prompt and Model Updates) -->

Prompt edits, skill updates, and model version bumps can silently break tool-calling schemas, HITL approval gates, or cross-tenant isolation. Every change is gated by a two-tier evaluation pipeline:

1. **Tier 1 — Deterministic Replay & Contract Tests (Every PR, Zero LLM Cost):**
   - **Temporal History Replay (`@temporalio/testing`):** Run `Worker.runReplayHistory()` in CI against scrubbed production Temporal event histories to mathematically prove code changes introduce zero `NonDeterminismError` regressions for in-flight workflows.
   - **Mocked-Model Contract Suites (`Vitest` + Vercel AI SDK `MockLanguageModel`):** Replay scripted tool-call trajectories to verify RBAC filters, Zod schemas, secret redactors, taint escalation, and HITL gates deterministically.
2. **Tier 2 — Curated Golden Dataset Matrix (Prompt, Skill & Model-Registry Gate):**
   - **Sanitized Trace Harvesting:** Scrub secrets, tokens, and PII/PHI from edge-case production traces before promoting them into curated **Promptfoo / DeepEval / Langfuse** evaluation datasets (`golden-core-workflows`, `security-red-team`, `skill-routing`).
   - **Multi-Provider Failover Matrix:** Run the Golden Dataset across **every configured provider** in the target `ModelRegistry` fallback chain whenever prompts, `SKILL.md` bundles, or model mappings change.
   - **Three-Layer Grading Assertions:**
     1. *Deterministic Trajectory Assertions:* Verifies `ask_clarification` invocation on ambiguous inputs, `WRITE_HIGH` HITL gating, and strict ISO-8601 offset dates.
     2. *Deterministic Security Invariants:* Verifies canary secrets never leak and unauthorized tools are never invoked under indirect prompt-injection tests.
     3. *LLM-as-a-Judge (`generateObject`):* Pinned judge model scores semantic accuracy and anti-sycophancy against reference outcomes.
3. **Canary & Read-Only Shadow Rollouts:**
   - Gate new prompt or model versions behind Backstage Feature Flags (5% canary cohort) or asynchronous Temporal Child Workflow shadow replays executing strictly in **read-only / `dryRun`-stubbed** mode (zero real mutations) while comparing cost, latency, and eval scores against baseline.

### Regulated Data Routing, Mem0 Backend Policy & Architecture Import Lint Gates
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 33: Vendor-Locked State and Migration Pain) -->

- **Policy-Gated Mem0 Backend Selection:** Support both self-hosted OSS and the managed Mem0 Platform API. Keep OSS data and its vector index inside the configured customer-controlled infrastructure. Permit the managed API only for tenant/data-class combinations whose region, contract, retention, and provider controls have been reviewed and approved; otherwise route to an approved self-hosted backend or fail closed. Do not claim that either mode automatically satisfies every compliance regime.
- **Independent Platform Persistence:** Session transcripts, audit records, and artifact blobs remain in platform-controlled stores regardless of the Mem0 backend. Mem0 is a derived memory service, not the authority for platform identity, authorization, retention decisions, or audit.
- **Storage Adapter Boundary Lint Gate:** Enforce CI architecture lint rules (ESLint `no-restricted-imports` / dependency-cruiser) prohibiting workflow definitions, reasoning modules, and Backstage HTTP controllers from importing `mem0ai`, vector DB clients, or cloud storage SDKs directly outside the designated storage adapter package.

### Pre-Persistence DLP Scrubbing, Multi-Store Retention Matrix & Compliance Audit Separation
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 34: Data Retention and Sensitive Content Scrubbing) -->

Because agent data spans four persistence layers (Temporal event histories, PostgreSQL/Mem0, OTel/Langfuse telemetry, and S3/GCS artifact storage), sensitive data must be scrubbed at ingestion and governed by coordinated lifecycle TTLs:

1. **Mandatory Pre-Persistence DLP Sanitizer:**
   - Every capability return path runs a synchronous DLP filter *before* returning data to Temporal (whose event history is immutable) or emitting telemetry spans:
     - **Secret & Entropy Detection:** Gitleaks/TruffleHog regex patterns + Shannon entropy checks masking AWS keys, GitHub PATs, JWTs, private keys, and DB URIs (`[REDACTED_SECRET]`).
     - **PII / PHI Masking:** Presidio / structured regex detectors masking emails, SSNs, payment tokens, and session cookies (`[REDACTED_PII]`).
2. **Coordinated Tiered Retention Matrix:**
   - **Sandbox Volumes & `ArtifactSink` Scratch Blobs:** `24 hours` (enforced via S3/GCS Object Lifecycle rules and ephemeral sandbox teardown).
   - **Temporal Closed Workflow Histories:** `7–30 days` (configured via Temporal Namespace retention period + KMS-encrypted `DataConverter`).
   - **OTel / Langfuse Raw Trace Payloads:** `30 days` (retaining aggregated, non-PII token/latency metrics longer).
   - **Canonical Session Transcripts (`SessionStore`):** `90 days` active, purged thereafter while preserving a metadata-only audit stub.
   - **Mem0 Distilled Memories (`MemoryStore`):** `180 days` rolling `expiresAt` TTL, refreshed only when retrieved and confirmed useful.
3. **Metadata-Only Tamper-Evident `AuditLogSink` (1–7 Year Compliance Retention):**
   - Separate `AuditLogSink` completely from conversational payloads. Record structured security metadata only (`tenantId`, `actorUserRef`, `targetEntityRef`, `capabilityId`, `riskTier`, `approverUserRef`, `decision`, `timestamp`, `digest`) with zero raw prompts or tool outputs—satisfying 1–7 year SOC-2, HIPAA, and FINRA (WORM/Object-Lock) audit mandates while aggressively purging raw text every 30–90 days.
4. **Automated Offboarding & Right-to-be-Forgotten Cascading Erasure:**
   - Subscribe to Backstage Catalog `User` deletion events (`catalog.entity.deleted`) to trigger immediate cascading erasure of the departing user's `userId`-scoped Mem0 records, encrypted Playwright `storageState`, and active session transcripts across all stores.

### Out-of-Band Financial Spend Caps, FinOps Velocity Breakers & Cost Chargeback
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 41: Financial Spend Caps and Runaway Loops) -->

Financial exposure spans both direct LLM token burn and agent-triggered cloud infrastructure provisioning. Hard circuit breakers execute completely outside the LLM context window:

1. **Four-Level Atomic Token & Spend Cap Hierarchy (Redis Lua Reserve/Settle):**
   - Enforce pre-call budget reservation and post-call settlement via atomic Redis Lua scripts prefixed by `tenantId`:
     - **Per-Run Cap (`tenant:${tenantId}:budget:run:${runId}`):** Hard dollar ceiling per workflow (e.g., `$0.50` interactive, `$2.00` background investigation)—auto-downgrading to `fast-triage-tier` at `80%` utilization and halting cleanly at `100%`.
     - **Per-User Rolling Cap (`user:${userEntityRef}`):** Hourly/daily developer ceiling (e.g., `$15/day`) preventing a single runaway script from exhausting org quotas.
     - **Per-Team / Catalog Owner Cap (`owner:${ownerGroupRef}`):** Group-level quota aligned with Backstage `spec.owner` chargeback pools.
     - **Provider-Level Hard Billing Limits:** Enforce hard monthly dollar limits directly inside AWS Bedrock, Azure OpenAI, Google Vertex AI, and enterprise provider accounts as an external backstop.
2. **FinOps Velocity Anomaly Circuit Breaker (`> 5x` Spike Detection):**
   - Track rolling 5-minute spend velocity per tenant and owner group in Redis. If spend exceeds `5x` its 7-day rolling baseline, automatically trip a global FinOps circuit breaker that pauses `agent-background` queues while preserving interactive developer sessions and alerting platform admins.
3. **Backstage Cost Insights Chargeback Attribution:**
   - Stamp every OTel/Langfuse span and Redis spend record with `tenantId`, `userEntityRef`, `ownerGroupRef`, `catalogEntityRef`, and `workflowType` to feed Backstage FinOps / Cost Insights dashboards.

### ToS Compliance & Egress Proxy Domain Restrictions
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 42: Third-Party Terms of Service and Bot Bans) -->

- **Proxy-Level ToS Enforcement:** Pair `CapabilityGateway` domain allowlists with Envoy/Squid egress proxy rules blocking automated scraping of ToS-restricted public portals and enforcing per-domain rate ceilings to protect corporate egress IPs and SaaS tenant standing.

### Non-Repudiable Communication Audit Records (`AuditLogSink`)
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 43: Liability and Impersonation Boundaries) -->

- **Cryptographic Non-Repudiation:** Every external or multi-party communication records an immutable entry in `AuditLogSink` capturing `tenantId`, `workflowId`, `runId`, `triggeringUserRef`, `approverUserRef`, `executionIdentity` (`'bot' | 'obo'`), `recipientDomain` / `recipientHash`, `templateId` (if templated), `contentSha256`, and `timestamp`—satisfying FINRA/SOC-2 non-repudiation requirements without storing unredacted PII in metadata columns.

### Independent Out-of-Band SRE Alerting & Break-Glass Audit Trail
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 45: Out-of-Band Disaster Recovery ("Break Glass")) -->

- **Decoupled SRE Alerting Channel:** Route break-glass activations, FinOps velocity breaker trips, and Dead-Man's Switch misses directly to an independent PagerDuty service and `#platform-agent-alerts` Slack webhook that bypasses the agent's own notification workflows entirely.
- **Immutable Break-Glass Audit Entries:** Every kill-switch toggle, safe-boot override, and emergency credential revocation writes a non-repudiable record to `AuditLogSink` capturing the acting SRE principal, scope, reason, and timestamp.

### Ephemeral RAM-Only Audio Processing & STT Transcript DLP Scrubbing
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 46: Voice, Audio, and Real-Time Interruption) -->

- **Zero Raw Voice Recording Persistence:** Discard raw PCM/Opus audio buffers immediately in volatile memory upon Speech-to-Text transcription—never persisting employee or customer voice recordings to S3/GCS or PostgreSQL.
- **Pre-Persistence STT Scrubbing:** Route all transcribed voice utterances through the synchronous DLP secret and PII/PHI redaction filter before writing to `SessionStore`, `AuditLogSink`, or OTel/Langfuse telemetry.

### Four-Stage "OS Migration" Model Rollout Protocol
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 47: Prompt and Skill Decay Across Model Generations) -->

Every primary model tier upgrade follows a four-stage migration gate rather than a drop-in config swap:

1. **Offline Golden Dataset Regression Matrix:** Benchmark candidate model against the incumbent baseline across tool-call accuracy, false-refusal rate, token verbosity, and latency.
2. **Legacy Scaffolding Pruning Pass:** Explicitly test removing obsolete `CRITICAL` prompt workarounds tuned for prior model generations.
3. **Asynchronous `5%` Read-Only Shadow Replay:** Run a background Temporal Child Workflow replaying `5%` of live traffic against the candidate model with `CapabilityGateway` strictly in read-only / `dryRun`-stubbed mode, scoring divergence in OTel/Langfuse.
4. **Feature-Flagged Canary (`10% -> 50% -> 100%`):** Roll out gradually via `@backstage/plugin-feature-flags` with the prior model endpoint kept warm for instant one-click rollback, tagging every span with `(promptVersion, skillGitSha, resolvedModelId)`.

### Cross-Store Point-in-Time Recovery (PITR), WORM Backups & Monthly DR Restore Drills
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 48: Backup Verification and Restore Drills) -->

Because platform state spans PostgreSQL (Backstage Catalog, `SessionStore`, `AuditLogSink`, `agent_memories_canonical`), Temporal Persistence, GitOps skill repos, KMS/Vault envelope keys, and S3/GCS artifact storage, backup integrity requires synchronized recovery and automated clean-room verification:

1. **Synchronized PostgreSQL WAL / PITR Archiving:**
   - Enable continuous WAL archiving across Backstage, Temporal, and Memory PostgreSQL clusters so all databases restore to an exact synchronized `recovery_target_time` without cross-store skew or mid-write corruption.
2. **Cross-Account Immutable Backup Storage (S3 Object Lock / WORM):**
   - Ship WAL archives and backup snapshots to a dedicated, isolated cloud account with **S3 Object Lock (Compliance/Governance mode)** enabled, preventing compromised cluster credentials or runaway agents from deleting historical recovery points.
3. **Synchronized `DataConverter` Key Retention:**
   - Retain historical KMS / HashiCorp Vault envelope encryption key versions for the full backup retention lifecycle so restored Temporal histories and encrypted artifacts remain decryptable.
4. **Automated Monthly Clean-Room DR Drill (`backstage-dr-drill`):**
   - Schedule a monthly automated restore verification pipeline that spins up an isolated, ephemeral Kubernetes namespace (`backstage-dr-drill`) with a **deny-all external egress `NetworkPolicy`** (preventing real Slack, GitHub, or webhook side effects):
     1. Restores PostgreSQL PITR snapshots to a synchronized target timestamp and checks out the pinned GitOps skill commit SHA.
     2. Boots Backstage and Temporal workers in `READ_ONLY_SAFE_MODE` and verifies `DataConverter` decryption of active/paused workflows.
     3. Drops derived vector indexes and executes `rebuildVectorIndexFromCanonicalSql` from scratch.
     4. Runs smoke assertions across restored Temporal Schedules and read-only queries, tears down the namespace, and publishes measured **`RTO` and `RPO` SLA metrics** to `#platform-agent-alerts`.

### Multi-Tenant Sovereign Routing & End-to-End Pipeline Compliance
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 50: Multi-Tenant Data Residency & Enterprise AI Governance (Zero Data Retention / Sovereign Routing)) -->

- **Full-Pipeline Sovereign Enforcement:** Catalog-derived residency and ZDR constraints apply uniformly across **all** model invocations in the pipeline—primary reasoning LLMs, triage/judge classifiers, Mem0 fact-extraction models, vector embedders, and cross-encoder rerankers—ensuring regulated payloads never cross geographic or contractual compliance boundaries.
- **Audit Attribution of Compliance Routing:** Record the evaluated `dataClassification`, `residencyRegion`, `zdrEnforced`, and resolved endpoint ID on every `AuditLogSink` and OTel trace record for SOC-2, HIPAA, and FINRA compliance verification.

### Outcome-Based Developer Trust KPIs & Feedback Calibration Loop
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 53: Developer Feedback Loops, Calibration & Trust Metrics (Beyond Technical Telemetry)) -->

Technical telemetry (latency, token usage, HTTP error rates) alone does not measure whether engineers trust agent outputs or accept generated changes. The observability layer tracks three outcome-based trust KPIs across OTel, Langfuse, and Backstage Analytics:

1. **Agent PR Merge vs. Close-Without-Merge Rate:**
   - Correlate GitHub/GitLab `pull_request.closed` webhook outcomes (`merged` vs. `closed_unmerged` and post-merge diff churn) back to the originating `runId`, `skillId`, and `modelGenerationProfile` via deterministic branch prefixes and PR metadata trailers.
2. **HITL Approval, Rejection & Modification Ratios:**
   - Track `APPROVE`, `REJECT`, and `MODIFY` rates per `capabilityId`, `skillId`, and `riskTier` to detect noisy or miscalibrated prompts and tune Tier 2 Supervisor confidence thresholds—while enforcing a hard security floor that never auto-approves `WRITE_HIGH` or `tainted` runs.
3. **Per-Turn Thumbs Up/Down + Structured `"Why?"` Triage Queue:**
   - Attach explicit developer feedback scores (`score: 1 | -1`, `reasonCategory`, optional comment) to the corresponding trace span. Downvoted turns pass through the synchronous **DLP secret and PII/PHI redactor** before entering a weekly prompt/skill refinement triage queue.

### Five-Plane Unified Reference Architecture (Cross-Cutting Topology)
<!-- Source: incoming/WRITING_AN_AGENT.md (Section: Unified Reference Architecture (How All 53 Issues Fit Together)) -->

To prevent reliability, security, memory, and governance controls from causing monolithic coupling, the platform organizes its architecture across five core planes mapped directly to `docs/discovery/` modules:

1. **Plane 1 — Ingress & Client Plane (`06-backstage-control-plane.md`):** Stateless surfaces route through a Unified Gateway Router, OBO grant resolvers emitting opaque handles, deterministic pre-filters, and Redis Stream SSE.
2. **Plane 2 — Durable Control Plane (`02-durable-execution-engine.md`):** Temporal Server and PostgreSQL manage schedules, priority queues, step-granular ReAct loops, `CancellationScope` signals, Saga compensations, and `Continue-As-New` compaction.
3. **Plane 3 — Cognition & Memory Plane (`03-agent-reasoning-runtime.md` & `05-context-memory-and-rag.md`):** Features failover `ModelRegistry` routing, prompt compilers, Dual-LLM quarantined readers, and multi-scoped Mem0 storage with temporal decay.
4. **Plane 4 — Zero-Trust Execution & Tool Plane (`04-tool-and-capability-registry.md`):** Enforces SHA-256 digest-pinned skills, risk-tiered HITL autonomy gates, Token Broker egress proxies, ephemeral rootless sandboxes, and post-mutation verifiers.
5. **Plane 5 — Observability, Governance & DR Plane (`07-nfrs-security-observability.md`):** Covers W3C/OTel tracing, DLP/PII redaction, WORM audit logs, GitOps CI gates, automated evaluations, and disaster recovery drills.

### Prompt Snapshot CI Drift Gates & Composition Telemetry
<!-- Source: incoming/OPENCLAW_PROMPT_BUILDER.md (Sections: Prompt snapshots, Workspace bootstrap injection) -->

- **Committed Prompt Snapshot Drift Gate (`prompt:snapshots:check`):** Maintain committed golden prompt snapshots across representative surfaces (Backstage UI `DIRECT_PRIVATE`, Slack `SHARED_CHANNEL`, `minimal` sub-agent, `none` classifier, and voice mode) and run automated CI diff assertions so unintended changes to modular prompt builders fail the PR unless snapshots are explicitly reviewed and updated.
- **Bounded Prompt Composition Diagnostics:** Emit a per-run prompt composition summary on OTel/Langfuse spans recording active builder sections, injected character/token counts, cache-boundary prefix hash, and truncation flags—without logging raw secret or PII contents.

### Credential IAM Boundaries, Key Compromise Runbook & Secret-Leakage Tests
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section C: Secure credential storage) -->

Envelope encryption is an implementation control rather than a standalone compliance certification; it is reinforced by IAM isolation, incident runbooks, and automated tests:

- **Restricted IAM Decrypt & DB Access:** Grant `kms:Decrypt` on the Token Broker CMK and SQL access to `agent_oauth_secret_payloads` **only** to the Token Broker service principal—never to Backstage frontend/API controllers or general reasoning workers.
- **Secret Leakage & Key-Compromise Recovery Plan:**
  - Maintain a deterministic incident runbook to: (1) revoke affected upstream OAuth/GitHub App grants via provider revocation APIs, (2) rotate the KMS CMK and OAuth client secrets, (3) purge compromised `agent_oauth_secret_payloads` rows and transition affected connections to `revoked` / `reconnect_required`, and (4) audit `AuditLogSink` access logs for the exposure window.
- **Automated Secret-Handling Verification Tests:**
  - Enforce Vitest unit and integration tests with synthetic canary tokens verifying that failed HTTP calls, refresh collisions, timeout errors, structured logs, audit events, and serialized Temporal payloads never emit raw credential substrings.

### Token Broker Concurrency & Rotation-Crash Test Suite
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section D: Token acquisition and refresh) -->

- **Concurrent Refresh & Fault-Injection Verification:** Maintain automated integration tests simulating: (1) `N` parallel workers requesting a near-expiry single-use rotating refresh token simultaneously (verifying exactly one upstream provider call via Redis lock + double-checked DB read), (2) simulated DB write failure / process interruption immediately after upstream rotation (verifying deterministic transition to `reconnect_required` on next attempt), and (3) `5xx` transient errors vs. `invalid_grant` terminal errors.

### Secret-Free Credential Usage Audit Events (`AuditLogSink`)
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section E: Gateway authorization and use) -->

- **Who Used Which Connection For What:** Every Token Broker policy evaluation and credential use writes an immutable, metadata-only event to `AuditLogSink` recording `tenantId`, `grantId`, `userEntityRef`, `agentId`, `workflowId`, `runId`, `capabilityId`, `providerInstanceId`, `targetResource`, `policyDecision` (`ALLOW` | `DENY`), and `timestamp`—strictly excluding tokens, headers, and query secrets.

### Long-Running Auth Lifecycle & Re-Consent Test Matrix
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section F: Temporal and long-running behavior) -->

- **Mandatory Temporal + Broker Test Coverage:** Maintain automated `@temporalio/testing` integration tests verifying: (1) mid-run access token expiry triggering transparent refresh, (2) upstream grant revocation transitioning a workflow to `AWAITING_REAUTH` and resuming cleanly after account-matched re-consent, (3) mismatched account on re-consent rejected with `ACCOUNT_MISMATCH_ON_RECONNECT`, (4) mid-run user deactivation / RBAC removal forcing immediate `TERMINATED_ACCESS_REVOKED`, and (5) activity retries after token refresh deduplicating external writes via `Idempotency-Key`.

### Token Broker Audit Taxonomy, Operational Alerts & Security Assurance Gates
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section G: Operations and assurance) -->

Enterprise readiness for the Server-Side Token Broker requires full auditability, real-time operational alerting, and formal security verification:

1. **Immutable Token Broker Audit Event Taxonomy (`AuditLogSink`):**
   - Emit secret-free, WORM-retained audit events for every lifecycle transition:
     - `TOKEN_CONNECT` (user, `providerInstanceId`, `providerAccountId`, granted permission set)
     - `TOKEN_DISCONNECT` (user, `providerInstanceId`, upstream revocation outcome)
     - `TOKEN_USE` (user, agent, `workflowId`, `runId`, `capabilityId`, `providerInstanceId`, `targetResource`, `decision`)
     - `TOKEN_REFRESH_FAILED` (user, `providerInstanceId`, sanitized `failureClass`: `transient` | `invalid_grant` | `kms_error`)
     - `TOKEN_GRANT_REVOKED` (detected upstream revocation or admin revocation)
     - `TOKEN_ADMIN_ACTION` (break-glass revocation, CMK key rotation, policy override)
2. **Prometheus / OTel Metrics & Alerting Thresholds:**
   - Emit low-cardinality counters and histograms (`token_broker_refresh_total`, `token_broker_refresh_failures_total{providerId,failureClass}`, `token_broker_kms_decrypt_errors_total`, `token_broker_upstream_latency_ms`).
   - Configure immediate SRE alerts (routed to the independent `#platform-agent-alerts` / PagerDuty path) on: (a) any `kms_decrypt_errors` spike, (b) elevated `invalid_grant` refresh failure rates indicating rotation collisions or app suspension, and (c) sustained upstream provider `5xx` outages.
3. **Security Review & Assurance Verification Gates:**
   - Require formal security review sign-off and automated test proof across five threat classes prior to production release and whenever onboarding a new provider adapter:
     1. Cross-user identity mix-ups / OAuth callback substitution
     2. Unauthorized capability or service-to-service token use
     3. Secret leakage in logs, errors, traces, URLs, or Temporal history
     4. Multi-pod concurrent refresh races on single-use rotating tokens
     5. Immediate access termination upon user offboarding / RBAC revocation

### Temporal Codec Server Access Controls & Payload Encryption Assurance
<!-- Source: incoming/TOOLS_TEMPORAL_PAYLOAD_CODEC.md (Sections: What the payload codec does, What the optional codec server does, Practical scope for our platform) -->

- **Regulated Codec Server Lockdown:** Treat any deployed Temporal Codec Server with the same trust boundary as a production worker. Enforce HTTPS/mTLS, VPN/private ingress restrictions, OIDC JWT signature validation, `X-Namespace` entitlement checks, and immutable `AuditLogSink` entries recording every operator `/decode` and `/download` request.
- **Encryption & Rotation Verification Tests:** Include automated CI/integration tests verifying: (1) zero raw credential substrings in persisted Temporal event histories or failure payloads, (2) fail-closed rejection when KMS is unavailable, and (3) seamless replay across KMS key-ID rotations.

### Capability Invocation Audit Schema & Catalog Skew Alerting
<!-- Source: incoming/TOOLS_REGISTRY.md (Sections: Lifecycle and governance requirements, Minimum acceptance tests) -->

- **Gateway-Owned Capability Audit Record (`AuditLogSink`):** Every `CapabilityGateway` invocation emits a metadata-only audit entry recording `tenantId`, `actorUserRef`, `agentId`, `workflowId`, `runId`, `capabilityId`, `providerInstanceId`, `standingRef`, `catalogDigest`, `policyDecision`, `redactedInputDigest`, `upstreamOutcome`, and `approvalId`—strictly omitting raw read results, credentials, and unredacted sensitive arguments.
- **Catalog Version Skew Telemetry:** Export `loaded_catalog_digest` metrics from all Backstage API pods and Temporal workers and alert SREs on unexpected digest skew across replicas.

### External Policy Engine Schema Documentation & Sanitized `resourceContext`
<!-- Source: incoming/TOOLS_PERMISSIONS_RBAC.md (Sections: Your Code vs. OPA: What You Need to Worry About, Core Crew Suite Backend Plugin Router Implementation of RBAC) -->

- **Sanitized Authorization Contexts:** Never pass raw secrets, bearer tokens, or unredacted PII/PHI inside `permissions.authorize(..., { resourceContext })` payloads, because external OPA or OpenFGA servers log incoming decision inputs. Pass only normalized, DLP-scrubbed policy attributes (`capabilityId`, `driver`, `riskTier`, `targetEntityRef`, `environment`).
- **Published Permission Schema & Rego Reference Policies:** Ship versioned documentation of all exported permission names, `resourceType` identifiers, and `resourceContext` attribute schemas alongside reference OPA Rego policies for platform security teams.

### Provider Credential & Quota Exhaustion Alerting
<!-- Source: incoming/PI_AGENT.md (Section: Model Selection and Failover) -->

- **Out-of-Band SRE Paging on Credential/Billing Disablement:** Whenever `ModelRegistry` places an enterprise LLM endpoint/profile into extended disablement due to `401/403` authentication failure or `402` quota/billing exhaustion, emit an immediate alert to `#platform-agent-alerts` / PagerDuty while failing over seamlessly to remaining healthy, compliance-approved endpoints.

### Synchronous Deterministic Guardrails vs. Asynchronous Quality Evaluators
<!-- Source: incoming/OVERALL_BLUEPRINT.md (Section: Enterprise Guardrails, Evaluation, & Policy Core) -->

- **Two-Speed Compliance & Evaluation Split:** Enforce security, DLP secret/PII redaction, RBAC (`PermissionsService`), and HITL approval gates **synchronously and deterministically** at `CapabilityGateway` and stream egress boundaries; execute LLM-as-a-judge and Langfuse/Braintrust quality evaluators **asynchronously** for regression telemetry without blocking latency-critical responses or relying on probabilistic judges as sole security controls.

### GDPR Cascading Memory Deletion & Trace Payload Scrubbing
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md (Sections: Trace memory, Short-term vs Long-term memory) -->

- **Cascading Right-to-Forget (`DELETE`):** PostgreSQL-backed `preference_memory`, `fact_memory`, `episodic_memory`, and `SessionStore` support deterministic `(tenant_id, user_id)` cascading deletion upon offboarding or GDPR erasure requests, while preserving metadata-only compliance records in `AuditLogSink` under FINRA/HIPAA retention rules.
- **Pre-Persistence `trace_memory` Redaction:** Route every `trace_memory.payload` entry through the synchronous DLP secret and PII/PHI scrubber prior to database insertion.

### Regulatory Data Governance, Cryptographic Tenant Isolation & Erasure Auditing
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md -->

Enterprise compliance across GDPR, SOC-2, HIPAA, FINRA, and EU AI Act data governance obligations requires structural, cryptographic, and auditable boundaries around derived AI artifacts:

* **Tenant-Scoped Encryption Domains:** Logical scope filtering (`tenant_id`) is a software invariant and must be reinforced by cryptographic isolation (per-tenant encryption keys/domains) so cross-tenant exposure cannot occur even at the storage layer. Encryption complements—and does not replace—strict query-level scope predicates.
* **Derived-Artifact Erasure Compliance (GDPR Art. 17):** Because extracted facts and episodic summaries represent synthesized knowledge derived from raw transcripts, erasure requests must invalidate both raw traces and derived embeddings within a single ACID transaction, recording an immutable tombstone entry in `deletion_events` (`user_id`, `tenant_id`, `scope`, `deleted_at`, `reason`) for regulatory audit proof.
* **Lineage & Auditability (EU AI Act / FINRA / HIPAA):** Every promoted memory artifact must retain immutable provenance (`source_run_id`, `source_turn_id`, `promoting_policy_version`, `created_at`) to prove data isolation, explain agent decision inputs, and verify policy compliance during audits.

### Turn-Level Memory & Promotion Telemetry Envelope
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md (Sections: How do you add memory to an AI agent) -->

Every agent turn must emit a structured trace envelope capturing retrieval inputs, model execution metrics, and promotion gate outcomes to support offline evaluations (Promptfoo/DeepEval), deterministic replay, and regulatory audits (SOC-2, HIPAA, FINRA):

```json
{
  "run_id": "run_a1b2c3",
  "turn_index": 7,
  "tenant_id": "acme",
  "user_id": "jane@acme.com",
  "retrieval": {
    "facts_returned": ["fact_001", "fact_042"],
    "episodes_returned": ["ep_017"],
    "preferences_applied": ["response_format", "verbosity"],
    "retrieval_mode": "hybrid"
  },
  "model_call": {
    "model": "llm_model_id",
    "input_tokens": 4231,
    "output_tokens": 412
  },
  "promotions": [
    {
      "type": "fact",
      "fact_id": "fact_103",
      "confidence": 0.82,
      "status": "provisional",
      "outcome": "written | deduplicated | rejected | superseded",
      "reason": "rejection_reason_or_superseded:<old_id>"
    }
  ]
}
```

### Compliance Controls for External Memory Compilers (SOC-2 / HIPAA / FINRA)
<!-- Source: incoming/MEM0.md (Sections: Safety Gating: Mem0 vs. Client Code) -->

Because external memory frameworks (Mem0) lack native compliance filtering or DLP enforcement:

* **Zero Unscreened Persistence:** No user prompt, tool output, or assistant response may reach `memory.add()` without first passing through platform PII/PHI/secret redaction and safety classification.
* **Defense-in-Depth Recall Filtering:** Retrieved memory records must be re-verified against active tenant policies and safety rules prior to LLM prompt injection to prevent stored prompt-injection or stale policy violations.

### Mem0 Backend Resilience, OLTP vs. OLAP Telemetry & Offline Prompt Optimization
<!-- Source: incoming/MEM0.md (Sections: OSS vs. Platform Versions) -->

The managed Platform operates its own service infrastructure; self-hosted OSS availability is the operator's responsibility. Both modes still require application-side call, latency, and outcome telemetry. Separate transactional vector retrieval from analytical telemetry and prompt tuning:

* **OLTP vs. OLAP Workload Separation:** Never run heavy multi-row trend aggregations (e.g., feedback completion rates, retrieval latency percentiles, or memory quality drift queries) directly against operational PostgreSQL + `pgvector` tables, as analytical scans degrade real-time HNSW/IVFFlat search latency. Stream turn trace envelopes (`retrieval`, `model_call`, `promotions`, and explicit user feedback signals) asynchronously via OpenTelemetry / event sinks into dedicated analytical storage.
* **Offline Evaluation & Controlled Prompt Promotion:** Instead of unreviewed autonomous prompt mutation in production, aggregate negative feedback reasons and extraction failure traces into offline **Promptfoo / DeepEval** golden datasets. Candidate extraction/system prompt variants must pass regression gates and human approval before promotion to production configuration.

### Auditability & Structured Logging for Self-Healing Mutations
<!-- Source: incoming/MEM0.md (Sections: Implementing Platform Features in Open Source Version) -->

Automated LLM-driven memory rewrites and deletions must preserve full regulatory auditability (SOC-2, HIPAA, FINRA):

* **Immutable Mutation Lineage:** Every self-healing supersession or deletion writes an immutable `AuditLogSink` event linking `actor_user_id`, `tenant_id`, `target_memory_id`, `replacement_memory_id` (if rewritten), `feedback_reason`, and the Temporal `workflow_id`.
* **Structured Logging Only:** Repair activities and control-plane handlers log lifecycle transitions exclusively via Backstage `LoggerService` with structured metadata objects (`{ memoryId, tenantId, workflowId, verdict }`)—never `console.log`/`console.error` and never logging raw memory text or user feedback strings that may contain PII/PHI.

### Transport Header Redaction & Zero-Leakage Isolation in Stateless Tool Pools
<!-- Source: incoming/MCP.md (Sections: Stateless MCPs) -->

Per-request credential injection over stateless HTTP transports eliminates sticky-session cross-tenant leakage in shared MCP worker pools, provided transport telemetry enforces strict header hygiene:

* **Mandatory Header Scrubbing:** OpenTelemetry HTTP instrumentation, `AuditLogSink`, and Temporal failure serializers must strip `Authorization`, `Proxy-Authorization`, and custom credential headers before persisting spans or error payloads.
* **Ephemeral Client Disposal:** Every `toolExecutionActivity` must instantiate a fresh client/header scope per `(tenant_id, user_id)` invocation and close it in a `finally` block—never pooling authenticated `createMCPClient` instances across different users.

### Governance Boundaries for Provider-Executed & Sandboxed Tools
<!-- Source: incoming/MCP.md (Sections: Available External Provider MCPs) -->

* **Provider-Executed Tool Restrictions (SOC-2 / HIPAA / FINRA):** Server-side provider tools (such as vendor-hosted File Search, Code Interpreter, or live Web Grounding) transmit prompts, tool inputs, or uploaded files directly to external vendor runtimes outside our `CapabilityGateway`. Regulated tenants must default to sovereign platform capabilities (PostgreSQL + `pgvector` RAG/Memory and internal sandboxed runners), enabling provider-executed tools only when explicitly authorized by tenant compliance policy and zero-data-retention / BAA agreements.
* **Host Isolation for Provider-Defined Client Tools:** Native OS/code-editing schemas (`bash`, `apply_patch`, `computer`) must execute exclusively inside disposable, resource-capped sandboxes with network egress filtering—never on shared Backstage or Temporal worker hosts.

### LLM Observability & Flight Recorder Architecture (Langfuse + OpenTelemetry)

<!-- Source: incoming/LLM_OBSERVABILITY_WITH_LANGFUSE.md (Sections: Langfuse Four Core Pillars, How Langfuse Integrates with Your Stack) -->

Self-hosted **Langfuse** (backed by PostgreSQL for transactional metadata and **ClickHouse** for high-throughput OLAP telemetry analytics) serves as the platform's OpenTelemetry-native LLM observability, evaluation, and prompt-versioning plane across the **Temporal + Vercel AI SDK + Mem0** stack.

#### 1. Four Operational Pillars & Platform Mapping
* **Hierarchical OpenTelemetry Tracing:** Captures nested execution trees spanning workflow turns, Mem0/RAG context retrieval spans, `CapabilityGateway` tool calls, and `ModelExecutor` generations—recording exact token counts, latency, and per-call cost without impacting operational PostgreSQL OLTP performance.
* **Evaluations & Human Feedback Attachment:** Links explicit user feedback signals (thumbs up/down, correction reasons) and automated LLM-as-a-Judge scores directly to the originating trace ID, feeding production failure traces into offline **Promptfoo / DeepEval** golden datasets.
* **Versioned Prompt Management:** Decouples prompt templates from plugin deployments via versioned Langfuse prompt registries (`staging` / `production` labels with local TTL caching). Regulated workflows pin the resolved `promptVersion` at workflow start for deterministic replay and gate `production` label promotion on offline evaluation sign-off.
* **OLAP Metrics & Cost Dashboards:** Aggregates token spend, error rates, latency percentiles, and quality drift across tenants and agent plugins in ClickHouse.

#### 2. Compliance & Redaction Guardrails (SOC-2 / HIPAA / FINRA)
* **Self-Hosted Sovereignty:** Langfuse and its ClickHouse/PostgreSQL stores deploy inside our private VPC perimeter—never SaaS cloud—for regulated workloads.
* **Pre-Export Telemetry Scrubbing:** OpenTelemetry span processors must redact PII, PHI, credentials, and restricted financial identifiers before export. For high-sensitivity tenant tiers, Mem0 retrieval spans log record IDs, categories, and similarity scores (`fact_001`, `ep_017`) rather than raw decrypted memory payloads.

### Self-Hosted Langfuse Trace Anatomy & Deployment Topology
<!-- Source: incoming/LLM_OBSERVABILITY_WITH_LANGFUSE.md (Sections: What Your Dashboard Looks Like, Langfuse Deployment Stack) -->

#### 1. Canonical Agent Execution Trace Waterfall
Every Temporal workflow execution produces a single unified waterfall trace in Langfuse anchored to the Temporal `workflowId` / `runId`, decoupling observability from any specific agent framework:

* **Root Trace (`<temporal-workflow-id>`):** Carries `tenant_id`, `user_id`, `agent_id`, and `prompt_version` tags.
  * **Span `fetchMem0Memory`:** Records retrieved record IDs, memory categories (`policy`, `preference`, `fact`, `episodic`), retrieval mode (`hybrid` / fallback tier), and latency (with raw text redacted for restricted compliance tiers).
  * **Generation `ModelExecutor` (`<model-id>`):** Captures prompt version, input/output token counts, latency, cost, and structured `toolCalls`.
  * **Span `CapabilityGateway.<toolName>`:** Logs capability descriptor ID, authorization decision, execution latency, and scrubbed input/output summaries.
  * **Span `saveToMem0` (Promotion Gate):** Records candidate extraction counts and Promotion Gate outcomes (`written`, `deduplicated`, `superseded`, `rejected`).

#### 2. Self-Hosted Infrastructure Components & Kubernetes Scaling Pattern
For local development, Langfuse runs via Docker Compose (`postgres:16`, `clickhouse`, and `langfuse-server` with inline workers). For production Kubernetes (EKS/GKE) deployments under SOC-2/HIPAA/FINRA controls:

| Component             | Production Role                                              | Enterprise Hardening & Scaling Standard                      |
| :-------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| **`langfuse-server`** | Next.js API ingestion endpoint, Web UI, and versioned prompt registry | Horizontally scaled stateless pods with inline workers disabled (`LANGFUSE_ENABLE_WORKER_EXECUTION=false`). |
| **`langfuse-worker`** | Async batch trace ingestion, LLM-as-a-Judge eval runners, and rollup jobs | Dedicated autoscaled worker deployment consuming ingestion queues independently of UI/API traffic. |
| **Redis / Valkey**    | Durable ingestion & evaluation job queue between server and workers | Highly available cluster absorbing bursty agent trace flushes without dropping spans. |
| **PostgreSQL (v16+)** | Transactional metadata (orgs, RBAC, API keys, audit logs, versioned prompts) | Managed multi-AZ PostgreSQL instance with TLS in transit and encryption at rest (separate from operational agent DB). |
| **ClickHouse**        | High-throughput columnar OLAP store for nested traces, token metrics, and cost rollups | Dedicated ClickHouse cluster handling high-volume trace writes without locking OLTP tables. |
| **Secret Management** | `NEXTAUTH_SECRET`, `SALT`, DB/ClickHouse URIs, and initial admin bootstrap credentials | Injected dynamically via AWS Secrets Manager / HashiCorp Vault (`ExternalSecret`); zero plaintext secrets in manifests. |

### Cross-Service Trace Continuity & Secret-Free Header Propagation
<!-- Source: incoming/GRAPH_ORCHESTRATOR_INTEGRATION.md (Sections: Auth, Logging, and Telemetry in a decoupled worker pool.) -->

* **No Credential Material in Workflow Envelopes:** Temporal serves strictly as a durable state and task conveyor—never a secret store. Only non-secret identity claims (`tenantId`, `userId`, `actorEntityRef`) and opaque Token Broker grant references (`sessionGrantRef`) cross Temporal payload headers; any sensitive payload fields require a KMS-backed Temporal `PayloadCodec`.
* **Unified APM + LLM Waterfall:** `@temporalio/interceptors-opentelemetry` propagates W3C `traceparent` context from Backstage ingress through Temporal gRPC tasks into worker activities, linking infrastructure APM traces (Datadog/Jaeger) with Langfuse LLM/memory spans under a single trace hierarchy.

### Immutable Audit Trail for HITL Approval & Rejection Decisions
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .requireApproval(name, config)) -->

* **Mandatory Approval Attribution:** Every human approval, rejection, or adaptive RBAC override emits an immutable `AuditLogSink` record capturing `tenant_id`, `instance_id`, `gate_name`, `decision` (`APPROVED` | `REJECTED`), `approver_entity_ref`, `decided_at`, and a hash/summary of the validated approval payload (with sensitive fields scrubbed).

### Webhook Replay Prevention & Compliance Attestation Recording
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .waitForSignal(name, config)) -->

* **Single-Use Token & Payload Hygiene:** Callback URLs store only salted cryptographic hashes of signing tokens in PostgreSQL and enforce single-use atomic invalidation upon successful delivery. Incoming webhook payloads are size-capped and scrubbed before audit or trace logging.
* **Structured Compliance Attestations (`ctx.compliance.attest`):** Verification receipts emitted inside `onSuccess` write immutable `AuditLogSink` records binding `tenant_id`, `instance_id`, `gate_name`, `action`, `reasoning`, and `evidenceRefs`.

### Checkpoint Integrity Digests & Telemetry Correlation
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .checkpoint(name)) -->

* **Tamper-Evident State Fingerprints:** Each `.checkpoint(name)` emits a structured OpenTelemetry event and `AuditLogSink` milestone entry containing `tenant_id`, `instance_id`, `checkpoint_name`, and the canonical `state_hash`—proving state integrity across phase boundaries without logging raw sensitive state payloads.

### Egress Scrubbing in Notification & Telemetry Extensions
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .extend(extensionPlugin)) -->

* **Sanitized Error Payloads:** Middleware extensions that forward failure details to external channels (e.g., Slack, PagerDuty, webhooks) must pass error messages through the platform's secret/PII scrubber—never forwarding raw stack traces, SQL errors, or upstream HTTP headers.

### Automatic OpenTelemetry Child Spans for `ctx.helpers.*`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .useHelpers(helpers)) -->

* **Proxy-Wrapped Span Instrumentation:** The runtime wraps every registered `ctx.helpers.<name>` function in a proxy that opens a child OpenTelemetry span (`helper.<name>`) parented to the active step activity span, recording execution duration and error status in flame graphs without manual tracing boilerplate.
* **Argument Scrubbing:** Helper span attributes record function name, duration, and status—never raw input arguments or return payloads that may contain PII/PHI.

### FinOps Chargeback Telemetry & Budget Breach Auditing
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureFinOps(config)) -->

* **Immutable Cost & Chargeback Records:** Every workflow execution records total LLM token cost, non-LLM capability cost weights, tenant ID, and department cost-center tags into `AuditLogSink` and Langfuse/ClickHouse OLAP telemetry for financial reconciliation.
* **Threshold & Exhaustion Audit Events:** Soft threshold crossings (`thresholdPercent`) and hard `BudgetExhaustionException` terminations emit structured audit events with `instance_id`, `tenant_id`, `accrued_spend`, and `budget_limit`.

### Write-Segregated Compliance Ledger & WORM Retention Governance
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureCompliance(config)) -->

* **Write-Segregated Audit Ledger (`ctx.compliance.attest`):** Compliance attestations bypass standard application log pipelines and write directly to an append-only, write-segregated audit store (`AuditLogSink`) recording cryptographic JSON envelopes (`tenant_id`, `instance_id`, `step_name`, `actor_user_ref`, `action`, `reasoning`, `evidence_refs`, `timestamp`, and SHA-256 signature).
* **Regulatory Retention & Object Lock:** Retention policies (`30-days`, `1-year`, `7-years`) govern automated lifecycle transitions from operational `RunStore` tables into compliance-mode WORM storage (S3 Object Lock), preventing premature deletion or tampering during regulatory audit windows.

### Non-Destructive State Evolution & Regulatory Audit Continuity
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureVersion(config)) -->

* **Forward-Only Runtime Transformation:** Mid-flight state migrations transform only the live runtime state object entering subsequent steps. Historical `AuditLogSink` records, compliance attestations (`ctx.compliance.attest`), checkpoint state hashes, and archived Temporal event histories are never retroactively altered—preserving an unbroken, non-repudiable record of what the agent executed under each historical code version.

### Defense-in-Depth Egress Sanitization via `transformEvent`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addInterceptor(interceptor)) -->

* **Mandatory Debug & Secret Stripping:** Platform-level `transformEvent` interceptors scrub internal diagnostic metadata, stack traces, and raw infrastructure identifiers from outbound SSE events, ensuring the Backstage UI receives only tenant-scoped, compliance-safe status updates.

### Terminal Outcome Attestation & Audit Closure
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .setTerminalOutcome(name, handler)) -->

* **Non-Repudiable Run Closure:** Every workflow reaching a `.setTerminalOutcome()` records `terminal_outcome_name`, `classification`, `final_state_hash`, and any `ctx.compliance.attest()` receipts into `AuditLogSink` and the turn/run telemetry envelope so auditors can distinguish intentional early exits (`completeWithoutAction`) from runtime failures.

### Ephemeral Secret Envelopes & Zero-Token Serialization Guardrails
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.auth.getPluginRequestToken(options)) -->

* **Redacted Secret Envelopes:** All runtime token helpers (`ctx.auth.getPluginRequestToken`, Token Broker grants) return `EphemeralSecretEnvelope` instances whose `toJSON()`, `toString()`, and Winston/OpenTelemetry serializers emit `'[ENCRYPTED_SECRET_REFERENCE]'`—preventing accidental credential leakage into Temporal payloads, `AuditLogSink`, or ClickHouse traces.

### Distributed Cache Isolation & Sensitive Data Prohibition
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.cache.get(key)) -->

* **Hard Tenant Namespace Partitioning:** Every `ctx.cache` operation enforces server-side key prefixing (`tenant:<tenantId>:<pluginId>:<key>`) and TLS/AUTH-protected Redis/Valkey connections.
* **No Credentials or Unredacted PHI in Cache:** Ephemeral tokens (`EphemeralSecretEnvelope`) and restricted regulatory records (HIPAA PHI / FINRA MNPI) must never be written to shared cache tiers; restricted data resides strictly in encrypted, retention-governed `ArtifactSink` storage.

### Write-Time Validation & Secret Rejection on `ctx.cache.set()`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.cache.set(key, value, ttlMs?)) -->

* **Credential & PHI Write Blocking:** `ctx.cache.set()` inspects serialized payloads at the facade boundary to reject `EphemeralSecretEnvelope` references, raw bearer tokens/API keys, and unredacted HIPAA PHI / FINRA MNPI payloads, emitting a security warning if a caller attempts to cache restricted material.

### RBAC Gating & Audit Trail for Container Liveness Evictions
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.health.flagLivenessFailure(reason)) -->

* **Capability & Policy Authorization:** Because triggering pod eviction impacts cluster compute capacity, `ctx.health.flagLivenessFailure()` is gated by tenant/workflow security policy (`allowPodEviction: false` by default) and requires `tenantIsolation: 'strict-logical'`.
* **Pre-Eviction Security Audit:** Every liveness failure invocation writes an immediate, synchronous `AuditLogSink` security event capturing `tenant_id`, `instance_id`, `worker_pod_id`, `actor_user_ref`, and scrubbed `reason` before flipping the container health probe.

### Ephemeral Sandbox Hygiene & Zero-Residual-Artifact Rules
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.lifecycle.addShutdownHook(hookFn)) -->

* **Tenant-Isolated Temp Workspaces & Guaranteed Cleanup:** Any local filesystem scratch space used during code/repository inspection must be isolated under unique per-activity directories (`<tmpdir>/<tenantId>/<activityId>`) with restrictive permissions (`0700`) and paired with a `ctx.lifecycle.addShutdownHook()` + `try/finally` purge so sensitive source code or build artifacts never persist on shared worker disks after step completion or pod eviction.

### Notification Egress Scrubbing & Audit Trail Attribution
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.notifications.send(targetRef, content)) -->

* **Pre-Dispatch PII/PHI Scrubbing:** Because Backstage notifications fan out to external email, Slack, and Teams integrations, `title`, `description`, and `additionalMetadata` pass through the platform's redaction filter before dispatch so sensitive patient, financial, or secret values are masked.
* **Audit Receipt Recording:** Every accepted notification dispatch records an immutable `AuditLogSink` entry capturing `tenant_id`, `instance_id`, `target_ref`, `topic`, `severity`, and `idempotency_key` for compliance traceability.

### Security Fencing & Audit Attribution for Inbox Action Tasks
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.notifications.requestAction(targetRef, responseSchema)) -->

* **Unauthorized Responder Rejection & Alerting:** Any attempt to submit a task payload by a caller outside the verified `tenantId` or `targetRef` user/group scope returns `403 Forbidden` and writes a security anomaly event to `AuditLogSink`.
* **Responder Attribution:** Every resolved inbox task logs `task_id`, `tenant_id`, `instance_id`, `target_ref`, `resolved_by_entity_ref`, and scrubbed response metadata into `AuditLogSink`.

### Authorization Decision Auditing & Non-Repudiable Skip Attestations
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.permissions.authorize(options)) -->

* **Immutable RBAC Decision Trail:** Every `ctx.permissions.authorize()` evaluation emits a structured audit/telemetry event recording `tenant_id`, `instance_id`, `step_name`, `actor_entity_ref`, `permission_name`, `resource_ref`, and verdict (`ALLOW` | `DENY`), paired with `await ctx.compliance.attest(...)` receipts whenever privileged actions are bypassed due to user RBAC denial.

### Plugin-Origin Telemetry Attribution & OLAP Metrics Hygiene
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.plugin.getId()) -->

* **Automatic Log & Span Tagging:** `ctx.logger` (Winston) and OpenTelemetry / Langfuse trace processors automatically attach `plugin_id` (`ctx.plugin.getId()`), `tenant_id`, and `instance_id` to every emitted log entry and span so operators can filter cost, error rates, and latency by owning Backstage plugin in Datadog and ClickHouse.
* **No Raw Operational DB Inserts for Usage Analytics:** Steps should emit usage counters and business metrics through OpenTelemetry / `ctx.telemetry` (routed to ClickHouse OLAP) rather than opening raw SQL connections (`ctx.db.getClient()`) against operational PostgreSQL databases.

### Principal Attribution & Audit Logging for Scheduled Agent Runs
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.scheduler.scheduleTask(config)) -->

* **Schedule Creation & Execution Lineage:** Creating or modifying a schedule writes an `AuditLogSink` record binding `schedule_id`, `tenant_id`, `created_by_entity_ref`, `target_workflow_id`, and cadence. Every subsequent scheduled workflow run records `trigger_type: 'scheduler'` and `schedule_id` in its audit and OpenTelemetry/Langfuse trace attributes.

### PII Minimization & Log Hygiene for Resolved User Profiles
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.userInfo.getUserInfo(token)) -->

* **Log & State PII Scrubbing:** Step handlers and platform interceptors must log canonical `userEntityRef` identifiers (`user:default/alice`) rather than raw `displayName` or `email` strings in `ctx.logger` outputs, and any raw credential wrapper (`EphemeralSecretEnvelope`) is rejected if returned in a `Partial<TState>` delta.

### Authoring SDK Type-Safety & Immutability Standards
<!-- Source: incoming/FLUENT_GRAPH_BUILDER_CLASS_DESIGN.md (Section: Mixin Pattern — Core Constructor Type & Composition Root) -->

* **No `any` Escape Hatches in Builder State:** Builder base classes and trait factories must forbid `Record<string, any>` state bags and untyped `Array.reduce` mixin pipelines; CI type-checking and architecture lint gates must verify end-to-end generic inference and strict `noImplicitAny` compliance across the authoring SDK.
* **Immutable Builder Branching:** Fluent builders must enforce immutable copy-on-write transitions so partially configured template builders can be safely shared across teams without cross-agent state mutation.

### Cache Security, Logging & Configuration Standards
<!-- Source: incoming/CACHE_MEMCACHE_AND_REDIS.md (Sections: How to Configure It, How to Use It Programmatically inside your Plugin) -->

* **Structured `LoggerService` Calls Only:** The incoming snippet uses string interpolation (`logger.info(\`Cached engine status: ${status}\`)`). Per platform observability standards, all `LoggerService` calls must pass a static message string and a structured metadata object (`logger.info('Retrieved cached engine status', { status })`), never interpolating dynamic values or potentially sensitive cache payloads into the log message.
* **No Hardcoded Credentials in `app-config.yaml`:** Cache connection strings in `backend.cache.connection` must use environment/secret placeholders (`${REDIS_URL}`) over TLS (`rediss://`) in non-local environments.

### Voice Ingress Security, Compliance & Observability Standards
<!-- Source: incoming/AUDIO_PROMPTS_AND_TRANSCRIPTION.md (Sections: Transcription with Models, Processing Audio, Terminating Audio Stream) -->

* **Regulated Data Handling on Audio & Transcripts (SOC-2 / HIPAA / FINRA):**
  * Any third-party voice gateway or STT provider (e.g., OpenAI Whisper, Deepgram, AssemblyAI, LiveKit Cloud) used in production must be covered by an executed **BAA / DPA**, enforce **Zero Data Retention (ZDR)** with prompt/audio training disabled, and sit on the approved provider allowlist.
  * Raw audio streams and intermediate transcripts must pass through the platform's PII/PHI/MNPI egress redaction and audit-logging pipeline (`AuditLogSink`) before reaching external LLMs or observability sinks.
  * Do not persist raw engineer voice recordings unless explicitly required by retention policy; if retained for FINRA/audit compliance, store encrypted in `ArtifactSink` with tenant-scoped retention sweepers.
* **Structured `LoggerService` Enforcement:** The incoming WebRTC/VAD snippets use `console.log(...)` with raw strings and emojis. Production media/control-plane services must strictly use Backstage's injected `LoggerService` with static messages and structured metadata objects (`logger.info('Speech turn completed', { sessionId, principalRef, durationMs })`), never logging raw transcript text or audio payloads at `info` level.

### Enterprise Compliance Pillars & FinOps Accounting Ledgers
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Executive Summary & Design Philosophy) -->

* **Core Non-Functional Invariants:**
  * **Deterministic Execution & Fault Isolation:** Workflow orchestration is deterministic; side effects run inside version-isolated Temporal worker sandboxes.
  * **Local Pre-Egress Redaction:** Sensitive data (PII/PHI/MNPI) is scrubbed by local redaction engines before external model calls, memory persistence, or SSE telemetry emission.
  * **Immutable FinOps Accounting Ledgers:** Token usage, model routing, and tool execution costs are recorded in immutable enterprise accounting ledgers and surfaced live via SSE to the FinOps Planner Card.
  * **Strict Tenant Isolation:** All persistence layers (PostgreSQL, Mem0, vector indexes) and event broadcast channels enforce hard tenant boundaries.

### Fail-Fast Startup Compilation & Supply-Chain Isolation
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Pre-Flight Graph Validation Engine (graphValidator)) -->

* **Zero-Dependency Compiler Module:** `graphValidator.ts` must remain pure TypeScript with zero runtime/network dependencies so it can be unit-tested hermetically and bundled cleanly without polluting Temporal's V8 workflow isolate.
* **Fail-Fast Boot Gate:** All statically registered workflow blueprints must pass `validateWorkflowGraph` during plugin initialization (`registerInit`) before the worker begins polling Temporal task queues.

### Hard FinOps Budget Guardrails & Temporal Payload Protection
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: The Master Deterministic Runtime (Temporal Loop)) -->

* **Pre-Step FinOps Circuit Breaker:** Before dispatching any step activity, the execution engine checks `accumulatedSpend >= maxWorkflowBudget.amount` (using exact integer micro-dollars or decimal arithmetic rather than floating-point addition to avoid IEEE-754 drift) and halts immediately with a non-retryable FinOps violation event when exhausted.
* **Temporal History & Event Redaction:** Raw `currentState` objects must never be emitted unredacted into SSE event streams or unencrypted Temporal event histories; enforce KMS-backed Temporal `PayloadCodec` encryption for workflow state and local PII/PHI redaction on all `emitEvent` payloads.

### Credential Isolation & Egress Serialization Hardening
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: The Hardened Egress & Serialization Boundaries) -->

* **Zero Plaintext Secrets in Temporal History or Logs:** All secrets must be stored in external KMS/Vault (`security-driver`), resolved on demand inside activity workers into `#private`-field `SecretEnvelope` instances, and defended with `toJSON()`, `toString()`, and `nodejs.util.inspect.custom` redaction traps.
* **Bounded, Cycle-Safe Serialization:** All activity return values and SSE event payloads must pass through `deepSanitizeStateDelta` (honoring `.toJSON()` hooks, enforcing max depth/byte limits, and offloading large buffers to `ArtifactSink`) prior to Temporal serialization or log emission.

### SSE Stream Isolation, Reconnect Durability & Egress Redaction
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Real-Time Telemetry & Egress Filters (EventBroker)) -->

* **Run- & Tenant-Scoped Channels:** Outbound SSE channels must be keyed by `(tenantId, runId)`—never by shared workflow definition ID—and gated by `PermissionsService` authorization checks at subscription time.
* **Mandatory Non-Bypassable Redaction:** Built-in PII/PHI/MNPI and `SecretEnvelope` scrubbing must execute unconditionally ahead of custom transformer hooks before any event touches Redis Pub/Sub or an HTTP SSE socket.

### Immutable Multi-Tenant FinOps Accounting Ledger (`agent_finops_ledger`)
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Permanent Financial Accounting Ledger (PostgreSQL) — plugins/agent-orchestrator-backend/src/service/finOpsActivities.ts) -->

Every LLM token charge and metered capability invocation is recorded as an append-only row in PostgreSQL (`agent_finops_ledger`) via Backstage's injected `DatabaseService` (`coreServices.database`) for SOC-2, HIPAA, and FINRA financial auditability:

* **Core Attribution Columns:** `workflow_id`, `run_id`, `tenant_id`, `principal_ref` (normalized from `user_ref`), `allocation_type` (e.g., `llm_tokens`, `embedding`, `capability_call`), `resource_target` (model ID or capability ID), and metered cost.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
The prototype `finOpsActivities.ts` has five critical gaps that **must be reconciled** before production deployment:

1. **Activity Retry Idempotency (`idempotency_key` / `step_execution_id`):** Because `commitTransactionToLedger` runs as a Temporal activity, network blips or worker restarts will cause Temporal to retry the activity. A plain `.insert(...)` without a unique constraint will double- or triple-bill the tenant! Add a mandatory `step_execution_id` (e.g., `${runId}:${stepId}:${attemptSequence}`) with a `UNIQUE` index and use `ON CONFLICT (step_execution_id) DO NOTHING`.
2. **Exact Numeric / Micro-Dollar Precision (`cost_micros BIGINT` or `NUMERIC(18, 8)`):** Do not store or accumulate currency as IEEE-754 JavaScript `number` / SQL `FLOAT` (`costUsd: number`), which introduces rounding drift across millions of micro-charges. Store `cost_micros` (`BIGINT`, 1 USD = 1,000,000 micros) or `NUMERIC(18, 8)` alongside token counts (`prompt_tokens`, `completion_tokens`) and `recorded_at TIMESTAMPTZ DEFAULT NOW()`.
3. **Database-Enforced Append-Only Immutability:** Application-level `.insert()` alone does not make a PostgreSQL table permanent/immutable for SOC-2/FINRA audits. Enforce a PostgreSQL `BEFORE UPDATE OR DELETE` trigger on `agent_finops_ledger` that raises an exception, revoke `UPDATE`/`DELETE` privileges from the application database role, and optionally include a cryptographic hash-chain (`prev_row_hash`, `row_hash`) or DSSE signature per ledger entry.
4. **Row-Level Security (RLS) & Tenant/Principal Validation:** Enforce PostgreSQL Row-Level Security (`tenant_id = current_setting('app.current_tenant_id')`) and reject missing/empty `tenantId` or `principalRef` values at runtime (never allowing `'anonymous'` fallbacks).
5. **Typed Repository Wrapper:** Encapsulate `knex('agent_finops_ledger')` inside a dedicated repository (`FinOpsLedgerStore`) rather than exposing raw Knex calls inside activity wiring.

### Automated Secret-Leak & Structured-Logging Assertions in Test Harnesses
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: The Isolated Verification Harness (createTestHarness)) -->

* **Canary Secret Leakage Gates:** Every workflow test suite using `createTestHarness` must inject canary `SecretEnvelope` values and verify that zero canary plaintexts appear in `preState`/`postState` snapshots, simulated Temporal event histories, SSE envelopes, or `LoggerService` call arguments.

### Production Compliance & Cluster Transport Security Standards
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Sections: Production Deployment Topology Configuration, Core System Compliance Checklist) -->

* **Four Core Runtime Compliance Gates:**
  1. **Queue Version Isolation:** All Temporal task queues must carry explicit `v{version}` suffixes (or Temporal Worker Versioning build IDs) during rolling deployments.
  2. **Deterministic Workflow Sandboxing:** Zero external network/I/O or non-deterministic side effects inside workflow definitions.
  3. **Zero Plaintext Secrets in State/Memory:** Credentials are resolved just-in-time by the Token Broker inside `CapabilityGateway` via `SecretEnvelope`—never stored in workflow state, Mem0, or logs.
  4. **Mandatory Egress Leak Scrubbing:** Every outbound SSE frame passes through the platform's deterministic PII/PHI/Secret scrubber and `HardenedEventBroker` `transformEvent` pipeline prior to wire serialization.
* **In-Cluster Transport Encryption (TLS / mTLS):** The prototype Helm snippet shows plaintext `VECTOR_DB_URL: "http://cluster.local"` and unencrypted gRPC `TEMPORAL_ADDRESS`. In SOC-2 / HIPAA / FINRA production clusters, enforce **mTLS** on Temporal frontend gRPC connections and **HTTPS / TLS** on all internal vector database, PostgreSQL, and Redis connections.

### Deterministic Token Budget Enforcement & Prompt Truncation Telemetry
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 1: Declarative, Priority-Budgeted Prompt Rendering (@vscode/prompt-tsx)) -->

* **Zero Context-Overflow Failures:** Prompt compilation must enforce hard token budgets per model target prior to external LLM egress, emitting structured OpenTelemetry metrics (`prompt.tokens.allocated`, `prompt.tokens.pruned`, `prompt.nodes.evicted`) whenever low-priority tool outputs are truncated.

### Virtual Tool Discovery RBAC & Telemetry Metrics
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 2: Embedding-Guided Virtual Tool Clustering) -->

* **Zero Unauthorized Schema Disclosure:** Virtual tool cluster summaries and on-demand expansion handlers must enforce `PermissionsService` visibility rules so unauthorized capabilities are never enumerated in model prompts or logs.
* **Tool-Routing Observability:** Emit OpenTelemetry attributes tracking pre-activated vs. on-demand expanded tool clusters (`tools.virtual_clusters.preactivated`, `tools.virtual_clusters.expanded`, `tools.schema_tokens.saved`).

### Tiered Model Routing & Prompt-Cache FinOps Optimization
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 3: Model-Family-Specific Prompt Adaptation) -->

* **Workload-Tiered Routing & Cache Hit Telemetry:** Decoupling prompt rendering per model family enables FinOps cost tiering (routing low-complexity lookups to economical models while reserving frontier reasoning models for high-risk remediation) and maximizes provider prefix cache hit rates (`usage.cachedInputTokens`), tracked per tenant and workflow in `agent_finops_ledger` and OpenTelemetry metrics.

### Untrusted Runbook & Skill Ingestion Guardrails
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 4: Lazy "Agent Skills" & Glob-Scoped Instructions) -->

* **Privilege Separation for Repo-Authored Skills:** Lazily loaded `SKILL.md` files and TechDocs pages resolved from source repositories must be sandboxed in non-system prompt roles with prompt-injection screening and explicit caller read-permission checks on the backing Catalog entity.

### Separation-of-Duties Audit Gates Between Planning & Mutation
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 5: First-Class Handoffs Between Scoped Agents (.agent.md)) -->

* **Mandatory Read/Write Agent Segregation:** For regulated production mutations (SOC-2 / HIPAA / FINRA change control), diagnostic/planning agents must operate with read-only capability sets and transition to write-capable execution agents exclusively via schema-validated handoff artifacts, cryptographic input-hash verification, and logged human approval events in `AuditLogSink`.

### Compaction Integrity, Redaction & Observability
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 6: Structured, Intent-Focused Compaction (summarizer.ts)) -->

* **Redacted & Traceable Summaries:** Every compaction cycle must pass the generated structured summary through the local PII/PHI/Secret scrubber before storage, record compaction token savings (`context.compaction.tokens_before`, `context.compaction.tokens_after`), and retain immutable references to pre-compaction audit events in `AuditLogSink`.

### Forensic Raw Log Preservation vs. Distilled Context Hygiene
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 7: Noise-Filtering Execution Subagents (execution_subagent)) -->

* **Dual-Path Forensic & Context Handling:** While the parent agent receives only a redacted, high-signal distillation summary, the full raw diagnostic payload must be persisted to tenant-scoped, encrypted `ArtifactSink` storage (linked via `rawArtifactRef` in `AuditLogSink`) so SOC-2, HIPAA, and FINRA auditors can inspect the exact underlying evidence without bloating LLM context windows.

### Verifiable Completion Evidence & Stop-Hook Audit Trail
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 9: Loop-Control Guardrails and Stop Hooks) -->

* **Compliance Proof of Post-Conditions:** Every Stop Hook evaluation—including verifier ID, checked resource ref, pass/fail boolean, failure diagnostics, and attempt count—must be recorded in `AuditLogSink` so SOC-2, HIPAA, and FINRA audits have deterministic proof that automated changes met policy invariants before completion.

### FinOps Latency & Token Optimization via Intent Routing
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 10: Context-Aware Intent Routing (IIntentService) Before Loop Entry) -->

* **Avoiding Over-Provisioned Agent Loops:** Routing routine lookups to single-turn RAG handlers instead of 15-step autonomous loops reduces median latency and token spend, tracked in `agent_finops_ledger` and OpenTelemetry attributes (`intent.resolved`, `intent.routing_mode: fast_path | durable_workflow`).

### Indirect Prompt-Injection Quarantine & Sandbox Containment Controls
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 11: Workspace-Level Sandboxing & Untrusted Input Gates) -->

* **Blast-Radius & Indirect Injection Mitigation:** Treating external tickets, PR comments, and stack traces as untrusted input—paired with write-access trigger gating, ephemeral per-run `/workspace` sandboxes (`fs.realpath` containment), network egress allowlists, and short-lived scoped tokens—prevents indirect prompt injection from escalating into unauthorized code or infrastructure mutations.

### Change-Control Provenance & Reversible Audit Trail
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 12: Two-Tier Edits & Reversible Workspace Checkpoints) -->

* **Complete Mutation Lineage (SOC-2 / HIPAA / FINRA):** Every infrastructure or repository mutation must link four immutable records in `AuditLogSink`: (1) the staged diff/plan artifact, (2) the pre-mutation baseline snapshot (`baseSha` / `resourceVersion`), (3) the human approval or Stop-Hook verification signature, and (4) any subsequent rollback invocation and compensating action result.

### Multi-Client Identity Normalization & Steering Auditability
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 13: The Client / Agent Host Split (Transport-Agnostic Sessions)) -->

* **Unified Principal Provenance Across Channels:** Steering commands and approvals originating from secondary clients (Slack bots, CLIs, webhooks) must resolve to a verified Backstage `principalRef` and `tenantId` (never `'anonymous'` or unverified bot service accounts) and log both `principalRef` and `clientChannel` (`web_ui | slack | cli | webhook`) in `AuditLogSink`.

### Prompt Cache Hit & Prefix Divergence Diagnostics
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 14: Multi-Anchor Sliding Cache Breakpoints & Cache Diffing) -->

* **Cache Hit & Prefix-Break Telemetry:** The runtime records per-step prompt cache hit/write/miss metrics (`usage.cachedInputTokens`, `usage.cacheCreationInputTokens`, `cache.anchor_hit_index`) into `agent_finops_ledger` and OpenTelemetry spans.
* **Redacted Prefix-Hash Diffing:** Store cryptographic SHA-256 hashes per prompt block segment across consecutive turns (rather than raw prompt text) so operators can pinpoint the exact prompt section (`tools`, `system`, `catalog_context`, `turn_N`) where a cache-busting byte divergence occurred without exposing PII/PHI/MNPI in telemetry.

### Native GenAI OpenTelemetry Span Trees (`invoke_agent` -> `chat` -> `execute_tool`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 15: Native GenAI OpenTelemetry Span Trees (invoke_agent -> chat -> execute_tool)) -->

Rather than inventing proprietary trace formats or building a custom trace viewer, the platform emits standardized **OpenTelemetry GenAI Semantic Convention** (`gen_ai.*` plus `backstage.agent.*` domain attributes) span trees directly to enterprise APM/tracing backends (Grafana Tempo, Datadog, Honeycomb):

* **Canonical Parent-Child Span Hierarchy:**
  * **Root `invoke_agent <agentId>` Span:** Covers the end-to-end workflow run, tagged with `tenantId`, `runId`, `principalRef`, `entityRef`, `intent`, and FinOps rollup totals.
  * **Child `chat <model>` Spans:** Wrap each LLM invocation with `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.cache_read.input_tokens`, and `gen_ai.response.finish_reasons`.
  * **Child `execute_tool <capabilityId>` Spans:** Wrap each `CapabilityGateway` execution with `gen_ai.tool.name`, `gen_ai.tool.call.id`, capability type (`http_intent` | `native_adapter` | `distillation_subagent`), latency, and outcome status.
  * **Nested Subagent & Handoff Spans:** Distillation subagents and scoped agent handoffs link as child `invoke_agent` spans under the parent trace context, visualizing the full multi-agent execution DAG natively.
* **Compliance Hardening (Opt-In & Redacted Payload Capture):**
  * By default (`recordInputs: false`, `recordOutputs: false` in `@ai-sdk/otel`), raw prompts, model completions, and tool arguments/results are **omitted** from OpenTelemetry span attributes to prevent PII/PHI/MNPI leakage into shared APM backends.
  * When payload capture is explicitly enabled for non-regulated debugging or authorized audit sinks, all captured attributes must first pass through the deterministic PII/PHI/Secret scrubber.

### Self-Troubleshooting Data Minimization & Access Control
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 16: Built-In Self-Troubleshooting (/troubleshoot Over Session Logs)) -->

* **Least-Privilege Trace Access:** `/troubleshoot` trace retrieval must enforce `(tenantId, runId)` ownership checks via `PermissionsService`, strip any unredacted raw payloads (`ArtifactSink` pointers remain opaque unless separately authorized), and log every diagnostic invocation in `AuditLogSink`.

### Downstream "Survival" Metrics Over Vanity Completion Counts
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 17: Downstream "Survival" Metrics Over Simple Completion Counts) -->

Adapted from VS Code Copilot Chat's telemetry schema (which tracks edit acceptance, no-revert survival scores, and n-gram retention over time rather than `stop_reason: end_turn`), the platform measures **durable real-world outcome survival** rather than raw LLM completion counts:

* **Core IDP Survival KPIs:**
  * **SCM Pull Request Acceptance & Survival:** Percentage of agent-opened PRs that are merged (vs. closed unmerged), percentage of agent-authored lines/files surviving un-reverted at **7 days** and **30 days**, and edit-distance / diff-churn ratio between proposed and merged code.
  * **Backstage Catalog & Scaffolding Retention:** Percentage of generated `catalog-info.yaml` descriptors and Scaffolder-bootstrapped services that remain active, valid, and un-reverted in the Software Catalog after **30 days**.
  * **Incident Remediation Effectiveness:** Percentage of triage/remediation runs whose recommended or executed actions resolved the upstream PagerDuty/Opsgenie incident without immediate re-open or manual human rollback within **24 hours**.
  * **Handoff & Approval Acceptance Rate:** Ratio of staged agent plans approved by human reviewers on first review versus rejected or manually rewritten.
* **Telemetry & Evaluation Loop Integration:**
  * Survival scores are emitted as OpenTelemetry metrics (`backstage.agent.survival.pr_merged`, `backstage.agent.survival.retained_30d`, `backstage.agent.survival.incident_resolved`), persisted in `RunStore` outcome tables, and used to curate high-signal regression test cases for **Promptfoo / DeepEval** CI evaluation suites.

### Multi-Tenant Worker Protection Against Retry Storms
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 18: Rate-Limit Velocity vs. Quota Exhaustion Classification) -->

* **Zero Retry-Storm Amplification:** Enforcing `ApplicationFailure.nonRetryable` on quota/RBAC errors and delegating `Retry-After` delays to Temporal's server-side timer queue (rather than in-process `sleep()`) prevents noisy-neighbor retry storms across concurrent engineering teams and preserves worker fleet throughput.

### Emergency Truncation Telemetry & Audit Completeness
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 19: Deterministic Emergency Truncation Fallback (EmergencyTruncation / Last-Resort Dropping)) -->

* **Observability & Forensic Integrity:** Every emergency truncation pass emits an OpenTelemetry counter/event (`prompt.emergency_truncation.triggered`, `prompt.emergency_truncation.bytes_dropped`, `artifact_id`) and preserves the complete pre-truncated output in `ArtifactSink` so compliance audits never lose evidence due to context-window slicing.

### Transitive RBAC Filtering & Step-Count Efficiency in Graph Queries
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 20: AST-Aware Semantic Code Search & Symbols Over Raw grep) -->

* **Per-Node Authorization in Subgraph Traversals:** Multi-hop Catalog topology resolvers (`resolveSystemTopology`) must enforce `PermissionsService` read authorization on every traversed entity node and bound traversal depth (`maxDepth`) and payload byte size so unauthorized components are never leaked via transitive relation edges.

### Shift-Left Policy-as-Code (`OPA` / `Conftest`) Gate on Generated Artifacts
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 21: Fuzzy Patch Matching & Diagnostic Self-Correction Loops (get_errors)) -->

* **Pre-PR Compliance Verification:** Declarative infrastructure and Backstage entity files mutated by agents must pass deterministic schema and OPA/Conftest policy checks inline before any Git commit or PR capability can be invoked, ensuring SOC-2/HIPAA/FINRA guardrails (e.g., mandatory owner annotations, encryption-at-rest flags, no public ingress) are enforced prior to external SCM egress.

### Clarification Input Provenance, Schema Validation & Audit Logging
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 22: Interactive Mid-Turn Clarification Tools (ask_questions)) -->

* **Responder Authorization & Input Sanitization:** Mid-turn clarification answers must be schema-validated against the requested option/type constraints, scrubbed for secrets/PII before entering LLM history, and recorded in `AuditLogSink` with `(tenantId, runId, questionId, responderPrincipalRef, timestamp)` to maintain non-repudiable SOC-2/HIPAA/FINRA change provenance.

### Schema Sanitization Security & Compatibility Telemetry
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 23: Strict Tool Schema Sanitization & Provider Normalization) -->

* **Zero Remote `$ref` Dereferencing:** `cleanToolSchemaForProvider` must operate strictly on local in-memory JSON Schema trees—never fetching external `$ref` URLs—and emit structured debug/metric counters (`tools.schema.keywords_stripped`, `tools.schema.validation_self_corrections`) so platform teams can spot poorly typed MCP tool schemas early.

### Agent Capability Pack Supply-Chain & Tenant Enablement Governance
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 24: Bundled "Agent Plugins" as Versioned Capability Packages) -->

* **Approved Pack Registry & Tenant Allowlisting:** Only signed, internal-registry-published `@internal/agent-pack-*` modules verified by CI security gates (dependency/AST lint checks ensuring zero raw network or secret imports outside `CapabilityGateway`) may be loaded into production Backstage instances, and pack availability is explicitly allowlisted per `tenantId` and compliance tier (SOC-2 / HIPAA / FINRA).

### Tiered Memory RBAC, Redaction & Retention Sweeper Enforcement
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 26: Three-Tier Scoped Memory (User vs. Repository vs. Session)) -->

* **Anti-Poisoning & Tenant Isolation Controls:**
  * **Entity Memory Write Protection:** Untrusted external triggers (`authorTrustLevel !== 'verified_writer'`) and unauthorized principals are strictly blocked from writing to `Entity / System Memory`.
  * **Automated Retention Sweepers:** Run-scoped scratchpad entries are purged automatically on workflow completion (with a background TTL sweeper for orphaned runs), while Principal and Entity Mem0 records enforce configurable SOC-2/HIPAA/FINRA TTLs and cryptographic deletion workflows.

### Defense-in-Depth Egress Redaction & Redaction Audit Telemetry
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 27: Multi-Pass Secret & Credential Redaction Pipeline) -->

* **Four-Boundary Redaction Invariant:** Secret and PII/PHI scrubbing executes at four independent enforcement points: (1) `CapabilityGateway` tool return, (2) pre-LLM prompt egress (`ModelExecutor`), (3) pre-persistence Mem0/`SessionStore` writes, and (4) `HardenedEventBroker` SSE / `@ai-sdk/otel` telemetry emission.
* **Redaction Event Metrics:** Emit structured counters (`security.redaction.matches_total`, `security.redaction.rule_id`, `capability_id`) without logging the matched secret value so security teams can detect noisy/leaky services emitting credentials into pod logs.

### Regulated Change-Control & Non-Bypassable Approval Policies
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 29: Interactive vs. Autonomous Terminal & Tool Risk Classification) -->

* **SOC-2 / HIPAA / FINRA Change Control:** Regulated tenant policies lock `DESTRUCTIVE_MUTATION` capabilities against auto-approve allowlist overrides in production environments, enforce optional four-eyes separation (`approverPrincipalRef !== initiatorPrincipalRef`), and record the HMAC-verified approval signature in `AuditLogSink`.

### Tier-Tagged FinOps Attribution & Multi-Tier Compliance Allowlists
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 30: Background Model Speculation & Sub-Model Routing) -->

* **Granular Cost-Tier Metering (`agent_finops_ledger`):** Every `ModelExecutor` invocation records `model_tier` (`primary_reasoning` | `utility_fast` | `embedding`) alongside `resource_target` in `agent_finops_ledger` and OpenTelemetry (`gen_ai.request.model`, `backstage.agent.model_tier`), giving FinOps dashboards visibility into background overhead vs. primary reasoning spend.
* **Uniform Compliance Across Sub-Models:** All background utility models (used for run titling, compaction, memory extraction, and log distillation) must satisfy the exact same ZDR, encryption-in-transit, and BAA/SOC-2/FINRA provider allowlists as the primary reasoning model.

### Content-Addressed Embedding FinOps & Tenant Vector Isolation
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 31: Content-Addressed Workspace Indexing & Merkle Tree Sync) -->

* **Pre-Embedding Scrubbing & Tenant Boundary:** Every modified `chunkSha256` must pass through the multi-pass secret and PII/PHI redaction pipeline **before** embedding generation, and content-hash deduplication caches must remain strictly isolated per `tenantId` (`tenant_id` primary key prefix) to prevent cross-tenant existence probing.
* **Cache-Skip FinOps Telemetry:** Emit metrics tracking `rag.sync.chunks_skipped_unchanged` vs. `rag.sync.chunks_embedded` to quantify embedding token savings in FinOps reporting.

### Egress Scrubbing & Frontend Rendering Safety for Typed SSE Cards
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 32: Typed Streaming Response Parts (ChatResponsePart Protocol)) -->

* **Both Channels Redacted (`llmContent` & `uiDetails`):** Because `uiDetails` payloads flow directly to browser clients over SSE without passing through the LLM prompt compiler, `HardenedEventBroker` must run the multi-pass secret and PII/PHI/MNPI scrubber across **both** `llmContent` and `uiDetails` fields prior to wire emission, and the React frontend must sanitize all rendered Markdown/diff content against XSS.

### Per-Entity RBAC Verification in Cross-Service Workflows
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 33: Multi-Root Workspace & Cross-Repo Context Disambiguation) -->

* **No Transitive Privilege Escalation Across Entities:** When a workflow traverses from Producer Service A to Consumer Services B and C, `CapabilityGateway` and the context retriever must independently verify `PermissionsService` authorization for the initiating `principalRef` on **each target `entityRef`** before loading its runbooks, secrets, or repository files—recording every accessed `entityRef` in `AuditLogSink`.

### Deterministic Trajectory Replay & CI Evaluation Harnesses (`*.stest.ts` Pattern)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 34: Deterministic Trajectory Replay & Simulation Harnesses (*.stest.ts)) -->

Testing agent prompt, skill, or model upgrades directly against live Kubernetes clusters, GitHub repositories, or PagerDuty incidents is slow, flaky, and hazardous. Modeled on VS Code Copilot Chat's `*.stest.ts` simulation test suite, the platform pairs a **record-and-replay capability fixture interceptor** with **Promptfoo / DeepEval** CI evaluation gates:

* **Two-Mode Trajectory Simulation (`replay` vs. `record`):**
  * **Offline CI Replay Mode (`REPLAY` — Mandatory Default in CI):** Replays multi-turn trajectories deterministically against version-controlled JSON fixtures keyed by `(capabilityId, canonicalInputHash, turnSequence)`, measuring tool-selection accuracy, Stop-Hook pass rates, schema validity, and token/cache efficiency against live or mocked LLM endpoints without touching external infrastructure.
  * **Sanitized Fixture Capture Mode (`RECORD` — Controlled Staging/Dev Only):** Captures real Backstage Catalog, `HttpIntent`, `NativeAdapter`, and MCP responses into JSON trajectory fixtures for new regression scenarios.
* **Hardening Note (Mandatory Scrubbing Before Fixture Persistence):**
  * Any fixture recorded in `RECORD` mode **must** pass through `SecretEnvelope` verification, the multi-pass secret/credential scanner, and the PII/PHI/MNPI redactor (`utils/validation.ts`) before writing to disk—enforced by a CI architecture lint check that blocks committing any fixture containing raw tokens, internal host secrets, or unredacted PII/PHI.

### Orphaned-Mutation Prevention & Cancellation Audit Telemetry
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 35: Cooperative Cancellation Tokens (CancellationToken) Propagated Down to Tools) -->

* **Zero Orphaned Background Mutations:** Cooperative `AbortSignal` propagation plus non-cancellable checkpoint/rollback registration ensures that cancelling a run mid-flight never leaves unmonitored Terraform processes or unrecorded partial mutations running on worker pods.
* **Cancellation & Partial-Spend Audit Records:** Aborted runs emit `agent:cancelled` with `cancelledByPrincipalRef` into `AuditLogSink` and record any partial LLM token consumption incurred prior to abort into `agent_finops_ledger`.

### Data-Sensitivity Model Routing & BYOK Enclave Enforcement
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 36: Custom LM Provider & Endpoint Abstraction (LanguageModelChatProvider)) -->

* **Compliance-Tier Endpoint Isolation:** `ModelExecutor` enforces hard routing policies mapping workflow/tenant compliance classifications (`SOC2`, `HIPAA`, `FINRA`) exclusively to vetted endpoints covered by active BAAs/DPAs, regional data-residency locks, Zero Data Retention (ZDR), and tenant-scoped BYOK KMS keys.

### Tool Self-Healing Telemetry & Strict-Mode Safety Guardrails
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 37: Tool-Call Self-Healing & Malformed JSON Repair Middleware) -->

* **Coercion Boundaries & Metrics:** High-risk production mutations forbid implicit type coercion, and all self-healing events emit OpenTelemetry counters (`tools.validation.coerced`, `tools.validation.self_heal_returned`, `tools.validation.circuit_broken`) to help platform engineers refine ambiguous `CapabilityDescriptor` descriptions.

### Indirect Prompt-Injection Delimiter Isolation & Provenance Auditing
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 38: Explicit Trust Boundaries & Untagged External Data Wrapping) -->

* **Non-Bypassable Provenance Tagging:** No external tool output or webhook payload may enter an LLM prompt without `untrusted_external` structural wrapping and closing-tag sanitization, and any `DESTRUCTIVE_MUTATION` tool call triggered during a turn that ingested `untrusted_external` data must still pass mandatory human approval gates and `AuditLogSink` provenance logging.

### Mention Expansion RBAC & Indirect Injection Guardrails
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 39: Contextual Reference Expansion & Implicit Mention Resolution (# / @ Resolvers)) -->

* **Zero Unauthorized Entity Hydration:** Expanding `@entityRef` or `#techdocs:` tokens must enforce caller `PermissionsService` authorization per target entity (silently omitting or returning an access-denied stub for unauthorized refs), wrap repo-derived TechDocs/runbook text in `untrusted_external` delimiters, and record expanded `entityRef` dependencies in `AuditLogSink`.

### Follow-Up Suggestion FinOps & Click-Through Telemetry
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 40: Speculative Next-Step Suggestions (ChatFollowupProvider)) -->

* **Low-Overhead Metering & Signal Tracking:** Follow-up generation is metered under `model_tier: 'utility_fast'` in `agent_finops_ledger`, and UI click-throughs emit OpenTelemetry events (`backstage.agent.followup.accepted`) to measure suggestion relevance across workflows.

### Working-Set Token Compression & Exploration Audit Trail
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 41: Multi-Turn Prompt Compression via "Working Set" Pinning) -->

* **Context Efficiency & Compliance Completeness:** Track working-set compaction ratios (`context.working_set.pinned_count`, `context.exploration.evicted_count`) in OpenTelemetry while ensuring every inspected `entityRef`—even those later evicted from the active prompt—remains logged in `AuditLogSink` for complete SOC-2/HIPAA/FINRA access auditing.

### Fail-Closed Compliance Invariant & Capability Matrix Auditing
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 42: Graceful Feature Degradation & Capability Negotiation) -->

* **Non-Degradable Security Controls:** Feature negotiation must never bypass PII/PHI redaction, Token Broker isolation, `PermissionsService` checks, or human approval gates when operating on restricted/air-gapped models; the resolved `NegotiatedCapabilitySet` hash and model feature flags are recorded in `AuditLogSink` at run start.

### Thrashing FinOps Protection & Loop-Breaker Telemetry
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 43: Semantic Loop & Thrashing Detection (LoopDetector Heuristics)) -->

* **Preventing Runaway Token & History Burn:** `LoopDetector` circuit breakers prevent stuck agents from exhausting tenant FinOps budgets or hitting Temporal's 50,000-event history hard limit, emitting OpenTelemetry counters (`agent.loop_detector.soft_nudge`, `agent.loop_detector.hard_halt`, `capability_id`) for prompt/tool reliability tuning.

### Schema Upcaster CI Verification & Transcript Retention Compliance
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 45: Session Transcript Serialization & Versioned Schema Migration) -->

* **Golden-Fixture Upcaster Tests:** CI must maintain frozen golden JSON fixtures for every historical `schemaVersion` (`v1`, `v2`, ...) and verify that the forward upcaster pipeline upgrades all historical versions cleanly to `CURRENT_SCHEMA_VERSION` without data loss.
* **Retention & Legal-Hold Alignment:** Versioned session transcripts in PostgreSQL remain subject to tenant-configured retention sweepers (SOC-2 / HIPAA / FINRA) while respecting active audit/legal holds on `AuditLogSink`.

### Fail-Closed Policy Evaluation & Governance Audit Trail
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 46: Enterprise Policy & Admin Governance Hooks (Org-Level Kill Switches)) -->

* **Fail-Closed Guarantee:** If the dynamic policy/feature-flag store becomes unreachable or returns malformed configuration, the platform must **fail closed** (blocking high-risk external egress and mutating capabilities while preserving mandatory audit logging) rather than defaulting open.
* **Non-Repudiable Governance Audit:** Every policy toggle and every runtime capability blocked by a kill switch must be logged to `AuditLogSink` with `(tenantId, adminPrincipalRef | runId, policyKey, oldValue, newValue, timestamp)`.

### Zero-Framework Core Package Boundary & Architecture Lint Gates (`@internal/agent-core`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 48: Zero-Dependency Core Prompt & Evaluation Separation) -->

Modeled on `microsoft/vscode-copilot-chat`'s decoupling of `@vscode/prompt-tsx`, tokenizers, and simulation runners from VS Code's Electron/UI host, the core reasoning and prompt-compilation engine (`@internal/agent-core`) is strictly isolated from infrastructure frameworks:

* **Forbidden Imports in `@internal/agent-core`:**
  * Zero imports from `@backstage/*` (backend or frontend packages), `express`, React, `@temporalio/*`, or raw database/Redis drivers (`knex`, `ioredis`, `pg`).
  * All external capabilities—model invocation (`ModelExecutor`), token counting (`TokenCounter`), capability execution (`CapabilityInvoker`), memory/artifact retrieval, and telemetry sinks—enter exclusively via **pure TypeScript interfaces** injected at runtime.
* **CI Architecture Lint Gates (`eslint-plugin-boundaries` / `dependency-cruiser`):**
  * Automated CI lint rules fail the build immediately if any file inside `@internal/agent-core` imports a forbidden framework package or performs direct `fetch` / `fs` / `process.env` access.
* **Sub-Millisecond Headless Testing & CI Evals:**
  * Because `@internal/agent-core` has zero host-runtime dependencies, Vitest unit suites and Promptfoo / DeepEval trajectory benchmarks execute in milliseconds in headless CI pipelines without booting a Backstage backend, PostgreSQL instance, or Temporal server.
