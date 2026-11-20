# Common Design Flaws

## Over-Engineering & Framework Traps

- **Adopting heavy frameworks too early.** Developers often install massive orchestration libraries before writing a single custom tool, getting buried in rigid abstractions and hidden prompt magic. The core loop of a great agent is usually a simple `while` loop with clean JSON tool calls, which is far easier to debug when built from scratch.
- **Giving the agent too many tools at once.** Dumping 40 different tools and API endpoints into the system prompt destroys tool-selection accuracy and burns tokens on every turn. Reliable agents expose a small core set of general tools (like bash, file I/O, and search) or load specialized skills dynamically only when needed.
- **Forcing LLM reasoning for deterministic tasks.** Using an LLM to parse dates, filter JSON arrays, run regex, or check if an inbox has new mail is slow, expensive, and error-prone. Good agent design pushes deterministic logic into standard code and reserves the LLM strictly for ambiguous decisions.

## Prompt & Context Anti-Patterns

- **Dumping raw tool outputs into the conversation history.** Passing a 15,000-token web scrape or massive terminal log straight back into the message array poisons the context window for every subsequent turn. You must truncate, summarize, or save large outputs to a temporary file and give the agent only a preview and file path.
- **Writing vague, human-oriented tool schemas.** Developers write docstrings like `"Searches the database"` without explaining parameter formats, edge cases, or what happens on empty results. The LLM relies entirely on tool descriptions as its user manual, so poor schemas directly cause hallucinated arguments and broken calls.
- **Prompt-stuffing rules to fix bugs.** Every time the agent makes a mistake, developers add another `"NEVER do X"` line to the system prompt until it becomes a 4,000-word wall of contradictory instructions. Instead of patching bugs with longer prompts, fix the underlying tool interface or add a deterministic validation check.

## Control Loop & Error Handling Mistakes

- **Swallowing error messages or hiding stack traces.** Returning a generic `"Command failed"` string when a tool breaks forces the agent to blindly guess what went wrong and repeat the exact same failing action. Returning clear, actionable error messages (e.g., `"File not found at /tmp/x; existing files are /tmp/y"`) lets the model self-correct on the next turn.
- **Missing circuit breakers and step limits.** Without hard caps on consecutive retries, token spend, and loop iterations, a confused agent will happily burn $50 overnight trying to fix a syntax error in a loop. Always enforce strict turn budgets and detect repeated identical tool calls to break deadlocks automatically.
- **Building fragile multi-agent hierarchies too early.** Splitting a simple personal assistant into a "Manager Agent," "Researcher Agent," and "Coder Agent" multiplies latency, token costs, and communication bugs. Start with a single strong loop and introduce isolated sub-agents only when a task genuinely requires a clean context window.

## Security & Evaluation Blind Spots

- **Relying on prompt instructions for security.** Telling an agent `"Never delete system files or leak API keys"` in the system prompt offers zero real protection against prompt injection or hallucination. Security boundaries must be enforced in hard code—using OS permissions, container mounts, and approval gates—never in natural language.
- **Testing only happy-path prompts.** Developers test their agent on clean, polite requests in a controlled terminal and assume it is ready for production. Real-world failures happen on malformed inputs, expired auth tokens, half-completed tasks, and ambiguous follow-up messages—which you only catch by logging every trace and building replayable evals from real failures.

## State & Memory Design Flaws

- **Conflating conversation history with system state.** Developers often treat the chat message array as the database for the entire agent. When the context window gets compacted or trimmed to save tokens, critical task state—like which files were already modified or which step of a multi-part job finished—gets wiped out.
- **No separation between raw logs and curated memory.** Writing every user message and tool output straight into long-term vector storage creates massive retrieval noise. Reliable agents keep raw transcripts separate from a small, structured "working memory" file (such as a `MEMORY.md` or user profile table) that is deliberately updated and pruned.
- **Unbounded memory growth without eviction.** Appending daily notes forever without archiving or summarizing old entries causes memory injection to slowly crowd out the active task context. Every memory store needs a clear retention window and compaction strategy.

## Tool & Environment Interface Flaws

- **Designing read-write tools without preview or dry-run modes.** Giving an agent a single `update_database` or `send_bulk_email` tool forces it to act blind without inspecting the blast radius first. Splitting destructive actions into a read/preview step and an explicit commit step dramatically lowers error rates.
- **Assuming stateless tools when the environment is stateful.** Developers write tool wrappers assuming each call is independent, ignoring that `cd` commands, environment variables, browser tabs, and database transactions carry state across turns. If the agent loses track of its current working directory or active browser tab, subsequent tool calls fail unpredictably.
- **Returning unstructured blobs instead of structured observations.** Returning massive walls of unformatted text forces the LLM to burn reasoning tokens just parsing the output. Returning clean, concise JSON or Markdown summaries with explicit status fields makes downstream reasoning far more reliable.

## Concurrency & Lifecycle Flaws

- **Tightly coupling the messaging interface to the execution loop.** Running the LLM loop directly inside a Telegram or Slack webhook handler causes platform timeouts, duplicate retries from the messaging provider, and dropped runs when a message takes two minutes to process. The messaging gateway must immediately acknowledge incoming events, push them onto a persistent queue, and process them asynchronously.
- **Ignoring idempotency on restarts and retries.** When a daemon crashes mid-turn and restarts, replaying the last unprocessed message without checking what side effects already occurred can send duplicate emails or charge APIs twice. Every external write action should track an idempotency key or check current state before executing.
- **Polling aggressively instead of using event-driven triggers.** Writing cron loops that wake up the LLM every 60 seconds to ask *"Anything new?"* wastes money and creates constant race conditions. Use lightweight OS file watchers, webhooks, or cheap deterministic scripts to wake the LLM only when an actual state change occurs.

## Autonomy & UX Design Flaws

- **Binary autonomy (all-or-nothing permissions).** Systems often force a bad choice between asking permission for every trivial `ls` command or giving unrestricted root access. Good designs tier permissions by reversibility: local read-only actions run freely, local reversible writes are auto-logged, and external or irreversible actions pause for confirmation.
- **Hiding internal state from the user.** When an agent runs silently for a minute and returns a wrong answer with no explanation of what commands it ran or what files it touched, the user loses trust immediately. Exposing lightweight execution traces—such as a collapsible summary of tools called and files changed—makes debugging effortless and builds confidence.

## Prompt & Context Contamination

- **Few-shot poisoning from past mistakes.** When an agent fails a tool call and you keep that broken exchange in the chat history, the LLM sees its own past failure as a pattern to imitate and repeats the exact same bad call. You should prune or rewrite failed retry chains once a step succeeds so the context only reflects clean examples.
- **Prompt-injection cross-contamination across channels.** If your agent reads an untrusted public webpage or spam email in one turn and then checks your private messages in the next turn within the same session, malicious instructions from the public data can hijack private actions. Isolate untrusted external data into disposable sub-agent sessions that lack write permissions to personal tools.
- **System prompt drift from self-editing.** Allowing an agent to update its own core instructions (`SOUL.md` or system rules) based on user feedback often leads to the agent deleting critical safety rules or warping its own persona over time. Keep core system invariants locked as read-only while letting the agent edit only a separate preferences file.

## Tool & Execution Blind Spots

- **Silent truncation of critical outputs.** When you cap tool outputs at 4,000 characters to save tokens, the error message or target line at the very bottom of a log file gets cut off, leaving the agent blind to why a command failed. Always truncate from the middle—preserving the head and the tail of stdout/stderr—and save the full output to a temp file the agent can inspect if needed.
- **Interactive CLI hangs.** Running standard terminal commands like `git commit` (opening Vim), `apt install` (waiting for `[Y/n]`), or `ssh` password prompts will freeze a headless bash tool until it times out. Force non-interactive flags (`-y`, `DEBIAN_FRONTEND=noninteractive`, `GIT_EDITOR=true`) and wrap every subprocess in a strict execution timeout with process-group cleanup.
- **Time-of-check to time-of-use (TOCTOU) race conditions.** An agent often checks a file or calendar slot, spends 15 seconds reasoning, and then writes to it assuming nothing changed in between. Use atomic file writes (write to temp file, then rename) and ETags or version checks when modifying external resources.

## Cognitive & Planning Traps

- **Premature optimization and over-planning.** Asking the agent to generate a 15-step master plan before inspecting the environment leads to brittle hallucinations when step 2 reveals unexpected reality. Design the agent to plan iteratively—inspect first, take one reversible step, observe the result, and adjust.
- **Confusing activity with progress.** Without clear stopping criteria, an agent given a vague goal like *"Research and organize my notes"* will endlessly refactor files, rewrite summaries, and burn tokens without ever finishing. Define explicit exit conditions and cap total tool calls per user request.
- **Inability to say "I don't know" or "I can't do that."** Models trained to be relentlessly helpful will invent fake workarounds, mock data, or fragile hacks rather than admitting a tool is missing or an API is broken. Explicitly instruct the agent to surface blockers immediately when a prerequisite fails rather than fabricating partial results.

## Maintenance & Upgrade Traps

- **Hardcoding model-specific quirks into core logic.** Writing custom regex parsers or XML tag workarounds tailored to one specific LLM provider makes switching models later painful and brittle. Rely on standard native tool-calling schemas and keep model-specific adapters cleanly separated from your core execution engine.
- **Zero visibility into token economics per workflow.** Developers often look only at their total monthly API bill, missing that a single background cron job or runaway memory-summarization loop is eating 80% of their budget. Tag every LLM call with a session and workflow ID so you can audit cost-per-task and kill expensive loops early.

## Core Best Practices for Agent Design

- **Start with workflows, add autonomy only where needed.** Instead of giving one massive prompt complete freedom, break complex goals into deterministic code steps with small LLM decision points in between.
- **Design tools for the LLM, not for humans.** Write crystal-clear tool descriptions, use strict schema validation (like Pydantic), and return concise, actionable error messages so the agent can self-correct when a tool fails.
- **Isolate context and state.** Keep raw logs, large tool outputs, and untrusted web scrapes out of your main conversation history. Store persistent facts in structured external files or databases, and pass only relevant summaries into the active prompt.
- **Use tiered verification.** Never rely on the LLM to grade its own work blindly. Combine fast, deterministic code checks (for syntax, schemas, and file existence) with smaller "LLM-as-a-judge" models for subjective quality.
- **Build an observability loop from day one.** Record every LLM call, reasoning step, and tool execution separately rather than lumping an entire run into one log, so you can see exactly where tokens spiked or logic broke.