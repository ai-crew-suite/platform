# Discovery: 04 - Tool & Capability Registry

This staging file collects all raw research and design notes related to the unified tool interface, tool discovery and categorization, Model Context Protocol (MCP) server adapters, native Backstage capability wrappers, per-tool permission metadata, and downstream credential exchange via the token broker. All notes captured here govern how external actions are registered, authorized, and safely invoked by agents.

### Provider-Independent Tool IDs & Effect Classification
<!-- Source: incoming/_AGENT_Q_AND_A.md (Section 4) -->

* **Provider-Neutral Tool Naming:** Capability modules must register tools under provider-independent IDs (e.g., `feature_flags.flag.list`, `feature_flags.flag.get`) rather than vendor-specific IDs (`launchdarkly.list_flags`). Active driver selection happens inside the tool via configuration or per-call arguments so agent `toolIds` allow-lists remain portable across providers.
* **Read vs. Write Effect Separation:** Every tool definition must explicitly classify its side-effect tier (`effect: 'read'` vs. `effect: 'write'`). Read operations form the baseline contract; write operations require deliberate review and approval-policy integration.
* **Typed Limitations Over Silent Failures:** When a concrete driver does not support a capability defined on the category contract, the tool must return a structured `limitations` field rather than throwing an unhandled error or returning empty arrays (`[]`).

### Per-Call Provider Routing & `ToolExecutor` Allow-List Enforcement
<!-- Source: incoming/_AGENT_Q_AND_A.md (Section 6) -->

* **v1 Shortcoming (Installation-Wide Driver Resolution):** In v1, tool inputs lack a `providerId` field, forcing capability modules to resolve a single driver installation-wide. Two different workflow plugins cannot target different backends (e.g., Plugin A using Slack while Plugin B uses an internal messaging tool) without forking provider-specific tool IDs.
* **Standardized `providerId?: string` on Driver Inputs:** All category driver input types must include an optional `providerId?: string` field, and returned entities must be tagged with their resolved `providerId`. Never fork tool IDs per vendor (e.g., keep `communication.message.post`, not `slack.message.post`).
* **Deterministic Provider Resolution Chain:** When executing a category tool, resolve the target driver in strict priority order:
  1. Explicit `providerId` argument on the tool call.
  2. Agent-level configuration default.
  3. Module-level default driver.
  4. Return a structured `limitations` response if multiple drivers exist and selection is ambiguous (never silently pick an arbitrary driver).
* **Policy Enforcement in `ToolExecutor`:** `ToolExecutor` acts as the single enforcement choke point for provider restrictions. Before dispatching to a driver, it checks the resolved `providerId` against the agent's category allow-list (`providers?: Record<string, readonly string[]>`). Any mismatch must emit an audited `tool_denied` error event, matching `toolIds` and write-gating enforcement.

### Scoped Tool Exposure & Dynamic Skill Loading
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Over-Engineering & Framework Traps) -->

* **Scoped Tool Filtering:** The tool registry must support filtering and resolving small, targeted subsets of tools (by explicit `toolIds`, category, or dynamic skill activation) rather than exposing all registered tools globally to an agent.

### Tool Schema Rigor, Output Bounding & Deterministic Validation
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Prompt & Context Anti-Patterns) -->

* **Bounded Tool Outputs (Anti-Context Poisoning):** `ToolExecutor` must enforce a maximum inline output size threshold. When a tool returns a massive payload (e.g., large logs or scrapes), `ToolExecutor` must truncate, summarize, or spill the full output to an ephemeral run artifact and return only a bounded preview plus an artifact reference/path to the LLM.
* **LLM-First Tool Descriptions & Schemas:** Every tool definition must provide explicit, unambiguous descriptions covering parameter formats, edge cases, constraints, and empty-result behavior—treating the schema as the LLM's primary user manual to prevent hallucinated arguments.
* **Deterministic Input/Output Guards Over Prompt Patching:** Enforce strict Zod schema validation and clear, actionable validation error messages at the tool boundary so malformed arguments fail deterministically in code rather than relying on negative prompt rules (`"NEVER do X"`).

### Actionable Tool Error Payloads for LLM Self-Correction
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Control Loop & Error Handling Mistakes) -->

* **Never Swallow Diagnostic Context:** When a tool fails, `ToolExecutor` and tool implementations must return structured, actionable error messages (including root cause, invalid field details, or valid alternatives—e.g., `"File not found at /tmp/x; existing files are /tmp/y"`) rather than generic `"Command failed"` strings, enabling the LLM to self-correct on its next turn while still respecting redaction rules.

### Hard Approval Gates & Sandboxed Execution
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Security & Evaluation Blind Spots) -->

* **Deterministic Enforcement at Tool Dispatch:** `ToolExecutor` must enforce RBAC checks, `effect: 'write'` human-approval gates, and execution sandboxing (OS/container/filesystem boundaries) in code before invoking any driver, treating LLM tool-call arguments as untrusted input.

### Dry-Run Patterns, Stateful Tool Sessions & Structured Observations
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Tool & Environment Interface Flaws) -->

* **Two-Phase Preview/Dry-Run & Commit for Destructive Tools:** Tools with `effect: 'write'` that perform high-blast-radius mutations (e.g., database updates, bulk notifications, infrastructure changes) must support a non-mutating preview/dry-run mode (or be split into explicit `plan`/`preview` and `commit` operations) so agents and human approvers can inspect the impact before execution.
* **Explicit State Modeling for Stateful Tools:** Tool contracts must never assume a stateless environment when wrapping stateful backends (e.g., shell working directories, environment variables, browser sessions, or open transactions). Stateful tools must either pass explicit session/cursor state in and out of every tool invocation or bind to an explicit scoped session handle tracked across turns.
* **Structured Observations Over Raw Text Blobs:** Tools must return concise, schema-validated JSON objects (or structured Markdown summaries) containing explicit status fields, key identifiers, and normalized results rather than raw unformatted text dumps, minimizing token waste and parsing hallucinations in downstream turns.

### Idempotency Key Contract for Write Tools
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Concurrency & Lifecycle Flaws) -->

* **Deterministic Idempotency Tokens on `effect: 'write'` Tools:** `ToolExecutor` must pass a deterministic idempotency key from the execution context into mutating tool invocations so downstream drivers (e.g., messaging, ticketing, cloud APIs) can deduplicate retried calls safely.

### Tiered Autonomy by Reversibility & Blast Radius
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Autonomy & UX Design Flaws) -->

* **Replace Binary Autonomy with Reversibility Tiers:** Avoid forcing an all-or-nothing choice between approving every trivial read or granting unrestricted write access. Every tool definition must declare its side-effect and reversibility tier:
  1. **Read-Only (`effect: 'read'`):** Executes automatically without interruption.
  2. **Reversible / Local Write (`effect: 'write'`, `reversibility: 'reversible'`):** Executes automatically (when permitted by RBAC) with mandatory structured audit logging and rollback metadata.
  3. **External / Irreversible Mutation (`effect: 'write'`, `reversibility: 'irreversible'`):** Automatically suspends execution and requires explicit human-in-the-loop confirmation before dispatch.
* **Policy-Configurable Tier Overrides:** Allow workflow definitions or operators to elevate a tool's approval threshold (e.g., requiring confirmation on reversible writes in production environments).

### Middle-Out Truncation, Headless Subprocess Guards & TOCTOU Concurrency
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Tool & Execution Blind Spots) -->

* **Middle-Out Output Truncation:** When `ToolExecutor` caps oversized tool outputs (e.g., command logs), it must truncate from the **middle**—preserving both the head (command context/headers) and the tail (stack traces and final exit errors)—while writing the complete unclipped stdout/stderr to an addressable run artifact.
* **Non-Interactive CLI Execution & Process-Group Cleanup:** Shell/CLI tools must execute in strictly headless mode: close `stdin` (`/dev/null`), inject non-interactive environment variables (`DEBIAN_FRONTEND=noninteractive`, `GIT_EDITOR=true`, `CI=true`), enforce a hard execution timeout, and kill the entire OS process group on timeout so backgrounded child processes never hang workers.
* **TOCTOU Race Condition Protection:** Mutating tools (`effect: 'write'`) must not assume external state remained unchanged during LLM reasoning latency. File tools must use atomic write-and-rename operations, and external API drivers (e.g., GitHub, Jira, Backstage Catalog) must pass ETags, resource versions, or optimistic concurrency preconditions when updating resources.

### Hard Blocker Signals on Missing Capabilities
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Cognitive & Planning Traps) -->

* **Distinguish Recoverable Errors from Terminal Blockers:** Tool error responses and capability `limitations` must explicitly flag whether a failure is transient/recoverable (e.g., validation error the LLM can fix) or a terminal capability blocker (e.g., missing tool, unconfigured driver, or denied RBAC permission) so the reasoning runtime escalates immediately instead of retrying or hallucinating alternatives.

### Predicate Providers, Isolated Harnesses & Scoped Publication Tools
<!-- Source: incoming/AGENT_RECONCILIATION_CONTROLLER_KAZI.md -->

* **Pluggable Predicate Providers:** Model verification checks (unit/integration test runners, static policy scripts, HTTP probes, deployment verifiers) as typed predicate providers that validate their own config schemas and emit structured `Observation` verdicts (`pass`, `fail`, `error`, `unknown`) plus immutable `evidenceRef` pointers.
* **Anti-Gaming & Held-Out Grader Isolation:** Execute repair harnesses inside ephemeral, isolated workspaces/containers pinned to a `baseCommit` and pinned tool image with resource/network limits. Protected `guard` checks and `held-out` grader inputs must run in detached clean environments outside the repair agent's read/write reach so the agent cannot weaken tests, edit graders, or hardcode held-out cases.
* **Dedicated Publication Identity & Reconciliation:** Gate PR creation, merges, and deployments behind a dedicated publication service/tool using least-privilege credentials separate from the repair harness. On uncertain outcomes (e.g., worker crash mid-PR/deploy), reconcile external state before retrying rather than blindly re-publishing.
* **Stateless/Activity-Scoped MCP Clients:** When integrating MCP servers with Temporal (e.g., via `TemporalMCPClient` / `mcpClientFactories`), ensure tool discovery and execution run inside Activities with bounded process lifecycles.

### Local Failure-Count Cooldowns in `ToolExecutor`
<!-- Source: incoming/CODING_STANDARDS.md (Section B.1) -->

* **Per-Tool & Category Cooldown Windows:** Implement retry classification, exponential backoff, and local failure-count-throttled cooldown windows directly inside `ToolExecutor` (configured via `hardening.maxRetries` and `hardening.retryBackoffMs`) so repeatedly failing tools or capability categories shed load locally without distributed state coordination.

### `ToolExecutor` Fault-Injection Seams
<!-- Source: incoming/CODING_STANDARDS.md (Section D.2) -->

* **Injectable Failure Modes:** `ToolExecutor` must support clean dependency injection/mock seams in tests to simulate `429` rate limits, `timeoutMs` expirations, and malformed tool return payloads so cooldown windows, cancellation propagation, and budget counters can be verified in fast integration tests.

### Independent Predicate Verifier Contract & Bound Evidence Metadata (P1)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P1 - Predicate evaluation and evidence) -->

* **Agent-Independent Verifier Contract:** Define a typed predicate verifier/provider contract that evaluates acceptance checks and regression guards independently of the executing agent's completion claims.
* **Four-State Verdict Taxonomy:** Every predicate evaluation must return one of four explicit verdicts: `'pass' | 'fail' | 'error' | 'unknown'`.
* **Cryptographically & Temporally Bound Evidence:** Every `Observation` record must bind its verdict to:
  * Exact `candidateDigest` (e.g., commit SHA or artifact hash).
  * `verifierVersion` and target execution environment identifier.
  * `observedAt` timestamp.
  * Compact `evidenceRef` pointing to sanitized external evidence (never embedding raw secrets or oversized logs directly in the observation payload).

### Stable Operation Keys, Pre-Retry Reconciliation & Candidate Workspace Isolation (P4)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P4 - Recovery-safe side effects, budgets, and provenance) -->

* **Stable Operation Keys & External Outcome Reconciliation:** Because Temporal activities can execute more than once if a worker crashes right after an external call succeeds, all external side effects (LLM calls, verifier jobs, workspace mutations, PR creation, deployments) must pass stable operation/idempotency keys where supported and query/reconcile external state before retrying uncertain operations.
* **Isolated Candidate Workspace & Provenance Tracking:** For code/patch remediation runs, provision an isolated candidate workspace and artifact lifecycle pinned to an immutable `baseCommit` digest, recording the resulting `candidateDigest` on every snapshot.
* **Write-Isolate Verifier Config & Protected Checks:** Verifier definitions, checker scripts, and held-out test inputs must reside strictly outside the repair agent's write permissions so the agent cannot weaken tests or alter graders.
* **Separate Verification from Publication:** Return a verified candidate patch plus its bound evidence first; perform PR creation, merges, and deployments as separate, independently authorized operations.

### Reproducible Execution Environment Profiles & Sandbox Provisioning (P9)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P9 - Reproducible execution environment profiles) -->

* **Versioned `ExecutionEnvironmentProfile` Contract:** For code- or environment-mutating agents, define a versioned, vendor-neutral workspace provisioning profile specifying:
  * Base repository revision(s) (`baseCommit` / ref).
  * Pinned runtime or container image digest.
  * Deterministic setup/bootstrap commands (executed and verified prior to agent dispatch).
  * Permitted network and egress rules.
  * Compute resource caps (CPU, memory, disk, wall-clock TTL) and post-run cleanup policy.
* **Bind Environment Digest to Every Observation:** Compute a canonical digest over the resolved profile and provisioned environment, recording both the profile version and environment digest on every `Observation` so verification evidence is reproducible and auditable.
* **Sandbox-Vendor Neutrality:** Model workspace provisioning behind an abstract `WorkspaceProvider` contract so local containers, remote cloud runners, or CI-based sandboxes can plug in without coupling core execution to a single sandbox vendor.

### Async External Operation Handles & Status Verification Contract (P13)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P13 - Durable waiting for external operations) -->

* **Async Operation Tool Pattern (`TOOLS_INTERFACE_OPTIONS.md`):** Tools wrapping long-running external systems (CI, deployments, provisioning, PR checks) must implement an asynchronous operation contract that:
  * Initiates the remote job idempotently and returns a stable `OperationHandle` (`operationId`, `providerId`, `correlationKey`) plus an explicit lifecycle state (`pending`, `running`, `succeeded`, `failed`, `cancelled`).
  * Exposes a corresponding `getOperationStatus(handle)` verification method used both for bounded fallback polling and final state confirmation prior to workflow continuation.

### Just-In-Time Credential Resolution & Zero Privilege-Escalation Fallback (P14)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P14 - Reauthorization and credential renewal during a run) -->

* **Resolve Credentials Just-In-Time at Activity Execution:** The token broker and `ToolExecutor` must resolve short-lived downstream credentials dynamically at the exact moment an activity executes using an opaque principal/session reference—never reading pre-baked tokens from workflow inputs or serialized state.
* **Never Silently Fall Back to Broader Service Credentials:** If a user's delegated OAuth token or authorization has expired or been revoked mid-run, the token broker must fail with a typed `reauth_required` signal/error—**never** silently falling back to a broader installation-wide or service-principal credential.

### Pluggable `ToolRegistry`, Post-Boot Freeze & RBAC-Filtered Discovery
<!-- Source: incoming/TOOL_REGISTRY_AND_STATE_SERIALIZER_IMPLEMENTATION_PLAN.md -->

* **Decoupled `ToolRegistry` Contract:** Isolate tool collection, schema lookup, and listing behind a clean `ToolRegistry` interface (`register`, `get`, `list`, `freeze`) so `ToolExecutor` remains decoupled from underlying storage or caching implementations.
* **Hybrid Executable Registry + SQL Metadata Inventory:** Keep executable tool handlers in a boot-frozen `InMemoryToolRegistry` (rejecting duplicate tool IDs with `ConflictError`), paired with a SQL `ToolRegistryStore` (`kernel_tool_inventory`) that persists tool schemas, descriptions, audit history, and operator enable/disable toggles without requiring backend redeploys.
* **RBAC-Filtered Tool Discovery:** Wrap tool discovery lookups with an authorization filter (Backstage `PermissionsService` / OPA) so unauthorized tools are hidden from both API discovery and LLM tool definitions before invocation is even attempted.

### Category-Grouped `ToolRegistry`, `ToolExecutionContext` & Concurrent Fan-Out
<!-- Source: incoming/TOOLS.md -->

* **Domain Category Aggregator (`getByCategory`):** Extend `ToolRegistry` beyond flat `get(id)` lookups by indexing tools under domain categories (e.g., `cloud-providers`, `communication`, `compliance`, `incidents`, `kubernetes`, `observability`, `project-management`, `scorecards`, `scm`, widened via `string & {}` so new third-party capability categories do not require core union edits).
* **Deterministic Registration Ordering:** `ToolRegistry.list()` and `getByCategory()` must return read-only collections in deterministic registration order and reject duplicate IDs at registration time.
* **Mandatory `ToolExecutionContext` Frame:** Every tool invocation must receive a structured `ToolExecutionContext` carrying non-nullable `identity` (`UserRef`/Service Principal), `runId`, `logger`, `signal: AbortSignal` (for cooperative timeout/cancellation), and scoped `credentials`.
* **Standardized `ToolInvocationResult` Envelope:** Normalize all tool outcomes into a uniform result envelope (`toolId`, `category`, `output`, `summary`, `executedAt`) so concurrent multi-tool fan-out results can be aggregated cleanly.
* **Reconciliation Note on Fan-Out Dispatch:** Multi-tool category broadcasts must still dispatch through `ToolExecutor` (filtered by the agent's `toolIds` and `providers` allow-lists) rather than calling `tool.invoke()` directly, ensuring RBAC, cooldowns, redaction, and audit logging apply to every fanned-out call.

### Semantic Equivalence, Brand Namespace Isolation & Centralized Outbound Gateway
<!-- Source: incoming/TOOLS_EXPLANATIONS.md -->

* **Semantic Contract Equivalence Across Providers:** Common category capabilities (e.g., `scm.pr.create`) must guarantee identical semantic behavior and normalized I/O schemas across every implementing driver (GitHub, GitLab, Bitbucket) so switching `providerId` never changes how an agent reasons about or invokes the capability.
* **Strict Brand Namespace Isolation at Boot:** Any vendor-specific capability exposed outside a shared category contract must be strictly prefixed with its own `providerId` namespace (e.g., `github.workflow.dispatch`, `gitlab.pipeline.trigger`). Registration validation must reject cross-brand namespace collisions at startup ("fail boot, not first run").
* **Centralized Outbound Credential & Policy Gateway:** Like Conduit's centralized Connector gateway, individual drivers must never hold ambient credentials or make unmediated outbound calls; all invocations route through the central `ToolExecutor` + Token Broker gateway for uniform auth injection, RBAC, and auditing.
* **Design Scope Boundary (Reject Console-Declared Tools):** Unlike Conduit's "Author" console feature, do **not** allow administrators to define new tool schemas dynamically via UI/config at runtime; preserve compile-time TypeScript contract safety via the Module Contract Pattern (`_AGENT_Q_AND_A.md` §4).

### Argument Slot Provenance, Capability Preflight Reports & Capped Driver Handshakes
<!-- Source: incoming/TOOLS_EXPLANATIONS.md (Section 1.5) -->

* **Argument Slot Provenance (Prompt-Injection Defense):** Tool parameter schemas must support declaring per-argument **provenance rules** enforced deterministically by `ToolExecutor` (complementing, not replacing, RBAC):
  * `context`: Supplied exclusively by the trusted execution gateway from run/entity context (e.g., `repo`, `baseBranch`, `tenantId`); any model-generated value for this slot is ignored or rejected so indirect prompt injection cannot redirect target resources.
  * `constrained`: Model may propose a value (e.g., `reviewer`, `channelId`), but `ToolExecutor` validates it against a trusted allow-list/policy before dispatch.
  * `model`: Free-form model-authored input (e.g., `title`, `body`), subject to standard Zod schema and content validation.
* **Per-Caller Capability Preflight Report:** Provide a non-executing discovery/preflight check returning determinate per-caller availability statuses for requested capabilities (e.g., `ready`, `connect_account`, `not_served` with `servedBy` hints, or `denied`) before workflow execution starts.
* **Bounded Multi-Step Driver HTTP Handshakes (`maxSubRequests = 4`):** Allow drivers whose underlying protocol requires multi-request handshakes (e.g., fetching a CSRF crumb or pagination/session token before mutating) to execute a capped `Fill -> next Intent` loop (strictly capped at 4 steps per tool invocation) mediated through the outbound credential gateway.

### Capability Promotion Rules, Adapter Mappings & OAuth PKCE Token Broker
<!-- Source: incoming/TOOLS_EXPLANATIONS.md (Sections 2.1 & 5) -->

* **Second-Provider Rule for Core Capability Promotion:** Promote a vendor capability into the provider-neutral core category contract (e.g., `ci.pipeline.trigger`) only when at least two providers support it with shared, meaningful semantics. Retain the original vendor-namespaced capability (e.g., `github.actions.dispatchWorkflow`) alongside the common capability so existing callers do not break and vendor-unique features remain accessible.
* **Pure Argument-Translation Adapters & Explicit `not_served` Status:** Driver mappings act strictly as argument/shape translators between the neutral category schema and the provider's native operation—never executing I/O inside the mapping layer. When a selected driver has no mapping for a requested common capability, return a determinate `not_served` status rather than guessing or falling back silently.
* **Server-Side Token Broker with OAuth 2.1 PKCE (`S256`):** Implement OAuth 2.0 authorization code flows in the server-side token broker using **PKCE (`code_verifier` + SHA-256 `code_challenge`)** in addition to confidential `client_secret` authentication where supported or required, protecting against authorization code interception and injection attacks.

### Declarative Capability Requirements, Credential Scopes & Credential-Tier RBAC
<!-- Source: incoming/TOOLS_INTERFACE.md -->

* **Expressive Agent Capability Prerequisites:** Beyond simple `toolIds` allow-lists, agents and workflows must be able to declare structured capability dependencies evaluated at preflight and boot:
  * **Mandatory vs. Optional Categories:** Distinguish hard requirements (e.g., `scm` required) from optional progressive-enhancement categories (e.g., use `finops` if registered, degrade gracefully if absent).
  * **Extended Contract Features:** Require specific extended capabilities beyond a category's minimal base contract (e.g., requiring extended SCM PR-review features that a basic Git driver cannot satisfy).
  * **Specific Provider & Co-Dependency Constraints:** Express constraints requiring a specific vendor (`scm` must be `github`), one-of-a-set (`github` or `gitlab`), or co-installed categories (`finops` AND `project-management` both active).
* **Explicit Credential Scope Taxonomy (`user` | `org` | `either` | `both`):** Every tool/driver operation must explicitly declare its supported credential scope:
  * *User-delegated credentials* passed via the Backstage user session (e.g., GitHub user OAuth).
  * *Organization / sub-organization credentials* configured at the Backstage installation level (e.g., Datadog API key).
  * *Hybrid (`either` or `both`)* where both user identity and org-level tokens are required or selectable.
* **RBAC Gating on Credential Scope per Action:** Backstage `PermissionsService` checks must evaluate not only *whether* a caller can invoke a tool action, but *which credential scope* is permitted for that action (e.g., allowing a write action when backed by individual user credentials while denying the same action under shared org-wide credentials).

### Open Architectural Decisions to Resolve Before Build
<!-- Source: incoming/TOOLS_INTERFACE_OPTIONS.md (Open Questions) -->

1. **Token Broker Day-One Scope & KMS Refresh-Token Storage:** Confirm which providers require `user` standing on day one (e.g., GitHub, Jira) and whether enterprise security/compliance approves server-side KMS-envelope-encrypted storage of user OAuth refresh tokens.
2. **Multi-Instance Provider Binding & Per-User Selection:** Confirm whether a single Backstage installation must bind multiple instances of the same provider simultaneously (e.g., `github.com` alongside `GHES`) and whether individual users can select between them (which determines whether Conduit's Rung 2 per-user selection is needed in the resolution ladder).
3. **Authoritative Source for Write-Approval Policies:** Decide whether conditional write-approval rules (`approval: 'policy'`) are authored inside Backstage's Permission Policy, inside `AgentDefinition` manifests, or delegated to an external policy engine (OPA / Cedar).
4. **Data Classification Ownership & `regulated` Caching Rules:** Establish who assigns `dataClass` (`public` | `internal` | `confidential` | `regulated`) on vendor and org capabilities, and decide whether `regulated` strictly forbids L2 Redis caching or enforces a short TTL cap.
5. **Third-Party Driver Distribution (WASM Tier Trigger):** Confirm whether enterprise customers will ever install untrusted/third-party drivers not authored in-house; if not, defer the WASM sandbox tier indefinitely.

### Recommended Tool Architecture: Option B Contract + Option C Temporal Plane (-> Option D Topology)
<!-- Source: incoming/TOOLS_INTERFACE_OPTIONS.md (Sections 1.5 - 4) -->

* **Core Architectural Decision (Option B + Option C, Growing into Option D):**
  * **Contract & Gateway Model (Option B):** Build the tool layer as a Capability Catalog + Describe/Execute Gateway library with a pluggable stage-8 `execute` seam. Drivers are pure TypeScript transformers (`prepare(call) -> HttpIntent`, `fill(call, sent, answer) -> { result } | { next: Intent } | { error }`, capped at `MaxSteps = 4`) with **zero network imports** (enforced by architecture/lint tests). A single central `HttpConnector` executes every `HttpIntent`, injects credentials last, enforces host allow-lists, refuses redirects, and confines paths.
  * **Controlled `NativeAdapter` Escape Hatch:** Support SDK-bound protocols (`cloud-providers` using AWS SigV4, GCP gRPC, Kubernetes clients) via `native` adapters that receive a gateway-injected signer/client rather than raw secrets.
  * **Execution Plane (Option C):** Route synchronous, cacheable interactive reads through an in-process gateway fast path for low P95 latency, while routing writes, `async` operations, and background reads onto Temporal activities running on **per-provider-instance task queues** (e.g., `drivers.github-ghes-prod`). Both paths run the exact same gateway policy pipeline with only stage 8 swapped.
  * **Future Deployment Topology (Option D):** Keep the gateway cleanly separable so high-compliance deployments can later extract it into a standalone Driver Gateway service (with on-behalf-of user tokens, network egress isolation, an MCP facade, and an optional signed WASM `prepare`/`fill` tier via `host_egress`) without rewriting drivers or workflows.
* **Three-Layer Capability Identity & Explicit Owner Metadata:**
  * `core` (`<category>.<noun>.<verb>`, e.g., `scm.pullRequest.create`): Platform-owned common contract; vendor capabilities promote to `core` once a second provider serves them meaningfully, while keeping the original vendor ID intact.
  * `vendor` (`<provider>.<noun>.<verb>`, e.g., `github.actions.dispatchWorkflow`): Driver-owned extension; drivers declaring IDs outside their registered namespace fail boot.
  * `org` (`<orgns>.<provider|category>.<verb>`, e.g., `acme.github.fileSecurityException`): Installation-specific capability or instance-level mapping override; ownership is authoritative via explicit descriptor metadata (`owner: { kind, id }`), not segment counting.
* **Single-Source-of-Truth `CapabilityDescriptor` & Slot Provenance:** Drive LLM tool schemas, requirement solvers, RBAC, cache invalidation, and docs from one declarative descriptor carrying `effect` (`'read' | 'write' | 'destructive'`), `mode` (`'sync' | 'async'`), `slots[].provenance` (`'context' | 'user' | 'constrained' | 'model'`), `standing`, `idempotency`, `cache`, `invalidates`, `dataClass`, and `approval`.
* **Boolean Requirement Algebra & 8-State Preflight Matrix:** Support `requires` (`unavailable` if unmet) and `optional` (`degraded` if unmet) across `category`, `provider`, `capability`, `allOf`, `anyOf`, `exactlyOne`, and `not(...)` evaluated at **boot**, **run start**, and **call time** into determinate states (`ready`, `connect_account`, `unbound`, `not_served` with `servedBy`, `not_permitted`, `disabled`, `degraded`, `not_declared`).
* **Server-Side Token Broker & Three-Mode Standing (`user` | `service:<scope>` | `service+actor`):** Store KMS-envelope-encrypted OAuth 2.0 + PKCE refresh tokens per `(userRef, providerInstanceId)` and mint short-lived access tokens at activity call time. Enforce explicit fallback rules (`fallback: 'deny' | 'service'`)—never silently escalating from an expired `user` token to a broader `service` credential.
* **Two-Tier Caching (L1 LRU + L2 Redis), Singleflight & Adaptive Rate Limiting:** Partition cache keys by standing identity (`userRef` vs. `service:<scope>:<credId>`), support `none`/`ttl`/`swr`/`conditional` (`ETag`/`If-None-Match` 304s), write-triggered `invalidates` tags, negative caching, cross-pod Redis singleflight locks, and header-adaptive Redis token buckets (`X-RateLimit-Remaining`, `Retry-After`) with priority classes (`interactive > agent-foreground > background`), bulkheads, and circuit breakers.

### Domain-Grounded Pre-Execution Validation

<!-- Source: incoming/WRITING_AN_AGENT.md (Section 1: Cascading Errors and Infinite Loops) -->

Static Zod schema validation is necessary but insufficient when agent arguments reference enterprise entities.

- **Live Catalog Grounding:** Pair Zod input schemas with pre-execution lookups against the Backstage Software Catalog (`CatalogApi`) to verify that referenced `entityRefs`, owner groups, systems, and resource targets exist and are active *before* dispatching external mutations.
- **Constructive Validation Errors:** When a Zod check or catalog existence check fails, return a structured validation error payload describing the invalid field or missing `entityRef` so the reasoning runtime can self-correct without tripping infrastructure side effects.

### Risk-Tiered Tool Policies, OBO Token Broker & Dry-Run Approval Previews
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 3: Unintended Actions and Permissions) -->

To eliminate "confused deputy" vulnerabilities and prevent unreviewed infrastructure mutations, every capability registered in `CapabilityGateway` enforces least-privilege scoping and risk-tiered execution gates:

1. **Three-Tier Cascading Tool Policy Filtering:**
   - Effective tool visibility for any reasoning turn is computed as the strict intersection of:
     1. **Global Platform Profile** (e.g., `minimal`, `readonly`, `coding`, `standard`),
     2. **Agent / Workflow Manifest Allowlist** (declared capability requirements), and
     3. **Runtime Context & Sub-Agent Policy** (spawned sub-agents inherit a narrowed toolset by default, stripped of control-plane, session-management, and destructive capabilities).
2. **Risk-Tiered Action Classification (`READ`, `WRITE_LOW`, `WRITE_HIGH`):**
   - Every `CapabilityDescriptor` declares an explicit risk tier:
     - **`READ`:** Auto-executes after RBAC and catalog validation.
     - **`WRITE_LOW`:** Requires lightweight interactive UI confirmation (optionally scoped to the current `runId`).
     - **`WRITE_HIGH`:** Mandatory async Human-in-the-Loop (HITL) approval before execution. Per-action approval is required; blanket session-wide `allow-always` overrides are prohibited for `WRITE_HIGH` actions in regulated environments.
3. **Mandatory `dryRun` Diff Previews:**
   - All `WRITE_HIGH` capabilities must implement a pre-execution `dryRun` phase that produces a human-verifiable artifact (e.g., unified Git diff, Terraform plan summary, Kubernetes manifest patch, or parameterized SQL preview) rendered inside the HITL approval card to prevent blind approval fatigue.
4. **On-Behalf-Of (OBO) Token Broker Resolution (No Shared Admin Tokens):**
   - `CapabilityGateway` never uses static "super-admin" service credentials for user-initiated mutations. At execution time inside the activity worker, the Token Broker exchanges the run's opaque `oboGrantRef` for a short-lived, minimum-scope user token (e.g., GitHub User-to-Server token or scoped OIDC token), enforcing downstream repository and cluster ACLs natively.
5. **Ephemeral Sandboxed Workspaces:**
   - Capabilities that clone repositories, execute CLI binaries, or modify files must run inside isolated, network-restricted ephemeral containers with `workspaceOnly` path confinement (blocking access to host credentials or environment files) and immediate teardown on completion.

### Outbound Egress Domain Allowlists & Taint-Aware Gate Enforcement
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 4: Prompt Injection) -->

Even if an indirect prompt injection compromises LLM reasoning, `CapabilityGateway` enforces deterministic containment outside the model context window:

- **Strict Egress Domain Allowlists:** All `HttpIntent` and web-fetch capabilities must declare explicit domain/CIDR allowlists in their `CapabilityDescriptor` (validated against platform security policy). Requests to arbitrary external hosts are rejected deterministically before network dispatch.
- **Taint-Driven Risk Tier Promotion:** `CapabilityGateway` inspects the run's durable taint state prior to execution; if `tainted === true`, any capability normally classified as `WRITE_LOW` is promoted to `WRITE_HIGH` and routed through the async HITL approval gate.

### Tool Output Projection, `ArtifactSink` Offloading & RBAC-Scoped Caching
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 5: Latency and Token Costs) -->

To keep LLM context windows lean and avoid re-fetching expensive enterprise APIs, `CapabilityGateway` standardizes payload shaping and caching:

- **Schema-Driven Response Projection:** Capability adapters strip noisy Backstage and Kubernetes boilerplate (`managedByLocation`, verbose annotations, redundant `relations` graphs) before returning results to the reasoning loop.
- **Token-Capped Truncation & `ArtifactSink` Cursor Offloading:** When a tool output exceeds a configured token/byte cap (e.g., Kubernetes pod logs, CI build logs, large OpenAPI specs), `CapabilityGateway` persists the full payload to the encrypted **`ArtifactSink`** (scoped to `runId`) and returns only a bounded slice (e.g., last 50 lines) alongside an `artifactId` and cursor tool (`readArtifactSlice`) for targeted inspection.
- **RBAC-Scoped Plan & Lookup Caching:** Cache deterministic read-only lookups and validated execution plans in Redis/PostgreSQL keyed by `(tenantId, rbacScopeHash, capabilityVersion, normalizedArgsHash)` with short TTLs—strictly isolated by tenant and caller permissions to prevent cross-user leakage.

### Optimistic Concurrency Control (OCC) for State-Mutating Capabilities
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 8: Concurrency and Lane Locking) -->

Because multi-step reasoning and async HITL approvals introduce time gaps between reading infrastructure state and mutating it, `CapabilityGateway` enforces compare-and-swap version checks on write operations:

- **Version Stamp Capture & Verification:** Capabilities classified as `WRITE_LOW` or `WRITE_HIGH` must capture and verify the target resource's concurrency token from the prior `READ` / `dryRun` phase—specifically Backstage Catalog `metadata.etag`, Git `HEAD` commit SHA, or Kubernetes `resourceVersion`.
- **Safe Conflict Recovery:** If the upstream resource changed before execution, `CapabilityGateway` aborts the write without mutating state and returns a structured `CONFLICT_STALE_VERSION` observation so the reasoning loop re-reads current state and regenerates an updated `dryRun` diff.

### Context-Aware Tool & Skill Pre-Filtering and Dynamic Schema Binding
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 9: On-Demand Skill Loading) -->

Rather than exposing every registered capability on turn one, `CapabilityGateway` filters and binds tool schemas dynamically based on Backstage context, RBAC, and active skills:

- **Entity-Context & RBAC Pre-Filtering:**
  - Before the initial LLM call, filter available skills and baseline tools against the active Backstage view (`kind`, `spec.type`, entity annotations such as `kubernetes.io/app-id`) and `@backstage/plugin-permission-node` RBAC rules. Unauthorized or irrelevant skills/tools are omitted from the prompt entirely.
- **Dynamic Tool-Schema Binding on Skill Activation:**
  - Non-baseline capability schemas remain unbound until their owning skill is activated via `activate_skill(skillId)`. Upon activation, `CapabilityGateway` re-validates caller RBAC permissions and binds only that skill's declared `CapabilityDescriptor` JSON schemas into the active Vercel AI SDK tool map.

### Ephemeral Container / MicroVM Sandboxing & Zero-Credential Execution
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 11: System-Level Blast Radius) -->

Capabilities requiring shell execution, repository manipulation, or file synthesis execute inside hardened, single-use sandboxes scoped to `temporalWorkflowId`:

- **Kernel & Filesystem Hardening:** Run sandboxed capabilities inside ephemeral **gVisor**, **Firecracker**, or rootless Kubernetes Jobs configured with `readOnlyRootFilesystem: true`, `cap_drop: ["ALL"]`, non-root UIDs, strict CPU/memory/PID cgroup limits, and an ephemeral `tmpfs` `/workspace` volume (`workspaceOnly` symlink-escape protection).
- **Deterministic Teardown:** Destroy the sandbox container/microVM and wipe `/workspace` inside a `finally` block immediately upon activity completion or failure.
- **Zero Ambient Credentials:** Never mount cloud IAM roles, Kubernetes service-account tokens (`automountServiceAccountToken: false`), or static API keys into sandbox pods. If a sandboxed CLI explicitly requires an authenticated endpoint, inject a short-lived, single-scope token resolved directly from the Token Broker into process memory—never via Temporal payloads or disk files.

### Zero-Knowledge Credential Broker, Destination Binding & Ephemeral Credentials
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 12: Secret Isolation) -->

Neither the LLM context window, worker `process.env`, nor sandboxed subprocesses ever hold raw downstream API keys or OAuth tokens. `CapabilityGateway` enforces zero-knowledge credential isolation:

1. **Credential-Injecting Egress Proxy (`HttpIntent` -> Token Broker):**
   - Tools declare declarative `HttpIntent` descriptors referencing an opaque `secretRef` (e.g., `vault://secret/data/teams/<team>#github-app`) or `oboGrantRef`.
   - `CapabilityGateway` dispatches the request through an internal credential-injecting egress proxy (Envoy / Backstage Token Broker) authenticated via a short-lived, single-use Temporal Task Token / internal mTLS JWT. The broker resolves the credential from Vault / AWS Secrets Manager, injects the `Authorization` header outside worker/sandbox memory, and forwards the upstream call.
2. **Strict Destination Host Binding (Anti-Replay):**
   - Every `SecretRef` policy binds the credential strictly to an allowlisted target origin/domain (e.g., `github-token` may only be injected on requests targeting `https://github.com`). Attempts to pair a `SecretRef` with an unapproved URL are rejected immediately with `PERMISSION_DENIED`.
3. **Short-Lived Dynamic Credentials (`<= 5m` TTL):**
   - Configure Vault Dynamic Secrets, AWS STS, and GitHub App Installation Tokens to issue ephemeral, single-scope credentials (`<= 5 minute` TTL) bound to `(temporalWorkflowId, catalogEntityRef)` so leaked or replayed tokens expire automatically.

### Four-Tier Progressive Autonomy, Blast-Radius Budgets & Reversible-First Design
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 13: Approval Fatigue vs. Autonomy) -->

To prevent approval fatigue without exposing enterprise infrastructure to unreviewed mutations, `CapabilityGateway` enforces a four-tier progressive autonomy model paired with reversible-first capability design:

1. **Tier 1 — Auto-Execute (`READ` & Reversible Drafts):**
   - Read-only capabilities (Catalog queries, TechDocs reads, log slices, `git diff`) and strictly reversible, branch-isolated drafts (opening a *Draft* PR or creating a backlog issue, where downstream branch protection enforces peer review) execute immediately once RBAC passes.
2. **Tier 2 — LLM-as-a-Judge Supervisor Gate (`WRITE_LOW` in Untainted Runs):**
   - Medium-risk non-destructive mutations (e.g., staging deployments, `catalog-info.yaml` annotation updates) route through an isolated Supervisor/Guardrail check before execution.
   - **Taint Override:** If the workflow run is marked `tainted = true`, Tier 2 auto-approval is disabled and the action escalates directly to Tier 3 human HITL approval.
3. **Tier 3 — Mandatory Durable Human-in-the-Loop (`WRITE_HIGH`):**
   - High-stakes mutations (production rollbacks, database migrations, secret rotations, infrastructure deletion) always suspend for explicit human approval backed by a `dryRun` diff preview and `Approve / Reject / Modify` controls.
4. **Tier 4 — TTL-Bounded Trust Rules & Numeric Blast-Radius Caps:**
   - **Time-Bounded `WRITE_LOW` Trust Rules:** Users may grant scoped temporary approval for `WRITE_LOW` patterns (e.g., *"Allow staging restarts for `component:default/payments-api` for 1 hour"*), persisted in an audited, TTL-bounded policy store (`<= 1 hour`, keyed by `tenantId`, `userEntityRef`, `catalogEntityRef`, `capabilityId`)—never in Mem0 or permanent un-expiring allowlists. `WRITE_HIGH` never permits blanket `allow-always` overrides.
   - **Per-Run Blast-Radius Budgets:** Enforce numeric mutation ceilings per workflow run (e.g., max `3` non-production catalog updates auto-approved per run; the `4th` escalates to human HITL) to halt runaway loops before widespread drift occurs.
5. **Reversible-First Capability Design:**
   - Prefer capabilities that emit reviewable artifacts (feature branch commits + Draft PRs, Terraform plan files, Kubernetes manifest diffs) over direct destructive mutations (`push` to `main`, `terraform apply`).

### API-First Ingestion Waterfall, Accessibility Snapshots & User-Isolated Browser Contexts
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 16: Bot Detection and Authentication Walls) -->

Headless browser automation is treated as a strictly governed last resort behind typed enterprise APIs and MCP servers:

1. **API & MCP First Capability Hierarchy:**
   - Never use browser scraping to access Jira, GitHub, Confluence, Datadog, or PagerDuty. Expose those systems via typed `HttpIntent` adapters, Backstage backend plugins, or MCP servers authenticated through the OBO Token Broker.
2. **Deterministic Ingestion Fallback Waterfall:**
   - Research and document-retrieval capabilities execute a deterministic progression inside Temporal Activities:
     1. **Internal Index Lookup:** Query Backstage Software Catalog and TechDocs first.
     2. **In-Process Clean HTTP Fetch:** Fetch allowlisted URLs via `HttpIntent` and extract Markdown locally using in-process Readability/HTML-to-Markdown parsers (never forwarding internal URLs to external third-party reader SaaS APIs).
     3. **Sandboxed Playwright Fallback:** Escalate to an isolated Playwright worker (`sandbox-execution-queue`) only when step 2 encounters an empty SPA shell or requires user-authenticated legacy web UI rendering.
3. **ARIA Accessibility Snapshots Over Raw DOM / Screenshots:**
   - Extract semantic accessibility-tree snapshots rather than raw HTML dumps or full-page screenshots to reduce token overhead and avoid brittle CSS selector failures.
4. **User-Isolated `storageState` & Deterministic Auth-Wall Detection:**
   - Never share browser profiles across users. Persist Playwright `storageState` encrypted via KMS envelope encryption partitioned strictly by `(tenantId, userEntityRef)` with bounded TTLs.
   - Run a deterministic page-state classifier before returning content to the LLM to detect SSO redirects (`okta.com`, `microsoftonline.com`), CAPTCHAs, Cloudflare interstitials, or `401/403` walls, immediately throwing a non-retryable `AuthenticationRequiredError` to prevent corporate SSO account lockouts.

### Resilient Browser Abstraction: Pruned ARIA Snapshots, Action Caching & Token Ceilings
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 17: UI Drift and DOM Bloat) -->

When sandboxed browser automation is invoked as a last-resort fallback (`sandbox-execution-queue`), the browser capability adapter enforces strict DOM compression and drift resilience:

1. **Interactive-Only ARIA Snapshots & Element Refs (`@playwright/mcp` / `@browserbasehq/stagehand`):**
   - Never return raw HTML markup. Serialize only the pruned accessibility tree containing interactive and semantic nodes (`role`, `name`, `value`) assigned deterministic short reference IDs (`ref=e12`), stripping `aria-hidden="true"`, decorative SVGs, and empty layout wrappers.
   - Disable full-page PNG vision screenshots by default; permit screenshot capture only as an explicit, gated escape hatch for non-ARIA `<canvas>` / WebGL elements.
2. **Hard Snapshot Token Ceiling (`4,000` Tokens) & Scroll Pagination:**
   - Enforce a deterministic `4,000`-token cap on every serialized ARIA snapshot. If dense enterprise tables (Grafana, ArgoCD, Jira) exceed the budget, truncate below the fold and append an explicit pagination/filter hint (`[Truncated: N more rows. Use browser_scroll or filter input ref=...]`).
3. **Self-Healing UI Action Caching:**
   - Cache resolved selector/action mappings in Redis keyed by `(tenantId, domain, urlPath, actionIntent, capabilityVersion)` (storing structural action metadata only, never user inputs or credentials).
   - On repeat runs, execute cached actions deterministically at zero LLM cost; if UI drift causes a selector miss, invalidate the cache entry and fall back automatically to semantic ARIA discovery.

### Per-Provider Rate-Limit Smoothing, 24h Idempotency Store & Compensation Contracts
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 18: API Rate Limits and Partial Failures) -->

To protect shared organizational API quotas (such as GitHub GraphQL points or Jira rate limits) and guarantee exactly-once side effects across retries:

- **Global Per-Provider Rate-Limit Smoothing:** Enforce `CapabilityGateway` concurrency semaphores and a distributed Redis token bucket keyed by upstream `providerId` (e.g., `github-enterprise`, `jira`, `argocd`), paired with Temporal `taskQueueActivitiesPerSecond` caps so bursty agent runs smooth outbound traffic automatically.
- **24-Hour Deterministic Idempotency Store:** Every `WRITE_LOW` and `WRITE_HIGH` capability propagates a deterministic `Idempotency-Key` (`${workflowId}:${stepIndex}:${toolCallId}`) to downstream APIs and records scrubbed, secret-free results in a tenant-prefixed Redis/PostgreSQL deduplication store (`tenant:${tenantId}:idem:${capabilityId}:${key}`) with a 24-hour TTL.
- **Declarative `compensate` Handler in `CapabilityDescriptor`:** Mutating capabilities that create external resources declare an optional idempotent `compensate(input, output)` handler invoked automatically during Temporal Saga rollbacks.

### Human-Readable Tool Progress Templates (`statusMessage`)
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 23: Streaming and Latency Perception) -->

- **Declarative `statusMessage` Formatter:** Every `CapabilityDescriptor` defines a deterministic `statusMessage(sanitizedInput)` template (e.g., `"Inspecting Kubernetes pods for component:default/payments-api..."`).
- **Pre-Execution Progress Emission:** Immediately prior to invoking the underlying capability adapter, the Temporal Activity emits a `tool_status` event to the run's Redis Stream so users see plain-English progress badges rather than raw internal tool identifiers.

### Zero-Trust MCP & Skill Supply Chain: Digest Pinning, Anti-Rug-Pull Verification & Pod Isolation
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 27: Supply-Chain Risk in Third-Party Skills) -->

Third-party skills and Model Context Protocol (MCP) servers introduce "semantic supply-chain" attacks (tool-description poisoning and post-approval schema rug-pulls) that traditional dependency scanners miss. `CapabilityGateway` enforces five deterministic controls:

1. **Internal Registry Mirroring & Immutable Pinning (Zero `npx -y @latest`):**
   - Runtime execution of unpinned packages (`npx -y ...@latest`, `uvx`, or mutable `:latest` container tags) is strictly prohibited. All approved community skills and MCP servers are mirrored to internal Git / OCI registries and pinned by **immutable Git commit SHA** or **OCI `sha256:` image digest**.
2. **Runtime SHA-256 Anti-Rug-Pull Digest Check:**
   - Every approved skill and MCP server entity in Backstage carries a signed content/schema digest (`agent.backstage.io/skill-digest`).
   - At hydration time (`activate_skill` or MCP `tools/list` discovery), `CapabilityGateway` hashes the loaded Markdown and JSON tool/parameter schemas and verifies an exact match against the pinned digest—failing closed (`SECURITY_DIGEST_MISMATCH`) and alerting `AuditLogSink` on any drift.
3. **Isolated Rootless MCP Pods with Token Broker Egress:**
   - External/third-party MCP servers run as isolated, rootless Kubernetes pods (never inside the Backstage backend process) with `NetworkPolicy` egress restricted solely to their designated upstream API (e.g., `api.linear.app`) and authentication injected via the **Token Broker** rather than static container environment variables.
4. **Deterministic Skill Capability Manifest Enforcement:**
   - Every skill and MCP server declares `allowedTools`, `allowedDomains`, and `maxRiskTier` in its manifest. `CapabilityGateway` enforces this envelope deterministically at tool dispatch time so a compromised skill cannot invoke undeclared capabilities.

### `SHARED_CHANNEL` Capability Narrowing & Private HITL Routing
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 29: Multi-Party and Group Chat Etiquette) -->

- **Per-Turn Intersection Enforcement:** In `SHARED_CHANNEL` sessions, `CapabilityGateway` intersects the **current turn speaker's** Backstage RBAC and OBO token permissions with a tightened channel tool profile (permitting read-only diagnostics and draft PRs while blocking direct destructive mutations in public threads).
- **Private HITL Approval Escalation:** Any `WRITE_HIGH` action initiated from a `SHARED_CHANNEL` routes its `dryRun` diff and approval card privately to the Backstage UI / authorized `spec.owner` reviewers rather than exposing sensitive diffs or approval controls in a shared channel.

### Structured Tool Outcome Envelopes, Predicate Verifiers & Catalog Reality Checks
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 31: Sycophancy and Hallucinated Completion) -->

To prevent the reasoning loop from misinterpreting empty CLI outputs, `202 Accepted` async receipts, or flawed user premises as completed actions, `CapabilityGateway` enforces three verification invariants:

1. **Canonical Tool Outcome Envelope:**
   - Capabilities never return raw empty strings (`""`) or ambiguous status codes. Every `CapabilityGateway` response is wrapped in a structured envelope:
     `{ status: 'VERIFIED' | 'PENDING_VERIFICATION' | 'PARTIAL' | 'WARNING_EMPTY_OUTPUT' | 'FAILED', data, evidence, warnings, rawOutputLength }`.
   - Zero-byte file/CLI outputs where content was expected are flagged `WARNING_EMPTY_OUTPUT` automatically.
2. **Declarative Predicate Verifiers (`verifyPostCondition`):**
   - Mutating `CapabilityDescriptor` definitions declare a deterministic `verifyPostCondition(input, mutationOutput)` predicate (e.g., querying `CatalogApi.getEntityByRef`, verifying non-empty file size via `git ls-files`, or checking Kubernetes rollout status) executed after the mutation fires.
3. **Pre-Flight Catalog & Infrastructure Reality Checks:**
   - Before planning mutations on a target `catalogEntityRef`, run a deterministic pre-flight check against the Backstage Software Catalog and live health metadata. Contradictions (e.g., `spec.lifecycle === 'deprecated'`, missing deployment annotations, or region mismatches) are injected as high-priority `[SYSTEM FACT CONFLICT]` observations so the model challenges flawed user assumptions upfront instead of agreeing sycophantically.

### Post-Pause Credential Re-Minting & Pre-Condition Re-Verification
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 36: Resuming Paused Workflows Across Days) -->

- **Fresh `oboGrantRef` Resolution on Wake-Up:** Short-lived OBO tokens (`<= 5 min` TTL) are never cached across multi-hour pauses. Upon receiving a human approval or resume signal, the control plane mints a fresh `oboGrantRef` and passes only that opaque handle into Temporal so `CapabilityGateway` resolves valid credentials from the Token Broker at execution time.
- **Deterministic Pre-Condition Re-Check:** Capabilities paused across a multi-minute/multi-day HITL gate re-verify target resource ETags, commit SHAs, and catalog `lifecycle` status immediately before mutating external systems.

### Local Companion Capabilities & Two-Sided Zero-Trust Workstation Consent
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 38: Local vs. Cloud Capability Routing) -->

When a developer's Local Companion CLI is online (and enabled by tenant compliance policy), `CapabilityGateway` dynamically exposes workstation-scoped capabilities (`local_git_status`, `local_docker_logs`, `local_ollama_generate`) under two-sided zero-trust controls:

1. **Dynamic Presence-Aware Registration:** Omit local workstation tools from the active tool map whenever the user's `local-node` queue has zero active pollers, automatically falling back to cloud GitHub/CI/Kubernetes equivalents.
2. **Client-Side Hardcoded Allowlist & Terminal Consent:** The Local Companion CLI enforces its own local allowlist of safe read-only workspace commands and prompts the engineer directly in their local terminal/OS dialog before executing any local write or shell command—preventing a compromised cloud prompt from silently mutating a developer's laptop.
3. **Workstation Git-Root Jail & DLP Scrubbing:** Confine all local file reads strictly to the active repository root (`process.cwd()`), blocking access to `~/.ssh`, `~/.aws`, and browser cookie stores, and scrub all returned diffs/logs through the DLP secret redactor before transmitting back to Temporal.

### Subprocess & Sandbox Resource Quotas, Zombie Reaping & Streaming Ring Buffers
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 39: Runaway Processes and Resource Leaks) -->

To prevent runaway `git clone` operations, hung headless browsers, or verbose test logs from causing `OOMKilled` pod evictions over months of continuous uptime:

1. **Ephemeral Sandbox Cgroup & Kubernetes Job Ceilings:**
   - Execute all shell, repository, and browser workloads inside single-use Kubernetes Jobs or rootless sandbox containers enforcing hard cgroup quotas: `memory: 1Gi`, `cpu: 1000m`, `ephemeral-storage: 2Gi`, `pidsLimit: 128`, `activeDeadlineSeconds: 300`, and `ttlSecondsAfterFinished: 60`.
2. **PID-1 Zombie Reaping & Process-Group Termination:**
   - Run sandbox and worker containers under **`tini`** (`--init`) as PID 1 to reap orphaned zombie processes.
   - Spawn child subprocesses in detached process groups (`detached: true`) and terminate the entire group via `process.kill(-child.pid, 'SIGKILL')` on timeout or `cancellationSignal` so grandchild processes never leak.
3. **Fixed-Size Streaming Ring Buffers (Zero Unbounded Buffering):**
   - Never call `execSync` or accumulate unbounded `stdout`/`stderr` buffers in V8 heap memory. Pipe subprocess streams through a fixed-size ring buffer (retaining `16 KB` head + `32 KB` tail) and immediately kill the process group if total emitted output exceeds a hard ceiling (`10 MB`).

### HTTP Captive-Portal / Corporate-Proxy Guard & Local Companion Reachability Probe
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 40: Network Offline and Captive Portal Handling) -->

To prevent corporate VPN drops, Zscaler/Netskope TLS interstitials, and captive portals from being misclassified as permanent JSON parsing errors or burning retry budgets:

- **Pre-Parse `Content-Type` & Interstitial Sniffing (`CapabilityGateway`):** Before calling `JSON.parse()` on any `HttpIntent` response—even HTTP `200 OK`—inspect `Content-Type` and sniff leading response bytes. If an API endpoint unexpectedly returns `text/html` containing a captive portal, Cloudflare interstitial, or corporate proxy block page, raise a retryable `ConnectivityDegradedError` (or `AuthenticationRequiredError` for interactive SSO login walls) rather than a terminal `SyntaxError`.
- **Local Companion Pre-Poll Network & VPN Probe:** Before polling `local-node:${tenantId}:${userEntityRef}`, the Local Companion CLI executes a lightweight corporate-VPN / control-plane reachability probe. If offline or trapped behind a captive portal, it suspends polling locally so Temporal never dispatches tasks into a black hole.

### Pre-Flight FinOps Cost Estimation & Cloud Spend HITL Gates
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 41: Financial Spend Caps and Runaway Loops) -->

- **Deterministic Infrastructure Cost Estimation:** Any capability or Scaffolder template that provisions cloud resources (Terraform, AWS, GCP, Kubernetes) must execute a pre-flight cost estimator (e.g., Infracost on Terraform plans or SKU lookup tables) during its `dryRun` phase.
- **Automated Spend-Threshold Escalation:**
  - Projected delta `>= $50/month` (or any GPU / high-IOPS resource): Automatically promotes the capability to Tier 3 `WRITE_HIGH` HITL approval, displaying the projected monthly USD delta on the approval card.
  - **Tainted-Run Override:** If `tainted === true`, *any* cloud-provisioning mutation—regardless of dollar estimate—escalates to Tier 3 human approval.

### Official-API Enforcement, ToS Domain Allowlists & Human-Paced Browser Guardrails
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 42: Third-Party Terms of Service and Bot Bans) -->

To prevent corporate Okta/Entra ID account lockouts, SaaS tenant API revocations, and Terms-of-Service violations, `CapabilityGateway` enforces strict transport and pacing policies:

1. **Hard "Official API / MCP Only" Browser Exclusion:**
   - Browser automation capabilities (`@playwright/mcp`, Stagehand) deterministically reject navigation to domains that expose official APIs or MCP servers (e.g., `github.com`, `gitlab.com`, `atlassian.net`, `slack.com`, `linear.app`, `://amazon.com`, `datadoghq.com`), returning a structured redirect instructing the model to invoke the typed API/MCP capability instead.
2. **Catalog-Backed ToS & UI-Automation Allowlist:**
   - Maintain an explicit registry of internal or partner web portals approved for UI automation (legacy portals lacking REST APIs) tagged with `maxActionsPerMinute` and `requiresHumanLogin`. Navigation to unapproved or ToS-restricted public websites (social networks, financial portals) is blocked deterministically.
3. **Human-Pacing Decorator & Per-Run Navigation Budget:**
   - Every browser `navigate`, `click`, and `type` step executes inside a pacing decorator injecting randomized inter-action delays (`800ms–2,500ms` jitter) and realistic typing cadences (`40–90ms/char`), capped at a strict **20 page navigations per workflow run** to prevent corporate NAT IP blacklisting.
4. **Zero Credential Stuffing & Official `[Bot]` Messaging Identities:**
   - Never store human passwords or automate corporate SSO/MFA form fills; rely exclusively on human-only login pauses (Section 16).
   - Route outbound PR comments, Jira updates, and Slack status messages through official **Backstage GitHub Apps / Slack Apps / Service Bot identities** badged as `[Bot]` with explicit triggering-user attribution (`Triggered by user:default/alice`) rather than impersonating personal OAuth sessions.

### Dual-Identity Attribution, External Recipient Draft-Only Downgrade & Templated Comms
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 43: Liability and Impersonation Boundaries) -->

To prevent agents from silently impersonating human engineers internally or binding the organization externally, `CapabilityGateway` enforces strict attribution and egress boundaries on all communication tools:

1. **Dual-Identity Attribution ("Bot Actor + Human Principal"):**
   - **Platform App Identities First:** Execute GitHub PR comments, Slack posts, and Jira updates using official **Backstage App / `[bot]` identities** while validating RBAC against the triggering human's `userEntityRef` and deterministically appending an egress middleware footer:
     `Automated via Backstage Agent • Requested by <userEntityRef> • Run <runId>`
   - **Personal OBO Token Fallback:** When a downstream API requires a personal OBO credential, `CapabilityGateway`'s egress wrapper deterministically prepends/appends an `[AI-Assisted]` disclosure banner—never relying on LLM prompt adherence.
2. **External Recipient Domain Boundary (`SEND` -> `CREATE_DRAFT` Auto-Downgrade):**
   - Validate all recipients against the tenant's verified internal corporate domain allowlist.
   - **Zero Autonomous External Sending:** Any communication targeting an external domain (vendors, customers, public mailing lists) automatically downgrades from `SEND` to **`CREATE_DRAFT`** (creating a draft in the user's mail/ticketing client) and suspends at a Tier 3 human HITL gate.
3. **Version-Controlled Templates Over Free-Form Outbound Prose:**
   - Standardized external or broadcast communications (incident updates, deprecation notices, vendor support tickets) prohibit free-form prose generation; the model populates validated variables via `generateObject` into a version-controlled Markdown/Handlebars template containing approved legal and compliance disclaimers.

### Zero-Trust Media & Document Quarantine Pipeline
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 44: Malicious File & Media Payloads) -->

Binary attachments (PDFs, architecture screenshots, spreadsheets, `.zip`/`.tar.gz` log dumps) carry both binary parser-exploit risks (XXE, zip bombs, `libpoppler`/`ImageMagick` CVEs) and multimodal prompt-injection risks (white-on-white PDF text, EXIF metadata, LSB steganography, spreadsheet formulas). All file/media ingestion executes through a hardened quarantine pipeline:

1. **Magic-Byte Validation & Zip-Bomb Guards:**
   - Validate file headers via magic-byte MIME inspection (never trusting file extensions), enforce a hard `25 MB` compressed upload cap, and abort archive extraction immediately if uncompressed expansion exceeds `100 MB` or a `10:1` expansion ratio.
2. **`--network none` Sandboxed Parsing (`sandbox-execution-queue`):**
   - Execute all PDF (`pdfplumber`/`poppler`), OCR, spreadsheet, and audio parsing inside single-use, rootless containers with `--network none`, `--read-only` root filesystem, and strict CPU/memory cgroups—destroying the container immediately after extraction.
3. **Image Re-Encoding & Hidden-Text / Formula Neutralization:**
   - **Images:** Reject raw SVGs (or rasterize inside the `--network none` sandbox) to eliminate XXE/XSS vectors. Re-encode raster images (PNG/JPEG/WebP) into clean stripped PNGs (`max 1568px` longest edge), wiping all EXIF/XMP metadata and neutralizing steganographic payloads.
   - **PDFs & Spreadsheets:** Extract only visible, standard-font text blocks (stripping zero-size/hidden text layers) and sanitize leading formula characters (`=`, `+`, `-`, `@`) in CSV/XLSX cells.
4. **DLP Redaction Before Model Ingestion:**
   - Run all extracted text through the pre-persistence DLP secret and PII/PHI scrubber before passing it to the reasoning runtime.

### Capability-Level Kill Switches & Token Broker Emergency Revocation
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 45: Out-of-Band Disaster Recovery ("Break Glass")) -->

- **Per-Capability & Safe-Mode Circuit Cutoff:** `CapabilityGateway` enforces `READ_ONLY_SAFE_MODE` and per-capability disable flags (`agent:killswitch:tool:${capabilityId}`) deterministically before dispatching any `HttpIntent` or `NativeAdapter`.
- **Token Broker Instant Credential Severing:** Expose an out-of-band **"Revoke Agent Credentials"** control on the Token Broker / Vault integration that immediately invalidates active OBO grants and suspends upstream app tokens at the egress proxy layer—cutting off all external GitHub, Kubernetes, and cloud mutations even if an orphaned sandbox container is still winding down.

### Backstage Catalog Graph Hydration (`get_entity_neighborhood`)
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 49: Backstage Catalog Graph & Entity-Context Grounding ("The IDP World Model")) -->

Rather than treating the Backstage Software Catalog as flat text blobs or relying on probabilistic vector search for service topology, the platform exposes a deterministic **Catalog Graph Hydration** capability (`get_entity_neighborhood(entityRef, depth = 2)`):

- **Typed Relation Traversal:** Traverses `System -> Component -> API -> Resource -> Group/User` edges (`ownedBy`, `dependsOn`, `dependencyOf`, `providesApi`, `consumesApi`, `partOf`) via `CatalogClient` into a compact, token-bounded ASCII/JSON dependency and blast-radius tree (capturing `kind`, `entityRef`, `spec.lifecycle`, `spec.owner`, and edge direction).
- **Per-Node RBAC Filtering & Hub Fan-Out Caps:**
  - Every discovered neighbor node is checked against Backstage `PermissionsService` (`catalog.entity.read`) for the triggering `userEntityRef`; unauthorized nodes are masked as `[REDACTED_ENTITY]` while preserving accurate downstream dependent counts.
  - Enforce hard traversal bounds (`depth <= 2`, max `25` nodes per hop with `+N additional dependents` summary) so high-fan-out hub resources (shared databases, message buses) never trigger prompt bloat.

### System-Level Blast-Radius Locks & Deployment Freeze Pre-Checks
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 51: Multi-Agent & Cross-Team Workflow Coordination ("The Organizational Collision Problem")) -->

Single-entity or single-repository locks cannot prevent Team A's database schema migration from colliding with Team B's consumer service deployment. Before executing `WRITE_HIGH` mutations on a Backstage `Component` or `Resource`, `CapabilityGateway` enforces graph-aware collision controls:

1. **Deterministic Deployment Freeze & Active Incident Pre-Check:**
   - Query Backstage Catalog annotations (`backstage.io/change-freeze`, `://pagerduty.com`) and registered PagerDuty / CI-CD capability adapters to verify:
     - No active change-freeze window or in-progress CI/CD rollout is underway on the target entity or its parent `System`.
     - No active `SEV-1` / `SEV-2` PagerDuty incident blocks routine mutations (unless the run carries an explicit incident-remediation override linked to that incident ID and approved by an authorized responder).
2. **System-Level Blast-Radius Leases (Deadlock-Free Canonical Ordering):**
   - Resolve the target entity's parent `System` (`partOf`) and immediate `dependsOn` / `dependencyOf` neighbors via `get_entity_neighborhood`.
   - Sort all affected `entityRef` keys **lexicographically** before acquiring short-TTL Redis blast-radius leases (exclusive write lease on the mutated entity, shared dependency-lock on 1-hop neighbors), preventing cross-team race conditions and circular lock deadlocks.

### Compiling `CapabilityDescriptor` Schemas to Vercel AI SDK `tool()` Definitions
<!-- Source: incoming/TOOLS_VERCEL_AI_SDK.md (Section: The Standard tools Object) -->

- **Single Zod Schema Source of Truth:** Each `CapabilityDescriptor` defines its input contract once using **Zod** (with `.describe()` annotations on fields for LLM guidance). At turn assembly time, `CapabilityGateway` projects eligible capabilities into schema-only Vercel AI SDK `tool({ description, parameters })` descriptors for the LLM while retaining execution authority inside the Temporal Activity boundary.

### Server-Side Token Broker: Provider Adapter Contract & Supported-Auth Matrix
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section A: Provider and authorization design) -->

Because OAuth and app-delegation semantics vary sharply across upstream providers, the Token Broker rejects a generic "one-size-fits-all OAuth" assumption in favor of an explicit **Provider Adapter Contract** and **Supported-Authentication Matrix**:

1. **Explicit Provider Adapter Contract (`TokenBrokerProviderAdapter`):**
   - Every integrated provider implements a typed adapter specifying:
     - `authModel`: `'github-app-user-to-server' | 'oauth2-pkce' | 'oidc-token-exchange' | 'enterprise-idp-broker'`
     - `supportsOfflineRefresh`: boolean (plus `singleUseRotatingRefresh`: boolean)
     - `permissionModel`: `'fine-grained-app-permissions' | 'oauth-scopes' | 'role-claims'`
     - `exchangeCode(code, pkceVerifier, redirectUri) -> EncryptedTokenBundle`
     - `refreshGrant(currentBundle) -> EncryptedTokenBundle`
     - `revokeGrant(currentBundle) -> void`
     - `validateNarrowedPermissions(grantedBundle, requiredCapabilities) -> AuthCheckResult`
2. **Supported-Authentication Matrix (GitHub Reference Standard):**
   - **Preferred — GitHub App User-to-Server Expiring Tokens (`ghu_*` / `ghr_*`):** Enforces fine-grained repository permissions intersected with the user's actual GitHub ACLs (`access_token` 8h TTL, `refresh_token` 6-month TTL).
   - **Single-Use Refresh Token Serialization:** Because rotating a GitHub App `ghr_*` refresh token returns a new `(ghu_*, ghr_*)` pair and immediately invalidates the prior pair, the Token Broker serializes refresh operations per `(tenantId, userEntityRef, providerId)` via a distributed Redis mutex + transactional CAS update so concurrent worker activities never collide and invalidate active grants.
   - **Legacy OAuth Apps (`repo` scope):** Disallowed by default for write capabilities due to overly broad repository blast radius.
   - **Enterprise IdP Token Broker Delegation:** Where an enterprise IdP (e.g., Okta / Entra ID RFC 8693 Token Exchange) already brokers downstream SaaS tokens, the adapter delegates directly to the enterprise IdP rather than storing duplicate refresh tokens.
3. **Capability-Narrowed Consent:**
   - Each `CapabilityDescriptor` declares its minimum required provider permissions/scopes so user consent flows request only the narrowest permissions needed for enabled capabilities rather than blanket write scopes.

### Account-Pinned Reconnection Guard on Paused Runs
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section B: Connection and consent UX) -->

- **Preventing Silent Account Substitution on Reconnect:** Every Token Broker grant records the immutable upstream `providerAccountId` (e.g., GitHub numeric user ID) and `providerInstanceId`. When a paused workflow triggers a `reconnect_required` flow, the Token Broker verifies that the newly completed OAuth callback resolves to the **exact same `providerAccountId` and `providerInstanceId`**—rejecting accidental logins to secondary or personal accounts with `ACCOUNT_MISMATCH_ON_RECONNECT`.

### `CredentialStore` Interface & KMS Envelope-Encrypted Secret Isolation
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section C: Secure credential storage) -->

To prevent credential exposure through database reads, backups, or cross-tenant row manipulation, the Token Broker isolates secret material behind a dedicated `CredentialStore` port interface:

1. **Physical & Schema Separation (Metadata vs. Secret Ciphertext):**
   - **`agent_oauth_connections` (Non-Secret Metadata):** Stores `grantId`, `tenantId`, `userEntityRef`, `providerId`, `providerInstanceId`, `providerAccountId`, `grantedPermissions`, `status`, `expiresAt`, and `updatedAt`. Readable by Backstage UI status endpoints.
   - **`agent_oauth_secret_payloads` (Encrypted Token Blobs):** Stores AES-256-GCM ciphertext (`encryptedAccessToken`, `encryptedRefreshToken`), IV/authTag, KMS-wrapped Data Encryption Key (`wrappedDek`), and `kmsKeyVersion`. Accessible **exclusively** by the Token Broker service role.
2. **KMS Envelope Encryption with AEAD Associated Data (AAD) Binding:**
   - Encrypt token payloads with per-record random Data Encryption Keys (DEKs) wrapped by an enterprise KMS Customer Managed Key (CMK), binding `(tenantId, grantId, userEntityRef, providerInstanceId, kmsKeyVersion)` as **AEAD Associated Data** so ciphertext cannot be transplanted across user or tenant rows.
   - Support non-disruptive CMK rotation via background DEK re-wrapping without forcing users to re-authenticate.
3. **Strict Zero-Leakage Invariant:**
   - Raw access tokens, refresh tokens, client secrets, and authorization codes must never appear in `LoggerService` metadata, `AuditLogSink` events, thrown error messages/stack traces, OTel/Langfuse spans, query-string URLs, or Temporal workflow/activity histories.

### Distributed Token Refresh Coordination & Non-Atomic Rotation Recovery
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section D: Token acquisition and refresh) -->

To prevent refresh-token replay collisions across horizontally scaled pods and handle provider outages cleanly, the Token Broker enforces four acquisition and refresh invariants:

1. **Usable-Lifetime Caching & Clock-Skew Proactive Refresh:**
   - Reuse cached access tokens (`ghu_*`) for their usable lifetime and trigger proactive refresh whenever `now >= expiresAt - clockSkewBuffer` (default `5 minutes` skew buffer) so requests never fail mid-flight at token boundary transitions.
2. **Cross-Instance Distributed Lock + Double-Checked Read:**
   - Serialize token refreshes across all pods using a short-TTL Redis distributed lock keyed by `tenant:${tenantId}:token-refresh:${grantId}` (with a process-local single-flight promise coalescer on top).
   - Immediately upon acquiring the Redis lock, **re-read `CredentialStore` from PostgreSQL**; if another pod already rotated the grant while waiting for the lock, return the newly persisted token without hitting the upstream provider.
3. **Non-Atomic External Rotation & Crash Recovery:**
   - Because an external provider token rotation and a local database commit cannot be wrapped in a single atomic transaction, execute the `CredentialStore` write inside an uninterruptible critical section with immediate bounded DB retry.
   - If a pod crash or lost response causes a subsequent refresh attempt to fail with `invalid_grant` (indicating the single-use refresh token was already consumed upstream), transition the connection immediately to `reconnect_required` and raise a non-retryable `AuthenticationRequiredError` rather than retrying.
4. **Transient vs. Terminal Refresh Failure Classification:**
   - **Transient (`429`, `5xx`, socket timeout):** Raise retryable `TransientProviderError` (honoring `Retry-After`) without mutating the stored grant state.
   - **Terminal (`invalid_grant`, revoked app authorization, downgraded scopes):** Persist the updated connection state (`expired`, `revoked`, or `insufficient_permission`) in `agent_oauth_connections` and raise non-retryable `AuthenticationRequiredError` to pause the workflow for user recovery.

### Narrow Capability-Scoped Broker Contract & Service-to-Service Boundary
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section E: Gateway authorization and use) -->

To prevent arbitrary plugins or compromised workers from requesting raw user tokens (`getUserToken`), the Token Broker exposes a narrow, intent-bound execution interface rather than a credential retrieval API:

1. **Intent-Bound Broker Contract (`executeWithGrant`):**
   - Callers submit a structured invocation context—never requesting a raw token string:
     `{ tenantId, userEntityRef, agentId, workflowId, runId, capabilityId, providerInstanceId, targetResource, requestIntent }`
   - **Pre-Resolution Policy Gate:** Before decrypting or refreshing any credential in `CredentialStore`, the broker verifies:
     1. The capability is registered and permitted by RBAC (`PermissionsService`) and active workflow policy (including Tier 3 HITL approval state for `WRITE_HIGH` actions).
     2. The target host/resource matches the capability's allowlist and the grant's `providerInstanceId`.
     3. The grant possesses the narrowed permissions required by `capabilityId`.
   - Only after policy passes does the broker resolve the credential in memory, inject the `Authorization` header at the egress boundary, dispatch the upstream call, and return the DLP-scrubbed response.
2. **Service-to-Service Authentication + Run Attestation:**
   - When the Token Broker runs as a standalone service separate from `CapabilityGateway`, enforce mutual TLS / Backstage `AuthService` service authentication **plus** a signed, single-use run-attestation token binding `(workflowId, runId, userEntityRef, capabilityId)` so service identity alone cannot be abused to request arbitrary user grants.

### Per-Invocation Standing Verification & Orthogonal Write Idempotency
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section F: Temporal and long-running behavior) -->

- **Just-In-Time Standing & RBAC Recheck:** `CapabilityGateway` verifies active Backstage `User` existence/status and `PermissionsService` authorization on every individual tool invocation inside the activity worker, ensuring offboarded users cannot execute queued steps even if a workflow was started prior to deactivation.
- **Broker vs. Idempotency Separation:** Credential resolution in the Token Broker is strictly stateless with respect to mutation deduplication; every `WRITE_LOW` / `WRITE_HIGH` capability adapter remains responsible for propagating `Idempotency-Key` and verifying resource ETags/commit SHAs on retry.

### Token Broker Provider Onboarding & Runbook Gate
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section G: Operations and assurance) -->

- **Mandatory Onboarding Package:** Every new `TokenBrokerProviderAdapter` must ship with documented authorization/refresh semantics, capability-narrowed permission mappings, an incident revocation/rotation runbook, and passing concurrency + secret-scrubbing test suites before registration in production.

### Token Broker Delegation Precedence & Authority-Model Boundaries
<!-- Source: incoming/TOOLS_TOKEN_BROKER.md (Section: Alternatives worth evaluating first) -->

Before persisting long-lived user refresh tokens inside the platform database, deployments evaluate three explicit credential-delegation modes in priority order:

1. **Mode 1 — Existing Enterprise Token / Secret Broker (Preferred):**
   - Delegate credential exchange and header injection to a customer-approved enterprise broker (e.g., Okta/Entra ID RFC 8693 Token Exchange, HashiCorp Vault, or corporate egress proxy), eliminating platform custody of user refresh tokens.
2. **Mode 2 — Foreground-Only Short-Lived User Credentials (Zero Refresh-Token Custody):**
   - Accept short-lived user OBO access tokens bound to active interactive sessions without storing refresh tokens. If a long-running or multi-day Temporal workflow wakes after token expiry, it transitions cleanly to `AWAITING_REAUTH` and prompts the user to reconnect.
3. **Mode 3 — Explicitly Policy-Authorized Service Identities (Non-Substitutable):**
   - Shared service principals or GitHub App installation tokens may be used **only** for capabilities explicitly declaring `authAuthority: 'service-principal'` (e.g., background catalog hygiene or read-only metadata syncs) where `PermissionsService` RBAC explicitly authorizes the caller for that service-backed action.
   - **Strict Anti-Substitution Rule:** `CapabilityGateway` must **never** silently fall back to a service identity when a user's personal OBO grant is expired, revoked, or lacks repository permissions.

### Trusted Run-Record Binding Against Reference Substitution
<!-- Source: incoming/TOOLS_TEMPORAL_PAYLOAD_CODEC.md (Section: Illustrative activity) -->

- **Anti-Substitution Verification:** Passing `{ runId, principal, standingRef }` into a capability activity is a reference, not proof of authorization. Before resolving any credential, `CapabilityGateway` loads the authoritative `RunStore` record for `runId` and verifies that `principal` owns that run and is bound to `standingRef`, preventing an activity input tamper from substituting another user's connection.

### Immutable Capability Catalog, Driver Binding Registry & Gateway Mediation (Option B/C -> D)
<!-- Source: incoming/TOOLS_REGISTRY.md (Sections: Executive recommendation, What the registry should own, Fit with B/C and the possible D deployment, Assessment of the initial InMemoryToolRegistry, Lifecycle and governance requirements, Minimum acceptance tests) -->

The prototype `InMemoryToolRegistry` (which stored and returned callable `tool.invoke` objects) is retired because exposing executable closures lets callers bypass central policy enforcement. Instead, capability management is split into two boot-compiled registries mediated exclusively by a single **Capability Gateway**:

1. **Two-Part Registry Separation:**
   - **Capability Catalog (Declarative, Deep-Frozen Read Model):** Immutable `CapabilityDescriptor` metadata defining stable `capabilityId`s, runtime Zod schemas, layer/category, effect (`read` | `write` | `destructive`), sync/async execution mode, argument provenance, data classification, idempotency contract, required permissions/standing, and policy tags.
   - **Driver Binding Registry (Private Implementation Map):** Boot-time mapping from provider/driver IDs to reviewed driver implementations. Kept strictly private to the gateway—never exposed via lookup APIs, never serialized into Temporal payloads, and holding zero resolved credentials.
2. **Six-Stage Capability Lifecycle:**
   1. **Collect:** Backstage backend modules register descriptors and driver bindings via explicit extension points during module initialization, separating code registration from tenant/customer provider instance configuration.
   2. **Validate & Compile:** Fail startup immediately on malformed descriptors, undeclared namespaces, duplicate `capabilityId`s (`ConflictError`—never silent overwrite), incompatible schemas, unresolved mandatory requirements, or unsafe policy combinations.
   3. **Publish Immutable Version:** Compute a canonical `catalogDigest` (SHA-256) and deep-freeze the compiled snapshot before exposing HTTP routes or starting Temporal workers.
   4. **Discover (Principal & Agent Filtered):** Compute capability availability dynamically for `(tenantId, principal, agentId)`—never exposing unfiltered global lists as permission to invoke. Return metadata paired with a determinate availability status: `available` | `unbound` | `not_served` | `disabled` | `degraded` | `connect_account` | `not_permitted`.
   5. **Invoke (Single Gateway Pipeline):** Every execution routes through `CapabilityGateway.invoke(...)`, re-evaluating RBAC, user standing, target scope, HITL approval, and Redis kill switches at call time before resolving credentials by reference.
   6. **Observe & Upgrade:** Report `catalogDigest` across all API and worker replicas and alert on version skew rather than mixing incompatible mappings and executors.
3. **Transport-Neutral Option D Seam:**
   - Hide catalog reads behind `CapabilityCatalogReader` and invocations behind `CapabilityGatewayClient`. Under Option B/C, both run in-process across Backstage and Temporal workers; if Option D (standalone out-of-process gateway) is adopted later, only the client transport changes while `capabilityId`s and workflow definitions remain unchanged.

### Hybrid Auth Matrix & Two-Layer Provider-Agnostic Authorization (Backstage / OPA / OpenFGA)
<!-- Source: incoming/TOOLS_PERMISSIONS_RBAC.md (Sections: Service-Account Tokens, The Verdict: A Hybrid Strategy for AI Agents, Why the Tool Registry is the Wrong Enforcement Layer, The Recommended Architecture: Layered Access Control, Handling Layer 2 Without OPA, Other Authorization Systems Used with Backstage) -->

The capability layer separates **static policy metadata** (owned by `CapabilityCatalog`) from **active policy enforcement** (executed at Ingress and Pre-Execution Guardrail boundaries) while remaining completely agnostic to the customer's downstream policy engine (native Backstage RBAC, OPA Rego, OpenFGA ReBAC, Entra ID, or Okta):

1. **Hybrid Auth Strategy by Integration & Effect Type:**
   - **User-Delegated OBO / OAuth Flow:** Mandatory for user-attributed writes and private reads (e.g., Jira issue creation/assignment, GitHub PR creation/merges, PagerDuty incident ack/resolve/override, private Slack DMs) so downstream audit trails record the real human principal and enforce user-level ACLs.
   - **Policy-Authorized Service-Account Flow:** Permitted for read-only infrastructure telemetry (Datadog/Splunk metrics and logs), on-call schedule lookups, and background automated summaries—strictly gated by `PermissionsService` RBAC and explicitly declared `authAuthority: 'service-principal'` on the `CapabilityDescriptor`.
2. **Two-Layer Policy Enforcement Points (PEP):**
   - **Layer 1 — Ingress Access Control:** Evaluates `agent.workflow.execute` via `PermissionsService` at the Backstage API / event ingress boundary before starting a workflow.
   - **Layer 2 — Pre-Execution Guardrail (`CapabilityGateway`):** Immediately before invoking any driver, passes the caller's `BackstageCredentials` and structured capability/runtime attributes (`capabilityId`, `driver`, `riskTier`, `effect`, `targetEntityRef`, `environment`, `sanitizedPolicyArgs`) to `PermissionsService.authorize(...)`.
3. **Engine-Agnostic Policy Integration (OPA, OpenFGA, Entra ID, Okta):**
   - Plugin code never imports OPA or OpenFGA clients directly; it emits standard `@backstage/plugin-permission-common` definitions (`agentWorkflowExecutePermission`, `agentToolExecutePermission`). Customer deployments plug in native TypeScript `PermissionPolicy`, the Backstage OPA Permissions Wrapper (Rego), OpenFGA adapters, or Entra ID/Okta Catalog `Group` ingestion without modifying plugin code.

### Canonical Capability Category Taxonomy & `approval` Category Contract
<!-- Source: incoming/TOOLS_CATEGORIES.md (Sections: Mapping Koine to Crew Suite, Approval) -->

To prevent capability namespace drift across legacy Koine prototypes and Crew Suite packages, `CapabilityCatalog` enforces a canonical kebab-case category taxonomy, beginning with the **`approval`** capability family. Use the category IDs below; `scm`, `incidents`, and `scorecards` are the standardized IDs for their domains. The prior category labels `vcs`, `incident-management`, and `quality-scorecards` are historical only, not runtime aliases:

1. **Canonical 18-Category Capability Taxonomy:**
   - Standardize all `CapabilityDescriptor.category` values across the platform to 18 canonical categories. Recognize only explicitly documented spelling aliases (currently `featureflags` for `feature-flags`); the former `vcs`, `incident-management`, and `quality-scorecards` labels are not category aliases:
     - `approval` (ServiceNow Change Management, Jira Service Management Approvals, Harness CD, GitHub Environments, Opal/Veza, Temporal HITL)
     - `artifact` (Artifactory, Harbor)
     - `booking` (Exchange, Google Workspace resources, Robin, Envoy)
     - `cd` (ArgoCD, Flux, Spinnaker)
     - `ci` (GitHub Actions, Jenkins, CircleCI, Buildkite)
     - `communication` (Slack, Mattermost, Zulip)
     - `documentation` (Confluence, Notion, Quip)
     - `email` (Microsoft 365, Google Workspace, Amazon SES)
     - `feature-flags` (alias `featureflags`: Flagsmith, OpenFeature)
     - `finops` (CloudCost, Kubecost)
     - `incidents` (PagerDuty, OpsGenie)
     - `infrastructure` (Terraform, Pulumi, Crossplane, Humanitec, Vault)
     - `observability` (Datadog, New Relic, Grafana)
     - `scorecards` (Soundcheck, Cortex, OpsLevel, Lighthouse, Compass)
     - `scm` (GitHub, GitLab, Gitea)
     - `security` (Snyk, Trivy, SonarQube)
     - `testing` (TestRail, Codecov, Playwright)
     - `ticketing` (Jira, Linear, GitHub Issues, Asana)
### Default Driver Candidates & Base Intent Catalog
<!-- Source: incoming/TOOLS_DEFAULT_DRIVERS.md -->

The incoming catalog proposes default integration candidates and per-category base intents; these are not commitments about which providers ship at launch. Normalize the source's `featureflags` heading to the canonical `feature-flags` category. The source's overview table omits `artifact`, so its detailed `artifact` section supplies the Zot candidate below.

| Canonical Category | Default Integration Candidate(s) |
| :-- | :-- |
| `approval` | Gotify |
| `artifact` | Zot |
| `booking` | Cal.com or Radicale |
| `cd` | Argo CD |
| `ci` | Woodpecker CI or Drone CI |
| `communication` | Mattermost or Zulip |
| `documentation` | Outline or Wiki.js |
| `email` | Mailpit |
| `feature-flags` | Flagsmith or Flipt |
| `finops` | OpenCost |
| `incidents` | GoAlert or Grafana OnCall |
| `infrastructure` | OpenTofu via Atlantis or OpenBao |
| `observability` | Grafana with VictoriaMetrics or Prometheus |
| `scm` | Gitea or Forgejo |
| `scorecards` | Backstage Soundcheck / Tech Insights or OpenSSF Scorecard |
| `security` | Trivy with Dependency-Track |
| `testing` | Allure Docker Service or Kiwi TCMS |
| `ticketing` | Plane or Vikunja |

* **Method Catalog Shape:** The source records category methods (`Seat`), arguments (`Args`), an optional routing `Destination`, and slot-fill constraints (`FillNone`, `FillAny`, `FillSpecific`, `FillRange`). Treat these as candidate contract inputs; reconcile method names and argument shapes with the existing category-contract proposals before assigning stable requirements.
* **FinOps and Scorecards Are Platform-Specific Proposals:** Conduit does not define these categories. The suggested operations (for example, `getCostAllocation` / `setBudgetThreshold` and `getEntityScorecard` / `runRepoScorecard` / `recordCheckFact`) are best guesses that need contract validation, not Conduit-derived guarantees.
* **Launch and License Review:** A default candidate is not a launch promise or an automatically bundled dependency. Confirm the launch set under SD-07 and review each provider's distribution model against the dependency-license constraint before bundling it.

2. **`approval` Category Contract & `communication` Decoupling:**
   - Standardize `approval` capability intents around formal authorization records (`requestId`, `workflowId`, `approverId`, `comment`/`reason`): `requestApproval`, `approveRequest`, `rejectRequest`, `reassignApprovalRequest`, `escalateApprovalRequest`, and `cancelApprovalRequest`.
   - **Strict State-vs-Channel Split:** The `approval` category owns the authoritative authorization state machine and audit trail; `communication` capabilities (`communication.sendApprovalRequest`) serve strictly as notification delivery surfaces that dispatch signed callbacks back to the approval state machine.
   - **Separation of Duties:** `CapabilityGateway` blocks self-approval by the initiating `actorUserRef` on `WRITE_HIGH` change requests unless tenant RBAC policy explicitly permits single-user sign-off.

### `artifact` & `booking` Category Capability Contracts
<!-- Source: incoming/TOOLS_CATEGORIES.md (Sections: Artifact Platforms, Booking) -->

1. **`artifact` Category Contract (Supply-Chain & Registry Governance):**
   - **Supported Providers:** JFrog Artifactory + Xray, Harbor, AWS ECR / CodeArtifact, Google Cloud Artifact Registry / Binary Authorization, Azure Container Registry / Artifacts, GitHub Container Registry (GHCR), Sonatype Nexus, Cloudsmith, and Red Hat Quay.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `listArtifacts`, `getArtifactMetadata`, `getArtifactVulnerabilities` (Xray/Trivy/Inspector/Artifact Analysis), `verifyArtifactSignature` (Cosign/Notary/Signer).
     - `WRITE_LOW` / `WRITE_HIGH`: `promoteArtifact` (`dev` -> `staging` -> `prod`), `signArtifact`, `attachArtifactEvidence` (OCI referrers / SBOM / SLSA provenance), and `pinArtifact` (tag immutability / retention lock).
   - **Pre-Promotion Supply-Chain Gate:** Promoting an artifact to a `prod` repository (`WRITE_HIGH`) requires deterministic verification of a valid cryptographic signature (`verifyArtifactSignature`) and policy-compliant vulnerability posture (`getArtifactVulnerabilities`) prior to HITL sign-off.
2. **`booking` Category Contract (Workplace, Calendar & Facility Scheduling):**
   - **Supported Providers:** Microsoft Exchange / 365 room mailboxes, Google Workspace calendar resources, Robin, Envoy, ServiceNow Workplace, Appspace, Eptura (Archibus / FM:Systems / Teem), Smartway2, Joan, Kadence, Deskbird, and 25Live / EMS.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `findAvailable` (filtered by `kind`, `capacity`, `location`, and strict ISO-8601 offset window).
     - `WRITE_LOW` (or `WRITE_HIGH` when `requestService` triggers paid catering/facility work orders): `bookResource`, `checkIn`, `releaseResource` (early checkout), and `requestService` (AV setup, room reconfiguration, catering).
   - **User OBO & Idempotency Invariant:** All mutating `booking` capabilities execute under **User-Delegated OBO standing** (so reservations and facility requests attribute to the requesting employee) and enforce deterministic `Idempotency-Key`s to prevent duplicate bookings or catering orders on retry.

### `communication` & `cd` Category Capability Contracts
<!-- Source: incoming/TOOLS_CATEGORIES.md (Sections: Communication, Continuous Deployment) -->

1. **`communication` Category Contract (Enterprise Messaging & Collaboration):**
   - **Supported Providers:** Slack, Microsoft Teams, Google Chat, Cisco Webex Messaging, Zoom Team Chat, Mattermost, Rocket.Chat, Zulip, and Discord.
   - **Standard Intents & Risk Tiers:**
     - `WRITE_LOW`: `postMessage`, `notifyUser` (DM), `replyInThread`, `updateMessage` (in-place progress updates), `reactToMessage`, and `sendApprovalRequest` (renders Block Kit / Adaptive Cards and posts signed callbacks to the `approval` category state machine).
     - `WRITE_HIGH`: `createChannel`, `inviteMembers`, `setChannelTopic`, and `archiveChannel` (preventing unapproved channel archival or external guest additions).
   - **Auth & Attribution Invariant:** Automated summaries and thread updates execute via official `[Bot]` identities with explicit human-requester attribution footers; private DM reads or user-authored messages require User-Delegated OBO standing and `[AI-Assisted]` disclosure.
2. **`cd` Category Contract (GitOps & Progressive Delivery Orchestration):**
   - **Supported Providers:** Argo CD + Argo Rollouts, Flux CD + Flagger, Harness CD, Spinnaker, Octopus Deploy, AWS CodeDeploy / ECS, Google Cloud Deploy, and Azure Pipelines / Container Apps.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `getServiceHealth`, `getDeployedVersion`, `getDeploymentStatus`.
     - `WRITE_LOW` (non-prod `dev`/`staging`) / Mandatory `WRITE_HIGH` HITL (`prod`): `deployVersion`, `syncService`, `pauseDeployment`, `resumeDeployment`, `cancelDeployment`, and `rollbackService`.
   - **Production Deployment Guardrails:** Every `prod` `cd` mutation requires a `dryRun` revision/manifest diff, `get_entity_neighborhood` blast-radius check, system-level blast-radius lease + active PagerDuty/change-freeze pre-check, and post-execution rollout health verification (`verifyStateActivity`).

### `ci` & `documentation` Category Capability Contracts
<!-- Source: incoming/TOOLS_CATEGORIES.md (Sections: Continuous Integration, Documentation) -->

1. **`ci` Category Contract (Hosted & Self-Hosted Build Automation):**
   - **Supported Providers:** GitHub Actions, GitLab CI/CD, CircleCI, Buildkite, Travis CI, Bitbucket Pipelines, Jenkins, TeamCity, Azure Pipelines, Drone CI, Woodpecker CI, and Concourse CI.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `getBuildStatus`, `getBuildLogs` (step-sliced), `getBuildArtifacts` (metadata/quarantined download).
     - `WRITE_LOW`: `triggerBuild` (parameterized `workflow_dispatch` / pipeline runs), `retryBuild`, `cancelBuild`.
     - `WRITE_LOW` (non-prod) / Mandatory `WRITE_HIGH` HITL (`prod`): `promoteBuild` across target environments.
   - **Log Scrubbing & Taint Rules:** `getBuildLogs` enforces strict tail/error window caps (`<= 4,000` tokens, offloading full traces to `ArtifactSink`), runs synchronous DLP secret/entropy redaction before returning output, and marks the workflow `tainted = true` when inspecting untrusted/forked PR builds.
2. **`documentation` Category Contract (Collaborative Wikis & Structured Knowledge Bases):**
   - **Supported Providers:** Confluence, Notion, Quip, Coda, Google Docs, Microsoft Loop / SharePoint Pages, Dropbox Paper, Outline, BookStack, Slite, Nuclino, and Slab.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `findDocument`, `getDocument` (wrapped in per-turn randomized `<external_data_...>` boundary delimiters).
     - `WRITE_LOW` (team spaces) / `WRITE_HIGH` (org-wide regulated or externally shared spaces): `createDocumentFromTemplate`, `replaceDocumentSection`, `setTableRow` (key-based structured table upserts), `attachToDocument`, and `addDocumentComment`.
   - **Auth & Concurrency Invariant:** All mutating `documentation` capabilities run under **User-Delegated OBO standing** (preserving native wiki revision authorship) and verify document version/ETag preconditions before applying `replaceDocumentSection` or `setTableRow` updates.

### `email` & `feature-flags` Category Capability Contracts
<!-- Source: incoming/TOOLS_CATEGORIES.md (Sections: Email, Feature Flags) -->

1. **`email` Category Contract (Enterprise Mail, Threading & Calendar Invites):**
   - **Supported Providers:** Microsoft 365 (Graph API), Google Workspace (Gmail + Calendar APIs), Zoho Mail/Calendar, Fastmail (JMAP), Postmark, Twilio SendGrid, Amazon SES, Mailgun, Resend, Nylas, and Cronofy.
   - **Standard Intents & Risk Tiers:**
     - `WRITE_LOW` (internal `@company.com` recipients only): `sendEmail`, `replyInMailThread` (RFC-5322 `In-Reply-To` / `References` headers), `sendDigest`, `sendCalendarInvite`, and `cancelCalendarInvite`.
     - **External Recipient Guardrail (`WRITE_HIGH` + Draft Downgrade):** Any recipient or meeting attendee outside the tenant's verified internal domain allowlist automatically downgrades `sendEmail` / `replyInMailThread` to `CREATE_DRAFT` and requires Tier 3 human HITL approval.
   - **Calendar `.ics` Determinism:** Calendar invite capabilities enforce strict ISO-8601 offset timestamps (`startsAt`, `endsAt`) and deterministic iCalendar `UID` keys (`${workflowId}-${stepIndex}-${toolCallId}`) so activity retries never duplicate calendar invitations.
2. **`feature-flags` Category Contract (alias `featureflags` — Progressive Delivery & Kill Switches):**
   - **Supported Providers:** LaunchDarkly, Split (Harness FME), Statsig, Flagsmith, ConfigCat, Unleash, GrowthBook, Flipt, OpenFeature, AWS AppConfig, Azure App Configuration, GitLab Feature Flags, PostHog, and Sentry.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `getFeatureStatus`.
     - `WRITE_LOW` (`dev`/`staging`) / Mandatory `WRITE_HIGH` HITL (`prod`): `enableFeature`, `disableFeature`, and `setFeatureRollout` (percentage targeting).
   - **Incident Emergency Kill-Switch Path:** Production `disableFeature` calls linked to an active `SEV-1` incident and authorized by an on-call responder execute under fast-path incident override with mandatory `AuditLogSink` attribution.

### `finops` & `infrastructure` Category Capability Contracts
<!-- Source: incoming/TOOLS_CATEGORIES.md (Sections: FinOps, Infrastructure) -->

1. **`finops` Category Contract (Cloud Cost Visibility, Budgets & Optimization):**
   - **Supported Providers:** AWS Cost Explorer / Budgets, Google Cloud Billing & Cost Management, Microsoft Cost Management, CloudHealth, Apptio Cloudability, Vantage, Kubecost / OpenCost, Harness Cloud Cost Management, Finout, ProsperOps, Cast AI, and Spot by NetApp.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `getCloudSpend`, `getCostForecast`, `getBudgetStatus`, `getCostAnomalies`, `getTagCompliance`, `listSavingsRecommendations`.
     - `WRITE_LOW`: `acknowledgeCostAnomaly`.
     - Mandatory `WRITE_HIGH` HITL: `createBudget` and `applySavingsRecommendation` (executing commitment purchases such as RIs/Savings Plans or live workload rightsizing).
2. **`infrastructure` Category Contract (IaC Orchestration, Environments & Secret Lifecycle):**
   - **Supported Providers:** HashiCorp Terraform / HCP Terraform / OpenTofu, Pulumi, Crossplane, AWS CloudFormation, Azure Bicep, GCP Infrastructure Manager, Humanitec / Score, Qovery, Porter, Coherence, Env0, Spacelift, Scalr, HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, Doppler, and Infisical.
   - **Standard Intents & Risk Tiers:**
     - `READ` (metadata-only): `getInfrastructureStatus`, `getSecret` (returns metadata and an opaque `secretRef` handle—**never** raw secret plaintext).
     - Mandatory `WRITE_HIGH` HITL: `provisionInfrastructure`, `updateInfrastructure`, `destroyInfrastructure`, and `rotateSecret`.
   - **Zero-Secret & IaC Plan Invariants:**
     - `getSecret` and `rotateSecret` never return raw credential values into Temporal event history, logs, or LLM context windows; resolved secrets remain strictly inside the Token Broker / Vault boundary.
     - Mutating IaC intents require a pre-flight `dryRun` plan diff + Infracost monthly USD delta before Tier 3 human approval, and `destroyInfrastructure` enforces explicit target environment name verification.

### `incidents` & `observability` Category Capability Contracts
<!-- Source: incoming/TOOLS_CATEGORIES.md (Sections: Incidents Platforms, Observability) -->

1. **`incidents` Category Contract (On-Call & Incident Lifecycle):**
   - **Supported Providers:** PagerDuty, Opsgenie, Rootly, Incident.io, FireHydrant, Splunk On-Call (VictorOps), xMatters, Squadcast, Datadog Incident/On-Call, Grafana Incident/OnCall, Better Stack, PagerTree, and GoAlert.
   - **Standard Intents & Risk Tiers:**
     - `READ` (service-principal allowed): `getOnCall`, `listActiveIncidents`, `getIncidentStatus`.
     - `WRITE_LOW` (User OBO required): `acknowledgeIncident`, `addTimelineNote`.
     - `WRITE_HIGH` HITL (User OBO required): `pageOnCall` (unless authorized via pre-approved automated incident runbook with cooldown/dedup guards), `escalateIncident`, and `resolveIncident`.
2. **`observability` Category Contract (Metrics, Logs, Traces, Annotations & SLOs):**
   - **Supported Providers:** Datadog, New Relic, Dynatrace, Honeycomb, Splunk Observability Cloud, Grafana Stack (Prometheus/Mimir, Loki, Tempo, Alertmanager), SigNoz, Elastic Observability, AWS CloudWatch/X-Ray, Google Cloud Observability, and Azure Monitor.
   - **Standard Intents & Risk Tiers:**
     - `READ` (service-principal allowed): `getMetrics`, `getServiceLogs`, `getTraces`, `getSloStatus`.
     - `WRITE_LOW`: `markDeployment`, `createAnnotation`.
     - `WRITE_LOW` (`dev`/`staging`) / Mandatory `WRITE_HIGH` HITL (`prod`): `createAlertRule`, `silenceAlert`, and `muteAlerts` (requiring a bounded `duration` / `expiresAt` TTL so production alerts cannot be silenced indefinitely).
   - **Telemetry Scrubbing & Taint Invariant:** `getServiceLogs` and `getTraces` enforce bounded time-range/token caps (`<= 4,000` tokens), run synchronous DLP secret and PII/PHI redaction on all log/span attributes, and mark the workflow `tainted = true` whenever raw application logs or user-controlled request payloads are ingested.

### `scorecards`, `security` & `scm` Category Capability Contracts
<!-- Source: incoming/TOOLS_CATEGORIES.md (Sections: Quality Scorecards, Security, Source Control Management) -->

1. **`scorecards` Category Contract (Engineering Maturity & Readiness Checks):**
   - **Supported Providers:** Spotify Soundcheck, Cortex, OpsLevel, Lighthouse, and Atlassian Compass.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `evaluateScorecard`, `getServiceScore`, `listFailingChecks`.
     - `WRITE_LOW`: `recordCheckResult` (restricted via RBAC to agent-owned custom check IDs so automated runs cannot spoof passing security/compliance scorecard checks).
2. **`security` Category Contract (AppSec Scanning, Compliance Posture & SLSA Attestations):**
   - **Supported Providers:** Snyk, Wiz, Prisma Cloud, Orca Security, Chainguard / Sigstore (Cosign) / Witness / in-toto, Aqua Security (Trivy), GitHub Advanced Security (GHAS) / GitLab Ultimate Security, SonarQube, Checkmarx, and Veracode.
   - **Standard Intents & Risk Tiers:**
     - `READ` / `WRITE_LOW` (async scan trigger): `scanRepository`, `scanArtifact`, `getScanResults`, `getComplianceStatus`, `verifyAttestation`.
     - `WRITE_LOW` (authenticated CI pipeline context only): `attestBuild` (SLSA provenance generation).
     - Mandatory `WRITE_HIGH` HITL (User OBO + Security RBAC required): `createSecurityException` (waiving/ignoring vulnerabilities)—requires explicit justification `reason`, bounded `expiresAt` expiration, and non-repudiable `AuditLogSink` logging.
3. **`scm` Category Contract (Git Forges, Code Review & Releases):**
   - **Supported Providers:** GitHub, GitLab, Bitbucket (Cloud & Data Center), Azure Repos, Gitea / Forgejo, and AWS CodeCommit.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `getFileContent`, `getPullRequest`, `listPullRequests`, `getCommitStatus` (wrapped in per-turn randomized `<external_data_...>` delimiters; sets `tainted = true` when reading external/forked PRs).
     - `WRITE_LOW` (feature branches only): `createBranch`, `commitFile` (blocked on protected default branches `main`/`master`/`release/*`), `createPullRequest` / `createMergeRequest`, `addPullRequestComment`, `setCommitStatus`.
     - Mandatory `WRITE_HIGH` HITL: `mergePullRequest`, `approvePullRequest`, `createReleaseTag`, and `deleteBranch` (never bypassing native forge branch-protection rules).

### `testing` & `ticketing` Category Capability Contracts
<!-- Source: incoming/TOOLS_CATEGORIES.md (Sections: Testing, Ticketing Platforms) -->

1. **`testing` Category Contract (QA Suites, Synthetic/E2E Runners & Code Coverage):**
   - **Supported Providers:** TestRail, Qase, Zephyr Scale, Xray for Jira, Allure TestOps, ReportPortal, BrowserStack, Sauce Labs, LambdaTest, Rainforest QA, Checkly, Playwright, Cypress Cloud, Codecov, Coveralls, and SonarQube / SonarCloud.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `getTestResults`, `compareTestResults` (`runId1` vs. `runId2`), `getCodeCoverage` (by `buildId`).
     - `WRITE_LOW` (`dev`/`staging`/`qa`) / Mandatory `WRITE_HIGH` HITL (`prod` target): `triggerTestSuite` (`suiteId` -> `runId`) and `createTestReport` (PDF/HTML/XML/CSV exports stored in `ArtifactSink` with `24h` TTL).
   - **Isolation Invariant:** In-cluster Playwright test execution runs strictly inside ephemeral `sandbox-execution-queue` containers with cgroup quotas; production synthetic runs require Tier 3 HITL approval.
2. **`ticketing` Category Contract (alias `project-management` — Issues, Boards, Sprints & ITSM):**
   - **Supported Providers:** Jira, Linear, GitHub Issues, Asana, GitLab Issues, Azure DevOps Boards, YouTrack, Shortcut, ServiceNow, Zendesk, Freshservice / Freshdesk, ClickUp, Trello, and Monday.com.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `getTicket`, `searchTickets`, `getSprintStatus`, `getRoadmapProgress`, `getTeamWorkload` (wrapped in per-turn randomized `<external_data_...>` delimiters; sets `tainted = true` when reading external customer-support tickets from Zendesk/Freshdesk).
     - `WRITE_LOW` (User OBO required): `createTicket`, `updateTicket`, `transitionTicket`, `linkTickets`, `createBoard`, `createColumn`, `setColumnWipLimit`, `moveCard`, `createSprint`, `startSprint`, `assignToSprint`, `createMilestone`, `linkToMilestone`, `setEstimate`, `logWorkTime`.
     - Mandatory `WRITE_HIGH` HITL (User OBO required): `archiveBoard`, `closeSprint` (with ticket rollover), `updateProjectHealth` (executive stakeholder status updates), and closing external customer-facing support tickets.

### `catalog` & `identity` Category Capability Contracts (20-Category Canonical Taxonomy)
<!-- Source: incoming/TOOLS_CATEGORIES.md (Section: Major Missing Categories in the Backstage Ecosystem) -->

Expanding the canonical capability taxonomy from 18 to **20 kebab-case categories** adds native Internal Developer Portal (`catalog`) and Just-in-Time access governance (`identity`) primitives:

1. **`catalog` Category Contract (alias `idp` — Software Catalog, Scaffolder & Ownership):**
   - **Supported Providers:** Backstage Software Catalog, Backstage Scaffolder, Backstage TechDocs, Port, Cortex, OpsLevel, and Configure8.
   - **Standard Intents & Risk Tiers:**
     - `READ` (RBAC-filtered via `PermissionsService`): `getServiceMetadata`, `getServiceOwner`, `listServiceDependencies` (backed by `get_entity_neighborhood`), and `getComponentHealth`.
     - `WRITE_LOW` (non-prod templates) / Mandatory `WRITE_HIGH` HITL (prod templates or FinOps delta `>= $50/mo`): `scaffoldTemplate` and `registerEntity`.
2. **`identity` Category Contract (alias `access-management` — IAM, RBAC & Just-in-Time Access):**
   - **Supported Providers:** Okta, Microsoft Entra ID (Azure AD), Auth0, Teleport, StrongDM, Opal Security, Veza, and AWS IAM Identity Center.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `getUser`, `getTeamMembers`, `listUserPermissions`.
     - Mandatory `WRITE_HIGH` HITL (paired with `approval` state machine): `grantTemporaryAccess`, `assignRole`, and `revokeAccess`.
   - **JIT Privilege & Anti-Self-Approval Invariants:**
     - `grantTemporaryAccess` requires a strict, bounded `expiresAt` TTL (default ceiling `<= 8 hours`) so elevated sessions auto-revoke deterministically.
     - `CapabilityGateway` blocks self-approval on all `identity` elevation intents and records non-repudiable `AuditLogSink` entries capturing grantor, target principal, role/entitlement, TTL, and approval ID.

### `runtime` & `api-management` Category Capability Contracts (22-Category Canonical Taxonomy)
<!-- Source: incoming/TOOLS_CATEGORIES.md (Section: Major Missing Categories in the Backstage Ecosystem — Part 2) -->

Adding day-2 container/serverless operations (`runtime`) and API gateway lifecycle management (`api-management`) completes the **22-category canonical capability taxonomy**:

1. **`runtime` Category Contract (alias `compute` — Day-2 Kubernetes, Serverless & Container Operations):**
   - **Supported Providers:** Kubernetes (`@backstage/plugin-kubernetes-backend`), AWS ECS / Lambda, Google Cloud Run, HashiCorp Nomad, Red Hat OpenShift, and Rancher.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `getPodStatus`, `getClusterEvents` (DLP-scrubbed and token-capped).
     - `WRITE_LOW` (`dev`/`staging`) / Mandatory `WRITE_HIGH` HITL (`prod`): `scaleService` (replica bounds enforced), `restartPodOrService`, `invokeFunction`, and `execDiagnosticCommand`.
   - **Day-2 Runtime Safety Invariants:**
     - `execDiagnosticCommand` prohibits arbitrary shell strings—allowing only pre-approved, parameter-validated read-only diagnostic commands, running synchronous DLP scrubbing on stdout/stderr, and marking the workflow `tainted = true`.
     - Production `scaleService` and `restartPodOrService` mutations require `get_entity_neighborhood` blast-radius hydration, active PagerDuty/freeze checks, and post-mutation pod readiness verification (`verifyStateActivity`).
2. **`api-management` Category Contract (API Gateways, OpenAPI Specs & Consumer Governance):**
   - **Supported Providers:** Kong, Google Cloud Apigee, AWS API Gateway, Postman, SwaggerHub, Gravitee, and Tyk.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `getApiConsumers`, `validateApiContract`.
     - `WRITE_LOW` (`dev`/`staging`) / Mandatory `WRITE_HIGH` HITL (`prod` or external gateways): `publishApiSpec`, `updateRateLimit`.
     - Mandatory `WRITE_HIGH` HITL: `createApiKey` and `revokeApiKey`.
   - **Zero-Plaintext Key Issuance Invariant:** `createApiKey` stores the generated secret directly into the enterprise secret store (Vault / Secrets Manager) and returns only `{ keyId, secretRef, scopes, expiresAt }` metadata—never exposing raw API key material to Temporal history or the LLM context window.

### `crm` & `data-ops` Category Capability Contracts (24-Category Canonical Taxonomy)
<!-- Source: incoming/TOOLS_CATEGORIES.md (Section: Major Missing Categories in the Backstage Ecosystem — Part 3) -->

Adding external customer/SLA context (`crm`) and database/schema lifecycle management (`data-ops`) completes the **24-category canonical capability taxonomy**:

1. **`crm` Category Contract (alias `customer-support` — Customer Account Context & Escalations):**
   - **Supported Providers:** Salesforce, Zendesk, Intercom, HubSpot, and Freshdesk (strictly separated from internal engineering `ticketing`).
   - **Standard Intents & Risk Tiers:**
     - `READ` (DLP-scrubbed + mandatory taint): `getCustomerAccount`, `getSupportTicket`, `getCustomerSla`.
     - `WRITE_LOW` (User OBO required): `linkSupportTicketToIssue`.
     - Mandatory `WRITE_HIGH` HITL (User OBO required): `updateSupportTicketStatus` (especially any status transition or comment visible to external customers).
   - **Untrusted Customer Input Invariant:** Because support tickets originate from external customers, `getSupportTicket` unconditionally sets `tainted = true` on the workflow state, scrubs customer PII/PHI via DLP middleware, and wraps content in per-turn randomized `<external_data_...>` boundary delimiters.
2. **`data-ops` Category Contract (alias `databases` — Database Lifecycle, Migrations & Data Lineage):**
   - **Supported Providers:** Snowflake, Databricks, Neon, PlanetScale, AWS RDS, Liquibase / Flyway, and DataHub / Amundsen.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `getSlowQueries` (literal-scrubbed SQL fingerprints), `getDatasetLineage`.
     - `WRITE_LOW` (`dev`/`staging` or non-destructive backup) / `WRITE_HIGH` (`prod`): `createDatabaseBranch`, `takeDatabaseSnapshot`.
     - Mandatory `WRITE_HIGH` HITL: `runSchemaMigration` and `restoreSnapshot`.
   - **Pre-Migration Safety Invariant:** Every `runSchemaMigration` or `restoreSnapshot` requires a pre-flight `dryRun` DDL/migration plan, `get_entity_neighborhood` downstream service blast-radius check, system-level blast-radius lease, and a verified pre-change `takeDatabaseSnapshot` recovery checkpoint.

### `storage` & `messaging` Category Capability Contracts (26-Category Canonical Taxonomy)
<!-- Source: incoming/TOOLS_CATEGORIES.md (Section: Major Missing Categories in the Backstage Ecosystem — Part 4) -->

Adding raw object/blob storage (`storage`) and asynchronous event-bus/queue operations (`messaging`) completes the **26-category canonical capability taxonomy**:

1. **`storage` Category Contract (Object, Blob & File Storage):**
   - **Supported Providers:** AWS S3, Google Cloud Storage, Azure Blob Storage, MinIO, and Cloudflare R2.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `listObjects`, `getObject` (UTF-8 text capped at `<= 4,000` tokens, DLP-scrubbed, and wrapped in `<external_data_...>` delimiters; binary/large objects stream directly to `ArtifactSink` quarantine without entering Temporal history).
     - `WRITE_LOW`: `putObject` (tenant-scoped scratch/output prefixes), `generatePresignedUrl` (read-only `GET` URLs capped at `<= 15 minutes` TTL, with query signatures stripped from logs/traces).
     - Mandatory `WRITE_HIGH` HITL: `putObject` (production/shared buckets), `deleteObject`, and `setBucketLifecycle`.
2. **`messaging` Category Contract (alias `streaming` — Event Buses, Queues & Topics):**
   - **Supported Providers:** Apache Kafka (Confluent, Strimzi), AWS SQS / SNS / EventBridge, RabbitMQ, Google Pub/Sub, and NATS.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `getTopicLag`, `listDeadLetterMessages` (capped at `<= 25` sampled messages, DLP-scrubbed, wrapped in `<external_data_...>` delimiters, and unconditionally setting `tainted = true`).
     - `WRITE_LOW` (`dev`/`staging`) / Mandatory `WRITE_HIGH` HITL (`prod`): `publishEvent` and `registerEventSchema` (enforcing backward/full schema compatibility checks).
     - Mandatory `WRITE_HIGH` HITL: `replayDeadLetterQueue` (requires bounded `maxMessages` and `rateLimitPerSec` parameters to prevent downstream thundering herds) and `purgeQueue`.

### `dns` & `ai` Category Capability Contracts (28-Category Canonical Taxonomy)
<!-- Source: incoming/TOOLS_CATEGORIES.md (Section: Major Missing Categories in the Backstage Ecosystem — Part 5) -->

Adding imperative edge/DNS operations (`dns`) and AI/MLOps lifecycle governance (`ai`) completes the **28-category canonical capability taxonomy**:

1. **`dns` Category Contract (alias `networking` — Domains, TLS Certificates & Traffic Edge):**
   - **Supported Providers:** Cloudflare, AWS Route 53, Akamai, Fastly, Let's Encrypt / cert-manager, and HashiCorp Consul.
   - **Standard Intents & Risk Tiers:**
     - `WRITE_LOW` (`dev`/`staging` or path-scoped): `issueCertificate`, `renewCertificate`, `purgeCdnCache` (path/surrogate-key scoped only).
     - Mandatory `WRITE_HIGH` HITL: `upsertDnsRecord`, `deleteDnsRecord`, `toggleMaintenanceMode`, and full-zone `purgeCdnCache` (`purgeEverything: true`).
   - **Edge Blast-Radius Invariant:** Production DNS/maintenance mutations require `get_entity_neighborhood` blast-radius hydration, a `dryRun` record diff, and post-mutation DNS/TLS health verification (`verifyStateActivity`).
2. **`ai` Category Contract (alias `mlops` — Model Registries, Prompt Versions & Vector Stores):**
   - **Supported Providers:** Weights & Biases, MLflow, Hugging Face Hub, LangSmith / Braintrust, Pinecone, and Weaviate.
   - **Standard Intents & Risk Tiers:**
     - `READ`: `getModelMetrics`.
     - `WRITE_LOW` (offline evals or `dev`/`staging` targets): `runEvaluationSuite`, `reindexVectorStore` (non-prod).
     - Mandatory `WRITE_HIGH` HITL (`prod` targets): `promoteModel`, `updatePromptTemplate`, and production `reindexVectorStore`.
   - **Control-Plane Immutability Invariant:** `updatePromptTemplate` and `promoteModel` govern downstream tenant/application ML assets only; they are deterministically blocked from mutating the Backstage agent's own live system prompts or `ModelRegistry` production tiers outside GitOps PRs and Golden Dataset CI gates.

### Domain Category Aggregation & Multi-Destination Fan-Out (`listByCategory`)
<!-- Source: incoming/TOOLS.md (Sections: Architectural Diagnostics of the Tools Subsystem, Hardened Core Contracts, The Workflow Orchestrator Multi-Dispatch Execution Blueprint) -->

To support multi-destination orchestration (such as broadcasting incident alerts across Slack and PagerDuty concurrently without hardcoding vendor strings in workflows), `CapabilityCatalogReader` supports **category-grouped discovery** mediated by `CapabilityGateway`:

1. **Principal-Filtered Category Discovery (`listByCategory`):**
   - Expose `listByCategory(category: CapabilityCategory, principalContext)` returning deep-frozen, read-only `CapabilityDescriptor` metadata for all capabilities in that canonical 28-category namespace (normalizing legacy `TOOLS.md` category names: `kubernetes -> runtime`, `project-management -> ticketing`, `compliance -> security`, `cloud-providers -> infrastructure`).
   - Lookups **never** return executable `Tool.invoke` methods; every resolved capability executes exclusively through `CapabilityGatewayClient.invoke(...)` with zero `any` type assertions and zero raw credentials in `CapabilityInvocationContext`.
2. **Typed Invocation Envelope (`CapabilityInvocationResult`):**
   - Standardize gateway outputs around `{ capabilityId, category, providerInstanceId, output, summary, executedAt, auditEventId }` so multi-destination workflows receive uniform, DLP-scrubbed results across heterogeneous providers.

### Sandboxed Execution Equivalents for Host, Browser & Secret Tools
<!-- Source: incoming/PI_AGENT.md (Section: Step 4 (Execute Tools): The 20+ Tools OpenClaw Injects) -->

- **Zero Host Shell / Raw Secret Exposure:** OpenClaw's local `exec`, `process`, `terminal`, `browser`, and `secrets` tools map strictly to hardened enterprise capabilities:
  - Code and shell diagnostics execute inside ephemeral rootless containers (`sandbox-execution-queue`, `--network none`, cgroup CPU/memory/PID quotas).
  - Browser automation (`browser`) runs in sandboxed Playwright with ARIA accessibility-tree snapshots (`accessibility_tree` mode) and domain allowlists.
  - Credential injection (`secrets`) resolves opaque `secretRef` handles exclusively inside the Token Broker / egress proxy without ever exposing plaintext secret values to the LLM or tool outputs.

### On-Demand `load_skill` Capability (GitOps Digest-Pinned)
<!-- Source: incoming/PI_AGENT.md (Section: System Prompt Construction) -->

- **Schema-Validated Skill Hydration (`load_skill`):** Expose a `READ` capability `load_skill({ skillId })` backed by the boot-compiled, SHA-256 digest-pinned GitOps Skill Registry (filtered by caller `PermissionsService` RBAC) so agents load full `SKILL.md` playbooks just-in-time without touching local container filesystems.

### Provider-Aware JSON Schema Sanitization, Cascade Filtering & Self-Correcting Validation
<!-- Source: incoming/PI_AGENT.md (Section: Tool Management) -->

Adapting the `pi-agent-core` + `createOpenClawCodingTools` preparation pipeline onto our Zod + `CapabilityGateway` stack establishes three runtime guarantees:

1. **Provider-Specific JSON Schema Sanitization (`cleanToolSchemaForProvider`):**
   - When projecting Zod capability schemas into JSON Schemas for `ModelExecutor`, run a recursive provider-targeted sanitizer before calling the LLM API:
     - **Google Gemini:** Strip unsupported schema keywords (`default`, unsupported `anyOf`/`oneOf` unions, `additionalProperties`) that trigger `400` schema rejections.
     - **OpenAI Strict Mode:** Enforce `additionalProperties: false` and explicit `required` key arrays across all nested object schemas.
2. **Multi-Layer Capability Cascade Filtering:**
   - Before compiling tool schemas for a turn, filter `CapabilityCatalog` through a deterministic cascade: `Tenant Policy -> Backstage RBAC (PermissionsService) -> Active Kill-Switch Flags -> Sub-Agent Narrowed Ceiling -> Channel/Surface Policy`. Unauthorized capabilities are omitted from callable tool schemas so the model cannot invoke them.
3. **Self-Correcting Zod Argument Validation (`ValidationError` `toolResult`):**
   - `CapabilityGateway` validates every incoming tool-call payload against its canonical Zod schema before policy/driver execution. Malformed arguments return a structured, sanitized `ValidationError` `toolResult` back to the LLM (capped at `<= 2` consecutive validation retries per turn) so the model can self-correct without crashing the workflow.

#### How TypeBox Compares to Zod and Other TypeScript Schema Libraries

[`@sinclair/typebox`](https://thinkthroo.com/blog/typebox-a-json-schema-type-builder) is fundamentally different from **Zod**, **Yup**, or **Valibot**:

- **JSON Schema First (Zero Translation Overhead):** Zod defines a proprietary TypeScript validator object first and requires a separate converter (`zod-to-json-schema`) to generate the JSON Schema that LLM APIs require. **TypeBox objects \*are\* valid JSON Schema 7 objects at runtime** while simultaneously inferring static TypeScript types via `Static<typeof MySchema>`.
- **Performance:** Because TypeBox produces standard JSON Schemas, Pi compiles them with **AJV** (Another JSON Schema Validator), making runtime argument validation orders of magnitude faster than Zod's recursive parser.
- **Gotcha for LLM APIs:** Because TypeBox emits raw JSON Schema constructs (`anyOf`, `const`, `Type.Union`), providers like Google Gemini can reject complex unions—which is why Pi provides a `StringEnum` helper and OpenClaw runs a schema sanitizer over TypeBox outputs.

### UI `label` Metadata & Dual-Channel Result Envelope (`llmContent` vs. `uiDetails`)
<!-- Source: incoming/PI_AGENT.md (Section: What Pi's API for Adding New Tools Looks Like) -->

Adapting the ergonomics of Pi's `AgentToolResult` contract into our `CapabilityDescriptor` and `CapabilityInvocationResult` schemas improves both UI clarity and context-window efficiency:

1. **Human-Readable UI `label` on `CapabilityDescriptor`:**
   - Require a concise human-readable `label` (e.g., `"Lookup Catalog"`, `"Create Pull Request"`) on every `CapabilityDescriptor` alongside `capabilityId` and LLM `description` so the Backstage drawer, HITL approval cards, and audit views display clean titles rather than raw snake_case IDs.
2. **Dual-Channel Invocation Result (`llmContent` vs. `uiDetails`):**
   - **`llmContent` (Model-Visible):** Bounded (`<= 4,000` tokens), DLP-scrubbed summary text injected into the LLM's `toolResult` message (wrapped in per-turn randomized `<external_data_...>` delimiters when external).
   - **`uiDetails` (UI & Log Only):** Structured, DLP-scrubbed rendering metadata (entity links, diff stats, resource IDs, HTTP status) persisted in `SessionStore` and streamed to the Backstage UI drawer without inflating future LLM prompt token budgets.

### Pre-Execution Path Canonicalization & Post-Execution Return Normalization
<!-- Source: incoming/PI_AGENT.md (Section: How OpenClaw Enforces Runtime Path Guards & Normalizes Return Payloads) -->

To prevent symlink path-traversal attacks and protect downstream LLM turns from malformed or oversized MCP/driver outputs, `CapabilityGateway` enforces two deterministic boundary guards around every driver call:

1. **Canonical Path & Target Containment (`assertSandboxPath` Equivalent):**
   - For any sandboxed file or repository operation inside `sandbox-execution-queue`, resolve target paths (`path`, `filePath`, `cwd`) via `fs.realpath()` (resolving the nearest existing ancestor for newly created files) and verify that the canonical path remains strictly inside the ephemeral `/workspace` root before any disk I/O executes.
2. **Post-Execution Return-Payload Normalizer (`normalizeCapabilityOutput`):**
   - Before running DLP redaction or returning results to Temporal, coerce non-conforming outputs (`undefined`, `null`, empty strings, or raw objects) from third-party drivers or MCP servers into a valid, non-empty `{ llmContent, uiDetails }` envelope.
   - Strip raw base64/binary blobs and truncate oversized outputs exceeding `4,000` tokens—offloading full payloads to KMS-encrypted `ArtifactSink` storage and substituting a bounded summary with an `artifactRef` handle.

### Canonical Vercel AI SDK `inputSchema` Projection
<!-- Source: incoming/PI_AGENT.md (Section: Vercel AI SDK Tool Handling) -->

- **Schema-Only Tool Projection (`inputSchema`):** `CapabilityCatalog` projects each authorized capability into a pure schema descriptor `{ description, inputSchema }` matching the Vercel AI SDK `tool()` contract, ensuring zero executable closures or vendor SDK clients are ever bundled into reasoning step inputs.

### External MCP Server Integration (`@ai-sdk/mcp`) & Hardening Controls
<!-- Source: incoming/MCP.md (Sections: Model Context Protocol (MCP)) -->

External **Model Context Protocol (MCP)** servers (exposing JSON-RPC 2.0 `Tools`, `Resources`, and `Prompts`) integrate into the platform as governed capabilities behind the `CapabilityGateway` rather than unvalidated runtime plugins.

#### 1. Transport & Network Egress Security
* **Production HTTP Transport Only:** Production deployments must use Streamable HTTP (`transport: { type: 'http', ... }`, supporting stateless MCP `2026-07-28` or explicit session reattachment) or SSE. `stdio` transports (`StdioClientTransport`) are prohibited in production worker fleets and restricted strictly to local developer sandboxes.
* **SSRF & Redirect Protection:** All remote MCP HTTP/SSE transports and OAuth metadata/token requests on Node.js workers must route through `createGuardedFetch()` with `redirect: 'error'` and connect-time DNS pinning to block private-network SSRF.
* **Transient Retries:** Configure `maxRetries` on `createMCPClient` *only* for idempotent, read-only MCP capabilities (`408`, `409`, `429`, `5xx`); never enable automatic transport retries for non-idempotent mutating tools.

#### 2. Tool-Definition Pinning ("Rug Pull" Defense) & Schema Governance
* **Cryptographic Fingerprinting:** At capability registration/approval time, compute and persist a baseline digest via `fingerprintTools(tools)` (covering tool name, title, description, and resolved input schema).
* **Pre-Execution Drift Gate:** Before exposing MCP tools to a model turn or executing a tool call, run `detectToolDrift(current, baseline)`. If `changed` or `added` tools are detected, fail closed, block execution, emit a security alert, and require administrative re-approval.
* **Explicit Zod Schemas:** Prefer explicit `schemas` (`inputSchema` and `outputSchema` validating `structuredContent`) over open-ended dynamic schema discovery so capability contracts remain strongly typed and auditable.

#### 3. OAuth Binding & Token Broker Integration
* **Issuer & Origin Allowlisting:** Enforce `validateAuthorizationServerURL` against an explicit tenant/platform allowlist of trusted OAuth issuers, pin `issuer` on confidential `clientInformation()`, and validate `callbackIssuer` (`iss`) during OAuth callbacks.
* **Atomic Shared Token Rotation:** When multiple Temporal workers share MCP OAuth credentials, implement `OAuthClientProvider.invalidateCredentials` using conditional/transactional database deletes matching `context.tokens` so concurrent refresh-token rotations do not clobber newer tokens.

#### 4. Untrusted Annotations & Approval Classification
* MCP server hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) are **untrusted metadata**. Map them conservatively into `CapabilityDescriptor` risk tiers: any tool lacking `readOnlyHint: true` (or flagged `destructiveHint: true`) requires RBAC verification and Human-in-the-Loop (HITL) approval before execution.

### MCP as a Standardized Capability Protocol vs. Bespoke Drivers
<!-- Source: incoming/MCP.md (Sections: Using MCPs vs. API Calls for External Services) -->

External **Model Context Protocol (MCP)** servers eliminate the need to write and maintain bespoke per-vendor SDK translation layers (e.g., separate GitHub, GitLab, and Bitbucket adapter codebases) by standardizing tool discovery and invocation over JSON-RPC 2.0.

#### 1. Role in `CapabilityGateway` Architecture
* **Protocol-Level Uniformity:** Rather than building custom driver mappings for every SaaS tool, the `CapabilityGateway` treats MCP as a standardized transport/adapter option alongside `HttpIntent` and `NativeAdapter`. Swapping providers (e.g., GitHub MCP vs. GitLab MCP) requires rebinding the capability endpoint rather than rewriting workflow or adapter code.
* **Reconciled Discovery Rule (No Blind `listTools()` Pass-Through):** Workflows must **not** call `listTools()` dynamically at runtime and pass unverified schemas directly to the LLM. Instead, MCP server capabilities are onboarded into the **Capability Registry** as versioned `CapabilityDescriptor` entries with pinned tool fingerprints (`fingerprintTools`), explicit risk classifications, and RBAC permission mappings; runtime calls verify `detectToolDrift` before execution.

#### 2. Token Custody Boundary (Internal Token Broker vs. External MCP Gateways)
* **Anti-Pattern Guardrail:** Do not offload enterprise OAuth tokens or regulated payloads (SOC-2, HIPAA, FINRA) to multi-tenant third-party SaaS MCP auth gateways (such as hosted Arcade.dev or Composio) unless deployed strictly single-tenant within our VPC under full compliance attestations.
* **Canonical Auth Pattern:** Credential custody, refresh-token rotation, and issuer pinning remain owned by the platform's internal **Token Broker**, which injects scoped short-lived credentials into the MCP transport (`authProvider` / headers) inside `toolExecutionActivity`.

### MCP Server Deployment Model, Lifecycle & Auth Brokering
<!-- Source: incoming/MCP.md (Sections: Mapping External Services to their MCP Endpoints, Auth Brokering for External Service MCPs) -->

#### 1. Stateless Ephemeral MCP Servers (Modern MCP `2026-07-28` Spec)
Enterprise MCP servers deployed for the platform must be **completely stateless and ephemeral**:
* **No Protocol Session Affinity:** Following the stateless MCP `2026-07-28` specification (which removes mandatory `Mcp-Session-Id` handshake state), MCP servers operate as pure request/response translation workers with zero internal workflow or conversation memory. All durable execution state lives in Temporal and PostgreSQL.
* **Production HTTP vs. Local `stdio`:** Production deployments connect exclusively to horizontally scalable Streamable HTTP MCP endpoints via `createGuardedFetch()`. Spawning `npx` / `stdio` child processes is prohibited in production pods to avoid process hoarding, memory leaks, and supply-chain risks; local `stdio` usage (dev-only) must enforce strict idle timeouts (2–5 minutes) and an explicit minimal environment allowlist (never spreading `...process.env`).

#### 2. Lazy On-Demand Connection & Capability Coverage Trade-Offs
* **Lazy Per-Step Instantiation:** Never eagerly initialize all MCP servers at workflow or dashboard startup. Open the MCP client connection lazily inside `toolExecutionActivity` only when a specific workflow step invokes that capability, and close it immediately in a `finally` block.
* **Read-Only Bias & Custom Capability Fill-In:** Many vendor-maintained MCP servers (especially observability platforms) expose only read-only context tools. When registering capabilities in the **Capability Registry**, verify whether mutating actions exist; implement targeted `HttpIntent` / `NativeAdapter` capabilities or internal stateless MCP microservices for required write/remediation actions.

#### 3. Token Broker & Backstage OAuth Integration
* **Zero LLM / Payload Credential Exposure:** Credentials are never passed to the LLM prompt or serialized into Temporal workflow histories.
* **Just-In-Time Credential Exchange:** Backstage's built-in Auth Providers (GitHub, GitLab, AWS, etc.) manage user OAuth grants. At tool execution time inside `toolExecutionActivity`, the **Token Broker** resolves the opaque grant reference into a short-lived, scope-minimized bearer token and injects it into the MCP HTTP `Authorization` header (or `OAuthClientProvider`), accompanied by pre-execution RBAC and policy checks.

### Per-Request Credential Injection for Stateless MCP Pools
<!-- Source: incoming/MCP.md (Sections: Stateless MCPs) -->

Because stateless MCP server pools (Streamable HTTP / MCP `2026-07-28`, deployed on horizontally scaled pods or serverless workers) retain zero user state or sticky session affinity between requests, every outbound MCP tool invocation must carry user-scoped authorization on the transport layer.

#### 1. Canonical Pattern: Transport-Level `Authorization` Headers
* **Per-Request Header Injection:** Inside `toolExecutionActivity`, the **Token Broker** resolves the caller's opaque grant reference into a short-lived bearer token and attaches it via HTTP transport headers (`Authorization: Bearer <token>`) on a transient `createMCPClient` (`transport: { type: 'http', fetch: guardedFetch, headers: ... }`).
* **Stateless Server Execution:** The receiving MCP server instance validates/uses the bearer token for that single JSON-RPC request, returns the response, and discards all request context—preventing cross-user session leakage and allowing instant load-balanced failover across pods.

#### 2. Anti-Pattern Guardrail: Never Inject Credentials into JSON-RPC `arguments`
* **Strict Prohibition:** Do **not** inject raw tokens or `auth` objects into a tool's JSON-RPC `arguments` payload (even as a proxy workaround for third-party servers that ignore HTTP headers). Tool arguments are routinely echoed in JSON-RPC error messages, LLM self-correction loops, and structured telemetry traces.
* **Legacy Server Adapter Rule:** If a third-party MCP server cannot read HTTP `Authorization` headers natively, wrap it behind an internal sidecar/adapter at the MCP service boundary that reads the verified HTTP header and translates it into the downstream process requirement outside the JSON-RPC argument schema.

### Authoring & Composing Custom Write-Capability MCP Servers
<!-- Source: incoming/MCP.md (Sections: Writing MCP Servers) -->

When official vendor MCP servers expose only read-only observability or discovery tools (e.g., reading Datadog logs/monitors without remediation actions), the platform fills capability gaps using lightweight custom TypeScript MCP servers built with `@modelcontextprotocol/sdk` and **Zod**.

#### 1. Custom MCP Server Authoring Standards
* **Declarative Zod Contracts:** Every custom MCP tool defines an explicit tool name, clear behavioral description, strict **Zod** input schema (`z.object({ ... })`), and structured output schema (`structuredContent`).
* **Stateless Streamable HTTP Deployment:** While `StdioServerTransport` may be used for local CLI/unit testing, production internal MCP servers must use stateless HTTP transport (`StreamableHTTPServerTransport`), deployed as horizontally scalable services behind internal mTLS/network policies.
* **Per-Request Header Auth (No Static Shared `process.env` Keys):** Internal write-capability MCP servers must extract short-lived, user/tenant-scoped credentials from incoming HTTP `Authorization` headers (injected by `toolExecutionActivity` via the **Token Broker**) rather than relying on global static `process.env` API keys, preserving per-caller audit attribution and least privilege.
* **Strict Error Narrowing:** Tool handlers return structured MCP error envelopes (`{ isError: true, content: [...] }`) using `unknown` error narrowing (`error instanceof Error`) without leaking stack traces or upstream credentials.

#### 2. Composing Vendor Read MCPs with Internal Write MCPs
* **Unified Capability Surface, Split Governance:** During `llmStepActivity`, read-only tools from a vendor MCP server and mutating tools from a custom internal MCP server are presented together as pinned schemas (`fingerprintTools`) so the model can plan multi-step workflows (e.g., *inspect active alerts -> propose monitor mute*).
* **Mandatory Approval Gate on Mutations:** Vendor read-only tools (`readOnlyHint: true` + registry allowlist) execute automatically inside `toolExecutionActivity`, whereas custom write tools (`mutating` / `destructiveHint: true`) pause workflow execution for RBAC verification and Human-in-the-Loop (HITL) approval before firing.

### AI SDK Tool Execution Taxonomy & Provider-Native Capabilities
<!-- Source: incoming/MCP.md (Sections: Available External Provider MCPs) -->

The platform categorizes all tools exposed to `ModelExecutor` across the four Vercel AI SDK tool archetypes, enforcing distinct governance and runtime boundaries for each:

| AI SDK Tool Type                   | Schema Owner                                                 | Execution Runtime                                         | Platform Governance & Sandbox Rule                           |
| :--------------------------------- | :----------------------------------------------------------- | :-------------------------------------------------------- | :----------------------------------------------------------- |
| **Function Tools**                 | Platform (`CapabilityDescriptor` + Zod)                      | Platform (`toolExecutionActivity` -> `CapabilityGateway`) | Canonical default for internal capabilities, `HttpIntent`, and `NativeAdapter` bindings; portable across all LLM providers. |
| **Dynamic Tools**                  | Runtime MCP / Registry Schema                                | Platform (`toolExecutionActivity` -> MCP Client)          | Used for vetted external MCP servers; requires `fingerprintTools` baseline pinning and `detectToolDrift` verification before invocation. |
| **Provider-Defined Client Tools**  | LLM Provider (e.g., Anthropic `bash`, `text_editor`, `apply_patch`, `computer`) | Platform-managed Sandbox                                  | Leverages model-native schema training while keeping execution under platform control. Must run inside ephemeral, isolated containers/VMs (never on host worker processes) with HITL approval for mutating actions. |
| **Provider-Executed Server Tools** | LLM Provider (e.g., Native Web Search/Grounding, Code Interpreter, Image Gen) | LLM Provider Cloud                                        | Bypasses `CapabilityGateway` execution; gated strictly by tenant `CapabilityPolicy` allowlists, provider BAA/DPA eligibility, and egress redaction. |

#### Cross-Provider Input Normalization & Marketplace Vetting
* **Input Normalization (`experimental_refineToolInput`):** When third-party or provider-defined tool schemas exhibit cross-model variance (e.g., emitting `""` vs. `null` for optional fields), normalize inputs deterministically via `experimental_refineToolInput` before validation, telemetry recording, and execution.
* **No Unvetted Marketplace Loading:** Third-party npm tool packages and public MCP marketplaces (e.g., Smithery, Pipedream) must undergo offline security review, explicit capability registration, and schema pinning prior to enablement—never dynamic runtime discovery.

### Uniform `ctx.tools.invoke` Dispatch via `CapabilityGateway`
<!-- Source: incoming/GRAPH_ORCHESTRATOR_INTEGRATION.md (Sections: Shared Memory in Backstage Backend Modules vs. Temporal Workers) -->

Step handlers invoke external capabilities through a uniform `ctx.tools.invoke(capabilityId, input)` facade:

* **No Hardcoded Worker `if/else` Tool Switches:** `ctx.tools.invoke` delegates directly to `CapabilityGateway`, which resolves `capabilityId` from the Capability Registry, enforces RBAC and HITL approval rules, exchanges `sessionGrantRef` via the **Token Broker** for a downstream provider token, and executes the target `NativeAdapter`, `HttpIntent`, or MCP capability.
* **Scrubbed Telemetry:** Tool invocation logs record `capabilityId`, `tenantId`, `workflowId`, and latency—never raw input payloads or credentials.

### Read-Only / Sandboxed Capability Guardrail inside Hypothesis Branches
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addHypothesisFork(name, config)) -->

* **No Irreversible External Mutations in Speculative Forks:** Because every branch in `.addHypothesisFork()` executes concurrently prior to `merge` selection, steps inside hypothesis branches must restrict capability calls to read-only inspection (`readOnlyHint: true`), dry-run estimators, or isolated ephemeral sandboxes. Irreversible mutations (e.g., merging PRs, applying cluster rollouts) must execute *after* `merge` commits the winning plan to master state.

### Strict Logical Tenant Boundary Enforcement in `CapabilityGateway`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureCompliance(config)) -->

* **Fail-Closed Cross-Tenant Guard (`tenantIsolation: 'strict-logical'`):** On every `ctx.capabilities.*` / `ctx.tools.invoke` call, `CapabilityGateway` verifies that target resource attributes, Backstage entity refs, and Token Broker credential grants match the workflow's verified `ctx.tenant.id`. Any cross-tenant mismatch immediately aborts execution with a `TenantIsolationViolationError` and emits a high-severity security audit event.

### Per-Capability Rate-Limit Proxying in `CapabilityGateway`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureThrottling(config)) -->

* **Prefix & Exact Capability Matching:** `CapabilityGateway` resolves `capabilityRateLimits` rules by exact capability ID (`backstage:scaffolder.executeTemplate`) or namespace prefix (`backstage:scaffolder`, `github`), acquiring a distributed rate-bucket lease before executing outbound HTTP/MCP calls—preventing downstream `429 Too Many Requests` cascades.

### Distributed Capability Circuit Breakers in `CapabilityGateway`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureResilience(config)) -->

* **Three-State Distributed Breaker (`CLOSED` / `OPEN` / `HALF_OPEN`):** `CapabilityGateway` tracks consecutive downstream failures per capability namespace (`backstage:kubernetes`, `github`) in shared distributed state (Redis/PostgreSQL) scoped to `(tenantId, capabilityNamespace)`.
* **Fast-Fail Protection & Half-Open Probes:** Once failures reach `maxFailures`, the breaker transitions to `OPEN` for `resetTimeoutMinutes`, immediately rejecting outbound calls with `CircuitBreakerOpenError` (preventing cascading HTTP timeout stalls) before allowing controlled `HALF_OPEN` recovery probes after cooldown.

### Encapsulating Internal Backstage Plugin Calls Behind `CapabilityGateway`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.auth.getPluginRequestToken(options)) -->

* **Unified Internal Service Pattern:** Calls to internal Backstage plugins (such as `sonarqube-backend`, `catalog`, or `scaffolder`) should be registered as `HttpIntent` or `NativeAdapter` entries in the **Capability Registry** (`authStrategy: 'backstage-plugin-token'`). `CapabilityGateway` resolves base URLs via service discovery and injects the Token Broker's signed `Authorization: Bearer <token>` header automatically, keeping auth plumbing out of workflow step code.

### Tenant & RBAC Enforcement on Backstage Catalog Capabilities
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.catalog.getSystemDependencies(systemId)) -->

* **Caller-Scoped Catalog Visibility:** Whether invoked via `ctx.catalog.getSystemDependencies()` or `CapabilityGateway`, catalog queries propagate the triggering user's identity and `tenantId` so Backstage's Catalog permission policy (`catalog.entity.read`) filters out restricted or cross-tenant entities before returning results to the worker.

### Allowlisted Internal Plugin Discovery & SSRF Guardrails
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.discovery.getBaseUrl(pluginId)) -->

* **Plugin Allowlist Enforcement:** `ctx.discovery.getBaseUrl(pluginId)` and `HttpIntent` internal plugin routes validate `pluginId` against an explicit platform allowlist of registered Backstage services (`catalog`, `scaffolder`, `search`, approved domain plugins), failing closed on unknown identifiers.
* **Guarded Internal Transport:** Outbound requests to discovered internal plugin endpoints execute through `createGuardedFetch()` (with `redirect: 'error'` and internal cluster DNS validation) alongside Token Broker service credentials (`targetPluginId`).

### SSRF Host Allowlisting & Tenant Credential Isolation for `UrlReader`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.urlReader.readUrl(url)) -->

* **Mandatory Host Allowlist (`reading.allow`):** Before issuing any outbound request for `ctx.urlReader.readUrl(url)`, `CapabilityGateway` parses the URL and verifies the hostname against the tenant's approved SCM/artifact host allowlist, rejecting private IP ranges, link-local metadata endpoints (`169.254.169.254`), and non-HTTPS schemes via `createGuardedFetch()` (`redirect: 'error'`).
* **Tenant-Scoped Token Injection:** Rather than falling back to a shared global SCM token across tenants, `CapabilityGateway` resolves the tenant's or caller's SCM grant from the **Token Broker** for the matched host provider.

### Capability Response Caching via Backstage `CacheService`
<!-- Source: incoming/CACHE_MEMCACHE_AND_REDIS.md (Sections: Backstage APIs for Memcached and Redis, How to Use It Programmatically inside your Plugin) -->

* **Driver-Free Cache Injection:** Capability caching and rate-limit state inside `CapabilityGateway` must consume Backstage's injected `coreServices.cache` interface rather than importing raw Redis/Memcached drivers (`ioredis`, `redis`, `memjs`) directly.
* **Principal-Scoped Cache Keys:** Cache keys for read-only/idempotent capabilities must incorporate the capability ID, normalized input hash, and caller `tenantId` / `principalRef` (plus permission scope hash) so cached capability responses are never served across unauthorized principals.

### Backstage Extension Points & Blueprints for Pluggable Drivers
<!-- Source: incoming/ARCHITECTURE_FILE_LAYOUT.md (Section: Proposed File Architecture -- backstage-plugin-agent-node/src/extension-points & blueprints) -->

* **Decoupled Driver Registration (`core-node`):** Separate backend driver modules register implementations against typed extension points and blueprints exported by `backstage-plugin-agent-node`:
  * `platform-driver.extension-point.ts` / `platform-driver.blueprint.ts` — Observability, SCM, and IDP platform integrations.
  * `storage-driver.extension-point.ts` / `storage-driver.blueprint.ts` — Vector/retrieval backends (e.g., `pgvector`, Qdrant).
  * `security-driver.extension-point.ts` / `security-driver.blueprint.ts` — Secret/KMS providers (e.g., HashiCorp Vault, AWS KMS) backing the Token Broker and payload encryption.
* **Reconciliation Note:** Driver implementations registered via these blueprints must adhere to the `CapabilityGateway` boundary (structured `HttpIntent` specs or governed `NativeAdapter` handlers with PII/PHI validation from `utils/validation.ts`), preventing direct unredacted network egress or raw credential exposure.

### Reconciling `AgentContext` Primitives into Governed Capabilities
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: The Fluent Core Interface Engine — AgentContext) -->

* **Capability Surface Migration:** Low-level infrastructure primitives sketched on the prototype `AgentContext` (`catalog.getEntity`, `catalog.getOwner`, `urlReader.readUrl`, `secrets.getScopedVaultSecret`, `discovery.getBaseUrl`) must be exposed to agents exclusively as registered `CapabilityDescriptor` entries mediated by `CapabilityGateway`:
  * **Backstage Catalog & Service Discovery:** Exposed as read-only native capabilities (`catalog:get-entity`, `catalog:get-owner`) that enforce caller RBAC (`PermissionsService`) and redact sensitive annotations before returning entity metadata to the LLM context.
  * **Secret Isolation:** Step handlers and LLM tools never call `getScopedVaultSecret()` directly; the Token Broker resolves credentials just-in-time inside the `CapabilityGateway` egress boundary.

### In-Memory `SecretEnvelope` & Driver-Scoped Credential Unwrapping
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: The Hardened Egress & Serialization Boundaries — Cryptographic Envelope Proxy (SecretEnvelope)) -->

To guarantee that plaintext credentials never cross into Temporal event history, LLM prompts, or structured logs, the Token Broker returns resolved secrets wrapped in an opaque in-memory `SecretEnvelope` inside the activity execution boundary:

* **Serialization-Safe Redaction (`toJSON` / `toString`):** Any accidental `JSON.stringify()`, string interpolation, or error serialization of a `SecretEnvelope` emits `[REDACTED_SECRET_REF_${referenceId}]` instead of the underlying secret material.
* **Authorized Driver Unwrapping (`revealSecretInternal`):** Only the `CapabilityGateway` egress executor (`HttpIntent` dispatcher or authorized `NativeAdapter`) can unwrap the plaintext value at the moment of outbound request signing.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
1. **Replace `Symbol.for(...)` with ECMAScript `#private` Fields + Unforgeable Lexical `Symbol()`:** In the prototype, `Symbol.for('secretValue')` and `Symbol.for('frameworkCapabilityDriverKey')` use the **global symbol registry**, meaning any third-party dependency or untrusted plugin code in the same Node.js isolate can call `Symbol.for('frameworkCapabilityDriverKey')` or `Object.getOwnPropertySymbols(envelope)` to extract the secret. Use a true ECMAScript `#secretValue` private field paired with a module-private (non-global) `Symbol()` or `WeakMap` token shared strictly between the Token Broker and `CapabilityGateway` egress executor.
2. **Never Pass `SecretEnvelope` Across Temporal Workflow/Activity Boundaries:** Because `SecretEnvelope.toJSON()` serializes to a redacted placeholder string, `SecretEnvelope` instances must **only** exist in-memory inside the activity worker process (resolved via Token Broker right before outbound execution)—never passed from a workflow into an activity payload.
3. **Add `util.inspect.custom` Trap:** Implement `[Symbol.for('nodejs.util.inspect.custom')]()` on `SecretEnvelope` returning `[REDACTED_SECRET_REF_${this.referenceId}]` so `util.inspect` or debug formatters never expose internal state.

### Secret Resolution Reconciliation (Compliance Checklist Item #3)
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Core System Compliance Checklist — Item 3: Secret Token Handshakes) -->

* **Reconciliation Note:** While the legacy checklist references extracting secrets via `ctx.secrets`, our hardened capability architecture forbids exposing raw secret-fetching APIs (`ctx.secrets`) directly to agent step logic. Instead, declarative capability requirements trigger **Token Broker** resolution inside `CapabilityGateway` (`HttpIntent` / `NativeAdapter`), keeping credentials wrapped in `#private` `SecretEnvelope` instances solely inside the egress driver boundary.

### Layered Capability Policy Resolution Cascade (Least-Privilege Subagent Delegation)
<!-- Source: incoming/OPENCLAW_LESSONS.md (Section: OpenClaw Lessons Worth Applying to a Backstage IDP Platform — Layered Policy Resolution Over Flat RBAC) -->

* **Ordered Intersection Cascade:** Rather than evaluating tool availability from a flat static list, `CapabilityGateway` resolves allowed capabilities through an ordered, strictly narrowing intersection cascade:
  `Global Platform Policy` $\cap$ `Tenant / Compliance Tier` $\cap$ `Backstage PermissionsService & Entity Ownership` $\cap$ `Workflow / Agent Declared Requirements` $\cap$ `Sandbox / Subagent Scope`
* **Monotonic Privilege Narrowing:** Delegated child workflows or subagents can only receive a **subset** of the parent run's resolved capability descriptors and RBAC scopes—never escalating privileges beyond the initiating principal (`principalRef`).

### Embedding-Guided Virtual Tool Clustering (`CapabilityDescriptor` Scaling)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 2: Embedding-Guided Virtual Tool Clustering) -->

When an enterprise Backstage deployment exposes 80+ capabilities across Scaffolder templates, CI/CD pipelines, Kubernetes diagnostics, cloud cost APIs, incident management, and MCP servers, injecting every full JSON Schema into every LLM turn wastes tens of thousands of tokens and degrades tool-selection accuracy. To keep baseline token footprint small and prevent argument hallucinations across similarly named actions, `CapabilityGateway` implements **Embedding-Guided Virtual Tool Clustering** adapted from VS Code Copilot Chat:

* **Registration-Time Embedding & Cosine-Similarity Clustering:**
  * When `CapabilityDescriptor` definitions are registered or updated, the capability registry computes vector embeddings from each capability's name, description, and domain tags, groups semantically related capabilities via cosine similarity (e.g., `observability_tools`, `scaffolder_actions`, `k8s_diagnostics`, `finops_queries`), and synthesizes a concise group summary per cluster.
* **Runtime Query Pre-Activation & On-Demand Expansion:**
  * At turn initialization (`before_prompt_build`), the runtime embeds the active user/step intent to pre-activate the top-$k$ most relevant capability clusters with their full typed input schemas, while exposing remaining authorized clusters as lightweight **virtual group descriptors**.
  * If the model determines it needs a capability outside the pre-activated set, invoking the virtual group expansion tool dynamically hydrates that cluster's concrete `CapabilityDescriptor` schemas on the next step (`prepareStep` in AI SDK 7).

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
1. **RBAC Filtering *Before* Cluster Rendering & Expansion:** Virtual tool clusters must be computed or filtered **after** resolving the caller's layered capability policy (`PermissionsService` + tenant/workflow allowlist). Never expose virtual group names, summaries, or schemas for capabilities the initiating `principalRef` is not authorized to inspect or invoke, and re-verify RBAC when a virtual cluster is expanded mid-run.
2. **Deterministic Cluster Caching & Prompt-Cache Stability:** Cache precomputed capability embeddings and cluster assignments keyed by `(capabilityRegistryVersionHash, tenantId)` so deterministic cluster ordering preserves LLM prompt prefix caching across turns.

### Distillation Subagent Capabilities & Raw Artifact Offloading
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 7: Noise-Filtering Execution Subagents (execution_subagent)) -->

* **Subagent-Backed `CapabilityDescriptor` Pattern:** High-verbosity diagnostic integrations (Kubernetes logs, Terraform plans, CI traces) expose a structured `CapabilityDescriptor` whose execution handler runs a bounded distillation loop, writes the full raw output to `ArtifactSink`, and returns only the compact summary + `artifactId` pointer to the calling workflow.

### Predicate Verifiers for Stop Hooks (`CapabilityGateway` Post-Conditions)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 9: Loop-Control Guardrails and Stop Hooks) -->

* **Deterministic Read-Only Verifiers:** Stop Hooks execute through governed, read-only `CapabilityDescriptor` **predicate verifiers** (e.g., `catalog:validate-entity`, `scm:verify-pull-request`, `k8s:check-rollout-ready`) rather than ad-hoc network scripts, ensuring post-condition checks respect caller RBAC, emit structured pass/fail evidence, and never mutate state during verification.

### Intent-Scoped Capability Narrowing
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 10: Context-Aware Intent Routing (IIntentService) Before Loop Entry) -->

* **Profile-Bound Toolsets:** Each resolved intent handler (`@catalog`, `@scaffolder`, `@ops`) defines an explicit upper-bound list of allowed `CapabilityDescriptor` IDs, intersected with the caller's `PermissionsService` grants and layered capability policy cascade before prompt compilation.

### Untrusted External Input Gates & Ephemeral Workspace Sandboxing
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 11: Workspace-Level Sandboxing & Untrusted Input Gates) -->

Because an enterprise Backstage IDP continuously ingests external telemetry—Jira tickets, GitHub issues/PR comments, PagerDuty alerts, and Sentry stack traces—the capability layer enforces strict provenance gates and execution isolation modeled on VS Code Copilot's cloud/local sandboxing:

* **Write-Access Trigger Gatekeeping (Indirect Prompt-Injection Defense):**
  * External events authored by unauthenticated users or actors lacking verified write/maintainer access on the target Backstage Catalog entity or source repository are **quarantined or restricted strictly to read-only triage profiles** by default.
  * Never allow an external webhook or untrusted third-party payload to trigger a workflow holding write credentials (`CapabilityDescriptor` with `mutating: true`) without verified principal provenance and human approval.
* **Ephemeral Per-Workflow Execution Sandboxes:**
  * Any capability performing code generation, repository checkout, patch application, or CLI/build execution runs inside an **ephemeral, per-workflow isolated `/workspace` sandbox** (container or isolated git worktree) with:
    * **Filesystem Containment:** Pre-execution `fs.realpath` symlink/path traversal validation (`assertSandboxPath`) strictly confining reads/writes to the ephemeral `/workspace`.
    * **Network Egress Control:** Outbound network access restricted to approved `CapabilityGateway` endpoints (no arbitrary internet egress).
    * **Short-Lived Scoped Credentials:** Token Broker mints minimal-scope, short-TTL credentials (e.g., single-repo GitHub installation tokens) solely at execution time inside the driver boundary, destroyed immediately upon sandbox teardown.

### Two-Phase Mutating `CapabilityDescriptor` Contracts (`stage` / `commit` / `compensate`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 12: Two-Tier Edits & Reversible Workspace Checkpoints) -->

* **Reversible Capability Metadata:** Mutating capabilities (`mutating: true`) declare whether they support:
  * **`preview` / `stage` mode:** Emits a structured diff/dry-run artifact into `ArtifactSink` for human or Stop-Hook inspection before mutation.
  * **`preMutationSnapshot` capture:** Returns deterministic baseline identifiers (`baseSha`, `resourceVersion`, `etag`, or snapshot `artifactId`) required to undo the mutation.
  * **`compensate` descriptor:** Optional idempotent rollback capability invoked during automated Stop-Hook failure recovery or human-triggered step rollback.

### `CapabilityGateway` Upstream Rate-Limit Normalization & Proactive Throttling
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 18: Rate-Limit Velocity vs. Quota Exhaustion Classification) -->

* **Header-Aware Error Normalization:** `HttpIntent` and `NativeAdapter` executors inspect upstream `429` responses, parse standard `Retry-After` / `X-RateLimit-*` headers to distinguish transient burst throttling from account/quota exhaustion, and update per-capability/per-tenant distributed rate-limit counters in `coreServices.cache` so concurrent workflows throttle proactively before hitting upstream bans.

### Graph-Aware Backstage Catalog & Symbol-Indexed Capabilities
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 20: AST-Aware Semantic Code Search & Symbols Over Raw grep) -->

Modeled on VS Code Copilot Chat's preference for LSP/Tree-sitter symbol indexes (`list_code_usages`, `get_document_symbols`) over blind multi-turn regex `grep` searches, the capability registry exposes **structured, graph-aware Backstage Catalog and symbol capabilities** as first-class read-only `NativeAdapter` tools:

* **Deterministic Catalog Graph Traversal Tools:**
  * `catalog:get-entity-relations` — Resolves direct upstream/downstream relations (`dependsOn`, `dependencyOf`, `providesApi`, `consumesApi`, `ownedBy`, `partOf`) for a target `entityRef` in a single query.
  * `catalog:find-consumers-of-api` — Identifies all `Component` and `System` consumers of a given `API` entity along with owner team metadata and lifecycle status.
  * `catalog:resolve-system-topology` — Returns a bounded subgraph (`maxDepth` capped, e.g., `3`) of components, APIs, and resources belonging to a `System` or `Domain`, eliminating dozens of exploratory repository searches.
* **AST / Symbol-Aware Code Navigation (When Repository Inspection Is Required):**
  * For repository-level workflows inside ephemeral `/workspace` sandboxes, expose structured symbol/AST lookup capabilities (definition/reference/signature queries) alongside bounded file reads so agents locate exact interfaces in one hop rather than burning turns on noisy full-repo regex scans.
* **Hardening Note:** Every node and edge returned by Catalog graph traversal tools must be filtered through Backstage's `PermissionsService` (`catalog.entity.read`) using the initiating `principalRef` and `tenantId`, and redacted of sensitive annotations before entering LLM context.

### Fuzzy Patch Matching & Inline Post-Edit Diagnostic Hooks (`get_errors` Pattern)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 21: Fuzzy Patch Matching & Diagnostic Self-Correction Loops (get_errors)) -->

Modeled on VS Code Copilot Chat's whitespace-tolerant file patching paired with immediate post-edit `get_errors` compiler/linter feedback, workspace file-editing capabilities attach **inline deterministic schema and policy validators** directly to the write tool's post-execution hook:

* **Whitespace-Tolerant Patch Application:**
  * File-mutation tools inside ephemeral `/workspace` sandboxes support normalized whitespace/indentation fuzzy matching (constrained to unique unambiguous match blocks with `fs.realpath` containment) so minor indentation drift does not fail patch application.
* **Synchronous Inline Schema & Policy Post-Hooks:**
  * Immediately after writing or patching declarative infrastructure artifacts inside the sandbox, the capability executes targeted deterministic validators and appends structured diagnostics directly to the tool return payload:
    * `catalog-info.yaml` — Backstage Software Catalog entity schema & well-known annotation validator.
    * Kubernetes manifests / Helm `values.yaml` — `kubeconform` / YAML schema validation.
    * Terraform HCL (`*.tf`) — `terraform fmt -check` / `terraform validate` (offline/no-network mode).
    * GitHub Actions / CI workflows & compliance policies — **OPA / Conftest** policy-as-code checks.
* **Hardening Note:** Post-edit validators must execute strictly offline inside the isolated `/workspace` sandbox with bounded CPU/time budgets and zero network egress or secret access, preventing maliciously crafted YAML/HCL templates from triggering external provider downloads or remote code execution during validation.

### Canonical `CapabilityDescriptor` Schema Ingestion & MCP Schema Hygiene
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 23: Strict Tool Schema Sanitization & Provider Normalization) -->

* **Registration-Time Schema Validation & Local `$ref` Resolution:** All internal `CapabilityDescriptor` definitions and externally discovered MCP tools are validated at registration time, resolving local `#/$defs/...` references purely in-memory (**strictly forbidding remote HTTP/file `$ref` fetching** to eliminate SSRF) and caching normalized per-provider schema variants keyed by `(capabilityId, schemaHash, providerFamily)`.

### Pack-Scoped Virtual Tool Cluster Registration
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 24: Bundled "Agent Plugins" as Versioned Capability Packages) -->

* **Namespaced Capability IDs & Cluster Affinity:** Capabilities contributed by an `AgentCapabilityPack` are automatically prefixed (`<packId>:<capabilityName>`) to prevent cross-pack collisions and carry explicit cluster-affinity hints so the embedding-guided virtual tool router groups domain capabilities cleanly.

### `CapabilityGateway` Post-Execution Output Redaction Gate
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 27: Multi-Pass Secret & Credential Redaction Pipeline) -->

* **Mandatory Egress Normalization:** Every `HttpIntent` and `NativeAdapter` result passes through `CapabilityGateway`'s output redactor before returning to Temporal workflow history or the LLM loop—ensuring Kubernetes Secrets metadata, CI environment dumps, and upstream error headers are scrubbed at the tool boundary.

### Canonical Resource-Key Metadata on Read Capabilities
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 28: Per-Turn Tool Result Deduplication & Reference Handles) -->

* **Deduplication Eligibility Hints:** Read-only `CapabilityDescriptor` definitions (`mutating: false`, `idempotentRead: true`) declare canonical resource-key parameters (e.g., `entityRef`, `namespace/deployment`, `repo/prNumber`) so `CapabilityGateway` emits deterministic deduplication keys alongside every tool execution result.

### Three-Tier Capability Side-Effect Risk Classification (`READ` | `REVERSIBLE_STAGE` | `DESTRUCTIVE_MUTATION`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 29: Interactive vs. Autonomous Terminal & Tool Risk Classification) -->

Rather than treating tool authorization as a binary all-allow or all-prompt toggle, every registered `CapabilityDescriptor` declares an explicit **side-effect risk classification** (modeled on VS Code Copilot Chat's command risk classification):

| Risk Tier                  | Side-Effect Profile                                          | Default Execution Policy                                     | Examples in Backstage IDP                                    |
| :------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| **`READ`**                 | Pure read-only inspection (`GET`, catalog/metric queries)    | **Autonomous** (runs immediately subject to `PermissionsService` read RBAC) | `catalog:get-entity`, `k8s:get-pod-logs`, `finops:query-spend` |
| **`REVERSIBLE_STAGE`**     | Ephemeral workspace edits, dry-runs, or non-destructive proposals (PRs, draft issues) | **Autonomous with Checkpoint** (captures pre-mutation baseline in `CheckpointStore` and runs inline schema/OPA validators) | `scm:open-pull-request`, `terraform:plan`, `catalog:stage-patch` |
| **`DESTRUCTIVE_MUTATION`** | Live infrastructure/production state mutation, secret/RBAC changes, or irreversible external writes | **Mandatory Approval Gate** (suspends execution until an authorized owner signs off) | `k8s:scale-deployment`, `terraform:apply`, `argocd:sync-prod`, `pagerduty:page-oncall` |

* **Environment-Aware Risk Elevation:** Capabilities targeting production entities (`spec.lifecycle: production` or `prod` environment tags) automatically elevate from `REVERSIBLE_STAGE` to `DESTRUCTIVE_MUTATION` when policy requires strict production change control.

### Dual-Channel Capability Output (`llmContent` vs. `uiDetails`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 32: Typed Streaming Response Parts (ChatResponsePart Protocol)) -->

* **Structured Card Payloads:** `CapabilityGateway` results separate bounded text/JSON for the model (`llmContent <= 4,000 tokens`) from strongly typed UI presentation payloads (`uiDetails`, e.g., Kubernetes pod health tables, Catalog entity metadata, staged diffs) routed directly into `AgentStreamPart` SSE frames.

### Multi-Repository Sandbox Isolation & Entity-Qualified Tool Inputs
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 33: Multi-Root Workspace & Cross-Repo Context Disambiguation) -->

* **Entity-Partitioned Workspace Roots (`/workspace//<namespace>/<name>/`):** When a single run checks out multiple repositories inside an ephemeral workflow sandbox, each repository is mounted under an entity-qualified subdirectory (`assertSandboxPath` enforced) and file/git capabilities require an explicit `entityRef` parameter—eliminating ambiguous relative path mutations across services.

### `CapabilityGateway` Record-and-Replay Interceptor Hook
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 34: Deterministic Trajectory Replay & Simulation Harnesses (*.stest.ts)) -->

* **Non-Invasive Egress Interception:** `CapabilityGateway` exposes a pluggable `CapabilityTransportInterceptor` used exclusively in test/eval environments to serve deterministic JSON fixture responses keyed by `(capabilityId, normalizedArgsHash)`—allowing full `PermissionsService` RBAC, Zod schema validation, and output redaction pipelines to execute identically in CI without live network egress.

### Mandatory `AbortSignal` Contract Across `CapabilityGateway` Executors
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 35: Cooperative Cancellation Tokens (CancellationToken) Propagated Down to Tools) -->

* **Cooperative Subprocess & Transport Teardown:** Every `HttpIntent` and `NativeAdapter` execution context receives a non-optional `signal: AbortSignal`:
  * **HTTP & MCP Transports:** Passes `signal` to `fetch()` and MCP HTTP/SSE/stdio client calls so in-flight upstream requests abort cleanly on cancellation.
  * **Sandboxed Child Processes (Terraform, CLI, Validators):** Attaches `signal.addEventListener('abort', ...)` to send `SIGTERM` to the child process group, escalating to `SIGKILL` after a bounded grace period (e.g., `5s`), followed by deterministic `/workspace` sandbox cleanup.

### Tool-Call Self-Healing & Zod Schema-Diff Feedback Middleware
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 37: Tool-Call Self-Healing & Malformed JSON Repair Middleware) -->

Modeled on VS Code Copilot Chat's tool-execution validation and self-healing layer, `CapabilityGateway` wraps every Backstage action and MCP tool invocation in a **deterministic coercion and structured schema-diff error-feedback middleware** before dispatching to `HttpIntent` or `NativeAdapter`:

* **Safe Coercion & Domain Normalization (Read & Reversible Capabilities):**
  * Performs deterministic, lossless coercion on safe primitive types (e.g., numeric strings `"3"` -> `3` for `z.number()`, boolean strings `"true"` -> `true`, single-element normalization where configured) and normalizes Backstage entity references (`Component:default/Foo` -> `component:default/foo`).
  * **Hardening Rule:** Silent coercion is **strictly disabled** for `DESTRUCTIVE_MUTATION` capabilities and cryptographic/approval identifiers (resource IDs, target environments, replica counts on production mutations)—requiring exact schema adherence or explicit LLM correction.
* **Actionable Schema-Diff Tool Error Payloads:**
  * When `zodSchema.safeParse(rawArgs)` fails, `CapabilityGateway` **does not throw an unhandled exception** that aborts the activity or triggers a Temporal retry. Instead, it returns a structured `isError: true` tool result containing:
    * Exact failing field paths (`issues[].path`), received type/value summary, and expected type/constraints (`expectedType`, `enumValues`, `formatHint`, `example`).
    * Redacted input echo (passing raw arguments through the PII/Secret scrubber first so malformed secret pastes are never reflected raw into tool history).
* **Consecutive Validation Failure Circuit Breaker:**
  * Tracks consecutive schema-validation failures per `(turn, capabilityId)` (capped at `3` attempts); if the model repeatedly fails to satisfy the schema, `CapabilityGateway` escalates to a non-retryable `TOOL_SCHEMA_UNRECOVERABLE` error so the loop cannot spin indefinitely.

### Mandatory Provenance `trustTier` Metadata on `CapabilityDescriptor`
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 38: Explicit Trust Boundaries & Untagged External Data Wrapping) -->

* **Capability-Level Trust Stamping:** Every `CapabilityDescriptor` declares a static `trustTier` (`'verified_catalog' | 'untrusted_external'`, defaulting to `'untrusted_external'` for all external HTTP intents, MCP servers, log readers, and ticket/chat integrations). `CapabilityGateway` attaches this verified provenance tag to every tool output envelope before handing it to the prompt renderer.

### Capability-Aware Follow-Up Eligibility Filtering
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 40: Speculative Next-Step Suggestions (ChatFollowupProvider)) -->

* **Permission-Checked Action Hints:** When `ChatFollowupProvider` proposes a next step tied to a registered `CapabilityDescriptor`, `CapabilityGateway` verifies that the capability passes the caller's layered policy cascade (`Global -> Tenant -> PermissionsService -> Workflow`) before including the chip in the outbound `AgentStreamPart`.

### Session-Start `CapabilityNegotiation` Handshake
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 42: Graceful Feature Degradation & Capability Negotiation) -->

* **Dynamic Active-Descriptor Resolution:** At session initialization, `CapabilityGateway.negotiateSessionCapabilities({ tenantId, principalRef, workflowRequirements, modelCapabilities })` evaluates plugin liveness, tenant allowlists, `PermissionsService` grants, and model tool-calling limits (e.g., max tools per request) to emit an immutable `NegotiatedCapabilitySet` pinned for the session.

### Capability Concurrency Partitioning & In-Batch Request Coalescing
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 44: Read-Only vs. Mutating Tool Partitioning for Parallel Execution) -->

* **Safe Parallelism Metadata:** `CapabilityDescriptor` classifies `READ` capabilities as concurrency-safe (`parallelSafe: true` by default, overridable to `false` for rate-sensitive legacy APIs), while `REVERSIBLE_STAGE` and `DESTRUCTIVE_MUTATION` descriptors default to `parallelSafe: false` and execute exclusively in serialized order.

### Non-Overridable Top-of-Cascade Kill-Switch Evaluation
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 46: Enterprise Policy & Admin Governance Hooks (Org-Level Kill Switches)) -->

* **Pre-Execution Policy Check (`CapabilityGateway`):** Even if a capability was allowed during session-start negotiation, `CapabilityGateway` re-evaluates active org/tenant kill-switch flags (via low-latency `coreServices.cache` with fail-closed fallback) immediately prior to executing every `HttpIntent` or `NativeAdapter`. Blocked calls return a non-retryable `POLICY_DISABLED_BY_ADMIN` error and emit an audit event.

### Token-Aware Chunked Reading & Line-Indexed Windows (`read_file` / `read_artifact_window`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 47: Token-Aware Chunked File Reading & Line-Indexed Windows) -->

To prevent large artifacts—such as 5,000-line Kubernetes pod logs, Terraform state diffs, OpenAPI specifications, or multi-page TechDocs files—from exhausting context budgets while avoiding tiny 20-line reads that waste LLM turns, `CapabilityGateway` standardizes **token-aware line-indexed windowed pagination** (modeled on VS Code Copilot Chat's `read_file` tool):

* **Canonical Windowed Reader Parameters & Output Format:**
  * **Input Parameters:** `{ targetRef | artifactId | path, startLine?: number, endLine?: number, maxTokens?: number }` (with a default adaptive window of ~`250` lines capped at `<= 4,000` tokens).
  * **Metadata Header:** Every response begins with an explicit range summary (`Showing lines 100–350 of 1,420 (24.6% of document) — artifactId: art_98f2a`), giving the model exact total document bounds so it can jump directly to relevant sections.
  * **Line-Numbered Content Formatting:** Lines are prefixed deterministically (`142 | const router = ...`), enabling unambiguous line-range references for downstream fuzzy patch edits (`get_errors` pipeline) and root-cause citations.
* **Hardening Note:** Windowed reads must run the multi-pass PII/PHI/Secret scrubber across the sliced window (and across line boundaries where multi-line PEM blocks or secret maps span slice edges) and enforce `fs.realpath` containment for sandbox files and `(tenantId, runId)` RBAC ownership checks for `ArtifactSink` handles.