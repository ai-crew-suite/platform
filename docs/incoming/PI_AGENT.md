# Pi Agent

Pi is the Typescript library that OpenClaw uses for its agent runtime. Following are features of that system in OpenClaw, what is handled in OpenClaw's Pi agent runtime, and what is handled directly by Pi.

## Agent Loop
> `Receive message → Assemble context → Call LLM → Execute tools → Stream reply → Persist`

That six-step pipeline is actually a **hybrid handoff** between OpenClaw's wrapper layer (`pi-embedded-runner.ts`) and Pi's underlying SDK (`pi-agent-core` / `pi-coding-agent`).

Pi provides the core loop mechanics, event stream, and storage engine, while OpenClaw wraps each stage with multi-channel routing, custom workspace files, security policies, and provider failover.

### Step-by-Step Ownership & Implementation Details

| Pipeline Step           | Primary Owner                                | How Pi Implements It & Interesting Details                   |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| **1. Receive message**  | **OpenClaw** (with Pi queues)                | **OpenClaw's Gateway** handles intake from Slack, WhatsApp, or webhooks, normalizes the payload, and acquires a per-session lock. **Pi's `Agent` class** provides an internal dual-mode message queue (`steering` vs. `follow-up`). If a user sends a message while the agent is busy, Pi can inject it mid-run to steer the next tool call or queue it for after the current turn. |
| **2. Assemble context** | **Hybrid** (OpenClaw overrides Pi)           | **Pi (`pi-coding-agent`)** natively builds a minimal system prompt, loads `AGENTS.md` files, and pulls prior messages via `SessionManager`. **OpenClaw overrides this** in `pi-embedded-runner` to inject its own workspace files (`SOUL.md`, `USER.md`, `HEARTBEAT.md`), run context pruning, and sanitize turn ordering (e.g., enforcing strict alternating user/assistant turns for Anthropic or Gemini). |
| **3. Call LLM**         | **Pi (`pi-ai`)** + OpenClaw Failover         | **Pi's `pi-ai` layer** handles the actual inference via `streamSimple()`, normalizing token deltas across 15+ providers into a single unified event stream. **OpenClaw wraps this call** to add auth profile rotation, automatic model/provider failover, and retry backoff if a provider hits rate limits. |
| **4. Execute tools**    | **Pi (`pi-agent-core`)** + OpenClaw Policies | **Pi owns the core `agentLoop()`** (a famously minimal ~400-line generator loop with no artificial "max steps" cap—it runs until the LLM stops requesting tools). **Interesting Pi details:** Pi defaults to **parallel tool execution** (running independent tool calls concurrently while still emitting `toolResult` messages in the LLM's original source order) and supports `beforeToolCall` / `afterToolCall` lifecycle hooks. **OpenClaw** injects 20+ extra tools alongside Pi's 4 primitives and uses `beforeToolCall` to enforce an 8-layer security/sandbox policy check. |
| **5. Stream reply**     | **Pi** (emit) → **OpenClaw** (route)         | **Pi emits fine-grained lifecycle events** (`text_delta`, `tool_execution_start`, `tool_execution_end`, `turn_end`) as an async event stream. **OpenClaw (`pi-embedded-subscribe.ts`)** subscribes to this stream, strips internal thinking tags, chunks the deltas, and pushes live updates out to external messaging clients. |
| **6. Persist**          | **Pi (`SessionManager`)**                    | **Provided directly by Pi.** Pi writes every message, tool call, and compaction summary to an append-only **JSONL file**. **Interesting Pi detail:** Each entry in the JSONL file contains `id` and `parentId` fields, forming an in-file **directed tree**. This lets Pi branch, rewind, or summarize old branches via compaction without ever mutating or deleting historical lines on disk. |

### Step 2 (Assemble Context): Affects of Mem0 

When you install [`@mem0/pi-agent-plugin`](https://docs.mem0.ai/integrations/pi-agent), it hooks directly into Pi's **`before_agent_start`** lifecycle event (which fires right after a user submits a prompt, before the agent loop invokes the LLM).

- **Semantic vector query:** Using the user's incoming prompt text, the plugin queries Mem0's API (scoped automatically to the detected Git repository root as `app_id` and your `userId`).
- **Prompt-cache-safe message injection:** Rather than rewriting the static system prompt—which would bust Anthropic/OpenAI prompt caches mid-session—Pi's `before_agent_start` hook injects a custom message object (`customType: "mem0-..."`) into the conversation array right before the user's prompt.
- **Threshold filtering:** Only memories scoring above `searchThreshold` (default `0.3`) are injected, keeping irrelevant noise out of Pi's context window.
- **OpenClaw's slot replacement:** In OpenClaw (`@mem0/openclaw-mem0`), Mem0 plugs into `plugins.slots.memory`, replacing OpenClaw's native SQLite + Markdown hybrid search with the exact same automatic pre-turn injection and post-turn `autoCapture` extraction.

### Step 3 (Call LLM): Auth Profile Rotation & Failover

Pi's `pi-ai` package is deliberately stateless regarding credentials—it just expects a resolved `Model` object and an API key. OpenClaw builds a three-tier resilience wrapper around it inside `pi-embedded-runner`:

1. **In-memory runtime key injection:** Before a run, OpenClaw's `models-config.ts` merges static config and dynamic provider discovery into a `models.json` file for Pi's `ModelRegistry`, then injects the active credential at runtime via `authStorage.setRuntimeApiKey()` so API keys are never hardcoded into Pi's config files.
2. **Stage 0 — Bounded same-model recovery:** If a provider throws a transient network error or brief rate limit, OpenClaw first attempts a bounded retry on the *same* profile and model, preserving any partial streamed output and instructing the agent to inspect interrupted tool calls rather than blindly repeating them.
3. **Stage 1 — Auth profile rotation (same provider):** If the error is a persistent 429 (rate limit, TPM/RPM exhaustion, concurrency cap) or auth failure, OpenClaw rotates through other configured credential profiles for that *same* provider. Failing profiles are placed on an exponential-backoff cooldown timer, and a process-local admission gate pauses concurrent requests hitting the same exhausted endpoint.
4. **Stage 2 — Model/provider fallback:** Only after *all* auth profiles for the primary provider are exhausted or in cooldown does OpenClaw step through `agents.defaults.model.fallbacks`. Notably, if a user explicitly pinned a model in a session via `/model`, OpenClaw treats it as strict and will not silently downgrade it.

### Step 4 (Execute Tools): The 20+ Tools OpenClaw Injects

Pi natively ships with just 4 primitives (`read`, `write`, `edit`, `bash`). OpenClaw registers its own extended tool suite (`src/agents/agent-tools*.ts`) on top of Pi's loop, grouped into functional domains:

- **Enhanced File & Patch Tools:** Replaces or wraps Pi's basic file tools with sandbox-aware `read`, `write`, `edit`, and `apply_patch`.
- **Runtime & Execution:** `exec` (host or Docker sandbox shell), `process` (background process management), `terminal` (shared operator terminals), and `code_execution` (provider-backed Python).
- **Web & Browser Automation:** `web_search`, `x_search`, `web_fetch` (readable markdown extraction), and `browser` (full Playwright/Chrome extension session control).
- **Memory & Knowledge:** `memory_search`, `memory_add`, `memory_list`, `memory_get`, `memory_update`, `memory_delete`, `memory_event_list`, and `memory_event_status` (swapped to Mem0 when that plugin is active).
- **Multi-Agent & Session Orchestration:** OpenClaw builds a **multi-session control plane** on top of Pi's `SessionManager` and exposes four tools so an agent can orchestrate other agents:
  - **`sessions_spawn`:** Launches an isolated background subagent in a brand-new session (with its own Pi runtime instance, restricted tool policy, and optional model override) to handle a parallel task—such as researching a codebase—and announces the result back when finished.
  - **`sessions_list`:** Lists active or recent sessions across the gateway (e.g., an ongoing Slack thread, a WhatsApp chat, or running subagents) along with their session keys and metadata.
  - **`sessions_send`:** Sends a prompt or message directly into *another* active session, letting two agents collaborate or letting a main agent nudge a background worker.
  - **`session_status`:** Inspects the runtime health, token usage, active model, and context compaction state of a specific session.
- **Scheduling, Messaging & Media:** `cron` (scheduled background jobs), `message` (outbound cross-channel messaging), `image` (vision/image generation), plus `ask_user` and `secrets` (human-in-the-loop approval and credential injection without exposing secrets to the LLM).

### Step 5 (Stream Reply): Events, Tag Stripping & Delta Chunking

#### Are Pi's lifecycle events customizable?

- **Fixed core event names:** In `@mariozechner/pi-agent-core`, the core `AgentEvent` union is fixed (`agent_start`, `turn_start`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `turn_end`, `agent_end`). You cannot rename built-in event types in the core loop without forking it.
- **Extensible payloads & extension bus:** However, `AgentMessage` supports TypeScript declaration merging so you can attach custom message types (`customType`) and arbitrary `details` payloads inside `message_*` events. Furthermore, Pi's higher-level Extension API (`pi.events`) acts as an internal event bus where extensions can emit and subscribe to custom events alongside the built-in lifecycle hooks.

#### How complex is OpenClaw's thinking-tag stripping?

It is surprisingly non-trivial because distilled and open-weight models often emit `<think>...</think>` or `<final>...</final>` inline inside normal text deltas rather than dedicated API reasoning fields.

- **Stateful streaming parser (`stripBlockTags`):** Inside `pi-embedded-subscribe.ts`, OpenClaw maintains a stateful parser across incoming token chunks. When it sees `<think>`, it suppresses output until `</think>` arrives. If `enforceFinalTag` is enabled, it buffers *everything* in silence until `<final>` opens so internal monologue never leaks.
- **Markdown code-span awareness:** Before stripping tags or parsing reply directives (like `[[reply_to_current]]`), OpenClaw runs a Markdown parser (`micromark` via `findMarkdownCodeRegions`) to ensure that literal `<think>` tags inside fenced code blocks or inline backticks are preserved as code rather than eaten by the filter.

#### How does OpenClaw chunk deltas?

Because messaging apps like Slack, Telegram, and WhatsApp do not support raw token-by-token streaming (and rate-limit frequent message edits), OpenClaw splits streaming into two layers:

1. **Structural splitting (`EmbeddedBlockChunker` / `chunk.ts`):** Accumulates raw `text_delta` events and breaks them on logical boundaries—such as paragraph breaks (`\n\n`) or `text_end` / `message_end` events—while tracking open Markdown code fences (`````) so it never splits a code block in half.
2. **Temporal coalescing (`BlockReplyCoalescer`):** Merges those fragments using three thresholds (`minChars`, `maxChars`, and `idleMs`, typically ~75ms for TUI or higher for chat channels). Fast token bursts are flushed once they hit `maxChars`, slow streams flush after `idleMs` so the user isn't left staring at a blank screen, and tiny fragments wait until `minChars` to avoid spamming chat notifications.

## Model Selection and Failover

Supports multiple models and providers with automatic switching. Pi provides the universal adapter that makes switching providers seamless, while OpenClaw owns the policy, health tracking, and automatic retry logic.

### What Pi Provides Directly (`@mariozechner/pi-ai`)

Pi treats models as **stateless, hot-swappable value objects**. It does *not* implement automatic failover loops or retry policies itself. Instead, it gives OpenClaw three foundational building blocks:

- **Unified Multi-Provider Driver (`pi-ai`):** Pi normalizes 15+ distinct LLM APIs (Anthropic Messages, OpenAI Chat/Responses, Google Gemini, AWS Bedrock, Ollama, OpenRouter, etc.) into a single `streamSimple(model, context, options)` interface. Whether a request goes to Claude, GPT, or a local Ollama instance, Pi emits the exact same normalized event stream (`text_delta`, `toolcall_delta`, `done`, `error`).
- **The `Model` Value Object & Registry (`ModelRegistry`):** Pi defines a canonical `Model` struct containing `id`, `api` (wire protocol), `provider`, `baseUrl`, `reasoning` flags, `contextWindow`, and `cost` metadata. OpenClaw populates Pi's `ModelRegistry` via a dynamically generated `models.json` file, and can swap which `Model` object is passed into `agent.setModel(nextModel)` between any turn—or even mid-run.
- **Cross-Provider Context Handoff (`transformMessages`):** Because OpenClaw might start a session on Anthropic Claude and fail over mid-conversation to OpenAI GPT or Gemini, Pi's `pi-ai` layer automatically translates provider-specific message formats on the fly. For example, it converts Claude's `thinking` blocks into plain text or strips incompatible signatures when handing the history off to a fallback provider so the fallback API doesn't reject the payload.

### What OpenClaw Builds on Top (`model-fallback.ts` & `auth-profiles.ts`)

Because Pi is stateless, OpenClaw wraps `pi-ai` in a resilient orchestration loop (`runWithModelFallback`) that tracks failures across requests and decides when to switch:

- **Hierarchical Model Resolution:** Before calling Pi, OpenClaw resolves the target model using a strict priority chain:
  1. **Session Override:** An explicit model pinned by the user via `/model` (which disables automatic fallback unless reset).
  2. **Per-Agent / Channel Override:** A specific model configured for a specialized subagent (`sessions_spawn`) or channel.
  3. **Primary Default + Fallback Chain:** `agents.defaults.model.primary` followed by an ordered `fallbacks` list (e.g., `anthropic/claude-sonnet-4-5` → `openai/gpt-4o` → `google/gemini-2.5-pro`).
- **Error Classification (`FailoverError`):** When Pi's stream emits an error, OpenClaw inspects the HTTP status and provider error body to classify *why* it failed:
  - **Retriable / Failover-worthy:** `429` rate limits, `401/403` expired or invalid API keys, `402` billing/quota exhaustion, `500/503/529` provider overload, or connection timeouts.
  - **Non-retriable (Abort immediately):** Context window overflow (`400` prompt too long—which instead triggers session compaction, not a model switch) or user-initiated `AbortError`.
- **Two-Dimensional Rotation (Profiles × Models):** OpenClaw persists health state in `~/.openclaw/agents/<id>/agent/auth-profiles.json`. When a failure occurs:
  1. It first rotates across all available **Auth Profiles** for the *current* provider (e.g., switching from `anthropic:work` to `anthropic:backup`), placing the failed profile on an exponential-backoff cooldown (`1m → 5m → 25m → 1h`) or a longer billing disablement (`5h → 24h`).
  2. Once every auth profile for that provider is in cooldown, OpenClaw advances to the next candidate in the **`fallbacks` list**, resolves a fresh `Model` object from Pi's `ModelRegistry`, and re-invokes Pi's runner seamlessly.

### Summary Split

| Capability                             | Owner            | Implementation Detail                                        |
| -------------------------------------- | ---------------- | ------------------------------------------------------------ |
| **Wire-protocol normalization**        | **Pi (`pi-ai`)** | Single `streamSimple()` interface across 15+ providers.      |
| **Cross-provider message translation** | **Pi (`pi-ai`)** | `transformMessages()` converts thinking blocks & tool schemas on handoff. |
| **Model catalog & custom endpoints**   | **Hybrid**       | OpenClaw generates `models.json`; Pi's `ModelRegistry` parses and serves it. |
| **Cooldown state & auth rotation**     | **OpenClaw**     | Persisted in `auth-profiles.json` with exponential backoff timers. |
| **Fallback chain execution**           | **OpenClaw**     | `runWithModelFallback()` catches `FailoverError` and swaps Pi's `Model`. |

## System Prompt Construction

Assembles system prompts from workspace files, skills, and configuration. The **System Prompt Construction** subsystem is primarily **built by OpenClaw** (`src/agents/system-prompt.ts`), which completely replaces Pi's default minimal prompt while hooking into Pi's underlying `Agent` setter and `ResourceLoader` interfaces.

### What Pi Provides Directly (`pi-coding-agent` & `pi-agent-core`)

Pi ships with an intentionally tiny (~1,000-token) prompt builder designed for solo terminal coding, plus clean override hooks so wrappers like OpenClaw can replace it:

- **Minimalist Default Prompt (`buildSystemPrompt`):** In `pi-coding-agent`, Pi constructs a barebones prompt listing only its active tools (`read`, `write`, `edit`, `bash`), basic behavioral rules, and the current working directory.
- **Hierarchical Context Discovery (`AGENTS.md` / `CLAUDE.md`):** Pi's `DefaultResourceLoader` walks up the directory tree from the current working directory to the filesystem root (plus `~/.pi/agent/`), automatically concatenating any `AGENTS.md` or `CLAUDE.md` instruction files it finds.
- **Progressive Skill Disclosure (Agent Skills Standard):** Pi discovers `SKILL.md` files with YAML frontmatter (`name` and `description`) and injects **only their names, descriptions, and file paths** into an `<available_skills>` XML block. Instead of dumping thousands of tokens of instructions upfront, Pi relies on the LLM calling `read` on the `SKILL.md` file *only when a task matches that skill*.
- **Clean Override Hook (`agent.setSystemPrompt()`):** At the `pi-agent-core` level, the runtime treats the system prompt as an opaque string property (`agent.state.systemPrompt`). Extensions can also dynamically append to or rewrite it per turn via the `before_agent_start` event hook.

### What OpenClaw Builds on Top (`buildAgentSystemPrompt`)

OpenClaw bypasses Pi's default `buildSystemPrompt` and runs its own deterministic compiler (`src/agents/system-prompt.ts`) on every run, injecting the result into Pi via `agent.setSystemPrompt(...)`:

- **Workspace Bootstrap Persona Files:** OpenClaw reads a specific set of Markdown files from the agent's workspace (`~/.openclaw/workspace/`) and embeds them under `# Project Context`:
  - `AGENTS.md` (operational rules and memory workflows)
  - `SOUL.md` (tone, personality, and behavioral boundaries—if present, OpenClaw instructs the model to embody its persona)
  - `TOOLS.md` (user-maintained environment notes, like SSH hosts or device names)
  - `IDENTITY.md` & `USER.md` (the agent's name/vibe and details about the human user)
  - `HEARTBEAT.md` & `BOOTSTRAP.md` (proactive check-in checklists and first-run onboarding scripts)
- **Per-File & Total Character Truncation:** To prevent huge workspace files from blowing out the context window, OpenClaw enforces hard caps (`bootstrapMaxChars`, defaulting to 20,000 chars per file, and `bootstrapTotalMaxChars`, defaulting to 150,000 chars total), trimming oversized files with a 70% head / 20% tail split and inserting a truncation marker.
- **Prompt Modes (`full`, `minimal`, `none`):** OpenClaw dynamically strips sections based on who is running:
  - **`full`:** Used for main interactive agents (includes all workspace files, skills, memory recall rules, messaging/reaction guidelines, and heartbeat instructions).
  - **`minimal`:** Used for background subagents (`sessions_spawn`) and cron jobs—omits `SOUL.md`, `USER.md`, `HEARTBEAT.md`, and messaging rules to save tokens and keep workers focused.
  - **`none`:** Returns only a single identity line.
- **Runtime & Channel Metadata:** Appends live environment context (OS, architecture, Node version, active model, workspace path, sandbox status, and whether the reply is headed to Slack, WhatsApp, Discord, or TUI) plus strict `<final>` / `[[reply_to_current]]` formatting rules.

### Summary Split

| Component | Owner | Implementation Detail |
| --- | --- | --- |
| **Core prompt state & `before_agent_start` hook** | **Pi (`pi-agent-core`)** | Stores `systemPrompt` string and lets extensions mutate it per turn. |
| **Progressive `SKILL.md` XML indexing** | **Shared Standard** | Both Pi and OpenClaw inject lightweight skill metadata and load full instructions on demand via `read`. |
| **Multi-file persona assembly (`SOUL.md`, `USER.md`, etc.)** | **OpenClaw** | Compiled by `buildAgentSystemPrompt()` with per-file and total char truncation. |
| **Role-based prompt slimming (`full` vs `minimal`)** | **OpenClaw** | Strips social/persona overhead for isolated subagents (`sessions_spawn`). |

## Tool Management

Registers, schedules, and executes tools available to the Agent. The **Tool Management** subsystem is a classic **two-layer architecture**: **Pi** (`@mariozechner/pi-agent-core`) provides the low-level execution loop, schema validation, and parallel/sequential scheduler, while **OpenClaw** (`src/agents/pi-tools.ts`) acts as the tool factory, schema normalizer, and security gatekeeper before handing the final tool list to Pi.

### What Pi Provides Directly (`pi-agent-core`)

Pi handles the mechanics of **scheduling, validating, and executing** whatever `AgentTool[]` array is passed into `agent.setTools(...)`. Several interesting details distinguish Pi's tool engine from heavier frameworks:

- **TypeBox Schema + AJV Validation:** Pi defines tools using `@sinclair/typebox` (which generates both static TypeScript types and standard JSON Schemas). Before executing any tool call emitted by an LLM, Pi runs `validateToolArguments()` via AJV and automatically feeds validation errors back to the model as a failed `toolResult` so the LLM can self-correct.
- **Parallel Execution with Ordered Result Emission:** By default (`toolExecution: "parallel"`), when an LLM requests multiple tool calls in a single assistant message, Pi executes all of them concurrently via `Promise.all` (or individually via `prepareToolCall` → `executeToolCall`). However, to satisfy strict LLM API ordering requirements, Pi buffers completions and emits `toolResult` messages back into the conversation array in the **exact source order** the LLM requested them.
- **Mid-Batch Steering Interruption:** After each tool finishes in a turn, Pi checks its internal `steering` queue. If the user sent an urgent interruption while tools were running, Pi skips the remaining queued tool calls in that batch (emitting synthetic `"Skipped due to queued user message"` tool results so conversation history stays valid) and immediately injects the user's steering message into the next LLM turn.
- **`beforeToolCall` & `afterToolCall` Hooks:** Pi exposes synchronous/async interceptor hooks around every execution. `beforeToolCall` can inspect arguments and return `{ block: true, reason: "..." }` to abort execution safely, while `afterToolCall` can mutate the returned content or `details` payload before it enters context.
- **Streaming Partial Tool Updates:** Pi's `execute(toolCallId, params, signal, onUpdate)` signature passes an `onUpdate` callback, allowing long-running tools (like `bash` or `exec`) to stream live stdout chunks out as `tool_execution_update` events while the tool is still running.

### What OpenClaw Builds on Top (`createOpenClawCodingTools` & Policy Pipeline)

Pi has no concept of multi-tenant sandboxes, subagent restrictions, or cross-provider JSON Schema quirks. OpenClaw builds an extensive preparation and wrapping pipeline before passing tools into Pi:

- **Tool Assembly & Plugin Registry:** OpenClaw merges Pi's base tools (re-rooted to the active workspace or Docker sandbox) with OpenClaw's 20+ native tools (`browser`, `sessions_spawn`, `cron`, `memory_*`, `message`, etc.) plus any dynamically registered plugin tools (`resolvePluginTools`).
- **Multi-Layer Policy Filtering:** Before Pi ever sees the tools, OpenClaw filters the array through a cascading allow/deny pipeline (global profile → provider-specific rules → agent-specific rules → subagent restrictions → group/channel policies). Tools denied by policy are stripped from the schema list entirely so the LLM doesn't even know they exist.
- **Cross-Provider Schema Normalization (`cleanToolSchemaForGemini` / OpenAI Strict):** Different LLM providers reject valid JSON Schema features (for example, Gemini rejects `anyOf`/`oneOf` unions, `additionalProperties`, or `default` fields in certain positions, while OpenAI strict mode requires `additionalProperties: false` on every object). OpenClaw recursively rewrites and sanitizes every tool's TypeBox schema to match the active provider before passing it to Pi.
- **Execution Wrappers (`wrapToolWithBeforeToolCallHook` & Abort Signals):** OpenClaw wraps each tool's `execute` function to enforce runtime path guards (preventing `read`/`write` from escaping the workspace root), wire up composite `AbortSignal` timeouts, normalize return payloads, and emit plugin lifecycle telemetry.

### Summary Split

| Capability                                     | Owner                    | Implementation Detail                                        |
| ---------------------------------------------- | ------------------------ | ------------------------------------------------------------ |
| **JSON Schema argument validation**            | **Pi (`pi-agent-core`)** | TypeBox + AJV validation with automatic error feedback to the LLM. |
| **Parallel scheduling & source-order results** | **Pi (`pi-agent-core`)** | Concurrent `execute()` calls with ordered `toolResult` emission. |
| **Mid-batch steering interruption**            | **Pi (`pi-agent-core`)** | Cancels remaining batch tools cleanly if a user steering message arrives. |
| **Live tool progress streaming (`onUpdate`)**  | **Pi (`pi-agent-core`)** | Streams incremental stdout/progress via `tool_execution_update` events. |
| **RBAC / Sandbox / Subagent tool filtering**   | **OpenClaw**             | Strips unauthorized tools across an 8-layer policy cascade before registration. |
| **Provider-specific schema sanitization**      | **OpenClaw**             | Rewrites JSON Schemas to satisfy Gemini, Anthropic, and OpenAI quirks. |

Here is a detailed breakdown of how Pi's tool engine works under the hood, how TypeBox fits in, and where OpenClaw wraps it.

#### How Sophisticated Is Pi's Tool Loop & Scheduler?

Pi's tool loop (`agentLoop()` in `@mariozechner/pi-agent-core`) is intentionally **lean, deterministic, and non-agentic**—roughly 400 lines of TypeScript with zero hidden planning graphs or heuristic retries.

**Batch Execution Modes:** When an assistant message emits multiple tool calls, Pi checks `toolExecution` (`"parallel"` by default, or `"sequential"`) as well as per-tool `executionMode: "sequential"` overrides.

- In **parallel mode**, Pi runs `prepareToolCall` (lookup + AJV validation) for each call, fires all `execute()` promises concurrently via `Promise.all`, and buffers the completions so `toolResult` messages are appended in the **exact source order** the LLM emitted them.
- In **sequential mode**, it awaits each tool one by one, checking the `steering` queue between calls so an urgent user message can short-circuit the rest of the batch.

#### Can the loop/scheduler be replaced completely?

- **At the `pi-agent-core` level:** You cannot inject a custom scheduler plugin into `agentLoop()`, *because* `agentLoop` is just a plain async generator function exported by the library. If you want custom scheduling (such as DAG dependencies or distributed Temporal/Inngest activities), you either pass `executionMode: "sequential"` and handle batching inside a wrapper tool, or write your own 100-line loop calling `pi-ai`'s `streamSimple()` directly.
- **At the OpenClaw level:** OpenClaw supports registering completely custom agent harnesses via its Harness Registry (`src/agents/harness/`), which lets you swap out the underlying runtime engine entirely.

#### All Hooks Available Around Pi's Tool-Calling Process

Beyond `beforeToolCall` and `afterToolCall` on `AgentLoopConfig`, Pi provides several additional lifecycle hooks across its core and coding-agent layers:

- **`prepareArguments(args)` (Per-Tool Shim):** Defined directly on an `AgentTool` object. It runs *before* AJV JSON Schema validation to normalize quirky model outputs (for example, coercing stringified JSON arrays or legacy parameter names into the expected schema shape).
- **`beforeToolCall` (Core Loop Hook):** Runs *after* schema validation and *before* `execute()`. It can inspect validated parameters and return `{ block: true, reason: "..." }` to veto execution and feed the reason back to the LLM.
- **`afterToolCall` (Core Loop Hook):** Runs *after* `execute()` resolves or throws. It can rewrite `content`, replace `details`, or flip `isError` before the `toolResult` is committed to context and emitted.
- **`shouldStopAfterTurn` / `transformContext` / `convertToLlm`:** Loop-level hooks that let you inspect tool results right after a turn completes, prune stale tool outputs, or halt the loop early (e.g., to trigger context compaction or human approval).
- **Extension Events (`pi.on("tool_call", ...)` & `pi.on("tool_result", ...)`):** In `pi-coding-agent`, extensions can subscribe to `tool_call` (which can return `{ block: true }` or mutate input) and `tool_result` (which can modify output), plus community packages like [`@fyeeme/pi-hooks`](https://pi.dev/packages/@fyeeme/pi-hooks) expose Claude Code–style `PreToolUse`, `PostToolUse`, and `PostToolUseFailure` shell hooks. 

#### What Are the "Heavier Frameworks" Pi Contrasts With?

Pi was specifically built as a reaction against orchestration-heavy frameworks that wrap LLM calls in complex state machines, hidden prompts, and rigid abstractions:

- **LangChain / LangGraph:** Wraps tool execution in graph DSLs, state reducers, checkpointing layers, and multi-layered Runnable chains.
- **LlamaIndex / CrewAI / AutoGen:** Introduces multi-agent role-playing routers, planner-executor prompt templates, and opinionated memory/retrieval abstractions that consume thousands of tokens before your code runs.
- **Vercel AI SDK / OpenAI Agents SDK:** Provides higher-level `maxSteps` loops, provider-coupled tool helpers, and built-in handoff abstractions.

Pi strips all of that out: no planner prompts, no step-count caps, and no hidden graph engine.

#### How TypeBox Compares to Zod and Other TypeScript Schema Libraries

[`@sinclair/typebox`](https://thinkthroo.com/blog/typebox-a-json-schema-type-builder) is fundamentally different from **Zod**, **Yup**, or **Valibot**:

- **JSON Schema First (Zero Translation Overhead):** Zod defines a proprietary TypeScript validator object first and requires a separate converter (`zod-to-json-schema`) to generate the JSON Schema that LLM APIs require. **TypeBox objects \*are\* valid JSON Schema 7 objects at runtime** while simultaneously inferring static TypeScript types via `Static<typeof MySchema>`.
- **Performance:** Because TypeBox produces standard JSON Schemas, Pi compiles them with **AJV** (Another JSON Schema Validator), making runtime argument validation orders of magnitude faster than Zod's recursive parser.
- **Gotcha for LLM APIs:** Because TypeBox emits raw JSON Schema constructs (`anyOf`, `const`, `Type.Union`), providers like Google Gemini can reject complex unions—which is why Pi provides a `StringEnum` helper and OpenClaw runs a schema sanitizer over TypeBox outputs.
#### What Pi's API for Adding New Tools Looks Like

Adding a tool in Pi requires implementing a single `AgentTool` object (or calling `pi.registerTool(...)` inside an extension):

```typescript
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const LookupCatalogParams = Type.Object({
  entityRef: Type.String({ description: "Backstage entity ref, e.g. component:default/payments" }),
});

export const lookupCatalogTool: AgentTool<typeof LookupCatalogParams> = {
  name: "lookup_catalog",
  label: "Lookup Catalog", // Human-readable label for UIs
  description: "Fetch metadata for a service in the Backstage Software Catalog.",
  parameters: LookupCatalogParams,
  async execute(toolCallId, params: Static<typeof LookupCatalogParams>, signal, onUpdate) {
    // Optional: stream incremental progress while running
    onUpdate?.({ content: [{ type: "text", text: "Querying catalog..." }], details: {} });

    const data = await fetchEntity(params.entityRef, { signal });

    return {
      content: [{ type: "text", text: JSON.stringify(data) }], // Sent back to the LLM
      details: { status: 200, entityRef: params.entityRef },     // Stored in session log/UI, not sent to LLM
    };
  },
};
```

Note: In Pi, tools signal errors by throwing an `Error`, which `agentLoop` catches and converts into an `isError: true` `toolResult` message.

#### How OpenClaw Enforces Runtime Path Guards & Normalizes Return Payloads

Runtime Path Guards

Even though OpenClaw strips unauthorized tools during setup, an authorized `read`, `write`, or `edit` tool could still be tricked by prompt injection into reading `/etc/passwd` or escaping via symlinks. OpenClaw prevents this in two ways:

1. **Workspace-Scoped Tool Factories:** When OpenClaw instantiates Pi's file tools, it passes a custom `operations` adapter (or sandbox bridge) rooted to the agent's workspace or Docker container rather than raw `node:fs`.
2. **Pre-Execution Path Resolution (`assertSandboxPath` / `wrapToolWithBeforeToolCallHook`):** Before the underlying file operation runs, OpenClaw extracts path arguments (`path`, `file_path`, `cwd`), resolves relative segments and symlinks via `fs.realpath()`, and verifies that the canonical target path still starts with the allowed workspace/sandbox root directory—throwing a security error before any disk I/O happens.

#### Why OpenClaw Also "Normalizes Return Payloads" (If Pi Already Has `AgentToolResult`)

Pi defines the `AgentToolResult` contract (`{ content: (TextContent | ImageContent)[], details: unknown }`), and its loop turns thrown errors into error strings. However, OpenClaw integrates **external MCP servers, third-party plugins, and multi-provider quirks** that frequently violate clean assumptions, so OpenClaw adds a post-execution normalization pass:

- **Unstructured / Non-Conforming Plugin Outputs:** Third-party plugins or MCP tools sometimes return raw strings, plain JSON objects, `undefined`, or malformed `content` arrays instead of valid `{ content: [...] }` blocks. OpenClaw coerces these into valid `TextContent` / `ImageContent` blocks so downstream LLM adapters don't crash.
- **Size Truncation & Binary Stripping:** If a tool dumps a 2 MB log or base64 blob into `content`, OpenClaw truncates oversized text payloads and extracts or resizes images before they blow out the model's context window.
- **Provider-Specific Result Formatting:** Certain providers (like Anthropic vs. Gemini vs. OpenAI Responses) have strict rules around empty tool results, image MIME types inside tool outputs, or `toolCallId` formatting, which OpenClaw normalizes before committing the turn.

### Vercel AI SDK Tool Handling

The **Vercel AI SDK** (`ai` package) takes a declarative, schema-first approach to tools that sits right between Pi's bare-metal minimal loop and full graph frameworks like LangGraph.

Instead of requiring you to wire up an `Agent` class and event stream manually, Vercel AI SDK embeds the tool loop directly inside its core generation functions (`generateText` and `streamText`) or wraps them in a higher-level `ToolLoopAgent` abstraction.

#### Defining a Tool (`tool()` Helper)

In Vercel AI SDK, tools are plain TypeScript objects created with the `tool()` helper. Unlike Pi (which mandates TypeBox), Vercel AI SDK uses a **Standard Schema** abstraction that natively accepts **Zod**, **Valibot**, or raw **JSON Schema** (`jsonSchema()`).

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export const lookupCatalogTool = tool({
  description: 'Fetch metadata for a service in the Backstage Software Catalog.',
  inputSchema: z.object({
    entityRef: z.string().describe('e.g. component:default/payments'),
  }),
  // Optional: runs immediately when the LLM finishes streaming the tool's arguments
  execute: async ({ entityRef }, { toolCallId, messages, abortSignal }) => {
    const res = await fetch(`https://backstage.internal{entityRef}`, {
      signal: abortSignal,
    });
    return res.json(); // Automatically serialized back to the LLM
  },
  // Optional: decouple raw return value from what gets sent to the LLM context
  toModelOutput: ({ output }) => ({
    type: 'text',
    value: `Service owner: ${output.spec.owner}`,
  }),
});
```

**Key Structural Differences from Pi**

- **Context Injection in `execute`:** Alongside the validated arguments, `execute` receives an options object containing `toolCallId`, the full `messages` array up to that point, and an `abortSignal`.
- **Separation of UI vs. Model Output (`toModelOutput`):** Similar to Pi's `{ content, details }` split, Vercel AI SDK lets `execute` return a rich raw object (which gets sent to your frontend UI stream for rendering custom React components) while `toModelOutput` formats a lightweight summary specifically for the LLM's next turn.
- **Omitted `execute` (Human-in-the-Loop / Client-Side Tools):** If you omit the `execute` function, the SDK does not throw an error; instead, it halts the server loop and returns the `toolCalls` payload to your caller or frontend so a browser or human operator can execute it and submit the result on the next request.

#### How the Multi-Step Execution Loop Works (`stopWhen`)

By default, `generateText` and `streamText` run a **single step** (one LLM call, plus executing any tools requested in that call, then stopping). To turn it into an autonomous agent loop like Pi, you configure `stopWhen` (which replaced the older `maxSteps` API in AI SDK v5/v6).

```typescript
import { generateText, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await generateText({
  model: openai('gpt-4o'),
  tools: { lookupCatalog: lookupCatalogTool },
  // Loops until the LLM stops calling tools OR hits 10 steps
  stopWhen: stepCountIs(10),
  prompt: 'Who owns the payments service and what are its dependencies?',
});
```

- **Parallel Execution by Default:** When a model emits multiple tool calls in a single step, Vercel AI SDK executes all their `execute` functions concurrently with `Promise.all` and feeds all results together into the next step.
- **Custom Stop Conditions:** `stopWhen` accepts an array of predicates (such as `stepCountIs(n)` or `hasToolCall('final_answer')`), allowing you to terminate the loop immediately once a specific "finish" tool is invoked.

#### Lifecycle Hooks & Dynamic Loop Control (`prepareStep` & `onStepFinish`)

Where Pi gives you `beforeToolCall` and `afterToolCall`, Vercel AI SDK focuses heavily on **step-level** hooks and **per-tool** callbacks:

- **`prepareStep({ stepNumber, steps, messages })`:** Runs right before *each* LLM call inside the multi-step loop. You can use it to dynamically swap the `model` (e.g., use a cheap model for tool routing and a reasoning model for final synthesis), filter `activeTools` (progressive tool disclosure), or prune/compress `messages` mid-run.
- **`onStepFinish(stepResult)`:** Fires after every LLM generation + tool execution cycle completes, giving you full access to `text`, `toolCalls`, `toolResults`, and token `usage` for logging or database persistence.
- **Fine-Grained Tool Streaming Callbacks:** On individual tools, you can define `onInputStart`, `onInputDelta`, and `onInputAvailable` to inspect tool arguments *while the LLM is still streaming the JSON tokens* before `execute` even runs.
- **Built-In Approval Gate (`needsApproval`):** Tools accept a boolean or async predicate `needsApproval: async (input) => ...`. When true, the SDK pauses execution and emits a `tool-approval-request` chunk so your UI can prompt the user before running destructive actions.

#### Error Handling & Repair (`experimental_repairToolCall`)

- **Automatic Validation Feedback:** Like Pi, Vercel AI SDK validates incoming JSON arguments against your `inputSchema` and automatically converts validation failures or thrown `execute` errors into `tool-error` results sent back to the model so it can self-correct on the next step.
- **Pre-Validation Repair Hook:** Before failing on malformed JSON or invalid enum values, `experimental_repairToolCall` intercepts the broken tool call and lets you fix it programmatically—or pass it to a fast secondary model—before validation runs again.

#### How Vercel AI SDK Compares to Pi for a Backstage Plugin

| Dimension | Pi (`@mariozechner/pi-agent-core`) | Vercel AI SDK (`ai`) |
| --- | --- | --- |
| **Loop Architecture** | Explicit stateful `Agent` event emitter (`agentLoop`) | Stateless functional loop (`generateText` / `streamText` + `stopWhen`) |
| **Schema Library** | `@sinclair/typebox` + AJV | Zod, Valibot, or raw JSON Schema |
| **Tool Interception** | Per-tool `beforeToolCall` / `afterToolCall` hooks | Step-level `prepareStep` / `onStepFinish` + `needsApproval`  |
| **UI Integration** | Framework-agnostic async event stream | First-class React/Next.js hooks (`useChat`) with typed tool UI parts |
| **Bundle & Overhead** | Ultra-light (~1,000-token footprint, minimal abstractions) | Moderate (broader ecosystem features, provider-specific helpers) |

For a **Backstage IDP plugin** (which already uses React on the frontend and Node/TypeScript on the backend), Vercel AI SDK's `streamText` + `needsApproval` + `toModelOutput` pattern maps very cleanly to stateless Kubernetes pods and interactive React UI cards, whereas Pi shines if you want an ultra-minimal, stateful event-driven engine with zero framework opinions.

#### Does Vercel AI SDK Accept TypeBox?

**Yes, via its `jsonSchema()` helper.**

Vercel AI SDK's `tool({ inputSchema })` natively accepts Standard Schema validators (like Zod or Valibot) directly, and accepts raw JSON Schema objects wrapped in `jsonSchema(...)`. Because TypeBox objects *are* valid JSON Schema objects at runtime, you pass a TypeBox schema directly into `jsonSchema()` alongside a `Static<typeof Schema>` type parameter for full TypeScript inference:

```typescript
import { tool, jsonSchema } from 'ai';
import { Type, type Static } from '@sinclair/typebox';

const Params = Type.Object({
  entityRef: Type.String({ description: 'Backstage entity ref' }),
});

export const lookupCatalog = tool({
  description: 'Fetch metadata for a service',
  inputSchema: jsonSchema<Static<typeof Params>>(Params),
  execute: async ({ entityRef }) => {
    // entityRef is strictly typed as string
    return { owner: 'payments-team' };
  },
});
```

#### Vercel AI SDK vs. Pi: Full Footprint Comparison & Overlap

Both libraries solve the same core problem—**abstracting away vendor-specific LLM APIs and running tool-calling loops in TypeScript**—so their core LLM drivers overlap heavily. However, they expand outward in completely opposite directions.

| Footprint Area | Vercel AI SDK (`ai` + `@ai-sdk/*`) | Pi (`pi-ai`, `pi-agent-core`, `pi-coding-agent`) |
| --- | --- | --- |
| **Core LLM Driver** | **Overlaps heavily.** Unified interface (`generateText`, `streamText`) across 20+ providers via modular `@ai-sdk/*` packages. | **Overlaps heavily.** Unified interface (`streamSimple`, `complete`) across 15+ providers bundled in `@mariozechner/pi-ai`. |
| **Multimodal & Media** | **Broad.** First-class APIs for embeddings (`embed`), image generation (`generateImage`), transcription, and speech. | **Focused.** Text, vision inputs, tool calls, and thinking streams only (no embeddings or audio/image generation). |
| **Structured Outputs** | **First-class.** Built-in `Output.object()` / `generateObject` with streaming partial JSON objects. | **Manual.** Relies on tool calling or raw JSON prompting rather than a dedicated structured-output API. |
| **Session & Persistence** | **Stateless.** Leaves database/history storage completely up to your backend (e.g., PostgreSQL). | **Built-in.** Ships with `SessionManager` (tree-structured append-only JSONL files, branching, and auto-compaction). |
| **Interactive Steering**  | **Request-scoped.** Standard HTTP request/response turns; mid-run changes require aborting or `prepareStep`. | **First-class.** Stateful `Agent` class with dual `steering` (interrupt mid-batch) and `followUp` message queues. |
| **Coding & CLI Harness**  | **None in core.** Separate ecosystem packages (like Vercel Sandbox or `eve`) handle code execution. | **Built-in.** `pi-coding-agent` includes `Read`/`Write`/`Edit`/`Bash`, `SKILL.md` discovery, `AGENTS.md` loading, and a full TUI. |
| **Web Frontend UI** | **First-class.** Dedicated React, Vue, Svelte, and Angular hooks (`useChat`) + generative UI streaming. | **Terminal-focused.** Ships a terminal UI (`pi-tui`) and raw event streams, with no browser React hooks. |
| **Observability** | **Built-in.** Native OpenTelemetry (`experimental_telemetry`) spans for every LLM and tool call. | **DIY.** Exposes lifecycle events (`agent_end`, `turn_end`) with token/cost usage for custom logging. |

#### Would it make sense to use the two together?

**Generally no—you would end up paying for duplicate abstractions.**

- Because both `pi-ai` and Vercel AI SDK provide their own provider adapters, message formatters, and streaming parsers, putting both in the same project creates competing `Model` and `Message` types.
- **The one exception:** If you want **Pi's stateful agent runtime** (its `steering` queue, tree-structured JSONL sessions, or coding tools) on the backend, while using **Vercel AI SDK's React frontend (`@ai-sdk/react`)** in your Backstage UI. In that setup, you wouldn't install Vercel's backend `ai` core—you would just format your backend SSE endpoint to emit Vercel's **UI Message Stream Protocol** so `useChat` on the frontend renders Pi's streamed text and tool calls natively.

#### Are Vercel AI SDK's React Hooks a Separate Package from the Backend?

**Yes.** Since AI SDK 5.0+, the frontend UI hooks are completely decoupled from the core backend SDK so your frontend bundle never pulls in server-side provider code:

- **Backend / Core (`ai` + provider packages):** Installed in your Backstage backend plugin (`packages/backend`), e.g., `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, or `@ai-sdk/amazon-bedrock`.
- **Frontend React Hooks (`@ai-sdk/react`):** Installed separately in your Backstage frontend plugin (`packages/app` or `plugins/my-agent`), providing `useChat` and `useCompletion`. (There are also separate packages for `@ai-sdk/vue`, `@ai-sdk/svelte`, and `@ai-sdk/angular`.)

## Streams LLM Output to Clients

