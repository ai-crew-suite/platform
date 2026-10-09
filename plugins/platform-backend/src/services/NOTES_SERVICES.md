# Notes on Services

## Built-in APIs for Memcached and Redis

Backstage has robust, native support for both **Memcached** and **Redis** baked directly into its core via the **Cache Service** (`coreServices.cache`). You do not need to install custom client drivers like `ioredis` or handle connection pooling manually. The framework manages the connections using `keyv` under the hood and delivers a clean, unified programmatic key-value interface to your backend plugins.

### How to Configure It (`app-config.yaml`)

You define your cache infrastructure globally. Backstage automatically scopes the cache keys per plugin to avoid data collisions.

```yaml
backend:
  cache:
    store: redis # Options: 'memory', 'memcached', or 'redis'
    connection: redis://user:password@localhost:6379
    # For Memcached, you would use:
    # store: memcached
    # connection: localhost:11211
```

### How to Use It Programmatically inside your Plugin

Simply declare a dependency on `coreServices.cache` inside your backend plugin wrapper:

```typescript
import { coreServices, createBackendPlugin } from '@backstage/backend-plugin-api';

export const agenticWorkflowPlugin = createBackendPlugin({
  pluginId: 'agentic-workflow-engine',
  deps: {
    cache: coreServices.cache, // Native injection of Memcached/Redis
    logger: coreServices.logger,
  },
  async register(env) {
    env.registerInit({
      deps: { cache: env.cache, logger: env.logger },
      async init({ cache, logger }) {
        // Interacting with the configured store (Redis/Memcached/In-Memory)
        await cache.set('latest-agent-run', 'success', { ttl: 3600000 }); // TTL in ms
        
        const status = await cache.get('latest-agent-run');
        logger.info(`Cached engine status: ${status}`);
      },
    });
  },
});
```

## API for Vector Store

In your workflow or agent backend plugin, you list `vectorStoreServiceRef` as a dependency. Backstage will automatically instantiate the correct underlying database client (`pgvector`, `qdrant`, etc.) based on the user's `app-config.yaml` layout and inject it directly into your lifecycle initializer.

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

