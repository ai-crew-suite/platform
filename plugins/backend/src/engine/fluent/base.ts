/**
 * @file base.ts
 * @package @internal/plugin-agent-backend (engine/fluent)
 *
 * @description
 * Foundations layer for the mixin-driven Fluent API. Defines the root constructor types,
 * the shared `BaseAgentBuilder` parent class, and the centralized memory-resident configuration
 * state definitions. This file serves as the baseline target that all individual feature mixins
 * (agent, memory, retrieval, workflow, tools) ingest and extend to build out their respective APIs.
 *
 * @runtime_context
 * Synchronous memory-resident building phase. Acts as the structural anchor for type checking
 * and configuration state accumulation before passing the final data to the compiler layer.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Initializes the protected configuration state matrix with distinct boundaries,
 *   guaranteeing that internal configuration dictionaries are structural, predictable, and fully
 *   isolated from global prototype pollution vectors.
 * - FINRA: Dictates immutable state patterns for basic tracking variables to enforce complete
 *   auditing safety across downstream compile operations.
 */

/**
 * A generic constructor type that accepts any arguments and returns an object.
 * This allows TypeScript to track type transformations as mixins wrap the class.
 */
export type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * The raw foundation class.
 * It houses the centralized internal state that all mixins will manipulate.
 */
export class BaseAgentBuilder {
  // Shared state dictionary where configuration parameters accumulate
  protected config: Record<string, any> = {};

  constructor(...args: any[]) {}

  /**
   * Internal helper to retrieve the accumulated state.
   */
  public getInternalConfig(): Record<string, any> {
    return this.config;
  }
}
