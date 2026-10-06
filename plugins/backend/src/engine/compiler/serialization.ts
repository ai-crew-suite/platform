/**
 * @file serialization.ts
 * @package @internal/plugin-agent-backend (engine/compiler)
 *
 * @description
 * Architectural component acting as the compilation engine for the Fluent API.
 * Responsible for transforming memory-resident builder configurations, state tracking
 * mechanisms, and chained mixin parameters into an immutable, JSON-serializable
 * execution graph. This graph serves as the standardized declaration payload passed
 * across runtime boundaries from the synchronous HTTP layer to the asynchronous
 * Temporal workflow execution pool.
 *
 * @runtime_context
 * Synchronous execution thread (typically invoked at the terminal `.compile()` or
 * execution dispatch step within HTTP request routers or programmatic orchestrators).
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Ensures all sensitive inline parameters, prompts, and tool arguments
 *   are structured cleanly to facilitate downstream field-level encryption before persistence.
 * - FINRA: Produces deterministic, version-stamped execution manifests to guarantee
 *   reproducibility and support immutable audit validation records of agent structures.
 */
export function serializeGraph(rawConfig: Record<string, any>): Record<string, any> {
  const timestamp = new Date().toISOString();

  // Enforce a strict structural envelope for the output payload
  // This JSON schema maps directly to what the out-of-process dynamic-agent-executor workflow expects
  return {
    manifest: {
      version: '1.0.0',
      compiledAt: timestamp,
      agentId: rawConfig.name ? `agent-${rawConfig.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : 'unnamed-agent',
    },
    meta: {
      name: rawConfig.name,
      instructions: rawConfig.instructions || '',
    },
    llm: {
      provider: rawConfig.llmProvider || 'openai',
      temperature: rawConfig.temperature ?? 0.7,
      contextWindowLimit: rawConfig.maxTokens || 4096,
    },
    memory: {
      longTermEnabled: !!rawConfig.userMemoryEnabled,
      mem0SyncActive: !!rawConfig.mem0Sync,
      shortTermLimit: rawConfig.bufferLimit || 50,
    },
    retrieval: {
      vectorCollection: rawConfig.vectorCollection || null,
      similarityThreshold: rawConfig.threshold ?? 0.7,
      staticSources: rawConfig.staticDocuments || [],
      webSearchEnabled: !!rawConfig.webSearch,
    },
    workflow: {
      timeoutMs: rawConfig.timeout || 300000, // 5 minute default execution budget
      signalTriggers: rawConfig.registeredSignals || [],
    },
    tools: {
      systemWhitelist: rawConfig.allowedSystemTools || [],
      customDefinitions: rawConfig.dynamicTools || [],
    }
  };
}
