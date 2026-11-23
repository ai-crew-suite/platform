# Discovery: 03 - Agent Reasoning & Inference Runtime

This staging file collects all raw research and design notes related to single-node LLM execution, Vercel AI SDK integration, prompt assembly, structured output generation, token streaming, multi-turn tool-calling loops, and runtime guardrails. All notes captured here govern the isolated, non-deterministic inference boundary executed inside durable workflow activities.

### Node-Level Token Usage Emission & Run Budget Enforcement
<!-- Source: incoming/_AGENT_Q_AND_A.md (Question 1) -->

* **Per-Node Usage Attribution:** Every `usage` event emitted by the reasoning runtime must include a required `node` identifier (aligning with `AgentEvent` v2) alongside `modelRef` and token counts so multi-step graphs can attribute spend to specific graph nodes.
* **In-Flight Budget Enforcement:** The runtime must accumulate total token usage in-memory during execution to enforce per-run `maxTotalTokens` limits immediately, independent of asynchronous persistence to the `UsageSink`.
* **Telemetry Spans:** Continue attaching `ai.usage.input`, `ai.usage.output`, and `ai.usage.total` attributes to active OpenTelemetry spans while forwarding structured records to the `UsageSink`.

### Transparent Agent Loop & Context Hygiene
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Over-Engineering & Framework Traps) -->

* **Minimalist, Inspectable Core Loop:** Avoid heavy, opaque agent frameworks that hide prompt construction and control flow behind rigid abstractions. Implement the node-level agent loop as a clean, transparent `while` loop over structured JSON tool calls (via Vercel AI SDK) so state transitions, token usage, and failures are directly observable and debuggable.
* **Bounded Active Tool Set per Turn:** Never inject the full platform tool catalog (e.g., 40+ tool schemas) into every LLM prompt, which degrades tool-selection accuracy and inflates per-turn token burn. Restrict each reasoning turn to a small, task-scoped set of active tools or dynamically loaded skills.

### Conversation History Hygiene & Code-First Guardrails
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Prompt & Context Anti-Patterns) -->

* **Prevent Raw Payload Accumulation in Message History:** The reasoning loop must never append unbounded raw tool outputs directly into the multi-turn message array, ensuring subsequent turns remain fast, accurate, and within token budgets.
* **Fix Bugs in Code, Not via Prompt Stuffing:** Enforce behavioral invariants via deterministic runtime validation, structured output schemas, and typed tool errors rather than accumulating ad-hoc `"NEVER do X"` rules in system prompts.

### Loop Circuit Breakers, Deadlock Detection & Single-Loop Discipline
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Control Loop & Error Handling Mistakes) -->

* **Hard Loop & Retry Circuit Breakers:** The reasoning loop must enforce strict, configurable caps on maximum loop iterations (`maxSteps`), consecutive tool failures, and cumulative token spend (`maxTotalTokens`) so runaway loops terminate deterministically rather than burning budget indefinitely.
* **Repeated Tool-Call Deadlock Detection:** Track recent `(toolId, normalizedArgs)` invocations within a run; if the agent emits identical failing or redundant tool calls beyond a threshold, automatically trip a circuit breaker to halt or escalate instead of spinning.
* **Single-Agent Loop Default Over Premature Multi-Agent Hierarchies:** Default to a single capable reasoning loop per task. Spawn isolated sub-agents only when a subtask genuinely requires context-window isolation (e.g., summarizing a large codebase or running an independent research branch) to avoid unnecessary latency, token multiplication, and inter-agent handoff failures.

### Safe Context Window Compaction
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (State & Memory Design Flaws) -->

* **Stateless Message Trimming:** The reasoning runtime may compact or truncate older turns in the active message array to stay within model context limits, reading authoritative task progress from structured node inputs/state rather than relying on earlier chat messages remaining intact.

### Anti-Contamination: Retry Chain Pruning & Immutable System Invariants
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Prompt & Context Contamination) -->

* **Prune Failed Tool-Call Chains Upon Recovery:** When an agent fails a tool call and subsequently succeeds on a retry, the runtime must prune or collapse the intermediate failed tool-call/error turns from the active message history. Leaving failed exchanges in the prompt creates few-shot poisoning where the model imitates its own prior mistakes.
* **Immutable Core System Instructions:** Core system prompts, persona definitions, and platform safety invariants must be strictly read-only at runtime. Agents must never be permitted to mutate or overwrite their base system instructions during execution.

### Iterative Planning, Explicit Stopping Criteria & Blocker Escalation
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Cognitive & Planning Traps) -->

* **Iterative Inspect-Act-Observe Loop Over Rigid Upfront Plans:** Do not force agents to generate rigid multi-step master plans before inspecting live environment state. Structure agent reasoning as an iterative loop: inspect environment state first, execute one bounded/reversible step, observe the structured output, and adapt dynamically.
* **Explicit Exit Conditions & Tool-Call Caps:** Every agent node must enforce both a hard `maxToolCalls` / `maxSteps` cap and explicit completion criteria (e.g., target output schema satisfied or state invariant reached) so open-ended prompts terminate cleanly rather than spinning in endless refinement loops.
* **Fail-Fast Blocker Escalation (No Hallucinated Workarounds):** Base system instructions and runtime error handling must explicitly direct the agent to halt and surface a structured blocker whenever a required tool, permission, or upstream API is unavailable—never fabricating mock data, stubbing missing results, or inventing fragile workarounds.

### Provider-Agnostic Inference Adapters & Call Attribution
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Maintenance & Upgrade Traps) -->

* **Zero Vendor-Specific Parsing in Core Logic:** Never embed model-specific prompt hacks, custom XML tag parsers, or provider-tailored regex extractors inside the core reasoning engine. Rely strictly on Vercel AI SDK's standardized native tool-calling and structured-output (`generateObject` / Zod) abstractions, isolating any provider quirks inside thin adapter boundaries.
* **Mandatory Run & Workflow Tagging on Inference Calls:** Every LLM request dispatched by the runtime must attach structured telemetry metadata (`runId`, `sessionId`, `workflowRef`, `nodeId`, and `purpose` such as `agent-turn` vs. `memory-summarization`) so downstream token spend can be attributed to exact workflows and background tasks.

### Typed Inference Capability Registration & Resolution
<!-- Source: incoming/CAPABILITIES_EXTENSION_POINTS.md -->

* **Capability-Specific Provider Contracts:** Provider modules should expose only the inference capabilities they implement (for example, chat generation, embeddings, transcription, guardrails, or reranking) through typed platform contracts. Runtime consumers should resolve registered capabilities by stable IDs through a read-only registry rather than reaching into provider configuration trees.
* **Keep Provider Adapters Out of Core and Storage:** Vendor SDK construction and provider-specific configuration belong in provider modules. Inference adapters should not register agent tools or own database, vector-store, catalog-client, or indexing setup.
* **Preserve the Adapter API Boundary:** The source draft's `BaseChatModel`/LangChain contract and proposed identifiers are not aligned with the Vercel AI SDK-based `ModelExecutor` contract documented here; treat them as historical examples, not adopted APIs or IDs.
* **Open Registry Shape Decision:** The source proposes both one unified inference extension point and separate extension points per capability. Keep the capability contracts independently typed, but resolve whether registration uses one or several Backstage extension points in an ADR before fixing the public API.

### Two-Tier Drafting vs. Repair Execution & Anti-Gaming Guardrails
<!-- Source: incoming/AGENT_RECONCILIATION_CONTROLLER_KAZI.md -->

* **Model Output Is Never the Verdict:** An agent's self-reported "done" message is treated strictly as diagnostic input, never as proof of completion. Live or deployment predicates must never pass based on an agent assertion alone.
* **Focused Failure Context on Repair Turns:** When dispatching an inner repair agent, supply only the approved goal contract and actionable failure evidence from the latest observation—not the entire historical conversation transcript.
* **Two-Tier Criterion Drafting (Proposal Only):** Support using a stronger frontier model to draft structured acceptance predicate proposals from user intent, while treating generated criteria strictly as **proposals** requiring schema validation and human/policy approval before execution.
* **Vercel AI SDK + Temporal Integration Rules:** Never execute raw LLM or network calls directly inside deterministic workflow code. Either wrap AI SDK calls inside explicit Temporal Activities or use `@temporalio/vercel-ai-sdk` (`AiSdkPlugin` / `temporalProvider`) with `@temporalio/workflow-streams` (`WorkflowStream`) and consumer-ack signaling so streaming deltas do not race workflow completion.

### Synchronous Guardrails vs. Asynchronous Evals & AI SDK Telemetry
<!-- Source: incoming/AGENT_EVALS.md -->

* **Strict Hot-Path vs. Off-Path Separation:** Execute only fast, synchronous safety guardrails (PII/secret redaction, prompt-injection detection, schema validation) inline on the active inference path. Offload heavy LLM-as-a-judge faithfulness and completion scoring to asynchronous background workers so user response latency is unaffected.
* **Mandatory Vercel AI SDK Telemetry Hook:** Enable `experimental_telemetry` with OpenTelemetry GenAI semantic conventions on all `generateText` and `streamText` calls so inputs, tool-call trajectories, and token metrics emit structured spans for both offline replay and online sampling.

### Resource-Based Run Budgets Over Sequence Limits
<!-- Source: incoming/CODING_STANDARDS.md (Section A.3) -->

* **Never Cap Runs by Sequence Number (`seq`):** Event sequence numbers (`seq`) must be used strictly for monotonic event ordering and stream resumption—never as a heuristic cap to terminate an agent run.
* **Enforce Explicit Resource & Execution Budgets:** Prevent infinite loops and resource exhaustion inside the worker harness by monitoring concrete execution constraints: wall-clock `timeoutMs`, cumulative `maxTotalTokens`, and maximum tool invocation counts.

### Local Per-Model Cooldowns in `ModelExecutor`
<!-- Source: incoming/CODING_STANDARDS.md (Section B.1) -->

* **Per-`modelRef` Failure Throttling:** Implement retry classification, exponential backoff, and local failure-count-throttled cooldown windows per `modelRef` directly inside `ModelExecutor` (driven by `hardening.maxRetries` and `hardening.retryBackoffMs`) to prevent cascading retries when an upstream LLM provider degrades.

### `ModelExecutor` Fault-Injection Seams
<!-- Source: incoming/CODING_STANDARDS.md (Section D.2) -->

* **Injectable Provider Fault Modes:** `ModelExecutor` must support injecting simulated upstream `429` rate limits, `timeoutMs` timeouts, and malformed structured outputs during integration tests to verify retry classification, per-`modelRef` cooldowns, and accurate `maxTotalTokens` accounting.

### LLM Gateway Startup Readiness Ping
<!-- Source: incoming/CODING_STANDARDS.md (Section G.1) -->

* **Gateway Connectivity Check:** The inference runtime adapter must expose a lightweight readiness/auth inquiry ping (without burning inference tokens) so startup probes can verify upstream LLM gateway reachability and API key validity at boot.

### `ModelExecutor` Outbound Egress Redaction Gate
<!-- Source: incoming/CODING_STANDARDS.md (Section H.2) -->

* **Pre-Dispatch `RedactionPolicy` Enforcement:** `ModelExecutor` must pass every outbound prompt, message history array, and tool-output payload through the active `RedactionPolicy` (key and value regex sweep) *immediately before* invoking the underlying Vercel AI SDK provider adapter, guaranteeing raw secrets, PII, or PHI never reach external model APIs.

### Scoped Repair Dispatch Inputs (P2)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P2 - Bounded outer loop and honest stop reasons) -->

* **Actionable Failure Context Only:** On repair iterations, the inner agent workflow must receive only the goal contract and actionable failure diagnostics from the latest predicate observation—preventing context bloat from prior failed turns.
* **Zero Self-Declared Convergence:** The reasoning runtime must return candidate artifacts and diagnostic notes to the outer controller, never a self-certified `converged` status.

### Operational Action Events Over Raw Chain-of-Thought Exposure (P8)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P8 - Live supervision and durable intervention points) -->

* **Auditable Milestones, Not Private Model Reasoning:** Live progress events emitted during inference must report structured operational facts (phase transitions, tools invoked, arguments/results post-redaction, verification verdicts, and clarification questions)—never streaming raw private model reasoning/chain-of-thought text as a substitute for an auditable action log.

### Context Window Reconstruction from Compaction Checkpoints (P15)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P15 - Long-session context compaction and restoration) -->

* **Checkpoint-Driven Prompt Assembly on Resume:** When resuming a long-running session whose raw message transcript exceeds the model's context budget, assemble the inference prompt from the latest versioned session compaction checkpoint plus explicitly fetched authorized source records/artifacts rather than resending the entire raw conversation history.

### Abstract Model Tiers & Turn-Level Tool Interception
<!-- Source: incoming/TEMPORAL_BRIDGE.md -->

* **Semantic Model Tiers (`fast` | `smart` | `premium`):** Allow agent definitions to declare abstract capability tiers (`fast`, `smart`, `premium`) resolved dynamically at runtime to concrete configured `modelRef` providers rather than hardcoding vendor model IDs inside workflow code.
* **Intercept Tool Calls Before Execution:** Configure single-turn inference steps (`maxSteps: 1`) when running inside governed workflows so proposed `toolCalls` are returned to the orchestrator for RBAC, provider allow-list, and human-approval checks prior to invoking tool executors.

### Strip `context`-Provenance Fields from LLM-Exposed Tool Schemas
<!-- Source: incoming/TOOLS_EXPLANATIONS.md (Section 1.5) -->

* **Hide Gateway-Injected Slots from Model Tool Signatures:** When projecting registered tools into Vercel AI SDK tool definitions for the LLM, omit or lock parameters marked with `context` provenance so the model only generates `model` and `constrained` fields, reducing token overhead and hardening against indirect prompt injection.

### Multi-Layered Tool-Loop Detection, Stall Reflection & Post-Compaction Guards

<!-- Source: incoming/WRITING_AN_AGENT.md (Section 1: Cascading Errors and Infinite Loops) -->

Hard step limits and static timeouts alone cannot prevent an agent from mutating arguments slightly or repeating failing calls across context compactions. The reasoning runtime enforces layered loop and stall controls tracked in durable workflow state:

1. **Rolling Tool-Call Ring Buffer (`historySize: 30`):**
   - Normalize and hash every tool invocation into `(toolName, argsHash)` before execution and hash its output into `resultHash` afterward (stripping volatile fields such as timestamps, request IDs, and nonces).
   - **Specialized Detectors:**
     - `genericRepeat`: Tracks repeated `(toolName, argsHash)` calls without state progress; injects a reflection warning at `10` calls and trips a hard block at `20`.
     - `knownPollNoProgress`: Detects polling tools whose `resultHash` remains unchanged across consecutive polls.
     - `pingPong`: Detects strictly alternating `A -> B -> A -> B` two-signature cycles at the tail of the buffer.
     - `unknownToolThreshold` (`10`): Counts hallucinated/unregistered tool names and hard-blocks further attempts after 10 misses.
     - **Identical-Error Guard:** Immediately blocks exact `(tool, args, error)` triples after `3` consecutive identical failures.
     - **Global Circuit Breaker (`30`):** Terminates the run if total non-progressing loop signals reach 30.
2. **Post-Compaction Repeat Guard:**
   - Because context summarization can erase an agent's memory of prior failed attempts, arm a post-compaction guard that immediately aborts the run if the agent repeats a pre-compaction `(tool, args, result)` triple.
3. **Semantic-Stall Reflection & Pre-Compaction Memory Flush:**
   - **Warning-First Reflection:** On a `warning` threshold or identical-error trigger, inject a structured system/tool observation instructing the model to stop repeating the failing call and adopt a materially different strategy before escalating to hard termination.
   - **Semantic-Stall Threshold:** Enforce a wall-clock + step stall ceiling (minimum 5 minutes and `3x` the warning threshold without forward state change).
   - **Pre-Compaction Flush:** Before compacting history near the context window limit, execute a silent reflection step that persists durable discoveries to **Mem0** (never local disk files) so critical facts survive history summarization.
4. **Constructive Policy Denial Feedback:**
   - When a pre-execution hook or RBAC check denies a tool call, return the denial as a structured, non-fatal tool observation so the model can replan rather than crashing the workflow.

### Step-Level Telemetry Hooks & Context Snapshot Emission
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 2: Opaque Failure Points) -->

`ModelExecutor` instruments every Vercel AI SDK generation and tool-execution cycle through unified OpenTelemetry hooks (`experimental_telemetry`) bridged to Langfuse:

- **Span Granularity:** Emit distinct child spans for context assembly (Mem0 + RAG retrieval), LLM inference (`thinking` + `toolCall` emission), and each `toolResult` execution, recording prompt/completion token counts, latency (`duration_ms`), and model ID.
- **Pre-Egress Scrubbing:** Wrap telemetry span attributes and input/output recorders in the platform egress redaction pipeline so raw secrets or unmasked sensitive fields never enter trace payloads.
- **Retrieval & Context Window Auditing:** Emit a context-window diff span on every turn detailing retrieved catalog/memory items and any compaction events, enabling deterministic replay and root-cause attribution across prompt, retrieval, or tool layers.

### Indirect Prompt Injection Containment: Dual-LLM Quarantine & Boundary Sanitization
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 4: Prompt Injection) -->

Because Backstage agents ingest developer- and third-party-authored artifacts (`catalog-info.yaml` annotations, TechDocs Markdown, GitHub issues/PRs, Jira tickets, pod logs, stack traces), prompt injection is treated as an architectural containment problem rather than a prompt-only guardrail:

1. **Quarantined "Reader" Sub-Agents (Dual-LLM Pattern):**
   - Never grant a single agent turn both **untrusted external read access** (arbitrary URLs, issues, raw container logs) and **privileged write capabilities** (Scaffolder, Kubernetes mutations, secret operations).
   - Delegate ingestion of untrusted external text to a locked-down, tool-free **Extractor / Reader** model turn that parses content strictly into a validated **Zod JSON schema** before passing only structured fields to the primary **Planner** agent.
2. **Pre-Wrap Input Stripping & Randomized Cryptographic Delimiters:**
   - Before injecting external artifacts into the prompt stream, strip invisible Unicode characters (zero-width spaces, bidirectional overrides) and HTML comments (`<!-- ... -->`).
   - Wrap sanitized external payloads inside **per-turn cryptographically randomized XML boundary tags** (e.g., `<external_data_9f8a2b1c source="github:issue">...</external_data_9f8a2b1c>`) with a system directive treating tag contents strictly as passive data—preventing attackers from forging closing tags inside hostile documents.
3. **Assistant Output Exfiltration Sanitization:**
   - Scrub model text outputs before persistence or SSE streaming to strip external Markdown image tags (`![...](https://...)`) and non-allowlisted URLs that could be abused as query-string data-exfiltration beacons.

### Latency & Token Cost Optimization: Model Tiering, Prompt Caching & Deterministic Bypasses
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 5: Latency and Token Costs) -->

Multi-step IDP agents incur most of their latency and token cost from oversized tool payloads and redundant LLM calls rather than planning alone. `ModelExecutor` enforces four structural optimizations:

1. **Role-Based Model Tiering & Ordered Fallback Chains:**
   - Assign explicit model profiles per execution role rather than routing every step to a frontier model:
     - **Frontier Reasoning Tier:** Primary multi-step planning, complex synthesis, and recovery turns.
     - **Fast / Low-Cost Tier:** Quarantined "Reader/Extractor" schema parsing, classification, pre-compaction summarization, and Mem0 fact extraction.
   - Configure ordered provider fallback chains per tier inside `ModelExecutor` to absorb transient rate limits (`429`) or regional outages automatically.
2. **Static-Prefix Prompt Layout for Provider Prompt Caching:**
   - Assemble prompts in strict immutability order so provider prompt caches (Anthropic, OpenAI, Vertex AI) hit across multi-step turns:
     1. **Immutable Prefix:** System instructions, domain rules, entity schemas, and deterministically sorted tool definitions (zero dynamic timestamps or nonces in this block).
     2. **Dynamic Suffix:** Retrieved Mem0/RAG context, current conversation history, and latest tool observations.
3. **Context Compaction & Stale Tool-Result Pruning:**
   - Track cumulative token usage against configurable high-water marks; prune superseded intermediate tool results and trigger summary compaction (after the pre-compaction Mem0 reflection flush) to prevent quadratic token growth.
4. **Deterministic Bypass Over Small LLMs:**
   - Never invoke an LLM for deterministic data transformations, JSON filtering, or structured lookups. Execute TypeScript transforms, JSONPath projections, or native Backstage Catalog REST filters (`filter=kind=Component,spec.owner=...`) directly in code.

### Progressive Skill Disclosure, Cache-Safe Hydration & Sub-Agent Encapsulation
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 9: On-Demand Skill Loading) -->

`ModelExecutor` avoids injecting dozens of SOPs and JSON tool schemas upfront by using a two-stage progressive disclosure lifecycle:

1. **Session-Snapshotted Compact Skill Index:**
   - At workflow start, the runtime snapshots the caller's eligible skills (sorted deterministically by `skillId`) into a compact `<available_skills>` registry containing only `skillId`, one-line `summary`, and `applicableEntityKinds`.
   - This snapshot is persisted in Temporal workflow state (preserving deterministic replay) and placed inside the **immutable system prompt prefix** so provider prompt caches remain warm across turns.
2. **Just-In-Time `activate_skill(skillId)` Hydration:**
   - When a task matches an indexed skill, the model invokes `activate_skill(skillId)` (never raw local file-read tools).
   - The runtime appends the skill's full Markdown SOP to the **dynamic conversation suffix** (avoiding mid-session cache invalidation) and dynamically activates that skill's scoped JSON tool schemas for subsequent turns in the run.
3. **Sub-Agent Skill Encapsulation:**
   - Heavy multi-step diagnostic skills (`executionMode: 'subagent'`, e.g., multi-step Kubernetes crash-loop triage) run inside an isolated sub-agent turn with its own bounded context window, returning only a validated structured summary to the primary orchestrator.

### Hot Working Memory Pruning (`experimental_prepareStep`) & Pre-Compaction Flush
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 10: Cross-Session Memory Hygiene) -->

`ModelExecutor` actively bounds active context growth on every iteration of the Vercel AI SDK reasoning loop:

- **Step-Level Pruning (`experimental_prepareStep`):** Before each model invocation, `prepareStep` compacts or replaces superseded verbose tool outputs from earlier steps with concise summaries and `ArtifactSink` references, preventing quadratic token growth.
- **Pre-Compaction Memory Flush Hook:** Before compacting history or triggering Temporal `Continue-As-New`, `ModelExecutor` runs a silent reflection pass to emit structured, Zod-validated candidate facts for async persistence into Mem0 (subject to workflow taint write-gates).

### Tool-Output Secret & Entropy Scrubbing Middleware
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 12: Secret Isolation) -->

Even when outbound API credentials are isolated in a Token Broker, an agent reading repository files, Kubernetes `ConfigMap` manifests, or stack traces can encounter accidental plaintext secrets:

- **Pre-Context Redaction Gate:** Wrap every tool execution return path with a deterministic secret scanner combining curated regex patterns (AWS keys, GitHub PATs, JWTs, private keys, connection strings) and high-entropy token detection (Gitleaks rules).
- **Mask Before Context & Telemetry Ingestion:** Replace matched secrets with `[REDACTED:<ruleId>]` *before* the `toolResult` enters Vercel AI SDK's `messages` history or emits to OpenTelemetry/Langfuse, preventing prompt injections from reading or exfiltrating accidental secrets found in workspace data.

### Isolated Supervisor / Guardrail Auto-Reviewer (`generateObject`)
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 13: Approval Fatigue vs. Autonomy) -->

For Tier 2 (`WRITE_LOW`) actions in untainted runs, `ModelExecutor` invokes a fast, isolated Supervisor model pass via Vercel AI SDK `generateObject` constrained by a strict Zod verdict schema (`{ decision: 'APPROVE' | 'ESCALATE_HUMAN' | 'DENY', reason: string, riskFlags: string[] }`):

- **Context Quarantine for the Judge:** Feed the Supervisor **only** the verified user intent, the proposed capability name, the normalized arguments / `dryRun` diff, and deterministic policy rules. Strip all raw untrusted external text (web pages, issue bodies, pod logs) from the Supervisor's prompt so indirect prompt injections cannot manipulate the judge's verdict.
- **Fail-Closed Escalation:** Any `ESCALATE_HUMAN` verdict, schema parse failure, or timeout automatically promotes the action to a Tier 3 human HITL gate.

### Single-Step `ModelExecutor` Contract (`maxSteps: 1`)
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 14: Crash Recovery and State Durability) -->

`ModelExecutor` operates strictly as a **stateless, single-turn reasoning step (`maxSteps: 1`)** invoked by Temporal's `llmStepActivity`:

- **No Internal Multi-Step Tool Loops:** `ModelExecutor` does not execute autonomous multi-step `while` loops in worker memory. It accepts the compacted message history and active tool schemas for the current turn, emits either `toolCalls` or final `text` (plus token usage and telemetry), and returns control to Temporal so every tool invocation is durably checkpointed.

### Two-Stage Triage-to-Frontier Model Escalation
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 15: Idle Token Burn) -->

When a deterministic gatekeeper detects a potential anomaly (such as a non-zero CI exit code or Kubernetes crash-loop alert), `ModelExecutor` avoids defaulting immediately to frontier reasoning models:

- **Stage 1 — Fast Structured Triage (`generateObject`):** Route the projected anomaly payload first to a low-cost, low-latency triage model constrained by a strict Zod classification schema (`{ category: 'KNOWN_FLAKE' | 'TRANSIENT_INFRA' | 'ACTIONABLE_INCIDENT', confidence: number, summary: string }`).
- **Stage 2 — Frontier Reasoning Escalation:** Invoke the frontier planning/reasoning model only when Stage 1 confirms a genuine, novel incident or multi-step remediation task with confidence above threshold; suppress or log known transient flakes deterministically.

### Schema-Guided Web Extraction & Browser Snapshot Sanitization
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 17: UI Drift and DOM Bloat) -->

To prevent dense enterprise UIs from causing context rot or indirect prompt injections in the primary reasoning loop:

- **Zod-Constrained Schema Extraction (`extract`):** When pulling structured state from a webpage or dashboard table, run a quarantined fast Reader/Extractor model pass constrained by a strict **Zod** schema so only validated target fields enter the primary Planner's conversation history.
- **Tainting, Secret Redaction & Randomized Boundary Delimiters:** Every browser snapshot automatically marks the workflow run `tainted = true`, passes through the regex + entropy secret redactor (masking any visible credentials/tokens on screen before LLM or OpenTelemetry ingestion), and is wrapped in per-turn cryptographically randomized XML boundary tags (`<external_data_<randomHex> source="browser:snapshot">`).

### Model Endpoint Cooldown Rotation & Structured Replanning Observations
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 18: API Rate Limits and Partial Failures) -->

`ModelExecutor` insulates the reasoning loop from transient LLM provider throttling and mid-chain tool failures:

- **Endpoint Cooldown & Ordered Failover:** When an LLM provider returns `429` or `5xx`, `ModelExecutor` places that provider/key profile into a timed cooldown in Redis (honoring `Retry-After` headers) and fails over immediately to the next configured endpoint in the role's ordered fallback chain.
- **Structured Partial-Failure Observations:** When a non-retryable tool error or Saga rollback occurs, `ModelExecutor` injects a clean, structured error observation containing the `completedMutations[]` ledger so the model can select an alternative path or explain the exact partial state accurately without hallucinating success.

### Minimal Auto-Injection & Agent-Driven Historical Pull Tools
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 20: Retrieval Noise) -->

To prevent past incident logs from polluting routine scaffolding or catalog-lookup turns:

- **Targeted Startup Auto-Injection:** At turn start, auto-inject only high-confidence, caller-scoped `user_explicit` preferences (formatting, IaC dialect, verbosity) within a tight token cap.
- **On-Demand Pull Capabilities (`search_service_history`, `read_techdocs_slice`):** Expose historical incident memories and TechDocs sections as explicit agent tools so `ModelExecutor` pulls deep troubleshooting history only when the active task requires historical diagnostics.

### Sub-Agent Clean Context Windows, Anti-Sprawl Policy & Structured Output Contracts
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 22: Sub-Agent Delegation and Context Isolation) -->

`ModelExecutor` prevents context rot and "sub-agent sprawl" by enforcing strict delegation boundaries:

- **Single-Loop Anti-Sprawl Heuristic:** Keep simple sequential 1–3 step workflows inside the primary reasoning loop via progressive skill loading. Delegate to a sub-agent only when a task ingests `> 10,000` tokens of raw artifacts (multi-file diffs, pod logs, TechDocs trees), requires parallel fan-out, or needs an isolated read-only tool profile.
- **Clean Context Initialization:** Sub-agents boot with a clean system prompt containing only the delegated task brief and scoped tool definitions—omitting parent chat clutter and general user preferences.
- **Mandatory Zod Return Schema (`generateObject`):** Sub-agents never return unstructured walls of prose to the parent loop. The final step of every sub-agent serializes findings through a strict **Zod** schema (e.g., `{ rootCause, confidence, affectedEntities, recommendedAction }`) so the parent receives compact, deterministic facts.

### Reasoning Trace Governance & Progressive Step Streaming
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 23: Streaming and Latency Perception) -->

- **Scrubbed Delta Streaming:** `ModelExecutor` emits token deltas and step milestones through the pre-egress redaction filter as they are generated rather than buffering until full turn completion.
- **Chain-of-Thought (`thinking`) Exposure Controls:** Raw extended reasoning blocks are excluded from Slack/Teams egress entirely and collapsed by default in the Backstage UI (or suppressed in regulated HIPAA/FINRA workspaces where internal reasoning traces are restricted to `AuditLogSink`).

### Ambiguity Containment: Read-First Grounding, Confidence Gate & `ask_clarification`
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 24: Ambiguity and Over-Eagerness) -->

To prevent over-eager agents from guessing production targets, wrong templates, or incorrect owners before launching expensive multi-step runs:

1. **Deterministic Read-First Context Grounding:**
   - Before prompting the user, ground the turn with active Backstage UI route context (`currentEntityRef`, `namespace`, `kind`), the caller's owned entities (`spec.owner`), and top `user_explicit` Mem0 preferences so the agent never asks lazy questions Backstage already answers.
   - When multiple candidate entities or templates exist, execute a fast, read-only RBAC-filtered Catalog lookup first and present **2–4 concrete options** rather than open-ended prompts.
2. **Intent-Confidence & Blast-Radius Routing Gate:**
   - **High Confidence + `READ`:** Execute immediately without prompting.
   - **Medium Confidence + `READ`:** Execute the most likely read query and surface a one-click pivot suggestion (e.g., *"Showing staging logs—switch to production?"*).
   - **Low Confidence OR Any Mutating Action (`WRITE_LOW` / `WRITE_HIGH`):** Require explicit confirmation of critical parameters (target environment, repository, owner group) via `ask_clarification` before invoking mutating tools or sub-agents.
3. **First-Class `ask_clarification` Tool Contract:**
   - Expose a typed `ask_clarification` tool validated by **Zod** (`{ question: string, options?: Array<{ id: string, label: string, description?: string }>, blockingReason: string, allowFreeText?: boolean }`) that yields control deterministically to Temporal.

### Model-Agnostic Failover Router, Redis Circuit Breakers & Transcript Normalization
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 25: Model Lock-In and Fallback Routing) -->

To keep workflows resilient during single-vendor outages without corrupting multi-step conversation state or violating compliance boundaries, `ModelExecutor` wraps Vercel AI SDK's provider registry (`createProviderRegistry`) with a policy-aware failover router:

1. **Capability-Matched Logical Model Tiers:**
   - Workflows bind to logical capability tiers (`reasoning-tier`, `balanced-tier`, `fast-triage-tier`) rather than hardcoded vendor IDs. Every fallback entry within a tier is verified to support strict structured outputs (`generateObject` + Zod) and parallel tool calling.
2. **Two-Stage Failover & Redis Sliding-Window Circuit Breakers:**
   - **Intra-Provider Profile Rotation First:** Rotate across configured enterprise endpoints/keys within the primary provider first (with timed exponential cooldowns on `429` / quota errors) to preserve provider prompt-cache warmth.
   - **Fast Redis Circuit Breaker:** Track provider error rates over a 30-second sliding window in Redis; if `5xx`/`429` failures exceed `50%`, trip the circuit to `OPEN` and route immediately to the next compliant fallback model without waiting through slow exponential backoffs.
   - **Context-Overflow Distinction:** Route `context_length_exceeded` errors to immediate context compaction rather than tripping provider health circuits.
3. **Cross-Provider Transcript Sanitizer Middleware:**
   - Whenever a turn executes on a different provider than earlier steps in the Temporal history, sanitize `messages` deterministically before inference: strip vendor-specific `thinking` / `thoughtSignature` metadata blocks, normalize system/developer role mappings, and rewrite `toolCallId` values to portable `<= 40`-char alphanumeric identifiers.

### Structured Urgency Classification & Digest Correlation Summarization
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 28: Notification Fatigue and False Alarms) -->

- **Mandatory Pre-Notification `generateObject` Triage:** Proactive reasoning runs must emit a strict **Zod**-validated urgency classification (`{ tier: 'SILENT' | 'DIGEST' | 'ACTIONABLE' | 'CRITICAL', fingerprintKey: string, summary: string, recommendedAction?: string }`) before invoking any notification capability; `SILENT` verdicts short-circuit immediately without calling outbound notification tools.
- **Batch Digest Synthesis:** When the Temporal Aggregator Workflow flushes a multi-alert batch window, `ModelExecutor` runs a single structured summarization pass to group correlated service failures by root cause rather than emitting N separate messages.

### Multi-Party `NO_REPLY` Conversational Yielding
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 29: Multi-Party and Group Chat Etiquette) -->

- **Silent `NO_REPLY` / `skip_response` Turn Termination:** Inside active `SHARED_CHANNEL` threads, if the triage or primary model determines that participants are conversing directly with each other (`@alice what do you think?`) and no agent action is warranted, `ModelExecutor` emits a `NO_REPLY` sentinel so Temporal terminates the turn silently without posting an intrusive message.

### Zero-Mental-Date-Math Policy: Temporal Anchors & Deterministic Date Utilities
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 30: Time, Timezone, and Recurrence Math) -->

LLMs must never compute relative dates, Daylight Saving Time (DST) transitions, or cron recurrence epochs via mental reasoning:

1. **Dynamic-Suffix Temporal Anchor (Cache-Safe):**
   - Inject the exact `utcNow` ISO-8601 timestamp, `dayOfWeek`, and resolved caller IANA timezone (e.g., `America/New_York`, defaulting to `UTC` in `SHARED_CHANNEL` sessions) in the **dynamic per-turn suffix** via `experimental_prepareStep`—keeping the static system/tool prefix immutable for provider prompt caching.
2. **Deterministic `resolve_datetime` & `parse_schedule` Tools:**
   - Expose zero-LLM TypeScript utility tools backed by **`luxon`** and **`cron-parser` / `rrule`** that convert relative expressions (*"next Monday at 9am"*, *"last 48 hours"*, *"every weekday at 8:30am"*) into validated ISO-8601 offset timestamps, Unix epochs, normalized 5-field cron strings, and human-readable echoes.
3. **Strict Zod Offset & IANA Schema Enforcement:**
   - All time-bound capability schemas enforce `z.string().datetime({ offset: true })` and valid IANA timezones (`Intl.supportedValuesOf('timeZone')`). Naive timestamps without offsets or ambiguous abbreviations (`EST`/`PST`) fail validation immediately and instruct the model to invoke `resolve_datetime`.

### Evidence-Backed Completion Gate & Anti-Sycophancy Rules
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 31: Sycophancy and Hallucinated Completion) -->

- **Deterministic `verificationArtifacts` Cross-Check:** Terminal completion (`report_completion` / `generateObject`) requires structured `verificationArtifacts` (live URLs, commit SHAs, `entityRef`s, diff checksums). `ModelExecutor` cross-checks every cited artifact against the run's `VERIFIED` `toolResult` ledger—rejecting completion claims that cite unverified or hallucinated identifiers.
- **Anti-Sycophancy Behavioral Directive:** System instructions mandate pushing back directly on `[SYSTEM FACT CONFLICT]` findings and flawed technical premises rather than offering empty agreement.

### Cooperative `AbortSignal` Streaming & Steering Message Injection
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 35: Interrupting an Active Run Safely) -->

- **Immediate Upstream Stream Termination:** `ModelExecutor` forwards the Temporal Activity's `cancellationSignal` directly into Vercel AI SDK (`generateText({ abortSignal })` / `streamText({ abortSignal })`), halting token generation and billing immediately upon user abort.
- **Step-Boundary Steering & Valid Transcript Invariants:** Buffered `steerSignal` messages are appended as user turns before the next `ModelExecutor` step, and `ModelExecutor` validates that every `assistant` tool-call turn has matching `toolResult` entries (including synthetic `CANCELLED_BY_USER` markers) prior to provider serialization.

### Hybrid `local-private` Model Tier Routing
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 38: Local vs. Cloud Capability Routing) -->

- **Workstation GPU / Ollama Tier (`local-private`):** When a developer's Local Companion CLI advertises a local inference endpoint (e.g., Ollama) and tenant policy permits, `ModelRegistry` exposes a `local-private` tier for analyzing sensitive uncommitted local diffs on-device, falling back to compliant enterprise cloud endpoints (`Bedrock`, `Vertex AI`, `Azure OpenAI`) when offline.

### Commitment, Legal & Negotiation Policy Guardrail
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 43: Liability and Impersonation Boundaries) -->

- **Forbidden Commitment Classifier:** Pair tool-level domain restrictions with a deterministic guardrail check that blocks the model from issuing contractual commitments, SLA guarantees, financial approvals, or security attestations—immediately yielding control to the human session owner whenever vendor negotiation or legal representation intent is detected.

### Quarantined Attachment Extraction & Mandatory Taint Promotion
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 44: Malicious File & Media Payloads) -->

- **Dual-LLM Attachment Quarantine:** Never pass raw extracted document text or re-encoded images directly to a Planner turn holding `WRITE` capabilities. Route sanitized attachment outputs first through a tool-free **Reader / Extractor** turn (`generateObject` + Zod schema), wrap the structured summary in per-turn randomized XML delimiters (`<external_data_<randomHex> source="attachment:...">`), and mark the active workflow `tainted = true` so any subsequent state mutation requires Tier 3 human HITL approval.

### Voice-Optimized Concise Output Mode
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 46: Voice, Audio, and Real-Time Interruption) -->

- **Spoken vs. Visual Dual-Channel Formatting:** When `channelSurface === 'voice'`, `ModelExecutor` constrains spoken text responses to **1–3 concise, natural sentences** (omitting Markdown tables, raw stack traces, and 40-character commit hashes) while emitting structured visual cards out-of-band to the Backstage UI / Slack stream.

### Model-Generation Migration Governance & Model-Family Prompt Compiler
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 47: Prompt and Skill Decay Across Model Generations) -->

Model upgrades frequently cause newer reasoning generations to over-interpret legacy negative constraints (`CRITICAL: DO NOT...`) or verbose CoT scaffolding tuned for older models. `ModelExecutor` decouples domain instructions from model-generation quirks:

1. **Banned Floating `*-latest` Model Aliases:**
   - Production `ModelRegistry` routes must map logical tiers (`reasoning-tier`, `balanced-tier`, `fast-triage-tier`) strictly to **pinned, immutable model snapshot IDs** or pinned cloud deployment IDs (Bedrock, Azure OpenAI, Vertex AI)—never floating `*-latest` aliases.
2. **Model-Family Prompt Compiler:**
   - Keep `SKILL.md` runbooks free of vendor-specific formatting hacks. A runtime **Prompt Compiler** wraps clean domain instructions according to the resolved model family's capability profile:
     - *Native Reasoning Models (o-series / extended thinking):* Strip manual step-by-step CoT templates and rely on concise goal + constraint framing.
     - *Standard / Fast-Triage Models:* Inject structured step decomposition and strict schema guidance.
3. **Session-Pinned `modelGenerationProfile`:**
   - Pin the resolved `modelGenerationProfile` at workflow start so multi-day suspended runs complete using the prompt/model generation they started with.

### Mandatory Blast-Radius Grounding Before Infrastructure Actions
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 49: Backstage Catalog Graph & Entity-Context Grounding ("The IDP World Model")) -->

- **Pre-Mutation Topology Hydration:** Whenever a workflow targets a Backstage Catalog entity for incident triage or any state-mutating action (`WRITE_LOW` / `WRITE_HIGH`), the runtime grounds the turn with `get_entity_neighborhood` first so the Planner accounts for upstream dependencies, downstream consumers, and `spec.lifecycle` constraints (e.g., recognizing that restarting `Resource:db-orders` impacts three downstream `Component` services) before proposing actions.

### Catalog-Annotation-Driven Sovereign & ZDR Model Routing
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 50: Multi-Tenant Data Residency & Enterprise AI Governance (Zero Data Retention / Sovereign Routing)) -->

`ModelRegistry` resolves target LLM, embedding, and reranker endpoints dynamically from Backstage Software Catalog governance annotations (`compliance.company.io/data-classification`, `compliance.company.io/residency`, `compliance.company.io/frameworks` such as `HIPAA`, `FINRA`, `PCI-DSS`, `EU-GDPR`, `FedRAMP`):

- **Highest-Watermark Policy Computation:** When a workflow interacts with multiple entities (e.g., via `get_entity_neighborhood`), compute the strictest union across all touched `System`, `Domain`, and `Component` annotations (`restricted` > `confidential` > `internal`, plus mandatory regional pinning such as `eu-central-1`).
- **ZDR & Regional Endpoint Filtering:** Restrict `restricted` or regulated entities exclusively to Zero-Data-Retention (ZDR) contracted regional enterprise endpoints (e.g., EU AWS Bedrock, EU Google Vertex AI, Azure OpenAI sovereign regions) or VPC-hosted vLLM instances.
- **Fail-Closed Outage Behavior:** If no compliant, healthy endpoint exists in the required region/ZDR tier during a provider outage, fail closed with `ComplianceRoutingUnavailableError`—never failing over across sovereign borders or to non-ZDR endpoints.

### Programmatic Three-Layer Prompt Builder & Cache-Boundary Architecture
<!-- Source: incoming/OPENCLAW_PROMPT_BUILDER.md (Sections: The Three-Layer Assembly Pipeline, Prompt Modes, Workspace File Injection, TypeScript Modules in Prompt Builder) -->

Rather than maintaining brittle monolithic prompt strings, `ModelExecutor` compiles system prompts programmatically through a deterministic three-layer pipeline:

1. **Three-Layer Assembly Pipeline:**
   - **Layer 1 — Runtime Context Adapter (Temporal Activity Fact Gathering):** Collects live, RBAC-filtered turn inputs outside the renderer—granted tool descriptors, active sandbox boundaries, channel surface capabilities (`backstage-ui` | `slack` | `teams` | `voice` | `cli`), `visibilityScope` (`DIRECT_PRIVATE` | `SHARED_CHANNEL`), active Backstage entity context, and retrieved Mem0/Catalog snippets.
   - **Layer 2 — Configuration Facade (`buildConfiguredAgentSystemPrompt`):** Applies agent- and tenant-resolved settings (persona/operating manual spec, `delegationMode`, voice conciseness rules, compliance classification tags, and `promptMode`).
   - **Layer 3 — Pure Deterministic Renderer (`buildAgentSystemPrompt`):** A side-effect-free pure function (zero filesystem I/O, network calls, or wall-clock reads) that composes modular section builders (`string[]` producers) into the final prompt structure.
2. **Three-Tier Prompt Verbosity Modes (`full` | `minimal` | `none`):**
   - **`full`:** Primary interactive user sessions; includes all applicable safety, execution bias, care, tooling, skill index, memory recall, delegation, channel presentation, and agent persona/project context sections.
   - **`minimal`:** Background sub-agents (`promptMode: 'minimal'`) and automated trigger runs; strips persona/style files, personal memory recall, channel formatting, and silent-reply rules—retaining only Core Identity, Safety, Care, Tooling, Skills (if supplied), Sandbox, and Delegated Task Context.
   - **`none`:** Ultra-lightweight single-step utility classifiers (`generateObject` triage/extractors); retains only the base identity and schema contract.
3. **Cache-Boundary Partitioning & Bounded Context Injection:**
   - **Above the Prompt Cache Boundary (Immutable Prefix):** Core Identity, Safety invariants, Execution Bias & Care rules, Agent Operating Manual/Persona, and deterministically sorted Tool/Skill declarations—kept byte-identical across turns to maximize Anthropic/OpenAI/Vertex prompt cache hits.
   - **Below the Prompt Cache Boundary (Dynamic Turn Suffix):** Volatile per-turn facts (`utcNow`, caller IANA timezone, active sub-agent/sandbox status, `SHARED_CHANNEL` vs. `DIRECT_PRIVATE` rules, and retrieved Mem0/Catalog context) delivered in a typed dynamic runtime-context carrier so day rollovers or dynamic context refreshes never invalidate cached prefixes.
   - **Hard Injection Ceilings & Prompt Composition Report:** Cap individual injected context documents at `20,000` characters and total injected context at `60,000` characters (emitting an explicit truncation notice when clipped), and generate a structured per-run prompt report tracking section token/character overhead.
4. **Runtime-Enforced Security Over Prose Refusals:**
   - Prompt modules never instruct the model to pre-refuse available tools or invent configuration remedies; `CapabilityGateway` RBAC, sandboxing, and HITL gates enforce risk deterministically at execution time, while the **Care** module instructs the model to explain blocks factually with verified recovery paths.

### Vercel AI SDK Primitive Mapping & Capability Matrix
<!-- Source: incoming/TOOLS_VERCEL_AI_SDK.md (Sections: Capabilities of Supported Models, The Standard tools Object) -->

`ModelExecutor` standardizes on four core Vercel AI SDK (`ai`) primitives while decoupling LLM inference from durable tool execution:

- **Primitive Mapping:**
  - **`generateText` / `streamText` (`maxSteps: 1`):** Used for single-turn reasoning and progressive token/tool-call delta streaming (`text-delta`, `tool-call-streaming-start`, `tool-call-delta`) into the run's Redis Stream for real-time UI progress rendering.
  - **`generateObject` / `streamObject`:** Used for strict Zod-enforced structured outputs across Tier 2 Supervisor auto-reviewers, Stage 1 triage classifiers, Quarantined Reader extractors, and terminal `report_completion` / urgency verdicts—eliminating fragile JSON string parsing.
- **Schema-Only `tool()` Registration (Zero Inline `execute` in `llmStepActivity`):**
  - Inside `llmStepActivity`, `CapabilityDescriptor` definitions compile to schema-only Vercel AI SDK `tool({ description, parameters })` entries **without** inline `execute` functions. `ModelExecutor` returns the validated `toolCalls` array to Temporal so every tool invocation runs as an isolated, durable `toolExecutionActivity` through `CapabilityGateway`.
- **Registry Capability Verification:**
  - `ModelRegistry` validates that every endpoint registered in `reasoning-tier`, `balanced-tier`, and `fast-triage-tier` supports native structured outputs (`generateObject`) and tool calling before admission.

### Prompt-Cache-Safe Mem0 Injection, Turn Sanitization & Three-Stage Failover
<!-- Source: incoming/PI_AGENT.md (Sections: Agent Loop, Step 2: Affects of Mem0, Step 3: Auth Profile Rotation & Failover) -->

Adapting the runtime mechanics of `pi-agent-core` and `@mem0/pi-agent-plugin` into our stateless Vercel AI SDK + Temporal execution loop establishes four invariants:

1. **Prompt-Cache-Safe Pre-Turn Memory Injection (`searchThreshold >= 0.3`):**
   - Never mutate the static system prompt prefix to inject per-turn Mem0 recall results (which invalidates provider prompt caches). Instead, insert retrieved memories scoring `>= 0.3`—wrapped in per-turn randomized `<external_data_...>` boundary delimiters—as a synthetic context message immediately preceding the current user turn.
2. **Turn-Ordering Sanitization & Internal Thinking Stripping:**
   - Before invoking `ModelExecutor`, normalize message history to enforce strict alternating user/assistant turn pairing and matched `toolCallId` -> `toolResult` sequences required by Anthropic and Gemini APIs.
   - Strip internal `<thinking>` / reasoning blocks in the stream subscriber before forwarding `text-delta` events to end-user chat surfaces (while preserving sanitized reasoning telemetry in OTel/Langfuse).
3. **Three-Stage LLM Failover (Compliance- & Pin-Aware):**
   - **Stage 0 (Bounded Same-Endpoint Recovery):** Retry transient network/rate blips on the active endpoint with jitter.
   - **Stage 1 (Same-Provider Endpoint / Credential Pool Rotation):** Rotate across healthy regional endpoints/profiles for the same provider via KMS/Broker runtime key injection, placing failing profiles in exponential-backoff cooldown.
   - **Stage 2 (Cross-Provider Fallback):** Step to the next compliant model tier only after primary provider profiles are exhausted—**unless** `strictModelPin` is enabled for the session or no ZDR/residency-compliant fallback exists (fail closed).

### Stateful Markdown-Aware Tag Stripping & Surface-Adaptive Delta Coalescing
<!-- Source: incoming/PI_AGENT.md (Section: Step 5 (Stream Reply): Events, Tag Stripping & Delta Chunking) -->

Because reasoning and open-weight models often emit inline `<think>...</think>` or `<final>...</final>` tags inside normal token deltas—and chat platforms rate-limit message edits—the egress stream subscriber processes `ModelExecutor` events through a two-stage pipeline:

1. **Markdown-Aware Stateful Block-Tag Stripper:**
   - Maintain a stateful streaming parser across incoming `text-delta` chunks that tracks open fenced code blocks (`````) and inline backticks.
   - Suppress `<think>...</think>` internal monologue (and buffer until `<final>` when `enforceFinalTag` is active) **only outside Markdown code regions**, preserving literal `<think>` tags inside code examples verbatim.
2. **Surface-Adaptive Structural & Temporal Delta Coalescing:**
   - **Backstage Web Drawer (SSE):** Forward sanitized `text-delta`, `tool-call-start`, and `tool-call-result` events immediately via Redis Streams (`idleMs: 0`) for low-latency rendering.
   - **Rate-Limited Chat Surfaces (Slack / Microsoft Teams):** Route deltas through a **fence-safe structural chunker** (splitting on paragraph boundaries `\n\n` while tracking open Markdown code fences so code blocks are never torn across messages) paired with a **temporal coalescer** (`minChars`, `maxChars`, `idleMs`) to balance perceived responsiveness against API rate limits.

### Hierarchical Model Resolution, Cross-Provider Context Handoff & Cluster Cooldowns
<!-- Source: incoming/PI_AGENT.md (Section: Model Selection and Failover) -->

Adapting the `pi-ai` + `runWithModelFallback` design onto the Vercel AI SDK establishes four deterministic routing and resilience rules:

1. **Hierarchical Model Resolution (Compliance-Filtered):**
   - Resolve the active model per turn using strict precedence:
     1. **Explicit Session Model Pin** (`strictModelPin: true`—disables automatic fallback unless cleared by the user).
     2. **Workflow Step / Sub-Agent Tier Override** (e.g., `fast-triage-tier` for classifiers/readers, `reasoning-tier` for complex planning).
     3. **Primary Default + Ordered Fallback Chain**, pre-filtered against the run's highest-watermark Backstage Catalog compliance requirements (`residency`, `zdrApproved`, `frameworks`).
2. **Cross-Provider Context Handoff Normalization (`transformMessages`):**
   - When failing over mid-conversation across model families (e.g., Anthropic Claude -> OpenAI GPT -> Google Gemini), normalize the message transcript before dispatch—stripping provider-specific thinking signatures or converting reasoning blocks into plain context text so fallback APIs never reject historical turns with schema `400` errors.
3. **Error Taxonomy (`FailoverError` vs. Compaction vs. Abort):**
   - **Failover-Eligible (`FailoverError`):** `429` rate limits, `500/503/529` provider overload, network timeouts, `401/403` credential errors, and `402` quota exhaustion.
   - **Context-Window Overflow (`400` Prompt Too Long):** Do **not** switch models; trigger emergency `SessionStore` history compaction and retry on the active model.
   - **Caller Cancellation (`AbortError`):** Abort immediately without failover.
4. **Cluster-Shared Redis Profile Cooldowns (`Profiles × Models`):**
   - Track endpoint/profile health in Redis (never local pod files like `auth-profiles.json`) so all worker replicas share cooldown state: rotate across healthy endpoints within the primary provider first (`1m -> 5m -> 25m -> 1h` exponential backoff on `429`/`5xx`; `5h -> 24h` disablement on `401/402/403`), advancing to the next compliant fallback model only when all primary endpoints are in cooldown.

### Progressive `<available_skills>` Disclosure & 70/20 Head/Tail Context Truncation
<!-- Source: incoming/PI_AGENT.md (Section: System Prompt Construction) -->

- **Progressive Skill Disclosure (`<available_skills>` XML Index):**
  - Rather than dumping every `SKILL.md` runbook into the system prompt upfront, `buildAgentSystemPrompt` injects a compact `<available_skills>` XML index listing only `{ skillId, name, description }` for RBAC-eligible skills.
  - When a task matches a skill, the model invokes the schema-validated `load_skill({ skillId })` capability to hydrate the SHA-256 pinned `SKILL.md` instructions on demand—never exposing pod filesystem paths or raw `read` tool access.
- **70% Head / 20% Tail Truncation Split:**
  - When an individual injected context artifact exceeds the `20,000`-character cap, trim it using a **70% head / 20% tail split** with an explicit `[... TRUNCATED: omitted N chars ...]` marker in the middle so both opening headers/invariants and closing summaries/schemas remain intact within the `60,000`-character total budget.

### Provider Wire-Format Normalization for `toolResult` Payloads
<!-- Source: incoming/PI_AGENT.md (Section: Why OpenClaw Also Normalizes Return Payloads) -->

- **Cross-Provider `toolResult` Wire Hygiene:** Before dispatching conversation history to Anthropic, OpenAI, or Google Gemini, `ModelExecutor` verifies that every `toolResult` message has a non-empty content block, a provider-valid `toolCallId` format, and only allowlisted media MIME types—preventing mid-run `400` API errors caused by empty or malformed tool responses.

### Vercel AI SDK `tool()` Contract: Omitted `execute` & `toModelOutput` Separation
<!-- Source: incoming/PI_AGENT.md (Section: Vercel AI SDK Tool Handling) -->

- **Deliberate Omission of `execute` in `llmStepActivity`:** Compile eligible `CapabilityDescriptor` entries into Vercel AI SDK `tool({ description, inputSchema })` definitions **with `execute` omitted** (and without `ToolLoopAgent` multi-step in-process loops). Calling `generateText` / `streamText` halts immediately after emitting structured `toolCalls`, returning control to the Temporal Workflow so every invocation undergoes RBAC, HITL approval, and durable `toolExecutionActivity` execution.
- **Model vs. UI Output Projection (`toModelOutput` / `llmContent` vs. `uiDetails`):** When reconstructing `tool` messages for subsequent LLM turns, pass only the bounded, DLP-scrubbed `llmContent` summary (`toModelOutput`), while streaming rich structured `uiDetails` directly to the Backstage UI drawer via Redis Streams without inflating prompt token counts.

### Temporal-Driven Step Hooks (`prepareStep` / `onStepFinish`) & Deterministic `repairToolCall`
<!-- Source: incoming/PI_AGENT.md (Sections: How the Multi-Step Execution Loop Works, Lifecycle Hooks & Dynamic Loop Control, Error Handling & Repair, How Vercel AI SDK Compares to Pi for a Backstage Plugin) -->

To combine Vercel AI SDK's React-friendly streaming primitives with Temporal's multi-day crash resilience, the Temporal Workflow owns the outer step loop while each `llmStepActivity` executes a single `streamText` turn (`stopWhen: stepCountIs(1)`):

1. **Temporal-Orchestrated `prepareStep` & `onStepFinish` Semantics:**
   - **Pre-Step (`prepareStep`):** Before each `llmStepActivity`, the workflow resolves the step's active model tier, prunes/compacts message history to budget, and filters `activeTools` (progressive capability disclosure).
   - **Post-Step (`onStepFinish`):** Upon step completion, record exact prompt/completion token usage and USD cost in `RunStore` (enforcing FinOps budget circuit breakers) and append the assistant/tool entries to the directed-tree `SessionStore`.
2. **Deterministic `repairToolCall` (Zero Unbudgeted Secondary LLM Calls):**
   - Intercept malformed tool-call JSON prior to Zod validation using a **pure deterministic repair pass** (stripping Markdown ```json fences, fixing trailing commas, and coercing stringified primitives). Never invoke an unbudgeted secondary LLM inside `repairToolCall`; if deterministic repair fails, return a sanitized `ValidationError` `toolResult` (capped at `<= 2` retries per turn).
3. **Durable `needsApproval` Projection:**
   - Rather than holding an in-memory HTTP connection open via SDK-local `needsApproval`, `CapabilityGateway` routes `WRITE_HIGH` tool calls through Temporal's durable HITL pause (`AWAITING_APPROVAL`) and emits a typed `tool-approval-request` UI stream event so the Backstage React drawer renders interactive approval cards across page reloads and pod restarts.

### Single-Runtime Standardization: Vercel AI SDK (`ai`) Without `pi-ai` Duplication
<!-- Source: incoming/PI_AGENT.md (Sections: Does Vercel AI SDK Accept TypeBox?, Vercel AI SDK vs. Pi: Full Footprint Comparison & Overlap, Would it make sense to use the two together?) -->

- **Unified Backend LLM SDK (`ai` + `@ai-sdk/*`):** Standardize exclusively on the Vercel AI SDK (`ai` and modular `@ai-sdk/*` provider packages) inside Temporal `llmStepActivity` workers—avoiding duplicate `pi-ai` abstractions while leveraging built-in `embed`, `Output.object()` structured generation, `jsonSchema()` projection support, and native `experimental_telemetry` OpenTelemetry spans.
- **Ported Behavioral Invariants:** Preserve Pi/OpenClaw's highest-value mechanics inside our Temporal + PostgreSQL + Redis orchestration layer (`steering` vs. `followUp` signals, directed-tree `SessionStore`, prompt-cache-safe Mem0 injection, `<available_skills>` progressive disclosure, and fence-aware delta coalescing) without introducing dual `Model` or `Message` hierarchies.

### Per-Turn Deterministic Prompt Reassembly (`MemoryManager`)
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md (Sections: How to evolve RAG into a memory system, Why basic RAG stops short of stateful AI) -->

- **Structured Prompt Reassembly Over Unbounded Transcript Accumulation:** On every turn, `MemoryManager` reconstructs a bounded prompt context from typed sources—injecting exact-matched Policy & Preference rules, top-$k$ Fact/Episodic slices, and a compacted recent-turn window—preventing token inflation and "lost-in-the-middle" degradation across multi-day conversations.

### Turn Context Assembly & Token-Budgeted Slot Allocation
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md -->

Before invoking the `ModelExecutor` on each reasoning turn, the Memory Manager assembles retrieved memory slices into the prompt context under a strict token budget:

* **Reserved Unconditional Slots (Loaded First):** Allocate fixed, guaranteed prompt budget for active tenant **Policies** and user **Preferences**. These are small, deterministic, and required for compliance and behavioral alignment on every turn.
* **Bounded Ranked Slots (Filled Until Budget Exhausted):** Populate remaining budget with score-ranked **Facts**, **Episodic** summaries, and **Recent Activity**, enforcing a per-item max-token cap and top-$k$ ceiling.
* **Recency Ordering:** Place recent turn context and active session activity last in the assembled prompt block (closest to the generation boundary) to maximize attention weight.
* **Drop-Over-Truncate Compaction:** When the token budget is exceeded, drop entire lowest-ranked/least-recent items (e.g., oldest episodes) rather than truncating records mid-payload, preserving structural integrity and provenance boundaries.

### Stateless Per-Turn Prompt Reassembly
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md (Sections: How do you add memory to an AI agent) -->

The reasoning runtime must **not** monotonically accumulate raw conversation transcripts across turns:

* **Prompt as Reconstruction:** On every reasoning turn, the runtime reconstructs the context window cleanly from: (1) active tenant **Policies**, (2) user **Preferences**, (3) top-$k$ retrieved **Facts**, (4) relevant **Episodic** patterns, and (5) a bounded summary of recent session activity.
* **Constant-Bound Token Growth:** Raw transcripts remain stored as source material in `Trace` memory, while active prompt token consumption stays bounded and flat regardless of total session turn length.

### Model Tier Separation: Reasoning LLM vs. Mem0 Extraction LLM
<!-- Source: incoming/MEM0.md (Sections: What Mem0 Does with its Configured LLM) -->

The reasoning runtime decouples user-facing inference from background memory synthesis:

* **Primary Reasoning Model (`ModelExecutor`):** Uses high-capability frontier models (e.g., Claude 3.5/3.7 Sonnet, GPT-4o) inside Temporal activities to execute tool calls, enforce guardrails, and generate user-facing responses.
* **Background Extraction Model (Mem0's Internal Pipeline):** With self-hosted OSS, Mem0 uses the configured LLM and embedder; the managed Platform API runs its own provider stack. In either mode, extraction output is limited to memory candidates and is never streamed directly to end users. Platform-owned repair or reasoning calls continue through `ModelExecutor`.

### Pre-Inference Memory Context Injection & Guardrail Sequence
<!-- Source: incoming/MEM0.md (Sections: Architecture for Vercel AI SDK & Temporal) -->

When executing a streaming or synchronous reasoning turn via the Vercel AI SDK (`streamText` / `generateText`):

1. **Authenticated Scope Resolution:** Derive `tenantId` and `userId` from the verified Backstage execution context—never from untrusted client JSON payloads.
2. **Parallel Type-Aware Retrieval:** Fetch deterministic policies/preferences alongside scoped semantic facts/episodes, rather than relying on a single unfiltered vector search across all categories.
3. **Egress Guardrail Check:** Pass retrieved memory snippets through runtime safety filters before formatting them into the `ModelExecutor` system prompt.
4. **Provider Abstraction:** Invoke models through `ModelExecutor` (never direct provider SDK constructors like `openai('gpt-4o')` in route handlers) so egress redaction, fallback routing, and token telemetry apply uniformly.

### ModelExecutor Routing for Background Memory Repair
<!-- Source: incoming/MEM0.md (Sections: Implementing Platform Features in Open Source Version) -->

Background memory self-healing prompts must never instantiate provider SDKs (`new OpenAI(...)`) or read `process.env` API keys directly:

* **Unified Execution:** Repair activities invoke `ModelExecutor` with a low-temperature (`0.1`) structured schema output (`DELETE` vs. corrected canonical assertion) using a fast, cost-efficient model tier.
* **Egress & Safety Protection:** Routing repair inference through `ModelExecutor` ensures conversation context passed to the repair prompt undergoes standard egress PII/PHI redaction and emits token/cost telemetry.

### Vercel AI SDK Telemetry Hook (`experimental_telemetry`)
<!-- Source: incoming/LLM_OBSERVABILITY_WITH_LANGFUSE.md (Sections: How Langfuse Integrates with Your Stack) -->

Inside `llmStepActivity`, `ModelExecutor` wires `@langfuse/vercel-ai` into `generateText` / `streamText` via `experimental_telemetry`:

* **Automatic Generation Capture:** Captures model ID, resolved prompt version, input/output token counts, latency, finish reason, and emitted `toolCalls` as child spans under the Temporal root trace.
* **Mem0 Context Span Wrapping:** Memory retrieval (`MemoryManager` / Mem0 search) runs as a sibling or parent OpenTelemetry span alongside the LLM generation span so operators can audit which retrieved facts, preferences, and episodes influenced each model step.

### Real-Time Streaming Quota Enforcement & Rolling Redaction
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .addStreamingStep(name, handler, options?)) -->

When `ModelExecutor` executes `ctx.ai.streamText` or `ctx.ai.streamObject`:

* **Mid-Stream Token Quota Enforcement:** Token counters increment on every streamed chunk against `.configureThrottling()` / tenant TPM budgets. If a generation loops or breaches its token ceiling mid-stream, `ModelExecutor` aborts the underlying `AbortController` immediately and raises `QuotaExhaustionException` for error-recovery routing.
* **Sliding-Window Egress Redaction:** Outbound stream chunks pass through a sliding-window PII/PHI/secret filter before emission so sensitive patterns split across consecutive token boundaries are masked before reaching the client stream.

### Rate-Card Token Metering & Mid-Stream Budget Cutoff in `ModelExecutor`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureFinOps(config)) -->

* **Rate-Card Calculation:** After every `generateText`, `streamText`, or `generateObject` call, `ModelExecutor` multiplies reported `promptTokens` and `completionTokens` against the platform's centrally maintained model rate card to compute exact USD cost.
* **Mid-Stream Ceiling Enforcement:** During `.addStreamingStep()` calls, `ModelExecutor` tracks incremental output token cost against the workflow's remaining budget headroom and aborts generation immediately if the active call alone would breach `maxWorkflowBudget`.

### Reversible PII / PHI Tokenization Proxy in `ModelExecutor`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureCompliance(config)) -->

When `dataRedaction.enabled` is active on the workflow or tenant policy, `ModelExecutor` wraps every `generateText`, `streamText`, and `generateStructuredObject` call in a **local reversible tokenization proxy**:

1. **Pre-Egress Tokenization:** High-precision regex and local NER detectors replace matched entities (names, SSNs, MRNs, account/card numbers) with deterministic session-scoped placeholders (`[REDACTED_PHI_01]`, `[REDACTED_SSN_02]`) *before* any payload leaves the corporate network perimeter.
2. **Ephemeral Mapping Scope:** The placeholder-to-plaintext lookup table lives strictly inside ephemeral memory for that single `llmStepActivity` invocation and is zeroed out immediately upon activity exit—never written to Temporal history or Langfuse traces.
3. **Post-Inference Detokenization:** Once the external LLM returns its text or structured JSON response referencing the opaque tokens, `ModelExecutor` re-hydrates the original values inside the trusted worker boundary before returning the result to the step handler.

### Distributed TPM Token-Bucket Enforcement in `ModelExecutor`
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: .configureThrottling(config)) -->

* **Pre-Call Reservation & Post-Call Reconciliation:** Before dispatching an LLM request, `ModelExecutor` estimates prompt tokens and acquires capacity from the workflow/tenant `maxLLMTokensPerMinute` token bucket (pausing until window replenishment if exhausted), then reconciles actual `promptTokens + completionTokens` reported by the Vercel AI SDK upon completion.

### Voice Input Pipeline: Two-Step Transcription Before RAG & LLM Execution
<!-- Source: incoming/AUDIO_PROMPTS_AND_TRANSCRIPTION.md (Sections: Transcription with Models — The Standard Two-Step Pipeline, The Real-Time Alternative: Streaming Transcription, Summary of Architectural Trade-offs) -->

To allow engineers to speak to the platform without sacrificing prompt interception, RAG grounding, egress redaction, or auditability, voice inputs must use a **two-step transcription-then-generation pipeline** rather than single-step audio-to-text multimodal calls:

* **Step 1 — Dedicated Speech-to-Text (`transcribe` / `experimental_streamTranscribe`):**
  * **Batch / Turn-Complete Mode:** Convert completed speech turns into text using the Vercel AI SDK `transcribe()` API (`model: openai.transcription('whisper-1')` or gateway-routed equivalent) before entering the agent reasoning loop.
  * **Low-Latency Streaming Mode (AI SDK 7):** Stream audio chunks via `experimental_streamTranscribe` so partial transcripts materialize incrementally while the engineer speaks, allowing RAG retrieval and guardrails to trigger immediately upon utterance completion.
* **Step 2 — Intercept, Ground, Redact & Execute:**
  * Once converted to a standard text prompt (`userPromptText`), the runtime runs the standard deterministic pre-flight pipeline: egress/PII redaction, Mem0 + Backstage Catalog RAG retrieval, context compaction, and `ModelExecutor` (`generateText` / `streamText`).
  * Single-step multimodal audio-in/text-out is restricted to non-agentic, low-risk dictation tasks where dynamic RAG injection and prompt-level safety/compliance auditing are not required.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
1. **No Direct Provider Instantiation or Filesystem Audio Reads in Runtime:** The incoming prototype calls `openai.transcription('whisper-1')` with `fs.readFileSync('./data/galileo.mp3')`. In production, transcription model routing must go through the governed `ModelExecutor` / AI Gateway provider registry (enforcing Zero Data Retention and BAA/compliance allowlists) and operate on in-memory bounded buffers or signed `ArtifactSink` streams—never local disk paths.
2. **Legacy `system` Option Renamed to `instructions`:** The prototype passes `system: ...` to `generateText()`. Per AI SDK 7 standards, use `instructions` for system-level behavioral framing and keep retrieved RAG documents isolated in structured context blocks rather than raw string interpolation.

### Pre-Wire Egress Filtering & Event Suppression Hooks
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Real-Time Telemetry & Egress Filters (EventBroker)) -->

* **Egress Transformation & Suppression:** Runtime telemetry and token/step deltas pass through an ordered egress pipeline prior to SSE streaming. Platform-level PII/PHI/credential scrubbers run first, followed by workflow-scoped transformer hooks that can redact domain fields or return `null` to suppress internal-only events from reaching the UI wire.

### Agent Loop Lifecycle Hooks, Pre-Compaction Memory Flush & Model Fallback Resilience
<!-- Source: incoming/OPENCLAW_LESSONS.md (Section: OpenClaw Lessons Worth Applying to a Backstage IDP Platform) -->

To support long-horizon, multi-day IDP workflows reliably without losing critical operational context or failing on transient LLM throttling, the reasoning runtime incorporates three architectural patterns adapted from OpenClaw:

* **Pre-Compaction Memory Flush Hooks:**
  * Before context window compaction compresses or truncates an active transcript, the runtime executes a deterministic/structured **pre-compaction extraction hook** that flushes durable operational facts—incident timelines, provisioned resource IDs, catalog entity refs, and human approval decisions—into persistent storage (Mem0 / `CheckpointStore`) so critical state survives multi-day compression cycles.
* **Explicit Reasoning Lifecycle Hooks Outside the Core Runner:**
  * The runtime exposes typed, ordered extension hooks around the Vercel AI SDK execution loop rather than hard-coding cross-cutting concerns inside the core runner:
    * `before_model_resolve` — Applies dynamic model routing, compliance allowlist filtering, and budget tier selection.
    * `before_prompt_build` — Injects Backstage Catalog entity context, Mem0 memories, and executes mandatory pre-egress PII/PHI redaction.
    * `before_tool_call` / `after_tool_call` — Enforces `CapabilityGateway` policy checks, argument/result scrubbing, and structured audit emission.
    * `agent_end` — Flushes final telemetry spans, FinOps accounting records, and post-run memory consolidation.
* **Auth Profile Rotation & Governed Model Fallbacks (`ModelExecutor`):**
  * Inside the Temporal LLM activity layer, `ModelExecutor` catches provider rate-limit (`429`), transient `5xx`, and credential exhaustion errors to rotate across configured auth profiles or fail over to approved secondary models automatically.
  * **Compliance Reconciliation:** Automatic model fallbacks must remain strictly constrained to the tenant's **approved compliance model allowlist** (e.g., never failing over from a HIPAA BAA / Zero-Data-Retention endpoint to a non-compliant consumer endpoint).

### Declarative, Priority-Budgeted Prompt Compilation (`@vscode/prompt-tsx` Pattern)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 1: Declarative, Priority-Budgeted Prompt Rendering (@vscode/prompt-tsx)) -->

Rather than concatenating raw strings or static Markdown files, the agent reasoning runtime compiles prompts through a **declarative, priority-budgeted layout tree** modeled on VS Code Copilot Chat's `@vscode/prompt-tsx` architecture:

* **Token-Aware Prompt Flexbox (`priority`, `flexGrow`, `flexReserve`):**
  * Every prompt segment—system instructions, compliance guardrails, active tool schemas, Backstage Catalog entity metadata, retrieved Mem0 facts, conversation history, and raw tool outputs—is modeled as a weighted node in a prompt tree with explicit `priority` rank and token allocation budgets (`flexGrow` / `flexReserve`).
  * At render time, the compiler measures token counts against the resolved target model's context window (minus reserved output/reasoning tokens) and deterministically prunes or truncates lowest-priority nodes first.
* **IDP Operational Log Protection:**
  * Verbose operational artifacts (e.g., Kubernetes pod logs, Terraform plan diffs, stack traces) are assigned lower retention priority and bounded token caps so a single noisy tool response never overflows the model context window or evicts invariant system guardrails, user instructions, or core Backstage Catalog entity metadata (`catalog-info.yaml` ownership, lifecycle, and dependency graph).

### Dynamic Tool Schema Hydration via `prepareStep`
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 2: Embedding-Guided Virtual Tool Clustering) -->

* **Token-Lean Toolset Binding:** Rather than binding 80+ flat tool definitions on every `generateText` / `streamText` call, the reasoning runtime binds only pre-activated capability clusters plus lightweight virtual group stubs at turn start, using Vercel AI SDK 7's `prepareStep` hook to expand additional virtual tool groups on demand when requested by the model.

### Model-Family-Specific Prompt Adaptation & Cache Breakpoint Alignment
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 3: Model-Family-Specific Prompt Adaptation) -->

Because the Backstage platform routes heterogeneous workloads across model tiers—for example, fast/low-cost models for routine Software Catalog lookups versus frontier reasoning models for multi-step infrastructure remediation—the declarative prompt compiler decouples logical prompt content from **provider/model-family rendering adapters** (modeled on VS Code Copilot Chat's `anthropicPrompts.tsx` vs. OpenAI-targeted prompt trees):

* **Model-Family Rendering Branches:**
  * **Anthropic (Claude) Adapter:** Renders context sections inside structured XML-delimited tags (e.g., ``, `<retrieved_memories>`, `<tool_output>`), attaches explicit grounding/anti-hallucination guardrails around retrieved files and entity specs, and places explicit Anthropic prompt-cache breakpoints (`cacheControl`) on stable system/catalog prefixes.
  * **OpenAI / Reasoning-Model Adapter:** Formats developer/system instructions (`instructions`), tool-use guidance, and top-level Vercel AI SDK 7 `reasoning` effort budgets (`low` | `medium` | `high`) tailored to OpenAI reasoning models without redundant XML wrappers that waste tokens or conflict with native reasoning tokens.
* **Post-Resolution Rendering (`before_model_resolve` -> `before_prompt_build`):**
  * Prompt rendering executes **after** `ModelExecutor` resolves the concrete target model (including any compliance-approved fallback model), ensuring structural formatting, tokenizer counting, and prompt-cache breakpoints always match the actual wire provider.

### Progressive Disclosure: Lazy Agent Skills (`SKILL.md`) & Entity-Scoped Instructions
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 4: Lazy "Agent Skills" & Glob-Scoped Instructions) -->

To avoid paying a high baseline token tax from eagerly injecting every organizational runbook and domain rule on every turn, the prompt compiler uses **progressive disclosure** modeled on VS Code Copilot Chat's `.instructions.md` (`applyTo` globs) and on-demand `SKILL.md` skills:

* **Lightweight Skill Stubs (`SKILL.md` Registry):**
  * Specialized procedural runbooks are registered in the prompt context initially as compact metadata stubs (`skillId`, `name`, `description`, `applicableEntityKinds`, `fileGlobs`).
  * Full procedural instructions are lazily hydrated into the prompt tree only when the workflow targets a matching Backstage entity (`Component`, `Resource`, `System`, `API`), operates on matching file paths/globs (e.g., `**/*.sql`, `terraform/**`), or explicitly activates the skill during reasoning.
* **Catalog-Annotation-Driven Skill Binding:**
  * Entity-specific operational runbooks are bound via Backstage Software Catalog annotations—such as standard `backstage.io/techdocs-ref` / `backstage.io/techdocs-entity` pointers or custom `agent.io/skills` annotations—and fetched lazily during `before_prompt_build` only when that entity is in the active workflow scope.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
1. **Treat Entity-Sourced `SKILL.md` & TechDocs as Untrusted Data (Prompt-Injection Boundary):** Because `catalog-info.yaml` annotations and repository `SKILL.md` files can be edited by arbitrary repo contributors, lazily loaded skills must **never** be concatenated into the privileged `instructions` (system) role. Render them inside delimited, lower-trust data blocks (``), enforce strict token/byte ceilings, and run prompt-injection/secret scanning before prompt assembly.
2. **Annotation Key Compliance:** Custom annotation keys (e.g., `agent.io/skills`) must strictly follow Backstage's DNS-prefixed metadata naming rules (`[a-z0-9.-]+/[a-zA-Z0-9._-]+`, max 63-char name segment).

### Structured, Schema-Enforced Context Compaction (`summarizer.ts` Pattern)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 6: Structured, Intent-Focused Compaction (summarizer.ts)) -->

Rather than compressing long conversation transcripts into free-form prose summaries that drift or retain stale troubleshooting loops, the reasoning runtime combines **pre-compaction durable memory flushing** with **strictly typed, intent-focused working-state compaction** (modeled on VS Code Copilot Chat's `summarizer.ts`):

* **Two-Phase Compaction Sequence:**
  1. **Phase 1 — Pre-Compaction Memory Flush:** Extracts durable operational facts (provisioned resource IDs, incident timelines, verified entity refs, human approval outcomes) into persistent storage (Mem0 / `CheckpointStore`).
  2. **Phase 2 — Schema-Validated Working-State Summary (`generateObject` / `Output.object`):** Compresses the active transcript into a strict Zod-validated working-memory structure containing:
     * `USER_INTENT` — Core objective and target catalog entity/system scope.
     * `TASK_DESCRIPTION` — Active execution plan, constraints, and compliance tier.
     * `EXISTING` — Completed steps, verified discoveries, and confirmed current state.
     * `PENDING` — Remaining actions, open approval gates, and unresolved blockers.
     * `CODE_STATE` / `INFRA_STATE` — Modified files, PR/commit refs, Terraform/Kubernetes state deltas, or configuration diffs.
     * `RELEVANT_SNIPPETS` — Minimal, exact log lines, error codes, or identifiers required for upcoming steps.
* **Dead-End Pruning & Latest-Decision Precedence:**
  * The compaction prompt explicitly instructs the summarizer model to **discard superseded hypotheses, failed retry loops, and obsolete tool outputs**, prioritizing the most recent verified decisions so the agent does not re-enter resolved failure loops.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
1. **Treat Transcript Tool Outputs as Untrusted Input During Summarization:** Because raw tool outputs in the transcript may contain prompt-injection strings from external repositories or logs, run the compaction model with strict system framing (`instructions`) treating the transcript purely as passive data, and run PII/PHI/Secret redaction over the resulting structured summary before persisting to `SessionStore` or `CheckpointStore`.
2. **Preserve Audit & Approval Provenance References:** Compaction must never strip cryptographic approval token hashes, `runId`, or `AuditLogSink` event IDs from `EXISTING` / `PENDING` state.

### Noise-Filtering Distillation Subagents (`execution_subagent` Pattern)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 7: Noise-Filtering Execution Subagents (execution_subagent)) -->

To prevent high-volume operational telemetry—such as multi-hundred-line Kubernetes pod logs, ArgoCD sync diffs, CI build traces, or Terraform plan outputs—from polluting the primary orchestrator's context window, noisy diagnostic capabilities are wrapped in **scoped distillation subagents** (modeled on VS Code Copilot Chat's `execution_subagent`):

* **Isolated Context Execution & Signal Distillation:**
  * Instead of returning raw multi-kilobyte API/CLI payloads directly into the parent agent's message history, the parent invokes a distillation capability (`k8s_log_investigator`, `terraform_plan_analyzer`, `argocd_sync_inspector`).
  * The distillation subagent executes the multi-step diagnostic queries inside an **isolated child context window** (typically using a fast, economical model tier), filters out repetitive boilerplate, and returns a compact, schema-validated **Root-Cause Distillation Summary** (`status`, `primaryError`, `affectedResources`, `keyLogLines`, `rawArtifactRef`) to the parent orchestrator.
* **Prompt-level Delegation Guidance:**
  * Parent orchestrator instructions explicitly direct the model to prefer distillation subagents over raw bulk log/state dumps whenever inspecting large operational outputs.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
1. **Strict Read-Only & Monotonic Privilege Narrowing:** Unlike general shell execution, IDP distillation subagents must declare an explicit **read-only** `CapabilityDescriptor` allowlist (`Global -> Tenant -> PermissionsService -> Workflow -> Subagent`), enforce hard step/token/timeout ceilings (`maxSteps`, `maxTokens`, `stepMs`), and never spawn recursive subagents (`maxSubagentDepth = 1`).
2. **Untrusted Log Sandboxing & Pre-Return Redaction:** Raw logs ingested by a distillation subagent may contain adversarial strings (log injection / prompt injection) or sensitive PII/PHI/secrets. Frame ingested logs inside non-system `<raw_telemetry trust="untrusted">` blocks during distillation and pass the returned summary through the platform's PII/PHI/Secret scrubber before injecting it into the parent orchestrator's context.

### Per-Turn Prompt Rebuilding & Live State Slot Deduplication
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 8: Per-Turn Prompt Rebuilding Over Append-Only History) -->

Rather than relying on a purely append-only `messages[]` array where stale JSON snapshots of Kubernetes pods, GitHub checks, or Backstage Catalog entities accumulate across turns, the reasoning runtime **rebuilds the prompt tree from live state on every iteration** of the tool-calling loop (`prepareStep` in AI SDK 7):

* **Dedicated Refreshed State Slots:**
  * Dynamic operational context—active Backstage Software Catalog entity specs/annotations, live deployment rollout status, CI check states, and open incident severity—is bound to **named, replaceable state slots** in the declarative prompt tree rather than appended repeatedly as historical messages.
  * On every turn, the prompt compiler hydrates the latest snapshot into the active state slot and **deduplicates or supersedes** earlier snapshots of the same resource key (`entityRef`, `deploymentId`, `prRef`), ensuring the model never acts on three-turn-old infrastructure state.
* **Prompt-Cache Prefix Preservation:**
  * Place invariant system instructions, compliance rules, and active tool cluster schemas in the **static prefix** (preserving provider prompt-cache hits) while placing refreshed live state slots immediately after the cached prefix boundary so freshness does not invalidate the entire prompt cache on every step.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
1. **Temporal Activity Boundary & Replay Snapshotting:** In Temporal-backed workflows, live state refreshes (fetching updated Catalog entities or deployment status) must execute **inside Temporal activities** (never directly inside deterministic workflow replay functions) and record the resolved state hash/snapshot in `CheckpointStore` / `AuditLogSink` so post-incident replays know the exact state the model observed on turn $N$.
2. **RBAC & Redaction on Every Refresh:** Each per-turn state refresh must re-apply PII/PHI/Secret redaction and verify that the initiating `principalRef` still holds read access to the refreshed Backstage entity or deployment resource.

### Deterministic Loop-Control Guardrails & Programmable Stop Hooks
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 9: Loop-Control Guardrails and Stop Hooks) -->

The reasoning runtime never treats an LLM's self-reported `"done"` response as sufficient proof of task completion. Modeled on VS Code Copilot Chat's deterministic loop-control checks and programmable **Stop Hooks**, every autonomous agent loop executes external post-condition verifiers before transitioning to a completed state:

* **Exit-Gate Verification (`stopHooks` / `stopWhen`):**
  * When the model stops emitting tool calls and attempts to conclude its turn, the runtime runs all registered deterministic **Stop Hooks** for the active workflow step (e.g., validating generated `catalog-info.yaml` against Backstage Catalog entity schemas, verifying that an expected GitHub/GitLab PR exists and passes required status checks, or confirming Kubernetes rollout health).
  * If any Stop Hook fails, the runtime injects the **structured, actionable failure evidence** back into the prompt state and pushes the agent back into the reasoning loop to repair the discrepancy.
* **Bounded Outer Loop & Honest Stop Reasons:**
  * To prevent infinite repair loops or runaway FinOps spend, Stop Hook re-entry is governed by hard deterministic bounds:
    * Maximum outer repair iterations (`maxRepairIterations`, e.g., `3`) and total step/workflow elapsed time & FinOps budget ceilings.
    * **Stuck / Repeat-Failure Detection:** Hashing consecutive Stop Hook failure signatures so identical repeated failures abort early rather than burning remaining iterations.
    * **Honest Stop Reasons:** If bounds are exhausted before post-conditions pass, the runtime terminates with an explicit non-completed terminal status (`STOP_HOOK_UNSATISFIED` / `REPAIR_BUDGET_EXHAUSTED`) containing the exact failing verifier evidence—never reporting false success.

### Pre-Loop Context-Aware Intent Routing (`IIntentService` Pattern)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 10: Context-Aware Intent Routing (IIntentService) Before Loop Entry) -->

Before spinning up an expensive, multi-step autonomous reasoning loop, incoming requests pass through a lightweight **Intent & Entity Router** modeled on VS Code Copilot Chat's `IIntentService`:

* **Explicit Mentions, Slash Commands & Lightweight Classification:**
  * Parses explicit `@participant` mentions (`@catalog`, `@scaffolder`, `@ops`, `@finops`) and slash commands (`/diagnose`, `/scaffold`, `/drift-check`), falling back to a fast, low-cost classifier (or structured `Decision` call) when no explicit routing token is present.
* **Tailored Handler & Narrowed Context/Toolset Selection:**
  * **`@catalog` (Single-Turn Grounded RAG):** Routes ownership, dependency, and entity metadata queries to a single-turn Backstage Catalog + Mem0 RAG handler with read-only catalog capabilities—bypassing multi-step tool loops entirely.
  * **`@scaffolder` (Deterministic Form/Template Flow):** Routes service creation requests to a schema-guided Scaffolder parameter-extraction and validation flow with approval gates.
  * **`@ops` (Full Multi-Step Durable Agent Loop):** Routes complex incident triage and remediation requests into the full Temporal-backed multi-step reasoning harness with Stop Hooks and scoped agent handoffs.
* **Hardening Note:** Regardless of which intent fast-path is selected, the request must still execute full `httpAuth` identity extraction, `PermissionsService` authorization, PII/PHI egress redaction, and `AuditLogSink` logging—fast-path routing reduces LLM token/loop cost, never compliance or RBAC checks.

### Multi-Anchor Sliding Prompt Cache Breakpoints & Prefix Stability
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 14: Multi-Anchor Sliding Cache Breakpoints & Cache Diffing) -->

To keep multi-step IDP workflows (such as 10–15 turn incident triage) financially viable and low-latency, the Anthropic/provider prompt adapter implements **four-anchor sliding cache breakpoints** modeled on VS Code Copilot Chat:

* **Strategic 4-Breakpoint Placement (Anthropic `cacheControl` Cap):**
  1. **Anchor 1 — End of Active Tool Definitions:** Locks the deterministic capability schemas (`CapabilityDescriptor` / virtual tool cluster stubs) at the very top of the request.
  2. **Anchor 2 — End of Static System & Catalog Prefix:** Locks invariant platform `instructions`, compliance guardrails, and stable Backstage Software Catalog entity metadata (`catalog-info.yaml` ownership, relations, static specs).
  3. **Anchor 3 — Second-to-Last Cacheable Turn (Fallback Safety Net):** Acts as a rolling fallback breakpoint; if the latest turn misses cache due to a slow tool call, TTL expiration, or mid-turn steering injection, Anchor 3 still recovers a ~90%+ prefix cache hit instead of recomputing the entire conversation history.
  4. **Anchor 4 — Most Recent Cacheable Turn (Active Frontier):** Advances forward on each turn to cache the newest tool output and reasoning step.
* **Byte-Stable Prefix Ordering:**
  * Dynamic timestamps (`now`), volatile Kubernetes pod status slots, and per-turn live state refreshes are strictly placed **after** Anchor 2 (and ordered deterministically by key) so volatile fields never invalidate the static prefix cache.

### `@ai-sdk/otel` & Lifecycle Span Instrumentation
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 15: Native GenAI OpenTelemetry Span Trees (invoke_agent -> chat -> execute_tool)) -->

* **SDK-Native OTel Integration:** The `ModelExecutor` registers `@ai-sdk/otel` (`OpenTelemetry` integration) and hooks into `before_model_resolve`, `before_tool_call`, and `after_tool_call` to enrich `chat` and `execute_tool` spans with `backstage.agent.run_id`, `backstage.agent.node_id`, and `backstage.agent.tenant_id` without polluting core prompt logic.

### Read-Only Diagnostic Meta-Agent (`/troubleshoot` Runtime Profile)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 16: Built-In Self-Troubleshooting (/troubleshoot Over Session Logs)) -->

* **Zero-Mutation Diagnostic Execution:** The `/troubleshoot` agent runs as a single-turn or strictly read-only reasoning profile with zero mutating capabilities (`mutating: false`), analyzing structured execution timelines and `ErrorCode` metadata inside delimited `<execution_trace trust="internal_redacted">` blocks.

### `ModelExecutor` Throttling Failover vs. Terminal Quota Fast-Fail
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 18: Rate-Limit Velocity vs. Quota Exhaustion Classification) -->

* **In-Turn Failover Decision Tree:** Inside `ModelExecutor`, short-window velocity `429` responses immediately trigger auth-profile rotation or failover to the next model in the tenant's **compliance-approved fallback chain**. Conversely, hard billing/quota errors or policy blocks short-circuit failover and propagate a typed non-retryable error immediately.

### Deterministic Emergency Truncation Fallback (`EmergencyTruncation` Circuit Breaker)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 19: Deterministic Emergency Truncation Fallback (EmergencyTruncation / Last-Resort Dropping)) -->

Even when prompts are compiled through a priority-budgeted layout tree, tokenizer estimation drift or a sudden oversized tool return (e.g., a 200 KB `kubectl describe` dump) can push a request past a provider's hard context window. Modeled on VS Code Copilot Chat's `EmergencyTruncation` safety net, `ModelExecutor` enforces a two-tier deterministic truncation fallback:

* **Pre-Flight Token-Ceiling Circuit Breaker (`before_model_resolve` / `prepareStep`):**
  * Immediately before invoking Vercel AI SDK `generateText` / `streamText`, `ModelExecutor` validates total estimated prompt tokens against a safety-margined ceiling (`modelMaxContextTokens - reservedOutputTokens - safetyBuffer`).
  * Any individual tool-result message exceeding the per-message cap (e.g., `20,000` chars) is deterministically sliced to a **70% head / 20% tail excerpt** (preserving top-level headers/metadata and terminal error lines) with an inline truncation marker and `ArtifactSink` reference ID.
* **In-Flight `context_length_exceeded` Recovery Loop:**
  * If an LLM provider still returns a `context_length_exceeded` / prompt-too-long error, `ModelExecutor` catches it locally (bounded to max `2` deterministic shrink passes), drops or aggressively slices the largest historical `tool` messages in place—**strictly preserving** invariant system `instructions`, compliance guardrails, active tool definitions, and the user's latest turn—and retries the call.
  * If the prompt remains oversized after all historical tool payloads are stripped (i.e., the irreducible system/user frame exceeds the window), `ModelExecutor` aborts immediately with a non-retryable `CONTEXT_LIMIT_IRREDUCIBLE` error.

### Same-Turn Diagnostic Self-Correction Loops
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 21: Fuzzy Patch Matching & Diagnostic Self-Correction Loops (get_errors)) -->

* **Immediate Schema/Policy Repair Before PR Creation:** By returning inline validation diagnostics (`file`, `line`, `ruleId`, `message`) inside the write tool's response payload, the agent observes syntax, schema, or OPA policy violations on the very next step of its tool-calling loop and self-corrects in place—avoiding wasted CI cycles, broken PRs, and late outer Stop-Hook failures.

### Structured Clarification Tool (`ask_questions`) Over Ambiguous Guessing
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 22: Interactive Mid-Turn Clarification Tools (ask_questions)) -->

* **Anti-Guessing Prompt & Tool Contract:** The runtime exposes a built-in `ask_questions` tool (supporting single-select choices, multi-select options, bounded text/number inputs, and explicit approval confirmations) and instructs the model to invoke `ask_questions` whenever target environment, blast radius, or destructive parameters are ambiguous—rather than guessing defaults or exiting the multi-step workflow prematurely.

### Provider-Specific Tool JSON Schema Sanitization (`cleanToolSchemaForProvider`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 23: Strict Tool Schema Sanitization & Provider Normalization) -->

Because the Backstage platform aggregates capabilities from internal plugins, Zod-defined workflows, and third-party MCP servers—while frontier providers enforce incompatible JSON Schema subsets—`ModelExecutor` runs every active `CapabilityDescriptor` schema through a centralized **provider-specific JSON Schema normalizer** (`cleanToolSchemaForProvider`) immediately after target model resolution (`before_model_resolve`) and prior to wire transmission:

* **Provider Normalization Rules:**
  * **OpenAI Strict Mode:** Recursively sets `additionalProperties: false` on object nodes, ensures every property key appears in `required` (converting optional properties into nullable unions where supported), and strips unsupported numeric/string format keywords (`uri`, `uuid`, `minLength`, `pattern` when rejected by strict structured-output validators).
  * **Google Gemini:** Dereferences or flattens unsupported `$ref` / `$defs` and complex `oneOf` / `anyOf` combinators into Gemini-compatible flat object/enum schemas, and strips `$schema` / `default` keywords that trigger `400 INVALID_ARGUMENT` rejections.
  * **Anthropic (Claude):** Ensures top-level `input_schema` is strictly `{ type: 'object', properties, required }`, normalizes unsupported root combinators, and keeps deterministic property ordering so prompt-cache Anchor 1 (end of tool definitions) remains byte-stable across turns.
* **Runtime Zod Validation Self-Correction Loop:**
  * Because schema normalization may relax certain JSON Schema facets (such as `minLength` or `pattern`) on the wire, `CapabilityGateway` still validates the model's emitted tool arguments against the **canonical, unrelaxed Zod schema** before execution—returning structured Zod validation error feedback as a tool error message so the model self-corrects on the next turn without failing the workflow.

### First-Class In-Context Checklist State (`manage_todo_list` Tool)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 25: First-Class In-Context Todo List State (manage_todo_list)) -->

Across long, multi-step IDP workflows (10+ tool calls such as cross-cluster service migrations or multi-resource data product bootstrapping), LLMs frequently lose track of completed steps or drop edge cases. Modeled on VS Code Copilot Chat's `manage_todo_list` tool, the runtime exposes a built-in **structured workflow checklist tool** anchored directly in a dedicated, high-priority prompt state slot:

* **Strict State-Machine Invariants (`not-started` | `in-progress` | `completed`):**
  * Each checklist item carries `{ id, title, status, verificationEvidence?, updatedAt }`.
  * **Single Active Focus Rule:** The tool validator enforces that **at most one** item may be `in-progress` at any moment, keeping the model focused on sequential execution and verification rather than scattered partial edits.
  * **Verification-Before-Completion Rule:** Prompt instructions and tool schema validation require concrete verification evidence (e.g., passing `get_errors` schema check, confirmed PR URL, or healthy rollout probe) before transitioning an item from `in-progress` to `completed`.
* **Compaction & Truncation Immunity:**
  * Because `manage_todo_list` lives in a dedicated high-priority prompt state slot rather than decaying append-only message history, the active checklist survives context compaction (`summarizer.ts`) and `EmergencyTruncation` passes intact, anchoring the model against mid-run drift.

### Tier-Explicit Memory Retrieval & Storage Contracts
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 26: Three-Tier Scoped Memory (User vs. Repository vs. Session)) -->

* **Explicit Scope Routing in `before_prompt_build` & `memory.*` Tools:**
  * During `before_prompt_build`, the runtime queries **Principal Memory** (`principalRef`) and **Entity/System Memory** (`entityRef`) independently and renders them into distinct prompt slots (`<user_preferences>` vs. ``).
  * Memory write tools (`memory_remember`) require an explicit `scope: 'run' | 'entity' | 'principal'` parameter—defaulting ambiguous operational notes to `run` scratchpad scope rather than polluting persistent `entity` or `principal` memory.

### Multi-Pass Secret, Credential & PII Egress Redaction Pipeline
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 27: Multi-Pass Secret & Credential Redaction Pipeline) -->

Modeled on VS Code Copilot Chat's pre-transmission secret-scanning pass, the runtime enforces a **mandatory, non-bypassable multi-pass redaction middleware** on every tool output, retrieved document, and assembled prompt immediately before LLM API egress (`after_tool_call` + `before_prompt_build`):

* **Multi-Pass Detection & Stripping Stages:**
  1. **Envelope & Known-Canary Pass:** Strips any serialized `SecretEnvelope` markers or active Token Broker session credential values.
  2. **Structured Secret & Manifest Block Pass:** Detects and masks Kubernetes `Secret` resource `data:` / `stringData:` maps, `.env` `KEY=VALUE` assignments, PEM private key blocks, and JSON/YAML credential fields (`password`, `secret`, `token`, `apiKey`, `authorization`, `connectionString`).
  3. **High-Entropy & Pattern Signature Pass:** Scans unstructured pod logs, CI traces, and stack traces for cloud provider keys (AWS, GCP, Azure), GitHub/GitLab/npm/Slack tokens, JWTs, bearer headers, and database/Redis connection URIs (`postgres://`, `rediss://`, `mongodb+srv://`), replacing matches with deterministic typed placeholders (`[REDACTED:<RULE_ID>]`).
  4. **Regulated PII / PHI / MNPI Pass:** Applies compliance entity redaction (`utils/validation.ts`) so patient identifiers, SSNs, or regulated financial account numbers accidentally printed in logs never cross the external model boundary.

### Per-Turn Tool Result Deduplication & Superseded Reference Handles
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 28: Per-Turn Tool Result Deduplication & Reference Handles) -->

During multi-step IDP trajectories—such as polling a Kubernetes deployment rollout, waiting on GitHub Actions checks, or re-reading a Backstage Catalog entity—agents frequently invoke the same read capability multiple times. Modeled on VS Code Copilot Chat's per-turn tool deduplication, the prompt compiler collapses unchanged or superseded tool results into lightweight reference stubs before rendering the prompt tree (`prepareStep`):

* **Resource-Key & Content-Hash Deduplication:**
  * Each read-only tool call is indexed by a canonical **resource key** (`capabilityId + normalizedTargetArgs`, e.g., `k8s:get-deployment:prod/payment-service`) and a SHA-256 **output content hash**.
  * **Superseded Polling Responses:** When a newer turn queries the same resource key (e.g., turn 9 polls deployment status previously checked in turns 4, 6, and 7), earlier tool outputs for that resource key are replaced in-place with a compact reference handle (`[Superseded status check from turn 4 — see latest state in turn 9]`), keeping only the freshest response expanded in context.
  * **Unchanged Content Deduplication:** If a subsequent read returns an identical SHA-256 content hash to an earlier turn still visible in context, the newer duplicate payload is collapsed to `[Unchanged from turn 4 (sha256: <prefix>) — see prior tool result]` to avoid re-injecting redundant kilobytes while preserving prompt-cache prefix stability on earlier turns.
* **Prompt-Cache Preservation Trade-off:**
  * Collapse superseded turns *after* the static cached prefix (Anchor 2) and only when token savings exceed the cost of invalidating a downstream sliding turn anchor, ensuring deduplication reduces net token burn rather than churning prompt caches unnecessarily.

### Risk-Driven `toolApproval` Policies & HMAC-Signed Approval Replay
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 29: Interactive vs. Autonomous Terminal & Tool Risk Classification) -->

* **Dynamic `toolApproval` Binding (AI SDK 7):** During `before_model_resolve` / `prepareStep`, the runtime maps resolved `CapabilityDescriptor` risk tiers directly into Vercel AI SDK 7's `toolApproval` map (`READ` / `REVERSIBLE_STAGE` -> `'auto-approve'`, `DESTRUCTIVE_MUTATION` -> `'user-approval'` or typed policy function).
* **Cryptographic Input Binding (Anti-Tampering):** Leveraging AI SDK 7's hardened approval replay pattern, every pending approval token is **HMAC-signed over `(runId, toolCallId, capabilityId, canonicalArgsHash, principalRef)`** so tool arguments cannot be altered between the approval prompt and workflow resumption.

### Sub-Model Routing & Background Utility Tiering
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 30: Background Model Speculation & Sub-Model Routing) -->

Rather than routing every internal orchestration and housekeeping task through an expensive frontier reasoning model, `ModelExecutor` partitions model invocations across **task-specialized model tiers** (modeled on VS Code Copilot Chat's background model speculation and sub-model routing):

| Model Tier                                    | Intended Workload Class                                      | Concrete Platform Consumers                                  | Latency & Cost Profile                                       |
| :-------------------------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| **`utility_fast` (Small / Low-Latency Tier)** | High-frequency, bounded classification, extraction, and summarization tasks | • Workflow run title & summary generation<br>• Pre-loop intent classification (`IIntentService`)<br>• Pre-compaction durable memory extraction (`Mem0` flush)<br>• Schema-enforced context compaction (`summarizer.ts`)<br>• Noise-filtering log/plan distillation subagents (`execution_subagent`) | Sub-second latency; fraction of frontier token cost          |
| **`embedding` Tier**                          | Semantic vectorization & similarity scoring                  | • Virtual tool cluster routing (`CapabilityDescriptor` matching)<br>• Mem0 semantic memory & TechDocs RAG retrieval | Ultra-low cost; deterministic vector dimensions              |
| **`primary_reasoning` (Frontier Tier)**       | High-stakes synthesis, multi-step planning, and declarative code/config generation | • Complex incident root-cause synthesis<br>• Terraform / Helm / `catalog-info.yaml` patch generation<br>• Multi-step remediation planning & Stop-Hook repair turns | Highest reasoning depth; reserved strictly for core decision turns |

* **Compliance Reconciliation:** Both `utility_fast` and `primary_reasoning` model profiles must resolve through `ModelExecutor`'s **tenant-approved compliance allowlist** (enforcing identical BAA/DPA, Zero Data Retention, and regional inference guarantees—never routing regulated healthcare or financial payloads to an unvetted fast model).

### Mapping AI SDK 7 Stream Events into Typed `AgentStreamPart` Frames
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 32: Typed Streaming Response Parts (ChatResponsePart Protocol)) -->

* **Structured Stream Adapter:** The runtime's stream bridge transforms Vercel AI SDK 7 `streamText` chunks (`text-delta`, `tool-call`, `tool-result`, `reasoning-delta`, `finish`) and capability `uiDetails` envelopes into typed `AgentStreamPart` events—keeping high-resolution UI card data (`uiDetails`) out of the LLM's token window (`llmContent`) while delivering rich structured state to the frontend.

### Multi-Entity & Cross-Repository Context Disambiguation (`entityRef` Tagging)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 33: Multi-Root Workspace & Cross-Repo Context Disambiguation) -->

IDP workflows routinely span multiple repositories and Software Catalog entities in a single trajectory—for example, tracing a breaking OpenAPI schema change from a producer `Component` (`component:default/billing-api`) across three downstream consumer services. Modeled on VS Code Copilot Chat's multi-root workspace root-URI isolation, the prompt compiler enforces **strict canonical `entityRef` scoping** across all context blocks:

* **Explicit `entityRef` Envelope Tagging:**
  * Every retrieved `SKILL.md` runbook, `catalog-info.yaml` spec, TechDocs snippet, Mem0 memory, file path, and tool output rendered into the prompt tree is wrapped with its owning canonical Backstage entity reference (`entityRef="component:default/billing-api"`, `repoSlug="org/billing-api"`).
  * Per-entity instructions and runbooks resolve strictly against the entity they belong to—preventing deployment rules, Terraform conventions, or schema constraints for Service A from bleeding into edits targeting Service B.
* **Qualified Cross-Repo File & Tool Addressing:**
  * In multi-repository workflows, relative paths (`src/index.ts`, `catalog-info.yaml`, `deploy/values.yaml`) are forbidden without an explicit `entityRef` or `repoSlug` qualifier in tool inputs and staged diff previews.

### Threading `AbortSignal` Through Vercel AI SDK & Subagent Loops
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 35: Cooperative Cancellation Tokens (CancellationToken) Propagated Down to Tools) -->

* **Immediate Stream & Tool-Loop Termination:** `ModelExecutor` passes the activity's `AbortSignal` directly to Vercel AI SDK `generateText` / `streamText` (`abortSignal`), active `transcribe` streams, and any spawned distillation subagents (`execution_subagent`), aborting upstream HTTP/SSE model connections immediately when a user clicks Stop or injects a steering redirect.

### Unified `ModelExecutor` & `LanguageModelChatProvider` Abstraction
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 36: Custom LM Provider & Endpoint Abstraction (LanguageModelChatProvider)) -->

Modeled on VS Code Copilot Chat's `LanguageModelChatProvider` abstraction, `ModelExecutor` decouples all agent reasoning, compaction, and distillation logic from individual vendor SDKs behind a unified internal contract:

* **Normalized Provider Capabilities:**
  * **Model Resolution (`resolveModel(modelRef, tenantContext)`):** Maps logical model profiles (e.g., `reasoning-default`, `utility-fast`, `hipaa-enclave-reasoning`, `finra-private-llm`) to concrete Vercel AI SDK `LanguageModel` instances backed by AWS Bedrock, Azure OpenAI, Google Vertex AI, Vercel AI Gateway, or VPC-hosted OpenAI-compatible/vLLM endpoints.
  * **Model-Specific Token Counting (`provideTokenCount(text | messages, modelRef)`):** Exposes provider/tokenizer-accurate token estimation (`tiktoken` / model-family tokenizers) directly to the `@vscode/prompt-tsx`-style priority prompt compiler and `EmergencyTruncation` circuit breaker so token budgets never rely on naive character-division heuristics across different model families.
  * **Unified Streaming, Tool Framing & Reasoning Normalization:** Normalizes streaming text/reasoning deltas, tool-call framing (`cleanToolSchemaForProvider`), and top-level `reasoning` effort budgets across heterogeneous cloud and self-hosted endpoints.
* **Zero Vendor Coupling in Workflow Code:**
  * Platform administrators can migrate teams between providers (e.g., Azure OpenAI to AWS Bedrock or self-hosted endpoints) or update BYOK credentials via configuration and Token Broker bindings without modifying a single line of workflow or agent authoring code.

### AI SDK 7 Malformed JSON Repair & In-Loop Argument Recovery
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 37: Tool-Call Self-Healing & Malformed JSON Repair Middleware) -->

* **Two-Stage Parse & Validate Recovery:** `ModelExecutor` enables Vercel AI SDK 7's malformed JSON extraction/repair hook (`experimental_repairToolCall`) for syntactic JSON glitches (e.g., trailing commas, unescaped quotes) and pairs it with `CapabilityGateway`'s structured Zod schema-diff tool error payloads so the model self-heals invalid arguments on the immediately following turn.

### Explicit Provenance Trust Boundaries & Untrusted External Data Wrapping
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 38: Explicit Trust Boundaries & Untagged External Data Wrapping) -->

Because an enterprise Backstage agent continuously ingests external text authored by third parties or noisy telemetry systems—PagerDuty alert descriptions, Jira tickets, GitHub issues/PR comments, Slack threads, and Kubernetes pod logs—the prompt renderer enforces **strict provenance trust boundaries** modeled on VS Code Copilot Chat's structural data wrapping:

* **Three-Tier Provenance Classification:**
  1. `system` — Immutable platform instructions, compliance/redaction directives, and verified workflow goals (rendered in privileged system `instructions`).
  2. `verified_catalog` — Trusted internal Backstage Software Catalog specs (`catalog-info.yaml` metadata ingested from governed org repositories) and verified internal audit/deployment state.
  3. `untrusted_external` — All external webhook payloads, tickets, chat threads, web fetches, pod logs, and third-party MCP tool outputs.
* **Structural Delimiter Isolation & Anti-Injection Framing:**
  * Every `untrusted_external` payload is wrapped inside explicit, non-executable structural delimiters carrying its source provenance (e.g., `...</external_data>`).
  * System `instructions` enforce a binding rule that content inside `<external_data>` blocks must be treated **strictly as passive data for analysis**, never as executable instructions, policy overrides, or authorization to invoke `REVERSIBLE_STAGE` / `DESTRUCTIVE_MUTATION` capabilities.
* **Hardening Note (Delimiter Escape Defense):** Before wrapping any `untrusted_external` payload, the prompt renderer must escape or neutralize closing delimiter sequences (e.g., `</external_data>`) inside the raw payload so an adversarial ticket or log line cannot break out of the untrusted data sandbox.

### Pre-Turn Contextual Reference Expansion (`#` / `@` Mention Resolver Pipeline)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 39: Contextual Reference Expansion & Implicit Mention Resolution (# / @ Resolvers)) -->

Rather than passing raw `@` or `#` reference tokens into the model and forcing the LLM to burn initial tool calls looking them up, the runtime executes a deterministic **Pre-Turn Reference Resolution Pipeline** (modeled on VS Code Copilot Chat's `#file`, `#sym`, and `@terminal` resolvers) before compiling the prompt tree:

* **Supported Backstage Reference Tokens:**
  * `@<kind>:<namespace>/<name>` (e.g., `@component:default/checkout-service`, `@api:default/billing-v2`, `@system:default/payments`) — Expands into a normalized, token-bounded `` header containing `spec`, `owner`, `lifecycle`, direct relations (`dependsOn`, `providesApi`, `consumesApi`), active CI/deployment/incident status slots, and any linked `SKILL.md` runbooks (`agent.io/skills`).
  * `#techdocs:<namespace>/<name>[#section]` — Expands into bounded, relevant TechDocs Markdown excerpts tagged with source URI and entity provenance.
  * `#run:<runId>` / `#incident:<incidentId>` — Hydrates a scrubbed summary of a prior workflow run or active alert context.
* **Bounded Token Allocation & Priority Placement:**
  * Each expanded reference object is capped to a deterministic token budget and placed into the priority-budgeted prompt tree (`verified_catalog` vs. `untrusted_external` depending on source provenance) so explicitly mentioned entities survive context pruning ahead of ambient background context.

### Speculative Next-Step Suggestions (`ChatFollowupProvider` Pattern)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 40: Speculative Next-Step Suggestions (ChatFollowupProvider)) -->

At the conclusion of every completed turn (`agent_end` lifecycle hook), the runtime runs a lightweight **Follow-Up Suggestion Generator** modeled on VS Code Copilot Chat's `ChatFollowupProvider`:

* **Utility-Tier Generation (`utility_fast` Model):**
  * Inspects the compact `summarizer.ts` working state (`USER_INTENT`, `EXISTING`, `PENDING`), target Backstage `entityRef`, and produced artifacts (e.g., staged PR URL, diagnosed root cause, newly scaffolded repository) to synthesize **2–3 concise, context-specific follow-up action chips** (`{ id, label, prompt, targetIntent?, targetCapabilityId?, entityRef? }`).
  * Uses the `utility_fast` sub-model tier with strict structured output (`Output.object`) and a tight token cap (`<= 250` output tokens) so suggestion generation adds negligible cost and latency.
* **Deterministic + LLM Hybrid Suggestions:**
  * Curated agent handoffs (Section 5) and workflow terminal outcomes can register deterministic next-step chips (e.g., *"Review & Approve Staging Rollout"*, *"Scaffold Observability Dashboard"*) alongside model-generated follow-ups.
* **Hardening Note (RBAC Pre-Filtering & Scrubbing):**
  * Any suggestion bound to a `targetCapabilityId` or `targetIntent` is **filtered against the caller's resolved `PermissionsService` grants** before emission—never surfacing one-click action chips for capabilities the user is unauthorized to execute—and passed through the PII/Secret scrubber so sensitive entity values never leak into chip labels.

### Multi-Turn Prompt Compression via Pinned Entity Working Set
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 41: Multi-Turn Prompt Compression via "Working Set" Pinning) -->

During multi-service incident triage or cross-repo refactoring trajectories, an agent often inspects 10–15 microservices before narrowing the root cause down to one or two affected services. Modeled on VS Code Copilot Chat's **Working Set** pinning, the prompt compiler separates **ephemeral exploration reads** from the **Pinned Entity Working Set**:

* **Ephemeral Exploration vs. Pinned Working Set:**
  * **Exploration Reads (Low Retention Priority):** Initial discovery queries (e.g., querying 15 upstream/downstream Catalog entities or scanning service health dashboards) enter context as low-priority exploration nodes that are aggressively pruned or collapsed into one-line clearance notes (`Cleared: component:default/auth-service — healthy, no error spikes`) during context compaction.
  * **Pinned Working Set (High Retention Priority):** Entities, deployment manifests, and active error logs identified as the primary focus of diagnosis or mutation are promoted into the **Pinned Entity Working Set** (either automatically upon mutation/diagnostic focus or explicitly via a `manage_working_set` tool).
* **Compaction & Priority-Tree Immunity:**
  * Pinned working-set entities sit in a high-priority prompt layout slot right below invariant system instructions and the active `manage_todo_list`, guaranteeing their live `catalog-info.yaml` specs, active deployment status, and key error excerpts remain continuously visible across compaction cycles while cleared services are evicted.
* **Bounded Working-Set Cap:**
  * Cap the Pinned Working Set (e.g., max `5` active `entityRef`s and bounded token reserve per pinned entity) so the agent must explicitly unpin cleared entities rather than pinning every inspected service indefinitely.

### Session-Start Capability Negotiation & Graceful Feature Degradation
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 42: Graceful Feature Degradation & Capability Negotiation) -->

Because an enterprise Backstage deployment spans heterogeneous team environments—varying enabled plugins, disabled MCP servers, strict RBAC scopes, and diverse model endpoints (e.g., an air-gapped VPC model without vision or parallel tool-calling vs. a cloud frontier model)—the reasoning runtime performs **session-start capability negotiation** prior to compiling Turn 1:

* **Three-Way Capability Intersection (`Environment` $\cap$ `Principal RBAC` $\cap$ `Resolved Model`):**
  1. **Installed Plugin & MCP Availability:** Queries the control plane's active plugin/MCP health registry so tools backed by uninstalled or disabled integrations (e.g., PagerDuty or ArgoCD disabled in a given Backstage instance) are omitted completely rather than failing mid-run.
  2. **Caller RBAC & Tenant Policy:** Filters capabilities through the layered policy cascade (`Global -> Tenant -> PermissionsService -> Workflow`), removing tools the initiating `principalRef` is unauthorized to execute.
  3. **Model Endpoint Feature Matrix (`ModelCapabilities`):** Inspects the resolved `LanguageModel`'s declared support for `nativeToolCalling`, `structuredOutputs`, `vision` / `fileParts`, `reasoningEffort`, and `promptCaching`:
     * If a private/air-gapped VPC model lacks native function-calling support, `ModelExecutor` degrades gracefully to structured JSON/XML tool-call framing (`Output.object` / text parser fallback) and adjusts prompt instructions accordingly.
     * If `vision` or `fileParts` is unsupported, multimodal attachments are routed through deterministic text/OCR extractors before prompt rendering.
* **Prompt Instruction Adaptation:**
  * The declarative prompt compiler adapts system `instructions` to reference **only** negotiated, active capabilities—preventing the model from hallucinating calls to disabled plugins or unsupported modalities.
* **Hardening Note (Fail-Closed on Security & Compliance Invariants):**
  * Graceful degradation applies strictly to optional product features (vision, parallel tool calls, optional plugins). Security, RBAC, PII/PHI redaction, `DESTRUCTIVE_MUTATION` approval gates, and `AuditLogSink` sinks must **never** degrade open—if a mandatory compliance guardrail or redactor is unavailable, the session fails closed (`CAPABILITY_NEGOTIATION_FAILED`).

### Semantic Loop & Thrashing Detection (`LoopDetector` Heuristics)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 43: Semantic Loop & Thrashing Detection (LoopDetector Heuristics)) -->

Even with token budgets and Stop Hooks, LLMs can enter subtle **thrashing loops**—repeatedly polling an unchanged endpoint with identical arguments, calling the same failing tool without varying inputs, or toggling a configuration file back and forth (`A -> B -> A`). Modeled on VS Code Copilot Chat's `LoopDetector` heuristics, the turn runner tracks a rolling action-signature window across steps:

* **Rolling Action-Signature Tracking:**
  * On every tool invocation (`after_tool_call`), the runtime computes a deterministic SHA-256 signature over `(capabilityId, canonicalNormalizedArgsHash, outcomeOrStateHash)`.
  * Detects three thrashing patterns:
    1. **Identical Repeat Calls:** Calling the same capability with identical normalized arguments and receiving identical outcomes (`count >= 3`).
    2. **No-Op Mutation Cycles:** Repeatedly applying patches or API calls that produce zero state delta (`preStateHash === postStateHash`).
    3. **Oscillation / Flip-Flop Cycles:** Alternating between two previously seen workspace/resource state hashes (`S1 -> S2 -> S1 -> S2`).
* **Two-Stage Escalation (Soft Pivot Nudge -> Hard Halt / Human Escalation):**
  * **Stage 1 — Soft Threshold (`count === 3`):** Intercepts the tool loop (`prepareStep`) and injects a high-priority system directive into the prompt tree instructing the model that the repeated action pattern has produced zero progress and requiring it either to pivot strategy or invoke `ask_questions` to escalate to a human operator.
  * **Stage 2 — Hard Threshold (`count >= 5` or post-nudge recurrence):** Aborts the reasoning loop immediately with an explicit `LOOP_THRASHING_DETECTED` terminal status (or routes to a human-in-the-loop triage gate) rather than burning remaining FinOps budget or Temporal event history.
* **Hardening Note (Legitimate Polling Exemption):** Capabilities explicitly marked as bounded status pollers (`pollingMode: true`, e.g., waiting for a rollout with exponential backoff) use a separate, higher max-poll budget rather than triggering false-positive thrashing halts on their third poll.

### Read-Only vs. Mutating Tool Batch Partitioning
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 44: Read-Only vs. Mutating Tool Partitioning for Parallel Execution) -->

When a frontier model emits multiple tool calls in a single assistant turn (for example, querying Backstage Catalog relations, Datadog metrics, PagerDuty incidents, and GitHub deployment status simultaneously while also proposing a config patch), executing everything blindly in parallel risks race conditions on shared state, whereas running everything sequentially adds avoidable latency. Modeled on VS Code Copilot Chat's tool batch dispatcher, the runtime partitions each turn's tool batch by **side-effect risk tier**:

* **Phase 1 — Concurrent Read-Only Execution (`riskTier === 'READ'`):**
  * All `READ` tool calls in the batch execute concurrently (subject to a bounded per-turn concurrency cap, e.g., `maxConcurrentReads = 8`, and per-provider rate-limit buckets) via `Promise.allSettled`.
  * Results are re-assembled into the exact original `toolCallId` order emitted by the model so multi-turn message history and prompt-cache prefixes remain 100% deterministic.
* **Phase 2 — Serialized Staged & Mutating Execution (`REVERSIBLE_STAGE` & `DESTRUCTIVE_MUTATION`):**
  * Any non-read tool call executes **strictly sequentially** after the concurrent read phase completes, running pre-mutation baseline capture, inline schema/OPA post-edit validation (`get_errors`), and approval gate checks between each individual write.
* **Hardening Note (In-Turn Duplicate Read Coalescing):** If a model emits two identical `READ` calls with the exact same `(capabilityId, canonicalNormalizedArgsHash)` in the same batch, `CapabilityGateway` coalesces them into a single upstream request and shares the scrubbed response across both `toolCallId` entries.

### Mid-Run Policy Re-Evaluation in Lifecycle Hooks
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 46: Enterprise Policy & Admin Governance Hooks (Org-Level Kill Switches)) -->

* **Live Governance Enforcement on Long-Running Workflows:** `before_model_resolve` and `before_tool_call` query the active org/domain policy snapshot on every turn so a security admin activating a kill switch or mandatory production approval flag takes effect immediately on already-running multi-day Temporal workflows.

### Guided Windowed Inspection Over Full-Artifact Dumps
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 47: Token-Aware Chunked File Reading & Line-Indexed Windows) -->

* **Incremental Slice Traversal:** System instructions direct the model to inspect the `Showing lines X–Y of Z` header returned by windowed readers and fetch targeted follow-up line ranges (e.g., jumping to the tail of a pod log or a specific OpenAPI path section) rather than attempting to load entire multi-thousand-line files into context.

### Framework-Agnostic Reasoning Core (`@internal/agent-core` Ports & Adapters)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 48: Zero-Dependency Core Prompt & Evaluation Separation) -->

* **Pure TypeScript Core Modules:** The priority prompt compiler, model-family prompt adapters, virtual tool router, `cleanToolSchemaForProvider` sanitizer, `LoopDetector`, `EmergencyTruncation` circuit breaker, and state reducers reside inside `@internal/agent-core` as pure TypeScript modules operating over plain serializable interfaces.