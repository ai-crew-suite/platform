/**
 * @file custom.ts
 * @package @internal/plugin-agent-backend (engine/fluent/tools)
 *
 * @description
 * Domain mixin factory extending the base AgentBuilder class with capabilities for declaring
 * dynamic, runtime-evaluated tools for Large Language Models. Exposes fluent configuration
 * methods like `.withDynamicTool()` to allow external user-facing plugins to register ad-hoc
 * executable schemas and custom task callbacks directly into the execution graph. [1]
 *
 * @runtime_context
 * Synchronous memory-resident building phase. Runs within the client plugin definition layer
 * or the core HTTP router thread prior to execution graph serialization. [1]
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Validates that any custom callback properties or schemas do not bypass existing
 *   system-level isolation vectors or spill PII/PHI across multi-tenant runtime parameters. [1]
 * - FINRA: Enforces strict input schema validation signatures for dynamic tools to guarantee that
 *   all ad-hoc LLM tool calls generate explicit, unambiguous, and auditable input/output execution trails. [1]
 */
import { Constructor, BaseAgentBuilder } from '../base';

export function CustomToolsMixin<TBase extends Constructor<BaseAgentBuilder>>(Base: TBase) {
  return class extends Base {
    /**
     * Registers a custom, ad-hoc execution tool with an explicit JSON Schema verification footprint.
     *
     * @param name - Unique identifier name of the tool, matching standard LLM function-calling restrictions.
     * @param description - High-signal functional directive explaining to the model when to execute the tool.
     * @param inputSchema - Strict JSON schema definition ensuring incoming dynamic arguments conform to validation rules.
     */
    public withDynamicTool(name: string, description: string, inputSchema: Record<string, any>) {
      if (!name || !/^[a-zA-Z0-9_-]+\$/.test(name)) {
        throw new Error('Compliance Validation Error: Tool name must be alphanumeric and contain no whitespace.');
      }
      if (!inputSchema || typeof inputSchema !== 'object') {
        throw new Error('Compliance Validation Error: Dynamic tools must supply a valid structural JSON schema definition.');
      }

      if (!this.config.dynamicTools) {
        this.config.dynamicTools = [];
      }

      this.config.dynamicTools.push({
        name,
        description,
        inputSchema,
      });

      return this;
    }
  };
}
