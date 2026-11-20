# Kazi: a reconciliation controller for agent work

## xxxxxxxxxx ├── packages/││   # =========================================================================│   # PACKAGE 1: BACKSTAGE NODE PLUGIN (Contracts, Types, Extension Points)│   # =========================================================================│   ├── backstage-plugin-agent-node/│   │   ├── package.json│   │   ├── tsconfig.json│   │   └── src/│   │       ├── index.ts                 # Main export entrypoint for all drivers & core│   │       ││   │       ├── extension-points/        # Targets where separate driver plugins register│   │       │   ├── platform-driver.extension-point.ts  # For observability, VCS, etc.│   │       │   ├── storage-driver.extension-point.ts   # For pgvector, qdrant, etc.│   │       │   └── security-driver.extension-point.ts  # For HashiCorp Vault, AWS KMS, etc.│   │       ││   │       ├── blueprints/              # Backstage Blueprints enforcing strict driver interfaces│   │       │   ├── platform-driver.blueprint.ts│   │       │   ├── storage-driver.blueprint.ts│   │       │   └── security-driver.blueprint.ts│   │       ││   │       ├── events/          # Strict event schemas and type definitions│   │       │   ├── audit.types.ts│   │       │   ├── system.types.ts│   │       │   └── workflow.types.ts│   │       ││   │       ├── api/│   │       │   ├── fluent-api.types.ts│   │       │   └── context.types.ts│   │       ││   │       └── utils/                   # PII/PHI masking/validation primitives used by drivers│   │           └── validation.ts│   ││   # =========================================================================│   # PACKAGE 2: CORE AGENT BACKEND PLUGIN (The Orchestration Engine)│   # =========================================================================│   ├── backstage-plugin-agent-backend/│   │   ├── package.json│   │   ├── tsconfig.json│   │   ├── src/│   │   │   ├── index.ts                 │   │   │   ├── plugin.ts                │   │   │   ││   │   │   # =========================================================================│   │   │   # 1. SHARED CORE ENGINE (Accessible by both Web Routers & Workers)│   │   │   # =========================================================================│   │   │   ├── engine/│   │   │   │   ├── fluent/              │   │   │   │   │   ├── base.ts          # Defs for the base AgentBuilder class & shared internal state│   │   │   │   │   ├── builder.ts       # Composition Root (Combines all mixins/traits into final class)│   │   │   │   │   # --- EXISTING MIXIN DOMAINS ---│   │   │   │   │   ││   │   │   │   │   ├── agent/           # Agent configuration domain methods│   │   │   │   │   │   ├── identity.ts  # .withName(), .withInstructions()│   │   │   │   │   │   └── model.ts     # .withTemperature(), .withLLMProvider()│   │   │   │   │   ││   │   │   │   │   ├── memory/          # Memory tracking & optimization domain methods│   │   │   │   │   │   ├── long-term.ts # .withUserMemory(), .withMem0Sync()│   │   │   │   │   │   └── short-term.ts# .withContextWindow(), .withBufferLimit()│   │   │   │   │   # --- NEW RAG MIXIN DOMAIN ---│   │   │   │   │   └── retrieval/       # API chaining for search parameters & sources│   │   │   │   │   │   ├── sources.ts   # .withStaticDocuments(), .withWebSearch()│   │   │   │   │   │   └── search.ts    # .withVectorSearch(), .withSimilarityThreshold()│   │   │   │   │   ││   │   │   │   │   ├── tools/           # Vercel AI SDK Tool execution hook methods│   │   │   │   │   │   ├── standard.ts  # .withSystemTools(), .withAllowedActions()│   │   │   │   │   │   └── custom.ts    # .withDynamicTool()│   │   │   │   │   ││   │   │   │   │   └── workflow/        # Execution & Signal coordination domain methods│   │   │   │   │       ├── signals.ts   # .onSignal(), .waitForSignal()│   │   │   │   │       └── lifecycle.ts # .onStart(), .onTimeout(), .compile()│   │   │   │   ││   │   │   │   └── compiler/            │   │   │   │       └── serialization.ts # Compiles grouped engine traits into a JSON execution graph│   │   │   ││   │   │   # =========================================================================│   │   │   # 2. RUNTIME 1: SYNCHRONOUS HTTP LAYER (Receives requests & starts workflows)│   │   │   # =========================================================================│   │   │   ├── http/                    │   │   │   │   ├── router/              │   │   │   │   │   ├── routes.ts        # Handlers invoke the builder & dispatch to Temporal│   │   │   │   │   └── middleware/│   │   │   │   │       ├── auth.ts      │   │   │   │   │       ├── compliance-ctx.ts│   │   │   │   │       └── error.ts     │   │   │   │   └── client/│   │   │   │       └── temporal-dispatcher.ts # Client wrapper triggering the generic workflow│   │   │   ││   │   │   # =========================================================================│   │   │   # 3. RUNTIME 2: ASYNCHRONOUS TEMPORAL WORKER LOOP (The Interpreter Environment)│   │   │   # =========================================================================│   │   │   ├── worker/                  │   │   │   │   └── temporal/            │   │   │   │       ├── worker.ts        # Boots the Temporal worker process│   │   │   │       ││   │   │   │       ├── workflows/       │   │   │   │       │   ├── index.ts     │   │   │   │       │   └── dynamic-agent-executor.workflow.ts # ◄ THE ONLY WORKFLOW: Interprets the serializable definitions│   │   │   │       ││   │   │   │       ├── activities/      # Discrete, side-effect safe steps managed by the workflow│   │   │   │       │   ├── index.ts│   │   │   │       │   ├── driver-proxy.activity.ts│   │   │   │       │   ├── compliance-reporting.activity.ts│   │   │   │       │   ├── llm-call.activity.ts # Wraps Vercel AI SDK execution in activities│   │   │   │       │   # --- NEW RAG COMPUTATION ACTIVITIES ---│   │   │   │       │   └── retrieval.activity.ts # Handles chunking, vector fetching, and re-ranking│   │   │   │       ││   │   │   │       └── context/         # The 50+ utility methods injected into activities/tasks│   │   │   │           ├── execution-ctx.ts │   │   │   │           ├── ai-helpers.ts # Exposes @temporalio/ai-sdk workflow primitives safely│   │   │   │           └── compliance-helpers.ts│   │   │   ││   │   │   # =========================================================================│   │   │   # 4. CROSS-CUTTING COMPLIANCE & CONFIGURATION INFRASTRUCTURE│   │   │   # =========================================================================│   │   │   ├── platform/                │   │   │   │   ├── config/              │   │   │   │   │   ├── temporal.ts│   │   │   │   │   └── mem0.ts│   │   │   │   └── compliance/          │   │   │   │       ├── audit-logger.ts  │   │   │   │       ├── encryption.ts    │   │   │   │       └── retention.ts     │   │   │   ││   │   │   └── services/                # Low-level client instances used by activities/routers│   │   │       ├── ai/                  # Vercel AI SDK low-level driver routing│   │   │       │   ├── client.ts        │   │   │       │   ├── streams.ts       │   │   │       │   └── tools/│   │   │       ││   │   │       # --- CORE RAG SERVICE LAYER ---│   │   │       ├── retrieval/           # Orchestrates core RAG business pipelines│   │   │       │   ├── chunking.ts      # Text splitting strategies (token/semantic based)│   │   │       │   ├── embedding.ts     # Maps text to vectors via Vercel AI SDK│   │   │       │   └── reranking.ts     # Optimizes retrieved context node relevance scores│   │   │       ││   │   │       └── memory/              # Mem0 low-level interface│   │   │           ├── client.ts        │   │   │           └── guardrails.ts    │   │   ││   │   └── tests/                       │   │       ├── setup.ts                 │   │       ├── unit/                    # Validates builder serialization output forms match specs│   │       ├── integration/             │   │       └── temporal/                # Tests the generic interpreter using sample JSON payloads│   │           └── dynamic-agent-executor.test.tsbash

Kazi is not a coding agent, a model, or a general workflow engine. It is an **outer-loop reconciliation controller**: given an approved description of desired outcomes, it observes the actual state, invokes an existing coding agent to repair discrepancies, and repeats until the checks pass or a stopping condition is reached. The inner agent decides how to make a change; the controller decides whether its declared checks pass.

For your platform, the most useful idea is **not to reproduce Kazi wholesale**. You already have Temporal for durable execution and scheduling, Backstage for catalog context and an operator interface, the Vercel AI SDK for model/tool calls, and Mem0 for retrieved context. A small, bounded *goal reconciliation* capability could sit inside that platform. It would own the goal contract, verification, repair feedback and stopping policy, while the platform owns authorization, isolation, scheduling, recovery and publication.

Important caveat: passing checks proves only that those checks passed under the recorded conditions. It does **not** prove that the criteria capture all user intent, that a checker is sound, or that a change is safe to deploy. Kazi's own evaluation contains a converged change that independent review rejected for a missing edge case.

This report describes the checked-out repository, distinguishes observations from recommendations, and does not assume access to your other project's implementation.

## 1. How Kazi works

### The layers

```text
Human / higher-level planning agent
  expresses intent, drafts and approves acceptance contract
                  |
                  v
Kazi: plan -> approve -> apply -> observe -> decide -> repeat
  owns the goal, predicate vector, evidence, budget and stop decision
                  |
                  v
Existing coding harness and selected model
  reads task + failures, inspects repository, edits and runs tools
                  |
                  v
Independent predicate providers inspect the resulting candidate
  tests, scripts, HTTP probes, deployment/landing checks, etc.
```

In the typical two-tier setup, a stronger model helps author the criteria; a less expensive model does iterative implementation. Neither tiering nor a specific model is essential to the controller: a goal can use another harness or model. The frontier model's criteria are **proposals**, not ground truth. The economic hypothesis is that investing more in a reusable acceptance contract can reduce the cost of iterative execution; it must be measured, not assumed. See [the concept](docs/concept.md) and [ADR-0023](docs/adr/0023-harness-friendly-agent-drivable-cli.md).

### Goal, predicate and evidence

A goal is a versioned declaration of the desired result. Its core ingredients are:

- **Predicates:** individual checks, each with an identifier, provider, configuration and description. Examples: a particular test passes, an API returns the expected response, a security constraint remains true, or a deployed endpoint responds. A provider implements *how* a predicate is evaluated and returns a status and evidence.
- **Guards:** checks for unwanted regressions or manipulation, such as a protected contract changing or a test count decreasing. A test count or coverage ratchet is useful but cannot prove that tests remain meaningful.
- **Scope:** repository/workspace and declared boundaries for edits and integration.
- **Budgets and policies:** iteration, time, token and/or dispatch limits, plus optional model escalation and integration rules.

The resulting **predicate vector** is the list of outcomes for one observation. Kazi's actual statuses include `pass`, `fail`, `error` and `unknown`. Convergence requires a **nonempty vector in which every predicate passes**; errors and unknowns are not silently treated as success. A failure is an actionable discrepancy; a broken checker or unavailable observation needs different handling. See [predicate vector](lib/kazi/predicate_vector.ex) and [predicate provider](lib/kazi/predicate_provider.ex).

Predicates are more than prose in a prompt. Their provider configuration must identify an actual check. For example, “the API is secure” is not directly executable; an approved test suite, specific policy check and deployment probe may each test one part of that intent. An LLM-generated test written by the same agent can help, but should not be the only independent oracle.

### End-to-end lifecycle

1. **Plan.** `kazi plan` accepts caller-authored predicates or asks a harness to draft a proposal. It applies clarification checks and returns a proposal reference. A human or trusted caller reviews the criteria, unresolved gaps, scope and budget. A specification can inform the predicates, but generated criteria should not silently replace the requirements.
2. **Approve.** `kazi approve` records the approval. This freezes a contract for that proposal's execution; material changes to what “done” means should create a new revision and approval.
3. **Prepare and observe.** `kazi apply` resolves the goal, harness, providers and workspace, runs any declared setup, then evaluates the predicates before dispatch. Initial failure should mean the intended capability is missing, not merely that dependencies were not installed. Some guards can legitimately pass initially.
4. **Decide.** All checks passing means convergence. Otherwise, actionable code failures lead to a focused harness dispatch. Depending on the goal,  integration, deployment or waiting for live checks can be separate actions. The agent receives the goal and useful failure evidence, not the author's entire conversation.
5. **Observe again.** The controller evaluates the full vector, including previously passing guards, after the action. This catches regressions as well as improvements.
6. **Stop honestly.** The loop ends on convergence, lack of progress, a budget limit or an execution error. Some configurations allow continued observation or a bounded escalation ladder. A live probe may need polling; a permanent checker error is not equivalent to a code failure.

Implementation entry points include [runtime](lib/kazi/runtime.ex), [loop](lib/kazi/loop.ex), and [stuck detection](lib/kazi/loop/stuck_detector.ex). In the ordinary code-stuck heuristic, Kazi looks for a repeated nonempty set of failing predicate IDs over a window, accounting for eligible score improvements; this is a useful heuristic, not a general proof that no progress is possible. Its escalation hook is not by itself a guarantee that a human received a notification.

### A concrete example

Suppose the goal is “add a health endpoint.” A reviewed contract might include:

1. On a cleanly provisioned candidate, a test sends `GET /healthz` and verifies status and response shape.
2. An existing regression suite passes without weakening protected tests.
3. A separate post-deployment probe verifies the approved target responds.
4. If publication is part of the task, an independently verified landing or deployment condition passes.

Initially (1) may fail, (2) may pass, and (3) may be unknown until deployment. The agent gets the actionable failure and repairs the code. The controller reruns the checks; it does not mark the live predicate passed merely because the agent said it deployed. Whether the controller itself can deploy is a separate authorization decision. If the goal is only a patch, live deployment should be a later, separately approved workflow instead.

### Boundaries worth preserving

- **Model output is not the verdict.** A provider runs a check and records its result; the harness's “done” message is diagnostic input.
- **A check must be protected from the fixer.** Kazi can evaluate guards and held-out checks in a detached clean worktree with candidate changes overlaid and protected grader paths restored. Ordinary visible checks normally run in the candidate workspace. Isolation can degrade if setup fails. A separate process or worktree is **not an OS security sandbox**; held-out text is not secret if the agent can access it through other means. See [isolation implementation](lib/kazi/enforcement/isolation.ex) and [ADR-0042](docs/adr/0042-anti-gaming-enforcement.md).
- **Verification and publication differ.** Kazi supports integration and deployment actions, but they have distinct modes and guarantees; not every path has identical safety properties. The stronger platform design is to return a candidate plus evidence, then separately authorize publication.
- **A read model is not necessarily durable orchestration.** Kazi can project observations to a local read model, and those writes may be best-effort. Do not infer that every live process is automatically reconstituted from that projection after a crash.

## 2. Why so much complexity?

The current checkout has **3,157 commits reachable from HEAD**, 289 tracked files under `lib`, 628 under `test`, and 88 under `docs/adr`. These are checkout-specific counts, not a measure of correctness or a reliable measure of engineering effort. Small automated commits, experiments, product changes, and maintenance can inflate commit counts; the count alone cannot establish why each change was made.

The central loop is conceptually small. The repository has grown around making it usable as a standalone product: harness and model adapters, CLI and MCP surfaces, predicate providers, authoring, review and audit, worktree and branch management, budgets, anti-gaming controls, parallel scheduling, leases, persistence, observability, dashboards, deployment, distribution, compatibility, experiments and documentation. Some complexity is the natural cost of handling real failures; some is a consequence of broad product scope and multiple evolving ideas about who owns orchestration. The [dated fleet recommendation](docs/kazi-in-a-sire-governed-fleet.md) explicitly recommends a narrower bounded role when another platform already owns fleet governance. Its associated [ADR-0087](docs/adr/0087-kazi-plans-sire-schedules-one-goal-per-container.md) is marked proposed; it should not be mistaken for an already-approved architecture ruling.

### The hard architecture problems

1. **Specification and oracle quality.** Natural-language intent is incomplete; generated predicates may pass the wrong solution, contradict each other, or require an inaccessible live system. Protect independent graders, review acceptance coverage, and test negative cases. A passing result means “satisfies this version of these checks,” not “correct in all respects.”
2. **Trust and reward hacking.** The executing agent can weaken tests, edit graders, hardcode examples, use unauthorized tools or follow malicious repository instructions. Instruction text alone is not enforcement. Separate credentials, execution privileges, candidate code and protected verification inputs; record any degraded protection.
3. **External effects and recovery.** Model calls, test jobs, PR creation and deployments can finish just as a worker dies. Retries can duplicate expensive or irreversible work. Preserve logical run identity and budgets across attempts, use idempotency where supported, and reconcile uncertain outcomes before repeating publication.
4. **Isolation and concurrency.** A worktree separates files but does not restrict processes, secrets, network or host access. Concurrent tasks can overlap in files or share deployment resources even if their goal IDs differ. Leases need ownership, expiry, renewal and fencing, and overlap checks need a conservative policy.
5. **State and time.** Local tests, remote CI and production probes have different latencies and failure modes. A passing observation can become stale as the candidate or deployment changes. Bind evidence to a commit or artifact digest, environment and observation time; distinguish pending, fail, error and unknown.
6. **Budgets and economics.** Limit aggregate spend, wall time, iterations and tool calls across retries and escalations. Unknown provider usage is unknown, not zero. Cheap tokens can cost more overall if they cause more retries, longer execution or more review. Cap both individual requests and whole logical jobs.
7. **Security and tenancy.** Repository text, tool outputs and retrieved memories are untrusted input. Ensure tenant isolation, least-privilege credentials, egress rules, secret redaction, auditability and revocation/cancellation of child processes.
8. **Operational semantics.** Decide who approves criteria, who can amend them, what constitutes progress, whether `stuck` alerts anyone, who can deploy, and what happens if evidence storage or isolation fails. Multiple controllers with overlapping ownership create races and split accounting.

### Evidence about value, not just architecture

Kazi's [E77 evaluation](docs/e77-evaluation-2026-09-08.md) compared three tasks: the original direct and Kazi arms each had 2/3 accepted candidates, while Kazi used about 20% more known provider dollars and 52% more attempt wall time. A follow-up accepted 2/3 direct versus 1/3 Kazi. One Kazi candidate passed its frozen grader and converged, but independent review found a malformed-input bug. The samples are tiny, repeated in the follow-up, and review was unblinded; some cost and review time were unknown and no candidate was operationally landed. This is **not** evidence that the approach cannot work; it is evidence against assuming either savings or correctness from convergence alone.

## 3. Why Elixir rather than Go? What about TypeScript?

The author's stated reasoning is in [ADR-0003](docs/adr/0003-language-elixir-otp.md): the original design imagined many long-running, fallible, concurrent goal loops and agent processes. Elixir runs on the BEAM, whose lightweight processes, message passing and OTP supervision trees fit that shape well. Supervisors provide a standard way to restart or escalate failed processes; process-local state and timers support individual loops; Phoenix LiveView can provide a live operator console without a separate frontend. Kazi is largely network/model-bound, so raw CPU performance was not the deciding factor.

The ADR describes Go as a serious alternative with attractive deployment and ecosystem characteristics, but judges supervision and live UI less built-in. That is a **contextual design judgment**, not proof that Go cannot implement reliable orchestration: Go has goroutines, channels, contexts and mature workflow infrastructure, but the application must choose its lifecycle, supervision and durable execution strategy. Elixir supervision also does not automatically provide durable business state, exactly-once external side effects, or security isolation.

**TypeScript is a reasonable choice for your stack.** Temporal substantially changes the comparison: it supplies durable workflow history, timers, retries, message handling and recovery across worker restarts. It does not make arbitrary side effects exactly once, sandbox code, or eliminate the need for idempotency, workflow versioning, capacity management and authorization. Keep CPU-heavy or untrusted tasks outside the Node.js event loop, in isolated worker processes / containers. Supervise worker infrastructure using your deployment platform and keep orchestration state in Temporal, rather than trying to emulate OTP actors in application memory.

## 4. Recommended TypeScript/Backstage design

### Ownership

| Component | Recommended responsibility |
| --- | --- |
| Backstage plugin/backend | Authenticated API, tenant and entity context, permission checks, approval UI, status/evidence views and audit access. Resolve repository and ownership via catalog data, but do not treat catalog metadata alone as authorization. |
| Temporal | One durable workflow per logical goal, state transitions, timers, cancellation, bounded retries and recovery. Use the existing platform scheduler rather than adding a second fleet scheduler. |
| Goal service/store | Versioned approved contract, immutable revisions/digests, policy, budget ledger, evidence metadata and projection for search/UI. Temporal is the workflow execution authority; the projection must be replayable or reconcilable. |
| AI SDK adapter | Structured criterion drafting and model/harness invocation. Tool schemas validate shape, not authorization or semantic correctness. Constrain tools and model access independently. |
| Execution/verification workers | Ephemeral isolated environments, candidate artifacts, checker execution, explicit timeouts, resource and network limits. Checker configuration and held-out inputs are outside the fixer's write access. |
| Mem0 | Optional retrieval of scoped, approved project context. It is **not** the authority for goal state, permissions, acceptance criteria, budgets or evidence. Treat retrieved content as untrusted, possibly stale advice with provenance. |
| Publication service | Independently authorized PR/merge/deployment actions, idempotency and audit; may be a separate workflow or human gate. |

Temporal's [AI SDK integration](https://docs.temporal.io/develop/typescript/integrations/ai-sdk) documents an optional plugin that wraps supported AI SDK calls in Activities. Alternatively, explicitly call AI SDK from activities. In either approach, avoid raw network/LLM calls inside deterministic workflow logic; verify package compatibility with your deployed versions.

### Proposed contract

The following is a **design sketch**, not Kazi's wire format:

```ts
type Verdict = 'pass' | 'fail' | 'error' | 'unknown';

type Predicate = {
  id: string;
  description: string;
  provider: string;
  config: unknown; // validate against the registered provider schema
  role: 'acceptance' | 'guard';
  visibility: 'worker' | 'held-out';
};

type GoalRevision = {
  goalId: string;
  revision: string;
  tenantId: string;
  entityRef: string;
  baseCommit: string;
  predicates: Predicate[]; // nonempty, unique IDs, approved and immutable
  allowedPaths: string[];
  budget: {
    maxIterations: number;
    maxDispatches: number;
    maxElapsedMs: number;
    maxCostMicros: number; // admission/accounting policy for unknown cost
  };
};

type Observation = {
  predicateId: string;
  verdict: Verdict;
  candidateDigest: string;
  verifierVersion: string;
  observedAt: string;
  evidenceRef: string; // authorized, immutable artifact; not raw secrets
};
```

Add approval identity/time, contract digest, execution environment, checker digest, protected paths, authorized publication policy, attempt identity and budget reservations to the persisted schema. Validate all boundary inputs at runtime. A TypeScript type is not a security or validation boundary.

### Workflow semantics

1. **Draft and review:** a frontier model creates a structured proposal from user intent and authorized project context. Validate provider availability, explicit scope, nonempty checks, feasibility, cost and dangerous commands. Show gaps and obtain the required human/policy approval. Store an immutable revision and digest.
2. **Admit and prepare:** check permissions and reserve budget *for the logical job*, then provision an isolated workspace pinned to a base commit and a pinned tool image. Check dependency setup independently from product failures.
3. **Observe:** evaluate all predicates and retain evidence bound to the exact candidate digest and relevant environment. Protect held-out graders and checker files. Reject empty vectors; do not allow `unknown` or `error` to satisfy acceptance.
4. **Choose:** if every required result passes for the same candidate and required environment, produce a verified candidate. If there are actionable failures, dispatch a bounded repair with only appropriate feedback. For transient observation failures, use bounded retry/backoff; for permanent configuration or policy failures, stop or request help.
5. **Repair and repeat:** run a harness in the isolated environment with a narrowly scoped grant. Capture a candidate snapshot, account for the attempt, and re-observe the entire vector. Compare failing IDs and, where meaningful, scores to detect lack of progress; stop at explicit limits.
6. **Publish separately:** revalidate the candidate and approval, authorize publication, then create/update the PR or deploy using a dedicated identity. Bind CI and live evidence to the exact landed/deployed artifact. Treat uncertain publication outcomes as reconciliation work, not permission to blindly publish again.
7. **Report:** expose `converged`, `stuck`, `over_budget`, `error` or `cancelled`, plus candidate identity, evidence, usage (including unknowns), approval and publication state. Notifications should be explicit and auditable, not implied by a status name.

Temporal-specific design: keep workflow decisions deterministic and put repository I/O, models, Mem0, checkers and publication in Activities or a documented durable integration. Configure activity timeouts, heartbeats for long jobs, retry classifications, cancellation and process-tree cleanup. Use durable workflow messages for approvals/cancellation, replay-safe versioning and Continue-As-New when history grows. Persist compact references instead of large logs or secrets in workflow history. Activities may execute more than once; use stable operation keys, external status reconciliation and reservation / settlement accounting. An idempotency key cannot by itself guarantee deduplication if the external service does not honor it.

For Mem0, enforce tenant and project authorization **before** retrieval and again before presenting results; don't rely on model-chosen filters. Scope memories and retain provenance, freshness and deletion policies. Do not let a retrieved memory silently change an approved goal or authorize tool execution. [Mem0's documentation](https://docs.mem0.ai/core-concepts/memory-operations/add) describes identifier-scoped memories and metadata; exact APIs and isolation guarantees depend on the deployed product and configuration.

### Suggested implementation sequence

1. **Baseline and choose a narrow use case.** Select a small class of repository changes with clear independently executable acceptance checks. Compare against the platform's existing direct-agent workflow.
2. **Contract and review.** Implement schema validation, immutable goal revisions, approval and permission checks; reject empty or unexecutable checks. Start with a human-authored or reviewed contract.
3. **One serial workflow.** Implement Temporal lifecycle, isolated workspace, one harness adapter, one test/command verifier, evidence and explicit budgets. Run initial and repeated observations; return a patch, not an automatic merge.
4. **Trust and recovery.** Add protected/held-out verification, scoped credentials, cancellation, retry/idempotency and candidate provenance. Exercise worker death at each external-effect boundary.
5. **Backstage experience.** Display proposal, approval, iteration history, evidence and stop reason. Make failure and degraded isolation visible.
6. **Only then expand.** Add remote/live providers and governed publication when needed; add parallel goals and resource leases only if measured throughput requires them. Prefer existing platform scheduling.

**Acceptance tests for the platform itself:** empty vector cannot converge; pass/fail/error/unknown are distinct; a formerly passing guard can regress; the same failing set eventually stops; retries and worker death do not reset the budget or duplicate publication; a changed candidate invalidates old evidence; protected grader changes cannot create a pass; cross-tenant access is denied; cancellation terminates child work; and a live predicate cannot pass from an agent assertion alone.

**Evaluate before scaling:** preregister a direct-agent vs controller comparison on representative tasks with the same model, tools, isolation, grader and review standards. Measure independently accepted *landed* changes, false-success rate, human supervision minutes, elapsed time, total model/compute/review cost, recovery and unknown costs. Include failures, not just successful demonstrations.

## 5. What should this be called?

I would call it a **goal reconciliation controller**, or more explicitly a **predicate-driven agent reconciliation controller**. “Reconciliation controller” is established terminology for a system that repeatedly compares desired and actual state and acts to close the gap; applying it to coding-agent goals is an analogy and product-specific usage, not a universally standardized category.

Other useful descriptions are **closed-loop agent orchestrator**, **verification-driven agent workflow**, or **agent supervisor**. The first emphasizes feedback; the second emphasizes independent evidence. “Evaluator” alone undersells the repair loop, while “agent framework” obscures the important distinction between controller and executing agent. For your Backstage product, “goal reconciliation” is a clear capability name without claiming a standard everyone uses identically.

## Sources and further reading

- Kazi: [concept](docs/concept.md), [predicate authoring](docs/AUTHORING.md), [orchestrator recipe](docs/orchestrator-recipe.md), [anti-gaming ADR](docs/adr/0042-anti-gaming-enforcement.md), [runtime language ADR](docs/adr/0003-language-elixir-otp.md), [fleet recommendation](docs/kazi-in-a-sire-governed-fleet.md), and [E77 evaluation](docs/e77-evaluation-2026-09-08.md).
- Code: [loop](lib/kazi/loop.ex), [runtime](lib/kazi/runtime.ex), [predicate vector](lib/kazi/predicate_vector.ex), [command provider](lib/kazi/providers/custom_script.ex), [checker isolation](lib/kazi/enforcement/isolation.ex), and [integration action](lib/kazi/actions/integrate.ex).
- External: [Temporal TypeScript guide](https://docs.temporal.io/develop/typescript), [Temporal AI SDK integration](https://docs.temporal.io/develop/typescript/integratons/ai-sdk), [AI SDK tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling), [Backstage permissions](https://backstage.io/docs/permissions/overview/), and [Mem0 memory operations](https://docs.mem0.ai/core-concepts/memory-operations/add).