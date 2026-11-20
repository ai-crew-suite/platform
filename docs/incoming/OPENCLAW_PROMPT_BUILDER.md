## OpenClaw Prompt Builder

In OpenClaw, the **prompt builder** is a modular, programmatic assembly engine that dynamically builds a custom system prompt from scratch for every single agent run.

Rather than relying on one static, monolithic text template, OpenClaw treats the system prompt like compiled code—stitching together over 20 independent TypeScript modules, live runtime telemetry, and local workspace Markdown files ("Project Context") based on what the agent actually needs at that exact moment. 

### The Three-Layer Assembly Pipeline

According to the [OpenClaw System Prompt documentation](https://docs.openclaw.ai/concepts/system-prompt), prompt construction happens in three distinct layers before hitting the LLM:

- **Runtime adapters (fact gathering).** The environment running the agent (such as the CLI, an embedded session, or a remote node) gathers live facts about the current turn. This includes available tools, active sandbox boundaries, channel capabilities (e.g., whether the chat supports voice notes or reply tags), and OS/host details.
- **Configuration facade (`buildConfiguredAgentSystemPrompt`).** This middle layer applies user- and agent-specific settings from your config file. It toggles rules like memory citation styles, text-to-speech hints, model aliases, and whether the agent should delegate tasks to sub-agents.
- **Pure renderer (`buildAgentSystemPrompt`).** Located in `src/agents/system-prompt.ts`, this core function takes all gathered inputs and runs them through 20+ modular builder functions (such as Safety, Tooling, Messaging, and Memory) to render the final prompt string.

### Prompt Modes (Token & Attention Budgeting)

To avoid wasting tokens or distracting the model with irrelevant rules, the prompt builder switches between three verbosity modes:

| Prompt Mode   | Intended Use Case                 | What Gets Included                                           |
| ------------- | --------------------------------- | ------------------------------------------------------------ |
| **`full`**    | Primary user-facing agents        | Everything: safety guardrails, full tool definitions, memory search rules, heartbeat schedules, and all workspace persona files. |
| **`minimal`** | Background sub-agents & cron jobs | Strips out personality files, memory guidance, and chat formatting rules, leaving only core tooling, safety, and workspace paths. |
| **`none`**    | Ultra-lightweight utility calls   | Retains only the bare-bones identity declaration.            |

### Workspace File Injection ("Project Context")

While OpenClaw auto-generates the structural scaffolding (tools, safety, and runtime facts), it injects your personal and project instructions from local Markdown files inside your workspace directory under a **Project Context** section:

- **`AGENTS.md`:** Your core operating manual defining workspace rules, safety boundaries, and how the agent handles files or external actions.
- **`SOUL.md`:** The agent's persona, communication style, and tone. The builder includes a hardcoded directive telling the model to embody this file's voice.
- **`USER.md` & `MEMORY.md`:** Persistent facts about your preferences, timezone, and long-term context so instructions compound across sessions.
- **`SKILL.md` (Just-in-Time):** Instead of dumping every workflow manual into the system prompt at once, the builder only injects a lightweight roster of available skills. When a specific task triggers a skill, its full `SKILL.md` instructions load on demand.

To protect the model's context window from overflowing, the builder enforces strict guardrails during injection—capping individual bootstrap files at 20,000 characters and total injected workspace content at 150,000 characters—while generating a prompt report on every run to track token usage.

### TypeScript Modules in Prompt Builder's Programmatic Assembly Engine

In OpenClaw's codebase, those "modules" are internal TypeScript helper functions and section builders living primarily inside `src/agents/system-prompt.ts`. Each builder function acts like a self-contained "module" that accepts runtime parameters, checks if it applies to the current session (for instance, returning an empty array `[]` if `promptMode === "minimal"`), and outputs an array of text lines that get concatenated into the final prompt.

As documented in the [OpenClaw System Prompt reference](https://docs.openclaw.ai/concepts/system-prompt), the builder stitches together roughly 20 distinct functional sections grouped by purpose:

- **Core Behavior & Guardrails:**
  - **Identity & Interaction Style.** Sets the base assistant identity, model line, and core communication rules.
  - **Safety.** Hardcoded prohibitions against power-seeking behavior, self-preservation, or bypassing human oversight.
  - **Execution Bias & Tool Call Style.** Instructs the model on when to act immediately versus asking for confirmation, plus a rule not to narrate routine tool calls.
  - **Promised Work & Care.** Guides follow-through on multi-step commitments and careful handling of destructive or external actions.
- **Capabilities & Extensibility:**
  - **Tooling.** Dynamically lists every tool currently permitted for that session along with short usage descriptions.
  - **Skills.** Injects a lightweight index of available skills and teaches the model how to load full `SKILL.md` files on demand.
  - **Memory.** Instructs the agent on when and how to proactively search `MEMORY.md` and handle context compaction flushes.
  - **Sub-Agent Delegation.** Adds orchestration rules (when `delegationMode` is active) telling the agent when to spawn hidden background sub-agents versus visible sidebar sessions.
- **Environment & Infrastructure Telemetry:**
  - **Runtime & Date/Time.** Injects live facts about the host machine, OS, shell, Node version, active LLM, git repo root, user timezone, and reasoning/thinking level.
  - **Workspace & Documentation.** Declares the active working directory path and points the agent to local OpenClaw documentation files.
  - **Sandbox.** Appears only when sandboxing is active, detailing container boundaries, allowed paths, and elevated execution rules.
  - **OpenClaw Control (Self-Update).** Explains how the agent can safely inspect or update its own gateway configuration when authorized.
- **Channel & Output Formatting:**
  - **Messaging & Reply Tags.** Directs the agent to use OpenClaw's native message routing rather than raw shell/HTTP workarounds, and supplies platform-specific reply/reaction syntax.
  - **Assistant Output Directives.** Provides compact rules for formatting file attachments, voice notes, and text-to-speech (TTS).
  - **UI Presentation & Collapsible Details.** Appears when rich UI tools are available, governing how to render interactive widgets, dashboards, or collapsible blocks.
  - **Heartbeats.** Defines background polling schedules and acknowledgment (`ack`) behavior for proactive autonomous runs.
- **User Context:**
  - **Workspace Files (Project Context).** Appends the contents of your local Markdown files (`AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, and `MEMORY.md`) at the bottom of the prompt.

