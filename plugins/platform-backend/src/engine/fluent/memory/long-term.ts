/**
 * @file long-term.ts
 * @package @internal/plugin-agent-backend (engine/fluent/memory)
 *
 * @description
 * Domain mixin factory extending the base AgentBuilder class with long-term persistence
 * and user-memory memory configuration capabilities. Provides the declarative fluent
 * methods (e.g., `.withUserMemory()`, `.withMem0Sync()`) required to define how the agent
 * interfaces with cross-session associative memory banks managed via Mem0.
 *
 * @runtime_context
 * Synchronous memory-resident building phase. Runs within the client plugin definition
 * layer or the core HTTP router thread prior to execution graph serialization.
 *
 * @compliance_and_security
 * - HIPAA: Configures the behavioral constraints and boundaries for capturing long-term user profiles,
 *   ensuring downstream storage adapters are signaled to use appropriate field-level encryption.
 * - SOC-2 / Privacy: Controls the enablement flags for long-term memory synching, facilitating
 *   compliance with data privacy mandates (e.g., "Right to be Forgotten") by explicitly isolating
 *   where cross-session data is stored and indexed.
 */
import { Constructor, BaseAgentBuilder } from '../base';

export function LongTermMemoryMixin<TBase extends Constructor<BaseAgentBuilder>>(Base: TBase) {
  return class extends Base {
    /**
     * Enables or disables long-term cross-session personalization profiling for a specific user target.
     *
     * @param enabled - Boolean indicating whether cross-session recall should be evaluated.
     */
    public withUserMemory(enabled: boolean) {
      this.config.userMemoryEnabled = enabled;
      return this;
    }

    /**
     * Links the workflow execution trace explicitly to the central Mem0 associative graph engine.
     * Activates automatic semantic profiling and memory capture for down-stream operations.
     */
    public withMem0Sync() {
      this.config.mem0Sync = true;
      return this;
    }
  };
}
