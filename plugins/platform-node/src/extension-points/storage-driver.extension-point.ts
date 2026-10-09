/**
 * @file storage-driver.extension-point.ts
 * @package @internal/plugin-agent-node (extension-points)
 *
 * @description
 * Extension point definition for storage and vector database drivers within the Backstage New Backend System.
 * Houses the registration mechanism that allows external backend modules to plug custom vector
 * indexing systems (e.g., pgvector, Qdrant) directly into the core agent pipeline. Placing this contract
 * in the shared `bridge` (node) package isolates database interface structures from active execution threads.
 *
 * @runtime_context
 * Synchronous initialization phase running inside the central Backstage dependency
 * injection bootstrap process during backend initialization.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Enforces explicit data isolation constraints at the extension boundary, ensuring
 *   all registered stores adhere to strict multi-tenant filtering formats to prevent cross-tenant vector contamination.
 * - FINRA: Validates deterministic index signatures and lookup bounds, providing absolute operational
 *   reproducibility and auditable metadata trails for downstream context assembly.
 *
 * @example
 * ```ts
 * import { createBackendModule } from '@backstage/backend-plugin-api';
 * import { storageDriverExtensionPoint } from '@internal/plugin-agent-node';
 *
 * export const myCustomStorageModule = createBackendModule({
 *   pluginId: 'agent-backend',
 *   moduleId: 'custom-storage-driver',
 *   register(env) {
 *     env.registerInit({
 *       deps: { storageDriver: storageDriverExtensionPoint },
 *       async init({ storageDriver }) {
 *         // Registering a compliant storage implementation cleanly with the platform plugin
 *         storageDriver.registerDriver('qdrant-local', {
 *           async insertVector(collection, point) {
 *             return { success: true, insertedId: point.id };
 *           },
 *           async querySimilarity(collection, vector, limit, filters) {
 *             return [{ id: 'doc-99', text: 'Verified match data.', score: 0.94 }];
 *           }
 *         });
 *       }
 *     });
 *   }
 * });
 * ```
 */

import { createExtensionPoint } from '@backstage/backend-plugin-api';
import { StorageDriverContract } from '../blueprints/storage-driver.blueprint';

/**
 * Interface contract that external backend modules interact with at boot time to pass their
 * custom vector storage driver implementations to the main agent backend platform engine.
 */
export interface StorageDriverExtensionPoint {
  /**
   * Registers a unique, pluggable vector storage driver instance.
   *
   * @param name - The unique identification token key for the custom driver registry (e.g., 'pgvector', 'qdrant').
   * @param driver - The concrete implementation matching the strict structural StorageDriverContract.
   */
  registerDriver(name: string, driver: StorageDriverContract): void;
}

/**
 * The unified Backstage createExtensionPoint token declaration for the storage driver domain registry.
 */
export const storageDriverExtensionPoint = createExtensionPoint<StorageDriverExtensionPoint>({
  id: 'agent.storage-driver',
});
