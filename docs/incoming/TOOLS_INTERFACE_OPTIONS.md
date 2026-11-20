# Tools Interface: Architecture Options

> Working on the idea of creating a TypeScript SDK for Conduit that could also be used with Crew Suite. A weak version uses KoineDSL vocabulary for Crew Suite; a strong version uses WASM.

This document has four parts:

1. What Conduit actually does, and why it splits Performers from Plugins.
2. Building blocks every option needs: requirements, standing (credentials), RBAC, caching, rate limiting, async calls, and audit.
3. Four architectures.
4. A comparison and a recommendation.

---

## 1. Conduit Blueprint

### 1.1 Vocabulary (Conduit term → what it means → our nearest term)

| Conduit | Meaning | Ours |
| --- | --- | --- |
| **Koine** | A tool-neutral vocabulary of verbs (`createPullRequest`, `notifyChannel`) grouped by category. Verbs are plain typed functions. | Capability catalog |
| **Seat / word** | One named intent in the vocabulary: `Decl{Name, Category, Args, Destination, Fill}`. A seat is "the place a tool fills for a category". | Capability |
| **Common word** | A word every serious brand of a category can serve (`scm.createPullRequest`). | Base contract method |
| **Brand word** | One vendor's own feature, spelled `<brand>.<word>` (`github.dispatchWorkflow`). Brought by that vendor's performer. | Driver extension |
| **Author word** | A word a team declares for its own connector (`radar.fileProblem`); it may *fulfil* a common word. | Org/in-house extension |
| **Mapping** | The join from a common word to a brand word plus argument translation (`repo` → `owner`+`repo`, `source` → `head`). The performer ships defaults; an instance may override. | Adapter |
| **Performer** | Compiled-in Go that *describes* a call (`Prepare(Call) → Intent`) and *reads* the reply (`Fill(Call, Intent, Answer) → next Intent | result`). It holds no HTTP client, base URL, or credential. An arch test refuses `net` imports. | Driver |
| **Connector** | The **only** code that touches a socket. It resolves the caller's credential by reference, injects it last, refuses redirects, confines paths, sanitizes responses, and records the call. | Gateway |
| **Standing** | A credential held by reference (`env:`, `file:`, `urn:`) and resolved at call time. A person speaks as themselves; a domain credential speaks as the app. | Credential binding |
| **Plugin** | A WASM (wazero) guest with no syscalls, FS, or sockets. It shapes a request as data and parses the reply, and reaches the network only through `host_egress`. Its two roles are clock-driven *inquiry* (backfill an expected event that never arrived) and on-demand *ask* (`koine.Ask` → returns a data map). | Sandboxed read extension |
| **Determinate answers** | `ready`, `connect your account`, `unfilled`, `not served`, `not declared`, `missing operand`, `disabled`, `not permitted`. Each one names who owns the fix. | Capability status |

### 1.1.1 Catalog Seats

Seat / Word is a named intent in the vocabulary: `Decl{Name, Category, Args, Destination, Fill}`. A seat is "the place a tool fills for a category".

```go
Name: "tagRelease", Category: "scm", Args: "repo, tag, ref", Fill: map[string]SlotFill{"repo": {Class: FillNone}, "tag": {Class: FillAny}, "ref": {Class: FillAny}}},
```

### 1.2 What `Fill` / `SlotFill` actually mean

`Fill` describes **where a slot's value may come from** when a no-code subscription binds an incoming event to a verb:

- `FillAny`: any declared event field may fill the slot. This is the default.
- `FillNone`: the value comes from the connection or the subscriber and never from the event. In `tagRelease`, `repo` is `FillNone` because the repo is part of the connection, not the event.
- `FillRange`: these fields are offered first. This is a hint only.
- `FillSpecific`: the call cannot work without this one event field, so a subscription to an event that lacks it is refused.

`Destination` names the slot that can route a call to a *different tool* (a channel, for example). Overrides key on it.

**Relevance to us:** this idea is valuable, but in a different form. For an LLM-driven agent, the important question is "may the model fill this argument, or must it come from trusted context?" (see §2.2, *slot provenance*). That is a real prompt-injection control.

### 1.3 Layering

The layers are **vocabulary layers**, not runtime isolation layers:

- **Catalogue (common):** `pkg/seat/catalogue.go`. Shared, given away, tool-neutral.
- **Brand:** words the performer declares through the `Vocabulary` interface, namespaced by brand. If a performer declares a word in another brand's spelling, boot stops.

- **Author:** connector seats declared in the console. A connector seat can *fulfil* a common word and so join that word's resolution walk.

Resolution follows a **deterministic ladder**, and the first rung that answers wins:

1. The tool the call names.
2. The caller's own selection.
3. The organization default.
4. Deployment bindings, deepest stratum first (customer, then vendor, then floor).

An unbound category returns `ErrNotImplemented`. That is "an answer, not a crash", and it is what makes progressive enhancement work.

### 1.4 Why Conduit separates Performers from Plugins

Both use the same *describe, don't do* mechanism, and both reach the network only through the connector. So the split is **not** about network isolation. It follows three axes that Conduit deliberately ties together:

| Axis | Performer | Plugin |
| --- | --- | --- |
| **Effect** | An *act*: "a thing the tool should do in your name" | A *question*: "the tool's answer in hand" |
| **Standing** | The **caller's** own credential | The **deployment's** credential, never the caller's |
| **Record** | Recorded as an act, with the tool's reply kept verbatim | Only the fact of the ask is audited; the returned data enters no record |
| **Trust and distribution** | Compiled in. Adding one means a new deployment version, so everything that can act in a person's name is reviewed code. | Signed `.wasm`, installable from a marketplace, written in any language, sandboxed |
| **Vocabulary** | Holds seats and maps common words | "Holds no seat, speaks no word" |
| **Who calls it** | Controllers, the API, programs | The clock (expiry inquiry), and `koine.Ask` |

The rationale is **accountability**. Anything that acts in a person's name must be code that ships with the deployment and maps to the reviewed vocabulary. Third-party code may only shape questions, and those questions use the deployment's standing.

**Why this split doesn't fit us as-is.** In Backstage, *reads* often must use the user's credential. An agent must never show a user a private repo, incident, or cost line they can't see themselves; that is RBAC parity. Writes, on the other hand, are sometimes properly done with a service identity, such as a GitHub App opening a PR. Conduit ties effect, standing, and trust together; we need them as **independent attributes** of every capability. Keep the mechanism (describe/connector), the determinate answers, the layered vocabulary, and the mappings. Drop the fixed pairing.

**Where Conduit's philosophy and ours differ.** Conduit's "no stranger in the circuit" rule (AGENT.md §2.1) deliberately omits gates inside a run, because every participant declared itself in advance. An LLM agent **is** a stranger in the circuit: its arguments can be steered by prompt injection from tool output. Our design needs the gates that Conduit removes, enforced in exactly one place (the connector), because that is the other half of Conduit's lesson.

### 1.5 Conduit concepts worth adopting

| Concept | Adopt? | Why |
| --- | --- | --- |
| Layered vocabulary (common / brand / org) with namespaced spelling | **Yes** | It directly solves base contract plus vendor extensions plus in-house extensions, with a visible cost when a feature ties you to a brand. |
| Common → brand **mappings**, overridable per instance | **Yes** | Org-level customization without forking a driver. |
| **Describe / Execute split** (driver produces an Intent; one gateway executes it) | **Yes, with an escape hatch** | Credentials, RBAC, cache, rate limits, egress policy, and audit all live in one place. Drivers become pure and trivially testable. Writes can be previewed exactly for human approval. SDK-bound providers (AWS SigV4, GCP gRPC) need a "native" adapter mode. |
| Multi-step `Fill → next Intent`, capped (`MaxSteps = 4`) | **Yes** | Covers CSRF crumbs, pagination, and two-phase APIs without drivers holding sockets. |
| Determinate answers and a per-caller capability report | **Yes** | Drives the "connect your account" UX and lets agents degrade gracefully. |
| Credentials by reference, resolved at call time, injected last | **Yes** | Rotation is live, and no copy of a secret ever sits in driver code or Temporal history. |
| Resolution ladder (call → user → group / org → deployment) | **Yes** | Maps to Backstage ownership: user, group, then the instance. |
| Clock-driven *inquiry* (ask the tool when an expected completion doesn't arrive) | **Yes** | This is how we make async calls robust: webhook first, then a Temporal timer and an inquiry fallback. |
| Slot `Fill` classes | **Adapt** | Becomes *slot provenance* for prompt-injection defense. |
| WASM sandbox for third-party extensions | **Optional, later** | Valuable only if customers will install third-party drivers. Most regulated buyers will not, at first. |
| Fixed pairing of effect, standing, and trust | **No** | See §1.4. |

## 2. Building Blocks Every Option Needs

Every architecture below needs these primitives. The options differ in where these primitives run and how drivers plug in.

### 2.1 Capability identity and layers

Each capability has a stable ID and a layer:

| Layer | Spelling | Declared by | Example |
| --- | --- | --- | --- |
| `core` | `<category>.<noun>.<verb>` | The platform | `vcs.pullRequest.create` |
| `vendor` | `<provider>.<noun>.<verb>` | The driver package | `github.actions.dispatchWorkflow` |
| `org` | `<orgns>.<provider|category>.<verb>` | The installation | `acme.github.fileSecurityException` |

Rules, taken from Conduit:

- IDs are never reused.
- A vendor word promotes to `core` when a second provider can serve it meaningfully. The vendor spelling stays. (see below)
- A driver that declares a word outside its own namespace fails boot.

**The recommendation is a hybrid: org-authored capabilities are first-class, and they may optionally build on a vendor driver.** They should not have to extend one. “Extend” here should mean composition or an explicit adapter—not subclassing or silently replacing vendor code.

These are two different use cases:

1. **Adapt an existing capability for a configured provider instance.** For example, an organization may need a custom argument mapping for its GitHub Enterprise instance. That’s an instance-level override of the mapping, not a new capability or a new driver.
2. **Add an organization-specific capability.** For example, `org.acme.security.exception.create` may call an internal service, or use a vendor driver as part of its implementation. It has its own contract and identity, whether or not it delegates to a vendor.

To distinguish core, vendor, and org capabilities, I’d use **explicit descriptor metadata**, not infer ownership from how many segments appear in the ID:

```json
{
  id: 'github.actions.dispatchWorkflow',
  owner: { kind: 'vendor', id: 'github' },
  category: 'ci',
  // ...
}

{
  id: 'org.acme.security.exception.create',
  owner: { kind: 'organization', id: 'org.acme' },
  category: 'security',
  // ...
}
```

The ID namespace makes names readable and collision-resistant; the descriptor says authoritatively who owns the capability. The provider or service that implements it is separate metadata. That way an org-owned capability can call GitHub, an internal service, or several systems without pretending it belongs to any one vendor.

This also answers the “do we need to know every vendor?” concern: the platform doesn’t need a global hard-coded vendor list to parse IDs. It validates that the declared owner is registered for the deployment and that the caller is allowed to use it. A vendor package can register its provider identity; an organization can register its namespace in that installation.

That’s the direction I’d use for the recommended catalog-and-gateway architecture.

### 2.2 Capability descriptor

Every capability, whatever its layer, carries machine-readable policy. The gateway, the requirement solver, the LLM tool schema, and the docs are all generated from this one descriptor.

```ts
defineCapability({
  id: 'vcs.pullRequest.create',
  layer: 'core',
  category: 'vcs',
  effect: 'write', // 'read' | 'write' | 'destructive'
  mode: 'sync', // 'sync' | 'async' (returns an OperationHandle)
  input: PullRequestCreateInput, // zod / JSON Schema
  output: PullRequestRef,
  slots: {
    repo:  { provenance: 'context' }, // must come from the bound entity, never from the LLM
    base:  { provenance: 'context', default: 'defaultBranch' },
    title: { provenance: 'model' },
    body:  { provenance: 'model', maxLength: 65536 },
  },
  standing: { allowed: ['user', 'service'], prefer: 'user' },
  idempotency: 'required', // gateway derives or demands a key
  cache: { policy: 'none' },
  invalidates: ['vcs.pullRequest.list:{repo}'],
  dataClass: 'internal', // 'public' | 'internal' | 'confidential' | 'regulated'
  approval: 'policy', // defer to policy; 'always' forces human-in-the-loop
});
```

`slots[].provenance` adapts Conduit's `Fill`. It can be `context` (bound from the catalog entity, connection config, or run inputs), `model` (an LLM argument), `user` (explicit user input in the UI), or `constrained` (`model`, but limited to an enum or a set resolved at runtime). This stops a prompt-injected agent from redirecting a write to another repo.

### 2.3 Requirement declarations (mandatory, optional, extended, specific providers)

Agents declare requirements as a small boolean algebra over categories, capabilities, and providers. Requirements attach to **features** of the agent, so it can degrade one feature at a time.

```ts
createAgent('release-notes')
  .requires(
    category('vcs').with('vcs.release.list', 'vcs.compare.refs')
  )
  .feature('publish',
    f => f.requires(capability('vcs.release.publish'))
  )
  .feature('actions-insights',
    f => f  .requires(
      provider('github').with('github.actions.listRuns')
    )
  ) // GitHub-only feature
  .feature('cost-tickets',
    f => f.requires(
      allOf(category('finops'), category('project-management'))
    )
  )
  .feature('notify',
    f => f.optional(
      anyOf(provider('slack'), provider('msteams'))
    )
  )
```

The operators are `category`, `provider`, `capability`, `allOf`, `anyOf`, `exactlyOne`, and `not` (for example, `not(provider('git'))` to exclude a vanilla driver). There are two strengths:

- `requires`: if unmet, the feature or agent is **unavailable**.
- `optional`: if unmet, the feature is **degraded**.

The solver evaluates requirements at three points, each a different question:

| When | Question | Unmet result |
| --- | --- | --- |
| **Boot** (registry freeze) | Is a driver installed and bound that *can* serve this? | Agent or feature is `unavailable`, with a reason shown in the admin UI. A `requires` on the agent root can optionally fail boot (`strict` mode). |
| **Run start** (per principal) | Can *this user* use it: credential connected and RBAC granted? | Determinate answer, for example `connect_account:github` or `not_permitted:vcs.release.publish`. |
| **Call time** | Did anything change, such as a revoked token or a tripped circuit? | Typed result. Never an untyped throw. |

The per-caller **capability report** (`GET /capabilities?agent=release-notes`) returns this matrix so the frontend can render "Connect GitHub to enable Publish". This is Conduit's `/api/capabilities` with our states:

- `ready` 
- `connect_account`
- `unbound` (no driver for the category)
- `not_served` (bound driver lacks the word; includes `servedBy`)
- `not_permitted`
- ``disabled` (admin kill-switch)
- `degraded` (circuit open or rate-limited)
- `not_declared`

### 2.4 Standing (credentials)

Every call resolves exactly one **standing**:

| Standing | Source | Example |
| --- | --- | --- |
| `user` | The user's own delegated token from a server-side token vault, keyed by user entity ref and provider instance | GitHub OAuth or GitHub App user-to-server, Jira OAuth 3LO |
| `service:<scope>` | An org-wide or sub-org credential (scope is a Backstage group ref) from a secrets backend | Datadog API key for `group:payments`, a cloud role per business unit |
| `service+actor` | A service credential with the user recorded as the attributed actor, for providers that support it | GitHub App installation token with a co-author or "on behalf of" note, Slack bot posting "requested by @user" |

**Rules:**

- The capability declares which standings are **allowed** and which is **preferred**. RBAC (§2.5) can narrow that further, per user and per action.
- The **driver never sees a credential.** The gateway resolves it by reference at call time and injects it last. This follows Conduit's `CredentialConnector`.
- **User tokens:** Backstage frontends normally hold provider OAuth tokens in the browser. Long-running agent work therefore needs a **server-side token broker**: a consent flow that stores refresh tokens encrypted (envelope encryption, KMS/HSM), keyed by `user:default/jane` and the provider instance, and mints short-lived access tokens on demand. This is a real piece of work and should be scoped explicitly, see section 5.
- **Never put a credential or access token into Temporal payloads or history.** Pass `{ principal, standingRef }` and resolve it inside the activity. Use a Temporal payload codec (encryption plus a codec server) for all agent payloads in HIPAA deployments, see section 6.
- **Fallback is explicit, never implicit.** `standing: { allowed: ['user','service'], prefer: 'user', fallback: 'deny' | 'service' }`. A silent fallback to a broader service credential is a privilege escalation.

### 2.5 RBAC (Backstage permission framework)

Define one resource type, `driver-capability`, and a small, fixed set of permissions. Make the decisions conditional on capability attributes rather than minting a permission for every capability:

```typescript
export const driverCapabilityInvoke = createPermission({
  name: 'driver.capability.invoke',
  attributes: { action: 'update' },
  resourceType: 'driver-capability',
});

export const driverCapabilityRead = createPermission({
  name: 'driver.capability.read',
  attributes: { action: 'read' },
  resourceType: 'driver-capability',
});
```

Permission rules (conditional decisions) evaluated by the gateway:

- `capabilityIs(ids[])` and `capabilityLayerIs('core'|'vendor'|'org')`
- `categoryIs`, `providerIs`, `providerInstanceIs` (for example, `github-enterprise-prod`)
- `effectIs('read'|'write'|'destructive')`
- `standingIs('user'|'service')`, `serviceScopeIs(groupRef)`. This is how you allow user credentials for an action but forbid org credentials.
- `targetOwnedBy(claims)`. The bound catalog entity's owner must be one of the caller's ownership claims.
- `dataClassAtMost('confidential')`
- `invokedByAgent(agentIds[])`. Lets you grant a capability only when a specific agent calls it.

Two-sided authorization, always:

**effective = userPolicy(user, capability, standing, target) ∩ agentManifest(agent) ∩ adminKillSwitch**

The agent's declared requirements act as a **ceiling**. An agent can never invoke a capability it did not declare, even if the user could.

### 2.6 Caching

Caching is a gateway concern, driven by capability policy:

```ts
cache: {
  policy: 'swr', // 'none' | 'ttl' | 'swr' | 'conditional'
  ttl: '60s', staleWhileRevalidate: '5m', maxStale: '30m',
  scope: 'principal', // 'principal' | 'standing' | 'tenant' | 'public'
  key: ['repo', 'state'], // which normalized args participate
  tags: ['vcs.pullRequest.list:{repo}'],
}
```

What it needs to do:

1. **Scope-correct keys.** The key includes the standing *identity*: user ref, or service scope plus credential ID. This prevents user A from seeing user B's cached view. In a regulated environment this matters most.
2. **Two tiers.** L1 is an in-process Least Recently Used LRU (milliseconds, per pod). L2 is shared Redis or Valkey with encryption at rest. `regulated` data classes are L1-only or uncached, with TTL caps.
3. **Request coalescing (single-flight).** A thousand developers opening the same service page should cause one upstream call. Use a Redis lock or lease per key, so coalescing works across pods.
4. **Conditional revalidation.** Store `ETag`/`Last-Modified` and send `If-None-Match`. GitHub doesn't count a `304` against the primary rate limit, so this is the cheapest way to avoid rate limiting.
5. **Tag invalidation.** Writes declare `invalidates`. Provider webhooks (GitHub, Jira, PagerDuty) can also publish invalidations through the Backstage events service.
6. **Negative caching** for 404s and `unbound` answers, with short TTLs.
7. **Background refresh** for hot keys, run as low-priority work on Temporal so interactive users never pay for it.
8. **Metrics:** hit ratio per capability and per provider, saved upstream calls, and staleness served.

### 2.7 Rate limiting and protection

- **Token buckets per (provider instance, credential)** in Redis. They are seeded from declared limits and **continuously corrected from response headers** (`X-RateLimit-Remaining`, `Retry-After`, `RateLimit-*`).
- **Priority classes:** `interactive` > `agent-foreground` > `background`. Background work yields when a bucket drops below a reserve, so batch agents never starve humans.
- **Bulkheads:** a concurrency cap per provider instance, so one slow provider can't exhaust the event loop or worker slots.
- **Circuit breakers** per provider instance. An open circuit reports the `degraded` capability state.
- **Quotas per agent and per user.** These are fairness controls, separate from provider limits.
- **Retries:** only on idempotent reads, or on writes that carry an idempotency key. Never retry a 4xx (Conduit §2.10).

### 2.8 Sync vs async calls

A capability declares `mode`:

- **`sync`:** returns its result inline, with a deadline. Most reads, and fast writes.
- **`async`:** returns an `OperationHandle { id, capability, provider, startedAt }` immediately. Completion arrives through one of:
  1. a **webhook** from the provider, routed into the Temporal workflow as a signal, or
  2. a durable **timer plus inquiry** fallback (Conduit's clock-driven inquiry): if no webhook arrives within the expected window, call the driver's `*.status` capability; back off and repeat up to a cap.

  Agents await completion with `await ctx.tools.awaitOperation(handle, { timeout })`, which is a Temporal workflow primitive under the hood.

Examples: triggering a deploy, running a pipeline, provisioning cloud resources, or waiting for a PR review.

### 2.9 Audit

Every invocation emits a structured audit event:

- who: user and agent
- which standing was used
- capability, provider instance, and target
- the **redacted** input digest
- the policy decision and reason
- the upstream status, latency, and cache hit or miss
- the run ID and workflow ID

**Writes** keep the exact Intent the driver described (method, path, redacted body), so an auditor sees precisely what was asked; this follows Conduit's "the record is the proof". **Reads** keep metadata only, never payloads. This mirrors Conduit's "the data map enters no record" and is mandatory for PHI.

Ship audit events to an append-only sink. Optionally hash-chain them for tamper evidence, as Conduit does with Dead Simple Signing Envelope (DSSE). DSSE is a standardized, lightweight mechanism used to digitally sign arbitrary data files (like software build artifacts, metadata, or packages). Unlike older signing structures, DSSE allows tools to sign raw data without needing complex "canonicalization" (rewriting data into a specific layout before signing). It is heavily used in the open-source software supply chain ecosystem by projects like Sigstore/Rekor, TUF (The Update Framework), and in-toto. NPM package `@sigstore/sign`.

---

## 3. Architectures

### Option A: Typed Category Ports with Extension Interfaces (in-process)

Closest to the original plan, hardened.

**Shape**

- Each category has a TypeScript **port interface** (`VcsPort`) with the core methods.
- Vendor extensions are additional interfaces (`GitHubVcsExtensions`) that the driver object also implements, discovered through a **declared feature manifest** rather than duck typing.
- Drivers register through category extension points and are wrapped at registration in a generated **policy proxy**. The proxy enforces RBAC, standing, caching, rate limiting, and audit around each method, using per-method metadata from decorators or a manifest.
- Agents receive typed handles: `ctx.drivers.vcs` (core) and `ctx.drivers.vcs.as('github')` (typed narrowing, guarded by a requirement check).

```ts
interface VcsPort {
  getPullRequestStatus(
    req: { repo: RepoRef; number: number },
    ctx: CallCtx
  ): Promise<PrStatus>;
  tagRelease(
    req: { repo: RepoRef; tag: string; ref: string },
    ctx: CallCtx
  ): Promise<TagRef>;
}

interface GitHubVcsExtensions {
  dispatchWorkflow(
    req: {...},
    ctx: CallCtx
  ): Promise<OperationHandle>;
}
```

**Credentials:** `CallCtx` exposes `ctx.standing.fetch()` or a pre-authenticated client factory. The driver *does* hold the HTTP client, so the gateway's guarantees depend on drivers using the provided factory.

**Strengths**

- The simplest mental model, and the best IDE ergonomics. Fully type-safe, with no codegen.
- Fastest to build on the existing extension points. Fine for first-party drivers only.
- SDK-heavy providers (AWS, GCP, Azure) fit naturally.

**Weaknesses**

- Cross-cutting guarantees are **by convention**. A driver can import `fetch`, cache incorrectly, or log a token. You can lint for it but can't make it structural.
- Org-level extensions require writing a new driver class or subclass. There is no mapping layer.
- No natural representation for the LLM tool schema or slot provenance, unless you add metadata. Once you add it, you are halfway to Option B.
- Previewing a write for approval means re-implementing the call, because the call isn't data.

**Use when:** the driver set is small, first-party only, and you want to ship fast. It isn't a good long-term fit for an enterprise compliance posture.

---

### Option B: Capability Catalog + Describe / Execute Gateway (Conduit-style "Koine")

The capability catalog is the contract. Drivers are pure translators. One gateway executes every call.

**Shape**

```
Agent (fluent API)
   │  ctx.tools.invoke('vcs.pullRequest.create', args) ← or generated typed facade:
   │  vcs.pullRequest.create(ctx, args) / github.actions.dispatchWorkflow(ctx, args)
   ▼
Capability Gateway (in the platform backend)
   1. resolve       catalog lookup → layer → resolution ladder → provider instance
   2. authorize     agent ceiling ∩ RBAC conditional decision ∩ kill-switch
   3. bind slots    provenance check; context slots filled from entity/connection
   4. standing      pick user/service per policy → credential ref (no secret yet)
   5. cache         scope-correct key → L1/L2 → single-flight
   6. translate     mapping(common→brand) → driver.prepare(call) → Intent
   7. approve?      write + policy → park on Temporal signal, showing the exact Intent
   8. execute       rate-limit → circuit → inject credential LAST → egress → Answer
   9. fill          driver.fill(call, intent, answer) → result | next Intent (≤ MaxSteps)
  10. record        audit, metrics, cache write/invalidate
```

**Driver contract**

```ts
export default defineDriver({
  type: 'github', // connector type; instances are config
  categories: ['vcs', 'project-management'],
  /** Vendor-layer descriptors */
  words: [githubActionsDispatchWorkflow, githubPullsCreate],
  mappings: {
    'vcs.pullRequest.create': {
      to: 'github.pulls.create',
      translate: ({ args, config }) => (
        {
          ...splitOwnerRepo(args.repo),
          head: args.source,
          base: args.target,
          title: args.title
        }),
    },
  },
  prepare(call): Intent {
    /* switch on call.capability → { method, path, headers, body, why } */
  },
  fill(call, sent, answer): FillResult {
    /* parse → { result } | { next: Intent } | { error } */
  },
  // Escape hatch for SDK-bound providers:
  native?: {
    'aws.ec2.describeInstances': (call, signer) => {...},  // signer injected by gateway
  },
});
```

- Drivers may not import network modules. An architecture test enforces this, as Conduit's `arch_test.go` does. The only exception is the `native` adapters for SigV4 or gRPC providers, which receive a gateway-provided *signer or client*, never raw secrets.
- **Org extensions:**
  1. Add *mappings* per provider instance in config. No code.
  2. Declare `org`-layer capabilities backed by an existing driver's intent builder.
  3. Ship an in-house driver module.
- **Typed facade:** generated from the catalog (as Conduit's `koinegen` does) so agent authors keep IDE types. Importing `@ai-crew-suite/tools-github` makes brand coupling visible.
- **LLM exposure:** the catalog emits tool schemas, including MCP if desired. `context`-provenance slots are hidden from the model and filled by the gateway.

**Strengths**

- Every enterprise guarantee is **structural**: credentials, RBAC, cache, rate limits, egress allow-list, redirect refusal, and audit are each implemented once.
- Writes are data, so you get **exact-intent approval UX**, dry-runs, and deterministic tests: drivers become pure `prepare` and `fill` functions with golden tests.
- The three-layer vocabulary and mappings fit core, vendor, and org extensions exactly.
- Requirements, the capability report, and the LLM tool schemas all derive from one catalog.

**Weaknesses**

- More upfront design: the catalog, the gateway, codegen, and the intent model.
- SDK-heavy categories (cloud providers) live mostly in the `native` escape hatch, which reduces uniformity for that category.
- Single-process. A gateway bug or a noisy agent shares fate with the Backstage backend, unless you split deployments.
- Async operations need a durable engine anyway, which leads to Option C.

---

### Option C: Temporal-Native Driver Plane (Option B's contract, executed on Temporal)

Keeps Option B's catalog and driver contract, but runs the **execute** stage on Temporal, with driver workers on their own task queues.

**Shape**

- **Interactive reads** (`sync`, cacheable) go through an in-process fast path: gateway, cache, egress. That keeps P95 latency low for the UI.
- **Writes, async operations, and background reads** become Temporal activities on **per-provider-instance task queues**, for example `drivers.github-ghes-prod`:
  - **Rate limiting:** worker `maxTaskQueueActivitiesPerSecond` gives a cluster-wide per-queue rate limit. Combine it with the Redis token buckets for header-adaptive limits.
  - **Durability:** retries with idempotency keys, heartbeats for long calls, and exactly-once *recording*.
  - **Approvals:** a workflow parks on a signal; a timeout escalates.
  - **Async completion:** a webhook arrives, goes through the Backstage events service, and is sent as a signal to the waiting workflow. A durable timer drives the inquiry fallback (§2.8).
  - **Scheduled refresh:** cache warmers and pollers run as Temporal Schedules.
- **Driver workers** can run in the backend process at first, then move to a separate deployment per category or provider for blast-radius isolation and independent scaling. The task queue makes the move transparent. Temporal Nexus can later expose driver operations across namespaces for multi-tenant isolation.
- Agent workflows call `ctx.tools.invoke(...)`. The SDK decides between the fast path and an activity based on the capability's `effect`, `mode`, and the call's priority.

**Credential handling on Temporal**

- Workflow inputs and outputs carry `{ principal, standingRef, capability, argsRef }`. They never carry tokens.
- The activity resolves the credential at execution time. If a user's token has expired or been revoked mid-run, the activity returns a typed `connect_account` failure. The workflow can then pause and wait for a re-consent signal instead of failing the run.
- Encrypt payloads with a payload codec. Large or regulated payloads are stored by reference (claim-check pattern) in encrypted object storage with retention policies.

**Strengths**

- Covers synchronous and asynchronous calls with one model. Long-running operations, retries, approvals, and timeouts become durable for free.
- Rate limiting and priority get real backpressure: queued work waits, instead of failing or overwhelming Node.
- Scales horizontally to thousands of concurrent users. Driver workers scale per provider.
- Uses a dependency you already have instead of building durability yourself.

**Weaknesses**

- Two execution paths (fast path and activity) must enforce *identical* policy. Mitigate this by running the same gateway pipeline in both, with only stage 8 swapped.
- Temporal history and visibility can leak data unless codecs and claim checks are disciplined.
- Running and debugging it is more complex: Temporal UI, a codec server, and queue management.

---

### Option D: Out-of-Process Driver Gateway Service (with an optional WASM extension tier)

Drivers and credentials live in a **separate service**. The agent processes never hold a secret.

**Shape**

- A dedicated **Driver Gateway** deployable runs Option B's pipeline. It can be a split Backstage backend deployment with only the gateway plugin installed, or a standalone service.
- Agents call it over an internal API (HTTP/gRPC), authenticated with Backstage service-to-service tokens plus an **on-behalf-of user token**, so the gateway can authorize the original user.
- The secrets backend and token broker are reachable **only** from the gateway's network segment and identity. Network policy denies egress to provider hosts from every other pod.
- Optionally, a **WASM extension tier** (wazero-equivalent in Node, for example Extism) for customer-authored or marketplace drivers:
  - Guests implement only `prepare` and `fill` (Conduit's `call_prepare` and `call_fill`) and reach the network through `host_egress` (the gateway).
  - Installation is signed, with a declared egress allow-list and consent.
  - Unlike Conduit, sandboxed drivers may serve writes and user standing, because the gateway enforces RBAC, standing, approval, and audit. The sandbox is about **code provenance**, not about effect.
- An MCP facade over the gateway is natural, so external agent hosts (IDE assistants) can use the same governed tools.

**Strengths**

- The strongest segmentation story for SOC 2, HIPAA, and FINRA. Credential blast radius is one small, independently hardened service. Egress happens from one place, which suits a firewall or proxy allow-list.
- Independent scaling, deploys, and on-call. Polyglot drivers become possible.
- One governed tool surface for Backstage agents and any other agent host.

**Weaknesses**

- A network hop on every call; mitigated by the gateway's own cache.
- More infrastructure, plus on-behalf-of token plumbing.
- Overkill until there are multiple consumers, third-party drivers, or an auditor asking for segmentation.

---

## 4. Comparison and Recommendation

| Requirement | A: Typed ports | B: Catalog + gateway | C: B on Temporal | D: Out-of-process gateway |
| --- | --- | --- | --- | --- |
| Base contract + vendor + org extensions | Interfaces and subclasses | **Layers + mappings** | **Layers + mappings** | **Layers + mappings** (+ sandboxed org drivers) |
| Mandatory, optional, extended, specific-provider requirements | Bolt-on | **Native** (catalog-driven solver) | **Native** | **Native** |
| Sync + async | Ad hoc | Sync native; async needs an engine | **Both native** | Both, if paired with C |
| User / service / either credentials | By convention | **Structural** | **Structural** + durable re-consent | **Structural** + segmented |
| Granular RBAC (action × standing) | Per-proxy | **One enforcement point** | **One point** (shared pipeline) | **One point**, isolated |
| Caching + rate-limit avoidance | Per driver | **Centralized** | **Centralized + queue backpressure** | Centralized |
| Thousands of concurrent users | OK | OK | **Best** (scales per provider) | **Best** (scales independently) |
| Audit and write preview | Weak | **Exact intent** | **Exact intent + durable approvals** | **Exact intent** |
| Prompt-injection controls (slot provenance) | Bolt-on | **Native** | **Native** | **Native** |
| Build cost | **Low** | Medium | Medium-high | High |

### Recommendation

**Adopt Option B's contract model, executed with Option C's plane, and keep Option D as a deployment topology to grow into.** These three aren't truly competing. B defines *what a driver and capability are*. C defines *where calls execute durably*. D defines *where the gateway is deployed*. If you design B's gateway pipeline as a library with a pluggable "execute" stage from the start, moving to C and then D is a deployment change, not a rewrite.

### Suggested sequencing

1. **Catalog and descriptors.**
   - Define the capability descriptor (§2.2) and the core words for `vcs` and `communication`.
   - Write the requirement algebra and solver (§2.3), plus the capability report endpoint.
2. **Gateway pipeline, in-process.**
   - Resolution ladder, RBAC rules (§2.5), standing resolution with secret references, egress with redirect refusal and path confinement, and audit.
   - Port two drivers as `prepare`/`fill`: GitHub and a vanilla Git driver, to prove `not_served` and the requirement checks.
3. **Token broker** for user standing (§2.4). This is likely the longest pole.
4. **Cache and rate limiting:** L1/L2 tiers, single-flight, ETag revalidation, header-adaptive buckets, and priority classes.
5. **Temporal execution:** per-provider task queues, approvals as signals, async `OperationHandle` with webhook signals and the inquiry fallback, payload codec, and claim-check.
6. **Native adapters** for `cloud-providers` (SigV4 and friends), with gateway-injected signers.
7. **Later, demand-driven:** split the gateway into its own deployment (D), add the WASM tier for customer-authored drivers, and add an MCP facade.

### Open questions to settle before building

1. **Token broker scope:** which providers need user standing on day one, and does the org accept server-side storage of user refresh tokens (KMS-backed)?
2. **Multi-instance providers:** must one installation bind multiple instances of the same provider (github.com and GHES), and can one user select between them? This decides whether the resolution ladder needs per-user selection (Conduit's rung 2).
3. **Approval policy source:** should approval rules for writes live in the Backstage permission policy, in agent manifests, or in a separate policy engine (OPA/Cedar)?
4. **Data classification:** who assigns `dataClass` for vendor and org capabilities, and does `regulated` forbid L2 caching or only shorten its TTL?
5. **Third-party drivers:** will customers install drivers you didn't write? If not, defer the WASM tier indefinitely.


## 8. Shared Building Blocks

These apply to every option:

- **Requirements:** agents declare per-feature requirements with combinators (`requires` or `optional`, using `allOf`, `anyOf`, `exactlyOne` and `not`). They're checked at startup, when a run starts, and on each call. Each check gives a definite answer such as "connect your account" or "not permitted".
- **Argument sources:** each argument says whether the model may fill it or whether it must come from trusted context. This adapts Conduit's `Fill` as a defence against prompt injection.
- **Credentials:** each call uses either the user's credential, an org or sub-org service credential, or a service credential with the user recorded as the actor. Credentials are resolved by reference and never placed in Temporal history.
- **RBAC:** Backstage permissions are conditional on capability, provider, effect and credential type. The agent's declared requirements cap what the user's permissions allow.
- **Caching:** cache keys include whose credential was used. It has two tiers, collapses duplicate concurrent requests, and uses ETag revalidation. Writes invalidate related cache entries.
- **Rate limiting:** limits are tracked per provider and credential and adjust from the provider's response headers. Interactive users get priority over background agents.
- **Async calls and audit:** async calls finish via a webhook, with a timer and status check as the fallback. Write audits record the exact request that was sent.

