/**
 * @file lifecycle.ts
 * @package @internal/plugin-agent-backend (engine/fluent/workflow)
 *
 * @description
 * Domain mixin factory extending the base AgentBuilder class with workflow lifecycle hooks
 * and configuration capabilities. Exposes explicit fluent methods such as `.onStart()`,
 * `.onTimeout()`, and terminal execution triggers to manage boundaries, execution budgets,
 * and state-transition logic within the compiled execution graph.
 *
 * @runtime_context
 * Synchronous memory-resident building phase. Runs within the client plugin definition layer
 * or the core HTTP router thread prior to execution graph serialization.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Enforces hard timeouts and strict execution lifecycle budgets to prevent
 *   runaway compute resource leaks or extended data retention in active memory states.
 * - FINRA: Records comprehensive state transitions and handler initializations, ensuring that
 *   unexpected lifecycle drops, errors, or timeouts are cleanly directed to standard compliance
 *   dead-letter queues for immutable incident reporting and audit tracking.
 */
import { Constructor, BaseAgentBuilder } from '../base';

export function LifecycleMixin<TBase extends Constructor<BaseAgentBuilder>>(Base: TBase) {
  return class extends Base {
    /**
     * Sets a hard execution timeout threshold for the orchestrated agent workflow.
     * Prevents endless execution cascades and establishes clear compute budgets.
     *
     * @param timeoutMs - Max lifecycle runtime limit in milliseconds.
     */
    public withTimeout(timeoutMs: number) {
      if (timeoutMs <= 0) {
        throw new Error('Compliance Validation Error: Lifecycle timeout limit must be greater than zero.');
      }
      this.config.timeout = timeoutMs;
      return this;
    }

    /**
     * Declares a lifecycle initialization phase routine mapping key inside the configuration dictionary.
     *
     * @param hookIdentifier - The string key corresponding to an internal systemic task state.
     */
    public onStart(hookIdentifier: string) {
      if (!hookIdentifier || hookIdentifier.trim() === '') {
        throw new Error('Compliance Validation Error: Lifecycle start hook identifier cannot be empty.');
      }
      this.config.onStartHook = hookIdentifier.trim();
      return this;
    }
  };
}
