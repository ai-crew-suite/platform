# Vector Store Backend Plugin

> I forgot that mem0 provides drivers for all or most of the vector stores we've just implemented.
>
> I think this package needs to be renamed "Mem0" and focus on providing the interface to it. We need a central place at least for config and the Mem0 SDK to live. The same is true for Temporal - need a plugin for it. Not sure if either need the *-node plugin though.

Mem0's open-source TypeScript SDK (`mem0ai`) **already features built-in native drivers** for Qdrant, PGVector, Pinecone, Azure AI Search, Milvus, and its own In-Memory engine.

Discovering this before diving into deep integration code saves you hundreds of engineering cycles. This realization helps you streamline your project in several ways:

## 1. Delete the Entire Custom `storage/` Directory

You can safely remove all your custom implementation drivers (`PgVectorEngine.ts`, `MilvusEngine.ts`, etc.) along with the complex `storageFactory.ts` query wrappers you were designing. Mem0 already maintains these connections, indexes, and mathematical cosine similarity lookups natively.

## 2. Redefine the Role of Your `vector-store` Plugins

Your custom Backstage plugins (`vector-store-node` and `vector-store-backend`) are still incredibly valuable, but their purpose changes from *writing database queries* to *orchestrating infrastructure configurations*:

- **`vector-store-node`:** Exposes a clean Backstage `Memory` wrapper type reference. Consuming plugins (like your workflow engine) inject this service token instead of importing Mem0 directly, preserving strict architecture paths.
- **`vector-store-backend`:** Becomes an **Infrastructure Config Mapper**. Its sole job is to read Backstage’s global `app-config.yaml` and construct the exact configuration JSON object Mem0 expects.

## 3. How the Modern Configuration Mapping Looks

Instead of maintaining a massive switch-case block of database code, your centralized Backstage service factory simply translates Backstage config flags straight into Mem0 config structures and returns a pre-configured instance:

```typescript
// Conceptual blueprint of your simplified plugins/vector-store-backend/src/serviceFactory.ts
import { createServiceFactory, coreServices } from '@backstage/backend-plugin-api';
import { vectorStoreServiceRef } from '@ai-crew-suite/plugin-vector-store-node';
import { Memory } from 'mem0ai/oss'; // Pull Mem0 open-source engine directly

export const vectorStoreServiceFactory = createServiceFactory({
  service: vectorStoreServiceRef,
  deps: {
    config: coreServices.rootConfig,
  },
  async factory({ config }) {
    const provider = config.getOptionalString('vectorStore.type') || 'pgvector';
    
    // Dynamically build the exact dictionary payload Mem0 expects
    const mem0Config = {
      vectorStore: {
        provider,
        config: config.getOptionalConfig(`vectorStore.${provider}`)?.getPlain() || {},
      },
    };

    // Instantiate and pass the initialized Mem0 orchestration object straight out
    return new Memory(mem0Config);
  },
});
```

## 4. Resolving Your Embedder Question Natively

This also answers your previous question about why your custom code didn't feature an explicit LLM embedding loop. Mem0 **automatically integrates the embedder and database layers** under the hood.

When your agentic workflow plugin calls `await memory.add("User prefers AWS EKS")`, Mem0 intercepts the string, passes it to your configured embedding model, creates the float array, and pushes it to your active vector database automatically.

## Mem0

**Mem0** is primarily written in **Python** (its core open-source engine), but it also provides an official client-side package for **TypeScript/Node.js** (`npm install mem0ai`).

### Is it run as a daemon?

It can be run **both** as an in-process library or as a background service/daemon:

1. **As an Embedded Library (No Daemon):** You can install `pip install mem0ai` and import it directly into your application code via `from mem0 import Memory`. In this setup, it executes directly within your runtime process.
2. **As a Standalone Daemon/Server:** Mem0 can be deployed as a self-hosted [FastAPI server wrapped in Docker Compose](https://docs.mem0.ai/open-source/overview). In this architecture, it runs as a persistent background daemon process listening on an API port (defaulting to `:8000`), complete with an operations audit log and a Next.js frontend dashboard.

### Does it provide drivers for embedding LLMs?

**Yes.** Mem0 handles the entire extraction pipeline internally, meaning **it provides built-in drivers for both large language models (LLMs) and text embedding models**.

When you pass a raw conversation chat turn to Mem0, its LLM driver extracts the durable user preferences or facts. Simultaneously, its embedder driver converts those extracted facts into vectors before storing them via your vector database driver.

You can configure these using a pluggable provider pattern:

- **Supported Embedder Drivers:** It includes drivers for OpenAI (defaulting to `text-embedding-3-small`), Azure OpenAI, Ollama, Hugging Face, Google AI, AWS Bedrock, LM Studio, FastEmbed, and Together. It can also wrap any standard `LangChain` embedding object. Mem0 provides an explicitly named, built-in in-memory vector store driver. You can invoke it by simply passing `"memory"` as the provider string (ideal for testing or volatile prototyping). **Milvus, Pgvector, Pinecone, and Qdrant:** **Yes, it natively supports all four.** They are fully supported out of the box in the open-source library. Changing between them requires modifying the `provider` name and its matching connection config payload (e.g., `url` or `apiKey`) without altering your core application logic.
- ***Supported LLM Drivers:** It provides built-in drivers for OpenAI, Anthropic, Groq, Mistral, Ollama, Together, and others to handle the background memory processing, synthesis, and deduplication.

## TypeScript SDK & Dynamic Configurations

**Yes, Mem0 has a fully supported TypeScript SDK**, available via the [`mem0ai`](https://docs.mem0.ai/open-source/node-quickstart) npm package.

**Yes, you can absolutely pass and swap configurations dynamically.** Instead of relying strictly on fixed infrastructure environment variables, you instantiate the `Memory` class inside your Node.js/TypeScript code by passing a dynamic configuration object straight into the constructor.

Here is an example showing how to initialize Mem0 dynamically using the **TypeScript SDK**, featuring the **in-memory driver**:

```typescript
import { Memory } from 'mem0ai/oss'; // Accessing the open-source module layout

// You can construct, modify, or swap this object dynamically at runtime
const dynamicConfig = {
  // 1. Using the native volatile in-memory provider
  vectorStore: {
    provider: 'memory', 
    config: {
      collectionName: 'agent-runtime-memories',
      dimension: 1536 // Match the output dimensions of your embedding model
    }
  },
  // 2. Setting up the text embedding model driver
  embedder: {
    provider: 'openai',
    config: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'text-embedding-3-small'
    }
  },
  // 3. Setting up the memory reasoning/extraction LLM driver
  llm: {
    provider: 'openai',
    config: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-4-turbo-preview'
    }
  }
};

// Initialize the memory engine layer dynamically with your configuration matrix
const memory = new Memory(dynamicConfig);

async function runAgentMemoryPipeline() {
  // Add an interaction to memory
  await memory.add("The user prefers working with PostgreSQL over MongoDB.", { 
    userId: "dev-user-123" 
  });

  // Search against the in-memory graph backend
  const results = await memory.search("What database system does the user like?", { 
    userId: "dev-user-123" 
  });
  
  console.log(results);
}
```

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

In the fluent workflow API of the backend plugin, you list `vectorStoreServiceRef` as a dependency. Backstage will automatically instantiate the correct underlying database client (`pgvector`, `qdrant`, etc.) based on the user's `app-config.yaml` layout and inject it directly into your lifecycle initializer.

```typescript
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
