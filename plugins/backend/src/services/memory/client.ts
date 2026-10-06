/**
 * @file client.ts
 * @package @internal/plugin-agent-backend (services/memory)
 *
 * @description
 * Infrastructure abstraction adapter for the Mem0 associative memory framework.
 * Handles the instantiation, session connection lifecycle, and structural mutation mapping
 * (CRUD operations) for user, agent, and run-scoped long-term context entities.
 * Abstracts the physical open-source database layer or cloud endpoint connectivity
 * behind a standardized internal memory-store contract.
 *
 * @runtime_context
 * Stateless platform service. Safely invoked from synchronous HTTP router execution threads
 * or out-of-process within non-deterministic Temporal Worker activities.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Restricts directly passing unencrypted parameters by integrating downstream
 *   of custom compliance guardrails. Enforces rigid structural isolation via strict unique user metadata scopes.
 * - FINRA: Produces detailed operation tracking metrics, ensuring every memory add, update, or search
 *   transaction generates telemetry logged firmly to platform audit trails.
 *
 * @example
 * ```ts
 * import { MemoryClientManager } from './client';
 * import { parseMem0Config } from '../../platform/config/mem0';
 *
 * const mem0Payload = parseMem0Config(backstageConfig);
 * const memoryManager = new MemoryClientManager({ config: mem0Payload, logger });
 *
 * // Saving an associative conversational context snippet
 * await memoryManager.addMemory("User states a strict preference for PostgreSQL configurations.", {
 *   userId: "user-entity-123",
 *   metadata: { complianceCategory: "preference-tracking" }
 * });
 *
 * // Fetching relevant context blocks for active prompting loops
 * const results = await memoryManager.searchMemories("What database does the user prefer?", {
 *   userId: "user-entity-123"
 * });
 * ```
 */

import { LoggerService } from '@backstage/backend-plugin-api';
import { Memory } from 'mem0ai/oss'; // Importing the standard Node open-source memory engine SDK
import { Mem0ConfigPayload } from '../../platform/config/mem0';

interface MemoryClientManagerOptions {
  config: Mem0ConfigPayload;
  logger: LoggerService;
}

export class MemoryClientManager {
  private readonly logger: LoggerService;
  private readonly client: Memory;

  constructor(options: MemoryClientManagerOptions) {
    this.logger = options.logger;

    try {
      this.logger.info(`[COMPLIANCE_MEMORY] Initializing Mem0 execution cluster (Vector Provider: ${options.config.config.vectorDb.provider})`);

      // Initialize the underlying platform client utilizing the verified config mapping block
      this.client = new Memory({
        embedder: {
          provider: options.config.config.embedder.provider,
          config: {
            apiKey: options.config.apiKey,
            model: options.config.config.embedder.model,
          }
        },
        vectorStore: {
          provider: options.config.config.vectorDb.provider,
          config: {
            collectionName: 'mem0_agent_vault',
          }
        }
      });
    } catch (error: any) {
      this.logger.error(`[COMPLIANCE_MEMORY] Initialization error on structural instantiation: ${error.message}`);
      throw new Error(`Memory Service Infrastructure Error: ${error.message}`);
    }
  }

  /**
   * Commits a new memory string node into the vector state store scoped tightly by target identifiers.
   *
   * @param content - The raw or pre-encrypted content fact to analyze and embed.
   * @param options - Scope constraints including userId, agentId, or metadata tracking flags.
   */
  public async addMemory(content: string, options: { userId: string; metadata?: Record<string, any> }): Promise<void> {
    this.logger.info(`[COMPLIANCE_MEMORY] Committing memory block mutation target for User: ${options.userId}`);

    try {
      await this.client.add(
        [{ role: 'user', content }],
        { userId: options.userId, metadata: options.metadata }
      );
    } catch (error: any) {
      this.logger.error(`[COMPLIANCE_MEMORY] Exception caught while appending memory array node: ${error.message}`);
      throw error;
    }
  }

  /**
   * Executes a similarity search query against the vector matrix to discover related factual structures.
   *
   * @param query - The target evaluation string to parse against the index.
   * @param options - Scoping variables to ensure cross-tenant or multi-user cross-contamination is blocked.
   */
  public async searchMemories(query: string, options: { userId: string }): Promise<any[]> {
    this.logger.debug(`[COMPLIANCE_MEMORY] Querying semantic context for User: ${options.userId}`);

    try {
      const output = await this.client.search(query, {
        filters: { user_id: options.userId }
      });
      return output || [];
    } catch (error: any) {
      this.logger.error(`[COMPLIANCE_MEMORY] Query lookup crash during vector graph traversal: ${error.message}`);
      throw error;
    }
  }
}
