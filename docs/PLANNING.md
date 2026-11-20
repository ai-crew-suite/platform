# Planning

You should **generate structured requirements and architectural decision records (ADRs) first** before attempting an implementation plan. Feeding several hundred pages of raw notes directly into GitHub Copilot (even with large-context models) causes "lost in the middle" degradation, where the AI drops edge cases, hallucinates glue code, and misses subtle constraints you discovered during your first pass.

To get an enterprise-grade rewrite without losing your hard-won lessons, use a **staged, bottom-up distillation workflow** inside your workspace.

### Phase 1: Triage & Normalize Raw Notes

Before asking Copilot to plan anything, compress your hundreds of pages into clean, structured markdown files inside a temporary `docs/discovery/` folder in your repo.

- **Group by Subsystem:** Split your raw notes into thematic files matching your rough architecture (e.g., `01-fluent-api-dx.md`, etc.).

```bash
platform/docs/
├── incoming/          # Step 0: Raw notes (Read-only archive)
├── discovery/         # Step 1: Output of Extraction Passes (Temporary staging)
│   ├── 01-fluent-graph-builder-notes.md
│   ├── 02-temporal-execution-notes.md
│   ├── 03-memory-and-mem0-notes.md
│   ├── 04-tools-and-capabilities-notes.md
│   ├── 05-agents-and-evals-notes.md
│   └── 06-backstage-and-nfrs-notes.md
├── requirements/      # Step 2: Output of Synthesis Pass (Deduplicated REQ-xxx IDs)
│   ├── 00-INDEX.md
│   ├── 01-workflow-authoring-sdk.md   # Fluent API, Graph IR, Type Safety
│   ├── 02-durable-execution-engine.md # Orchestration, Temporal Driver, Serialization, Human Signals
│   ├── 03-agent-reasoning-runtime.md  # Vercel AI SDK, Streaming, Guardrails, Evals
│   ├── 04-tool-and-capability-registry.md # Tool Interface, Auth, Token Broker, MCP
│   ├── 05-context-memory-and-rag.md   # Checkpoints, Mem0 Long-Term Memory, Backstage Catalog RAG
│   ├── 06-backstage-control-plane.md  # Plugin Architecture, Extension Points, Observability, NFRs
│   └── 07-nfrs-security-observability.md # (cross-cutting) Security, Secrets, Observability, Resilience, Testing & Evals, Coding Standards
├── plans/             # Step 3: Output of Planning Pass (Cites REQ-xxx IDs)
└── adr/               # Architectural Decision Records (resolves conflicts in incoming/)
```

- **Run Extraction Passes:** The output of the extraction passes goes into `discovery`. Feed one thematic file at a time to Copilot Chat (`@workspace` or `#file`) and ask it to extract only:
  - **Hard Constraints** (things the system *must* or *must not* do).
  - **Failure Modes from v1** (specific bugs, race conditions, or DX friction you encountered).
  - **Open Questions** (unresolved trade-offs in your notes).
- **Verify No Drops:** Have Copilot output a traceability table mapping every paragraph or section of your raw note to a bullet point in the distilled file so you can quickly audit that nothing was skipped.

### Phase 2: Generate Requirements & ADRs (The "Contract" Layer)

Once your notes are distilled into ~20–30 pages of dense, structured context, use Copilot to produce formal artifacts that act as the ground truth for code generation.

- **Write Functional & Non-Functional Requirements (FR/NFRs):** Ask Copilot to generate numbered requirements (`REQ-001`, `REQ-002`) per subsystem. Numbering them allows you to force Copilot to cite requirement IDs later when writing the implementation plan.
- **Lock Down Architectural Decision Records (ADRs):** Create short markdown files in `docs/adr/` for your trickiest boundaries. Key ADRs for your stack include:
  - **Determinism Boundary:** How Vercel AI SDK calls and tool executions are wrapped inside Temporal Activities so workflow replay never breaks.
  - **State & Memory Lifecycle:** What lives in Temporal Workflow state (execution cursor, step outputs) versus Mem0 (long-term cross-run semantic memory) versus Backstage's database.
  - **Fluent API Type Inference:** How TypeScript generics flow across chained `.addStep()` and `.addChoice()` calls without collapsing into `any`.
  - **Auth & Tenant Context:** How Backstage user credentials (`BackstageCredentials`) are serialized, passed into Temporal, and injected into the tool layer safely.

### Phase 3: Build a Layered Implementation Plan

With requirements and ADRs saved in your repository, Copilot can reference them deterministically via `#file` attachments without needing your hundreds of pages of raw notes.

- **Layer 0: Core Contracts & Types:** Plan the shared interfaces, Zod schemas, error taxonomy, and the fluent builder's public TypeScript signature first. Do not plan Temporal or LLM wiring yet.
- **Layer 1: Vertical Slice (Walking Skeleton):** Plan a minimal end-to-end execution path—one fluent workflow definition, one Temporal workflow/activity wrapper, one mock tool, and one Backstage backend route.
- **Layer 2: Subsystem Expansion:** Generate separate, focused implementation plans for each subsystem (Mem0 integration, Vercel AI SDK streaming bridge, tool layer extension points, guardrails/timeouts) referencing the `REQ-xxx` IDs from Phase 2.
- **Layer 3: Migration & Parity Verification:** Plan how your existing workflows will port to the new fluent API and map your v1 failure modes to integration test cases.

### Practical Copilot Tips for Large Plans

- **Use Custom Instructions (`.github/copilot-instructions.md`):** Document your repo conventions, strict TypeScript rules, Backstage backend patterns, and a rule that Copilot must cite `REQ-xxx` IDs in every implementation task.
- **Force "Gap Analysis" Prompts:** After Copilot generates a plan for a layer, run a second prompt in a fresh chat session: *"Review `#file:plan-layer-1.md` against `#file:requirements.md` and `#file:v1-shortcomings.md`. List every requirement or failure mode that is not explicitly addressed in the plan."*
- **Keep Context Windows Clean:** Start a new Copilot Chat thread for each subsystem or phase. Long threads accumulate stale assumptions and degrade output quality.

## Files Analyzed

```bash
_AGENT_Q_AND_A.md
AGENT_COMMON_DESIGN_FLAWS.md
AGENT_EVALS.md
AGENT_RECONCILIATION_CONTROLLER_KAZI.md
ARCHITECTURE_WHITE_PAPER.md
AUDIO_PROMPTS_AND_TRANSCRIPTION.md
CACHE_MEMCACHE_AND_REDIS.md
CODING_STANDARDS.md
FLUENT_GRAPH_BUILDER.md
FLUENT_GRAPH_BUILDER_CLASS_DESIGN.md
GRAPH_ORCHESTRATOR_INTEGRATION.md
LLM_OBSERVABILITY_WITH_LANGFUSE.md
MCP.md
MEM0.md
MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md
ONBOARDING.md
OVERALL_BLUEPRINT.md
PI_AGENT.md
PLATFORM_MISSING_FEATURES.md
SECRETS_MANAGEMENT.md
STORAGE_RUNTIME_README_PERSISTENT_STATE.md
TEMPORAL_BRIDGE.md
TEMPORAL_WORKER.md
TEMPORAL_WORKERS_AND_SCHEDULES.md
TOOLS.md
TOOL_REGISTRY_AND_STATE_SERIALIZER_IMPLEMENTATION_PLAN.md
TOOLS_CATEGORIES.md
TOOLS_EXPLANATIONS.md
TOOLS_INTERFACE.md
TOOLS_INTERFACE_OPTIONS.md
TOOLS_PERMISSIONS_RBAC.md
TOOLS_REGISTRY.md
TOOLS_TEMPORAL_PAYLOAD_CODEC.md
TOOLS_TOKEN_BROKER.md
TOOLS_VERCEL_AI_SDK.md
VECTOR_DATABASES_THRU_MEM0.md
WRITING_AN_AGENT.md
```

## Copilot Advice

**Keep the subsystem names as navigation, and use stable requirement IDs as the contract.** `durable-execution-engine` is a useful place to find requirements; `REQ-023` is what a plan task, ADR, or acceptance test should cite. Neither needs to mirror the current `platform-backend/` layout.

## Requirements structure

I’d start with **one Markdown file per subsystem plus `00-INDEX.md`** in `requirements/`, as `PLANNING.md` already proposes. Don’t create a folder per subsystem or a file per requirement yet. Split a subsystem when its document becomes hard to review or when sections need distinct owners; the IDs should survive the move.

- Use one **globally unique** `REQ-###` sequence. Don’t restart numbering per subsystem, encode subsystem names into IDs, or renumber after review.
- Give each requirement one testable **shall** statement, an FR/NFR label, a release scope (`rewrite baseline` or `later`), a verification method, and a link back to its discovery source. Link an ADR when the decision matters.
- Give each requirement one canonical home. Keep subsystem-specific NFRs near the behavior they constrain; keep platform-wide guarantees in the cross-cutting file and link to them rather than duplicating them.
- Keep unresolved choices and unagreed targets out of the accepted baseline. A discovery heading is evidence to review, not automatically a requirement.

## Requirements and ADRs before the plan

I’d write them **together in small review batches**, not finish every requirement before starting any ADR. Requirements say what must hold; ADRs record the chosen boundary, alternatives, and consequences. The four you identified are the right starting points:

| ADR                        | Decision to settle before planning                           |
| -------------------------- | ------------------------------------------------------------ |
| Determinism boundary       | Keep orchestration and routing deterministic; put model calls and external tool execution in Activities. Specify retry and idempotency separately: replay safety does not mean an external write happens exactly once. |
| State and memory lifecycle | Separate live execution authority in Temporal, durable product records or projections in Backstage’s database, and non-authoritative cross-run recall in Mem0. The discovery notes describe checkpoints in both `execution` and `memory`; settle which store can drive resume and which records are projections, exports, or recovery artifacts. |
| Fluent API type inference  | Define what `.addStep()` carries forward and what `.addChoice()` guarantees at a branch join. Prove the contract with compile-pass and compile-fail examples before committing to a builder implementation. |
| Auth and tenant context    | Reframe this as **what identity context may cross into Temporal**, not how to serialize `BackstageCredentials`. Persist minimal tenant/principal identifiers or a non-authorizing reference, not live credentials. Decide how the tool boundary obtains fresh, narrowly scoped authority and what happens if access is revoked while a run waits. |

## Model and complexity

I’d use **Claude Opus 5.5**, if available in your Copilot picker, with high reasoning for synthesis and cross-subsystem review. I’d work one subsystem at a time with the relevant neighboring contracts attached, then run a fresh gap-analysis pass against the source notes. I wouldn’t ask any model to turn the entire archive into a specification in one shot.

I’d rate the **requirements and ADR work high complexity** and the **rewrite very high complexity**. The hard part isn’t writing Markdown. It’s reconciling overlapping proposals, separating V1 lessons from future ideas, and making failure behavior explicit across replay, retries, authorization, and state ownership.

**My recommended first batch:** agree on the rewrite baseline and the requirement template, then draft the SDK and durable-execution requirements alongside the determinism and type-inference ADRs. Resolve state ownership and delegated auth before approving the first end-to-end slice. Then build the Layered Implementation Plan around **core contracts → a Backstage-to-Temporal walking skeleton → subsystem expansion → migration and parity**, with each task citing the requirements it satisfies and each baseline requirement mapped to verification. No files changed yet.

By “agree on the rewrite baseline,” I meant decide what the first release of the rewritten platform must support before it can replace V1. That’s broader than the first end-to-end demo and narrower than everything in the research notes.

For example, the walking skeleton might run one typed workflow from Backstage through Temporal using a mock tool. The release baseline could additionally require authorization for production tools, recovery after a worker restart, and migration of a named set of V1 workflows. Whether Mem0 ships in that release or follows later is a scope decision. I’d record required for cutover, deferred, and undecided separately so drafts don’t turn open questions into commitments.

By “agree on the requirement template,” I meant settle on the repeatable format Copilot should use for every requirement. I’d start with an ID and title, FR/NFR, release scope, one testable shall statement, how to verify it, and links to the discovery source and any relevant ADR. For example:

**REQ-001 — Reject invalid workflow graphs**
**Type:** FR · **Scope:** Rewrite baseline
**Requirement:** The SDK shall reject a workflow definition with a transition to a nonexistent step before the definition can be submitted for execution.
**Verification:** An SDK test builds a graph with a dangling transition and confirms validation fails and identifies the transition.

That’s an illustrative requirement, not an assigned ID or an approved commitment.

## Proposed layout

I’d keep the existing `PLANNING.md` as the guide to the process. In `requirements/`, put the template and ID rules in the index, and give release scope its own short `BASELINE.md`. Keep one requirements file per subsystem, one file per decision in `adr/`, and one file per implementation layer in `plans/`.

```bash
docs/
├── PLANNING.md
├── requirements/
│   ├── 00-INDEX.md                         # Navigation, ID rules, requirement template
│   ├── BASELINE.md                         # Cutover scope, deferrals, open scope decisions
│   ├── 01-workflow-authoring-sdk.md
│   ├── 02-durable-execution-engine.md
│   ├── 03-agent-reasoning-runtime.md
│   ├── 04-tool-and-capability-registry.md
│   ├── 05-context-memory-and-rag.md
│   ├── 06-backstage-control-plane.md
│   └── 07-cross-cutting-requirements.md      # Security, observability, reliability, etc.
├── adr/
│   ├── 0001-determinism-boundary.md
│   ├── 0002-state-and-memory-lifecycle.md
│   ├── 0003-fluent-api-type-inference.md
│   └── 0004-auth-and-tenant-context.md
└── plans/
    ├── 00-INDEX.md                         # Layer dependencies and REQ-to-plan coverage
    ├── 01-core-contracts-and-types.md       # Layer 0
    ├── 02-walking-skeleton.md               # Layer 1
    ├── 03-subsystem-expansion.md            # Layer 2; split later if needed
    └── 04-migration-and-parity.md           # Layer 3
```

The file prefixes are for reading order; `REQ-###` IDs are globally unique and don’t change if a requirement moves. I’d draft the baseline and template first, test both against the SDK and durable-execution requirements, and create the plan files only once the relevant requirements and ADRs are reviewed.

I’d drop the cutover and migration framing, but keep the layered implementation plan. The layers tell you what to build and validate in what order, not what to publish. The walking skeleton is an internal milestone, not an MVP you owe anyone.

I’d revise the plan in three ways:

Replace BASELINE.md with RELEASE-SCOPE.md. Define what the first public release must deliver and what evidence makes it ready to ship. Treat the features you’ve outlined as launch scope unless you explicitly defer them. A feature scheduled for a late implementation layer is still a launch requirement.

Replace 04-migration-and-parity.md with 04-release-readiness.md. Don’t plan to port LangGraph workflows, migrate old data, or preserve old interfaces. Keep the lessons from V1: turn known failure modes into acceptance tests where they still apply. The final layer verifies the promised workflows end to end, including recovery, authorization, and clean installation. Those checks should start earlier; this layer is where you confirm coverage and close gaps.

Use pre-release freedom to refine the contracts, then test how they evolve. Change the fluent SDK, graph format, and internal schemas while they’re private. Before publishing, decide which surfaces users can depend on and prove that a representative upgrade preserves workflow definitions and in-flight Temporal runs. You don’t need compatibility with the prototype; you do need a credible path from your first public release to the next one.

I’d still write numbered requirements and the key ADRs before the detailed implementation plan. The project is simpler without migration, but the architecture is still high complexity. The main risk now is discovering late that a design works for the walking skeleton but can’t support a feature you intend to ship. Plan against the full launch scope, and use early internal slices to test the decisions that would be most expensive to reverse.

1. **Yes—work through `discovery/` one primary file at a time, but treat the file as a unit of review, not a hard architectural boundary.** Start with `01-workflow-authoring-sdk.md` as a pilot. Pull in the relevant parts of `02-durable-execution-engine.md` for graph serialization, branch semantics, and the compiler-to-worker handoff. If a requirement belongs to another subsystem, record the dependency rather than writing it twice.
2. **Yes—start a new chat for each subsystem, not for each revision.** Keep drafting and feedback in the same chat until that batch is reviewed. In the next chat, attach the primary discovery file, the requirements index and release scope, and only the neighboring requirements or ADRs it needs. Carry decisions forward in the docs, not in chat history. If you draft in parallel, assign permanent `REQ-###` IDs during a single merge pass to avoid collisions.
3. **Use one reusable prompt with three modes.** Use all seven files to map the scope at kickoff and to audit coverage at the end. Use one primary file at a time to write requirements. I wouldn’t ask for all seven finished specs in a single pass.

I meant **one existing source file and two proposed companion documents**:

| Term                       | File                                              | What it’s for                                                |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| **Primary discovery file** | For the SDK chat: `01-workflow-authoring-sdk.md`  | The existing research notes you’re turning into requirements in that chat. “Primary” just means it’s the main input; you can still reference neighboring notes. |
| **Requirements index**     | `docs/requirements/00-INDEX.md` *(proposed)*      | The shared guide to writing and finding requirements: subsystem links, `REQ-###` numbering rules, and the requirement template. |
| **Release scope**          | `docs/requirements/RELEASE-SCOPE.md` *(proposed)* | The shared record of what must ship in the first public release, what’s explicitly deferred, and what’s still undecided. It doesn’t say what to build first. |

**For the kickoff, you don’t need to attach the last two—they don’t exist yet.** The `KICKOFF` prompt drafts them from the discovery notes. Once you’ve reviewed those drafts, use them alongside the SDK discovery file in the first `SUBSYSTEM` chat.

You don’t need to know the ADR filenames before you start. One job of each subsystem pass is to **identify decisions that deserve an ADR**. The four we discussed are starting candidates, not a required list, and there’s no one-to-one mapping between the seven specs and the ADRs.

## Copy / Paste Prompt

For your first SDK pass, I’d let the agent write the requirements draft and propose ADRs in chat:

```markdown
WRITE FILES: YES

Create or update only docs/requirements/01-workflow-authoring-sdk.md.

If you find a decision that needs an ADR, check docs/adr/ for an existing
record. If none covers it, propose a title and filename in chat. Explain
what decision is needed, the main alternatives, and which requirements
depend on it.
```

For example, the SDK pass might surface **what types are guaranteed after `.addChoice()` branches rejoin**. That could become a Fluent API Type Inference ADR. You can review that proposal and ask the same chat to write the ADR before closing out the SDK pass.

Start with `MODE: KICKOFF`. For the first drafting chat, switch to `MODE: SUBSYSTEM` and set `PRIMARY` to `docs/discovery/01-workflow-authoring-sdk.md`.

```markdown
MODE: KICKOFF | SUBSYSTEM | ADR_BATCH | AUDIT
```



```markdown
MODE: SUBSYSTEM
PRIMARY: docs/discovery/01-workflow-authoring-sdk.md
WRITE FILES: YES

You are helping specify AI Crew Suite, a greenfield agentic workflow
platform for Backstage. Where older planning notes conflict with the
direction below, follow this prompt.

## Project Direction
- There are no users, legacy data migrations, or compatibility obligations
  to the LangGraph prototype. Use V1 notes for lessons and failure cases,
  not as a mandate to keep old code or APIs.
- The first public release must deliver the agreed launch scope. Internal
  implementation layers are for sequencing and validation, not releases.
  A feature implemented late is not automatically deferred.
- Treat outlined product capabilities as launch candidates unless explicitly
  deferred. Do not treat every design sketch, optional integration, or
  implementation suggestion as an approved launch requirement.
- The current plugin layout is provisional. Specify contracts and ownership
  before choosing package or source-file boundaries.
- Leave discovery notes, incoming notes, and existing code unchanged.
  Consult `docs/incoming` or `_`-prefixed older notes only to resolve a
  specific ambiguity or recover a missing source.
- Do not implement code or write the Layered Implementation Plan yet.
  If WRITE FILES is NO, return drafts and proposed paths in chat.

---

## MODE: KICKOFF
Create or update ONLY:
- `docs/requirements/00-INDEX.md`
- `docs/requirements/RELEASE-SCOPE.md`
- `docs/adr/00-PROPOSED-ADRS.md`

1. Survey all seven `docs/discovery/` files using headings and targeted
   section reads (do not read all seven files end-to-end). Produce a launch
   capability map grouped by subsystem distinguishing: Confirmed Direction,
   Proposed Launch Scope, Explicit Deferrals, and Unresolved Scope Decisions.
   State explicitly what you did and did not review.
2. Draft `docs/requirements/RELEASE-SCOPE.md` and `docs/requirements/00-INDEX.md`
   (mark both as `Status: Draft`). In `00-INDEX.md`, define:
   - Scope labels (`Launch`, `Deferred`, `Undecided`).
   - The exact Markdown requirement template.
   - Pre-allocated non-overlapping `REQ-###` numeric blocks per subsystem
     (e.g., `REQ-001`–`099` Cross-Cutting, `REQ-100`–`199` Subsystem 01, etc.)
     so parallel passes never collide.
   - The source coverage table format.
3. Initialize `docs/adr/00-PROPOSED-ADRS.md` as an empty staging log with a
   header explaining that subsystem passes append proposed ADRs here, and a
   standard entry template (`PROP-###`, Proposed Slug, Originating Subsystem,
   Context/Decision Needed, Alternatives & Trade-offs, Dependent `REQ-###` IDs).
4. Flag conflicting notes, unclear ownership, and decisions that block
   drafting or alter architectural boundaries. Recommend the optimal order
   for the 7 subsystem passes. Do not generate full requirements yet.

---

## MODE: SUBSYSTEM
Create or update ONLY:
- The target requirements file specified in PRIMARY (e.g., `docs/requirements/01-workflow-authoring-sdk.md`)
- `docs/adr/00-PROPOSED-ADRS.md` (append new proposals only)

Do NOT create or edit individual `docs/adr/ADR-###-*.md` files in this pass.

1. Read PRIMARY in bounded sections. Read `RELEASE-SCOPE.md`, `00-INDEX.md`,
   `docs/adr/00-PROPOSED-ADRS.md`, and any accepted files in `docs/adr/`. Read
   neighboring discovery sections only to verify boundary contracts.
2. Draft the requirements document using the `00-INDEX.md` template and this
   subsystem's pre-allocated `REQ-###` block. Each requirement must include:
   - **ID & Title:** `REQ-###: <Short Title>`
   - **Metadata:** `Type: FR | NFR` | `Scope: Launch | Deferred | Undecided`
   - **Statement:** One testable "shall" statement. Keep proposed scope
     visibly distinct from approved scope.
   - **Verification:** Scenario, expected result, and verification method
     (include failure behavior where it changes the contract). Do not invent
     ungrounded latency, capacity, or retention thresholds—mark missing
     thresholds as `[TBD: threshold]`.
   - **Source & Links:** Repo-relative path + section heading, plus links to
     related `REQ-###`, `PROP-###`, or `ADR-###` IDs.
3. Enforce single canonical ownership: keep subsystem-specific constraints
   here and platform-wide guarantees in the cross-cutting file. Where a
   requirement depends on an interface owned by another subsystem, state the
   expected contract and tag it `[CONTRACT-STUB: <target-subsystem>]`.
4. **ADR Proposals (`docs/adr/00-PROPOSED-ADRS.md`):** If a requirement depends
   on an unsettled architectural boundary (e.g., Temporal replay vs. Activity
   retries, state/memory ownership, fluent typing at branch joins, or tenant/
   principal context without leaking live Backstage credentials into Temporal
   history):
   - First check `docs/adr/` and `docs/adr/00-PROPOSED-ADRS.md`.
   - If an existing `PROP-###` already covers the boundary, append your
     dependent `REQ-###` IDs to that entry instead of creating a duplicate.
   - Otherwise, append a new `PROP-###` entry to `docs/adr/00-PROPOSED-ADRS.md`
     and link `PROP-###` in the affected requirement(s) (marking their scope
     `Undecided` if blocked).
5. End the requirements file with a **Source Coverage Table** mapping every
   heading in PRIMARY to: `REQ-###`, `PROP-###`, `Duplicate`,
   `Explicitly Deferred`, `Non-Normative Note`, or `Open Question` (with a
   brief rationale for exclusions). Summarize what you wrote and list any
   decisions needed from me in chat.

---

## MODE: ADR_BATCH
Create or update ONLY:
- `docs/adr/ADR-001-<slug>.md` through `docs/adr/ADR-00N-<slug>.md`
- `docs/adr/00-PROPOSED-ADRS.md` (mark entries as promoted/merged)
- `docs/requirements/*.md` (ONLY to replace `PROP-###` references with `ADR-###` IDs)

1. Read `docs/adr/00-PROPOSED-ADRS.md` and all referenced `REQ-###` items
   across `docs/requirements/*.md`.
2. Consolidate overlapping proposals into single, clean architectural
   decisions.
3. For each consolidated decision, write a short, focused ADR file
   (`docs/adr/ADR-###-<slug>.md`) containing:
   - **Status:** `Proposed` (or `Accepted` if explicitly confirmed in `RELEASE-SCOPE.md`)
   - **Context:** The architectural boundary and constraints
   - **Decision:** Recommended option and rationale (or explicit options if user sign-off is required)
   - **Alternatives Considered:** Trade-offs of rejected approaches
   - **Consequences:** Positive and negative impacts across subsystems
   - **Linked Requirements:** All dependent `REQ-###` IDs
4. Update `docs/requirements/*.md` to replace `PROP-###` tags with their new
   `ADR-###` links, and summarize any ADRs requiring my explicit sign-off in chat.

---

## MODE: AUDIT
Do not edit files unless explicitly instructed after review.

1. Compare all drafted `docs/requirements/*.md` files and `docs/adr/ADR-*.md`
   files against `RELEASE-SCOPE.md` and all seven `docs/discovery/` files using
   the Source Coverage Tables to guide targeted verification reads.
2. Report:
   - Unmapped discovery sections or omitted capabilities
   - Duplicate or conflicting requirements across subsystems
   - Unmatched `[CONTRACT-STUB]` interfaces or unclear ownership
   - Untestable "shall" statements or missing verification scenarios
   - Any remaining unresolved `PROP-###` links or broken/duplicate `REQ-###` IDs
3. Separate **Blockers** (must fix before implementation planning) from
   **Follow-ups**. Cite exact `REQ-###` IDs, `ADR-###` IDs, or file headings and
   propose the smallest correction for each.
4. Conclude with a readiness verdict for grounding the Layered Implementation
   Plan.

```

I’d review the **SDK pilot before starting the other six**. That’s the cheapest point to find out whether the requirements are too granular, the verification fields are useful, and the boundary between requirements and ADRs is clear.

## Kickoff

I created the three kickoff files. Nothing else was touched; the other changes and deletions git status shows were already in the working tree before this pass.

- **`00-INDEX.md` (Draft):** scope labels, the requirement template, ID blocks for each subsystem, the subsystem file skeleton, and the Source Coverage Table format.
- **`RELEASE-SCOPE.md` (Draft):** what I reviewed, Confirmed Direction (CD-01–15), the launch capability map by subsystem, deferrals, scope decisions for you (SD-01–22), conflicts (CF-01–14), candidate ADR boundaries (BD-01–11), unclear ownership (OWN-01–12), draft readiness criteria, and the recommended pass order.
- **`00-PROPOSED-ADRS.md`:** an empty staging log with the usage rules, PROP-### blocks per subsystem, a status lifecycle, and the entry template.

### Template and Numbering

- **Scope basis:** I added a Scope Basis field (Confirmed or Proposed) to the requirement template. This keeps proposed launch scope visibly separate from approved scope.
- **ID ranges:** Each subsystem gets a block of 100 IDs (`REQ-001–099` for cross-cutting, `REQ-100–199` for `01`, and so on). `REQ-700–989` are overflow blocks, sized to how much each discovery file contains; `REQ-990–999` are reserved for audit fixes.
- **PROP IDs:** `PROP-###` IDs use the same blocks, so parallel passes can't collide.

What I reviewed: the h3 headings for all 841 sections across the seven discovery files, about 35 sections read in full or part, and `PLANNING.md`. I did not read the other section bodies, any h4 subsections, any docs / incoming file contents, or the code. Classifications based only on headings are marked provisional.

### Gaps in the Source Material

Discovery never draws on the nine `INTEGRATIONS_*` roadmaps or `CREW_AGENT_LIST`. So nothing currently defines which provider integrations or named agents ship at launch.

### Direct Conflicts in the Notes

- **`CF-01`, worker placement:** one set of notes supports running the Temporal worker inside Backstage; another says it must never be embedded.
- **`CF-02`, redaction:** a reversible PII tokenization proxy is proposed, while another note explicitly bans reversible vaults.
- **`CF-03`, failure handling:** distributed circuit breakers are proposed, while the coding standards ban them in favour of local cooldowns.
- **`CF-08`, stream format:** three competing formats for the run event stream.
- **`CF-09`, tool risk levels:** four competing ways to classify tool side effects and autonomy.
- **`CF-11`, resume state:** the notes say Temporal is the source of truth for execution, but `CheckpointStore` (optionally in Redis) also holds resumable state.

### Recommended Pass Order

`01 SDK` → `02 Durable Execution` → `07 Cross-Cutting` → `04 Tools` → `03 Reasoning` → `05 Memory` → `06 Control Plane`. I'd also run one `ADR_BATCH` after pass 3, so the remaining passes link to ADRs instead of piling up proposals. The reasoning for each position is in `RELEASE-SCOPE §10`.

### Decisions Needed from You

- **`SD-01`, tenancy:** what is a "tenant" in a Backstage install? Every subsystem assumes a tenantId, so this affects all passes.
- **`SD-06`, goal-reconciliation mode:** does it ship at launch? This blocks passes 01 and 02.
- **`SD-02`, worker topology:** dedicated workers only, or embedded mode too (and if so, only for local dev)? This blocks pass 02.
- **`SD-03`, long-term memory:** does Mem0 ship at launch? This blocks pass 05.
- **`SD-14`, compliance:** which regimes (SOC-2, HIPAA, FINRA) are launch claims rather than designed-for? This blocks pass 07.
- **`SD-08`, `SD-11`, `SD-13`:** Token Broker day-one providers and refresh-token storage, the sandbox tier, and who owns approval policy. These block pass 04.
- **`SD-07`, launch integrations and agents:** not needed for the contract passes, but needed before release readiness.
