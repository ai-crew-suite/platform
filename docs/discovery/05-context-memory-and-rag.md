# Discovery: 05 - Context, Memory & Knowledge Retrieval

This staging file collects all raw research and design notes related to short-term execution checkpoints, cross-session semantic memory via Mem0, vector database abstractions, and enterprise Retrieval-Augmented Generation (RAG) over the Backstage Software Catalog and TechDocs. All notes captured here govern how agents persist, scope, and retrieve knowledge across different time horizons.

### Ephemeral Run Artifact Spillover Store
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Prompt & Context Anti-Patterns) -->

**Large Output Spillover Storage:** The run-scoped storage layer must support saving oversized tool outputs as addressable run artifacts (referenced by ID or path) so agents can inspect or query slices on demand without holding raw megabytes in active conversation history.

### Memory Tier Separation, Curation & Eviction Policies
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (State & Memory Design Flaws) -->

* **Separate Raw Transcripts from Curated Memory:** Never dump raw conversation logs or unedited tool outputs straight into long-term vector/semantic storage (Mem0), which pollutes semantic retrieval with noise. Maintain a strict boundary between raw run transcripts (audit/replay logs) and curated, structured working/long-term memory (extracted facts, entity relationships, and user/team profiles) that is deliberately updated and pruned.
* **Bounded Memory Injection Budgets:** Long-term memory retrieval must inject only a bounded, relevance-ranked summary into the active prompt so historical context never crowds out the current task instructions.
* **Retention Windows, Compaction & Eviction:** Every memory store and namespace must enforce explicit retention policies (TTLs), deduplication, and periodic compaction/archival rules to prevent unbounded growth and stale-fact drift over time.

### Mutable Preferences vs. Locked Agent Instructions
<!-- Source: incoming/AGENT_COMMON_DESIGN_FLAWS.md (Prompt & Context Contamination) -->

* **Strict Boundary Between Memory and System Prompts:** Long-term memory updates (via Mem0 or user preference stores) may only write to scoped user/team preference namespaces—never to the agent's core instruction template. Injected memory must be delimited as untrusted/advisory context data rather than system-level directives.

### Strict Mem0 Scoping & Non-Authoritative Context Guardrails
<!-- Source: incoming/AGENT_RECONCILIATION_CONTROLLER_KAZI.md -->

* **Mem0 Is Advisory Only (Never Authoritative):** Retrieved memories from Mem0 must **never** act as the source of truth for goal state, RBAC permissions, approved acceptance criteria, budgets, or verification evidence.
* **Pre- and Post-Retrieval Tenant/Project Isolation:** Enforce Backstage tenant and project authorization **before** querying Mem0 (via strict `user_id` / `agent_id` / `app_id` / `run_id` identifier scoping and metadata filters) and re-verify authorization before presenting retrieved memories to the model—never rely on LLM-chosen filter parameters.
* **Provenance, Freshness & Untrusted Input Treatment:** Treat all retrieved memories (and repository text) as untrusted, potentially stale advice carrying explicit provenance and `expirationDate` / retention rules. Never allow a retrieved memory to silently alter an approved goal revision or authorize tool execution.

### Short-Term Checkpoint Store Schema & Composite Key Invariant
<!-- Source: incoming/CODING_STANDARDS.md (Section C.1) -->

* **`(runId, seq)` Uniqueness & Versioning:** The short-term checkpoint persistence layer must enforce an append-only model indexed by `(runId, seq)` and store an explicit `stateVersion` alongside each checkpoint payload to support safe schema evolution and corruption checks.

### Pluggable `StateSerializer` Seam on `CheckpointStore`
<!-- Source: incoming/CODING_STANDARDS.md (Section C.2) -->

* **Abstract `StateSerializer` Extension Seam:** `CheckpointStore` must expose a pluggable `StateSerializer` interface so raw byte serialization and field-level payload encryption are handled entirely within the storage extension layer rather than hardcoded into core persistence logic.

### `CheckpointStore` Connectivity Probe Contract
<!-- Source: incoming/CODING_STANDARDS.md (Section G.1) -->

* **Lightweight `ping()` Method:** `CheckpointStore` implementations must expose a fast, non-destructive `ping()` / health-check operation (e.g., `SELECT 1` for SQL backends) invoked at boot time to verify database connectivity and credentials before accepting runs.

### Automated Retention Sweeper & Hard-Delete Purging
<!-- Source: incoming/CODING_STANDARDS.md (Section G.2) -->

* **Isolated Storage-Module Cleanup Loop:** Implement an automated background retention sweeper isolated entirely within the runtime storage module (never coupled into core workflow orchestration loops).
* **Hard-Delete Expired Run Data:** When checkpoints, run-step event logs, or ephemeral run artifacts exceed the configured `retention` threshold (evaluated against plaintext `createdAt` metadata), the sweeper must perform an irreversible hard delete to prevent storage bloat and satisfy enterprise data-retention mandates.

### External Evidence Artifact Storage for Verification Runs (P1)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P1 - Predicate evaluation and evidence) -->

* **Reference-Only History Footprint:** Store verbose verifier outputs (test reports, probe logs, diff summaries) in the redacted artifact store keyed by `evidenceRef` so Temporal workflow state remains compact and immune to history size limits.

### First-Class Durable `Session` Entity & Relational Lineage (P7)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P7 - Resumable, steerable task sessions) -->

* **Decouple `Session` from Individual `Run` Executions:** Model a user/team task `Session` as a durable, first-class entity spanning zero, one, or many sequential Temporal `runId` executions.
* **End-to-End Artifact & Governance Lineage:** Preserve bidirectional foreign-key/index links connecting each `Session` to all child runs, message transcripts, human approval records, and generated artifacts so follow-up runs reconstruct complete, auditable task context.

### Long-Session Context Compaction & Traceable Checkpoints (P15)
<!-- Source: incoming/PLATFORM_MISSING_FEATURES.md (P15 - Long-session context compaction and restoration) -->

* **Three-Way Compaction Boundary:** Keep short-term task context compaction strictly separate from both (a) Mem0 cross-session long-term semantic memory and (b) Temporal workflow-history `Continue-As-New` compaction.
* **Bounded, Versioned Session Compaction Checkpoints:** When a durable task session approaches or exceeds model context-window limits, generate a bounded, versioned compaction checkpoint preserving:
  * Reference to the approved goal/workflow contract.
  * Key architectural/task decisions made so far.
  * Current workflow execution position/cursor.
  * Unresolved questions and open blockers.
  * Explicit references/IDs pointing back to original source messages and run artifacts.
* **Traceable, Correctable & Non-Authoritative Summaries:** Treat compacted summaries strictly as a compressed working view—never as an authority capable of mutating or overriding an approved goal contract. Maintain lineage links to underlying source messages so operators or workflows can inspect and correct inaccurate summaries.

### `StateSerializer.serialize()` Cryptographic Guard on `CheckpointStore`
<!-- Source: incoming/SECRETS_MANAGEMENT.md -->

* **Pre-Write Snapshot Encryption Seam:** Immediately before persisting a conversational or graph execution snapshot to cold storage (`CheckpointStore`), invoke `StateSerializer.serialize()` to transform cleartext context into an opaque encrypted `Uint8Array` payload when a cryptographic serializer is configured.

### Decoupled Runtime Persistence Contracts & Dedicated Redis Isolation
<!-- Source: incoming/STORAGE_RUNTIME_README_PERSISTENT_STATE.md -->

* **Decouple Runtime State from Vector Storage:** Separate operational run/session/checkpoint persistence from vector embedding stores (e.g., `pgvector` / Mem0) so deployments can mix and match storage technologies independently.
* **Five Core Persistence Contracts:** Standardize runtime persistence behind five distinct interfaces:
  * `SessionStore` (conversational session messages; supports `database` or `redis` with sliding TTL and `maxMessages` cap).
  * `CheckpointStore` (resumable orchestration state; supports `database` or `redis` with sliding TTL).
  * `RunStore` (run records, event logs, statuses, idempotency keys, approvals; **SQL database only**).
  * `ArtifactSink` (artifact metadata and references produced by runs; **SQL database only**).
  * `AuditLogSink` (non-repudiable write and approval audit records; **SQL database only**).
* **Dedicated Redis Instance (Never Use Shared Platform Cache):** When `SessionStore` or `CheckpointStore` uses `redis`, require a dedicated Redis connection (`ai.runtime.stores.redis`) isolated from Backstage's general `coreServices.cache`. Shared cache backends (such as Memcached LRU or per-process memory) introduce unacceptable eviction risks for active sessions and multi-day paused checkpoints.
* **Note on Stale File Tree:** Ignore the legacy `security-driver.extension-point.ts` (Vault/KMS) shown in the file's top directory tree; secrets follow the Environment-Driven Credentials policy (`SECRETS_MANAGEMENT.md`).

### Vector Store Connection Sharing & Collection Isolation (Mem0 vs. RAG)

<!-- Source: incoming/VECTOR_DATABASES_THRU_MEM0.md(Sections: Why Mem0 Limits Direct Access, How to Bypass This Limitation in Your Backstage Architecture)  -->

Mem0 operates strictly as a high-level **Memory Orchestration Layer** (running fact extraction, deduplication, and fusion pipelines on `memory.add()`) rather than a general-purpose vector ORM. Its internal service class encapsulates the database driver and does not expose a public `.client` handle for arbitrary queries, aggregations, or bulk wipes.

#### Architectural Rules for Vector Storage
1. **Collection-Level Separation (Mem0 Memory vs. Domain RAG):**
   - Mem0 enforces rigid payload schemas and keyword indexes on scope keys (`user_id`, `agent_id`, `run_id`). Directly mutating, deleting, or re-indexing rows inside a Mem0-managed collection corrupts its internal fact-tracking state machines.
   - **Rule:** Heavy domain document catalogs (RAG), catalog embeddings, and bulk-wipeable indexes must be stored in **dedicated vector collections/tables** separate from Mem0's memory collection (`backstage_agent_memory`), even when hosted on the same Qdrant or `pgvector` cluster.
2. **Shared Client / Connection Pool Strategy:**
   - Where supported by the underlying adapter, instantiate the vector database client (e.g., `QdrantClient` or `pg.Pool`) in the Backstage core runtime using TLS and credentials injected via Backstage `RootConfigService` / Secret Manager, and share that pool across RAG services and Mem0.
   - **SDK Caveat (`mem0ai/oss`):** Unlike the Python `mem0` SDK (which accepts `client` in `vector_store.config`), the TypeScript OSS package (`mem0ai/oss`) uses camelCase configuration keys (`collectionName`, `embeddingModelDims`, `url`, `apiKey`) and does not uniformly expose `client` injection across all TS vector store providers. Verify provider support in `mem0ai/oss` at adapter initialization; if unsupported by a given TS driver, configure Mem0 with explicit connection parameters (`url`, `apiKey`, `collectionName`) pointing to the same cluster while keeping RAG operations on the core-managed client.
3. **Tenant-Safe Scope Keys:**
   - All Mem0 reads and writes must pass normalized, tenant-qualified scope identifiers (e.g., Backstage entity refs such as `user:default/alice` paired with `agentId` / `runId`) rather than bare usernames.

```typescript
// Recommended initialization pattern (Reconciled for mem0ai/oss & Enterprise Security)
import { Memory } from 'mem0ai/oss';
import { QdrantClient } from '@qdrant/js-client-rest';

// 1. Core-managed client for RAG catalogs and administrative operations (TLS + Secret Manager)
const ragQdrantClient = new QdrantClient({
  url: config.getString('agentPlatform.vectorDb.url'),
  apiKey: config.getString('agentPlatform.vectorDb.apiKey'),
});

// 2. Mem0 manages its own isolated collection; never mutate this collection directly via ragQdrantClient
const memoryEngine = new Memory({
  vector_store: {
    provider: 'qdrant',
    config: {
      url: config.getString('agentPlatform.vectorDb.url'),
      apiKey: config.getString('agentPlatform.vectorDb.apiKey'),
      collectionName: 'backstage_agent_memory',
      embeddingModelDims: 1536,
    },
  },
});

// 3. Always scope with canonical Backstage entity refs
await memoryEngine.add('User prefers Datadog metrics over CloudWatch alerts.', {
  userId: 'user:default/alice',
  agentId: 'agent:default/observability-advisor',
});
```

### Database-Agnostic RAG Abstraction Layer (`@vectorstores/*`)

<!-- Source: incoming/VECTOR_DATABASES_THRU_MEM0.md (Sections: Vectorstores, Supported Vector Databases, How the ORM-like Interface Works) -->

For domain RAG, document ingestion, and catalog similarity search (distinct from Mem0 conversational/fact memory), the platform standardizes on the modular `@vectorstores/*` ecosystem (a lightweight ~77.5 KB fork of `LlamaIndexTS` with isolated provider packages).

#### Supported Provider Packages & Environment Policy
- **`@vectorstores/qdrant`:** Primary production vector backend for high-throughput hybrid search and metadata filtering.
- **`@vectorstores/pgvector`:** Relational vector backend for teams standardized on PostgreSQL; must enforce tenant isolation via PostgreSQL `LIST` partitioning or mandatory tenant predicate filtering alongside HNSW iterative scans (`hnsw.iterative_scan = strict_order`).
- **`@vectorstores/core` (`SimpleVectorStore`):** Built-in in-memory/local-disk adapter restricted **strictly to local development and automated Vitest suites**. Prohibited in staging/production regulated environments.

#### Runtime Resolution & Isolation Rules
1. **Control-Plane Instantiation:** Provider adapters (`QdrantVectorStore`, `PGVectorStore`) are instantiated centrally in the Backstage core runtime using TLS endpoints and credentials resolved from `RootConfigService` / Secret Manager—never from raw `process.env` reads inside workflow code.
2. **Separation from Mem0:** `@vectorstores/*` indexes operate exclusively on dedicated RAG/catalog collections or tables and must never point at collections managed by `mem0ai/oss`.

```typescript
// Runtime adapter factory (reconciled for Backstage RootConfigService)
import { VectorStoreIndex, type BaseVectorStore } from '@vectorstores/core';
import { QdrantVectorStore } from '@vectorstores/qdrant';
import { PGVectorStore } from '@vectorstores/pgvector';

export function createRagVectorStore(config: RootConfigService): BaseVectorStore {
  const provider = config.getString('agentPlatform.rag.vectorStore.provider');

  if (provider === 'qdrant') {
    return new QdrantVectorStore({
      url: config.getString('agentPlatform.rag.vectorStore.qdrant.url'),
      apiKey: config.getString('agentPlatform.rag.vectorStore.qdrant.apiKey'),
    });
  }

  return new PGVectorStore({
    connectionString: config.getString('agentPlatform.rag.vectorStore.pgvector.connectionString'),
  });
}
```

### Unified Append-Only Session & ReAct Step Transcript Model
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 2: Opaque Failure Points, Footnote 3) -->

Rather than splitting conversation turns and internal reasoning steps across separate tables or writing local JSONL files (which violates stateless worker and compliance rules), `SessionStore` persists every turn and intermediate ReAct step as an **append-only, parent-child linked event stream** (`id`, `parentId`, `runId`, `nodeId`, `seq`):

- **User Turn (`role: "user"`):** Records the sanitized user prompt or signal payload.
- **Intermediate ReAct Reasoning & Action (`role: "assistant"`):** Records structured content blocks for model reasoning (`type: "thinking"`), one or more tool invocations (`type: "toolCall"` with `toolCallId`, `toolName`, and normalized `arguments`), token usage, and cost metadata.
- **Intermediate ReAct Observation (`role: "toolResult"`):** Recorded immediately after execution, referencing `toolCallId`, `toolName`, the sanitized `content` returned to the LLM, and a structured `details` payload for audit/UI inspection.
- **Final Assistant Response (`role: "assistant"`):** Records the final `type: "text"` output delivered to the user.

#### Memory & Context Diff Snapshots

- To distinguish retrieval drift from prompt or tool failures, each reasoning turn records a **context diff snapshot** capturing the exact Mem0 memory IDs, RAG document chunk IDs, Backstage Catalog `entityRefs` injected into the prompt, and pre/post-compaction token counts.

### Three-Tier Memory Hierarchy, Multi-Tenant Mem0 Scoping & Poisoning Write-Gates
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 10: Cross-Session Memory Hygiene) -->

To prevent context rot while eliminating cross-team data leakage and stale infrastructure advice, the platform replaces flat Markdown memory files with a three-tier memory architecture:

1. **Three-Tier Memory Mapping:**
   - **Tier 1 — Hot Working Memory (Vercel AI SDK `messages` + `experimental_prepareStep`):** Holds active turns in memory; prunes or summarizes verbose tool results immediately after step completion.
   - **Tier 2 — Durable Workflow Checkpoints (Temporal State & `CheckpointStore`):** Owns multi-step execution state, pending HITL approvals, and artifact references across `Continue-As-New` boundaries.
   - **Tier 3 — Distilled Cross-Session Semantic Memory (`mem0ai/oss`):** Stores only distilled facts, verified preferences, and post-mortem lessons—never raw transcripts or unparsed logs.
2. **Strict Multi-Tenant & Blast-Radius Mem0 Scoping:**
   - Every Mem0 read and write enforces mandatory `tenantId` isolation and partitions records across three blast radii:
     - **Developer Scope (`userId: userEntityRef`, `metadata.tenantId`):** Private user preferences (e.g., preferred IaC format, diff verbosity).
     - **Service / Catalog Scope (`metadata.tenantId`, `metadata.entityRef`):** Shared operational facts bound to a specific Backstage Catalog entity (e.g., `component:default/payments-api`), gated by Backstage `PermissionsService` (`catalog.entity.read`) before retrieval.
     - **Workflow Run Scope (`runId: temporalWorkflowId`, `metadata.tenantId`):** Ephemeral scratchpad memories purged automatically via TTL / cleanup activity when the Temporal workflow completes.
3. **Write-Gate & Memory Poisoning Prevention:**
   - Never write raw external payloads (GitHub issues, PR bodies, READMEs, CI logs) directly into Mem0.
   - Enforce a strict **Zod** extraction schema tagging every memory with `sourceType`, `confidence`, and `verifiedBy` (`user` | `system` | `agent_inferred`).
   - **Taint-Aware Write Block:** When a workflow run is flagged `tainted = true` from untrusted external input, automatic writes to persistent `userId` and `entityRef` Mem0 scopes are blocked unless explicitly approved by a human reviewer.
4. **Retrieval Budgeting, Similarity Floor & Temporal Decay:**
   - Cap startup retrieval to a strict token/item budget (e.g., top `5` memories with cosine similarity `>= 0.75`) and apply an exponential time-decay reranker on `updatedAt` alongside MMR deduplication so outdated infrastructure quirks do not override current operational state.

### Catalog-Driven Memory Invalidation, Source Authority & Temporal Decay
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 19: Stale and Conflicting Facts) -->

Because engineering infrastructure changes rapidly, Mem0 is governed by strict source-of-truth boundaries, provenance authority rules, and time-decay scoring:

1. **Software Catalog as Authoritative Source of Truth:**
   - Mem0 stores **tacit knowledge, post-mortem lessons, and user preferences**—never structured metadata already owned by the Backstage Software Catalog (`spec.owner`, `spec.lifecycle`, repository URLs, entity annotations).
   - **Event-Driven Invalidation:** Subscribe to `@backstage/plugin-events-node` for `catalog.entity.updated` and `catalog.entity.deleted`. When an entity transitions to `lifecycle: deprecated` or transfers `spec.owner`, dispatch a Temporal Activity to mark `entityRef`-scoped memories as `status: 'archived'`.
2. **Provenance Metadata & Authority Hierarchy:**
   - Every Mem0 write attaches structured metadata: `tenantId`, `entityRef` (optional), `sourceType` (`'user_explicit' | 'post_mortem' | 'agent_inferred'`), `verifiedAt`, `ttlDays`, and `status` (`'active' | 'archived'`).
   - **Conflict Resolution Precedence:** Explicit user statements (`user_explicit`) strictly override `post_mortem` and `agent_inferred` records regardless of vector distance.
3. **Exponential Temporal Decay, MMR & Freshness Attribution:**
   - Wrap `mem0.search()` in a retrieval reranker that filters `status === 'active'`, multiplies cosine similarity by an exponential decay weight (`exp(-lambda * ageInDays)`), applies MMR deduplication, and formats each injected memory with its relative age (e.g., `[Verified 3 days ago] Service X requires VPN flag on staging`) so the model weighs recency explicitly.
4. **Soft-Archive vs. Compliance Hard Deletion:**
   - Automated consolidation soft-archives superseded operational notes (`status: 'archived'`) for audit traceability, whereas explicit user **Forget** requests or retention-policy expirations execute hard deletion (`mem0.delete()`) plus an immutable `AuditLogSink` event.

### Hybrid Lexical-Semantic Retrieval, Graph Metadata Filtering & Cross-Encoder Reranking
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 20: Retrieval Noise) -->

Pure dense-vector similarity degrades on exact engineering identifiers (`auth-service-v1` vs. `v2`, `CrashLoopBackOff`, Jira keys, Terraform IDs). Retrieval combines structural graph filtering, lexical keyword matching, and reranking:

1. **Deterministic Catalog-Graph Metadata Pre-Filtering:**
   - Unfiltered global `mem0.search()` calls are prohibited. Every query must filter by `tenantId`, `status === 'active'`, and explicit scope keys:
     - Caller `userId` (`userEntityRef`) for personal preferences.
     - Target `metadata.entityRef` plus its RBAC-authorized 1-hop Backstage Software Catalog neighbors (`dependsOn`, `partOf` edges verified via `PermissionsService`) for service context.
2. **Hybrid Dense + Lexical (BM25 / `tsvector`) Search:**
   - Pair dense embeddings with native keyword scoring (Qdrant hybrid dense+sparse BM25 or PostgreSQL `tsvector` full-text search) so exact service slugs, error codes, and annotation keys receive lexical boosts alongside semantic similarity.
3. **Cross-Encoder Reranking & Hard Relevance Floor:**
   - Fetch an initial candidate pool (`topK: 15`), score candidates with a VPC/compliance-approved cross-encoder reranker against the current query, discard candidates below `score < 0.72`, apply MMR deduplication, and inject **at most 3–5 memories**.
4. **Authoritative TechDocs/Skills vs. Probabilistic Mem0 Separation:**
   - Store human-authored architecture runbooks and SOPs in Backstage TechDocs / GitOps Skill Bundles (retrieved deterministically via skill activation or two-step `search_techdocs` -> `read_techdocs_slice` snipping), reserving Mem0 strictly for learned preferences and experiential post-mortem facts.

### Learning Recurring User Defaults from Clarification Replies
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 24: Ambiguity and Over-Eagerness) -->

- **Explicit Preference Capture:** When an authenticated user answers a clarification prompt with a standing preference (e.g., *"Always default my troubleshooting queries to `staging` unless I specify `prod`"*), the post-turn memory extraction activity persists that rule to `userId`-scoped Mem0 with `sourceType: 'user_explicit'` and `verifiedBy: 'user'`—strictly gated to direct human replies from `actorUserRef`.

### Shared-Channel Mem0 Privacy Isolation (`visibilityScope === 'SHARED_CHANNEL'`)
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 29: Multi-Party and Group Chat Etiquette) -->

To prevent private developer preferences or sensitive 1:1 notes from leaking into public Slack channels or GitHub PR threads:

- **Programmatic `userId` Retrieval Block:** Whenever `visibilityScope === 'SHARED_CHANNEL'`, the Mem0 retrieval middleware strips `userId` from query filters completely. Queries are restricted strictly to `tenantId` paired with shared `metadata.entityRef` or `metadata.channelId` scopes.
- **No Unreviewed Personal Memory Writes from Group Threads:** `SHARED_CHANNEL` turns never write to `userId`-scoped Mem0 namespaces.

### Vendor-Neutral Storage Portability: Canonical SQL Tables & Rebuildable Vector Indexes
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 33: Vendor-Locked State and Migration Pain) -->

Because horizontally scaled Kubernetes pods cannot rely on local SQLite or Markdown files, the platform achieves open-format portability by separating **canonical SQL/object-storage truth** from **disposable, rebuildable vector indexes**:

1. **Canonical Memory Table (`agent_memories_canonical`) + Rebuildable Vector Index:**
   - Persist every distilled memory's canonical plain-text fact, scope keys (`tenantId`, `userId`, `entityRef`, `runId`), provenance metadata (`sourceType`, `verifiedAt`, `status`), and embedding model version in a standard PostgreSQL table (`agent_memories_canonical`) *before* indexing into self-hosted `mem0ai/oss` (`pgvector` or Qdrant).
   - Treat vector embeddings as a **derived, disposable search index**—enabling zero-loss embedding model upgrades or vector store migrations via background re-indexing from PostgreSQL.
2. **Vendor-Neutral `SessionStore` & `AuditLogSink` Schemas:**
   - Persist conversation turns and ReAct step events in append-only PostgreSQL JSONB tables conforming to open, provider-agnostic message schemas (`id`, `parentId`, `role`, `content`, `toolCalls`, `toolResults`) rather than relying solely on Temporal's internal Protobuf history blobs.
3. **Clean Repository Port Abstractions:**
   - Isolate all `mem0ai/oss`, vector DB, and object-storage SDK calls behind strict TypeScript interfaces (`MemoryStore`, `SessionStore`, `CheckpointStore`, `RunStore`, `ArtifactSink`, `AuditLogSink`) so storage backends can be swapped in a single adapter package without touching workflows or reasoning logic.
4. **Object-Storage Tiering (`.jsonl.gz` / `.md`):**
   - Offload oversized tool outputs, browser ARIA snapshots, and archived compliance transcripts as standard gzipped JSONL (`.jsonl.gz`) or Markdown (`.md`) blobs in KMS-encrypted S3/GCS (`tenants/<tenantId>/runs/<runId>/...`), storing only content-addressed URI references and SHA-256 checksums in PostgreSQL.

### Store-Level TTL Enforcement & Rolling Memory Expiration (`expiresAt`)
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 34: Data Retention and Sensitive Content Scrubbing) -->

- **Rolling 180-Day `expiresAt` Metadata on Mem0 Records:** Every record in `agent_memories_canonical` and `mem0ai/oss` carries an explicit `expiresAt` timestamp (`now + 180d` default). Only memories actively retrieved and utilized in a successful run have their `expiresAt` window extended; unused memories expire and are purged automatically.
- **90-Day `SessionStore` Transcript Pruning:** Conversational message rows in `SessionStore` older than `90 days` are purged by the nightly retention sweeper, retaining only non-sensitive run header metadata (`runId`, `actorUserRef`, `workflowId`, `status`, timestamps) linked to `AuditLogSink`.
- **24-Hour `ArtifactSink` Lifecycle Expiration:** Temporary tool-output blobs, ARIA snapshots, and diff artifacts in S3/GCS expire automatically after `24 hours` via bucket lifecycle policies unless explicitly pinned to a compliance hold.

### Serialized Per-Scope Memory Mutations (Preventing Deduplication Races)
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 37: Split-Brain State Across Devices) -->

- **Single-Writer Scope Serialization:** Concurrent workflows operating on behalf of the same user or Backstage Catalog entity must never execute `mem0.add()` / `mem0.update()` in parallel against the same `(tenantId, scopeKey)`. All memory mutations enqueue through a per-scope serialized writer so Mem0's fact-fusion state machine processes updates strictly in order.

### PostgreSQL Time-Partitioning & Redis Memory Bounds
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 39: Runaway Processes and Resource Leaks) -->

- **Monthly Time-Range Partitioning (`SessionStore` & `AuditLogSink`):** Partition high-volume event tables (`agent_session_events`, `agent_audit_log`) by month in PostgreSQL so retention sweepers drop expired conversational partitions instantaneously via `DROP TABLE` without dead-tuple table bloat or autovacuum stalls.
- **Mandatory Redis Key TTLs & `volatile-lru`:** Configure Redis with `maxmemory-policy volatile-lru` and require every transient key (SSE streams, resource leases, idempotency records, alert fingerprints, rate-limit counters) to declare an explicit `EXPIRE` TTL on creation.

### Quarantine Bucket `24h` Lifecycle Auto-Purge
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 44: Malicious File & Media Payloads) -->

- **Ephemeral Quarantine Prefix Expiration:** Configure S3/GCS lifecycle rules to permanently purge all raw uploads and intermediate parsed files under `tenants/*/quarantine/*` after `24 hours`.

### Drill-Verified Vector Index Rebuildability
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 48: Backup Verification and Restore Drills) -->

- **Monthly Index Reconstruction Proof:** During automated monthly DR drills, the derived Mem0 vector index (`pgvector` collection / Qdrant collection) is intentionally dropped and rebuilt deterministically from `agent_memories_canonical` via `rebuildVectorIndexFromCanonicalSql`—verifying zero semantic-search data loss across embedding or vector-engine migrations.

### Three-Stage Organizational Knowledge Promotion Pipeline
<!-- Source: incoming/WRITING_AN_AGENT.md (Section 52: Organizational Memory vs. Personal Memory Governance (Who Owns Learned Knowledge?)) -->

To prevent operational discoveries from remaining trapped in one engineer's private memory while stopping unverified guesses from polluting team-wide context, learned knowledge flows through a gated three-stage promotion pipeline:

1. **Stage 1 — Personal Developer Memory (`tenantId` + `userId`):**
   - Auto-captures individual workflow preferences, formatting choices, and personal defaults (`sourceType: 'user_explicit' | 'agent_inferred'`). Strictly isolated to that user's private sessions.
2. **Stage 2 — Team / Catalog Entity Memory (`tenantId` + `metadata.entityRef`):**
   - Shared service operational truths (e.g., *"Service X's Redis cluster fails over slowly if `maxclients` exceeds 5,000"*) cannot auto-promote from casual chat. Promotion to `entityRef` scope requires either:
     - **Explicit Authorized Confirmation:** An engineer verified via `PermissionsService` / `spec.owner` membership confirms *"Save this runbook note for ``?"*, or
     - **Verified Post-Mortem Workflow:** Emitted by a completed, untainted post-mortem Temporal workflow bound to that `entityRef`.
3. **Stage 3 — Canonical TechDocs / `SKILL.md` GitOps PR:**
   - High-value, repeatedly retrieved `entityRef` memories (passing DLP secret/PII scrubbing) are periodically proposed via a Git Pull Request into the service's permanent, version-controlled TechDocs or `SKILL.md` runbook, stamping promoted Mem0 records with `promotedPrUrl` to prevent duplicate proposals.

### Directed-Tree Session Persistence & Anti-Escalation Memory Scoping
<!-- Source: incoming/PI_AGENT.md (Sections: Agent Loop Step 6 Persist, Pi Agent Mem0 Memory Scopes) -->

- **Append-Only Directed-Tree `SessionStore` (`id` + `parentId`):** Model persisted transcript entries in PostgreSQL `SessionStore` as an immutable directed tree (`entryId`, `parentEntryId`, `branchId`, `entryType: 'message' | 'tool_call' | 'tool_result' | 'compaction_summary'`). Compaction appends a summary node linked via `parentEntryId` without mutating or deleting historical entries, supporting deterministic rewind, auditability, and conversation branching.
- **Anti-Escalation Scope Enforcement on `mem0_memory` Tools:** Reject empty or wildcard `tenantId`, `userId`, `entityRef`, or `sessionId` parameters (`InvalidMemoryScopeError`). A model-supplied tool parameter (`scope: 'global'`) can never widen access across projects or tenants unless the active session's RBAC policy explicitly authorizes global user-scope recall.

### Hybrid Catalog Graph Weaver, Asynchronous AST Indexing & Run-Scoped Workspace Store
<!-- Source: incoming/OVERALL_BLUEPRINT.md (Sections: Replicating Local Code Hierarchy, The Context & Graph Synchronizer, State & Artifact Store) -->

- **Hybrid Catalog Graph + Vector Context Assembly:** Combine structural Backstage Software Catalog dependency/ownership traversal (`get_entity_neighborhood`) with semantic vector recall so agents resolve both architectural blast radius (`Service A -> Library B -> Team C`) and historical operational context.
- **Asynchronous Tree-Sitter AST & TechDocs Indexing:** Offload repository AST parsing and TechDocs chunking to background Temporal indexing workers triggered by Catalog registration or Git webhook updates, storing code embeddings in dedicated `pgvector`/Qdrant collections isolated from Mem0 conversational/episodic memory.
- **Run-Scoped Ephemeral Workspace (`ArtifactSink`):** Map temporary repository checkouts, lint reports, diff patches, and build logs strictly to `${tenantId}/${runId}` inside KMS-encrypted `ArtifactSink` object storage rather than stuffing large technical payloads into conversational `SessionStore` history.

### Five-Type Memory Architecture, Pre-Ranking Scope Predicates & Promotion Gates
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md (Sections: Why retrieval is not memory, How to evolve RAG into a memory system, What kinds of memory do AI systems need) -->

To prevent "context stuffing" and single-index pollution (where deterministic compliance policies compete with passing chat remarks in one vector table), the **Memory Manager** separates static RAG corpora from **five typed memory stores**:

1. **Five Typed Memory Stores & Retrieval Contracts:**
   - **Policy Memory (Exact Lookup Only):** Versioned, tenant/entity-scoped procedural rules, compliance guardrails, and approval thresholds. Retrieved **strictly by exact structured lookup** (never vector similarity) and editable only via admin/GitOps—never via LLM auto-capture.
   - **Preference Memory (Exact Structured Lookup):** Durable user and team formatting/workflow preferences keyed by `(tenantId, userId)`, with explicit user edit/forget controls.
   - **Fact Memory (Hybrid Entity + Semantic Recall):** Distilled technical facts attached to Backstage `catalogEntityRef` entities.
   - **Episodic Memory (Semantic + Recency Recall):** Distilled summaries of completed Temporal workflow runs (incident root causes, PR outcomes) linked by `sourceRunId`.
   - **Trace Memory (Audit & Replay Only):** Immutable execution records in `RunStore` / `AuditLogSink` / OTel—used for compliance audit and replay, never injected raw into prompts.
2. **Mandatory Pre-Ranking Scope Predicates:**
   - Every memory query enforces `(tenantId, userId, agentId)` and RBAC-authorized `catalogEntityRef` filters as **hard pre-ranking SQL/vector predicates**—never post-filtering top-$k$ results in memory.
3. **Memory Promotion Gate & Taint Quarantine:**
   - Observations and auto-extracted facts pass through a **Memory Promotion Gate** before durable persistence: (a) synchronous DLP secret/PII redaction, (b) provenance tagging (`sourceRunId`, `createdAt`, `retentionTtl`), and (c) **blocking auto-promotion from `tainted === true` runs** unless explicitly confirmed by the user so untrusted external prompt injections cannot poison persistent memory.

### Typed Memory Schemas, SHA-256 Deduplication & Lifecycle Governance
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md (Sections: Policy memory, Preference memory, Fact memory, Episodic memory) -->

Each typed memory store enforces explicit relational columns, lifecycle states, and co-located `pgvector` embeddings in PostgreSQL:

1. **`policy_memory` (Versioned Exact-Match Governance):**
   - Columns: `policy_id`, `tenant_id`, `policy_type` (`compliance` | `guardrail` | `approval`), `policy_key`, `policy_value` (JSONB), `version`, `effective_from`, `effective_until`, `created_by`.
   - Queried strictly by exact `(tenant_id, policy_key)` and active time window (`effective_from <= now < effective_until`)—zero vector similarity.
2. **`preference_memory` (Keyed User/Tenant Personalization):**
   - Columns: `tenant_id`, `user_id`, `pref_key`, `pref_value` (JSONB), `source` (`user_stated` | `inferred` | `admin_set`), `confidence`, `updated_at`.
   - Resolved via a single keyed lookup at run initialization and placed in the session-stable prompt header to preserve provider prompt-cache hits across turns.
3. **`fact_memory` (Provenance-Tracked Entity & Domain Assertions):**
   - Columns: `fact_id`, `tenant_id`, `user_id` (nullable for tenant-wide facts), `agent_id` (nullable for shared facts), `subject` (`catalogEntityRef`), `predicate`, `content`, `content_hash` (scoped SHA-256 deduplication key), `embedding` (nullable/rebuildable `vector`), `status` (`provisional` | `active` | `revoked`), `source_run_id`, `source_turn_id`, `confidence`, `superseded_by`, `expires_at`, `created_at`.
   - Supports hybrid lexical (`subject` / `predicate` exact filter) + semantic vector ranking on `status = 'active'` rows, non-destructive replacement via `superseded_by`, and `provisional` staging for unconfirmed extractions.
4. **`episodic_memory` (Distilled Workflow Run Outcomes):**
   - Columns: `episode_id`, `tenant_id`, `user_id`, `task_type`, `title`, `summary`, `outcome` (`resolved` | `escalated` | `failed`), `key_steps` (JSONB), `artifacts` (JSONB refs), `embedding` (nullable/rebuildable `vector`), `status`, `source_run_id`, `completed_at`.

### `trace_memory` Flight Recorder, STM/LTM Boundary & Database-Over-Filesystem Rule
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md (Sections: Trace memory, Short-term vs Long-term memory, Filesystem vs database memory) -->

1. **`trace_memory` Flight Recorder Schema:**
   - Append-only execution log recording `trace_id`, `run_id`, `tenant_id`, `user_id`, `turn_index`, `event_type` (`user_msg` | `tool_call` | `tool_result` | `model_msg`), DLP-scrubbed `payload`, `token_cost`, `latency_ms`, and `created_at` (indexed by `(run_id, turn_index)` and `(tenant_id, created_at)`).
   - Used strictly for deterministic post-mortem replay, forensics, and asynchronous distillation into `fact_memory` / `episodic_memory`—**never** queried via vector similarity during live turns to infer user preferences or rules.
2. **Short-Term Working Set vs. Long-Term Durable Memory:**
   - Keep transient turn scratchpads and raw intermediate tool outputs in ephemeral run-scoped storage discarded at run completion so scratchpad exhaust never pollutes long-term memory.
   - Persist all durable memory (`policy`, `preference`, `fact`, `episodic`, `trace`) in transactional **PostgreSQL + `pgvector`** rather than local Markdown files—guaranteeing row-level tenant isolation, atomic supersession transactions, single-query hybrid lexical + vector filtering, and cascading right-to-forget deletions.

### Dedicated Typed Table Partitioning, Single-Plan Hybrid Search & Summary-Only Indexing
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md (Sections: Single table vs multiple typed tables, Exact retrieval vs semantic retrieval, Transcripts vs summaries, Storage tradeoff at a glance) -->

1. **Five Dedicated PostgreSQL Tables (Zero Single-Table Bloat):**
   - Separate `policy_memory`, `preference_memory`, `fact_memory`, `episodic_memory`, and monthly-partitioned `trace_memory` into dedicated PostgreSQL tables rather than a single discriminated `memory_type` table:
     - High-volume append-only `trace_memory` writes never bloat HNSW vector index working sets or autovacuum cycles on durable memory.
     - `policy_memory` and `preference_memory` use pure relational B-tree indexes (zero wasted vector indexes), while `pgvector` HNSW partial indexes (`WHERE status = 'active'`) live exclusively on `fact_memory` and `episodic_memory`.
2. **Single-Query Hybrid Retrieval (`tsvector` Lexical + `pgvector` Semantic + Rerank):**
   - Execute exact keyword/entity matching (`tsvector`) and semantic similarity (`pgvector`) within a single PostgreSQL query plan governed by unified pre-ranking `(tenant_id, user_id, agent_id)` and RBAC `catalogEntityRef` predicates, fusing scores via Reciprocal Rank Fusion (RRF) and reranking before prompt injection.
3. **Summary-Only Semantic Indexing (Ban Raw Transcript Embeddings):**
   - Never embed raw conversational transcripts (`SessionStore` / `trace_memory`) into semantic memory; raw transcripts remain source material for replay and audit, while only distilled, DLP-scrubbed facts and structured run summaries enter `fact_memory` and `episodic_memory`.

### Memory Manager Architecture & Write-Path Governance
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md -->

The **Memory Manager** acts as the central orchestration layer over raw vector/relational storage, controlling write-time promotion, transactional invalidation, post-stabilization summarization, and per-type retrieval.

#### 1. Transactional Promotion Gate (Write Path)
All writes to durable memory pass through a single atomic transaction inside the Memory Manager:
1. **Classify & Scope:** Determine memory type (`Policy`, `Preference`, `Fact`, `Episodic`, `Trace`) and resolve the scope tuple `(tenant_id, user_id, agent_id, session_id)`. Default to the narrowest scope (typically `user`); only promote to `tenant` scope when the subject is the tenant entity itself and has been observed across at least two independent sources.
2. **Composite Deduplication:** Deduplicate using `(content_hash + scope_tuple)`. Matching both collapses duplicate writes within the same boundary while keeping identical facts isolated across different tenant/user boundaries.
3. **Type-Specific Verification & Supersession:** Require confidence thresholds and a `source_run_id` for `Fact` candidates. Contradicting facts route to the supersession path rather than creating competing active rows.
4. **Internal Status Computation (Anti-Pattern Guardrail):** Never allow callers to supply a `status` parameter on save calls. Compute status strictly inside the manager:
   * `active`: Agent-scoped memories, user preferences, and verified episodes.
   * `provisional`: Tenant-scoped facts and policies (persisted with provenance, but excluded from semantic discovery until confirmed/activated).
5. **Promotion Path Contract:** Every promotion path must explicitly define: (1) promoted payload, (2) granularity, (3) target memory type, (4) attached provenance (`source_run_id`, authority), (5) decay/TTL rule, and (6) sign-off authority.

#### 2. Atomic Supersession & Projection Invalidation (Update Path)
To prevent split-brain retrieval where both stale and updated facts appear simultaneously, updates execute in a single database transaction:
1. Insert the new record and obtain its `new_id`.
2. Mark the prior record as `superseded` with a pointer to `new_id` (and set `effective_until`).
3. Invalidate cached retrieval entries referencing the superseded ID.
4. Emit a `fact.superseded` domain event (outbox) so downstream search indexes and derived projections update asynchronously.

#### 3. Post-Stabilization Summarization (Trace Compression)
Never summarize raw transcripts directly. Execute a two-stage pipeline:
1. **Stabilize Trace:** Pull the full run trace, resolve pronouns, normalize entity references, and strip retracted statements.
2. **Extract & Gate:** Run two extractors over stabilized events—one for candidate facts (`subject`, `predicate`, `content`, `confidence`) and one for a task-level episode summary (only if a coherent task completed). Route all candidates back through the Promotion Gate (expecting high rejection rates).

#### 4. Per-Type Retrieval Fan-Out Strategy
Instead of a single top-$k$ vector query, execute parallel type-specific retrieval strategies (or a unified co-located query with type-specific predicates):

| Memory Type    | Retrieval Strategy                                           |
| :------------- | :----------------------------------------------------------- |
| **Policy**     | Exact SQL match: `WHERE tenant_id = ? AND policy_key = ? AND effective_until IS NULL` |
| **Preference** | Exact SQL match: `WHERE user_id = ? AND tenant_id = ?` (full set loaded every turn) |
| **Fact**       | Hybrid search (lexical + vector, score-fused) with hard pre-ranking `(tenant_id, user_id)` scope filters and `status = 'active'` |
| **Episodic**   | Hybrid search (lexical + vector) over episode summaries, with optional `task_type` filter |
| **Trace**      | Direct replay by `run_id`; reserve vector search strictly for forensic/audit queries |

### Memory Privacy Primitives, Atomic Erasure & Retention Sweepers
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md -->

Privacy and data lifecycle controls must be enforced inside the Memory Manager prior to any durable persistence, treating memory records as governed, derived artifacts rather than unbounded logs.

#### 1. Structural Scope vs. Relevance Metadata
* **Hard Access Boundaries:** Every durable memory record carries structural scope columns (`tenant_id`, `user_id`, `agent_id`). All retrieval paths must apply scope as hard SQL `WHERE` predicates *prior* to vector/lexical ranking—never as post-ranking filters.
* **Metadata Isolation Rule:** Do not overload the scope model with relevance signals (e.g., `repo_id` or `project_id`). Contextual narrowing belongs in metadata or tag columns, keeping scope strictly reserved for tenant/identity access control.

#### 2. Mandatory Record Provenance
Every durable promotion write must attach full lineage metadata so decisions can be audited and erasure requests can trace derived artifacts back to their origin:
* `source_run_id` and `source_turn_id`
* `promoting_policy_version`
* `created_at` / promotion timestamp

#### 3. Transactional Tombstones & Cascading Erasure (GDPR Right-to-Forget)
Co-locating canonical memory records and vector embeddings in PostgreSQL/pgvector allows right-to-forget erasure to execute atomically within a single database transaction, eliminating windows where vector indexes surface deleted facts:

```sql
-- Atomic GDPR erasure across canonical records, embeddings, and audit trail
BEGIN;

UPDATE fact_memory
   SET content = '[erased]',
       content_hash = 'erased',
       embedding = NULL,
       status = 'revoked'
 WHERE user_id = :user_id
   AND tenant_id = :tenant_id;

UPDATE episodic_memory
   SET summary = '[erased]',
       embedding = NULL,
       status = 'revoked'
 WHERE user_id = :user_id
   AND tenant_id = :tenant_id;

DELETE FROM preference_memory
 WHERE user_id = :user_id
   AND tenant_id = :tenant_id;

DELETE FROM trace_memory
 WHERE user_id = :user_id
   AND tenant_id = :tenant_id;

INSERT INTO deletion_events (user_id, tenant_id, scope, deleted_at, reason)
VALUES (:user_id, :tenant_id, 'all', CURRENT_TIMESTAMP, 'gdpr_erasure');

COMMIT;
```

#### 4. Record-Level Retention & Scheduled Sweeper Jobs
* **Anti-Pattern Guardrail ("Memory That Never Forgets"):** Unbounded memory stores degrade retrieval precision and accumulate compliance liability over time.
* **Record-Bound Metadata:** Every record stores `expires_at`, `retention_policy_id`, `retention_class`, and `sensitivity_classification` alongside the payload, enforced automatically by the Memory Manager on both read and write paths.
* **Nightly Retention Sweeper:** Automated background cleanup purges expired records across all tiers:

```sql
DELETE FROM fact_memory     WHERE expires_at < CURRENT_TIMESTAMP;
DELETE FROM episodic_memory WHERE expires_at < CURRENT_TIMESTAMP;
DELETE FROM trace_memory
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
      AND retention_class = 'short';
```

### Document-to-Memory Distillation Lifecycle (Ingest Once, Distill, Reuse)
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md (Sections: From file retrieval to reusable memory) -->

Raw ingested documents (meeting notes, customer reports, design docs) are indexed for baseline RAG, but serve primarily as raw material for asynchronous background distillation into structured, reusable memory tiers:

* **Preference Extraction (`Preference Memory`):** Stable behavioral and formatting rules (e.g., *"user always wants exec summaries first"*) are extracted and persisted across sessions to feed every turn's reserved prompt slot.
* **Entity-Bound Assertion Extraction (`Fact Memory`):** Durable domain assertions (e.g., *"Acme runs production in us-east-1"*) are extracted, bound to their target entities with provenance links back to the source notes, and exposed within the appropriate scope boundary.
* **Task Pattern Distillation (`Episodic Memory`):** Completed workflows and resolutions (e.g., *"migrated Acme's webhook to v2"*) are distilled into reusable execution templates so future runs reuse proven patterns rather than re-deriving them.
* **Unified Multi-Consumer Layer:** A single governed memory store serves interactive Backstage chat sessions, autonomous Temporal agent workflows, and direct human search without duplicating storage engines, lowering per-turn context overhead while preserving cross-session continuity.

### Converged Storage Substrate: Co-Located Relational Governance & Vector Retrieval
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md (Sections: Where the memory layer actually lives) -->

To avoid the **polyglot persistence trap**—where splitting relational governance data (Postgres) from vector indexes (dedicated vector DBs) forces cross-system joins across trust, transactional, and latency boundaries—canonical operational memory and its retrieval embeddings are co-located in a single transactional database engine (**PostgreSQL + `pgvector`**, fronted by Mem0).

#### 1. Core Co-Location Principles
* **Canonical Truth vs. Derived Index:** Relational tables with foreign keys, check constraints, and Row-Level Security (RLS) hold canonical truth. Vector indexes (`pgvector` HNSW/IVFFlat) act strictly as derived retrieval accelerators, never as the system of record.
* **Single-Boundary ACID Transactions:** Superseding an active fact, invalidating cached projections, and writing a deletion/audit tombstone occur inside one ACID transaction—eliminating consistency windows where stale and new facts are simultaneously visible.
* **Single-Query Policy, Preference & Similarity Evaluation:** Policy thresholds, user personalization opt-ins, tenant/user scope predicates, TTL expiration checks, and cosine similarity ranking execute in a single SQL query plan under one security model:

```sql
-- Reconciled PostgreSQL + pgvector equivalent of single-plan governed retrieval
SELECT  f.fact_id, f.content, f.source_run_id, f.created_at
FROM    fact_memory f
JOIN    preference_memory p
   ON   p.user_id = :current_user
  AND   p.tenant_id = f.tenant_id
JOIN    policy_memory t
   ON   t.tenant_id = f.tenant_id
  AND   t.policy_key = 'fact_retrieval'
  AND   t.effective_until IS NULL
WHERE   f.tenant_id = :current_tenant
  AND   f.status = 'active'
  AND   f.superseded_by IS NULL
  AND   (f.expires_at IS NULL OR f.expires_at > CURRENT_TIMESTAMP)
  AND   (p.pref_value->>'allow_personalization')::boolean = true
  AND   f.confidence >= (t.policy_value->>'min_confidence')::numeric
ORDER BY f.embedding <=> :query_embedding
LIMIT 5;
```

#### 2. Tiered Storage Boundaries (Hot Operational vs. Cold Bulk)
Co-locating relational governance with vector search eliminates the expensive join between *what the agent is allowed to do* and *what the agent recalls*, while still routing bulk payloads to specialized storage tiers:
* **Operational Database (PostgreSQL + `pgvector`):** `Policy`, `Preference`, `Fact`, and `Episodic` memories, plus active session/checkpoint metadata.
* **Cold / Bulk Tier (`RunStore` / `ArtifactSink` / Object Storage):** High-volume raw `Trace` logs (governed by strict TTL/retention classes) and large binary attachments, documents, or tool outputs.

### Memory System Schema Invariants & Promotion Gate Thresholds
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md (Sections: How do you add memory to an AI agent) -->

Evolving from passive RAG to governed agent memory requires strict sequential invariants across schema design, storage separation, and write-time promotion rules:

#### 1. Mandatory Scope Columns & Indexing (Fail-Closed Multi-Tenancy)
Every durable memory table must carry required structural scope columns (`tenant_id`, `user_id`, `agent_id`) as hard query predicates—never overloaded with relevance filters (`repo_id`, `project_id`), which belong in structured metadata/tag columns.
* **Hardened Standard Reconciliation:** Unlike prototype DDL that sets `DEFAULT 'default'` on `tenant_id`, production schemas must define `tenant_id VARCHAR(64) NOT NULL` with **no default value** so any write or query omitting tenant identity fails closed at the database layer.

```sql
ALTER TABLE fact_memory ADD COLUMN tenant_id VARCHAR(64) NOT NULL;
ALTER TABLE fact_memory ADD COLUMN user_id   VARCHAR(64);
ALTER TABLE fact_memory ADD COLUMN agent_id  VARCHAR(64);
CREATE INDEX idx_fact_scope ON fact_memory (tenant_id, user_id, agent_id);
```

#### 2. Truth vs. Vector Acceleration Separation
* **Anti-Pattern Guardrail ("Vector Store as System of Record"):** Authoritative state lives in structured relational columns (`content`, `provenance`, `status`, `expires_at`). The `embedding` column is strictly a derived projection; dropping and rebuilding the embedding column/index when upgrading embedding models must incur zero loss of canonical truth, provenance, or GDPR deletion guarantees.

#### 3. Type-Specific Promotion Gate Rules & Baseline Thresholds
Every candidate write must pass through the transactional Promotion Gate before persisting:
* **Policy:** **Never auto-promotes.** Requires explicit administrative authoring and policy sign-off.
* **Preference:** Accepts candidates with a confidence floor of `>= 0.5` and a non-empty `pref_key` (tightened in production via explicit user confirmation or repeated multi-turn observation).
* **Fact:** Requires a valid `source_run_id` for provenance and a confidence score `>= 0.7`. Contradicting facts route to atomic supersession.
* **Episodic:** Promotes strictly upon verified task completion over stabilized run traces.
* **Status Computation:** Computed internally from `(scope, type)`—never caller-supplied.
* **Anti-Pattern Guardrail ("Promotion on User Thumbs-Up"):** Explicit positive feedback is sparse and biased toward surface appeal rather than correctness. Treat user feedback as one weighted signal alongside confidence floors, repeated observation, and source provenance.

### Architectural Boundary: Stateless RAG vs. Governed Stateful Memory
<!-- Source: incoming/MEMORY_CHECKPOINTS_AND_RETRIEVAL_AUGMENTATION.md (Sections: A final note on what counts as memory) -->

Basic semantic document lookup belongs to standard RAG; a dedicated **Memory Layer** is warranted only when the platform must satisfy four stateful requirements:

1. **Cross-Session Continuity:** Maintaining coherent state across independent workflow runs and user sessions rather than stateless API turns.
2. **Structured Recall Accuracy:** Separating deterministic policies and user preferences from probabilistic semantic facts and episodic patterns.
3. **Privacy-Bounded Reuse:** Enforcing hard tenant/user scope isolation, provenance lineage, and atomic right-to-forget erasure over derived knowledge.
4. **Curated Retention & Learning:** Governing what is promoted, superseded, and decayed over time so the memory substrate remains model-agnostic and proprietary to the enterprise domain.

### Mem0 Integration Architecture & Taxonomy Mapping
<!-- Source: incoming/MEM0.md (Sections: Mem0, Memory Categories, What Mem0 Does with its Configured LLM) -->

**Mem0** (`mem0ai`) serves as the automated background extraction and semantic indexing adapter over **PostgreSQL + `pgvector`** (managing `HNSW` / `IVFFlat` vector indexes), translating raw conversational turns into candidate atomic facts, preferences, and entity-enriched summaries.

#### 1. Mapping Platform Memory Taxonomy to Mem0 Scopes & Metadata
Mem0's native hierarchy (`user_id`, `agent_id`, `run_id`) and metadata tags map onto our five-tier memory architecture as follows:

| Platform Memory Tier    | Mem0 Scope & Metadata Mapping                                | Governance & Storage Rule                                    |
| :---------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| **Policy / Guidelines** | Global `agent_id` / `app_id` + `metadata: { tenant_id, category: "policy" }` | **Never auto-extracted by Mem0.** Authored explicitly by admins; retrieved via deterministic SQL lookup. |
| **Preference**          | `user_id` + `metadata: { tenant_id, category: "preference" }` | Extracted automatically by Mem0, tagged `preference`, and validated through the Promotion Gate. |
| **Fact**                | `user_id` (or `tenant_id` upon multi-source promotion) + `metadata: { tenant_id, category: "fact" }` | Extracted as atomic, entity-linked assertions; contradictions route to atomic supersession. |
| **Episodic**            | `run_id` / `session_id` (mapped to **Temporal Workflow ID**) + `metadata: { tenant_id, category: "episodic" }` | Distilled summaries of completed workflow executions for cross-run pattern reuse. |
| **Trace / Message**     | **Excluded from Mem0 semantic store**                        | Logged directly to `Trace` / `SessionStore` tables (`PostgreSQL JSONB`) and Vercel AI SDK telemetry handlers to prevent vector index noise. |

#### 2. Mem0 Internal Extraction Pipeline & Hardened Constraints
When `memory.add(...)` runs asynchronously after a stabilized turn, Mem0's internal extraction LLM executes three steps:
1. **Atomic Fact Extraction:** Strips conversational filler into standalone assertions (e.g., *"User prefers Vim keybindings"*).
2. **Semantic Conflict & Deduplication Check:** Cross-references candidates against existing records to flag duplicates or contradictions. *(Note: Mem0's April 2026 engine defaults to single-pass `ADD`-only extraction to lower token overhead; our Memory Manager's Promotion Gate remains responsible for deterministic composite deduplication and transactional supersession.)*
3. **Entity Linking & Metadata Enrichment:** Extracts key entities to enrich metadata tags for hybrid vector + lexical lookups.

#### 3. Hardened Adapter Configuration
* **No Hardcoded Credentials:** Never embed PostgreSQL connection strings or provider API keys in source code; inject via Backstage `RootConfigService` / Secret Manager.
* **Mandatory Tenant Predicate:** Every `memory.add()` and `memory.search()` call must pass `tenant_id` in scope/filter metadata so `pgvector` queries enforce tenant isolation prior to ranking.

### Mem0 Compiler Boundaries, Safety Gating & Categorical Configuration
<!-- Source: incoming/MEM0.md (Sections: Why Mem0 Only Asks for One LLM and One Embedder, Safety Gating: Mem0 vs. Client Code, Architecture for Vercel AI SDK & Temporal) -->

#### 1. Mem0 as a Single-Stack Memory Compiler
The Mem0 container operates strictly as an **automated memory compiler** (isolating atomic facts, generating embeddings, and writing rows/indexes to PostgreSQL + `pgvector`). It is not an agent router or multi-model orchestrator; dynamic model switching (e.g., routing fast models for triage vs. frontier models for deep reasoning) lives exclusively in the platform's `ModelExecutor` layer.

#### 2. Mandatory Client-Side Safety Gating (Ingress & Egress)
Mem0 provides **no built-in guardrails, PII/PHI redaction, or content filtering**—it indexes whatever strings it receives and returns nearest-neighbor matches blindly. To satisfy SOC-2, HIPAA, and FINRA rules, the platform enforces safety screening at both boundaries:
* **Write Ingress Gate:** Screen and redact sensitive payloads (PII, PHI, credentials, restricted financial data) inside the Temporal activity / Memory Manager *before* calling `memory.add()`. Drop or quarantine flagged interactions rather than persisting raw violations.
* **Read Egress Gate:** Validate and filter retrieved memory records through local policy/guardrail checks *before* assembling them into the prompt context for `ModelExecutor`.

#### 3. Reconciled Mem0 `customCategories` & Scope Configuration
* **Exclude `policy` from Auto-Extraction:** Configure Mem0's `customCategories` strictly for auto-distillable types (`["preference", "fact", "episodic"]`). Never include `"policy"` in automated LLM extraction; policies are authored explicitly and queried via deterministic SQL.
* **Mandatory Tenant Isolation:** Every `memory.add()` and `memory.search()` call must pass `tenantId` alongside `userId` / `runId` (mapped to the Temporal Workflow ID) via Backstage-injected configuration—never via raw `process.env` reads.

### User-Initiated Memory CRUD & Governance Reconciliation
<!-- Source: incoming/MEM0.md (Sections: "Manage My Memory" UI Layout) -->

When end users create, edit, or delete memories via the Backstage "Manage My Memory" UI, operations must pass through the **Memory Manager** rather than mutating Mem0 or `pgvector` directly:

* **Direct Seeding (`infer: false`):** User-authored custom memories bypass Mem0's LLM extraction parser (`infer: false`) to preserve exact phrasing, while still undergoing ingress safety screening, composite deduplication `(content_hash + scope_tuple)`, and provenance tagging (`source: 'user_manual'`).
* **Audited Edits (`update`):** Inline text edits re-run ingress safety checks, regenerate the vector embedding, update the canonical row and Mem0 index atomically, and record an audit event (or supersession link) with the user's identity and timestamp.
* **Transactional Deletion (`delete`):** Single-click user deletions execute the platform's transactional tombstone/erasure flow—revoking the canonical row, nullifying its `pgvector` embedding, purging the Mem0 vector entry, invalidating retrieval caches, and recording an immutable entry in `deletion_events`.

### Self-Hosted Mem0 OSS Capability Gaps & Platform-Owned Equivalents
<!-- Source: incoming/MEM0.md (Sections: OSS vs. Platform Versions) -->

Because SOC-2, HIPAA, and FINRA data-residency and BAA requirements prohibit routing sensitive enterprise transcripts to Mem0's multi-tenant SaaS (`app.mem0.ai`), the platform deploys **self-hosted Mem0 OSS** backed by PostgreSQL + `pgvector`. Features exclusive to Mem0 Cloud must be explicitly implemented by our platform control plane and Temporal background workers:

| Mem0 Cloud-Exclusive Feature               | Self-Hosted OSS Gap                                 | Platform-Owned Architectural Replacement                     |
| :----------------------------------------- | :-------------------------------------------------- | :----------------------------------------------------------- |
| **Mem0 Dream (Background Consolidation)**  | Chronological append without periodic consolidation | Scheduled **Temporal Consolidation Workflows** running post-stabilization compression, duplicate collapsing, and supersession reconciliation off the critical chat path. |
| **Memory Decay & TTL**                     | No built-in expiration engine                       | Record-level `expires_at` / `retention_policy_id` columns enforced at read time and purged by nightly **Retention Sweeper** jobs. |
| **Multi-Tenant Hierarchy**                 | Flat metadata filtering only                        | Hard relational `tenant_id`, `user_id`, `agent_id` scope columns + PostgreSQL Row-Level Security (RLS) and per-tenant encryption domains. |
| **Batch Operations & GDPR Data Export**    | Single-item CRUD primitives                         | Transactional SQL batch jobs in the Memory Manager for bulk revocation/erasure (`deletion_events`) and structured JSON/artifact export endpoints. |
| **Project-Wide Audit Logs**                | Node-local version history only                     | Immutable, append-only `AuditLogSink` recording every promotion, read, supersession, and erasure event across the tenant. |
| **Custom Categories & Temporal Reasoning** | Static prompt templates                             | Controlled taxonomy (`preference`, `fact`, `episodic`) enforced in our **Promotion Gate** with explicit `effective_from` / `effective_until` temporal columns. |

### Two-Stage Self-Healing Memory Loop (OSS Mem0 Pattern)
<!-- Source: incoming/MEM0.md (Sections: Implementing Platform Features in Open Source Version) -->

Because self-hosted Mem0 OSS lacks Mem0 Cloud's managed reinforcement pipeline (`client.feedback()`), the platform implements a **two-stage self-healing loop** combining immediate retrieval down-ranking with asynchronous transactional repair:

#### 1. Stage 1: Immediate Metadata Down-Ranking (Synchronous Fast Path)
When a user submits negative feedback on a surfaced memory from the Backstage UI:
1. Verify record ownership against `(tenant_id, user_id)` and append a penalty modifier to the record's metadata (`feedback_score` decremented by `0.5` from baseline `1.0`, plus structured `feedback_reasons`).
2. During hybrid retrieval reranking, multiply raw similarity scores by `clamp(feedback_score, 0.1, 1.0)` (or exclude records below a configured floor) so flagged memories are immediately deprioritized on subsequent turns without waiting for background LLM repair.

#### 2. Stage 2: Asynchronous Transactional Repair (Reconciled Governance Path)
Rather than mutating vector records destructively in place, the background repair workflow evaluates the flagged memory against the originating run trace and user correction reason:
* **Verdict `DELETE` (Hallucinated / False):** Executes the Memory Manager's **atomic tombstone/erasure transaction** (`status = 'revoked'`, `embedding = NULL`, cache invalidation, and `deletion_events` audit record).
* **Verdict `REWRITE` (Entity Confusion / Partial Error):** Passes the corrected assertion through the **Promotion Gate** and executes **atomic supersession**—inserting the repaired record with updated provenance, setting `superseded_by` on the faulty record, and emitting `fact.superseded`.
* **Tenant-Scoped Guardrail:** User-submitted feedback can directly trigger repair only on `user`-scoped memories owned by that caller; negative feedback on `tenant`-scoped facts flags the record (`needs_review`) and queues it for administrative review rather than letting a single user unilaterally overwrite shared tenant knowledge.

### Backstage Search Integration as Enterprise Document RAG Tier
<!-- Source: incoming/FLUENT_GRAPH_BUILDER.md (Sections: ctx.search.query(text, options)) -->

* **Complementary RAG vs. Governed Memory Roles:** `ctx.search.query()` serves as the platform's **read-only static document RAG** interface over Backstage TechDocs and Software Catalog indices, complementing (rather than replacing) our **Mem0 + PostgreSQL/`pgvector`** stateful memory layer (`Policy`, `Preference`, `Fact`, `Episodic`).
* **Tenant Permission Filtering & Prompt-Injection Isolation:** Search queries propagate `(tenantId, actorEntityRef)` so Backstage's Search permission policy filters unauthorized documents prior to return. Retrieved snippets are wrapped in explicit data-delimiters (`<retrieved_doc>`) and passed through `ModelExecutor` redaction/guardrail checks so untrusted markdown content cannot execute indirect prompt injections.

### Backstage CacheService Backing Store & Redis Isolation
<!-- Source: incoming/CACHE_MEMCACHE_AND_REDIS.md (Sections: Backstage APIs for Memcached and Redis, How to Configure It, How to Use It Programmatically inside your Plugin) -->

The platform leverages Backstage's native **Cache Service** (`coreServices.cache` from `@backstage/backend-plugin-api`) backed by `keyv` rather than instantiating standalone `ioredis` or `memcached` clients:

* **Framework-Managed Connection Lifecycle:** Backstage manages connection pooling, serialization, and driver lifecycle internally via `backend.cache` configuration (`store: redis | memcached | memory` and `connection`), exposing a unified `cache.get()` / `cache.set(key, value, { ttl })` API (TTL in milliseconds).
* **Automatic Plugin Prefixing:** Backstage automatically namespaces keys per `pluginId` (e.g., `agentic-workflow-engine`) to prevent cross-plugin key collisions on a shared cache cluster.

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
1. **Explicit Tenant, Principal, and Session Key Namespacing:** While `coreServices.cache` isolates keys *across plugins*, it does **not** isolate keys *across tenants, users, or sessions within the same plugin*. All ephemeral session/cache keys inside the workflow plugin must enforce a deterministic, hierarchical key builder (`tenant:{tenantId}:principal:{principalRef}:session:{sessionId}:{key}`) to prevent cross-tenant data leakage (SOC-2 / HIPAA / FINRA).
2. **Scope of `CacheService` vs. Durable Stores:** `coreServices.cache` is strictly a best-effort, TTL-bound ephemeral cache (for rate-limit counters, short-lived capability response caching, and transient session scratchpads). Durable checkpoints (`CheckpointStore`), run histories (`RunStore`), audit logs (`AuditLogSink`), and artifacts (`ArtifactSink`) must never rely on `coreServices.cache` as their system of record.
3. **Production Store & TLS Enforcement:** Plaintext `redis://user:password@...` URIs and `store: memory` are prohibited in regulated environments. Production `app-config.yaml` must inject credentials via secret/environment variable substitution (`${REDIS_URL}`), mandate TLS (`rediss://`), and enforce Redis ACLs and encryption-at-rest.

### Persistence Split: PostgreSQL State Logs & Mem0 + Vector Store
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Global System Architecture & Tier Diagram) -->

* **Dual-Store Topology:**
  * **PostgreSQL:** System of record for durable workflow visual/state logs (`RunStore`, `CheckpointStore`, `AuditLogSink`, and FinOps accounting ledgers).
  * **Mem0 + Vector DB (`pgvector` / Qdrant):** Manages semantic memory and retrieval context coordinated during activity execution.
* **Reconciliation Note (Diagram Typo):** The architecture diagram labels the memory/vector block as `[ MemQ + Qdrant DB ]`; per the whitepaper header and platform specification, this refers to **Mem0** paired with the configured vector backend (`pgvector` in regulated PostgreSQL-consolidated deployments or Qdrant via `storage-driver`).

### `AgentContext.memory` & Ephemeral `cache` Interface Contract
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: The Fluent Core Interface Engine — AgentContext) -->

* **Scoped Memory API:** Step handlers interact with long-term semantic memory via `ctx.memory.search({ query, limit, filter })` and `ctx.memory.remember({ text, metadata })`. The underlying Mem0 adapter automatically injects mandatory `tenantId`, `principalRef` / `agentId` scoping filters and runs pre-persistence PII/PHI redaction before writing vectors.
* **Ephemeral Scratchpad (`ctx.cache`):** `ctx.cache.get(key)` / `ctx.cache.set(key, val, ttl)` delegates to Backstage `coreServices.cache` with automatic `tenantId` + `workflowId` key prefixing.

### FinOps Ledger Persistence & PostgreSQL Governance (`FinOpsLedgerStore`)
<!-- Source: incoming/ARCHITECTURE_WHITE_PAPER.md (Section: Permanent Financial Accounting Ledger (PostgreSQL)) -->

* **Co-Located Audit & FinOps Schema:** `agent_finops_ledger` resides in the Backstage plugin's managed PostgreSQL database (`coreServices.database`) alongside `RunStore`, `CheckpointStore`, and `AuditLogSink`, partitioned by `recorded_at` and indexed on `(tenant_id, recorded_at)` and `(tenant_id, run_id)` for fast per-tenant rollups and FINRA/SOC-2 retention archival.

### Hierarchical Session Keys as Isolation, Routing & Concurrency Primitives
<!-- Source: incoming/OPENCLAW_LESSONS.md (Section: OpenClaw Lessons Worth Applying to a Backstage IDP Platform — Hierarchical Session Keys as RBAC & Routing Primitives) -->

* **Structured Composite Session Keys:** Every workflow session and short-term store entry (`SessionStore`, `CheckpointStore`, Redis cache keys) is namespaced with a deterministic hierarchical key encoding tenant, catalog entity, principal, trigger source, and thread/run identity:
  `tenant:{tenantId}:entity:{kind}:{namespace}/{name}:trigger:{source}:principal:{principalRef}:session:{sessionId}`
* **Operational Benefits:**
  * Prevents cross-tenant or cross-entity state collisions at the storage key level.
  * Provides natural per-entity concurrency lock keys (`locks.runExclusive`) so simultaneous webhook/cron triggers targeting the same catalog component serialize cleanly.
  * Embeds immutable RBAC and audit provenance directly into session routing and retention sweepers.

### Prompt Assembly Precedence: Catalog Entity Grounding vs. Ephemeral Tool Outputs
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 1: Declarative, Priority-Budgeted Prompt Rendering (@vscode/prompt-tsx)) -->

* **Tiered Context Eviction Order:** During prompt compilation, retrieved context adheres to a strict survival hierarchy:
  1. **Invariant Frame (Highest Priority):** System instructions, compliance/redaction directives, and active task goal.
  2. **Canonical IDP Grounding:** Verified Backstage Software Catalog entity metadata (`kind:namespace/name`, owner, lifecycle, relations) and approved Mem0 project facts.
  3. **Recent Turn & Summarized History:** Compacted turn history and pre-compaction memory flush checkpoints.
  4. **Historical Operational Tool Outputs (Lowest Priority / Truncatable):** Raw logs, large JSON payloads, and prior step tool traces, which are truncated or summarized first under token pressure.

### Lazy Catalog Runbook & Skill Hydration (`backstage.io/techdocs-ref` & `agent.io/skills`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 4: Lazy "Agent Skills" & Glob-Scoped Instructions) -->

* **Entity-Scoped Context Retrieval:** Instead of indexing or stuffing all operational runbooks into global prompts, the context retriever inspects the target Backstage entity's `kind`, `spec.type`, and `metadata.annotations` (`backstage.io/techdocs-ref`, `backstage.io/techdocs-entity`, `agent.io/skills`) and fetches referenced runbooks on demand through Backstage's `PermissionsService`-enforced Catalog/TechDocs readers.

### Two-Stage Compaction Persistence (`Mem0` Flush + `SessionStore` Working Summary)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 6: Structured, Intent-Focused Compaction (summarizer.ts)) -->

* **Externalized Durability vs. Lean In-Context State:** When session token usage crosses the compaction watermark:
  * **Durable Facts** are persisted to **Mem0** (scoped by `tenantId`, `entityRef`, `principalRef`) and `CheckpointStore` for cross-run recall and compliance auditability.
  * **Active Working State** is overwritten in `SessionStore` with the compact, schema-validated `summarizer.ts` object (`USER_INTENT`, `TASK_DESCRIPTION`, `EXISTING`, `PENDING`, `CODE_STATE`, `RELEVANT_SNIPPETS`), keeping subsequent LLM turns deterministic and token-efficient.

### Live Entity State Slots vs. Append-Only Turn History (`SessionStore`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 8: Per-Turn Prompt Rebuilding Over Append-Only History) -->

* **State-Slot Superseding in `SessionStore`:** `SessionStore` separates immutable conversational turns (`user` / `assistant` messages and tool call IDs) from **keyed mutable state slots** (`stateSlots[resourceKey]`). When a tool or background signal updates a Backstage Catalog entity or deployment status, `stateSlots[resourceKey]` is atomically replaced rather than duplicated in message history, preventing context bloat and stale-state reasoning.

### Paired State & Artifact Baseline Snapshots in `CheckpointStore`
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 12: Two-Tier Edits & Reversible Workspace Checkpoints) -->

* **Point-in-Time Checkpoint Records:** Each entry in `CheckpointStore` (`tenantId`, `runId`, `checkpointId`, `stepIndex`, `createdAt`) persists:
  1. The sanitized workflow state snapshot (`currentState`) and `SessionStore` pointer.
  2. References (`artifactId` / `baseSha` / `resourceVersion`) to pre-mutation external baselines stored in `ArtifactSink`, enabling non-destructive rewind to any prior checkpoint without losing earlier session diagnostics.

### Transport-Agnostic `SessionStore` & `RunStore` Ownership
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 13: The Client / Agent Host Split (Transport-Agnostic Sessions)) -->

* **Channel-Neutral Persistence:** `SessionStore` and `RunStore` persist canonical run state, multi-client event sequence numbers, and steering history server-side in PostgreSQL/Redis—never in browser `localStorage` or client memory—allowing seamless handoff across Backstage UI, Slack, and CLI clients.

### Structured Run Diagnostic Trace Retention (`RunStore` / `AuditLogSink`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 16: Built-In Self-Troubleshooting (/troubleshoot Over Session Logs)) -->

* **Query-Ready Execution Summaries:** Alongside raw OTel spans exported to external APM backends, `RunStore` persists a compact, redacted per-run diagnostic summary (loaded skills, resolved capabilities, step timings, cache stats, and normalized `ErrorCode` outcomes) indexed by `(tenantId, runId)` so `/troubleshoot` can inspect failed runs immediately without querying external trace storage.

### Oversized Tool Output Offloading (`ArtifactSink` + 70% Head / 20% Tail Excerpts)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 19: Deterministic Emergency Truncation Fallback (EmergencyTruncation / Last-Resort Dropping)) -->

* **Lossless Offload Before Context Slicing:** Whenever `normalizeCapabilityOutput` or `EmergencyTruncation` slices an oversized tool output (`> 20,000` chars), the full un-truncated payload (redacted per compliance rules or KMS-encrypted at rest) is persisted to `ArtifactSink` (`tenantId`, `runId`, `toolCallId`), while the prompt context receives the deterministic **70% head / 20% tail excerpt** plus the `artifactId` handle for targeted inspection.

### Structured Catalog Graph Queries vs. Unstructured Vector RAG
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 20: AST-Aware Semantic Code Search & Symbols Over Raw grep) -->

* **Hybrid Grounding Strategy:** Use **vector RAG** (Mem0 + TechDocs/document embeddings) for unstructured runbooks, post-mortems, and semantic similarity search, and **deterministic Backstage Catalog graph queries** (`getEntityRelations`, `findConsumersOfApi`, `resolveSystemTopology`) for exact dependency topology, ownership, and API consumer resolution—avoiding approximate embedding guesses when exact relational truth exists in the Software Catalog.

### Pinned Checklist State Slot in `SessionStore`
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 25: First-Class In-Context Todo List State (manage_todo_list)) -->

* **High-Priority Working Memory Anchor:** `SessionStore` stores the active run's structured `todoList` alongside `summarizer.ts` working state so every resumed turn re-renders the exact checklist state deterministically without relying on raw message history.

### Three-Tier Scoped Memory Hierarchy (Principal vs. Entity/System vs. Run)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 26: Three-Tier Scoped Memory (User vs. Repository vs. Session)) -->

Rather than storing all facts in a single flat vector collection, the memory architecture partitions knowledge into **three explicit isolation and lifecycle tiers** mapped directly to Backstage's domain model (adapted from VS Code Copilot Chat's `/memories/`, `/memories/repo/`, and `/memories/session/`):

| Memory Tier                     | Backstage Domain Scope                                       | Backing Store & Key Namespace                                | Lifecycle & Retention                                        | Example IDP Content                                          |
| :------------------------------ | :----------------------------------------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------- |
| **1. Principal (User) Memory**  | Initiating developer identity (`tenantId` + `principalRef`)  | **Mem0** (`scope: 'principal'`, `user_id: "{tenantId}:{principalRef}"`) | Persistent across runs; subject to user-data retention & GDPR/HIPAA erasure sweepers | Preferred output formatting, CLI/review habits, personal notification preferences |
| **2. Entity / System Memory**   | Backstage Catalog entity or system (`tenantId` + `entityRef`, e.g., `component:default/payment-service`) | **Mem0** (`scope: 'entity'`, `agent_id: "{tenantId}:{entityRef}"`) | Persistent across runs for authorized team members; governed by Catalog entity read/write RBAC & retention policies | Service-specific deployment quirks, known upstream failure modes, approved runbook conventions |
| **3. Run / Session Scratchpad** | Active workflow run (`tenantId` + `runId` / `sessionId`)     | **`SessionStore`** (PostgreSQL) & **`coreServices.cache`** (Redis TTL) | Ephemeral; automatically purged or archived upon Temporal workflow terminal completion (`completed` / `failed` / `cancelled`) | Intermediate hypothesis notes, active `manage_todo_list` state, transient step scratchpad |

#### Reconciliations & Hardening Notes (Prototype vs. Target Standard)
1. **Mandatory `tenantId` Prefix on Every Tier:** Even User/Principal memory must be strictly prefixed with `tenantId` (`{tenantId}:{principalRef}`) so multi-tenant deployments never share vector embeddings or metadata across organizational boundaries.
2. **RBAC Gate on Entity/System Memory Writes & Reads:** Reading from `Entity / System Memory` requires verified `PermissionsService` read access (`catalog.entity.read`) on the target `entityRef`; writing durable facts to `Entity / System Memory` requires verified entity ownership/write access (or human approval) so an unauthorized user or untrusted webhook cannot poison shared team memory for a service.
3. **Pre-Persistence PII/PHI/Secret Scrubbing:** Every write to Mem0 (`Principal` or `Entity` tier) must pass through the deterministic PII/PHI/MNPI and `SecretEnvelope` redactor before embedding generation or vector insertion.

### Pre-Persistence Vector & Checkpoint Redaction Gate
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 27: Multi-Pass Secret & Credential Redaction Pipeline) -->

* **Zero Credential Pollution in Long-Term Memory:** All text chunks and extracted facts pass through the multi-pass secret and PII/PHI redaction pipeline **prior to embedding generation or insertion** into Mem0 (`Principal` or `Entity` tiers), `SessionStore`, or `CheckpointStore`, preventing leaked credentials from being indexed and later surfaced via semantic RAG retrieval.

### Content-Addressed Tool Output Handles in `SessionStore`
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 28: Per-Turn Tool Result Deduplication & Reference Handles) -->

* **Lossless Replay with Compact Active History:** While `SessionStore` renders compact stub pointers in the active LLM prompt window for superseded polling turns, the underlying full tool outputs (or `ArtifactSink` references for large payloads) remain indexed by `(runId, toolCallId, contentHash)` so Temporal replay, `/troubleshoot`, and compliance audits retain complete historical visibility.

### Content-Addressed RAG Indexing & Merkle/SHA Incremental Sync
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 31: Content-Addressed Workspace Indexing & Merkle Tree Sync) -->

Enterprise Backstage deployments track thousands of `catalog-info.yaml` descriptors, TechDocs Markdown trees, and OpenAPI specifications. Rather than re-chunking and re-embedding entire documentation repositories on every push or workflow run, the RAG ingestion pipeline uses **content-addressed Merkle/SHA-256 chunk indexing** (modeled on VS Code Copilot Chat's workspace Merkle index):

* **Composite Content-Addressed Keying:**
  * Every source document is tracked by `(tenantId, entityUid, sourcePath, gitBlobSha)` and split into deterministic chunks keyed by `chunkSha256` (incorporating `chunkContent + embeddingModelId + chunkerVersion`).
  * **Zero-Cost Unchanged Sync:** When a webhook push or Catalog refresh arrives, the indexer compares incoming `(sourcePath, gitBlobSha)` and `chunkSha256` digests against the stored manifest table in PostgreSQL. Unchanged blobs and chunks are skipped completely with zero embedding API calls.
  * **Atomic Diff Application & Tombstone Pruning:** Only newly added or modified `chunkSha256` entries are redacted, embedded, and upserted into the vector store (`pgvector` / Qdrant), while superseded or deleted chunk hashes are pruned atomically so stale documentation never pollutes retrieval results.
* **Cross-Branch / Shared-Boilerplate Deduplication:**
  * Within the **same `tenantId`**, identical `chunkSha256` embeddings can be reused across entities or branches without paying duplicate embedding token charges (strictly partitioned by `tenantId`—never shared across tenants).

### Entity-Tagged RAG Chunks & Multi-Entity State Slots
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 33: Multi-Root Workspace & Cross-Repo Context Disambiguation) -->

* **Composite `entityRef` Metadata on All Retrieved Context:** Every chunk returned by vector RAG or Catalog graph traversal carries mandatory `{ tenantId, entityRef, repoSlug, sourcePath }` provenance metadata, and `SessionStore` live state slots are keyed by `(entityRef, resourceType)` so concurrent tracking of multiple services remains cleanly isolated.

### Deterministic Pre-Loop Entity & TechDocs Hydration
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 39: Contextual Reference Expansion & Implicit Mention Resolution (# / @ Resolvers)) -->

* **Single-Pass Grounding Before Turn 1:** When a prompt contains explicit `@entity` or `#techdocs` mentions—or inherits the active Backstage catalog page context (`entityRef`)—the context assembler resolves the entity descriptor, graph relations, and linked runbooks in a single batched lookup prior to Turn 1, populating `SessionStore` live state slots immediately.

### Pinned Working Set Persistence in `SessionStore`
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 41: Multi-Turn Prompt Compression via "Working Set" Pinning) -->

* **Structured Working-Set Registry:** `SessionStore` maintains a bounded `workingSet: Record<EntityRef, PinnedEntityState>` map (`pinnedAt`, `reason`, `artifactRefs[]`) alongside `stateSlots` and `todoList`. When a service is unpinned or cleared during triage, its raw diagnostic payloads remain archived in `ArtifactSink` / `AuditLogSink` for compliance traceability while being dropped from the active prompt hydration set.

### Versioned Session Transcript Serialization & Forward Upcasters (`schemaVersion`)
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 45: Session Transcript Serialization & Versioned Schema Migration) -->

Multi-day IDP workflows—such as cross-cluster compliance migrations, approval-suspended rollouts, and extended incident post-mortems—routinely outlive backend plugin deployments. Modeled on VS Code Copilot Chat's versioned session serialization and forward-migration readers, `SessionStore` and `CheckpointStore` persist structured, schema-versioned JSON documents in PostgreSQL with deterministic **forward upcasters**:

* **Canonical Versioned Envelope (`schemaVersion: number`):**
  * Every persisted `SessionRecord` and `CheckpointRecord` wraps its serialized multi-turn transcript, `toolCallId` mappings, `AgentStreamPart` UI history, `stateSlots`, `todoList`, `workingSet`, and checkpoint baseline references inside an explicit `{ schemaVersion, payload, updatedAt }` envelope.
* **Deterministic Forward Upcaster Chain (`v1 -> v2 -> ... -> vCurrent`):**
  * On read, `SessionStore` and `CheckpointStore` pass older persisted records through an ordered, pure-function **upcaster pipeline** (`upcastSessionPayload`) followed by strict Zod validation against the current schema version—upgrading legacy state shapes cleanly in memory without requiring risky big-bang database migrations during zero-downtime deployments.
  * **Forward-Compatibility Guard:** If a worker pod running an older code version encounters a record with `schemaVersion > CURRENT_SCHEMA_VERSION` during a rolling upgrade, it fails fast with a retryable `SCHEMA_VERSION_AHEAD` error so Temporal routes the task to an upgraded worker pod rather than corrupting newer state.
* **Hardening Note (Encryption & Redaction at Rest):** Persisted session transcripts and checkpoints must already have passed pre-persistence PII/Secret redaction and reside in tenant-partitioned PostgreSQL tables encrypted at rest (with sensitive artifact blobs offloaded to KMS-encrypted `ArtifactSink`).

### Windowed Slice Retrieval on Offloaded `ArtifactSink` Blobs
<!-- Source: incoming/COPILOT_CHAT_LESSONS.md (Section 47: Token-Aware Chunked File Reading & Line-Indexed Windows) -->

* **Random-Access Line Indexing:** When large tool outputs (`> 20,000` chars) are offloaded to `ArtifactSink`, the store records line-offset metadata so the agent can query targeted slices (`read_artifact_window(artifactId, startLine, endLine)`) or search within the offloaded artifact without re-executing expensive upstream API calls.
