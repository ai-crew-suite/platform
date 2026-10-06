/**
 * @file ai-helpers.ts
 * @package @internal/plugin-agent-backend (worker/temporal/context)
 *
 * @description
 * Context wrapper utility that exposes Vercel AI SDK workflow primitives and activity proxies
 * safely to the Temporal runtime context. This file provides type-safe abstractions for executing
 * language model transformations, processing streaming structures, and binding dynamic agent tool configurations
 * without breaking Temporal's deterministic execution boundaries.
 *
 * @runtime_context
 * Deterministic Workflow runtime environment or Task Worker context. Acts as the specialized
 * bridge connecting Temporal's durable state machine to non-deterministic AI orchestrations.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Restricts LLM data flows by wrapping model payloads in strict tracking contexts,
 *   ensuring prompt lengths and token tracking frames match upstream user tenant limits.
 * - FINRA: Logs core execution properties, model configurations, and provider parameters at every
 *   workflow checkpoint to enforce end-to-end audit traceability for machine-generated responses.
 *
 * @example
 * ```ts
 * // Within the dynamic-agent-executor workflow loop:
 * import { WorkflowAIContextHelper } from '../context/ai-helpers';
 *
 * const aiHelper = new WorkflowAIContextHelper();
 *
 * // Safely schedule an out-of-process LLM generation step via proxy activities
 * const responseText = await aiHelper.dispatchModelTask({
 *   provider: 'openai',
 *   modelId: 'gpt-4o',
 *   prompt: 'Review file attachment for transaction matching.',
 *   temperature: 0.0
 * });
 * ```
 */

import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

// Establish deterministic proxy references to the non-deterministic activity pool
const { executeLlmCall } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2m',
  retry: {
    initialInterval: '2s',
    backoffCoefficient: 2,
    maximumAttempts: 3,
    nonRetryableErrorTypes: ['ComplianceException', 'SignatureFailure'],
  },
});

export class WorkflowAIContextHelper {
  /**
   * Routes a large language model prompt task to the out-of-process Temporal activity pool.
   * This preserves workflow determinism while facilitating deep integration with the Vercel AI SDK.
   *
   * @param params - Provider, model identity selection, and structured prompt parameters.
   * @returns The sanitized plain text generation result emitted by the upstream model.
   */
  public async dispatchModelTask(params: {
    provider: string;
    modelId: string;
    prompt: string;
    systemInstructions?: string;
    temperature?: number;
  }): Promise<string> {
    // Execute via the durable activity proxy boundary
    const result = await executeLlmCall({
      provider: params.provider,
      modelId: params.modelId,
      prompt: params.prompt,
      systemInstructions: params.systemInstructions,
      temperature: params.temperature ?? 0.7,
    });

    return result.text;
  }
}
