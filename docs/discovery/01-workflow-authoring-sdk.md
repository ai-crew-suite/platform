# Discovery: 01 - Workflow Authoring & Graph Definition SDK

This staging file collects all raw research and design notes related to the developer-facing fluent API (`FluentGraphBuilder`), type-safe TypeScript generic flow, node and edge definitions, Zod input/output schemas, and static graph validation. All notes captured here govern how developers author workflows and compile them into a portable Intermediate Representation (IR) with zero runtime dependencies on Temporal, Vercel AI SDK, or Backstage.

### Agent-Level Provider Restriction Policy (`AgentDefinition`)
<!-- Source: incoming/_AGENT_Q_AND_A.md (Section 6) -->

* **Declarative Provider Scoping:** `AgentDefinition` must support an optional `providers?: Record<string, readonly string[]>` map (e.g., `{ communication: ['slack'] }`) to restrict which registered backend drivers an agent is permitted to reach per capability category.
* **Default Open Within Category:** When `providers` (or a specific category key) is omitted on `AgentDefinition`, any registered provider for that category is eligible, subject to operator configuration overrides.

### First-Class Deterministic Code Nodes
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Over-Engineering & Framework Traps) -->

* **Deterministic Logic Outside the LLM:** The fluent workflow API must treat pure deterministic TypeScript/code nodes (e.g., data filtering, regex/date parsing, conditional branching, API polling) as first-class graph primitives alongside LLM reasoning nodes. Workflows must reserve LLM nodes strictly for ambiguous reasoning tasks rather than using prompts for deterministic control flow.

### Sub-Agent Delegation Semantics in Graph Authoring
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Control Loop & Error Handling Mistakes) -->

* **Context Isolation as the Driver for Sub-Agents:** The fluent workflow API must support composing single-agent loops cleanly without forcing artificial "Manager/Worker" boilerplate. Sub-agent or child-workflow nodes should be modeled explicitly as context-isolation boundaries where a sub-task needs a fresh token window and returns only a distilled result to the parent graph.

### Quarantine Sub-Agents for Untrusted Data Ingestion
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Prompt & Context Contamination) -->

* **Isolated Read-Only Sub-Graph Pattern:** The fluent workflow API must make it straightforward to route untrusted external content (e.g., public web scrapes, external issue comments, inbound emails) through a disposable, context-isolated sub-agent node configured with zero write tools (`effect: 'read'` only). Only the structured, schema-validated extraction passes back to the main workflow, preventing indirect prompt injection from hijacking privileged tools in the parent session.

### Explicit Loop Exit Predicates in Workflow Definitions
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Cognitive & Planning Traps) -->

* **Declarative Stopping Conditions:** The fluent graph API must allow workflow authors to define explicit termination predicates (`until` / `stopWhen` conditions and `maxToolCalls` budgets) on iterative agent nodes so workflows have deterministic exit boundaries.

### Workflow-First Architecture with Bounded Autonomy
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Core Best Practices for Agent Design) -->

* **Deterministic Backbone Over Unbounded Prompts:** The fluent graph API must encourage composing deterministic control-flow steps around small, tightly scoped LLM decision nodes rather than handing a single monolithic prompt unrestricted autonomy over an entire multi-step goal.

### Goal Reconciliation Contracts & Predicate Vectors
<!-- Source: incoming/AGENT_RECONCILIATION_CONTROLLER_KAZI.md -->

* **Bounded Goal Reconciliation Capability:** Support a first-class "goal reconciliation" workflow pattern (`plan -> approve -> apply -> observe -> decide -> repeat`) where an outer controller evaluates declared acceptance predicates and dispatches bounded inner repair steps until convergence or a stop limit.
* **Immutable Goal Revision Contract (`GoalRevision`):** A goal definition must be versioned and frozen upon approval with a cryptographic contract digest, specifying:
  * `goalId`, `revision`, `tenantId`, `entityRef`, and pinned `baseCommit`.
  * `predicates: Predicate[]` (non-empty, unique IDs, each declaring `id`, `description`, `provider`, validated `config`, `role: 'acceptance' | 'guard'`, and `visibility: 'worker' | 'held-out'`).
  * `allowedPaths` scope boundaries and explicit `budget` limits (`maxIterations`, `maxDispatches`, `maxElapsedMs`, `maxCostMicros`).
* **Strict Convergence Semantics:** Predicate verdicts must distinguish four explicit states: `'pass' | 'fail' | 'error' | 'unknown'`. Convergence requires a **non-empty predicate vector where every predicate passes**; empty vectors, `'error'`, and `'unknown'` must never be treated as success.
* **Decouple Verification from Publication:** Producing a verified candidate patch/artifact must be modeled separately from publishing it (PR creation, merge, or deployment), which requires a separately authorized workflow or human gate.

### Opt-In Goal Reconciliation Mode Over Fluent Workflows
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (Executive Assessment) -->

* **Single Unified Authoring Model:** Goal reconciliation must be modeled as an **opt-in execution mode** wrapping standard fluent workflow definitions—never as a separate workflow engine or a mandatory loop forced onto simple one-shot workflows.
* **Bounded Semantics of Verified Outcomes:** Passing a goal reconciliation contract certifies only that the declared predicates passed against the observed candidate and environment; it must never be represented as an automatic publication or blanket correctness guarantee.

### Runtime-Validated Goal Contract & Canonical Revision Digests (P0)


* **Runtime Schema Validation (Never Trust TypeScript Types Alone):** Every goal reconciliation contract must pass strict runtime validation (e.g., Zod) declaring: desired outcome, target Backstage `entityRef`/repository and edit scope, acceptance predicates and regression guards, verifier/provider configurations, and explicit execution budgets/limits.
* **Canonical Contract Digest & Immutability:** Compute a deterministic canonical digest over each goal revision. Any material change to predicates, guards, or scope must generate a new revision and digest rather than mutating an approved contract in place.
* **Reject Empty Predicate Sets:** Reconciliation contracts with missing or empty predicate arrays must fail validation immediately.
* **Explicit Non-Authorization Boundary:** Never treat raw user prompts, fluent workflow definitions, TypeScript types, Mem0 memories, or LLM-generated checklists as an authorized goal contract; AI-generated criteria exist strictly as unapproved drafts until ratified by human or policy approval.

### Explicit Environment Profile & Multi-Repo Scope Declaration (P9)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P9 - Reproducible execution environment profiles) -->

* **Declarative Environment Profile Selection:** Allow workflow and goal definitions to specify an explicit `ExecutionEnvironmentProfile` reference (or select from approved repository-level profiles).
* **Explicit Multi-Repository Scope:** Multi-repository workflows must explicitly enumerate every target repository in their declared scope; implicit cross-repo traversal outside declared boundaries must be rejected at validation and runtime.

### Explicit Child-Agent Delegation Primitives (P10)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P10 - Bounded child-agent delegation) -->

* **Opt-In Specialist Delegation Over Default Multi-Agent Hierarchies:** Keep single-loop workflows as the default authoring model; expose explicit fluent primitives for parallel investigation or specialist handoffs only when a workflow author intentionally declares a context-isolated child run.
* **Required Child Subgoal & Policy Contract:** Every delegated child definition must declare an explicit `subgoal`, bounded sub-budget/depth, narrow tool/provider scope, and structured return schema, requiring the parent workflow to record how child outputs informed its final decision.

### Immutable Revision Identity on Agent & Workflow Definitions (P12)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P12 - Continuous evaluation and safe agent releases) -->

* **Versioned Agent & Graph Revisions:** Every `AgentDefinition` and compiled workflow graph must carry an explicit, immutable revision identifier (or content-addressed digest covering instructions, model config, tools, and graph topology) so evaluation runs, live telemetry, and rollbacks bind unambiguously to the exact authored version.

### Typed Schedule Policy Schema & Safe Defaults (P17)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P17 - Schedule overlap and missed-run semantics) -->

* **Strict Schedule Policy Contract:** Define a runtime-validated schema for recurring automation policies requiring explicit `overlapPolicy`, `timezone`, and bounded catch-up behavior—defaulting to non-overlapping (`skip`) execution so authors cannot accidentally create self-stacking background loops.

### Category-Level Multi-Destination Fan-Out in Workflows
<!-- Source: incoming/TOOLS.md -->

* **Vendor-Agnostic Category Broadcasts:** Allow workflow definitions to target an entire capability category (e.g., `communication` or `incidents`) to concurrently fan out an action across all authorized providers configured for that agent, keeping vendor driver details completely out of workflow authoring code.

### Fluent API Capability Prerequisites & Progressive Enhancement
<!-- Source: incoming/TOOLS_INTERFACE.md -->

* **Declarative Dependency Manifest on Workflow/Agent Definitions:** Provide fluent builder methods allowing agent authors to declare mandatory vs. optional capability categories, required extended-contract features, and vendor-specific requirements so missing dependencies surface deterministically during preflight rather than failing mid-run.

### Fluent API Vector Store & RAG Primitives

<!-- Source: incoming/VECTOR_DATABASES_THRU_MEM0.md (Sections: Vectorstores, How the ORM-like Interface Works) -->

To support direct vector interaction in workflow definitions without coupling authoring code to specific database vendors or credentials, the Fluent API exposes declarative vector primitives that compile into Graph IR capability steps.

#### Authoring Rules
- **Declarative Slot Reference Only:** Workflow authors invoke fluent methods (e.g., `.vectorSearch(...)`, `.vectorUpsert(...)`) targeting a logical `storeRef` / `collectionId` and embedding profile—never importing `@vectorstores/qdrant` or `@vectorstores/pgvector` inside workflow definitions.
- **No Inline Credentials or Clients:** Passing `process.env.*` keys or instantiated driver clients into workflow builder steps is prohibited; credential resolution and connection pooling occur exclusively inside the Temporal Activity / capability runtime.
- **Capability Requirement Emission:** Any workflow using fluent vector steps automatically emits a `vectorStore` capability requirement in its compiled manifest so the Backstage control plane validates collection access and RBAC prior to execution.

```typescript
// Declarative Fluent API usage (compiles to Graph IR activity step)
const workflow = defineWorkflow('catalog-impact-analysis')
  .vectorSearch('incidentContext', {
    storeRef: 'enterprise-runbooks',
    query: (ctx) => ctx.input.incidentSummary,
    topK: 5,
    filter: (ctx) => ({ tenantId: ctx.auth.tenantId }),
  })
  .agentStep('synthesizeRemediation', { /* ... */ });
```

### Declarative Schedules, Event Triggers & Deterministic Pre-Filters
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 7: Proactive Triggers and Scheduling) -->

Workflows can declare proactive cron/interval schedules and event-driven triggers alongside a mandatory deterministic pre-filter so LLM turns are never wasted on no-op checks:

- **Schedule & Event Trigger Definitions:**
  - `.schedule(cronOrInterval, { timezone, jitter, activeHours, preFilter })` compiles to a Temporal Schedule definition.
  - `.onEvent(topic, { debounceWindowMs, cooldownKey, preFilter })` compiles to a `@backstage/plugin-events-node` subscription rule.
- **Mandatory Deterministic `preFilter` Predicate:** Every proactive trigger must define a pure TypeScript/Catalog-query pre-filter function that runs *before* starting a Temporal workflow or waking an LLM. If `preFilter` returns `{ actionable: false }`, the tick is suppressed silently with zero LLM token spend.
- **Explicit Automation Principal Binding:** Proactive workflow manifests must declare a registered automation service principal and scoped capability requirements validated by Backstage RBAC at registration time.

### GitOps-Managed Modular Skill Bundles & Eligibility Manifests
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 9: On-Demand Skill Loading) -->

To prevent prompt bloat across 50+ Backstage integrations while enabling platform teams to author new Standard Operating Procedures (SOPs) without plugin redeploys, workflows support modular **Skill Bundles**:

- **Skill Bundle Structure:** Each skill pairs structured YAML frontmatter (`skillId`, `name`, `summary`, `applicableEntityKinds`, `requiredAnnotations`, `requiredCapabilities`, `requiredPermissions`, `executionMode: 'inline' | 'subagent'`) with a concise Markdown SOP body.
- **GitOps & Catalog Indexing:** Platform teams version-control skill bundles in Git and index them into the Backstage Software Catalog (via a custom Catalog Entity Provider / Processor) alongside programmatic plugin-registered skills.
- **Load-Time Eligibility Predicates:** Skills declare explicit capability and environment prerequisites (`requiredCapabilities`, `applicableEntityKinds`). Skills whose underlying `CapabilityGateway` connectors are disabled or unconfigured in the target environment are excluded automatically at discovery time.

### Immutable Control Plane, Branch-and-PR Skill Authoring & Revision Pinning
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 26: Self-Inflicted Regressions) -->

To let agents help engineers author reusable runbooks and schedules without risking self-inflicted production outages or shared prompt-injection backdoors:

1. **Control-Plane Immutability Boundary:**
   - Agents cannot modify Backstage backend TypeScript code, Temporal Worker definitions, or core system prompts. Self-authoring is restricted strictly to declarative GitOps artifacts: Markdown skills (`skills/<skill-id>/SKILL.md`), declarative YAML/JSON schedule definitions, and sandbox-isolated helper scripts.
2. **Branch-and-PR Only for Shared Artifacts (No Direct `main` Commits):**
   - When asked to publish or update a shared skill or schedule, the authoring capability creates an isolated branch (`agent-skill/<userSlug>/<slug>-<timestamp>`), commits the validated files, and opens a Pull Request for peer review and CI gating—never committing directly to `main`.
   - **Taint Guard:** Workflows marked `tainted = true` cannot auto-author or modify skills or schedules without explicit `WRITE_HIGH` human approval.
3. **Versioned Personal Drafts & Commit-SHA Pinning:**
   - User-scoped personal draft skills/schedules (`tenantId` + `userEntityRef`) store immutable versioned snapshots (`v1`, `v2`, `v3`) before every edit.
   - Catalog-indexed skills carry `backstage.io/source-location` commit SHAs so critical production Temporal Schedules can pin to a verified commit SHA while interactive sessions test `HEAD`.

### Immutable Digest & Commit-SHA Pinning for External Skills and MCP Servers
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 27: Supply-Chain Risk in Third-Party Skills) -->

- **Mandatory Immutable References:** Workflow and skill manifests referencing external skills or MCP servers must specify an immutable Git commit SHA (`commitSha`) or OCI image digest (`imageDigest`) alongside declared `allowedTools`, `allowedDomains`, and `maxRiskTier` bounds. Mutable version tags (`latest`, `^1.0.0`) fail manifest compilation at build time.

### Model-Agnostic Skill Authoring & `testedModels` Frontmatter
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 47: Prompt and Skill Decay Across Model Generations) -->

- **Zero Vendor Prompt Hacks in `SKILL.md`:** Skill definitions must describe domain procedures, preconditions, and capability contracts in clean, model-agnostic Markdown—prohibiting hardcoded `<thinking>` tags or vendor-specific JSON formatting workarounds.
- **`testedModels` Compatibility Metadata:** Skill YAML frontmatter supports an optional `testedModels: string[]` list validated by CI static audits whenever a platform model tier is upgraded, flagging unverified legacy skills for regression testing.

### Declarative Agent Persona, Operating Manual & Prompt Mode Configuration
<!-- Source: incoming/OPENCLAW_PROMPT_BUILDER.md (Sections: Prompt Modes, Workspace File Injection) -->

- **Versioned Persona & Operating Manual Specs (Replacing Local Disk `AGENTS.md` / `SOUL.md`):** Instead of reading unversioned local workspace files from pod disks, agent definitions specify GitOps-managed operating rules (execution bias, domain invariants, tool discipline) and persona/tone profiles in their Backstage Catalog / workflow manifest, snapshotted by commit SHA at run start.
- **Per-Step & Sub-Agent `promptMode` Override:** Workflow and sub-agent definitions declare their target prompt verbosity mode (`'full' | 'minimal' | 'none'`) so lightweight classifiers and background sub-agents automatically shed conversational overhead.

### Stale `ONBOARDING.md` API Reconciliation & Canonical Authoring Invariants
<!-- Source: incoming/ONBOARDING.md (Audited & Reconciled Against Canonical Platform Contracts) -->

`ONBOARDING.md` reflects an early prototype sketch (`@backstage/plugin-agent-core-backend`, `createAgentWorkflowProxy`, direct `ctx.capabilities.backstage.*` proxies) and is **superseded** by our canonical SDK and Temporal contracts:

1. **Superseded Stale APIs (Do Not Use):**
   - **Package Names:** Replace `@backstage/plugin-agent-core-backend` with `@ai-crew-suite/plugin-platform-node` and `@ai-crew-suite/plugin-kernel-backend`.
   - **Direct Capability Proxies & Unvalidated URLs:** Replace `ctx.capabilities.backstage.kubernetes.*`, `ctx.capabilities.backstage.scaffolder.*`, and raw string-interpolated `ctx.urlReader.readUrl(...)` calls with schema-validated `CapabilityGatewayClient.invoke({ capabilityId, ... })` calls.
   - **`z.any()` & `onUnauthorized: 'skip'`:** Ban `z.any()` in workflow state schemas and ban `onUnauthorized: 'skip'` on mutating steps (RBAC denials must fail closed with `NotAllowedError`, never silently skipping writes).
   - **Token-Chunk Debug Logging & Public Proxy Keys:** Never log raw `onChunk` LLM tokens via `ctx.logger.debug(...)`, and restrict `OPENROUTER_API_KEY` strictly to local dev sandboxes (production inference requires ZDR/residency-compliant enterprise endpoints).
2. **Preserved Core Authoring Invariants:**
   - **Strict Temporal Replay Determinism:** Prohibit `new Date()`, `Math.random()`, and direct network/filesystem I/O inside workflow definitions; execute all side effects inside Temporal Activities.
   - **Zero Secret Material in State:** Store only opaque references (`standingRef`, `secretRef`, `artifactRef`) in workflow state—never raw secret values.
   - **Mandatory CI Replay & Secret-Leak Test Gate:** Every workflow definition must ship with an automated `@temporalio/testing` (`TestWorkflowEnvironment`) suite verifying deterministic replay, RBAC fail-closed behavior, and zero secret substrings in event history.

### Provider-Agnostic Capability Requirements via MCP
<!-- Source: incoming/MCP.md (Sections: Using MCPs vs. API Calls for External Services) -->

Workflow definitions declare abstract capability requirements (e.g., `scm.pull_request.create`) in the workflow Graph IR rather than hardcoding vendor-specific drivers or environment variables (`process.env`):

* **Decoupled Binding:** At workflow compile/reconciliation time, the platform binds declared capability slots to either a `NativeAdapter`, an `HttpIntent`, or a registered **MCP Server capability** without altering the authored workflow graph.
* **Deterministic Contract:** Regardless of whether a capability resolves to a native driver or an MCP server, the workflow SDK validates inputs and outputs against the `CapabilityDescriptor` schema contract at author/compile time.

### Three-Tier Monorepo Package Split for Worker Portability
<!-- Source: incoming/GRAPH_ORCHESTRATOR_INTEGRATION.md (Sections: Shared Memory in Backstage Backend Modules vs. Temporal Workers) -->

To let identical authored workflows run in both embedded Backstage mode and standalone Temporal worker containers without bundling Backstage HTTP server dependencies into worker images, split workflow code across three workspace tiers:

1. **`plugin-agent-orchestrator-common` (SDK & Contracts):** Pure TypeScript package containing Zod schemas, Graph IR types, `StepExecutionContext` interfaces, and the fluent `WorkflowBuilder` class.
2. **`agent-drivers` (Standalone Capability Adapters):** Framework-agnostic Node.js clients and `CapabilityGateway` adapters (e.g., PagerDuty, Datadog, GitHub) that accept short-lived per-request credentials from the Token Broker without depending on Backstage `coreServices`.
3. **Domain Workflow Packages (`workflows-*` / `*-backend-module`):** Pure workflow graph definitions (`addStep`, `addChoice`, `addOutcome`) importing only `-common` and `agent-drivers`, wrapped by a thin Backstage backend module entrypoint for `agentWorkflowExtensionPointRef` registration.

### Fluent `WorkflowBuilder` DSL: Design Philosophy & Core Contracts
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: Introduction: The Fluent Workflow Builder, Core Design Philosophy, WorkflowBuilder Class) -->

The **Fluent Graph Builder** (`WorkflowBuilder<TState, TInput, THelpers>`) provides a type-safe, declarative TypeScript DSL for authoring multi-agent workflows inside Backstage without manually wiring low-level DAG edges, Temporal replay boilerplate, or event-log plumbing.

#### 1. Four Immutable Authoring Pillars
* **Immutable State Reduction (State Monad / Redux Semantics):** Workflow state is passed to handlers strictly as `Readonly<TState>`. Steps never mutate state in place; they return a typed state delta (`Partial<TState>`), which the runtime merges deterministically to produce a tamper-evident state-transition timeline.
* **End-to-End Zod Type Propagation:** Workflows declare `inputSchema` and `stateSchema` upfront via **Zod**. Type inference flows down the entire fluent chain (`addStep`, `addChoice`, loops, parallel branches), catching schema mismatches and field typos at compile time.
* **Enterprise-Governed `AgentContext` (`ctx`):** Step handlers receive a curried `AgentContext` facade that transparently enforces Temporal activity timeouts/retries, OpenTelemetry trace propagation, Backstage RBAC, `CapabilityGateway` routing, and pre-egress PII/PHI redaction.
* **Compile-Time & Boot-Time Topological Validation:** Because the graph topology is declared upfront, `.compile()` executes a **Topological Depth-First Search (DFS) validator** that detects dangling target references, unreachable nodes, and unguarded infinite cycles before any workflow starts.

#### 2. Base Contracts (`AgentContext`, `StepOptions`, `WorkflowBuilder`)

```typescript
import { z } from 'zod';

export interface StructuredLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface AgentContext<TInput, THelpers> {
  readonly input: Readonly<TInput>;
  readonly helpers: THelpers;
  readonly logger: StructuredLogger;
}

export interface StepOptions<TState> {
  timeout?: string | number; // Temporal-compatible duration (e.g., '2m', '1 hour')
  retries?: number;
  idempotencyKey?: (state: Readonly<TState>) => string;
}

export interface WorkflowBuilder<TState, TInput, THelpers> {
  // Fluent graph construction methods (see method catalog below)
}
```

### `.addStep(name, handler, options?)` — Sequential State-Reducer Node
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addStep(name, handler, options?)) -->

`.addStep()` appends an ordered processing node to the workflow pipeline. Each step acts as a pure functional reducer over `Readonly<TState>`, returning a typed state delta (`Partial<TState> | void`) that the runtime merges and re-validates against `stateSchema`.

#### 1. Method Signature & `StepOptions<TState>` Contract

```typescript
addStep(
  name: string,
  handler: (
    state: Readonly<TState>,
    ctx: AgentContext<TInput, THelpers>
  ) => Promise<Partial<TState> | void> | Partial<TState> | void,
  options?: StepOptions<TState>
): this;
```

| Option                 | Type                                                         | Description                                                  |
| :--------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| `timeout`              | `string \| number`                                           | Step SLA boundary (e.g., `'5m'`, `'30s'`, or `'5-minutes'`). Compiles to Temporal activity `startToCloseTimeout` and raises an SLA timeout error if breached. |
| `retryPolicy`          | `WorkflowResilienceConfig`                                   | Step-level exponential backoff and `maximumAttempts` overrides for Temporal activity retries. |
| `idempotencyKey`       | `(state: Readonly<TState>) => string`                        | Deterministic idempotency key forwarded to external capability invocations to prevent duplicate side effects on retry. |
| `authorize`            | `{ permission: Permission; getAttributes?: (ctx) => Record<string, unknown> }` | Declarative **Backstage Permissions Framework** check evaluated before step execution. |
| `onUnauthorized`       | `'skip' \| 'abort' \| { strategy: 'escalate-to-approval'; assignedRole: string; prompt: string }` | Policy behavior when `authorize` denies access: bypass step, fail workflow, or suspend into a Human-in-the-Loop (HITL) admin approval gate. |
| `onRollback`           | `(state: Readonly<TState>, ctx) => Promise<void>`            | **Saga Pattern** compensation handler registered onto the workflow's reverse-order compensation stack upon step completion. |
| `onMaxRetriesExceeded` | `(error: Error, state: Readonly<TState>, ctx) => Promise<Partial<TState> \| JumpDirective>` | Escape hatch invoked after retries exhaust—supports fallback state deltas, admin override sign-off (`ctx.interaction.adminOverrideCatch`), or explicit `ctx.goTo(targetStep)` routing. |

#### 2. Authoring Invariants & UI Metadata Extraction
* **Deep-Freeze Immutability Proxy:** `state` is wrapped in a deeply frozen proxy at runtime; direct mutations (`state.count = 1`, `state.items.push(...)`) throw an immediate runtime error.
* **Post-Step Zod Validation:** Every returned `Partial<TState>` delta is merged into current state and validated against the workflow's `stateSchema`; undeclared keys or invalid types halt execution immediately.
* **Static UI DAG Decorators:** Because `authorize`, `timeout`, and `onUnauthorized` are declared statically on the node rather than buried inside imperative code, the Backstage frontend DAG visualizer renders RBAC lock badges, SLA timers, and conditional skip edges prior to execution.

### `.addStreamingStep(name, handler, options?)` — Real-Time Generative Streaming Node
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addStreamingStep(name, handler, options?)) -->

`.addStreamingStep()` is a specialized variant of `.addStep()` for long-form generative outputs (architectural summaries, PR descriptions, remediation patches) that streams token deltas in real time to the Backstage UI without bloating workflow state history.

#### 1. Method Signature & State Reduction Contract

```typescript
addStreamingStep(
  name: string,
  handler: (
    state: Readonly<TState>,
    ctx: AgentContext<TInput, THelpers>
  ) => Promise<Partial<TState> | void> | Partial<TState> | void,
  options?: StepOptions<TState>
): this;
```

* **Out-of-Band Token Deltas:** During execution, `ctx.ai.streamText` and `ctx.ai.streamObject` intercept token deltas and emit `agent:stream_chunk` envelopes directly to the UI transport layer, bypassing `stateSchema` storage during streaming.
* **Final State Delta Commit:** Once generation completes, the handler returns a compact `Partial<TState>` delta (e.g., completion status, summary reference, token metrics) that is merged and validated against `stateSchema`.
* **Full Safeguard Parity:** Supports the exact same `StepOptions<TState>` contract as `.addStep()` (`timeout`, `retryPolicy`, `authorize`, `onUnauthorized`, `onRollback`, `onMaxRetriesExceeded`).

### `.addChoice(name, router)` — Conditional Routing Gateway
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addChoice(name, router)) -->

`.addChoice()` embeds a declarative conditional routing gateway into the workflow pipeline, evaluating `Readonly<TState>` (and optional `ctx` configuration) to return the exact case-sensitive `name` of the next node—whether a downstream step, a backward loop step, a signal wait state, or a terminal outcome.

#### 1. Method Signature & Authoring Contract

```typescript
addChoice(
  name: string,
  router: (
    state: Readonly<TState>,
    ctx: AgentContext<TInput, THelpers>
  ) => string
): this;
```

* **Pure Non-Mutating Guardrail:** The `router` function receives a deeply frozen `Readonly<TState>` snapshot. It must never mutate state, return state deltas, or perform write side effects—its sole responsibility is returning a target node identifier string.
* **Compile-Time & Runtime Target Verification:** `.compile()` validates returned target identifiers against declared steps, loops, signal gates, and terminal outcomes (and flags unguarded backward cycles lacking a termination path). At runtime, if a dynamic branch resolves to an unregistered node name, the engine fails closed with a `TopologyRoutingError`.
* **IDE Type Inference:** Full Zod `stateSchema` type inference propagates into `router(state, ctx)` for compile-time property checking and autocomplete.

### `.repeatUntil(name, config)` — Iterative Cyclic Loop Block
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .repeatUntil(name, config)) -->

`.repeatUntil()` embeds a structured, post-test (`do ... while`) cyclic loop into the workflow pipeline for iterative refinement workflows (self-correcting code generation, polling loops, or multi-turn convergence) without manual backward-edge wiring.

#### 1. Method Signature & Authoring Contract

```typescript
repeatUntil(
  name: string,
  config: {
    condition: (state: Readonly<TState>) => boolean;
    pipeline: (subBuilder: WorkflowBuilder<TState, TInput, THelpers>) => void;
    maxIterations?: number; // Optional safety cap overriding platform default
  }
): this;
```

* **Post-Test Execution Semantics:** The sub-pipeline executes sequentially from its first step through its last step; at the end of each iteration, `condition(state)` is evaluated against the freshly reduced `Readonly<TState>`. Execution loops back to the start of `pipeline` until `condition` returns `true` (or `maxIterations` is reached).
* **Pure Synchronous Predicate Invariant:** `condition` receives a deeply frozen `Readonly<TState>` snapshot and must remain a pure, side-effect-free boolean expression so Temporal workflow replay remains strictly deterministic.
* **Nested Scope & Delta Reduction:** Steps declared on `subBuilder` inherit full Zod `TState`, `TInput`, and `THelpers` typing and reduce `Partial<TState>` deltas at the end of every individual step within the turn.
* **Compile-Time Topological Verification:** `.compile()` validates that `pipeline` contains at least one executable node, assigns scoped node identifiers (`${loopName}.${stepName}`), and verifies no dangling jump targets escape invalid scopes.

### `.addParallelForEach(name, config)` — Concurrent Fan-Out / Fan-In Node
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addParallelForEach(name, config)) -->

`.addParallelForEach()` orchestrates deterministic horizontal fan-out across a collection in `TState`, executing a sub-pipeline concurrently per element and atomically reducing branch outputs back into parent state upon fan-in.

#### 1. Typed Method Signature & Configuration Contract

```typescript
addParallelForEach<TItem, TBranchOutput = Record<string, unknown>>(
  name: string,
  config: {
    iterator: (state: Readonly<TState>) => readonly TItem[];
    pipeline: (
      subBuilder: ParallelBranchBuilder<TItem, TBranchOutput, TState, TInput, THelpers>
    ) => void;
    reduce: (
      results: readonly TBranchOutput[],
      state: Readonly<TState>
    ) => Partial<TState>;
    maxConcurrency?: number; // Bounded concurrency window (defaults to platform limit)
    onBranchError?: 'fail-fast' | 'collect-errors';
  }
): this;
```

* **Branch Handler Signature (`(item, state, ctx)`):** Unlike top-level steps, steps inside `pipeline` receive the isolated collection element `item: Readonly<TItem>` as their first argument, followed by a deeply frozen `state: Readonly<TState>` snapshot and `ctx: AgentContext<TInput, THelpers>`.
* **Global State Read-Only Isolation:** Parallel branches can read shared configuration from parent `state` (never raw credentials, which resolve via `CapabilityGateway` + Token Broker) but cannot mutate parent `TState` directly during concurrent execution—preventing race conditions.
* **Atomic Fan-In Reduction:** Once all branches settle, `reduce(results, state)` maps the ordered collection of branch outputs into a `Partial<TState>` delta that is merged and validated against `stateSchema`.

### `.addHypothesisFork(name, config)` — Multi-Hypothesis Simulation Branching
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addHypothesisFork(name, config)) -->

`.addHypothesisFork()` implements concurrent **Tree-of-Thoughts / simulation branching** inside a workflow, cloning `TState` into isolated named hypothesis pipelines and converging them through a deterministic, type-safe `merge` reducer.

#### 1. Typed Method Signature & Configuration Contract

```typescript
addHypothesisFork<TBranches extends Record<string, (subBuilder: WorkflowBuilder<TState, TInput, THelpers>) => void>>(
  name: string,
  config: {
    branches: TBranches;
    merge: (
      branchResults: Readonly<{ [K in keyof TBranches]: Readonly<TState> }>,
      currentState: Readonly<TState>
    ) => Partial<TState>;
    onBranchFailure?: 'fail-fast' | 'ignore-failed-branches';
  }
): this;
```

* **Deep-Cloned State Isolation:** Each branch starts from a deeply frozen, isolated snapshot of `currentState`. Step deltas inside `branches.strategyA` mutate only that branch's local state trajectory and are completely invisible to `branches.strategyB`, eliminating concurrent race conditions.
* **Strongly-Typed Convergence (`merge`):** Parameterizing `TBranches` preserves exact branch key autocomplete (`results.scaleUpReplicas`, `results.upgradeInstanceSize`) on `branchResults`. `merge` must be a pure, deterministic evaluation function returning a `Partial<TState>` delta that is merged and validated against `stateSchema`.
* **Compile-Time Validation:** `.compile()` verifies that `branches` defines at least two distinct non-empty sub-pipelines and validates all nested node names under scoped identifiers (`${forkName}.${branchKey}.${stepName}`).

### `.requireApproval(name, config)` — Durable Human-in-the-Loop (HITL) Gate
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .requireApproval(name, config)) -->

`.requireApproval()` inserts a durable Human-in-the-Loop (HITL) suspension gate into the workflow pipeline, pausing execution cleanly until an authorized human reviewer submits a Zod-validated approval or rejection payload via Backstage.

#### 1. Generic Method Signature & Configuration Contract

```typescript
requireApproval<TSchema extends z.ZodTypeAny>(
  name: string,
  config: {
    prompt: string | ((state: Readonly<TState>) => string);
    schema: TSchema;
    assignedRole?: string;
    timeout?: string | number;
    onApprove: (
      approvalData: z.infer<TSchema>,
      state: Readonly<TState>,
      ctx: AgentContext<TInput, THelpers>
    ) => Promise<Partial<TState> | void> | Partial<TState> | void;
    onReject?: (
      state: Readonly<TState>,
      ctx: AgentContext<TInput, THelpers>
    ) => Promise<Partial<TState> | string | void> | Partial<TState> | string | void;
  }
): this;
```

* **End-to-End `z.infer<TSchema>` Type Inference:** Parameterizing `TSchema extends z.ZodTypeAny` infers `approvalData` directly inside `onApprove`, preventing untyped `any` field access.
* **Branching & Compensation Compatibility:** `onApprove` returns a `Partial<TState>` delta merged and validated against `stateSchema`. `onReject` can return a target node name string (redirecting execution to a cleanup/escalation step) or omit a target to halt the workflow cleanly.
* **Adaptive RBAC Escalation Parity:** Shares the exact same underlying HITL suspension engine as `.addStep(..., { onUnauthorized: { strategy: 'escalate-to-approval', ... } })`.

### `.waitForSignal(name, config)` — Durable External Webhook & Event Gateway
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .waitForSignal(name, config)) -->

`.waitForSignal()` parks a workflow in a zero-compute durable wait state until a cryptographically verified external webhook or system callback matches correlation criteria within a bounded SLA timeout.

#### 1. Typed Method Signature & Configuration Contract

```typescript
waitForSignal<TSchema extends z.ZodTypeAny = z.ZodType<Record<string, unknown>>>(
  name: string,
  config: {
    timeout: string | number;
    signalSchema?: TSchema;
    matchCondition: (
      signalPayload: Readonly<z.infer<TSchema>>,
      state: Readonly<TState>
    ) => boolean;
    onSuccess: (
      signalPayload: Readonly<z.infer<TSchema>>,
      state: Readonly<TState>,
      ctx: AgentContext<TInput, THelpers>
    ) => Promise<Partial<TState> | void> | Partial<TState> | void;
    onTimeout: (
      state: Readonly<TState>,
      ctx: AgentContext<TInput, THelpers>
    ) => Promise<Partial<TState> | string | JumpDirective | void> | Partial<TState> | string | JumpDirective | void;
  }
): this;
```

* **Single-Use Callback Provisioning (`ctx.webhooks.createCallbackUrl`):** Preceding steps generate short-lived, single-use signed callback URLs bound to `(tenantId, instanceId, gateName)` and optional source/HMAC constraints (`allowedSource`, `expiresIn`).
* **Pure Correlation Gate (`matchCondition`):** Evaluates incoming schema-validated webhook payloads against deeply frozen `Readonly<TState>` (e.g., `signalPayload.deploymentId === state.activeDeploymentId`). Unmatched payloads are rejected without waking the workflow.
* **Bounded SLA & Recovery (`onSuccess` / `onTimeout`):** `onSuccess` reduces a `Partial<TState>` delta upon verified receipt; `onTimeout` fires deterministically if `timeout` elapses first, supporting compensation calls and dynamic `ctx.goTo(...)` recovery jumps.

### `.checkpoint(name)` — Declarative Business Milestone Anchor
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .checkpoint(name)) -->

`.checkpoint(name)` inserts a named macro-level business milestone into the workflow topology, separating granular step noise from high-level operational phases for operator observability, fault isolation, and audit inspection.

#### 1. Method Signature & Authoring Conventions

```typescript
checkpoint(name: string): this;
```

* **Past-Tense Business Naming:** Name checkpoints after completed domain phases (e.g., `'contextGatheringComplete'`, `'mitigationStrategyCompiled'`, `'securityChecksPassed'`) so operator dashboards display human-readable phase progress.
* **Compile-Time Uniqueness Validation:** `.compile()` verifies that checkpoint names are unique within the workflow scope and correctly positioned within valid topological paths.
* **Distinction from Durable Memory Promotion:** `.checkpoint()` records a workflow execution milestone snapshot—it does **not** bypass the `MemoryManager` Promotion Gate or write directly to long-term semantic memory (though milestone boundaries serve as natural stabilization points for asynchronous candidate distillation).

### `.extend(extensionPlugin)` — Composition-Based Middleware & Lifecycle Extensions
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .extend(extensionPlugin)) -->

`.extend()` provides a composition-based plugin mechanism (mirroring Express/Koa middleware) for layering reusable cross-cutting concerns—such as telemetry wrappers, failure alerting, caching, or compliance hooks—onto a `WorkflowBuilder` without class inheritance.

#### 1. Strongly-Typed Method Signature & Hook Contract

```typescript
export type StepHandler<TState, TInput, THelpers> = (
  state: Readonly<TState>,
  ctx: AgentContext<TInput, THelpers>
) => Promise<Partial<TState> | void> | Partial<TState> | void;

export interface WorkflowExtensionPlugin<TState, TInput, THelpers> {
  readonly name: string;
  readonly uiBadgeIcon?: string;
  onExtend?: (builder: WorkflowBuilder<TState, TInput, THelpers>) => void;
  onStepAdded?: (
    stepName: string,
    options?: StepOptions<TState>
  ) => void;
  onStepRun?: (
    stepName: string,
    next: StepHandler<TState, TInput, THelpers>,
    options?: StepOptions<TState>
  ) => StepHandler<TState, TInput, THelpers>;
}

extend(extensionPlugin: WorkflowExtensionPlugin<TState, TInput, THelpers>): this;
```

* **Build-Time Hooks (`onExtend` / `onStepAdded`):** Invoked during pipeline construction to inspect step metadata, enforce authoring policies, or append sidecar lifecycle steps before `.compile()` runs topological validation.
* **Runtime Middleware Wrapping (`onStepRun`):** Wraps each step handler in registration order (onion composition). Decorators receive the same deeply frozen `Readonly<TState>` and governed `AgentContext`, must preserve state immutability, and must re-throw unhandled exceptions after side effects so Temporal retry and Saga compensation semantics stay intact.

### `.useHelpers(helpers)` — Curried Domain Utility Facade
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .useHelpers(helpers)) -->

`.useHelpers()` registers domain-specific computational utilities (parsers, metric scorers, data normalizers) onto `ctx.helpers` using a **Curried Facade Pattern** that automatically binds and hides the leading `ctx` parameter at call sites.

#### 1. Strongly-Typed Curried Signature & Mapped Type

```typescript
export type BaseAgentContext<TInput> = Pick<
  AgentContext<TInput, Record<string, never>>,
  'input' | 'logger'
> & {
  readonly config: {
    getDynamicValue(key: string, defaultValue: string): string;
  };
};

export type CurriedHelpers<
  TInput,
  TMap extends Record<string, (ctx: BaseAgentContext<TInput>, ...args: never[]) => unknown>
> = {
  [K in keyof TMap]: TMap[K] extends (
    ctx: BaseAgentContext<TInput>,
    ...args: infer TArgs
  ) => infer TReturn
    ? (...args: TArgs) => TReturn
    : never;
};

useHelpers<
  TNewHelpers extends Record<
    string,
    (ctx: BaseAgentContext<TInput>, ...args: any[]) => unknown
  >
>(
  helpers: TNewHelpers
): WorkflowBuilder<TState, TInput, THelpers & CurriedHelpers<TInput, TNewHelpers>>;
```

* **Compile-Time Parameter Stripping:** Authors define helper functions with `(ctx, ...domainArgs)` so utilities can access `ctx.logger` and `ctx.config`, while `CurriedHelpers` strips `ctx` from the resulting `WorkflowBuilder` type so step handlers call `ctx.helpers.myUtility(...domainArgs)` with full parameter autocomplete.
* **Additive Chaining:** Intersecting `THelpers & CurriedHelpers<...>` allows multiple `.useHelpers()` calls across modular helper packs without overwriting previously registered utilities.
* **Computational Purity Guardrail:** Helpers receive a read-only `BaseAgentContext<TInput>` without access to mutating `capabilities` or state setters; side-effecting external actions belong strictly in `.addStep()` handlers.
* **Standalone Unit Testability:** Exporting helper dictionaries as plain TypeScript modules enables fast unit testing with a lightweight mock `BaseAgentContext` before compiling the full workflow graph.

### `.configureFinOps(config)` — Declarative Budget & Cost-Ceiling Guardrails
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureFinOps(config)) -->

`.configureFinOps()` attaches a workflow-wide financial ceiling and cost-accounting policy (`WorkflowFinOpsConfig`) to the compiled Graph IR, preventing runaway loops or unbounded model calls from exhausting cloud or LLM budgets.

#### 1. Typed Method Signature & `WorkflowFinOpsConfig` Contract

```typescript
export interface WorkflowFinOpsConfig {
  maxWorkflowBudget: {
    amount: number;
    currency: 'USD';
  };
  thresholdPercent?: number; // Soft warning threshold (e.g., 80) emitting budget alert events
  capabilityCostWeights?: Record<string, number>; // Flat unit cost weights for non-LLM capabilities
  onThresholdReached?: 'warn' | 'downgrade-model' | 'require-approval';
}

configureFinOps(config: WorkflowFinOpsConfig): this;
```

* **Runtime Cost Inspection (`ctx.finops.getCurrentSpend()`):** Exposes a read-only spend snapshot (`{ amount, currency, remaining, utilizationPercent }`) inside `AgentContext` so step handlers and routing choices can adapt dynamically (e.g., switching to a smaller, lower-cost model tier when spend exceeds 70–80%).
* **Pre-Step & Pre-Capability Budget Enforcement:** Before entering any step or invoking any `CapabilityGateway` action, the runtime checks accumulated spend against `maxWorkflowBudget`. Breaching the ceiling raises `BudgetExhaustionException` and triggers reverse-order `onRollback` Saga compensations.

### `.configureCompliance(config)` — Declarative Regulatory & Privacy Guardrails
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureCompliance(config)) -->

`.configureCompliance()` attaches declarative regulatory controls (`WorkflowComplianceConfig`)—covering reversible PII/PHI egress tokenization, strict logical tenant isolation, retention archival policies, and cryptographic compliance attestations—to the compiled Graph IR.

#### 1. Typed Method Signature & `WorkflowComplianceConfig` Contract

```typescript
export type RedactionRuleSet =
  | 'HIPAA_PHI'
  | 'FINRA_MNPI'
  | 'GDPR_PII'
  | 'US_SSN'
  | 'CREDIT_CARD'
  | 'SECRETS';

export interface WorkflowComplianceConfig {
  tenantIsolation: 'strict-logical';
  dataRedaction: {
    enabled: boolean;
    rules: readonly RedactionRuleSet[];
    reversible?: boolean; // Defaults to true for in-activity re-hydration
  };
  retention: {
    duration: '30-days' | '1-year' | '7-years';
    classification: string;
    immutableArchive?: boolean; // Enables WORM Object Lock export upon completion
  };
}

configureCompliance(config: WorkflowComplianceConfig): this;
```

* **Non-Downgradeable Policy Floor:** Workflow-level `.configureCompliance()` declarations merge monotonically with tenant-wide compliance baselines—authors may add stricter redaction rules or longer retention windows, but cannot weaken tenant-mandated isolation or redaction floors.
* **Awaitable Cryptographic Attestations (`await ctx.compliance.attest(...)`):** Step handlers emit signed, non-repudiable compliance receipts (`{ action, reasoning, evidenceRefs }`) directly to the write-segregated `AuditLogSink`.

### `.configureThrottling(config)` — Declarative Concurrency & Rate-Limit Guardrails
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureThrottling(config)) -->

`.configureThrottling()` attaches workflow-wide concurrency ceilings, LLM token-per-minute budgets, and per-capability rate limiters (`WorkflowThrottlingConfig`) to the compiled Graph IR so authors never write manual sleep loops or token-bucket boilerplate.

#### 1. Typed Method Signature & `WorkflowThrottlingConfig` Contract

```typescript
export interface CapabilityRateLimitRule {
  maxRequestsPerSecond?: number;
  maxInvocationsPerMinute?: number;
  burstCapacity?: number;
}

export interface WorkflowThrottlingConfig {
  maxConcurrentRunsPerTenant?: number;
  maxLLMTokensPerMinute?: number;
  capabilityRateLimits?: Record<string, CapabilityRateLimitRule>;
}

configureThrottling(config: WorkflowThrottlingConfig): this;
```

* **Platform Ceiling Clamping:** Workflow-declared limits may tighten concurrency or rate ceilings for sensitive downstream targets, but are clamped at compile/start time against tenant- and platform-wide maximum quotas.
* **Transparent Proxy Interception:** Step handlers invoke `ctx.ai.*` and `ctx.capabilities.*` normally; the runtime intercepts calls at the `ModelExecutor` and `CapabilityGateway` boundaries to enforce token-bucket pacing automatically.

### `.configureStorage(config)` — Declarative History Compaction & Persistence Policy
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureStorage(config)) -->

`.configureStorage()` configures automated Temporal event-history compaction (`WorkflowStorageConfig`) for long-running or high-iteration workflows, preventing long loops from hitting Temporal's hard **50,000-event** history ceiling.

#### 1. Typed Method Signature & `WorkflowStorageConfig` Contract

```typescript
export interface WorkflowStorageConfig {
  historyOptimization: {
    autoContinueAsNew: boolean;
    maxEventsBeforeSnapshot?: number; // Clamped to <= 25,000; defaults to 10,000
  };
}

configureStorage(config: WorkflowStorageConfig): this;
```

* **Strict `stateSchema` Persistence Invariant:** Because `autoContinueAsNew` serializes only the validated Zod `stateSchema` payload (plus internal orchestrator cursors) into the continued execution thread, **every variable that must survive across compaction boundaries must live inside `stateSchema`**. Closure-local or module-level mutable variables outside `stateSchema` are discarded on rollover.

### `.configureVersion(config)` — Schema Evolution & Mid-Flight State Migrations
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureVersion(config)) -->

`.configureVersion()` registers declarative schema version metadata and deterministic state migration transformers (`WorkflowVersionConfig`), allowing long-running workflows (sleeping for days or weeks on HITL approvals or external signals) to resume safely after backend deployments without triggering Temporal `NondeterminismError` crashes.

#### 1. Typed Method Signature & `WorkflowVersionConfig` Contract

```typescript
export type StateMigrationFn = (
  legacyState: Record<string, unknown>
) => Record<string, unknown>;

export interface WorkflowVersionConfig {
  currentVersion: number; // Monotonically increasing positive integer (default: 1)
  migrations?: Record<`v${number}-to-v${number}`, StateMigrationFn>;
}

configureVersion(config: WorkflowVersionConfig): this;
```

* **Pure Synchronous Migration Invariant:** Every migration function (`v1-to-v2`, `v2-to-v3`, etc.) must be a pure, synchronous, deterministic transformation over its input record—no network calls, wall-clock reads, or random ID generation.
* **Compile-Time Contiguity Verification:** When `currentVersion > 1`, `.compile()` verifies that a complete sequential migration chain exists (`v1-to-v2` ... `v(N-1)-to-vN`) and fails build validation if intermediate steps are missing.
* **Post-Migration Zod Re-Validation:** After piping legacy state through the sequential migration chain, the runtime executes `stateSchema.safeParse(migratedState)` before invoking the next step, failing closed with a `StateMigrationValidationError` if the upgraded object violates the current schema.

### `.addInterceptor(interceptor)` — Global Cross-Cutting Step & Stream Hooks
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addInterceptor(interceptor)) -->

`.addInterceptor()` registers ordered, cross-cutting lifecycle hooks (`WorkflowInterceptor<TState, TInput, THelpers>`) that execute automatically across every step boundary and outbound UI event emission without polluting domain step logic.

#### 1. Typed Method Signature & Lifecycle Hook Contract

```typescript
export interface WorkflowStreamEvent {
  type: string;
  timestamp: string | number;
  payload: Record<string, unknown>;
}

export interface WorkflowInterceptor<
  TState,
  TInput,
  THelpers = Record<string, never>
> {
  readonly name?: string;
  onStepEnter?: (
    stepName: string,
    state: Readonly<TState>,
    ctx: AgentContext<TInput, THelpers>
  ) => Promise<void> | void;
  onStepExit?: (
    stepName: string,
    stateDelta: Readonly<Partial<TState>>,
    ctx: AgentContext<TInput, THelpers>
  ) => Promise<Partial<TState> | void> | Partial<TState> | void;
  transformEvent?: (
    event: WorkflowStreamEvent,
    ctx: AgentContext<TInput, THelpers>
  ) => Promise<WorkflowStreamEvent | null> | WorkflowStreamEvent | null;
}

addInterceptor(interceptor: WorkflowInterceptor<TState, TInput, THelpers>): this;
```

* **Deterministic Execution Ordering:** Interceptors execute in registration order (`first -> last`) across `onStepEnter`, `onStepExit` (piping and stacking `Partial<TState>` deltas onto the step's output before `stateSchema` validation), and `transformEvent`.
* **Event Stream Filtering & Suppression (`transformEvent`):** Returning a transformed `WorkflowStreamEvent` enriches or redacts outbound SSE envelopes; returning `null` drops the event cleanly before network serialization.
* **Schema Alignment Invariant:** Any state fields returned by `onStepExit` (e.g., `lastExecutedStep`, `workflowUpdatedAt`) must be declared in the workflow's `stateSchema` (or inherited from a shared platform base state schema) so post-step Zod validation succeeds deterministically.

### `.configureResilience(config)` — Declarative Retry Policies & Circuit Breakers
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureResilience(config)) -->

`.configureResilience()` registers workflow-wide exponential backoff policies, non-retryable terminal error classifications, and per-capability circuit breakers (`WorkflowResilienceConfig`), eliminating manual `try/catch` retry boilerplate inside step handlers.

#### 1. Typed Method Signature & `WorkflowResilienceConfig` Contract

```typescript
export interface CapabilityCircuitBreakerRule {
  maxFailures: number;
  resetTimeoutMinutes: number;
}

export interface WorkflowResilienceConfig {
  initialIntervalSeconds?: number;
  backoffCoefficient?: number;
  maximumAttempts?: number;
  maximumIntervalSeconds?: number;
  nonRetryableErrors?: readonly string[];
  circuitBreakers?: Record<string, CapabilityCircuitBreakerRule>;
}

configureResilience(config: WorkflowResilienceConfig): this;
```

* **Per-Step Policy Overrides (`StepOptions.retryPolicy`):** Individual steps may override global backoff or `maximumAttempts` settings via `options.retryPolicy`.
* **Mandatory Security Non-Retryables:** Platform security and governance exceptions (`RBAC_ACCESS_DENIED`, `TenantIsolationViolationError`, `BudgetExhaustionException`, `CircuitBreakerOpenError`) are automatically appended to `nonRetryableErrors` and cannot be overridden by workflow authors.

### `.setTerminalOutcome(name, handler, options?)` — Named Pipeline Exit Gates
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .setTerminalOutcome(name, handler)) -->

`.setTerminalOutcome()` defines an explicit, named terminal exit boundary in the workflow graph (`completeWithoutAction`, `insufficientEvidenceOutcome`, `manualEscalationRequired`), replacing ad-hoc early returns with auditable, statically verified termination paths.

#### 1. Typed Method Signature & Authoring Contract

```typescript
export interface TerminalOutcomeOptions {
  classification?: 'success' | 'neutral' | 'warning' | 'failure';
}

setTerminalOutcome(
  name: string,
  handler: (
    state: Readonly<TState>,
    ctx: AgentContext<TInput, THelpers>
  ) => Promise<void> | void,
  options?: TerminalOutcomeOptions
): this;
```

* **Zero State Mutation Invariant:** The terminal `handler` receives a deeply frozen `Readonly<TState>` snapshot representing the final workflow state and must return `Promise<void> | void`—it is forbidden from returning `Partial<TState>` deltas because state evolution has concluded.
* **Compile-Time Topology Resolution:** `.compile()` validates that every target referenced by `.addChoice()` or `ctx.goTo(...)` resolves either to a declared step/gate or a registered `.setTerminalOutcome(name, ...)`, and flags unreachable terminal nodes.
* **Final Attestations & Artifact Emission:** Terminal handlers serve as the canonical place to emit summary artifacts (`await ctx.emitArtifact(...)`), dispatch user notifications, and record final regulatory sign-offs (`await ctx.compliance.attest(...)`).

### `.compile()` — Static Topology Verification & Sealed Blueprint Finalizer
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .compile()) -->

`.compile()` is the terminal finalizer of the fluent `WorkflowBuilder` chain. It seals the builder against further mutation, executes static graph verification (`verifyGraphSafetyTopology`), and produces a frozen `CompiledWorkflowBlueprint`.

#### 1. Method Signature & `CompiledWorkflowBlueprint` Structure

```typescript
export interface CompiledWorkflowBlueprint<
  TState = Record<string, unknown>,
  TInput = Record<string, unknown>,
  THelpers = Record<string, never>
> {
  readonly id: string;
  readonly version: number;
  readonly graphIR: SerializedGraphIR; // Pure JSON-serializable topology, JSON Schemas, policies & UI metadata
  readonly schemas: {
    readonly inputSchema: z.ZodType<TInput>;
    readonly stateSchema: z.ZodType<TState>;
  };
  readonly handlers: RuntimeHandlerRegistry<TState, TInput, THelpers>; // In-memory step/choice/rollback/outcome closures
}

compile(): CompiledWorkflowBlueprint<TState, TInput, THelpers>;
```

#### 2. Three-Stage Compilation Pipeline
1. **Sealing & IR Projection:** Freezes builder state, applies any `onStepAdded` / `onExtend` plugin hooks, compiles `inputSchema`, `stateSchema`, and `.requireApproval()` schemas into JSON Schema projections alongside static UI decorator metadata (`authorize`, `timeout`, `checkpoints`, `extensions`), and indexes live closures into `handlers`.
2. **Static Topology Analysis (`verifyGraphSafetyTopology`):** Runs a deterministic Depth-First Search (DFS) pass over the Graph IR to verify:
   * Every `.addChoice()` / `ctx.goTo()` target resolves to a declared step, loop, signal gate, or `.setTerminalOutcome()`.
   * Every node is reachable from the entry root (flagging orphaned steps or dead-end branches).
   * Every cyclic edge is either enclosed in a bounded `.repeatUntil()` block or has a valid exit path to a terminal outcome (failing fast at startup/test time on unguarded infinite loops).
3. **CI Unit-Test Verification:** Because `.compile()` runs in pure, zero-network TypeScript, workflow authors validate graph integrity directly in unit tests (`expect(() => buildMyWorkflow().compile()).not.toThrow()`) before deployment.

### `verifyGraphSafetyTopology(graph)` — Static DFS Graph Verification Engine
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: verifyGraphSafetyTopology(graph)) -->

Invoked automatically inside `.compile()`, `verifyGraphSafetyTopology(graph)` executes a zero-dependency **Topological Depth-First Search (DFS)** over the compiled Graph IR before plugin registration or worker startup, halting boot on structural defects.

#### 1. The Four Topological Safety Invariants

| Invariant Rule                              | Static Analysis Check                                        | Failure Prevention & Boot Error                              |
| :------------------------------------------ | :----------------------------------------------------------- | :----------------------------------------------------------- |
| **Acyclic Traversal (Guarded Cycles Only)** | Detects strongly connected cycles (`A -> B -> A`) that lack a bounded `.repeatUntil()` wrapper or a conditional exit edge to a non-cyclic downstream node. | Prevents unguarded infinite loops from exhausting Temporal histories and LLM token budgets (`Framework Boot Failure: Acyclic verification check failed`). |
| **Orphan Node Isolation**                   | Verifies via forward reachability from the entry node that every declared step, choice, gate, and outcome is reachable. | Eliminates dead, unreachable workflow nodes and stale refactoring remnants. |
| **Dead-End Resolution**                     | Validates that every target identifier referenced in `.addChoice()`, `ctx.goTo()`, `onReject`, `onTimeout`, and `onMaxRetriesExceeded` matches a registered node name. | Catches typos and renamed step references at build/boot time (`Dead-End Resolution check failed`) rather than failing mid-execution. |
| **Terminal Path Guarantee**                 | Confirms that every reachable execution path eventually leads to an explicit `.setTerminalOutcome()` node (or implicit workflow completion boundary). | Guarantees clean workflow closure, WORM archival flushing, and resource cleanup. |

#### 2. Sub-Graph Boundary & Tooling Integration
* **Concurrent Scope Isolation:** Prohibits `ctx.goTo()` jumps across `.addParallelForEach()` or `.addHypothesisFork()` branch boundaries so concurrent fan-out/fan-in invariants remain deterministic.
* **CI & IDE Synergy:** Because `.compile()` runs synchronously in pure TypeScript with zero database or Temporal dependencies, workflow suites enforce topology safety in **Vitest / Jest** PR checks alongside custom **ESLint** AST rules for inline IDE diagnostics.

### `ctx.auth.getPluginRequestToken(options)` — Service-to-Service Backstage Plugin Auth
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.auth.getPluginRequestToken(options)) -->

`ctx.auth.getPluginRequestToken({ targetPluginId })` obtains an ephemeral, cryptographically signed service-to-service token asserting the orchestrator's plugin identity when calling internal Backstage backend plugins (e.g., `'catalog'`, `'scaffolder'`, `'sonarqube-backend'`).

#### 1. Method Signature & Usage Constraints

```typescript
getPluginRequestToken(opts: {
  targetPluginId: string;
}): Promise<EphemeralSecretEnvelope>; // Unwrapped strictly at outbound HTTP transport boundary
```

* **Architectural Reconciliation Note (Prefer `ctx.capabilities.*` Over Raw `ctx.auth`):** Exposing raw Backstage `coreServices` facades directly inside step handlers tightly couples workflow code to in-memory Backstage DI services that do not exist inside standalone Temporal worker pods. Workflow authors should prefer typed `ctx.capabilities.*` / `HttpIntent` adapters—which resolve service discovery and service-to-service auth automatically—reserving `ctx.auth.getPluginRequestToken()` only for custom internal integrations.
* **Ephemeral Lifetime & Non-Serializable Wrapper:** Never store plugin tokens in `stateSchema` or `ctx.cache`. The returned `EphemeralSecretEnvelope` overrides `toJSON()` and `util.inspect` to emit `'[ENCRYPTED_SECRET_REFERENCE]'` if accidentally logged or returned in a state delta, and must be requested fresh inside the step that uses it.

### `ctx.cache.get(key)` — Tenant-Isolated Distributed Cache Retrieval
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.cache.get(key)) -->

`ctx.cache.get<T>(key)` provides typed, tenant-isolated read access to the platform's distributed cache tier (Redis/Valkey) to avoid redundant upstream API calls across iterative `.repeatUntil()` loops or multi-step pipelines.

#### 1. Method Signature & Authoring Guardrails

```typescript
get<T = unknown>(key: string): Promise<T | undefined>;
```

* **Architectural Reconciliation Note (Standalone Worker Backing):** Because standalone Temporal workers run outside Backstage's in-memory DI container (`coreServices.cache`), `ctx.cache` in worker contexts must bind directly to a shared distributed cache client (Redis/Valkey) rather than an in-process Backstage memory store.
* **Automatic Tenant Key Prefixing:** Authors should prefix keys with their workflow/plugin namespace (e.g., `'alert-tuner:repo-manifest:...'`), while the runtime automatically prepends `tenant:${ctx.tenant.id}:` under the hood so cross-tenant key collisions or cache-poisoning reads are impossible.
* **Volatile Fallback & Zero-Secret Invariant:** Cache reads are always treated as volatile (`T | undefined`) requiring an explicit cache-miss fallback path, and `ctx.cache` strictly rejects secret/credential objects (`EphemeralSecretEnvelope`) or raw HIPAA/FINRA restricted payloads.

### `ctx.cache.set(key, value, ttlMs?)` — Bounded Distributed Cache Offloading
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.cache.set(key, value, ttlMs?)) -->

`ctx.cache.set(key, value, ttlMs?)` offloads transient, recomputable intermediate payloads (API responses, dependency graphs, telemetry dumps) to the distributed cache tier so bulky objects stay out of `stateSchema` and Temporal event histories.

#### 1. Typed Method Signature & Authoring Guardrails

```typescript
set(key: string, value: unknown, ttlMs?: number): Promise<void>;
```

* **Architectural Reconciliation Note (Out-of-Process Worker Backing):** In standalone Temporal worker deployments, `ctx.cache.set()` cannot rely on Backstage's in-memory `coreServices.cache` singleton; it writes directly to the shared Redis/Valkey cluster using automatic server-side key prefixing (`tenant:<tenantId>:<pluginId>:<key>`).
* **Bounded TTL & Size Ceilings:** If `ttlMs` is omitted, the runtime applies a conservative platform default TTL (clamped to a platform maximum ceiling) so transient entries never accumulate indefinitely. Entries exceeding the cache size limit (e.g., `1 MB`) are rejected in favor of `ArtifactSink`.
* **Volatile Cache vs. Deterministic State:** Never store state required by downstream `.addChoice()` routers solely in `ctx.cache.set()`. Any downstream step reading a cached key from `state` must include a cache-miss fallback path, or persist required artifacts via `ArtifactSink`.

### `ctx.catalog.getSystemDependencies(systemId)` — Software Catalog Impact Graph Lookup
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.catalog.getSystemDependencies(systemId)) -->

`ctx.catalog.getSystemDependencies(systemId)` queries the Backstage Software Catalog relationship graph (`partOf`, `dependsOn`, `providesApi`) to retrieve all components, APIs, and resources belonging to a parent `System` for pre-mutation impact analysis.

#### 1. Strongly-Typed Method Signature & Authoring Guardrails

```typescript
import type { Entity } from '@backstage/catalog-model';

getSystemDependencies(systemId: string): Promise<readonly Entity[]>;
```

* **Architectural Reconciliation Note (Out-of-Process Worker Backing):** Standalone Temporal worker pods cannot access Backstage's in-memory `catalogServiceRef` DI singleton or catalog database directly. On workers, `ctx.catalog` delegates over HTTP via `@backstage/catalog-client` using a Token Broker service token (`targetPluginId: 'catalog'`) and caller identity forwarding, or routes through `CapabilityGateway` (`backstage:catalog.getSystemDependencies`).
* **Entity Reference & Annotation Conventions:** Accepts a system name or canonical compound ref (`'system:default/core-billing-mesh'`), returning `[]` for non-`System` entities. Extract repository slugs via standard Backstage annotations (`entity.metadata.annotations?.['://github.com']`).
* **Compact State Projection:** Project only required fields (`entityRef`, `kind`, `projectSlug`) into the returned `Partial<TState>` delta rather than storing raw full `Entity[]` graphs in workflow state.

### `ctx.discovery.getBaseUrl(pluginId)` — Internal Backstage Service Discovery
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.discovery.getBaseUrl(pluginId)) -->

`ctx.discovery.getBaseUrl(pluginId)` resolves the internal cluster base URL for a registered Backstage backend plugin (e.g., `'catalog'`, `'scaffolder'`, `'security-triage'`) without hardcoding environment-specific hostnames or ports.

#### 1. Method Signature & Authoring Guardrails

```typescript
getBaseUrl(pluginId: string): Promise<string>;
```

* **Architectural Reconciliation Note (Out-of-Process Worker Resolution):** Standalone Temporal worker pods cannot access Backstage's in-memory `coreServices.discovery` singleton or `localhost` relative routes. On worker nodes, `ctx.discovery` resolves cluster-routable service URLs from a shared configuration/discovery registry, and workflow authors should prefer typed `ctx.capabilities.*` (`HttpIntent`) adapters that encapsulate discovery, auth, and retries automatically.
* **Path-Traversal Hygiene:** Because `getBaseUrl(pluginId)` returns only the base plugin route, callers joining relative sub-paths must sanitize dynamic segments via `encodeURIComponent(...)` (e.g., `/scans/component/${encodeURIComponent(ctx.input.serviceRef)}`).

### `ctx.health.flagLivenessFailure(reason)` — Worker Container Eviction Escape Hatch
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.health.flagLivenessFailure(reason)) -->

`ctx.health.flagLivenessFailure(reason)` signals an unrecoverable runtime or process-level corruption state from inside an emergency recovery handler (`onMaxRetriesExceeded`), marking the hosting worker container's `/healthz` liveness probe unhealthy so Kubernetes recycles the pod.

#### 1. Method Signature & Authoring Guardrails

```typescript
flagLivenessFailure(reason: string): Promise<void>;
```

* **Architectural Reconciliation Note (Worker-Only Scope & Control-Plane Isolation):** Standalone Temporal workers do not share Backstage's `coreServices.rootHealth` singleton—and a workflow must **never** fail the liveness probe of shared Backstage IDP API pods (which would disrupt Catalog and UI traffic for all users). `ctx.health.flagLivenessFailure()` targets strictly the isolated **Temporal Worker pod's** local `/healthz` endpoint and requires explicit platform/tenant capability authorization (`agent.health.allowPodEviction`).
* **Last-Resort Invariant:** Never invoke `flagLivenessFailure()` for transient HTTP errors, validation failures, or model hallucinations (which belong in `.configureResilience()`, `.addChoice()`, or `onRollback`). Reserve it exclusively for unrecoverable native/process corruption inside `onMaxRetriesExceeded` after awaiting `ctx.compliance.attest(...)`.

### `ctx.lifecycle.addShutdownHook(hookFn)` — Activity-Scoped Cleanup & Eviction Hook
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.lifecycle.addShutdownHook(hookFn)) -->

`ctx.lifecycle.addShutdownHook(hookFn)` registers an emergency local resource cleanup callback (closing file streams, killing spawned sandbox sub-processes, purging temporary `/tmp` directories, or releasing transient locks) that fires immediately if the hosting worker pod receives a `SIGTERM` eviction signal or Temporal activity cancellation mid-execution.

#### 1. Method Signature & Authoring Guardrails

```typescript
addShutdownHook(hookFn: () => Promise<void> | void): () => void; // Returns optional manual dispose handle
```

* **Architectural Reconciliation Note (Worker `SIGTERM` + Temporal `cancellationSignal`):** Because standalone Temporal worker pods do not run Backstage's in-process `coreServices.lifecycle`, `ctx.lifecycle.addShutdownHook()` hooks into the worker's `SIGTERM`/`SIGINT` shutdown coordinator *and* Temporal's `Context.current().cancellationSignal` (and is exposed only inside activity-backed step contexts—never inside pure workflow `.addChoice()` routers).
* **Automatic Post-Step Deregistration:** Hooks are strictly scoped to the active step execution and are automatically unregistered when the step finishes normally so closures do not leak memory across worker runs.
* **Ephemeral Fast-Exit Constraint:** Kubernetes `terminationGracePeriodSeconds` typically caps graceful shutdown at 10–30 seconds before `SIGKILL`. Shutdown hooks must execute fast, idempotent local cleanup only—never triggering LLM calls, HITL approvals, or long network retries.
* **Collision-Free Temp Paths:** When provisioning local temporary directories, always scope paths by both `ctx.tenant.id` and `ctx.activityInfo.activityId` (never `ctx.tenant.id` alone) so concurrent `.addParallelForEach()` branches on the same worker cannot delete each other's files.

### `ctx.notifications.send(targetRef, content)` — Multi-Channel Backstage Alerting
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.notifications.send(targetRef, content)) -->

`ctx.notifications.send(targetRef, content)` dispatches structured operational alerts to individual Backstage users (`user:default/alice`) or owning squads (`group:default/platform-security-ops`) via Backstage's Notifications subsystem (in-app bell tray, email, Slack, or Microsoft Teams based on user topic preferences).

#### 1. Typed Method Signature & `NotificationPayload` Contract

```typescript
export interface NotificationPayload {
  title: string;
  description?: string;
  severity?: 'low' | 'normal' | 'high' | 'critical' | 'warning';
  topic: string; // Required topic slug for user notification preference routing
  link?: string; // Deep-link back to `/agent-workflows/runs/${ctx.instanceId}`
  additionalMetadata?: Record<string, string | number | boolean>;
}

send(targetRef: string, content: NotificationPayload): Promise<void>;
```

* **Architectural Reconciliation Note (Out-of-Process Worker Delegation):** Standalone Temporal worker pods lack in-memory access to Backstage's `notificationService` DI singleton. On worker nodes, `ctx.notifications.send()` delegates over authenticated internal HTTP (via Token Broker service credentials for `targetPluginId: 'notifications'`) or through `CapabilityGateway` (`backstage:notifications.send`).
* **Mandatory `topic` & `stringifyEntityRef` Conventions:** Always specify a granular `topic` slug so users can route non-critical summaries vs. urgent alerts independently, and format catalog targets with `stringifyEntityRef(ownerGroup)` rather than hardcoding `'default'` namespaces.

### `ctx.notifications.requestAction(targetRef, config)` — Interactive Inbox Task Gate
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.notifications.requestAction(targetRef, responseSchema)) -->

`ctx.notifications.requestAction()` creates a two-way Human-in-the-Loop task inside a step, dispatching a Zod-driven interactive action card into a target user's or group's Backstage notification inbox and suspending workflow progress until an authorized recipient submits a validated response.

#### 1. Typed Method Signature & Configuration Contract

```typescript
requestAction<TSchema extends z.ZodTypeAny>(
  targetRef: string,
  config: {
    title: string;
    description: string;
    responseSchema: TSchema;
    timeout?: string | number; // Bounded SLA (defaults to platform HITL timeout)
  }
): Promise<z.infer<TSchema>>;
```

* **Architectural Reconciliation Note (Workflow-Level Suspension vs. Activity Blocking):** Unlike fire-and-forget `ctx.notifications.send()`, `requestAction()` cannot simply block inside a standard Temporal worker activity thread (which would exhaust worker slots and breach `startToCloseTimeout`). The runtime checkpoints pre-action state, dispatches the inbox task card via the Backstage control plane, and suspends the **Temporal Workflow** (`condition(...)`) with zero active worker compute until the signed signal arrives.
* **End-to-End `z.infer<TSchema>` Return Inference:** The resolved return value is strongly typed from `config.responseSchema` and must be returned inside the step's `Partial<TState>` delta to persist in durable workflow memory.

### `ctx.permissions.authorize(options)` — Granular Runtime RBAC Evaluation
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.permissions.authorize(options)) -->

`ctx.permissions.authorize()` evaluates item-level or dynamic runtime permissions against Backstage's central Permissions Framework inside step logic (complementing static step-level `StepOptions.authorize`), enabling per-resource access checks across loops and `.addParallelForEach()` branches.

#### 1. Method Signature & Authoring Guardrails

```typescript
import type { Permission } from '@backstage/plugin-permission-common';

authorize(options: {
  permission: Permission;
  resourceRef?: string;
}): Promise<{ result: 'ALLOW' | 'DENY' }>;
```

* **Architectural Reconciliation Note (Out-of-Process Worker Delegation):** Standalone Temporal worker pods lack in-memory access to Backstage's `coreServices.permissions` DI singleton and never hold raw user session JWTs. On workers, `ctx.permissions.authorize()` calls an internal Backstage Policy Evaluation Bridge using Token Broker service credentials paired with verified caller identity claims (`tenantId`, `actorEntityRef`).
* **No Hardcoded Role Checks:** Pass declarative Backstage `Permission` descriptors and `resourceRef` strings rather than hardcoding role strings (`user.roles.includes('admin')`) in workflow logic.
* **Graceful `DENY` Handling:** Handle `'DENY'` verdicts explicitly (skipping restricted resources with `await ctx.compliance.attest(...)` or routing via `ctx.goTo(...)`) rather than crashing the entire multi-item workflow.

### `ctx.plugin.getId()` — Immutable Workflow Origin Plugin Reflection
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.plugin.getId()) -->

`ctx.plugin.getId()` is a synchronous, zero-overhead reflection helper returning the immutable string identifier of the Backstage plugin or backend module that owns and registered the active workflow (e.g., `'alert-tuner'`, `'infrastructure-migrator'`).

#### 1. Method Signature & Authoring Conventions

```typescript
getId(): string;
```

* **Architectural Reconciliation Note (Registration-Time Stamping for Workers & Modules):** Standalone Temporal worker pods cannot access Backstage's in-memory `coreServices.pluginMetadata` service—and in Backstage's New Backend System, modules targeting `pluginId: 'agent-orchestrator'` share the host plugin's runtime metadata unless the domain origin is captured explicitly. Therefore, the Core Orchestrator stamps `ownerPluginId` (derived from the registering plugin/module ID) onto `CompiledWorkflowBlueprint` at registration time and propagates it in the Temporal workflow envelope so `ctx.plugin.getId()` works identically in both embedded Backstage pods and remote workers.
* **Distinct from `ctx.instanceId`:** Use `ctx.plugin.getId()` to identify the *workflow package origin* (for policy routing, model tier selection in `.addInterceptor()`, and log/metric grouping) and `ctx.instanceId` to identify the *specific workflow execution run*.

### `ctx.scheduler.scheduleTask(config)` — Declarative Recurring Workflow Scheduling
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.scheduler.scheduleTask(config)) -->

`ctx.scheduler.scheduleTask()` registers a durable, cluster-coordinated recurring schedule (such as periodic fleet compliance audits or orphaned resource sweeps) without in-memory timers (`setInterval`) or multi-pod race conditions.

#### 1. Reconciled Method Signature & `TaskScheduleDefinition` Contract

```typescript
export interface TaskScheduleDefinition<TWorkflowInput = Record<string, unknown>> {
  id: string; // Automatically namespaced to `tenant:<tenantId>:<pluginId>:<id>`
  targetWorkflowId: string; // Must reference a compiled, registered workflow ID (never an inline closure)
  input: TWorkflowInput; // JSON-serializable input validated against targetWorkflowId's inputSchema
  frequency: { seconds?: number; minutes?: number; hours?: number; days?: number } | { cron: string };
  timeout?: string | number;
  overlapPolicy?: 'SKIP' | 'BUFFER_ONE' | 'ALLOW_ALL';
}

scheduleTask<TWorkflowInput = Record<string, unknown>>(
  config: TaskScheduleDefinition<TWorkflowInput>
): Promise<{ scheduleId: string }>;
```

* **Architectural Reconciliation Note (Serializable Workflow Target vs. Inline `fn` Closure):** Standalone Temporal worker pods cannot serialize live JavaScript closures (`fn: async () => ...`) across gRPC to Backstage's in-process `coreServices.scheduler`, and capturing an outer step's `ctx` would bind future runs to an expired execution context. Therefore, `scheduleTask()` accepts a serializable `targetWorkflowId` + `input` payload backed by **Temporal Schedules** (reserving Backstage `coreServices.scheduler` for static control-plane housekeeping jobs registered at plugin boot).
* **Automatic Tenant & Plugin Key Prefixing:** The runtime automatically prefixes `config.id` with `tenant:${ctx.tenant.id}:${ctx.plugin.getId()}:` so schedules from one tenant or plugin cannot collide with or overwrite another's.
* **Headless Execution Rules (`triggerType: 'scheduler'`):** Scheduled runs execute without an active browser session; inline interactive prompts (`ctx.interaction.askUser`) are prohibited, and any async `.requireApproval()` or `ctx.notifications.requestAction()` step must specify an explicit accountable `assignedRole` or `targetRef`.

### `ctx.search.query(text, options)` — Backstage TechDocs & Catalog RAG Lookup
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.search.query(text, options)) -->

`ctx.search.query()` queries Backstage's unified search indices (`techdocs`, `catalog`, `adr`, and configured enterprise document connectors) to retrieve ranked troubleshooting playbooks, architectural docs, and entity metadata for RAG-grounded steps.

#### 1. Typed Method Signature & Authoring Guardrails

```typescript
export interface BackstageSearchDocument {
  readonly title: string;
  readonly text: string;
  readonly location: string;
  readonly kind?: string;
  readonly rank?: number;
}

query(
  text: string,
  options?: {
    kinds?: readonly string[];
    limit?: number; // Clamped to platform ceiling (e.g., <= 10)
    pageCursor?: string;
  }
): Promise<readonly BackstageSearchDocument[]>;
```

* **Architectural Reconciliation Note (Out-of-Process Worker Delegation):** Standalone Temporal worker pods lack in-memory access to Backstage's `SearchService` DI singleton. On worker nodes, `ctx.search.query()` delegates over authenticated internal HTTP to Backstage's Search API using Token Broker service credentials (`targetPluginId: 'search'`) and verified caller identity claims (`tenantId`, `actorEntityRef`).
* **Compact State Delta Projection:** Always bound `limit` (e.g., `limit: 3`) and slice long snippet strings before prompt assembly. Never return raw full-text search documents in `Partial<TState>`—project only lightweight citation links (`runbookReferencesUsed: results.map(d => d.location)`) into workflow state.

### `ctx.urlReader.readUrl(url, options?)` — Multi-Provider SCM & Artifact Fetching
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.urlReader.readUrl(url)) -->

`ctx.urlReader.readUrl()` provides a unified binary/text retrieval facade across configured source-code and artifact providers (GitHub, GitLab, Bitbucket, Azure DevOps, internal S3) without exposing raw SCM credentials to workflow authors.

#### 1. Typed Method Signature & Authoring Guardrails

```typescript
export interface UrlReaderReadOptions {
  etag?: string;
  lastModifiedAfter?: Date;
  maxBytes?: number; // Clamped to platform ceiling (e.g., 5 MB)
}

readUrl(url: string, options?: UrlReaderReadOptions): Promise<Buffer>;
```

* **Architectural Reconciliation Note (Out-of-Process Worker Backing & Tenant Auth):** Standalone Temporal worker pods cannot access Backstage's in-process `coreServices.urlReader` singleton—and global `app-config.yaml` integration keys do not enforce multi-tenant isolation. On workers, `ctx.urlReader.readUrl()` delegates through `CapabilityGateway` using tenant-scoped credentials resolved from the **Token Broker** (or an authenticated Backstage UrlReader proxy).
* **Explicit Encoding & Compact State Rule:** Convert returned `Buffer` payloads using explicit UTF-8 decoding (`buffer.toString('utf-8')`) inside the step handler, and avoid returning multi-megabyte file contents directly in `Partial<TState>` (persist large files to `ArtifactSink` and return `artifactRef` instead).

### `ctx.userInfo.getUserInfo(credentialOrRef)` — Verified Principal Profile Resolution
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.userInfo.getUserInfo(token)) -->

`ctx.userInfo.getUserInfo()` resolves a verified Backstage user identity into a structured `BackstageUserProfile` (`userEntityRef`, `ownershipEntityRefs`, `displayName`, `email`) for personalization, group ownership checks, and notification routing without manual JWT/JWKS parsing.

#### 1. Reconciled Method Signature & Authoring Guardrails

```typescript
export interface BackstageUserProfile {
  readonly userEntityRef: string; // Canonical ref e.g. 'user:default/alice'
  readonly ownershipEntityRefs: readonly string[];
  readonly displayName?: string;
  readonly email?: string;
}

getUserInfo(
  credentialOrEntityRef: EphemeralSecretEnvelope | string
): Promise<BackstageUserProfile>;
```

* **Architectural Reconciliation Note (Control-Plane Resolution vs. Worker RPC):** In Backstage's New Backend System, `coreServices.userInfo` operates in-process on `BackstageCredentials` objects rather than raw strings on remote Temporal workers. By default, the Backstage control plane resolves the triggering principal at HTTP/webhook ingress and exposes verified claims directly on `ctx.actor`; when invoked explicitly on a worker pod, `ctx.userInfo.getUserInfo()` delegates via an authenticated internal Backstage identity bridge (never passing raw JWTs through `TState` or webhook JSON bodies).
* **Canonical `userEntityRef` & PII Minimization:** Always use `profile.userEntityRef` for `ctx.notifications.send()` targets (preserving custom namespaces) and persist only `userEntityRef`—not raw email addresses or bearer tokens—in `Partial<TState>` deltas.

### Fluent Builder Architecture & Modular Trait Composition
<!-- Source: incoming/FLUENT_GRAPH_BUILDER_CLASS_DESIGN.md (Section: Mixin Pattern — Core Constructor Type, Composition Root, and Isolated Mixin Functions) -->

To keep the authoring SDK modular across 50+ fluent methods while preserving full TypeScript autocompletion and single-responsibility domain files, the builder decomposes capabilities into isolated domain trait factories composed onto a shared base class:

* **Domain Trait Decomposition:** Fluent builder methods are partitioned into cohesive domain modules rather than a single monolithic class:
  * **Agent Core (`agent/`):** Identity (`IdentityMixin` — `withName`, `withInstructions`) and model configuration (`ModelMixin`).
  * **Memory (`memory/`):** Long-term semantic persistence (`LongTermMemoryMixin`) and short-term session/checkpoint state (`ShortTermMemoryMixin`).
  * **Workflow & Durability (`workflow/`):** Human-in-the-loop signals (`SignalMixin`) and execution lifecycle hooks (`LifecycleMixin`).
  * **Capabilities & Grounding (`tools/`, `retrieval/`):** Tool/capability binding (`ToolMixin`) and RAG/catalog search (`RetrievalMixin`).
* **Composition Root (`engine/fluent/builder.ts`):** Aggregates all domain trait factories onto `BaseAgentBuilder` to expose a unified `AgentBuilder` entry point with a terminal `.compile()` step that emits the compiled definition/IR.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
The incoming mixin prototype illustrates structural file decomposition, but contains four anti-patterns that **must be reconciled** in the greenfield implementation:

1. **Untyped `Record<string, any>` Config Bag:** `BaseAgentBuilder` uses `protected config: Record<string, any> = {}`, which erases compile-time validation. Replace with a strongly typed, discriminated Graph IR / `AgentDefinitionSpec` interface and phantom/generic type accumulators so `.compile()` enforces required fields (e.g., identity, model, capability declarations) at compile time.
2. **Mutable In-Place State (`this.config.x = ...`):** Mutating a shared `this.config` object causes aliasing bugs if a base builder instance is branched or reused across multiple agent definitions. Transition to **immutable state reduction** (cloning/copy-on-write state transitions returning a new builder instance on each chained call).
3. **Runtime `Array.prototype.reduce` Type Erasure:** In TypeScript, `mixins.reduce((Base, mixin) => mixin(Base), BaseAgentBuilder)` collapses the accumulated intersection type into a union or `any` unless explicitly typed via recursive conditional types or nested functional composition (`LifecycleMixin(SignalMixin(...(BaseAgentBuilder)))`). Use explicit nested composition or a type-preserving `pipeMixins` helper so full type inference across all 50+ methods is guaranteed.
4. **Raw Config Return in `.compile()`:** `.compile()` must validate invariants (schema checks, capability requirement extraction, schedule validation) and emit a frozen, serializable **Graph IR** rather than returning the mutable internal builder object directly.

### Fluent SDK Module Map & Compiler Serialization Boundary
<!-- Source: incoming/ARCHITECTURE_FILE_LAYOUT.md (Section: Proposed File Architecture -- engine/fluent & engine/compiler) -->

* **Trait-to-Graph Compilation Pipeline:** Fluent builder traits (`agent/identity`, `agent/model`, `memory/long-term`, `memory/short-term`, `retrieval/sources`, `retrieval/search`, `tools/standard`, `tools/custom`, `workflow/signals`, `workflow/lifecycle`) feed into `engine/compiler/serialization.ts`, which emits a deterministic, JSON-serializable execution graph (Graph IR) verified by dedicated compiler unit tests (`tests/unit/`).
* **Reconciliation Note (Custom Tools & Web Search):** Trait methods such as `.withDynamicTool()` and `.withWebSearch()` must not bypass capability governance. In the greenfield SDK, dynamic tools and external web search must compile into declarative **Capability Requirements** resolved through `CapabilityGateway` (with explicit schemas, RBAC scopes, and egress controls) rather than executing arbitrary inline closures inside Temporal workflows.

### Compile-Time Validation vs. Runtime Execution Boundary
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Executive Summary & Design Philosophy) -->

* **Separation of Concerns:** The authoring SDK strictly separates **compile-time graph validation** (schema checking, capability requirement resolution, cycle/reachability verification, and FinOps budget metadata binding via the type-inferred fluent builder) from **runtime execution handling** in Temporal workers.

### Typed `WorkflowBuilder`, Graph IR (`WorkflowBlueprint`) & `AgentContext` Surface
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: The Fluent Core Interface Engine (WorkflowBuilder) — types.ts & WorkflowBuilder.ts) -->

The authoring SDK uses Zod schemas (`TState`, `TInput`) and TypeScript generics (`THelpers`) to propagate strongly typed workflow state, inputs, and injected helper signatures across step definitions, compiling down to a validated `WorkflowBlueprint` Graph IR:

* **Graph IR Data Model (`WorkflowBlueprint` & `GraphNode`):**
  * `WorkflowBlueprint` encapsulates `{ id, initialStep, stepSequenceOrder, stepsGraph, finOpsConfig, storageConfig }`.
  * `GraphNode` models four core node primitives: `'step' | 'choice' | 'checkpoint' | 'approval'`, supporting nested `pipelineSteps` and explicit `routingTargets`.
  * `.compile()` validates the structural graph via `validateWorkflowGraph(id, internalChain)` (verifying reachability, valid routing targets, and initial state defaults via `stateSchema.parse({})`) and emits both the serializable `blueprint` and executable `registry` (`steps`, `choices`, `terminalOutcomes`, `helpers`).
* **Typed Helper Currying (`useHelpers`):** Helpers are authored as `(ctx, ...args) => result` functions; `AgentContext['helpers']` strips the leading `ctx` parameter via conditional tuple inference so step authors invoke `ctx.helpers.myHelper(...args)` with full argument/return type safety.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
The prototype `WorkflowBuilder` and `AgentContext` interfaces contain several security and type-safety gaps that **must be reconciled** in the greenfield SDK:

1. **No Raw Secrets, Direct DB Clients, or Unfiltered URL Readers on `AgentContext`:** Exposing `secrets.getScopedVaultSecret`, `db.getClient(): Promise<Knex>`, and `urlReader.readUrl(url)` directly to agent step code violates our compliance and capability boundaries (risking secret leakage into LLM prompts/Temporal history, SSRF, and cross-tenant SQL access).
   * Replace `secrets` with declarative **Capability Requirements** fulfilled at execution time by the **Token Broker** inside `CapabilityGateway` (Option B/C/D).
   * Replace raw `Knex` access with typed, tenant-scoped persistence repositories (`SessionStore`, `CheckpointStore`, `RunStore`, `ArtifactSink`).
   * Route external HTTP/URL fetches through `CapabilityGateway` `HttpIntent` descriptors with domain allowlists and egress redaction.
2. **Accumulate Helper Types Instead of Overwriting (`THelpers & TNewHelpers`):** In the prototype, `useHelpers<TNewHelpers>()` overwrites the `THelpers` generic parameter (`WorkflowBuilder<TState, TInput, TNewHelpers>`) even though at runtime it merges `{ ...this.helpersRegistry, ...helpers }`. Return `WorkflowBuilder<TState, TInput, THelpers & TNewHelpers>` and clone builder state immutably.
3. **Eliminate `any` in `GraphNode.options`, `AgentContext.ai`, and `configureCompliance`:** Replace `any` with strict discriminated option schemas, typed Vercel AI SDK `ModelExecutor` contracts, and explicit compliance policy types (`piiRedaction`, `auditLevel`, `retentionClass`, `approvalRequired`).
4. **Enforce `principalRef` & `tenantId` Provenance:** `AgentContext` must carry verified `tenantId` and `principalRef` (never `'anonymous'` fallbacks) propagated from Backstage `httpAuth` or signed schedule metadata.

### Pre-Flight Graph Validation Engine (`graphValidator`)
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Pre-Flight Graph Validation Engine (graphValidator) — framework/compiler/graphValidator.ts) -->

`validateWorkflowGraph(id, nodes)` runs a zero-dependency, pure-TypeScript Depth-First Search (DFS) at compile/startup time—completely isolated from Temporal's deterministic workflow bundle—to reject invalid workflow topologies before registration:

* **Validation Invariants Enforced:**
  * **Non-Empty Graph:** Rejects empty node lists (`nodes.length === 0`).
  * **Cycle Detection (`recStack`):** Tracks active recursion ancestry and throws a compilation error on arbitrary back-edges, forcing authors to use bounded `.repeatUntil()` sub-pipelines instead of unbounded cyclic jumps.
  * **Referential Integrity:** Verifies that every `choice.routingTargets` entry and `repeatUntil.pipelineSteps` sub-step resolves to a registered `GraphNode` in `stepsMap`.
  * **Deep-Cloned IR Snapshot:** Emits an isolated snapshot (`stepsGraph`) alongside `initialStep` and `stepSequenceOrder`.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
The prototype `graphValidator.ts` has four structural edge cases that **must be tightened** in the greenfield compiler:

1. **Sequential Edge Traversal Missing in DFS:** In the prototype, `dfs()` only recurses into `choice.routingTargets` and `repeatUntil.pipelineSteps`, omitting implicit sequential fallthrough (`nodes[i] -> nodes[i + 1]`) for linear `step`, `checkpoint`, and `approval` nodes. Without sequential edge traversal, `dfs(nodes[0].name)` stops at the first linear step and misses cycles or broken links downstream.
2. **Duplicate Node Name Detection:** `for (const node of nodes) stepsMap.set(node.name, node)` silently overwrites earlier nodes if two nodes share a `name`. Add an explicit uniqueness assertion (`if (stepsMap.has(node.name)) throw ...`) before building the adjacency map.
3. **Unreachable / Orphan Node Detection:** After DFS completes from `nodes[0].name`, compare `visited.size` against `stepsMap.size` (accounting for nested `pipelineSteps`) to flag dead/unreachable nodes at compile time.
4. **Union Type Alignment (`repeatUntil`) & `structuredClone`:** Add `'repeatUntil'` (with mandatory `maxIterations` bound) to the `GraphNode['type']` union so it matches `graphValidator.ts`, and use `structuredClone(nodes)` (native in Node 22+) instead of `JSON.parse(JSON.stringify(nodes))`.

### Isolated Authoring Verification Harness (`createTestHarness` / `TestHarness`)
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: The Isolated Verification Harness (createTestHarness) — framework/testing/TestHarness.ts) -->

To let workflow authors unit-test step logic, state transitions, and redaction invariants locally without live Temporal clusters, Backstage backends, or external cloud APIs, the SDK provides an isolated `TestHarness`:

* **Deterministic State Hydration & Stepping:**
  * Initializes `currentState` from the compiled `registry.initialState` and allows targeted fixture setup via `.hydrateState(partial)`.
  * `.next(input, stepName)` executes an individual step handler against a mocked `AgentContext`, captures `preState` and `postState` snapshots in `executedHistoryLogs`, and reduces returned state deltas.
* **Mocked Capability & Logger Injection:** Injects stubbed capability handlers and spy loggers (`logger.info`, `logger.debug`) so step handlers can be tested deterministically offline.
* **Secret-Leak Assertion (`.toHaveNoLeakedSecrets()`):** Scans serialized `executedHistoryLogs` (and captured logger arguments) to verify that no plaintext credentials leaked into workflow state or telemetry.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
The prototype `TestHarness.ts` has five issues that **must be reconciled** in the greenfield SDK test kit:

1. **Canary Secret Tracking Instead of Weak Regex Alone:** The prototype regex `/(?:password|secret|token)\s*:\s*["'][^"']{5,}/i` only matches unquoted JS object syntax (`secret: "value"`), whereas `JSON.stringify(executedHistoryLogs)` produces quoted JSON keys (`"secret":"value"`) and misses raw bearer tokens, AWS keys, PEM blocks, or custom header values! Upgrade `TestHarness` to:
   * Register **known canary secrets** inside `SecretEnvelope` mocks and assert that **none of the canary plaintext strings** appear anywhere in `JSON.stringify(executedHistoryLogs)`, emitted SSE events, or `logger.*` mock call arguments.
   * Run the platform's canonical PII/secret scanner (`utils/validation.ts`) over all captured logs and state snapshots.
2. **Enforce `SecretEnvelope` & `CapabilityGateway` Parity in Mocks:** Do not inject raw `ctx.capabilities.backstage.kubernetes.tuneQuotas` function trees onto `mockCtx` if production steps invoke capabilities via `CapabilityGateway` / `HttpIntent` / `NativeAdapter`. `TestHarness` mocks must mirror the exact production `AgentContext` interface and `CapabilityGateway` descriptor contract.
3. **Separate Unit Stepping from Temporal Virtual-Time Simulation:** The section intro mentions *virtual time advancement*, which `TestHarness` does not actually implement. Pair `TestHarness` (for fast unit testing of individual step functions) with a Temporal integration helper backed by `@temporalio/testing` (`TestWorkflowEnvironment.createTimeSkipping()`) to test durable timers, approval signal timeouts, and `ContinueAsNew` under virtual time.
4. **Enforce Structured `LoggerService` Spy Assertions:** Assert in `TestHarness` that `logger.info` / `logger.warn` / `logger.error` mocks are called with `(message: string, meta?: Record<string, unknown>)` rather than interpolated strings.
5. **Framework-Agnostic Test Doubles:** Use Vitest/Jest-compatible spy abstractions (`vi.fn()` or lightweight built-in call recorders) so `@backstage/plugin-agent-node` / `TestHarness` works across both Jest (Backstage default) and Vitest without hard-coding `jest.fn()` in production library code.

### Provider-Neutral Authoring vs. Model-Specific Prompt Compilation
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 3: Model-Family-Specific Prompt Adaptation) -->

* **Authoring Decoupling:** Workflow and agent definitions authored via the Fluent SDK declare logical instructions, context slots, and reasoning-effort intents without hard-coding provider-specific prompt delimiters (such as raw XML tags or vendor-specific cache headers), allowing the runtime prompt compiler to adapt formatting cleanly when workflows are re-routed or failed over across model families.

### First-Class Scoped Agent Handoffs & Separation of Duties (`.agent.md` Pattern)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 5: First-Class Handoffs Between Scoped Agents (.agent.md)) -->

Rather than spawning unconstrained autonomous sub-agents at runtime, the authoring SDK models **first-class, declarative handoffs** between narrowly scoped agent profiles (adapted from VS Code Copilot Chat's `.agent.md` custom agents and curated handoffs):

* **Scoped Agent Profile Contracts:** Each agent profile declares:
  * **Least-Privilege Capability Allowlist:** Explicit read-only vs. mutating `CapabilityDescriptor` IDs (e.g., a `TriageAgent` restricted strictly to log/metric/catalog read capabilities).
  * **Pinned Model & Reasoning Policy:** Model tier/family and reasoning budget suited to that phase (e.g., diagnostic analysis vs. deterministic change execution).
  * **Curated Handoff Transitions (`handoffs`):** Explicit, typed outgoing transitions specifying the target `agentId`, a structured handoff payload schema (e.g., `VerifiedRemediationPlan`), and whether human approval is mandatory prior to transition.
* **Plan-to-Execute Separation:** Platform workflows decompose high-risk operations into distinct phases—such as a read-only **Triage / Plan Agent** producing a structured remediation plan that transitions through an approval gate into a privileged **Change Execution Agent**—preventing a single prompt loop from jumping directly from alert diagnosis to infrastructure mutation.

### `defineAgentCapabilityPack` Contract & Semantic Versioning
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 24: Bundled "Agent Plugins" as Versioned Capability Packages) -->

* **Declarative Pack Manifest:** The authoring SDK exports `defineAgentCapabilityPack({ packId, version, agents, skills, capabilities, stopHooks, lifecycleHooks })` with strict Zod validation so domain packs can be unit-tested independently via `createTestHarness` and published as immutable, semver-versioned artifacts.

### Logical Model Tier Slots (`primary` vs. `utility`) in Agent Definitions
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 30: Background Model Speculation & Sub-Model Routing) -->

* **Tiered Model Policy Configuration:** Agent and workflow builders configure logical model tier preferences (`primaryTier`, `utilityTier`, `maxBudgetUsd`) rather than hard-coding single model IDs for housekeeping tasks, allowing platform administrators to upgrade or swap fast utility models centrally without modifying workflow blueprints.

### Trajectory Fixture Record & Replay in `createTestHarness`
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 34: Deterministic Trajectory Replay & Simulation Harnesses (*.stest.ts)) -->

* **Multi-Turn Fixture Playback:** `createTestHarness` supports loading recorded JSON trajectory fixtures (`withFixtureTape(fixturePath)`) to simulate multi-turn tool calls, approval responses, and Stop-Hook loops offline when authoring or refactoring workflow graphs and `SKILL.md` runbooks.

### Logical `modelRef` & Data-Sensitivity Routing in Agent Definitions
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 36: Custom LM Provider & Endpoint Abstraction (LanguageModelChatProvider)) -->

* **Provider-Agnostic Model Selection:** Agent and workflow definitions specify logical `modelRef` identifiers or tier hints (`primaryTier`, `utilityTier`) rather than importing `@ai-sdk/openai` or `@ai-sdk/anthropic` directly, preserving portability across cloud providers and compliance enclaves.
