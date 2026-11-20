# AI Core Backend Module — Runtime Store

xxxxxxxxxx ├── packages/││   # =========================================================================│   # PACKAGE 1: BACKSTAGE NODE PLUGIN (Contracts, Types, Extension Points)│   # =========================================================================│   ├── backstage-plugin-agent-node/│   │   ├── package.json│   │   ├── tsconfig.json│   │   └── src/│   │       ├── index.ts                 # Main export entrypoint for all drivers & core│   │       ││   │       ├── extension-points/        # Targets where separate driver plugins register│   │       │   ├── platform-driver.extension-point.ts  # For observability, VCS, etc.│   │       │   ├── storage-driver.extension-point.ts   # For pgvector, qdrant, etc.│   │       │   └── security-driver.extension-point.ts  # For HashiCorp Vault, AWS KMS, etc.│   │       ││   │       ├── blueprints/              # Backstage Blueprints enforcing strict driver interfaces│   │       │   ├── platform-driver.blueprint.ts│   │       │   ├── storage-driver.blueprint.ts│   │       │   └── security-driver.blueprint.ts│   │       ││   │       ├── events/          # Strict event schemas and type definitions│   │       │   ├── audit.types.ts│   │       │   ├── system.types.ts│   │       │   └── workflow.types.ts│   │       ││   │       ├── api/│   │       │   ├── fluent-api.types.ts│   │       │   └── context.types.ts│   │       ││   │       └── utils/                   # PII/PHI masking/validation primitives used by drivers│   │           └── validation.ts│   ││   # =========================================================================│   # PACKAGE 2: CORE AGENT BACKEND PLUGIN (The Orchestration Engine)│   # =========================================================================│   ├── backstage-plugin-agent-backend/│   │   ├── package.json│   │   ├── tsconfig.json│   │   ├── src/│   │   │   ├── index.ts                 │   │   │   ├── plugin.ts                │   │   │   ││   │   │   # =========================================================================│   │   │   # 1. SHARED CORE ENGINE (Accessible by both Web Routers & Workers)│   │   │   # =========================================================================│   │   │   ├── engine/│   │   │   │   ├── fluent/              │   │   │   │   │   ├── base.ts          # Defs for the base AgentBuilder class & shared internal state│   │   │   │   │   ├── builder.ts       # Composition Root (Combines all mixins/traits into final class)│   │   │   │   │   # --- EXISTING MIXIN DOMAINS ---│   │   │   │   │   ││   │   │   │   │   ├── agent/           # Agent configuration domain methods│   │   │   │   │   │   ├── identity.ts  # .withName(), .withInstructions()│   │   │   │   │   │   └── model.ts     # .withTemperature(), .withLLMProvider()│   │   │   │   │   ││   │   │   │   │   ├── memory/          # Memory tracking & optimization domain methods│   │   │   │   │   │   ├── long-term.ts # .withUserMemory(), .withMem0Sync()│   │   │   │   │   │   └── short-term.ts# .withContextWindow(), .withBufferLimit()│   │   │   │   │   # --- NEW RAG MIXIN DOMAIN ---│   │   │   │   │   └── retrieval/       # API chaining for search parameters & sources│   │   │   │   │   │   ├── sources.ts   # .withStaticDocuments(), .withWebSearch()│   │   │   │   │   │   └── search.ts    # .withVectorSearch(), .withSimilarityThreshold()│   │   │   │   │   ││   │   │   │   │   ├── tools/           # Vercel AI SDK Tool execution hook methods│   │   │   │   │   │   ├── standard.ts  # .withSystemTools(), .withAllowedActions()│   │   │   │   │   │   └── custom.ts    # .withDynamicTool()│   │   │   │   │   ││   │   │   │   │   └── workflow/        # Execution & Signal coordination domain methods│   │   │   │   │       ├── signals.ts   # .onSignal(), .waitForSignal()│   │   │   │   │       └── lifecycle.ts # .onStart(), .onTimeout(), .compile()│   │   │   │   ││   │   │   │   └── compiler/            │   │   │   │       └── serialization.ts # Compiles grouped engine traits into a JSON execution graph│   │   │   ││   │   │   # =========================================================================│   │   │   # 2. RUNTIME 1: SYNCHRONOUS HTTP LAYER (Receives requests & starts workflows)│   │   │   # =========================================================================│   │   │   ├── http/                    │   │   │   │   ├── router/              │   │   │   │   │   ├── routes.ts        # Handlers invoke the builder & dispatch to Temporal│   │   │   │   │   └── middleware/│   │   │   │   │       ├── auth.ts      │   │   │   │   │       ├── compliance-ctx.ts│   │   │   │   │       └── error.ts     │   │   │   │   └── client/│   │   │   │       └── temporal-dispatcher.ts # Client wrapper triggering the generic workflow│   │   │   ││   │   │   # =========================================================================│   │   │   # 3. RUNTIME 2: ASYNCHRONOUS TEMPORAL WORKER LOOP (The Interpreter Environment)│   │   │   # =========================================================================│   │   │   ├── worker/                  │   │   │   │   └── temporal/            │   │   │   │       ├── worker.ts        # Boots the Temporal worker process│   │   │   │       ││   │   │   │       ├── workflows/       │   │   │   │       │   ├── index.ts     │   │   │   │       │   └── dynamic-agent-executor.workflow.ts # ◄ THE ONLY WORKFLOW: Interprets the serializable definitions│   │   │   │       ││   │   │   │       ├── activities/      # Discrete, side-effect safe steps managed by the workflow│   │   │   │       │   ├── index.ts│   │   │   │       │   ├── driver-proxy.activity.ts│   │   │   │       │   ├── compliance-reporting.activity.ts│   │   │   │       │   ├── llm-call.activity.ts # Wraps Vercel AI SDK execution in activities│   │   │   │       │   # --- NEW RAG COMPUTATION ACTIVITIES ---│   │   │   │       │   └── retrieval.activity.ts # Handles chunking, vector fetching, and re-ranking│   │   │   │       ││   │   │   │       └── context/         # The 50+ utility methods injected into activities/tasks│   │   │   │           ├── execution-ctx.ts │   │   │   │           ├── ai-helpers.ts # Exposes @temporalio/ai-sdk workflow primitives safely│   │   │   │           └── compliance-helpers.ts│   │   │   ││   │   │   # =========================================================================│   │   │   # 4. CROSS-CUTTING COMPLIANCE & CONFIGURATION INFRASTRUCTURE│   │   │   # =========================================================================│   │   │   ├── platform/                │   │   │   │   ├── config/              │   │   │   │   │   ├── temporal.ts│   │   │   │   │   └── mem0.ts│   │   │   │   └── compliance/          │   │   │   │       ├── audit-logger.ts  │   │   │   │       ├── encryption.ts    │   │   │   │       └── retention.ts     │   │   │   ││   │   │   └── services/                # Low-level client instances used by activities/routers│   │   │       ├── ai/                  # Vercel AI SDK low-level driver routing│   │   │       │   ├── client.ts        │   │   │       │   ├── streams.ts       │   │   │       │   └── tools/│   │   │       ││   │   │       # --- CORE RAG SERVICE LAYER ---│   │   │       ├── retrieval/           # Orchestrates core RAG business pipelines│   │   │       │   ├── chunking.ts      # Text splitting strategies (token/semantic based)│   │   │       │   ├── embedding.ts     # Maps text to vectors via Vercel AI SDK│   │   │       │   └── reranking.ts     # Optimizes retrieved context node relevance scores│   │   │       ││   │   │       └── memory/              # Mem0 low-level interface│   │   │           ├── client.ts        │   │   │           └── guardrails.ts    │   │   ││   │   └── tests/                       │   │       ├── setup.ts                 │   │       ├── unit/                    # Validates builder serialization output forms match specs│   │       ├── integration/             │   │       └── temporal/                # Tests the generic interpreter using sample JSON payloads│   │           └── dynamic-agent-executor.test.tsbash

It replaces the runtime persistence that previously lived in `plugin-ai-core-backend-module-storage-pgvector`, decoupling agent state from the vector embedding store so deployments can mix and match storage technologies.

## What it provides

The module assembles the five runtime persistence contracts from `@ai-crew-suite/plugin-kernel-node` and registers them with the AI backend plugin through the `runtimeStoreExtensionPoint`:

| Contract          | Purpose                                                        | Backend options      |
| ----------------- | -------------------------------------------------------------- | -------------------- |
| `SessionStore`    | Conversation session messages                                  | `database`, `redis`  |
| `CheckpointStore` | Resumable orchestration state for paused/running runs          | `database`, `redis`  |
| `RunStore`        | Run records, event logs, statuses, idempotency keys, approvals | `database`           |
| `ArtifactSink`    | Artifact references produced by runs                           | `database`           |
| `AuditLogSink`    | Audit records for write actions and approval decisions         | `database`           |

The `database` backend (`SqlAgentRuntimeStore`) uses the Backstage core database service, so it honors the site-wide `backend.database` configuration — PostgreSQL, MySQL, or SQLite — with no additional setup. Migrations are packaged with the module and applied at startup.

The `redis` backends use a dedicated Redis connection configured on this module, independent of the platform cache. This is deliberate: checkpoint and session state must not be subject to the eviction semantics of a shared cache store (for example memcached LRU or per-process memory). Run, approval, artifact, and audit records are always written to the SQL store because they form the durable system of record.

## Installation

Register the module with the AI core backend plugin:

```ts
// packages/backend/src/index.ts
backend.add(import('@ai-crew-suite/plugin-kernel-backend'));
backend.add(import('@ai-crew-suite/plugin-kernel-backend-module-runtime-store'));
```

With no configuration, every store uses the Backstage core database service.

## Configuration

All options live under `ai.runtime.stores` and are optional:

```yaml
ai:
  runtime:
    stores:
      sessions:
        backend: redis        # 'database' (default) | 'redis'
        ttlMs: 86400000       # optional sliding TTL for session entries
        maxMessages: 100      # optional cap on retained messages per session (default 100)
      checkpoints:
        backend: redis        # 'database' (default) | 'redis'
        ttlMs: 604800000      # optional sliding TTL for checkpoint entries
      redis:
        connection: rediss://user:secret@cache.example.com:6380  # required when any store uses 'redis'; rediss:// enables TLS
        keyPrefix: ai-core    # optional key prefix (default 'ai-core')
```

Validation fails fast at startup when a store selects the `redis` backend without a configured `redis.connection`, and the module pings Redis during boot so connectivity problems surface immediately rather than on the first agent run.

### Backend selection guidance

- **Sessions** are conversational memory: valuable, but tolerable to lose. Redis gives shared, fast access across multiple backend replicas.
- **Checkpoints** gate run resumption, including runs paused on human approval for days. Redis works well when it is configured for persistence; a lost checkpoint degrades its run to a restartable error state rather than corruption, since the run record itself lives in SQL.
- **Runs, approvals, artifacts, and audit logs** are compliance-relevant records and are always durable SQL.

## How it wires in

`plugin-ai-core-backend` no longer depends on any storage implementation. It registers a `runtimeStoreExtensionPoint` (from `@ai-crew-suite/plugin-kernel-node`) with per-contract setters that reject duplicate registration at boot. This module is the reference implementation; an alternate backend (for example DynamoDB) can be introduced as another module that calls the same extension point. When no module registers a store, the runtime operates without that persistence.

## Compliance and Licensing

Copyright © 2026 The AI Crew Suite Authors.
Licensed under the **Apache License, Version 2.0**.
