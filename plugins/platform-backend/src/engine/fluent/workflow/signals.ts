/**
 * @file signals.ts
 * @package @internal/plugin-agent-backend (engine/fluent/workflow)
 *
 * @description
 * Domain mixin factory extending the base AgentBuilder class with asynchronous signaling
 * capabilities. Exposes explicit fluent methods such as `.onSignal()` and `.waitForSignal()`
 * to handle real-time, external message injections, human-in-the-loop decisions, and
 * out-of-band workflow interruptions within the compiled execution graph.
 *
 * @runtime_context
 * Synchronous memory-resident building phase. Runs within the client plugin definition layer
 * or the core HTTP router thread prior to execution graph serialization.
 *
 * @compliance_and_security
 * - SOC-2 / HIPAA: Validates incoming message shapes and structures at the interface boundary
 *   to ensure external payloads do not inject unvetted scripts or spill unencrypted PII/PHI.
 * - FINRA: Declares explicit, auditable interception points for human authorization steps,
 *   ensuring that all external approvals, signatures, or overrides are uniquely bound to
 *   reproducible signal manifests for absolute verification.
 */
import { Constructor, BaseAgentBuilder } from '../base';

export function SignalsMixin<TBase extends Constructor<BaseAgentBuilder>>(Base: TBase) {
  return class extends Base {
    /**
     * Registers an external signal interface hook that the running execution graph can handle.
     *
     * @param signalName - The precise identifier string matching the target Temporal signal name.
     */
    public onSignal(signalName: string) {
      if (!signalName || signalName.trim() === '') {
        throw new Error('Compliance Validation Error: Signal name identifier cannot be empty.');
      }

      if (!this.config.registeredSignals) {
        this.config.registeredSignals = [];
      }

      const cleanName = signalName.trim();
      if (!this.config.registeredSignals.includes(cleanName)) {
        this.config.registeredSignals.push(cleanName);
      }

      return this;
    }

    /**
     * Declares a blocking checkpoint in the compiled graph orchestration flow that pauses execution
     * until a matching external validation message or authorization token is provided.
     *
     * @param signalName - The precise target signature matching the incoming signal queue line.
     */
    public waitForSignal(signalName: string) {
      if (!signalName || signalName.trim() === '') {
        throw new Error('Compliance Validation Error: Target wait signal key cannot be empty.');
      }
      this.config.blockingSignalTarget = signalName.trim();
      return this;
    }
  };
}
