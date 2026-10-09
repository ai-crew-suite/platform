/**
 * @file validation.ts
 * @package @internal/plugin-agent-node (utils)
 *
 * @description
 * Shared input schema validation and parameters-cleansing utility library. Provides
 * strict type guards and alphanumeric format verification helpers utilized uniformly
 * across the Fluent API composition layers, HTTP routers, and pluggable extension modules.
 * By maintaining a centralized, zero-dependency validation contract in the shared `bridge`
 * node package, structural validation rules remain consistent across all platform layers.
 *
 * @runtime_context
 * Framework-agnostic utility execution. Runs synchronously within input parsing boundaries,
 * pre-compile validations, or upstream of state mutation processing lines.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Implements character whitelists and structural constraint filters to prevent
 *   code injection, parameter pollution, or malformed data frames from breaching memory states.
 * - FINRA: Validates data boundaries deterministically, ensuring that mandatory indexing fields,
 *   identities, and structural bounds are verified to prevent unvetted downstream pipeline errors.
 *
 * @example
 * ```ts
 * import { validateAgentName, isValidSimilarityThreshold } from '@internal/plugin-agent-node';
 *
 * // Verifying an incoming name constraint parameter
 * const rawName = "Compliance_Agent_1";
 * if (!validateAgentName(rawName)) {
 *   throw new Error("Validation Error: Name contains illegal syntax layout characters.");
 * }
 *
 * // Verifying numeric threshold parameters
 * const score = 0.85;
 * if (!isValidSimilarityThreshold(score)) {
 *   throw new Error("Validation Error: Score sits outside the structural float bounds.");
 * }
 * ```
 */

/**
 * Validates that an agent identity string matches safe naming patterns.
 * Restricts naming inputs to alphanumeric strings, dashes, and underscores to prevent injection vectors.
 *
 * @param name - The raw plain text identifier target.
 */
export function validateAgentName(name: string): boolean {
  if (!name || name.trim() === '') {
    return false;
  }
  const cleanName = name.trim();
  // Limit character depth boundaries to prevent extreme string overruns
  if (cleanName.length > 128) {
    return false;
  }
  const identityRegex = /^[a-zA-Z0-9_-]+$/;
  return identityRegex.test(cleanName);
}

/**
 * Enforces rigid numerical constraints on float precision scores used during vector retrieval processing.
 *
 * @param threshold - The numerical similarity limit coefficient.
 */
export function isValidSimilarityThreshold(threshold: number): boolean {
  return typeof threshold === 'number' && !isNaN(threshold) && threshold >= 0.0 && threshold <= 1.0;
}

/**
 * Validates that custom tool names adhere to language model parameter formatting requirements.
 *
 * @param toolName - The identifier name of the custom tool function.
 */
export function validateToolName(toolName: string): boolean {
  if (!toolName || toolName.length > 64) {
    return false;
  }
  // Standard format required by modern LLM function calling providers
  const toolRegex = /^[a-zA-Z0-9_-]+$/;
  return toolRegex.test(toolName);
}
