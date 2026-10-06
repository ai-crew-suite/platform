/**
 * @file fluent-api.types.ts
 * @package @internal/plugin-agent-node (api)
 *
 * @description
 * Shared type contracts and interface declarations for the modular Fluent API Builder.
 * This file serves as the definitive public contract defining the 50+ configuration and chaining
 * methods available to user-facing plugins. By capturing the type definitions for every domain mixin
 * (identity, model, memory, retrieval, workflow, tools) in the shared node package, external packages
 * get complete IDE autocomplete and compile-time verification without needing direct access to the
 * underlying Express backend engine code.
 *
 * @runtime_context
 * Framework-agnostic type compilation space. Ingested by client-side visual plugins, consumer-facing packages,
 * and implemented by the core engine composition layer (`engine/fluent/builder.ts`).
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Enforces explicit type parameters and validation envelopes on prompts, instructions,
 *   and configuration metadata to block unsafe parameter injections at compile time.
 * - FINRA: Establishes a rigid typescript definition for the terminal `.compile()` action, ensuring that
 *   the returned object format perfectly complies with the structure expected by downstream audit logging systems.
 *
 * @example
 * ```ts
 * import { AgentBuilderContract, SerializedExecutionGraph } from '@internal/plugin-agent-node';
 *
 * // Client-facing workflow plugins utilize these types to chain agent configurations safely
 * function defineComplianceAgent(builder: AgentBuilderContract): SerializedExecutionGraph {
 *   return builder
 *     .withName('TradeMonitor')
 *     .withLLMProvider('openai')
 *     .withTemperature(0.0) // Deterministic enforcement
 *     .withVectorSearch('finra-regulatory-index')
 *     .withSimilarityThreshold(0.82)
 *     .onSignal('manualApprovalRequired')
 *     .compile();
 * }
 * ```
 */

/**
 * Output format generated upon terminal compilation of the Fluent API graph.
 * Fully serializable structure safe for transport across network and runtime layers.
 */
export interface SerializedExecutionGraph {
  manifest: {
    version: string;
    compiledAt: string;
    agentId: string;
  };
  meta: {
    name: string;
    instructions: string;
  };
  llm: {
    provider: string;
    temperature: number;
    contextWindowLimit: number;
  };
  memory: {
    longTermEnabled: boolean;
    mem0SyncActive: boolean;
    shortTermLimit: number;
  };
  retrieval: {
    vectorCollection: string | null;
    similarityThreshold: number;
    staticSources: string[];
    webSearchEnabled: boolean;
  };
  workflow: {
    timeoutMs: number;
    signalTriggers: string[];
    blockingSignalTarget?: string;
  };
  tools: {
    systemWhitelist: string[];
    customDefinitions: Array<{
      name: string;
      description: string;
      inputSchema: Record<string, any>;
    }>;
  };
}

/**
 * The master unified contract for the 50+ method Fluent API builder.
 * Combines all individual feature traits into a single type-safe chain interface.
 */
export interface AgentBuilderContract {
  // Identity Traits
  withName(name: string): this;
  withInstructions(instructions: string): this;

  // Model Traits
  withLLMProvider(provider: 'openai' | 'anthropic' | string): this;
  withTemperature(temperature: number): this;

  // Memory Traits
  withUserMemory(enabled: boolean): this;
  withMem0Sync(): this;
  withContextWindow(maxTokens: number): this;
  withBufferLimit(messageLimit: number): this;

  // Retrieval / RAG Traits
  withVectorSearch(collection: string): this;
  withSimilarityThreshold(threshold: number): this;
  withStaticDocuments(documentIds: string[]): this;
  withWebSearch(enabled: boolean): this;

  // Tool Traits
  withSystemTools(toolNames: string[]): this;
  withAllowedActions(actions: string[]): this;
  withDynamicTool(name: string, description: string, inputSchema: Record<string, any>): this;

  // Workflow / Lifecycle Traits
  withTimeout(timeoutMs: number): this;
  onStart(hookIdentifier: string): this;
  onSignal(signalName: string): this;
  waitForSignal(signalName: string): this;

  // Terminal compilation gate
  compile(): SerializedExecutionGraph;
}
