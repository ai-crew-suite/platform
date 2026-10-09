/**
 * @file index.ts
 * @package @internal/plugin-agent-backend (worker/temporal/activities)
 *
 * @description
 * Centralized aggregation and barrel export entrypoint for all Temporal Activities
 * executing within the out-of-process Worker pool. Responsible for bundling individual
 * activity factories (Compliance Reporting, Driver Proxies, LLM Invocations, Retrieval)
 * into a single unified object mapping matching the module type signatures required by the
 * Temporal Worker registration runtime.
 *
 * @runtime_context
 * Compilation and initialization phase running inside the Temporal Worker process (`worker.ts`)
 * at environment bootstrap.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Collects and exports the explicit boundary definitions for all non-deterministic
 *   I/O integrations, allowing clear auditing of exactly which system operations are exposed to the workflow engine.
 * - FINRA: Serves as the centralized dependency injection registration layer, ensuring that all
 *   activities receive fully validated, compliant service and logging instances at boot time.
 *
 * @example
 * ```ts
 * // Within the out-of-process worker.ts startup script:
 * import { Worker } from '@temporalio/worker';
 * import { createAllActivities } from './activities/index';
 *
 * const activities = createAllActivities({ logger, auditLogger, activeDrivers });
 *
 * const worker = await Worker.create({
 *   taskQueue: 'agent-backend-queue',
 *   activities, // Registers the compiled factory output below
 * });
 * ```
 */

import { LoggerService } from '@backstage/backend-plugin-api';
import { AuditLogger } from '../../../platform/compliance/audit-logger';
import { createComplianceReportingActivity } from './compliance-reporting.activity';
import { createDriverProxyActivity } from './driver-proxy.activity';
import { createLlmCallActivity } from './llm-call.activity';
import { createRetrievalActivity } from './retrieval.activity';

interface ActivityDependencies {
  logger: LoggerService;
  auditLogger: AuditLogger;
  activeDrivers: Map<string, any>;
}

/**
 * Instantiates and aggregates all operational activities, injecting the required
 * platform infrastructure dependencies across compliance boundaries.
 *
 * @param deps - The centralized platform services and dynamic extension drivers required by the activities.
 */
export function createAllActivities(deps: ActivityDependencies) {
  const complianceReporting = createComplianceReportingActivity({ auditLogger: deps.auditLogger });
  const driverProxy = createDriverProxyActivity({ logger: deps.logger, activeDrivers: deps.activeDrivers });
  const llmCall = createLlmCallActivity({ logger: deps.logger, auditLogger: deps.auditLogger });
  const retrieval = createRetrievalActivity({ logger: deps.logger });

  return {
    ...complianceReporting,
    ...driverProxy,
    ...llmCall,
    ...retrieval,
  };
}

// Export individual type definitions to support type-safe workflow proxies upstream
export type WorkerActivities = ReturnType<typeof createAllActivities>;
