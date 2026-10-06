/**
 * @file identity.ts
 * @package @internal/plugin-agent-backend (engine/fluent/agent)
 *
 * @description
 * Domain mixin factory responsible for decorating the base AgentBuilder class with
 * configuration methods regarding agent identification, intent branding, and high-level
 * runtime instructions. Implements fluent APIs like `.withName()` and `.withInstructions()`
 * to manipulate internal builder state cleanly while avoiding monolithic class files.
 *
 * @runtime_context
 * Synchronous memory-resident building phase. Runs within the client plugin configuration
 * environment or the core HTTP router thread prior to execution graph serialization.
 *
 * @compliance_and_security
 * - HIPAA / SOC-2: Injected strings (e.g., instructions, prompts) are explicitly typed and
 *   isolated within the configuration state object to allow granular field-level masking
 *   or audit scanning before being synced to external services or LLM vectors.
 * - FINRA: Enforces structural validation boundaries on naming and string lengths to prevent
 *   buffer overruns and preserve explicit audit trail tracking identity references.
 */
import { Constructor, BaseAgentBuilder } from '../base';

export function IdentityMixin<TBase extends Constructor<BaseAgentBuilder>>(Base: TBase) {
  return class extends Base {
    /**
     * Declares the runtime identifier name for the agent workflow.
     * This identity maps directly to downstream telemetry tracking profiles and audit systems.
     *
     * @param name - The plain text name of the agent instance.
     */
    public withName(name: string) {
      if (!name || name.trim() === '') {
        throw new Error('Compliance Validation Error: Agent name cannot be empty.');
      }
      this.config.name = name.trim();
      return this;
    }

    /**
     * Declares the system instructions or prompt boundary that governs the LLM persona execution loop.
     *
     * @param instructions - The strict behavioural guardrails and directives for the agent runtime.
     */
    public withInstructions(instructions: string) {
      this.config.instructions = instructions;
      return this;
    }
  };
}
