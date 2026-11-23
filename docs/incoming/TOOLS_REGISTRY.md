# Tool Registry Assessment

## Executive recommendation

**Yes, a registry is warranted** for the selected Option B contract model with Option C's Temporal execution plane (Option A is the v1 legacy typed contracts approach). For this architecture, the primary concept should be an immutable, versioned **Capability Catalog**, not a mutable map that returns executable `Tool` objects. The catalog describes what can be invoked and under what declared constraints; one **Capability Gateway** resolves and executes every invocation while enforcing current authorization, credential standing, approval, rate limits, egress, and audit.

This distinction is important: an `InMemoryToolRegistry` that returns a callable `tool.invoke` can bypass the describe/execute boundary that makes Option B attractive. The registry must not become a second authorization system, credential store, network client, or source of runtime state.

The same contract accommodates Option D (WASM isolates). Under Option B/C, the gateway and an immutable catalog snapshot can initially live in the platform backend and its Temporal activity workers. If D is later selected, the out-of-process gateway becomes the authority for catalog resolution and execution; Backstage and Temporal components use a read-only catalog client or versioned snapshot and send invocations to the gateway. Agent definitions and the capability contract need not change.

This is an architectural recommendation, not a claim that a registry by itself provides FINRA, HIPAA, or SOC 2 compliance. Those require implemented controls, operational evidence, and organizational processes beyond this component.

## What the registry should own

Separate two closely related registries behind a stable platform contract:

1. **Capability Catalog (declarative):** immutable descriptors for stable capability IDs, schemas, owner/layer, category, effect and sync/async mode, argument provenance, data classification, idempotency expectations, requirements, and applicable policy metadata. Provider mappings and instance bindings can be associated with an explicit, versioned configuration snapshot.
2. **Driver Binding Registry (trusted implementation references):** the boot-time mapping from declared provider/driver identity to the reviewed implementation that can prepare and interpret an operation. It is not exposed to agents, and it does not contain resolved credentials.

The gateway consumes these registries to resolve a capability, validate, and bind inputs, check the current principal and agent's declared capability ceiling, obtain any required approval, and execute through the selected provider. The registry describes policy inputs; the gateway remains the single policy-enforcement point. Per-user permission, token validity, kill switch state, and approval decisions are dynamic and must be checked at run start and again at call time, not cached as permanent registry facts.

Registry lookups should return descriptors or narrow, read-only views—not a callable driver or `Tool` object. The agent's only invocation path should be the gateway/executor contract. Temporal workflow code must remain deterministic: it can carry a capability ID, validated arguments, actor/standing references, and pinned catalog version, but it must not perform registry network lookups, hold provider clients, or carry credentials in workflow history. The activity or gateway performs the live resolution and enforcement.

## Fit with B/C and the possible D deployment

### Option B contract + Option C execution

- Assemble descriptors and trusted driver bindings during Backstage module initialization. Validate them and build an immutable catalog snapshot before accepting runs.
- The gateway owns the ordered resolution and enforcement pipeline. Option C can run its execute stage in Temporal activities and provider-specific task queues; it should use the same policy pipeline as any synchronous fast path. Pin a catalog / configuration digest to the run for reproducibility. Define update semantics explicitly: a run can retain its pinned descriptor and mapping version while each actual effect is still checked against current authorization, revocation, and kill-switch policy.
- In-memory snapshots are appropriate as a first implementation when the registered code is trusted and loaded at boot. They are fast, process-local read models, not a distributed source of truth. If multiple replicas or workers need updates, publish versioned snapshots / configuration and verify the digest each process loaded.

### Option D migration seam

- Keep the catalog and invocation contracts independent of the in-process implementation. Hide the source behind a read-only catalog interface and keep invocation behind a gateway client/interface.
- If D is adopted, the gateway owns the authoritative catalog / bindings and policy decision. Other services may cache non-sensitive, versioned metadata for discovery or schema generation, but must not be able to execute around the gateway or make authorization decisions from stale cache entries.
- Do not replicate executable closures, secrets, or mutable driver state into Backstage replicas or Temporal workers. Pass capability IDs and references; resolve secrets only in the trusted execution boundary.
- A database or Redis-backed registry is not inherently needed for thousands of developers. The descriptor set is normally small compared with invocation volume. Start with a boot-compiled immutable snapshot and scale the gateway, queues, and provider limits. Introduce a versioned configuration service only if customer-specific mappings / bindings need runtime administration; never load arbitrary executable functions from that store.

## Assessment of the initial `InMemoryToolRegistry`

The draft is useful as a sketch of registration, lookup, and duplicate detection, but it is not an enterprise capability registry or an enforcement boundary:

- It stores and returns live `Tool` objects with an `invoke` function. Callers of `get()` can execute a tool directly, bypassing a central gateway, permission checks, approval, redaction, idempotency, and audit.
- `freeze()` only prevents later calls to `register()`. It does not freeze registered objects or nested schemas; `get()` returns the original object, and `list()` returns a new array containing the same mutable object references. It therefore does not provide the immutability claimed by its comments.
- `list()` exposes every registered tool without principal, agent, or requirement filtering. A global registry may describe capabilities, but availability and authorization reports must be computed for the requesting principal and must not imply permission to invoke.
- The shared `Tool` shape has only an optional schema and a `read`/`write` effect. It does not express the layers, provider / instance identity, destructive effects, data class, argument provenance, standing, approval policy, async handle, or idempotency contract in the selected architecture.
- Registration currently treats duplicate IDs as `ConflictError`, matching the shared `ToolRegistry` contract, while `ToolRegistry.test.ts` expects a duplicate to replace the first entry. The test also constructs the registry without the logger required by its constructor; `register()` then calls `logger.debug`. Its test tool omits the required `category` field. Align the contract, implementation, and tests before using this draft.
- `ToolRegistry.ts` imports `Tool` and `ToolRegistry` from `@ai-crew-suite/plugin-platform-node`, but that package's current public barrel (`plugins/platform-node/src/index.ts`) does not export those types. The alternate types under `plugins/_node` are not the public entrypoint for `plugin-platform-node`. The package boundary needs to be settled before this implementation can be built reliably.
- An in-memory map is local to one process. It cannot itself guarantee that the Backstage API replicas, Temporal activity workers, and a future isolated gateway are using the same definitions or configuration revision.

The implementation is therefore not a suitable starting point to extend as-is. Retain the need for a registry, but replace the object map as the architectural contract with catalog metadata plus gateway-mediated execution.

## Lifecycle and governance requirements

1. **Collect:** trusted Backstage modules declare descriptors and driver bindings through explicit extension points. Keep code registration separate from tenant / customer configuration.
2. **Validate and compile:** reject malformed descriptors, undeclared namespaces, duplicate IDs, incompatible schemas/mappings, unresolved mandatory requirements, and unsafe policy combinations. Validate schemas at runtime boundaries, not only with TypeScript.
3. **Publish an immutable version:** create a canonical catalog / configuration digest. Freeze the compiled snapshot before exposing routes or starting workers. Do not silently overwrite an ID; changes create a new revision.
4. **Discover:** return capability metadata and a determinate availability reason (for example, unbound, not served, disabled, degraded, connect-account, or not permitted) only after applying the relevant principal and agent context.
5. **Invoke:** route calls through one gateway pipeline. Recheck permissions, standing, target scope, and kill switches at call time. Resolve credentials by reference inside the trusted activity / gateway; never put tokens in a descriptor, tool schema, or Temporal history.
6. **Observe and upgrade:** report the loaded catalog digest for API and worker processes. Roll out changes atomically or deliberately support overlapping pinned versions; alert on version skew rather than silently mixing mappings and executors.

For regulated deployments, audit records should identify the actor, agent / run, capability and provider instance, selected standing, catalog digest, policy decision, redacted input digest, upstream outcome, and any approval. The registry should make this metadata available, but the gateway / audit sink owns the record. Do not log full read results, secrets, or unredacted sensitive arguments by default.

## Recommended implementation sequence

1. Define the capability descriptor, catalog read interface, and gateway invocation interface in the shared node package. Resolve the public package export boundary and correct the current draft/test mismatch.
2. Build a boot-time catalog snapshot from first-party extension registrations. Validate namespaces, duplicates, schemas, required fields, and version digest; make reads non-mutating and keep executable drivers private.
3. Implement the central gateway enforcement pipeline and route all tool execution through it. Start with one synchronous read and one write requiring approval; prove that neither can bypass authorization or audit.
4. Add Temporal activity execution for writes/async operations, with the same gateway policies, operation IDs, deadlines, idempotency behavior, and catalog-version checks.
5. Keep the catalog interface transport-neutral. Defer Option D until a deployment isolation, independent scaling, or multi-consumer requirement justifies the service boundary; then make that gateway the authoritative registry and execution point.

## Minimum acceptance tests

- Duplicate or invalid registrations fail startup with the owning module and descriptor identified; no silent replacement or registration after freeze.
- Mutating an input descriptor or a value returned from a lookup/list cannot alter the published snapshot. No lookup exposes a callable executor.
- An undeclared capability, wrong provider binding, invalid argument, revoked permission, or active kill switch cannot reach the provider.
- Agent requirements can narrow user authority but cannot widen it; per-user discovery results do not leak across principals or tenants.
- API and worker processes report the same pinned catalog digest; a mismatch fails closed or follows an explicit compatibility policy.
- Credentials never appear in catalog data, logs, workflow inputs, or Temporal history; audit captures the redacted invocation and decision.
- Repeated async callbacks, activity retries, and uncertain external outcomes do not cause duplicate effects where the provider supports idempotency.
- A future D gateway can replace the in-process gateway without changing capability IDs or agent-facing invocation contracts.