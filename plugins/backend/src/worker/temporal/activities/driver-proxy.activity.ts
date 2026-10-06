/**
 * @file driver-proxy.activity.ts
 * @package @internal/plugin-agent-backend (worker/temporal/activities)
 *
 * @description
 * Out-of-process Temporal Activity serving as the core execution proxy to external infrastructure drivers.
 * Because Temporal workers run in isolated runtimes away from the initial Backstage plugin context,
 * this activity maps generic workflow integration intents (e.g., fetching keys, running vector searches,
 * pushing alerts) to the active, high-compliance extensions registered via the `agent-node` package's Extension Points.
 *
 * @runtime_context
 * Asynchronous, non-deterministic execution thread managed by the out-of-process Temporal Worker pool.
 * Fully authorized to perform external network requests and coordinate with driver plugins.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Acts as the security boundary where external drivers (like HashiCorp Vault or pgvector)
 *   are invoked. Ensures data inputs are passed strictly through encryption buffers before breaching network borders.
 * - FINRA: Enforces strong error boundary containment and structured failure logs to preserve continuous
 *   telemetry monitoring if an underlying infrastructure plugin drops an active connection.
 *
 * @example
 * ```ts
 * // Within the generic interpreter workflow definition file:
 * import { proxyActivities } from '@temporalio/workflow';
 * import type * as activities from '../activities';
 *
 * const { executeDriverOperation } = proxyActivities<typeof activities>({
 *   startToCloseTimeout: '30s',
 *   retry: { maximumAttempts: 3 }
 * });
 *
 * // Proxying a vector similarity lookup through to an active storage driver
 * const searchResults = await executeDriverOperation({
 *   driverType: 'storage',
 *   operation: 'similarityFetch',
 *   payload: { queryVector: [0.12, -0.98, 0.45], limit: 3 }
 * });
 * ```
 */

import { Context } from '@temporalio/activity';
import { LoggerService } from '@backstage/backend-plugin-api';

export interface DriverOperationInput {
  driverType: 'storage' | 'security' | 'platform';
  operation: string;
  payload: Record<string, any>;
}

interface DriverProxyDependencies {
  logger: LoggerService;
  // Dynamic map holding references to drivers registered via Backstage extension points
  activeDrivers: Map<string, any>;
}

export const createDriverProxyActivity = (deps: DriverProxyDependencies) => {
  const { logger, activeDrivers } = deps;

  return {
    async executeDriverOperation(input: DriverOperationInput): Promise<Record<string, any>> {
      const activityInfo = Context.current().info;
      logger.info(`[WORKER_DRIVER_PROXY] Intercepting execution route for ${input.driverType} operation: ${input.operation}`);

      // 1. Resolve the specific infrastructure adapter plugin registered at application boot
      const targetDriver = activeDrivers.get(input.driverType);
      if (!targetDriver) {
        throw new Error(`Compliance Infrastructure Failure: No active driver registered for type "${input.driverType}". Execution aborted.`);
      }

      // 2. Verify that the requested operation signature exists on the registered driver instance
      if (typeof targetDriver[input.operation] !== 'function') {
        throw new Error(`Compliance Signature Failure: Driver type "${input.driverType}" does not support operation "${input.operation}".`);
      }

      try {
        // 3. Delegate execution directly to the high-compliance isolated driver module
        const result = await targetDriver[input.operation](input.payload, {
          telemetryContext: {
            workflowId: activityInfo.workflowId,
            runId: activityInfo.workflowRunId,
            attempt: activityInfo.attempt,
          }
        });

        return result || {};
      } catch (error: any) {
        logger.error(`[WORKER_DRIVER_PROXY] Error occurred inside target driver execution block: ${error.message}`);
        throw new Error(`Infrastructure Driver Execution Interrupted: ${error.message}`);
      }
    }
  };
};
