/**
 * @file compliance-helpers.ts
 * @package @internal/plugin-agent-backend (worker/temporal/context)
 *
 * @description
 * Deterministic runtime workflow utility providing type-safe wrappers for emitting compliance
 * events and logging tracking checkpoints from inside the Temporal state machine. It abstracts
 * the durable activity scheduling required to register state updates, compliance guardrail violations,
 * or manual human-in-the-loop approvals with the platform's out-of-process immutable audit system.
 *
 * @runtime_context
 * Deterministic Temporal Workflow environment. Must adhere strictly to pure execution parameters,
 * using exclusively localized state variations and proxying all side-effects through activities.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Captures exact step-by-step workflow lifecycle checkpoints along with their
 *   associated correlation IDs, without risking state machine fragmentation or localized PII leakage.
 * - FINRA: Establishes a highly auditable workflow trail by ensuring that all asynchronous step completions,
 *   signal responses, and timeout actions force an unalterable history log token mutation.
 *
 * @example
 * ```ts
 * // Within the dynamic-agent-executor workflow loop:
 * import { WorkflowComplianceHelper } from '../context/compliance-helpers';
 *
 * const compliance = new WorkflowComplianceHelper('agent-run-123');
 *
 * // Durably log a workflow checkpoint transition
 * await compliance.checkpoint('DYNAMIC_STEP_EVALUATION_STARTED', 'success', {
 *   currentStepIndex: 3,
 *   activeTask: 'vector-extraction'
 * });
 * ```
 */

import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

// Establish deterministic proxy references to the compliance activity block
const { reportComplianceEvent } = proxyActivities<typeof activities>({
  startToCloseTimeout: '15s',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumAttempts: 5,
  },
});

export class WorkflowComplianceHelper {
  private readonly workflowId: string;

  constructor(workflowId: string) {
    this.workflowId = workflowId;
  }

  /**
   * Schedules a durable compliance logging activity step without breaching workflow determinism.
   *
   * @param action - The clear tracking keyword mapping the completed operation (e.g., 'SIGNAL_RECEIVED').
   * @param status - The programmatic result of the step execution.
   * @param summary - A dictionary holding structured metadata metrics for the transaction ledger.
   */
  public async checkpoint(
    action: string,
    status: 'success' | 'failure' | 'denied',
    summary: Record<string, any>
  ): Promise<void> {
    // Pipe the payload parameters out to the non-deterministic activity pool
    await reportComplianceEvent({
      workflowId: this.workflowId,
      action,
      status,
      payloadSummary: summary,
    });
  }
}
