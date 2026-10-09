/**
 * @file search.ts
 * @package @internal/plugin-agent-backend (engine/fluent/retrieval)
 *
 * @description
 * Domain mixin factory extending the base AgentBuilder class with vector search and retrieval-augmented
 * generation (RAG) parameter configurations. Exposes explicit fluent methods such as `.withVectorSearch()`
 * and `.withSimilarityThreshold()` to control distance metrics, vector match limitations, and target index targets.
 *
 * @runtime_context
 * Synchronous memory-resident building phase. Runs within the client plugin definition layer or the core
 * HTTP router thread prior to execution graph serialization.
 *
 * @compliance_and_security
 * - HIPAA / SOC-2: Defines similarity limits and embedding extraction scopes to ensure downstream retrieval
 *   mechanisms isolate access control fields, filtering out unvetted vector blocks before presentation to
 *   the LLM context.
 * - FINRA: Declares threshold bounds and target vector indexes deterministically to prevent uncontrolled or drift-heavy
 *   data inclusion during production inference steps, supporting strict evaluation auditing.
 */
import { Constructor, BaseAgentBuilder } from '../base';

export function SearchMixin<TBase extends Constructor<BaseAgentBuilder>>(Base: TBase) {
  return class extends Base {
    /**
     * Associates the agent definition with a target vector store collection or index namespace.
     *
     * @param collection - The designated identifier of the target vector repository.
     */
    public withVectorSearch(collection: string) {
      if (!collection || collection.trim() === '') {
        throw new Error('Compliance Validation Error: Vector collection reference cannot be empty.');
      }
      this.config.vectorCollection = collection.trim();
      return this;
    }

    /**
     * Establishes the mathematical similarity score limit for document node extraction filtering.
     * Prevents low-confidence or irrelevant contextual data chunks from polluting the agent's prompt boundary.
     *
     * @param threshold - A strict floating-point coefficient ranging between 0.0 and 1.0.
     */
    public withSimilarityThreshold(threshold: number) {
      if (threshold < 0.0 || threshold > 1.0) {
        throw new Error('Compliance Validation Error: Similarity threshold must be a precise float between 0.0 and 1.0.');
      }
      this.config.threshold = threshold;
      return this;
    }
  };
}
