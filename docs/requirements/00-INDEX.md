# Requirements Index

**Status:** Draft
**Last updated:** 2026-11-19 (KICKOFF pass)

This index is the shared guide for writing, numbering, and finding AI Crew Suite requirements. Release scope (what the first public release must deliver) lives in [RELEASE-SCOPE.md](./RELEASE-SCOPE.md). Proposed architectural decisions are staged in [../adr/00-PROPOSED-ADRS.md](../adr/00-PROPOSED-ADRS.md) until promoted to `docs/adr/ADR-###-<slug>.md`.

Requirement files describe **contracts and ownership**, not package or source-file boundaries. The current plugin layout is provisional; do not name packages in a `shall` statement unless the package boundary is itself the requirement.

---

## 1. Subsystem Files & Pre-Allocated ID Blocks

`REQ-###` IDs are globally unique, never renumbered, and never reused. Gaps are expected. Each subsystem pass draws IDs **only** from its own blocks, so parallel passes cannot collide. Use the primary block first; use the overflow block only after the primary block is exhausted.

| Subsystem | Requirements File | Primary Discovery Source | REQ Primary Block | REQ Overflow Block | PROP Block |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 00 Cross-Cutting (NFRs, Security, Observability, Testing) | [07-nfrs-security-observability.md](./07-nfrs-security-observability.md) | [07-nfrs-security-observability.md](../discovery/07-nfrs-security-observability.md) | `REQ-001`–`REQ-099` | `REQ-700`–`REQ-779` | `PROP-001`–`PROP-099` |
| 01 Workflow Authoring & Graph Definition SDK | [01-workflow-authoring-sdk.md](./01-workflow-authoring-sdk.md) | [01-workflow-authoring-sdk.md](../discovery/01-workflow-authoring-sdk.md) | `REQ-100`–`REQ-199` | `REQ-950`–`REQ-969` | `PROP-100`–`PROP-199` |
| 02 Durable Execution & Orchestration Engine | [02-durable-execution-engine.md](./02-durable-execution-engine.md) | [02-durable-execution-engine.md](../discovery/02-durable-execution-engine.md) | `REQ-200`–`REQ-299` | `REQ-780`–`REQ-849` | `PROP-200`–`PROP-299` |
| 03 Agent Reasoning & Inference Runtime | [03-agent-reasoning-runtime.md](./03-agent-reasoning-runtime.md) | [03-agent-reasoning-runtime.md](../discovery/03-agent-reasoning-runtime.md) | `REQ-300`–`REQ-399` | `REQ-900`–`REQ-929` | `PROP-300`–`PROP-399` |
| 04 Tool & Capability Registry | [04-tool-and-capability-registry.md](./04-tool-and-capability-registry.md) | [04-tool-and-capability-registry.md](../discovery/04-tool-and-capability-registry.md) | `REQ-400`–`REQ-499` | `REQ-850`–`REQ-899` | `PROP-400`–`PROP-499` |
| 05 Context, Memory & Knowledge Retrieval | [05-context-memory-and-rag.md](./05-context-memory-and-rag.md) | [05-context-memory-and-rag.md](../discovery/05-context-memory-and-rag.md) | `REQ-500`–`REQ-599` | `REQ-930`–`REQ-949` | `PROP-500`–`PROP-599` |
| 06 Backstage Control Plane & Surface Layer | [06-backstage-control-plane.md](./06-backstage-control-plane.md) | [06-backstage-control-plane.md](../discovery/06-backstage-control-plane.md) | `REQ-600`–`REQ-699` | `REQ-970`–`REQ-989` | `PROP-600`–`PROP-699` |
| Reserved (index maintainer / AUDIT corrections only) | — | — | `REQ-990`–`REQ-999` | — | — |

Notes:

- The cross-cutting file keeps the discovery filename (`07-…`) for traceability but owns the `REQ-0xx` block. `docs/PLANNING.md` proposed `07-cross-cutting-requirements.md`; this index supersedes that name.
- Overflow sizes are weighted by discovery volume (cross-cutting 160 sections, 02 155, 04 133, 06 138, 03 111, 01 74, 05 70). If a pass exhausts both blocks, stop and request a new block in this table rather than borrowing another subsystem's range.
- Files listed above do not exist until their SUBSYSTEM pass runs.
- `ADR-###` numbers are assigned sequentially in the ADR_BATCH pass only. Subsystem passes never create `ADR-###` IDs.

### Other ID prefixes (defined in [RELEASE-SCOPE.md](./RELEASE-SCOPE.md))

| Prefix | Meaning | Where defined |
| :-- | :-- | :-- |
| `CD-##` | Confirmed Direction item (may justify `Scope Basis: Confirmed`) | RELEASE-SCOPE §2 |
| `DF-##` | Explicit deferral (the only basis for `Scope: Deferred`) | RELEASE-SCOPE §4 |
| `SD-##` | Unresolved scope decision awaiting product-owner sign-off | RELEASE-SCOPE §5 |
| `CF-##` | Conflicting discovery notes requiring reconciliation | RELEASE-SCOPE §6 |
| `BD-##` | Architectural boundary decision expected to become a `PROP-###` / `ADR-###` | RELEASE-SCOPE §7 |
| `OWN-##` | Unclear canonical ownership between subsystems | RELEASE-SCOPE §8 |

---

## 2. Scope Labels

Every requirement carries exactly one **Scope** label and one **Scope Basis**.

| Scope | Meaning |
| :-- | :-- |
| `Launch` | Must be delivered and verified in the first public release. Being implemented in a late internal layer does **not** demote a `Launch` requirement. |
| `Deferred` | Explicitly excluded from the first public release by a recorded deferral in RELEASE-SCOPE §4. Architecture must not preclude it unless the deferral says otherwise. |
| `Undecided` | Scope depends on an open `SD-##` scope decision or is blocked by an unresolved `PROP-###`. Cite the blocker in **Links**. |

| Scope Basis | Meaning |
| :-- | :-- |
| `Confirmed` | Traceable to a Confirmed Direction item in RELEASE-SCOPE §2 or an explicit product-owner decision. |
| `Proposed` | Drafted from discovery notes and treated as a launch candidate, but not yet approved. This is the default for SUBSYSTEM passes. |

Rules:

- `Launch` + `Proposed` is the normal state for an outlined capability that has not been explicitly deferred.
- Never mark a requirement `Confirmed` on the strength of a discovery note alone.
- Prohibitions ("shall not") are requirements like any other and carry a scope.
- A requirement blocked by a `PROP-###` must be `Undecided` unless its statement is valid under every alternative in that proposal.

---

## 3. Requirement Template (exact)

Copy this block verbatim for every requirement. Keep fields in this order. Use `N/A` rather than deleting a field.

```markdown
### REQ-###: <Short Title>

- **Type:** FR | NFR
- **Scope:** Launch | Deferred | Undecided
- **Scope Basis:** Confirmed | Proposed
- **Statement:** The <actor/component contract> shall <single testable behavior>.
- **Verification:**
  - **Scenario:** <Given/when setup that exercises the statement>
  - **Expected Result:** <Observable outcome that proves the statement>
  - **Failure Behavior:** <Required behavior when the contract is violated or a dependency fails, or `N/A`>
  - **Method:** Unit Test | Type Test | Contract Test | Integration Test | Replay Test | E2E Test | Fault-Injection Test | Inspection | Analysis | Drill
- **Source:** `docs/discovery/<file>.md` — §<Exact Heading Text>
- **Links:** <REQ-###, PROP-###, ADR-###, SD-##, CF-##, `[CONTRACT-STUB: <subsystem>]`, or `None`>
- **Notes:** <Optional rationale, V1 failure mode, or `[TBD: threshold]` explanation; omit nothing — use `None`>
```

Authoring rules:

1. **One `shall` per requirement.** Split compound behaviors. "And" in a statement is a smell.
2. **Testable.** Each statement must be verifiable by the stated Method. Avoid "robust", "secure", "fast", "appropriate".
3. **No invented numbers.** Do not invent latency, capacity, retention, or budget thresholds. Write `[TBD: threshold]` in the Statement and explain in Notes. Thresholds quoted verbatim in discovery (e.g., `<500ms`, `24h`, `MaxSteps = 4`) may be used but must be marked `Proposed`.
4. **Single canonical home.** Platform-wide guarantees (identity, audit, redaction policy, error taxonomy, telemetry conventions, secret handling, retention) live in the cross-cutting file. A subsystem file states only its own enforcement point and links the cross-cutting `REQ-0xx`.
5. **Contract stubs.** When a requirement depends on an interface owned by another subsystem, state the expected contract inline and tag it `[CONTRACT-STUB: <NN subsystem-name>]` (e.g., `[CONTRACT-STUB: 04 tool-and-capability-registry]`). The owning pass must resolve or reject every stub that targets it.
6. **Failure behavior.** Include Failure Behavior whenever it changes the contract (fail-closed authorization, non-retryable errors, replay divergence, suspension instead of failure).
7. **V1 lessons.** Cite V1 / prototype failure modes in Notes as motivation; never as a compatibility requirement.
8. **No packages.** Name contracts (`CapabilityGateway`, `CheckpointStore`, Graph IR) rather than packages or source paths.

Example (illustrative only; not an assigned ID):

```markdown
### REQ-1xx: Reject Dangling Graph Transitions

- **Type:** FR
- **Scope:** Launch
- **Scope Basis:** Proposed
- **Statement:** The workflow compiler shall reject a workflow definition containing a transition to an undeclared node before the definition can be registered for execution.
- **Verification:**
  - **Scenario:** Build a workflow whose `.addChoice()` router targets an undeclared node name and call `.compile()`.
  - **Expected Result:** Compilation fails with a validation error identifying the source node and the missing target.
  - **Failure Behavior:** No compiled blueprint is produced; registration is impossible.
  - **Method:** Unit Test
- **Source:** `docs/discovery/01-workflow-authoring-sdk.md` — §`.compile()` — Static Topology Verification & Sealed Blueprint Finalizer
- **Links:** None
- **Notes:** None
```

---

## 4. Document Skeleton for Subsystem Files

Each `docs/requirements/NN-*.md` file uses this structure:

```markdown
# Requirements: NN — <Subsystem Name>

**Status:** Draft
**ID Blocks:** REQ-xxx–REQ-yyy (overflow REQ-aaa–REQ-bbb); PROP-xxx–PROP-yyy
**Primary Source:** `docs/discovery/NN-<file>.md`

## 1. Scope & Ownership
<What this subsystem canonically owns; what it consumes from others.>

## 2. Requirements
<Grouped by capability area. Each requirement uses the §3 template.>

## 3. Contract Stubs Raised
| Stub Target | Expected Contract | Dependent REQ-### |

## 4. Open Questions
<Items that are neither requirements nor ADR proposals.>

## 5. Source Coverage Table
<Per §5 below.>
```

---

## 5. Source Coverage Table Format

Every SUBSYSTEM file ends with a Source Coverage Table that maps **every** heading in its PRIMARY discovery file. List every `###` heading as a row. List a `####` heading as an indented sub-row (prefix `↳`) when its disposition differs from its parent; otherwise it rolls up to the parent row.

```markdown
| # | Discovery Heading | Line | Disposition | Mapped IDs | Rationale |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | §Agent-Level Provider Restriction Policy (`AgentDefinition`) | L5 | REQ | REQ-101, REQ-102 | — |
| 2 | ↳ §2. Base Contracts | L218 | Non-Normative Note | — | Illustrative TypeScript; contract captured in REQ-110 |
| 3 | §Three-Tier Monorepo Package Split for Worker Portability | L190 | PROP | PROP-101 | Package boundary; depends on BD-02 |
```

Allowed **Disposition** values (exactly one per row):

| Disposition | Use when | Mapped IDs column |
| :-- | :-- | :-- |
| `REQ` | One or more requirements were drafted from this section | The `REQ-###` IDs |
| `PROP` | The section's substance depends on an unsettled boundary | The `PROP-###` ID(s) (plus any `Undecided` REQs) |
| `Duplicate` | Fully covered by another section or another subsystem's requirement | The covering `REQ-###` / heading |
| `Explicitly Deferred` | Covered by a deferral in RELEASE-SCOPE §4 | The deferral reference |
| `Non-Normative Note` | Illustrative code, rationale, stale-prototype caveat, or reference topology | — (Rationale required) |
| `Open Question` | Needs product-owner input and is not an architectural boundary | `SD-##` or section in §4 Open Questions |

Rationale is mandatory for every row except `REQ`.
