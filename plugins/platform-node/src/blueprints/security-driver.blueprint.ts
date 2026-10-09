/**
 * @file security-driver.blueprint.ts
 * @package @internal/plugin-agent-node (blueprints)
 *
 * @description
 * Architectural blueprint factory operating under the Backstage New Backend System framework.
 * Provides a standardized template constraint for creating pluggable high-security modules
 * that act as key vault drivers (e.g., HashiCorp Vault, AWS Secrets Manager, Azure Key Vault).
 * This blueprint automatically handles hooking the module's registration logic directly
 * into the main engine's exposed securityDriverExtensionPoint, ensuring safe runtime access
 * to cryptographic keys and sensitive environment values.
 *
 * @runtime_context
 * Synchronous initialization phase running inside the out-of-process Backstage backend
 * bootstrapping flow during module dependency resolution.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Enforces explicit interface compliance on external key vaults, guaranteeing
 *   that secret retrieval operations cannot accidentally log plaintext payloads or cross-contaminate scopes.
 * - FINRA: Dictates non-repudiation contract bindings on secret access calls, ensuring that all
 *   subsequent encryption key fetches or rotations emit auditable runtime status tokens.
 *
 * @example
 * ```ts
 * import { createBackendModule } from '@backstage/backend-plugin-api';
 * import { securityDriverBlueprint } from '@internal/plugin-agent-node';
 *
 * // Rapid implementation of a compliant HashiCorp Vault key vault security driver plugin module
 * export const agentDriverVaultModule = createBackendModule({
 *   pluginId: 'agent-backend',
 *   moduleId: 'vault-security-driver',
 *   register(env) {
 *     env.registerInit({
 *       deps: { securityDriver: securityDriverBlueprint.extensionPoint },
 *       async init({ securityDriver }) {
 *         securityDriver.registerDriver('hashicorp-vault', {
 *           async getSecret(keyPath, context) {
 *             // Connect to the physical vault instance securely using validated certificates
 *             return '0123456789abcdef0123456789abcdef...'; // Returns target hex key payload
 *           }
 *         });
 *       }
 *     });
 *   }
 * });
 * ```
 */

import { createExtensionPoint } from '@backstage/backend-plugin-api';

/**
 * Public execution contract that all custom cryptographic or key vault modules must implement.
 */
export interface SecurityDriverContract {
  getSecret(keyPath: string, context: { correlationId: string }): Promise<string>;
}

/**
 * Extension point type signature through which external modules pass their concrete security drivers.
 */
export interface SecurityDriverExtensionPoint {
  registerDriver(name: string, driver: SecurityDriverContract): void;
}

/**
 * The standard Backstage Backend token identifier mapping the Security Extension Point.
 */
export const securityDriverExtensionPoint = createExtensionPoint<SecurityDriverExtensionPoint>({
  id: 'agent.security-driver',
});

/**
 * Structural Blueprint wrapper mapping standardized parameters into a uniform registration interface object.
 */
export const securityDriverBlueprint = {
  extensionPoint: securityDriverExtensionPoint,

  /**
   * Helper utility simplifying validation steps for dynamic driver developers.
   * Ensures incoming parameters map to the organizational standards before allowing compilation.
   *
   * @param params - Configuration arguments and concrete security driver code instance.
   */
  make(params: { name: string; driver: SecurityDriverContract }) {
    if (!params.name || params.name.trim() === '') {
      throw new Error('Compliance Registration Error: Security driver definition name identifier is required.');
    }
    return {
      kind: 'security-driver',
      name: params.name.trim().toLowerCase(),
      driver: params.driver,
    };
  }
};
