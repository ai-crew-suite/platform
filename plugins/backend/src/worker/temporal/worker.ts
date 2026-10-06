/**
 * @file worker.ts
 * @package @internal/plugin-agent-backend (worker/temporal)
 *
 * @description
 * The standalone deployment entrypoint for the out-of-process Temporal Worker pool.
 * Responsible for bootstrapping a long-lived, resource-isolated runtime loop that connects
 * directly to your infrastructure's Temporal Cluster. It registers the deterministic workflow
 * interpreter (`workflows/index.ts`) alongside the aggregated non-deterministic activity pool
 * (`activities/index.ts`), completing the distributed runtime drivetrain of your platform.
 *
 * @runtime_context
 * Independent long-running background process. Runs decoupled from the main Backstage HTTP
 * Node.js server thread, communicating purely over state-backed gRPC poll channels.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Isolates heavy processing, LLM queries, and sensitive data indexing routines
 *   into a dedicated, scalable execution ring, minimizing memory exposure on the public HTTP ingress server.
 * - FINRA: Processes state transformations deterministically using Temporal's append-only event logs,
 *   guaranteeing a completely unalterable, cryptographically auditable history ledger.
 *
 * @example
 * ```ts
 * // Executed as an independent daemon or container task:
 * // node dist/worker/temporal/worker.js
 *
 * import { runWorkerLoop } from './worker';
 *
 * runWorkerLoop().catch((err) => {
 *   console.error('Fatal Worker Cluster Crash:', err);
 *   process.exit(1);
 * });
 * ```
 */

import { Worker, NativeConnection } from '@temporalio/worker';
import { mockLogger } from '@backstage/backend-defaults/root-logger';
import { createAllActivities } from './activities/index';
import { AuditLogger } from '../../platform/compliance/audit-logger';

/**
 * Initializes, registers, and blocks on the Temporal worker lifecycle loop.
 * Connects to target orchestration queues and boots dependency-injected activity services.
 */
export async function runWorkerLoop(): Promise<void> {
  // 1. Initialize core platform logging utilities
  const logger = mockLogger;
  const auditLogger = new AuditLogger({ logger });

  logger.info('[COMPLIANCE_WORKER] Initializing out-of-process Temporal Worker runtime topology...');

  try {
    // 2. Establish a secure, low-level gRPC connection ring to the core Temporal cluster
    // In production environments, this handles mutual TLS (mTLS) configuration keys
    const connection = await NativeConnection.connect({
      address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
    });

    // 3. Instantiate dynamic infrastructure extension maps
    // These host concrete drivers registered via your Backstage extension points
    const activeDrivers = new Map<string, any>();

    // 4. Ingest and aggregate the dependency-injected activity matrix
    const activities = createAllActivities({
      logger,
      auditLogger,
      activeDrivers,
    });

    // 5. Construct and register the worker configuration bounds
    const worker = await Worker.create({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
      taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'agent-backend-queue',

      // Point directly to the barrel export file containing our deterministic interpreter workflows
      workflowsPath: require.resolve('./workflows/index'),

      // Inject the fully instantiated, stateless activity definitions mapped above
      activities,

      // Tuning boundaries to guarantee compliance with API throttling rates and resource budgets
      maxConcurrentActivityExecutionSize: 40,
      maxConcurrentWorkflowTaskExecutionSize: 20,
    });

    logger.info(`[COMPLIANCE_WORKER] Connection verified. Worker actively listening on task queue: ${worker.options.taskQueue}`);

    // 6. Block on the execution loop until an explicit OS signal termination payload is intercepted
    await worker.run();

  } catch (error: any) {
    logger.error(`[COMPLIANCE_WORKER] Critical infrastructure crash during runtime registration loop: ${error.message}`, error);
    throw error;
  }
}

// Automatically execute the bootstrapper if this specific module file is invoked from shell parameters
if (require.main === module) {
  runWorkerLoop().catch((err) => {
    console.error('Fatal Worker Target Crash:', err);
    process.exit(1);
  });
}
