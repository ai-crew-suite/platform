/**
 * @file workflow.types.ts
 * @package @internal/plugin-agent-node (events)
 *
 * @description
 * Shared type contracts and event structure definitions for state machine transitions
 * inside the dynamic interpreter engine. Establishes standard schemas for tracking loop executions,
 * step completions, out-of-band interruptions, and signal interceptions. Placing these declarations
 * within the shared node package allows user-facing frontend plugins (`canvas`) and the background
 * execution loops (`engine`) to safely consume, serialize, and process identical workflow metrics.
 *
 * @runtime_context
 * Framework-agnostic type compilation space. Ingested by the dynamic Temporal workflow engine
 * (`dynamic-agent-executor.workflow.ts`), client progress tracking UI widgets, and dashboard listeners.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Restricts step state definitions from capturing internal volatile parameters or
 *   raw generation strings, preventing data leaks across decoupled client tracing pipelines.
 * - FINRA: Establishes a predictable state validation schema that guarantees structural audit alignment,
 *   proving the chronological order of executed tools, loops, and human-in-the-loop overrides.
 *
 * @example
 * ```ts
 * import { WorkflowTransitionEvent } from '@internal/plugin-agent-node';
 *
 * const stepUpdate: WorkflowTransitionEvent = {
 *   workflowId: 'agent-run-processing-cycle-2026',
 *   runId: '78a1bc23-90df-4123-bcde-56789abcdef0',
 *   timestamp: '2026-03-26T06:15:00Z',
 *   currentState: 'STEP_IN_PROGRESS',
 *   event: {
 *     type: 'STEP_STARTED',
 *     stepIndex: 4,
 *     stepName: 'vector-context-retrieval'
 *   }
 * };
 * ```
 */

/**
 * Standard administrative states mapped out across the generic engine interpreter loop.
 */
export type WorkflowExecutionState =
  | 'INITIALIZED'
  | 'STEP_IN_PROGRESS'
  | 'AWAITING_SIGNAL'
  | 'COMPLETING'
  | 'COMPLETED'
  | 'FAILED'
  | 'TERMINATED';

/**
 * Specific variant definitions classifying step changes inside the execution loop.
 */
export interface WorkflowStepStartedMetadata {
  readonly type: 'STEP_STARTED';
  readonly stepIndex: number;
  readonly stepName: string;
}

export interface WorkflowStepCompletedMetadata {
  readonly type: 'STEP_COMPLETED';
  readonly stepIndex: number;
  readonly stepName: string;
  readonly executionDurationMs: number;
}

export interface WorkflowSignalInterceptedMetadata {
  readonly type: 'SIGNAL_INTERCEPTED';
  readonly signalChannel: string;
  readonly payloadKeys: string[];
}

export interface WorkflowFailureMetadata {
  readonly type: 'EXECUTION_FAILED';
  readonly failureCode: string;
  readonly errorMessage: string;
}

/**
 * Unified variant union bundling all valid runtime state change markers.
 */
export type WorkflowEventPayload =
  | WorkflowStepStartedMetadata
  | WorkflowStepCompletedMetadata
  | WorkflowSignalInterceptedMetadata
  | WorkflowFailureMetadata;

/**
 * Universal structural envelope documenting a lifecycle state transition or checkpoint event
 * inside the dynamic interpreter loop.
 */
export interface WorkflowTransitionEvent {
  readonly workflowId: string;
  readonly runId: string;
  readonly timestamp: string;
  readonly currentState: WorkflowExecutionState;
  readonly event: WorkflowEventPayload;
}
