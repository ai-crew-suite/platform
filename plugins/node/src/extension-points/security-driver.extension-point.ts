/**
 * @file security-driver.extension-point.ts
 * @package @internal/plugin-agent-node (extension-points)
 *
 * @description
 * Extension point definition for security and key vault drivers within the Backstage New Backend System.
 * Houses the registration mechanism that allows high-security backend modules to inject custom
 * cryptographic key management infrastructure (e.g., dynamic vault drivers, secret managers) into the central
 * agent core. Placing this contract in the shared `bridge` (node) package isolates cryptographic
 * definitions from active workflow runtime implementations.
 *
 * @runtime_context
 * Synchronous initialization phase running inside the central Backstage dependency
 * injection bootstrap process during backend initialization.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Restricts operational risk by verifying that any pluggable secret store conforms to
 *   isolated interface parameters before it is authorized to provide sensitive environmental keys at runtime.
 * - FINRA: Establishes a zero-trust provider lookup layout to capture access auditing tracking tokens
 *   whenever external encryption keys are requested or rotated.
 *
 * @example
 * ```ts
 * import { createBackendModule } from '@backstage/backend-plugin-api';
 * import { securityDriverExtensionPoint } from '@internal/plugin-agent-node';
 *
 * export const myCustomSecurityModule = createBackendModule({
 *   pluginId: 'agent-backend',
 *   moduleId: 'custom-security-driver',
 *   register(env) {
 *     env.registerInit({
 *       deps: { securityDriver: securityDriverExtensionPoint },
 *       async init({ securityDriver }) {
 *         // Registering a secure key vault implementation cleanly with the platform plugin
 *         securityDriver.registerDriver('aws-secrets-manager', {
 *           async getSecret(keyPath, context) {
 *             return '0123456789abcdef0123456789abcdef...'; // Returns active key
 *           }
 *         });
 *       }
 *     });
 *   }
 * });
 * ```
 */

import { createExtensionPoint } from '@backstage/backend-plugin-api';
import { SecurityDriverContract } from '../blueprints/security-driver.blueprint';

/**
 * Interface contract that external backend modules interact with at boot time to pass their
 * custom cryptographic security driver implementations to the main agent backend platform engine.
 */
export interface SecurityDriverExtensionPoint {
  /**
   * Registers a unique, pluggable security driver instance.
   *
   * @param name - The unique identification token key for the custom driver registry (e.g., 'hashicorp-vault', 'aws-secrets-manager').
   * @param driver - The concrete implementation matching the strict structural SecurityDriverContract.
   */
  registerDriver(name: string, driver: SecurityDriverContract): void;
}

/**
 * The unified Backstage createExtensionPoint token declaration for the security driver domain registry.
 */
export const securityDriverExtensionPoint = createExtensionPoint<SecurityDriverExtensionPoint>({
  id: 'agent.security-driver',
});
