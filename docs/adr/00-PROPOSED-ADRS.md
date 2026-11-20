# Proposed ADRs — Staging Log

**Status:** Draft staging log (initialized at KICKOFF, 2026-11-19; no entries yet)

This file is the single staging area for architectural decisions surfaced while drafting requirements. It is **append-only** during SUBSYSTEM passes. Accepted or proposed decisions graduate to individual `docs/adr/ADR-###-<slug>.md` files only in an ADR_BATCH pass.

## How Subsystem Passes Use This Log

1. **Check first.** Before adding an entry, search `docs/adr/ADR-*.md` and this file for an existing decision on the same boundary, including the candidate boundaries `BD-01` - `BD-11` in [RELEASE-SCOPE.md §7](../requirements/RELEASE-SCOPE.md).
2. **Append, don't duplicate.** If a `PROP-###` already covers the boundary, append your dependent `REQ-###` IDs to its **Dependent REQ IDs** field and, if needed, add a dated line under **Additional Context**. Do not change another pass's alternatives or recommendation.
3. **Otherwise add a new entry** at the end of the log, using the next free ID in your subsystem's PROP block (see [00-INDEX.md §1](../requirements/00-INDEX.md)). When a `BD-##` candidate exists, use its suggested slug.
4. **Link back.** Reference the `PROP-###` in every affected requirement's **Links** field. Mark the requirement `Scope: Undecided` if the proposal blocks it.
5. **Never** create `docs/adr/ADR-###-*.md` files or assign `ADR-###` numbers in a SUBSYSTEM pass.

### PROP ID Blocks

| Block | Owner |
| :-- | :-- |
| `PROP-001` - `PROP-099` | Cross-Cutting (`07`) |
| `PROP-100` - `PROP-199` | 01 Workflow Authoring SDK |
| `PROP-200` - `PROP-299` | 02 Durable Execution Engine |
| `PROP-300` - `PROP-399` | 03 Agent Reasoning Runtime |
| `PROP-400` - `PROP-499` | 04 Tool & Capability Registry |
| `PROP-500` - `PROP-599` | 05 Context, Memory & RAG |
| `PROP-600` - `PROP-699` | 06 Backstage Control Plane |

### Entry Lifecycle (`Status` field)

| Status | Meaning |
| :-- | :-- |
| `Open` | Staged; awaiting ADR_BATCH |
| `Promoted → ADR-###` | Written as its own ADR file; requirements now link the `ADR-###` |
| `Merged → PROP-### / ADR-###` | Consolidated into another entry during ADR_BATCH |
| `Withdrawn` | No longer needed (state the reason in Additional Context) |

---

## Entry Template

Copy this block verbatim for each new proposal. Keep fields in this order.

```markdown
### PROP-###: <Proposed Slug>

- **Status:** Open
- **Proposed Slug:** `<kebab-case-slug>` (use the `BD-##` suggested slug when one exists)
- **Originating Subsystem:** <NN subsystem-name>
- **Related Candidates:** <BD-##, CF-##, SD-##, or `None`>
- **Context / Decision Needed:** <The architectural boundary, the constraint that forces a decision, and the precise question to answer.>
- **Alternatives & Trade-offs:**
  1. **<Option A>** — <Benefits>. <Costs/risks>.
  2. **<Option B>** — <Benefits>. <Costs/risks>.
  3. **<Option C, if any>** — <Benefits>. <Costs/risks>.
- **Recommendation (Non-Binding):** <Preferred option and why, or `None — requires product-owner input`>
- **Sources:** <`docs/discovery/<file>.md` — §Heading; one per line>
- **Dependent REQ IDs:** <REQ-###, REQ-###, …>
- **Additional Context:** <Dated notes appended by later passes, or `None`>
```

---

## Log

_No proposals yet. Subsystem passes append entries below this line._
