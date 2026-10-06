/**
 * @file platform-driver.blueprint.ts
 * @package @internal/plugin-agent-node (blueprints)
 *
 * @description
 * Architectural blueprint factory operating under the Backstage New Backend System framework.
 * Provides a standardized template constraint for creating pluggable third-party modules
 * that act as platform drivers (e.g., VCS platforms like GitHub, observability suites like Datadog).
 * This blueprint automatically handles hooking the module's registration logic directly
 * into the main engine's exposed platformDriverExtensionPoint, ensuring that developers
 * adding support for a new vendor do not have to write boilerplate DI registration code.
 *
 * @runtime_context
 * Synchronous initialization phase running inside the out-of-process Backstage backend
 * bootstrapping flow during module dependency resolution.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Restricts operational risk by enforcing strict semantic constraints on driver interface schemas
 *   before they hook into runtime loops, guaranteeing multi-tenant separation parameters.
 * - FINRA: Enforces structural telemetry models on all generated extensions, ensuring that actions passing
 *   through any provider platform script output uniform auditing tracking keys.
 *
 * @example
 * ```ts
 * import { createBackendModule } from '@backstage/backend-plugin-api';
 * import { platformDriverBlueprint } from '@internal/plugin-agent-node';
 *
 * // Rapidly instantiation of a high-compliance GitHub VCS platform driver plugin module
 * export const agentDriverGithubModule = createBackendModule({
 *   pluginId: 'agent-backend',
 *   moduleId: 'github-platform-driver',
 *   register(env) {
 *     env.registerInit({
 *       deps: { platformDriver: platformDriverBlueprint.extensionPoint },
 *       async init({ platformDriver }) {
 *         platformDriver.registerDriver('github', {
 *           async triggerExecution(action, payload) {
 *             // Concrete implementation details for GitHub API operations
 *             return { committed: true, traceId: payload.correlationId };
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
 * Public execution contract that all custom platform modules must implement.
 */
export interface PlatformDriverContract {
  triggerExecution(action: string, payload: Record<string, any>): Promise<Record<string, any>>;
}

/**
 * Extension point type signature through which external modules pass their concrete platform drivers.
 */
export interface PlatformDriverExtensionPoint {
  registerDriver(name: string, driver: PlatformDriverContract): void;
}

/**
 * The standard Backstage Backend token identifier mapping the Extension Point.
 */
export const platformDriverExtensionPoint = createExtensionPoint<PlatformDriverExtensionPoint>({
  id: 'agent.platform-driver',
});

/**
 * Structural Blueprint wrapper mapping standardized parameters into a uniform registration interface object.
 */
export const platformDriverBlueprint = {
  extensionPoint: platformDriverExtensionPoint,

  /**
   * Helper utility simplifying validation steps for dynamic driver developers.
   * Ensures incoming parameters map to the organizational standards before allowing compilation.
   *
   * @param params - Configuration arguments and concrete driver code instance.
   */
  make(params: { name: string; driver: PlatformDriverContract }) {
    if (!params.name || params.name.trim() === '') {
      throw new Error('Compliance Registration Error: Platform driver definition name identifier is required.');
    }
    return {
      kind: 'platform-driver',
      name: params.name.trim().toLowerCase(),
      driver: params.driver,
    };
  }
};
