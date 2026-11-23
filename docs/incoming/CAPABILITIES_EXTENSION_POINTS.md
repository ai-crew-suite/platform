# Capabilities Extension Points

```bash
plugins/
├── inference/  # Focus: Compute, Neural Weights, and Abstract Model Outputs
├── databases/  # Focus: Persistence, Table Schemas, Sharding, Disks, and Indices
├── vault/      # Focus: Cryptographic Ciphers, KMS Envelope Exchanges
└── tools/      # Focus: Functional System-Level Capabilities and Action Dispatches
```

We have a number of areas of functionality that are implemented in backstage backend plugins and organized by group. These are:
- `/tools` that provide capabilities for our user-facing agentic plugin groups (18 total, each with a frontend and backend plugin) to use to carry out there tasks. We have groups of capabilities like "cloud providers", "version control systems", "observability platforms", "communication platforms".
- `databases/capabilities` plugins that provide a tool registry for state synchronization and provide runtime immutability gates.
- `databases/runtime` storage plugins that provide agent runtime persistence for the AI Crew Suite. This module owns the durable state of the `AgentRuntime`: conversation sessions, resumable checkpoints, run lifecycle records and event logs, approval decisions, artifacts, and audit logs.
- `/vault` that acts as an encryption and decoding engine for orchestrator graph checkpoints. Before a sensitive snapshot of conversational state is written to the cold database (`CheckpointStore`), the engine calls `StateSerializer.serialize()`. If an enterprise supplies a high-security implementation (like an AWS KMS envelope serializer), it turns clear text context into opaque, encrypted ciphertext blocks (`Uint8Array`).

## Inference (LLMs)

### 🔍 Architectural Diagnostics of the Inference Subsystem

Analyzing your legacy `ChatModelsExtensionPoint`, definitions, and your AWS Bedrock example module reveals **three deep structural anomalies** that we must fix to support a unified, enterprise-grade `inference` package layout:

1. **The Vector Store/Tool Pollution Hole (The Blurry Boundary)**
   - **The Deficit:** Look at the legacy `aws-bedrock` module implementation. It instantiates database connections (`createPgVectorStore`), fetches the `CatalogClient`, sets up an embedder (`BedrockAugmenter`), and registers it as a *functional execution tool* inside the `tools` system (`tools.addTool`).
   - **The Reality:** That is an architectural leakage. Vector stores, vector ingestion lines, and chunking pipelines are **Database & Persistence Concerns**. Embedding models, LLMs, transcriptions, and guardrails are **Inference & Model Concerns**.
   - **The Greenfield Fix:** We must isolate the `inference` package so it acts purely as a stateless model gateway layer. The `inference/aws` module should focus *exclusively* on instantiating the LangChain `BaseChatModel` wrapper and registering it on the newly renamed extension point. It should not be touching database pools, vector stores, or tool registries.
2. **The `ai-providers` Naming Leak**
   - **The Deficit:** The extension point token is still explicitly bound to the legacy namespace identifier string: `id: 'ai-providers.chat-models'`.
   - **The Greenfield Fix:** To match your clean prefix-free file system layout (`plugins/inference/aws`), the extension point token must be updated to anchor on your modern, decoupled package token: `id: 'inference.models'`.
3. **Missing Uniform Model Execution Capabilities**
   - **The Deficit:** The system treats `ChatModelDefinition`, `TranscriptionDefinition`, and `GuardrailDefinition` as loose, independent configuration definitions. They lack a common registry container, forcing workflows to look up models directly from the backend configuration tree rather than querying an active registry.

### 🔍 Architectural Diagnostics of the Reranking Subsystem

```bash
# 🟩 THE ENTERPRISE COHESIVE PATTERN: Lean root, vendor-scoped packages
plugins/
└── inference/
    ├── aws/             # Mandates Chat Converse + Titan Embeddings + Guardrails in ONE module
    ├── cohere/          # Mandates Cohere Rerank models cleanly
    ├── openai/          # Mandates OpenAI Chat + Text Embeddings + Moderation models
    └── openrouter/      # Mandates OpenRouter orchestration matrices
```

Integrating the `RerankingExtensionPoint` and `RerankingDefinition` directly into our clean, prefix-free contracts layer highlights a final connection point between **Inference** and **Vector Storage**:

1. **Reranking as an Inference Concern**

   - **The Reality:** Much like embeddings, a reranker is a specialized model that processes textual inputs to return statistical scores (`rerank(input): Promise<{ id: string; score: number }[]>`). It does not own or modify databases, table schemas, or storage blocks.

   - **The Clean Alignment:** While it intercepts database data streams during retrieval, the *registration* of a reranking model belongs under the `inference` package ecosystem (e.g., `plugins/inference/cohere`). This prevents database plugins from pulling in heavy language model tokens.

2. **Updating the Extension Point Namespace**

   - **The Greenfield Fix:** To match your clean prefix-free folder architecture, the extension point token must be updated to drop `databases-vector` and anchor on your modern, decoupled model package string: `id: 'inference.reranking'`.

### 🧱 The Unified Inference Registry Extension Point

To establish a consistent, clean pattern across your `plugins/inference/aws`, `plugins/inference/openai`, and `plugins/inference/openrouter` modules, we will introduce a unified, multi-capability **Inference Registry** contract. This structure consolidates Chat Models, Transcription engines, and Guardrails under a single, shared architecture:

```typescript
// plugins/kernel/node/src/service/inference/contracts.ts
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

/**
 * Structural definition wrapping an instantiated LangChain Chat Model.
 * Legacy BaseLLM string-prompt models are strictly prohibited across the platform.
 */
export type ChatModelDefinition = {
  /** Unique model identifier used by agent profiles and configuration tiers (e.g., `gpt-4o`, `bedrock-sonnet`). */
  readonly id: string;
  /** Concrete instantiated LangChain chat model wrapper used for text generation. */
  readonly model: BaseChatModel;
};

/**
 * Structural definition wrapping an instantiated speech-to-text transcription engine.
 */
export type TranscriptionDefinition = {
  /** Unique provider identifier (e.g., `whisper-1`, `aws-transcribe`). */
  readonly id: string;
  /** Translates a raw binary audio array into a structured, plain-text summary payload. */
  transcribe(input: {
    readonly audio: Uint8Array;
    readonly mimeType?: string;
  }): Promise<{ readonly text: string }>;
};

/**
 * Structural definition wrapping an enterprise safety moderation classifier.
 * Provider-specific threshold variables live encapsulated inside the specific provider module.
 */
export type GuardrailDefinition = {
  /** Unique guardrail provider identifier (e.g., `llama-guard-3`, `bedrock-moderation`). */
  readonly id: string;
  /** Classifies incoming prompts or outbound egress text chunks to catch compliance violations. */
  classify(input: {
    readonly text: string;
    readonly direction: 'input' | 'output';
  }): Promise<{
    readonly verdict: 'safe' | 'unsafe';
    readonly categories?: readonly string[];
    readonly message?: string;
  }>;
};

/**
 * Unified extension point interface exposed to multi-package model adapters.
 * Replaces the monolithic 'ai-providers' extension point.
 */
export interface InferenceExtensionPoint {
  /** Registers a typesafe LangChain chat model wrapper into the platform runtime. */
  registerChatModel(definition: ChatModelDefinition): void;
  /** Registers a speech-to-text audio transcription provider. */
  registerTranscriptionProvider(definition: TranscriptionDefinition): void;
  /** Registers a strict input/output security compliance guardrail. */
  registerGuardrail(definition: GuardrailDefinition): void;
}

/**
 * Read-only registry interface queried by the central BaseGraphRunner workflows.
 */
export interface InferenceRegistry {
  getChatModel(id: string): ChatModelDefinition | undefined;
  getTranscriptionProvider(id: string): TranscriptionDefinition | undefined;
  getGuardrail(id: string): GuardrailDefinition | undefined;
  listChatModels(): readonly ChatModelDefinition[];
}
```

### 🧱 Hardened Core Contracts

```typescript
// plugins/kernel/node/src/types/inference/models.ts
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Embeddings } from '@langchain/core/embeddings';

/**
 * Structural definition wrapping an instantiated LangChain Chat Model wrapper.
 * Legacy BaseLLM string-prompt models are strictly prohibited across the platform.
 * 
 * @security FINRA/SOC-2 structural generation model compliance tracking.
 */
export type ChatModelDefinition = {
  /** 
   * Unique, non-empty model identifier used by agent definitions and tiers.
   * Matches configured targets (e.g., `bedrock-claude-3-5-sonnet`, `openai-gpt-4o`).
   */
  readonly id: string;
  
  /** 
   * Concrete instantiated LangChain chat model used natively for stateful graph text generation.
   */
  readonly model: BaseChatModel;
};

/**
 * Structural definition wrapping an enterprise safety moderation classifier.
 * Provider-specific threshold variables live encapsulated inside the specific provider module.
 */
export type GuardrailDefinition = {
  /** 
   * Unique, non-empty safety classifier identifier (e.g., `llama-guard-3`, `bedrock-guardrail`).
   */
  readonly id: string;
  
  /** 
   * Classifies incoming natural-language prompts or outbound model text chunks.
   * 
   * @param input - The textual context package accompanied by the active intercept direction.
   * @returns A structured verdict payload detailing the classification outcome.
   */
  classify(input: {
    readonly text: string;
    readonly direction: 'input' | 'output';
  }): Promise<{
    readonly verdict: 'safe' | 'unsafe';
    readonly categories?: readonly string[];
    readonly message?: string;
  }>;
};

/**
 * Structural definition mapping an instantiated embedding generation adapter.
 * Decoupled from active vector storage engines to enforce clean domain separation.
 */
export type EmbeddingsDefinition = {
  /** 
   * Unique text-embedding model identifier (e.g., `aws-titan-embed-v2`, `openai-text-3-large`).
   */
  readonly id: string;
  
  /** 
   * Concrete LangChain text embedding model adapter instance used for spatial document analysis.
   */
  readonly embeddings: Embeddings;
};

```

```typescript
// plugins/kernel/node/src/service/inference/reranking.ts

/**
 * Structural definition mapping an instantiated retrieval reranking provider engine.
 */
export type RerankingDefinition = {
  /** Unique provider model identifier (e.g., `cohere-rerank-v3`, `bge-reranker-large`). */
  readonly id: string;
  
  /**
   * Refines raw similarity search chunk arrays based on context query semantic alignment.
   * Forces V8 to compute linear score transformations without mutating source parameters.
   */
  rerank(input: {
    readonly query: string;
    readonly documents: readonly { readonly id: string; readonly text: string }[];
  }): Promise<readonly { readonly id: string; readonly score: number }[]>;
};

/**
 * Read-only registry interface queried by the central BaseGraphRunner retrieval loops.
 */
export interface RerankingRegistry {
  /** Resolves a single unique reranking provider engine cleanly by its identity token. */
  get(id: string): RerankingDefinition | undefined;
}
```

### 🔩 Defining the Global Extension Point Token

Declare the new prefix-free Backstage extension point token within your central node library module:

```typescript
// plugins/kernel/node/src/service/inference/extensionPoints.ts
import { createExtensionPoint } from '@backstage/backend-plugin-api';
import { 
  ChatModelsExtensionPoint, 
  GuardrailsExtensionPoint, 
  EmbeddingsExtensionPoint,
  RerankingExtensionPoint 
} from './contracts';

/**
 * Backstage Extension Point token enabling modular inference providers to 
 * register text generation models.
 */
export const chatModelsExtensionPoint = createExtensionPoint<ChatModelsExtensionPoint>({
  id: 'inference.chat-models',
});

/**
 * Backstage Extension Point token enabling modular inference providers to 
 * register input/output compliance guardrails.
 */
export const guardrailsExtensionPoint = createExtensionPoint<GuardrailsExtensionPoint>({
  id: 'inference.guardrails',
});

/**
 * Backstage Extension Point token enabling modular inference providers to 
 * register spatial text embedding models.
 */
export const embeddingsExtensionPoint = createExtensionPoint<EmbeddingsExtensionPoint>({
  id: 'inference.embeddings',
});

/**
 * Backstage Extension Point token enabling modular relevance-ranking engines 
 * to optimize context chunk ordering.
 */
export const rerankingExtensionPoint = createExtensionPoint<RerankingExtensionPoint>({
  id: 'inference.reranking',
});
```

```typescript
// plugins/kernel/node/src/service/inference/contracts.ts
import { 
  ChatModelDefinition, 
  GuardrailDefinition, 
  EmbeddingsDefinition 
} from '../../types/inference/models';
import { RerankingDefinition } from './reranking';

/**
 * Separate, granular extension points enabling independent inference modules 
 * to register only the specific model capabilities they support.
 * 
 * Grouped completely within the service namespace for boot-time lifecycle hooks.
 */
export interface ChatModelsExtensionPoint {
  registerChatModel(definition: ChatModelDefinition): void;
}

export interface GuardrailsExtensionPoint {
  registerGuardrail(definition: GuardrailDefinition): void;
}

export interface EmbeddingsExtensionPoint {
  registerEmbeddings(definition: EmbeddingsDefinition): void;
}

export interface RerankingExtensionPoint {
  registerReranker(definition: RerankingDefinition): void;
}

/**
 * Comprehensive read-only registry interface queried by the central BaseGraphRunner workflows.
 */
export interface InferenceRegistry {
  getChatModel(id: string): ChatModelDefinition | undefined;
  getGuardrail(id: string): GuardrailDefinition | undefined;
  getEmbeddingsProvider(id: string): EmbeddingsDefinition | undefined;
  getReranker(id: string): RerankingDefinition | undefined;
}
```

### 🎨 The Cleaned-Up, Hardened Provider Module Pattern

With this architecture in place, see how remarkably clean, focused, and single-purpose your `plugins/inference/aws` backend module becomes. It sheds all database setups, catalog clients, and tool registration loops, focusing purely on loading the models it owns:

```typescript
// plugins/inference/aws-bedrock/src/module.ts
import { createBackendModule } from '@backstage/backend-plugin-api';
import { BedrockChatModel, BedrockEmbeddingsModel, BedrockGuardrailModel } from './models';
import { 
  chatModelsExtensionPoint, 
  embeddingsExtensionPoint, 
  guardrailsExtensionPoint 
} from '@ai-crew-suite/plugin-kernel-node';

export const inferenceModuleAwsBedrock = createBackendModule({
  pluginId: 'inference',
  moduleId: 'aws-bedrock',
  register(env) {
    env.registerInit({
      deps: {
        chatModels: chatModelsExtensionPoint,
        embeddings: embeddingsExtensionPoint,
        guardrails: guardrailsExtensionPoint,
      },
      async init({ chatModels, embeddings, guardrails }) {
        // 1. Register the generation model
        chatModels.registerChatModel({
          id: 'bedrock-claude-3-5-sonnet',
          model: new BedrockChatModel(),
        });

        // 2. Register the stateless text embedding model
        embeddings.registerEmbeddings({
          id: 'bedrock-titan-embed',
          embeddings: new BedrockEmbeddingsModel(),
        });

        // 3. Register the safety moderation guardrail
        guardrails.registerGuardrail({
          id: 'bedrock-safety-guard',
          classify: async (input) => new BedrockGuardrailModel().execute(input),
        });
      },
    });
  },
});
```

Why this design achieves a successful refactor:

- **Eradicates Circular Dependency and Leakage risks:** Database client pools stay inside a dedicated database module, tool definitions stay inside your tool engines, and the `inference` package is completely insulated as a stateless model loader.
- **Simplifies Workflow Consumption:** Your `BaseGraphRunner` code files can now take the unified `InferenceRegistry` as a constructor dependency and query models or call guardrails uniformly (`this.inferenceRegistry.getGuardrail(...)`), keeping the execution loop completely robust.

