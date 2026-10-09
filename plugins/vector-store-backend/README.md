# Vector Store Backend Plugin

## Configurations for each Use Case

By keeping this decoupled, your environment configurations remain clean and independent:

### `app-config.local.yaml` (Local Development using pgvector inside Compose)

```yaml
vectorStore:
  type: 'pgvector' # Uses the Knex connection already mapped to your pgvector/pgvector image
```

### `app-config.test.yaml` (CI Testing via automated mocks or embedded runtime)

```yaml
vectorStore:
  type: 'qdrant'
  qdrant:
    url: 'http://localhost:6333' # In CI, this could point to an ephemeral testcontainer runner
```

## Inject and Use the Vector Store inside a Client Plugin

Now, in your workflow or agent backend plugin, you list vectorStoreServiceRef as a dependency. Backstage will automatically instantiate the correct underlying database client (pgvector, qdrant, etc.) based on the user's app-config.yaml layout and inject it directly into your lifecycle initializer.

```typescript
// @internal/plugin-agentic-workflow-backend/src/plugin.ts
import { coreServices, createBackendPlugin } from '@backstage/backend-plugin-api';
// Import your custom service reference
import { vectorStoreServiceRef } from '@internal/plugin-vector-store-node';

export const agenticWorkflowPlugin = createBackendPlugin({
  pluginId: 'agentic-workflow-engine',
  deps: {
    logger: coreServices.logger,
    // Native injection loop of your custom vector storage manager
    vectorStore: vectorStoreServiceRef,
  },
  async register(env) {
    env.registerInit({
      deps: {
        logger: env.logger,
        vectorStore: env.vectorStore,
      },
      async init({ logger, vectorStore }) {
        logger.info('Agentic workflow plugin successfully connected to Vector Store.');

        // 1. Ensure the vector storage collection/table layout is running healthy
        const healthy = await vectorStore.isHealthy();
        if (!healthy) {
          throw new Error('Vector store connectivity check failed!');
        }

        // 2. Programmatically seed or save a memory vector string array
        const mockEmbedding = new Array(1536).fill(0.123); // Standard 1536-dimension float array

        await vectorStore.addMemory(
          'agent-007',
          'User prefers deploying workloads to AWS EKS clusters.',
          mockEmbedding
        );

        logger.info('Successfully persisted context embedding into the Vector Store.');
      },
    });
  },
});
```
