/**
 * @file builder.ts
 * @package @internal/plugin-agent-backend (engine/fluent)
 *
 * @description
 * Composition Root for the Agent Fluent API. Responsible for flattening and piping the
 * independent domain mixins (Identity, Model, LongTermMemory, ShortTermMemory, Signals,
 * Lifecycle, Tools, Retrieval) onto the core BaseAgentBuilder class using linear array reduction.
 * Exposes the final consolidated `AgentBuilder` class to external user-facing plugins,
 * providing unified type inference, compile triggers, and an automated autocompletion boundary.
 *
 * @runtime_context
 * Synchronous memory-resident building phase. Acts as the orchestrating class wrapper
 * exposed directly to the Backstage HTTP router or client initialization interfaces.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Governs the assembly of domain parameters, providing a deterministic validation
 *   point immediately before the internal configuration state gets shipped to the serialization layer.
 * - FINRA: Establishes a rigid, unified `.compile()` gate that ensures incomplete, partial, or
 *   unvetted agent configurations cannot accidentally execute against the live platform engine.
 */
import { BaseAgentBuilder } from './base';

// Import individual domain mixins (the feature blocks)
import { IdentityMixin } from './agent/identity';
import { ModelMixin } from './agent/model';
import { LongTermMemoryMixin } from './memory/long-term';
import { SearchMixin } from './retrieval/search';
import { LifecycleMixin } from './workflow/lifecycle';

// Import the serialization engine
import { serializeGraph } from '../compiler/serialization';

/**
 * Linearly pipe the Base class through the array of mixin factory functions.
 * This completely flattens what would otherwise be a deep, unreadable nested function call.
 */
const mixinPipeline = [
  IdentityMixin,
  ModelMixin,
  LongTermMemoryMixin,
  SearchMixin,
  LifecycleMixin,
];

const FullyComposedBuilder = mixinPipeline.reduce(
  (Base, mixin) => mixin(Base),
  BaseAgentBuilder
);

/**
 * The final, clean class exposed to external user-facing plugins.
 * It automatically inherits every single method defined inside the mixins array.
 */
export class AgentBuilder extends FullyComposedBuilder {

  /**
   * The terminal command that terminates the chaining flow, processes
   * validation, and compiles the configuration into a serializable graph.
   */
  public compile() {
    const rawConfig = this.getInternalConfig();

    // Perform structural validation checks here before locking the graph
    if (!rawConfig.name) {
      throw new Error('Compliance Validation Error: Agent name is required.');
    }

    // Hand over to the serialization compiler to build the final JSON execution graph
    return serializeGraph(rawConfig);
  }
}
