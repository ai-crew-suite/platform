/**
 * @file standard.ts
 * @package @internal/plugin-agent-backend (engine/fluent/tools)
 *
 * @description
 * Domain mixin factory extending the base AgentBuilder class with standardized, system-level
 * tool definitions. Exposes explicit fluent methods such as `.withSystemTools()` and
 * `.withAllowedActions()` to cleanly manage access permissions for core platform capabilities
 * (such as file utilities, database interactions, or external communications) within the agent's graph.
 *
 * @runtime_context
 * Synchronous memory-resident building phase. Runs within the client plugin definition layer
 * or the core HTTP router thread prior to execution graph serialization.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Restricts LLM action boundaries by enforcing strict whitelists of verified,
 *   enterprise-safe system tools, ensuring the agent cannot execute arbitrary or unvetted platform side-effects.
 * - FINRA: Provides explicit tracking of static tool access footprints, allowing compliance auditors
 *   to verify exactly which system primitives were accessible to the agent during execution graph validation.
 */
import { Constructor, BaseAgentBuilder } from '../base';

export function StandardToolsMixin<TBase extends Constructor<BaseAgentBuilder>>(Base: TBase) {
  return class extends Base {
    /**
     * Declares an explicit whitelist of core platform tools that the agent is authorized to trigger.
     *
     * @param toolNames - Array of predefined system tool keys (e.g., 'read-file', 'query-registry').
     */
    public withSystemTools(toolNames: string[]) {
      if (!Array.isArray(toolNames)) {
        throw new Error('Compliance Validation Error: System tools parameter must be a valid array.');
      }
      this.config.allowedSystemTools = [...toolNames];
      return this;
    }

    /**
     * Configures granular action boundaries for the agent's structural tool usage footprint.
     * Maps permitted side-effect scopes directly into the internal compilation configuration dictionary.
     *
     * @param actions - An array of specialized platform event or action permissions keys.
     */
    public withAllowedActions(actions: string[]) {
      if (!Array.isArray(actions)) {
        throw new Error('Compliance Validation Error: Allowed actions parameter must be a valid array.');
      }
      this.config.allowedActions = [...actions];
      return this;
    }
  };
}
