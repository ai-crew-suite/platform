# Pluggable Storage Provider

In an enterprise platform designed for strict compliance (**FINRA, HIPAA, SOC-2**), an in-memory tool registry is only suitable for local development or basic pipelines. Large organizations running agentic workflows across thousands of production nodes require distributed state synchronization.

## Tool Registry Implementations

These could be handled relying on whatever the end user has configured for Backstage cache:

- **Memory-Backed Tool Registry**: Stores tool schemas and metadata in-memory. Suitable for local development or basic pipelines.
- **Redis-Cached / Distributed Tool Registry**: Syncs tool schemas and metadata across ephemeral server instances, ensuring that horizontally scaled clusters look up tools with minimal network lag.

We could have a config option to toggle from cache to a database backed store:

- **Database-Backed Tool Registry (SQL/Knex)**: Stores tool schemas and metadata directly in PostgreSQL. This allows operators to change or turn off tool configurations dynamically via a UI without needing to redeploy backend containers.

FOR THIS: see the permissions / rbac document for a perspective that says we shouldn't do this. **RBAC Policy-Enforced Tool Registry**: Wraps an underlying tool map and cross-references lookups against an external authorization engine (such as **Open Policy Agent (OPA)**) or Backstage roles before even revealing that a tool exists.

## The Recommendation: Promote to an "Active Boot Security Gate"

Instead of deleting this file or leaving it unused, **activate `InMemoryToolRegistry` as a read-only, audited validation layer** within your runtime core.

Transform this registry to meet your compliance constraints with these three steps:

1. **Enforce Immutability Post-Boot**: Add a `.freeze()` lifecycle method. Once the Backstage extension collection phase finishes, lock the registry permanently. This prevents malicious runtime extensions from modifying or injecting unverified tools after startup.
2. **Inject Audit Metrics**: Add structured parameters to logging hooks within the lookup path. This satisfies your **Section F** logging standards, making tracking tool discovery across your enterprise clusters highly searchable.
3. **Decouple the Registration Mapping**: Inject the registry directly into the modern `toolExtensionPoint` so that external tool providers can populate it cleanly during startup.

## 🧱 The Decoupled Provider Blueprint

By breaking the file into a strict interface contract and an explicit provider implementation, third-party developers can seamlessly swap in alternative registries via Backstage Extension Points.

### 1. The Core Interface Specification

```typescript
// plugins/kernel/backend/src/storage/ToolRegistry.ts
import { Tool } from '@ai-crew-suite/plugin-platform-node';

/**
 * Core storage boundary defining the pluggable lifecycle of Tool Registry discovery.
 * Ensures consistent lookups across all underlying data implementations.
 */
export interface ToolRegistry {
  register(tool: Tool): void;
  get(id: string): Tool | undefined;
  list(): Tool[];
  freeze?(): void; // Optional hook for memory-bound implementations
}
```

### 2. The Isolated In-Memory Provider

```typescript
// plugins/kernel/backend/src/storage/InMemoryToolRegistry.ts
import { LoggerService } from '@backstage/backend-plugin-api';
import { ConflictError } from '@backstage/errors';
import { Tool } from '@ai-crew-suite/plugin-platform-node';
import { ToolRegistry } from './ToolRegistry';

/**
 * Memory-backed tool registry store for local staging or stateless execution environments.
 * Implements rigid boot-time immutability validation rules.
 */
export class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private isFrozen = false;

  public constructor(private readonly logger: LoggerService) {}

  public freeze(): void {
    this.isFrozen = true;
    this.logger.info('In-memory tool registry map permanently frozen for security verification.', {
      totalRegisteredTools: this.tools.size,
    });
  }

  public register(tool: Tool): void {
    if (this.isFrozen) {
      throw new ConflictError(`Security Violation: Cannot register tool '${tool.id}' against a frozen boundary.`);
    }
    if (this.tools.has(tool.id)) {
      throw new ConflictError(`Registration Conflict: Tool key identifier '${tool.id}' is already mapped.`);
    }

    this.tools.set(tool.id, tool);
    this.logger.debug('Tool registry registered successfully in memory partition', { toolId: tool.id });
  }

  public get(id: string): Tool | undefined {
    const tool = this.tools.get(id);
    if (!tool) {
      this.logger.warn('Tool registry lookup returned empty', { requestedToolId: id });
    }
    return tool;
  }

  public list(): Tool[] {
    return [...this.tools.values()];
  }
}
```

### Why this is a significant improvement:

- **True Domain Isolation**: Grouping all persistence layers inside `storage/` clusters related behaviors together, matching the organization of your `runtime/` and `api/` layers.
- **Architecture Agnostic**: The rest of your application code (like `ToolExecutor`) depends solely on the generic `ToolRegistry` interface, remaining completely uncoupled from your choice of backend storage.

## 🛡️ Eliminating Circular Dependencies During Boot

To prevent circular dependencies where the plugin needs a fully constructed registry to boot, but the registry needs extension points that aren't ready yet, you should leverage the **Registry Reference Swapping Pattern**.

By initializing a stateless extension bucket during the Backstage collection phase and compiling it into an immutable database-backed provider during the `.registerInit()` sequence, you can ensure a clean, linear initialization flow.

## 🧱 Architecture Blueprint: The `databases/tool-registry` Domain

### 1. The Storage Boundary Interface

```typescript
// plugins/kernel/backend/src/databases/tool-registry/types.ts
import { Tool } from '@ai-crew-suite/plugin-platform-node';

/**
 * Storage seam contract for tool registry inventories.
 * Decouples core execution handlers from specific database implementations.
 */
export interface ToolRegistryStore {
  save(tool: Tool): Promise<void>;
  findById(id: string): Promise<Tool | undefined>;
  listAll(): Promise<Tool[]>;
}
```

### 2. The High-Compliance Database Provider

```typescript
// plugins/kernel/backend/src/storage/tool-registry/DatabaseToolRegistryStore.ts
import { Knex } from 'knex';
import { LoggerService } from '@backstage/backend-plugin-api';
import { ConflictError, NotFoundError } from '@backstage/errors';
import { Tool } from '@ai-crew-suite/plugin-platform-node';
import { ToolRegistryStore } from './types';

/**
 * SQL-backed tool registry inventory store.
 * Enforces production-grade persistence and auditable logging hooks.
 */
export class DatabaseToolRegistryStore implements ToolRegistryStore {
  public constructor(
    private readonly db: Knex,
    private readonly logger: LoggerService
  ) {}

  public async save(tool: Tool): Promise<void> {
    this.logger.debug('Persisting tool registry schema signature to storage inventory', { toolId: tool.id });
    
    // Ensure metadata, inputs, and execution schemas are safely serialized as JSON text blocks
    await this.db('kernel_tool_inventory')
      .insert({
        id: tool.id,
        description: tool.description,
        schema_json: JSON.stringify(tool.schema),
        created_at: new Date().toISOString(),
      })
      .onConflict('id')
      .merge();
  }

  public async findById(id: string): Promise<Tool | undefined> {
    const record = await this.db('kernel_tool_inventory').where({ id }).first();
    if (!record) {
      this.logger.warn('Tool registry inventory lookup returned empty record', { targetToolId: id });
      return undefined;
    }

    return {
      id: record.id,
      description: record.description,
      schema: JSON.parse(record.schema_json),
      executor: async () => {
        throw new Error('Direct invocation of storage record is disabled. Utilize ToolExecutor instead.');
      }
    };
  }

  public async listAll(): Promise<Tool[]> {
    const records = await this.db('kernel_tool_inventory').select('*');
    return records.map(record => ({
      id: record.id,
      description: record.description,
      schema: JSON.parse(record.schema_json)
    }));
  }
}
```

## 🔩 Non-Circular Integration Blueprint (`plugin.ts`)

This demonstrates how to structure `plugin.ts` to manage the collection phase safely without triggering dependency resolution loops:

```typescript
// plugins/kernel/backend/src/plugin.ts
import { createBackendPlugin, coreServices } from '@backstage/backend-plugin-api';
import { toolExtensionPoint, ToolDefinition } from '@ai-crew-suite/plugin-platform-node';
import { DatabaseCapabilityStore } from './storage/tool-registry/DatabaseCapabilityStore';
import { createAiBackendServices } from './service';
import { createRouter } from './api/router';

export const ragAiPlugin = createBackendPlugin({
  pluginId: 'kernel',
  register(env) {
    // Phase A: Create a stateless staging array to collect tools from modules safely
    const collectedToolsStaging: ToolDefinition[] = [];

    env.registerExtensionPoint(toolExtensionPoint, {
      addTool(tool) {
        // Collect references without initializing databases or services yet
        collectedToolsStaging.push(tool);
      },
    });

    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        permissions: coreServices.permissions,
        database: coreServices.database,
      },
      async init({ logger, config, httpRouter, httpAuth, permissions, database }) {
        logger.info('Initializing Backstage AI Kernel Core...');

        // Phase B: Initialize actual database clients
        const knexInstance = await database.getClient();
        const capabilityStore = new DatabaseCapabilityStore(knexInstance, logger);

        // Phase C: Flush collected definitions out to persistent storage
        for (const tool of collectedToolsStaging) {
          await capabilityStore.save(tool);
        }
        logger.info('Tool inventory successfully compiled and synchronized.', { 
          synchronizedCount: collectedToolsStaging.length 
        });

        // Phase D: Complete service generation and mount the declarative router
        const services = createAiBackendServices({
          logger,
          config,
          capabilityStore, // Injected alongside your runtime and vector stores
          // ... remaining configuration settings
        });

        httpRouter.use(
          await createRouter({
            logger,
            config,
            httpAuth,
            permissions,
            agentRuntime: services.runtime,
            agents: services.agents,
          }),
        );
      },
    });
  },
});
```

### Why this is a significant improvement:

- **Directory Parity**: Your folder tree balances perfectly into three parallel data domains: `databases/runtime`, `databases/vector`, and `storage/tool-registry`.
- **Zero Circular Reference Risk**: The staging array acts as an intermediary, collecting definitions safely during startup so that storage allocation happens linearly.
- **Production-Grade Audit Readiness**: Tool structures are backed by a persistent database schema, allowing compliance teams to easily run retention reviews or review modification logs.

## 🗺️ System Blueprint Relationship

```
                     ┌───────────────────────────┐
                     │    createRouter/Factory   │
                     └─────────────┬─────────────┘
                                   │ (Wires up both dependencies)
            ┌──────────────────────┴──────────────────────┐
            ▼                                             ▼
┌───────────────────────┐                    ┌─────────────────────────┐
│   StateSerializer     │                    │      ToolRegistry       │
├───────────────────────┤                    ├─────────────────────────┤
│ • Cryptographic Vault │                    │ • Tool Packing Registry │
│ • Encrypts Checkpoints│                    │ • Functional Executors  │
│ • Handles KMS Secrets │                    │ • Zod Parameter Schemas │
└───────────────────────┘                    └─────────────────────────┘
```

When you look at **Step 14** of your notes, it specifies: *"Build `ToolExecutor` ... and wire stores plus `StateSerializer`"* [Step 14]. This is why they were mentioned together—they are both core engine dependencies initialized by the backend startup factory [Step 14].

Now that the structural difference between the **cryptographic state serializer** and the **tool packing registry** is clear, which core system file would you like to refactor next? Let me know if we should proceed with:

1. The **`StateSerializer.ts`** snapshot cipher logic.
2. The **`ToolRegistry.ts`** packing logic [Step 16].

`ToolRegistry.ts` (The Tool Registry Inventory)

- **What it does:** It handles the live collection and schema matching for all available agent tools [Step 14, Step 16].
- **The Mission:** It holds the list of action modules that agents are allowed to run (e.g., executing a Kubernetes cluster scan or sending a Slack message) [Step 14, Step 16]. It validates these tools using standard Zod parameter footprints and manages their execution contexts without ever touching database state serialization or encryption workflows [Step 14, Step 16].

------
