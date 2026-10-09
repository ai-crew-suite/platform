/**
 * @file platform-driver.extension-point.ts
 * @package @internal/plugin-agent-node (extension-points)
 *
 * @description
 * Extension point definition for platform drivers within the Backstage New Backend System.
 * Houses the registration mechanism that allows external module packages to register concrete,
 * enterprise-level system drivers (e.g., Jira connectors, VCS integrations) with the central agent
 * orchestration engine during application initialization. By placing this interface contract inside
 * the shared `bridge` (node) package, cross-plugin registration is decoupled from the runtime execution engine.
 *
 * @runtime_context
 * Synchronous initialization phase running inside the central Backstage dependency
 * injection bootstrap process during backend initialization.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Validates the contract surface of external system integrations before they are
 *   bound to worker tasks, ensuring clear containment of administrative side-effects.
 * - FINRA: Requires full component isolation and explicit provider string matching to preserve complete
 *   data-lineage and operational audit trail logs.
 *
 * @example
 * ```ts
 * import { createBackendModule } from '@backstage/backend-plugin-api';
 * import { platformDriverExtensionPoint } from '@internal/plugin-agent-node';
 *
 * export const myCustomDriverModule = createBackendModule({
 *   pluginId: 'agent-backend',
 *   moduleId: 'custom-platform-driver',
 *   register(env) {
 *     env.registerInit({
 *       deps: { platformDriver: platformDriverExtensionPoint },
 *       async init({ platformDriver }) {
 *         // Registering a custom system utility driver safely with the platform plugin
 *         platformDriver.registerDriver('jira-service', {
 *           async triggerExecution(action, payload) {
 *             return { ticketCreated: true, id: 'JIRA-101' };
 *           }
 *         });
 *       }
 *     });
 *   }
 * });
 * ```
 */

import { createExtensionPoint } from '@backstage/backend-plugin-api';
import { PlatformDriverContract } from '../blueprints/platform-driver.blueprint';

/**
 * Interface contract that external backend modules interact with at boot time to pass their
 * custom system driver implementations to the main agent backend platform engine.
 */
export interface PlatformDriverExtensionPoint {
  /**
   * Registers a unique, pluggable platform driver instance.
   *
   * @param name - The unique identification token key for the custom driver registry (e.g., 'github', 'jira').
   * @param driver - The concrete implementation matching the strict structural PlatformDriverContract.
   */
  registerDriver(name: string, driver: PlatformDriverContract): void;
}

/**
 * The unified Backstage createExtensionPoint token declaration for the platform driver domain registry.
 */
export const platformDriverExtensionPoint = createExtensionPoint<PlatformDriverExtensionPoint>({
  id: 'agent.platform-driver',
});
