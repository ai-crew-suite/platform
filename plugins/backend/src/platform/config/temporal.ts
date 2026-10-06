/**
 * @file temporal.ts
 * @package @internal/plugin-agent-backend (platform/config)
 *
 * @description
 * Configuration mapper and environmental adapter for the Temporal cluster connection.
 * Extracts infrastructure metrics from the Backstage application configuration context,
 * transforming parameters into strongly typed client and worker initialization options,
 * including connection addresses, workspace namespaces, and TLS identity pairings.
 *
 * @runtime_context
 * Synchronous initialization phase running inside the main Backstage dependency
 * injection bootstrap process via the backend plugin module setup.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Maps runtime cluster credentials and client mTLS encryption keys
 *   without local disk exposure or structural hardcoding, preserving transport layer security.
 * - FINRA: Establishes explicit task queue names and connection isolation per organizational
 *   environment to guarantee data segregation and clean administrative tracking lines.
 *
 * @example
 * ```ts
 * import { ConfigReader } from '@backstage/config';
 *
 * const rawConfig = new ConfigReader({
 *   agent: {
 *     temporal: {
 *       address: 'temporal.internal:7233',
 *       namespace: 'compliance-agents',
 *       taskQueue: 'agent-tasks'
 *     }
 *   }
 * });
 *
 * const temporalConfig = parseTemporalConfig(rawConfig);
 * console.log(temporalConfig.address); // "temporal.internal:7233"
 * ```
 */

import { Config } from '@backstage/backend-plugin-api';

export interface TemporalConfigPayload {
  address: string;
  namespace: string;
  taskQueue: string;
  tls?: {
    clientCertHex?: string;
    clientKeyHex?: string;
  };
}

/**
 * Transforms system configuration blocks into strongly typed definitions digestible
 * by the downstream Temporal client initialization layer and Worker orchestration loops.
 */
export function parseTemporalConfig(config: Config): TemporalConfigPayload {
  const temporalConfig = config.getConfig('agent.temporal');

  return {
    address: temporalConfig.getString('address'),
    namespace: temporalConfig.getOptionalString('namespace') ?? 'default',
    taskQueue: temporalConfig.getOptionalString('taskQueue') ?? 'agent-backend-queue',
    tls: temporalConfig.has('tls') ? {
      clientCertHex: temporalConfig.getOptionalString('tls.clientCertHex'),
      clientKeyHex: temporalConfig.getOptionalString('tls.clientKeyHex'),
    } : undefined,
  };
}
