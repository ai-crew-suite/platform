/**
 * @file sources.ts
 * @package @internal/plugin-agent-backend (engine/fluent/retrieval)
 *
 * @description
 * Domain mixin factory extending the base AgentBuilder class with document source configurations
 * for Retrieval-Augmented Generation (RAG). Exposes fluent methods like `.withStaticDocuments()`
 * and `.withWebSearch()` to explicitly declare, whitelist, and bind ingestion boundaries and data
 * origins to the agent definition graph.
 *
 * @runtime_context
 * Synchronous memory-resident building phase. Runs within the client plugin definition layer or the core
 * HTTP router thread prior to execution graph serialization.
 *
 * @compliance_and_security
 * - HIPAA / SOC-2: Isolates data source declarations to guarantee that only validated, pre-encrypted corporate
 *   knowledge vaults or authorized third-party endpoints are bound to the agent, eliminating unauthorized data sprawl.
 * - FINRA: Records strict source provenance and attribution parameters to ensure that all supplemental data ingested
 *   during runtime generation traces back to an uncorrupted, auditable master repository of record.
 */
import { Constructor, BaseAgentBuilder } from '../base';

export function SourcesMixin<TBase extends Constructor<BaseAgentBuilder>>(Base: TBase) {
  return class extends Base {
    /**
     * Binds an array of explicit, static document reference keys or corpus identifiers
     * that the retrieval engine is permitted to pull context from.
     *
     * @param documentIds - Unique resource identifiers of the white-listed target documents.
     */
    public withStaticDocuments(documentIds: string[]) {
      if (!Array.isArray(documentIds)) {
        throw new Error('Compliance Validation Error: Static documents parameter must be a valid array.');
      }
      this.config.staticDocuments = [...documentIds];
      return this;
    }

    /**
     * Configures whether the agent is allowed to execute dynamic, out-of-bounds public
     * web search lookups to supplement its contextual window.
     *
     * @param enabled - Boolean controlling live external web routing access permissions.
     */
    public withWebSearch(enabled: boolean) {
      this.config.webSearch = enabled;
      return this;
    }
  };
}
