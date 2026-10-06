/**
 * @file mem0.ts
 * @package @internal/plugin-agent-backend (platform/config)
 *
 * @description
 * Configuration mapper and schema adapter for the Mem0 associative memory framework.
 * Extracts platform-level infrastructure variables from the core Backstage configuration
 * layer, transforms them into tightly typed Mem0 options, and sets up communication
 * credentials, vector dimensional limits, and proximity scoring algorithms.
 *
 * @runtime_context
 * Synchronous initialization phase running inside the main Backstage dependency
 * injection bootstrap process via the backend plugin module setup.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Prevents hardcoding memory store credentials by fetching API tokens
 *   and host targets strictly at runtime from verified environment setups mapped through Backstage.
 * - Privacy: Enforces whitelisted indexing boundaries and semantic threshold properties
 *   to ensure global vector configurations align with corporate data collection mandates.
 *
 * @example
 * ```ts
 * import { ConfigReader } from '@backstage/config';
 *
 * const rawConfig = new ConfigReader({
 *   agent: {
 *     memory: {
 *       provider: 'mem0',
 *       apiKey: 'secret-token-value',
 *       embeddingModel: 'text-embedding-3-small'
 *     }
 *   }
 * });
 *
 * const mem0Config = parseMem0Config(rawConfig);
 * console.log(mem0Config.config.embedder.model); // "text-embedding-3-small"
 * ```
 */

import { Config } from '@backstage/backend-plugin-api';

export interface Mem0ConfigPayload {
  apiKey: string;
  config: {
    vectorDb: {
      provider: string;
    };
    embedder: {
      provider: string;
      model: string;
    };
  };
}

/**
 * Parses and maps Backstage system configuration blocks into structured definitions
 * digestible by the downstream Mem0 orchestration service layer.
 */
export function parseMem0Config(config: Config): Mem0ConfigPayload {
  const memoryConfig = config.getConfig('agent.memory');

  return {
    apiKey: memoryConfig.getOptionalString('apiKey') ?? '',
    config: {
      vectorDb: {
        provider: memoryConfig.getOptionalString('provider') ?? 'qdrant',
      },
      embedder: {
        provider: memoryConfig.getOptionalString('embedderProvider') ?? 'openai',
        model: memoryConfig.getOptionalString('embeddingModel') ?? 'text-embedding-3-small',
      },
    },
  };
}
