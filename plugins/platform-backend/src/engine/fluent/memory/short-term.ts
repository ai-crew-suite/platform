/**
 * @file short-term.ts
 * @package @internal/plugin-agent-backend (engine/fluent/memory)
 *
 * @description
 * Domain mixin factory extending the base AgentBuilder class with short-term context
 * window and scratchpad configuration capabilities. Provides the fluent methods (e.g.,
 * `.withContextWindow()`, `.withBufferLimit()`) required to define sizing constraints,
 * message retention thresholds, and trimming behaviors for active chat session histories.
 *
 * @runtime_context
 * Synchronous memory-resident building phase. Runs within the client plugin definition
 * layer or the core HTTP router thread prior to execution graph serialization.
 *
 * @compliance_and_security
 * - HIPAA / SOC-2: Defines strict caps on message history retention sizes to minimize local
 *   in-memory footprint of potentially sensitive data (PHI/PII) during active workflow loops.
 * - FINRA: Establishes configuration patterns for tracking transient state modifications, ensuring
 *   that context-window trimming strategies preserve clear log markers of truncated message histories
 *   for complete downstream audit traceability.
 */
import { Constructor, BaseAgentBuilder } from '../base';

export function ShortTermMemoryMixin<TBase extends Constructor<BaseAgentBuilder>>(Base: TBase) {
  return class extends Base {
    /**
     * Declares the maximum total token threshold dedicated to raw prompt history context inside the window.
     * Prevents over-indexing text segments into an active language model payload transaction.
     *
     * @param maxTokens - The explicit numerical upper bound for history buffer allocations.
     */
    public withContextWindow(maxTokens: number) {
      if (maxTokens <= 0) {
        throw new Error('Compliance Validation Error: Context window limits must be a positive integer.');
      }
      this.config.maxTokens = maxTokens;
      return this;
    }

    /**
     * Establishes the hard numeric message count restriction before context history truncation mechanisms trigger.
     *
     * @param messageLimit - The total count of conversational messages to hold in memory concurrently.
     */
    public withBufferLimit(messageLimit: number) {
      if (messageLimit <= 0) {
        throw new Error('Compliance Validation Error: Buffer message limit bounds must be greater than zero.');
      }
      this.config.bufferLimit = messageLimit;
      return this;
    }
  };
}
