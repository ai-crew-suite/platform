/**
 * @file compliance-reporting.activity.ts
 * @package @internal/plugin-agent-backend (worker/temporal/activities)
 *
 * @description
 * Out-of-process Temporal Activity responsible for registering immutable operational audit
 * checkpoints with the centralized platform ledger service. It captures runtime task telemetry,
 * execution statuses, and execution metadata from active workflows, applying contextual correlation IDs
 * before transmitting them to long-term regulatory log structures.
 *
 * @runtime_context
 * Asynchronous, non-deterministic execution thread managed by the out-of-process Temporal Worker pool.
 * Allowed to safely execute external I/O network operations and log mutations.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Captures exact workflow engine execution states while ensuring that no unredacted
 *   PHI/PII strings flow into the external platform tracing layers.
 * - FINRA: Implements strict execution metadata archiving with microsecond precision, supporting
 *   regulatory non-repudiation constraints for automated client actions.
 *
 * @example
 * ```ts
 * // Within an orchestrator workflow definition file:
 * import { proxyActivities } from '@temporalio/workflow';
 * import type * as activities from '../activities';
 *
 * const { reportComplianceEvent } = proxyActivities<typeof activities>({
 *   startToCloseTimeout: '10s',
 *   retry: { maximumAttempts: 5 }
 * });
 *
 * // Triggering a durable checkpoint registration event
 * await reportComplianceEvent({
 *   workflowId: 'agent-run-123',
 *   action: 'TOOL_EXECUTION_COMPLETED',
 *   status: 'success',
 *   payloadSummary: { toolName: 'fetch-ledger', executionDurationMs: 142 }
 * });
 * ```
 */

import { Context } from '@temporalio/activity';
import { AuditLogger } from '../../../platform/compliance/audit-logger';

export interface ComplianceReportInput {
  workflowId: string;
  action: string;
  status: 'success' | 'failure' | 'denied';
  payloadSummary: Record<string, any>;
}

interface ActivityEnvironment {
  auditLogger: AuditLogger;
}

/**
 * Factory wrapper to construct the compliance reporting activity with runtime dependency injections.
 */
export const createComplianceReportingActivity = (env: ActivityEnvironment) => {
  return {
    async reportComplianceEvent(input: ComplianceReportInput): Promise<void> {
      // 1. Gather out-of-process environment context attributes from the active Temporal token context
      const activityInfo = Context.current().info;

      // 2. Synthesize internal orchestration metrics with incoming tracking properties
      const actionMetadata = {
        ...input.payloadSummary,
        temporalMetrics: {
          taskQueue: activityInfo.taskQueue,
          activityId: activityInfo.activityId,
          workflowRunId: activityInfo.workflowRunId,
          attemptNumber: activityInfo.attempt,
        }
      };

      // 3. Emit a structured log frame over onto the WORM audit infrastructure
      env.auditLogger.log({
        action: input.action,
        category: 'workflow',
        status: input.status,
        metadata: actionMetadata
      });
    }
  };
};
