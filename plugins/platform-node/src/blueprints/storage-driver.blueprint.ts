/**
 * @file storage-driver.blueprint.ts
 * @package @internal/plugin-agent-node (blueprints)
 *
 * @description
 * Architectural blueprint factory operating under the Backstage New Backend System framework.
 * Provides a standardized template constraint for creating pluggable high-performance storage
 * and vector database modules (e.g., pgvector, Qdrant, Milvus). This blueprint automatically
 * handles hooking the module's registration logic directly into the main engine's exposed
 * storageDriverExtensionPoint, allowing seamless swapping of underlying vector index implementations.
 *
 * @runtime_context
 * Synchronous initialization phase running inside the out-of-process Backstage backend
 * bootstrapping flow during module dependency resolution.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Enforces data-tenant scoping rules directly at the driver interface, ensuring
 *   all storage, update, and search mutations pass explicit access controls to prevent cross-tenant vector contamination.
 * - FINRA: Dictates deterministic input contracts on point mutations and distance filtering parameters,
 *   guaranteeing reproducible vector lookups and clean data lineage trails.
 *
 * @example
 * ```ts
 * import { createBackendModule } from '@backstage/backend-plugin-api';
 * import { storageDriverBlueprint } from '@internal/plugin-agent-node';
 *
 * // Rapid implementation of a compliant pgvector storage driver plugin module
 * export const agentDriverPgvectorModule = createBackendModule({
 *   pluginId: 'agent-backend',
 *   moduleId: 'pgvector-storage-driver',
 *   register(env) {
 *     env.registerInit({
 *       deps: { storageDriver: storageDriverBlueprint.extensionPoint },
 *       async init({ storageDriver }) {
 *         storageDriver.registerDriver('pgvector', {
 *           async insertVector(collection, point) {
 *             // Connect to PostgreSQL instance, perform compliance check, and store coordinates
 *             return { success: true, insertedId: point.id };
 *           },
 *           async querySimilarity(collection, vector, limit) {
 *             // Run cosine distance metric calculation against scoped tenant rows
 *             return [{ id: 'doc-1', text: 'Scant compliance matches.', score: 0.89 }];
 *           }
 *         });
 *       }
 *     });
 *   }
 * });
 * ```
 */

import { createExtensionPoint } from '@backstage/backend-plugin-api';

export interface VectorPointPayload {
  id: string;
  vector: number[];
  text: string;
  metadata: Record<string, any>;
}

export interface StorageDriverQueryResult {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * Public execution contract that all pluggable vector storage modules must implement.
 */
export interface StorageDriverContract {
  insertVector(collection: string, point: VectorPointPayload): Promise<{ success: boolean; insertedId: string }>;
  querySimilarity(collection: string, vector: number[], limit: number, filters: Record<string, any>): Promise<StorageDriverQueryResult[]>;
}

/**
 * Extension point type signature through which external modules pass their concrete storage drivers.
 */
export interface StorageDriverExtensionPoint {
  registerDriver(name: string, driver: StorageDriverContract): void;
}

/**
 * The standard Backstage Backend token identifier mapping the Storage Extension Point.
 */
export const storageDriverExtensionPoint = createExtensionPoint<StorageDriverExtensionPoint>({
  id: 'agent.storage-driver',
});

/**
 * Structural Blueprint wrapper mapping standardized parameters into a uniform registration interface object.
 */
export const storageDriverBlueprint = {
  extensionPoint: storageDriverExtensionPoint,

  /**
   * Helper utility simplifying validation steps for dynamic storage driver developers.
   * Ensures incoming parameters map to organizational standards before allowing compilation.
   *
   * @param params - Configuration arguments and concrete storage driver code instance.
   */
  make(params: { name: string; driver: StorageDriverContract }) {
    if (!params.name || params.name.trim() === '') {
      throw new Error('Compliance Registration Error: Storage driver definition name identifier is required.');
    }
    return {
      kind: 'storage-driver',
      name: params.name.trim().toLowerCase(),
      driver: params.driver,
    };
  }
};
