# Vector Databases

## Mem0 Supported Vector Databases

Mem0 provides native TypeScript SDK drivers for the following, with details on whether the client has direct access from external code. 

- ✅ **`qdrant`** – Supports passing a pre-configured `QdrantClient` directly under the `config.client` parameter. This permits direct catalog lookups and parallel collection querying outside of Mem0.
- ❌ **`pgvector`** – Does **not** accept a raw Knex or pg-pool database client instance. It strictly requires a descriptive network dictionary (e.g., `connectionString`, host parameters, and standard `ssl` profiles).
- ❌ **`redis`** / **`valkey`** – Does **not** support direct client injection. Expects a direct `redisUrl` string along with traditional authentication credentials. *(Note: Valkey is natively mapped via Redis connection wrappers in TS).*
- ❌ **`milvus`** – Does **not** support injecting an external client. The SDK handles lazy loading of the `@zilliz/milvus2-sdk-node` package internally via standard `url`, `token`, and `dbName` values.
- ❌ **`supabase`** – Does **not** accept an existing Supabase client instance. Requires explicit standalone project HTTP keys and routing attributes to establish internal vector connections.
- ✅ **`oracle_ai_vector_search`** – Supports passing an existing active `oracledb.Connection` or `oracledb.Pool` straight to the `config.client` parameter. When provided, Mem0 safely bypasses authentication parameters and guarantees it will not prematurely close your application's connection pool.
- ❌ **`azure_ai_search`** – Does **not** support direct client passing. Connects via cloud-managed endpoint strings and specific target API key configurations.
- ❌ **`amazon_s3_vectors`** – Does **not** accept a raw AWS SDK client. Relies natively on standard IAM environmental roles or inline parameter variables to orchestrate file indexing.
- ❌ **`neptune_analytics`** – Does **not** allow direct graph/vector client passing. Manages internal REST handshakes purely via targeted endpoint parameter setups.
- ❌ **`vectorize`** – Does **not** support a direct client object. Built explicitly to interface with Cloudflare Workers using a direct HTTP `accountId` and `apiKey` credential mapping.
- ❌ **An in-memory store** – Does **not** support client injection. Built entirely using isolated, internal Node.js runtime memory scopes for transient local development and unit tests. It does not spawn an accessible database client

## Mem0 Low-Level Access to Vector Database

**Mem0 does not provide direct, low-level access to the underlying vector database client through its drivers.**

When you initialize a Mem0 instance and pass it configuration details for a store like **Qdrant** or **pgvector**, Mem0 encapsulates the database client privately within its internal service class. It does not expose a public `.client` property or connection pool object for you to run arbitrary vector queries, custom pipeline aggregations, or direct metadata indexing.

### Why Mem0 Limits Direct Access

Mem0 is explicitly designed as a high-level **Memory Orchestration Layer**, not a generic database ORM like Knex. When your application calls `memory.add()`, Mem0 processes the raw data through an extraction, deduplication, and fact-fusion pipeline before writing to the database.

Furthermore, Mem0 structures its underlying collections rigidly. For instance, it formats specific payload metadata filters and forces keyword indexes on internal scope tags like `user_id` and `agent_id`. If you bypass Mem0 and manually alter rows directly in the database, you run the risk of breaking Mem0's internal fact-tracking state machines.

### How to Bypass This Limitation in Your Backstage Architecture

If one of your 18 agentic plugin pairs needs to perform an operation that Mem0 doesn't natively support (such as bulk data wipes or domain-specific vector searches over heavy document catalogs), you should implement a **Shared Client Strategy** inside your configuration.

Instead of letting Mem0 instantiate its own hidden connections from connection strings, pass a **pre-configured database client instance** into the Mem0 setup.

#### Example: Reusing a Vector Client in Node.js/TypeScript

Many of Mem0's database drivers accept an optional `client` parameter inside the configuration schema. This allows you to use the client for direct operations while passing it to Mem0 for memory tracking. [[1](https://docs.mem0.ai/components/vectordbs/config)]

```typescript
import { Memory } from 'mem0-ts';
import { QdrantClient } from '@qdrant/js-client-rest';

// 1. Establish your own direct connection pool to the database
const sharedQdrantClient = new QdrantClient({ host: 'localhost', port: 6333 });

// 2. You now have DIRECT, unrestricted access to the underlying vector DB
const collections = await sharedQdrantClient.getCollections(); 

// 3. Inject that exact client straight into the Mem0 initialization
const memoryEngine = new Memory({
  vector_store: {
    provider: 'qdrant',
    config: {
      client: sharedQdrantClient, // Prevents Mem0 from hiding the connection pool
      collection_name: 'backstage_agent_memory',
    }
  }
});

// 4. Use Mem0 strictly for high-level agent memory
await memoryEngine.add("User prefers Datadog metrics over CloudWatch alerts.", { userId: "alice" });
```

This pattern guarantees that your Backstage core plugin retains low-level execution control for infrastructure tasks while cleanly offloading long-term agent tracking to Mem0.

## Vectorstores

`vectorstores` acts as a lightweight, database-agnostic abstract layer (similar to an ORM) designed to give TypeScript developers a unified interface for data ingestion, embedding, and retrieval across multiple vector backends.

Because it is a modern, modular fork of `LlamaIndexTS`, it breaks database-specific drivers into their own scoping packages rather than bundling them into the main library. This keeps your application's bundle size minimal (only ~77.5kb) while allowing you to swap out or add different database providers dynamically.

## Supported Vector Databases

Instead of installing a single monolith, you install the core framework alongside separate **provider packages** depending on what your end users need. The ecosystem includes:

- **`@vectorstores/qdrant`**: For [Qdrant](https://qdrant.tech/) integrations.
- **`@vectorstores/pgvector`** (or inherited `PGVectorStore` adapters): For [pgvector](https://github.com/pgvector/pgvector) (PostgreSQL) setups.
- **`@vectorstores/core` (Built-in)**: Includes a `SimpleVectorStore` which handles basic in-memory caching and local disk persistence.
- **Other LlamaIndexTS-inherited stores**: Inherits structural support for backends like AstraDB, Chroma, Milvus, and MongoDB Atlas Vector Search.

## How the ORM-like Interface Works

When writing your TypeScript app code, you write your retrieval logic against generic components like `VectorStoreIndex`. To switch backends dynamically for an end user, you simply inject a different provider client instance into your storage context.

```typescript
import { Document, VectorStoreIndex } from "@vectorstores/core";
// Dynamically imported based on user settings:
import { QdrantVectorStore } from "@vectorstores/qdrant"; 

// 1. Initialize the specific backend chosen by the user
const customVectorStore = new QdrantVectorStore({
    url: process.env.USER_QDRANT_URL,
    apiKey: process.env.USER_QDRANT_API_KEY
});

// 2. The rest of your application code remains exactly the same
const index = await VectorStoreIndex.fromDocuments([document], {
    vectorStore: customVectorStore
});
```