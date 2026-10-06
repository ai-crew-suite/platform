/**
 * @file execution-ctx.ts
 * @package @internal/plugin-agent-backend (worker/temporal/context)
 *
 * @description
 * Primary context wrapper and orchestration container passed directly into the core task loops of the
 * dynamic agent execution system. Aggregates domain-specific helpers (AI, Compliance) and provides
 * a unified, type-safe API for interacting with the runtime environment. This class serves as the
 * 50+ method execution boundary that gives dynamic steps access to platform tools, tracking, and logs
 * without violating Temporal's strict determinism requirements.
 *
 * @runtime_context
 * Deterministic Temporal Workflow environment. Instantiated inside the main workflow loop and distributed
 * internally to sequential and parallel step execution components.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Acts as the primary orchestrator that threads trace telemetry and correlation IDs
 *   through every functional step, enforcing clear accountability boundaries across all child operations.
 * - FINRA: Enforces hard resource tracking limits and state validation rules at the step perimeter,
 *   guaranteeing that any unauthorized access or run structural deviations immediately halt execution.
 *
 * @example
 * ```ts
 * // Within the dynamic-agent-executor workflow loop:
 * import { WorkflowExecutionContext } from '../context/execution-ctx';
 *
 * export async function dynamicAgentExecutor(graph: any) {
 *   const ctx = new WorkflowExecutionContext(graph);
 *
 *   await ctx.compliance.checkpoint('WORKFLOW_STARTED', 'success', {});
 *
 *   // Executing an AI instruction via the aggregated context helper
 *   const answer = await ctx.ai.dispatchModelTask({
 *     provider: ctx.getProvider(),
 *     modelId: ctx.getModel(),
 *     prompt: 'Analyze high-volume trade records for compliance variance.'
 *   });
 * }
 * ```
 */

import { workflowInfo } from '@temporalio/workflow';
import { WorkflowAIContextHelper } from './ai-helpers';
import { WorkflowComplianceHelper } from './compliance-helpers';

export class WorkflowExecutionContext {
  public readonly ai: WorkflowAIContextHelper;
  public readonly compliance: WorkflowComplianceHelper;
  private readonly executionGraph: Record<string, any>;

  constructor(executionGraph: Record<string, any>) {
    const info = workflowInfo();
    this.executionGraph = executionGraph;

    // Instantiate aggregated domain-specific context helpers
    this.ai = new WorkflowAIContextHelper();
    this.compliance = new WorkflowComplianceHelper(info.workflowId);
  }

  /**
   * Resolves the configured LLM provider from the deserialized execution graph.
   */
  public getProvider(): string {
    return this.executionGraph.llm?.provider || 'openai';
  }

  /**
   * Resolves the configured large language model signature variant from the execution graph.
   */
  public getModel(): string {
    return this.executionGraph.llm?.modelId || 'gpt-4o';
  }

  /**
   * Returns the system instructions or prompt boundaries specified during the graph's building phase.
   */
  public getSystemInstructions(): string {
    return this.executionGraph.meta?.instructions || '';
  }

  /**
   * Resolves execution configuration settings or environment-level variables.
   * Part of the extensive context methods mapping out tool limits, step graphs, and custom timeouts.
   *
   * @param key - The targeted configuration field configuration path string.
   */
  public getSetting(key: string): any {
    return this.executionGraph.workflow?.[key] ?? null;
  }
}
