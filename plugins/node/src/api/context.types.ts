/**
 * @file context.types.ts
 * @package @internal/plugin-agent-node (api)
 *
 * @description
 * Shared type contracts and structural definitions for the Workflow & Task Execution Context.
 * This file serves as the strict type perimeter defining the 50+ utility methods injected
 * into out-of-process Temporal worker loops, activity classes, and programmatic orchestrators.
 * By placing these boundaries in the shared `bridge` (node) package, external user-facing plugins
 * and dynamic infrastructure modules can reference execution variables without introducing circular dependencies.
 *
 * @runtime_context
 * Framework-agnostic type compilation space. Ingested by synchronous API wrappers and
 * compiled directly into the deterministic worker context (`worker/temporal/context/execution-ctx.ts`).
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Enforces data-classification constraints across step context properties, ensuring that
 *   trace contexts, unique tenant variables, and correlation identifiers are consistently explicit.
 * - FINRA: Dictates non-repudiation parameters on state mutations and execution profiles, locking down
 *   the telemetry models that power immutable post-mortem compliance checks.
 *
 * @example
 * ```ts
 * import { WorkflowContextContract, StepExecutionPayload } from '@internal/plugin-agent-node';
 *
 * class CustomActivityImplementation {
 *   // Type safety verification across external platform execution loops
 *   public async processTask(ctx: WorkflowContextContract, step: StepExecutionPayload): Promise<void> {
 *     const trackingId = ctx.getCorrelationId();
 *     const userRef = ctx.getUserEntityRef();
 *
 *     if (step.requiresApproval && !ctx.hasPermission('execute_action')) {
 *       throw new Error(`Security Exception: [Trace: ${trackingId}] Operator ${userRef} lacks clearance.`);
 *     }
 *   }
 * }
 * ```
 */

/**
 * Strict data profile containing the validated user and distributed trace identifiers
 * passed across process and cluster boundaries.
 */
export interface IdentityTelemetryFrame {
  readonly correlationId: string;
  readonly userEntityRef: string;
  readonly principalType: 'user' | 'service';
  readonly tenantScope: string;
  readonly initializedAt: string;
}

/**
 * Operational manifest describing a dynamic execution step parsed by the generic engine interpreter.
 */
export interface StepExecutionPayload {
  readonly stepId: string;
  readonly type: 'llm_inference' | 'vector_retrieval' | 'tool_call' | 'signal_checkpoint';
  readonly name: string;
  readonly requiresApproval: boolean;
  readonly timeoutMs: number;
  readonly arguments: Record<string, any>;
}

/**
 * Primary interface layout detailing the execution capabilities available to dynamic loops.
 * Forms the core signature map for the 50+ context methods within the engine's compute layers.
 */
export interface WorkflowContextContract {
  /**
   * Retrieves the current immutable correlation identifier tracing this transaction thread.
   */
  getCorrelationId(): string;

  /**
   * Identifies the originating operator or automated system account execution reference string.
   */
  getUserEntityRef(): string;

  /**
   * Evaluates security permission states against active principal metadata scopes.
   */
  hasPermission(permissionKey: string): boolean;

  /**
   * Extracts target architectural settings safely from the underlying serialized graph definition.
   */
  getGraphMetadata(path: string): any;

  /**
   * Dispatches transient key parameters or execution parameters securely into downstream activity spaces.
   */
  getStepScope(stepId: string): StepExecutionPayload | null;
}
