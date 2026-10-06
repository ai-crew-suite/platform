/**
 * @file index.ts
 * @package @internal/plugin-agent-backend (worker/temporal/workflows)
 *
 * @description
 * Centralized aggregation and registration entrypoint for all Temporal Workflows
 * executing within the out-of-process Worker pool. Responsible for bundling individual
 * deterministic workflow definition functions (such as the generic dynamic interpreter loop)
 * and exporting them as an explicit, unified collection matching the runtime signature expectations
 * of the core Temporal Worker process bootstrap layer.
 *
 * @runtime_context
 * Compilation and worker initialization phase running inside the out-of-process Temporal Worker
 * process (`worker.ts`) at system boot.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Captures and explicitly isolates the registry index of all permissible workflow
 *   definitions, ensuring that unvetted or arbitrary orchestration functions cannot be dynamically injected.
 * - FINRA: Serves as the structural code-level manifest boundary defining your platform's core automation capabilities,
 *   providing transparency and configuration safety for regulatory execution audits.
 *
 * @example
 * ```ts
 * // Within the out-of-process worker.ts startup script:
 * import { Worker } from '@temporalio/worker';
 * import * as workflows from './workflows/index';
 *
 * const worker = await Worker.create({
 *   taskQueue: 'agent-backend-queue',
 *   activities: compiledAllActivities,
 *   workflowsPath: require.resolve('./workflows/index'), // Hands off the entrypoint bundle directly
 * });
 * ```
 */

// Re-export the core interpreter workflow and its corresponding signal tracking structures
export { dynamicAgentExecutor, externalInterruptionSignal, humanApprovalSignal } from './dynamic-agent-executor.workflow';

// Explicitly register any utility type assertions needed by upstream dispatchers
export const REGISTERED_WORKFLOW_NAMESPACE = 'agent-backend-workflows';
