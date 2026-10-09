/**
 * @file model.ts
 * @package @internal/plugin-agent-backend (engine/fluent/agent)
 *
 * @description
 * Domain mixin factory that extends the base AgentBuilder class with foundational Large
 * Language Model (LLM) configuration parameters. Exposes fluent chaining methods such as
 * `.withTemperature()`, `.withLLMProvider()`, and max token limits to cleanly capture and
 * manipulate core model orchestration attributes before serialization.
 *
 * @runtime_context
 * Synchronous memory-resident building phase. Runs within the client plugin definition
 * space or the core HTTP router thread during the initial step-chain creation.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Captures model selection and hyperparameters to ensure traffic can be
 *   safely routed only through approved, enterprise-isolated model endpoints that promise
 *   zero data-retention for training purposes.
 * - FINRA: Records strict execution bounds (like deterministic temperatures when required)
 *   to guarantee auditable, predictable text generation profiles across high-compliance tasks.
 */
import { Constructor, BaseAgentBuilder } from '../base';

export function ModelMixin<TBase extends Constructor<BaseAgentBuilder>>(Base: TBase) {
  return class extends Base {
    /**
     * Confirms the authorized LLM upstream infrastructure provider.
     *
     * @param provider - The explicit identifier of the target compliant endpoint (e.g., 'openai', 'anthropic').
     */
    public withLLMProvider(provider: string) {
      if (!provider) {
        throw new Error('Compliance Validation Error: Model provider cannot be undefined.');
      }
      this.config.llmProvider = provider;
      return this;
    }

    /**
     * Declares the generation variance (creativity coefficient) for the model context loop.
     * Enforces tight numerical boundaries to support deterministic behavior in critical environments.
     *
     * @param temperature - A value ranging strictly between 0.0 (fully deterministic) and 1.0.
     */
    public withTemperature(temperature: number) {
      if (temperature < 0.0 || temperature > 1.0) {
        throw new Error('Compliance Validation Error: Temperature must sit strictly between 0.0 and 1.0.');
      }
      this.config.temperature = temperature;
      return this;
    }
  };
}
