# Temporal Payload Codec (encryption plus a codec server)

> **Never put a credential or access token into Temporal payloads or history.** Pass `{ principal, standingRef }` and resolve it inside the activity. Use a Temporal payload codec (encryption plus a codec server) for all agent payloads in HIPAA deployments.

There are **two separate protections** in that note:

1. **Keep credentials out of Temporal altogether**, even encrypted.
2. **Encrypt other sensitive workflow data** that may legitimately pass through Temporal.

I also need to correct one part of my earlier wording: a **codec server is optional**. It lets authorized users or tools decode payloads for inspection; it is not required for encryption to work, nor is a specific Temporal configuration by itself proof of HIPAA compliance.

### Why credentials should stay out of Temporal

Temporal persists workflow history so it can recover and replay workflows. That history can include workflow and activity inputs and results, signals, and other payloads. Depending on configuration and access, those records can be viewed through Temporal’s UI, CLI, or APIs.

This is unsafe:

```typescript
await openPullRequest({
  repo: 'acme/widgets',
  githubToken: 'ghu_...', // BAD: activity input becomes workflow history
});
```

It’s also unsafe to return the token from an activity:

```typescript
const token = await getGithubToken(user); // BAD: activity result enters history
await openPullRequest({ token });
```

Encrypting these payloads would limit who can read them, but the token would still be copied into durable history and retained there. Instead, **the activity obtains and uses the token within the backend process**, without passing it to or from the workflow.

### What the boundary looks like

```text
Backstage backend starts workflow
  │  run ID, user identity, connection reference
  │  No token
  ▼
Temporal workflow history
  │
  ▼
Activity worker
  │  asks gateway to perform an authorized operation
  ▼
Gateway / credential broker
  │  validates run, user, connection, capability and target
  │  retrieves or refreshes credential
  │  sends request to provider
  ▼
GitHub
```

The gateway returns a sanitized result—such as the PR number and URL—not the credential.

### Illustrative workflow

This is **pseudocode**, not a drop-in implementation:

```typescript
type OpenPullRequestInput = {
  runId: string;
  principal: string;
  standingRef: string;
  changeRef: string;
};

export async function releaseWorkflow(input: OpenPullRequestInput) {
  const result = await activities.openPullRequest(input);

  return result; // e.g. { pullRequestNumber: 42, url: '...' }
}
```

Here:

- `principal` identifies the Backstage user.
- `standingRef` identifies their connected provider account.
- `changeRef` points to the authorized change request or stored input.

Those values are **references, not credentials**. They may still be sensitive metadata, so they should be minimized and protected.

### Illustrative activity

```typescript
export async function openPullRequest(input: OpenPullRequestInput) {
  return driverGateway.perform({
    runId: input.runId,
    principal: input.principal,
    standingRef: input.standingRef,
    capability: 'vcs.pullRequest.create',
    changeRef: input.changeRef,
  });
}
```

The gateway then:

1. Loads the trusted run record and verifies that the run belongs to the principal and is allowed to use the referenced connection.
2. Checks current policy for the agent, user, capability, provider instance, and target.
3. Resolves the credential, refreshing it if needed.
4. Makes the provider call.
5. Returns a result without the token.

**Important:** `principal` and `standingRef` are not proof of authorization merely because they appear in an activity input. A caller must not be able to substitute another user or connection. The gateway must bind them to a trusted run record and enforce policy when the action occurs.

### How the credential is used

Ideally, the gateway sends the request itself. The broker supplies the credential only within that trusted boundary; agent code, workflow code, and model-generated inputs never see it.

If the worker and gateway are separate services, they authenticate to each other, and the gateway verifies the requested action—not just the worker’s service identity. That distinction prevents a trusted worker from being able to request **any** user’s token for **any** action.

### What happens if the token expires?

That depends on the provider and the grant:

- **Access token expired, refresh available:** the broker refreshes it and proceeds.
- **Grant revoked, refresh expired, or permissions insufficient:** the activity returns a sanitized `reconnect required` or `permission required` outcome.
- **Provider temporarily unavailable:** the activity reports a retryable failure, subject to the workflow’s retry policy.

The workflow can then pause and notify Jane to reconnect, or fail according to policy. It must not silently fall back to an organization-wide credential.

For writes, retries need separate care: if the provider completed the PR creation but the worker lost the response, a retry could create a duplicate. Use provider-supported idempotency or a reconciliation strategy; token handling alone doesn’t provide exactly-once execution.

### What the payload codec does

Even when credentials are absent, other data in a workflow might be sensitive: a user’s request, an incident description, an external API response, or potentially PHI.

A **payload codec** runs in the Temporal client and worker:

```text
Application value
  → serialize
  → encrypt with payload codec
  → Temporal stores encrypted payload

Temporal returns payload
  → decrypt with payload codec
  → deserialize
  → application value
```

The Temporal service stores the encrypted payload; authorized clients and workers need access to the appropriate decryption keys. The codec is configured on **both clients and workers** that send or read the affected payloads. See Temporal’s [TypeScript payload-encryption documentation](https://docs.temporal.io/develop/typescript/best-practices/data-handling/data-encryption).

A production implementation would need:

- An approved authenticated-encryption scheme and key-management system.
- Key IDs and a rotation plan that keeps old histories decryptable for their retention period.
- A policy for when workers cannot reach the key service: fail explicitly rather than writing plaintext.
- Compatibility and replay testing across deployments and key rotations.
- Controls for clients, workers, and any other tool that can decrypt payloads.

Encryption occurs outside workflow business logic; the workflow still needs to obey Temporal’s determinism rules.

### What encryption does **not** automatically cover

A payload codec is not a blanket guarantee for every field or system. In particular:

- Don’t put sensitive values in workflow IDs, task-queue names, or search attributes; treat operational metadata as visible unless verified otherwise.
- Failure messages and stack traces require separate attention. Temporal documents a **failure converter** for protecting common failure attributes; don’t assume the payload codec alone covers every error string.
- Logs, traces, metrics, external object storage, backups, and provider audit logs have their own protection requirements.
- Workers necessarily see decrypted data while processing it. They remain part of the sensitive-data security boundary.

For particularly sensitive or large inputs, we can also use an **encrypted external store** and put only a reference in the workflow. That reduces what is persisted in Temporal, but the external store then needs its own access control, retention, availability, and deletion design.

### What the optional codec server does

A codec server is a separate service that can decode encrypted payloads for the Temporal UI or CLI. Without it, an operator viewing history generally sees encoded/encrypted payloads; workflows can still run because clients and workers have the codec.

For a regulated deployment, I would make this an **explicit operational choice**:

- No codec server if operators don’t need to inspect payload contents.
- If one is needed, strongly authenticate and authorize access, restrict network exposure, audit decoding, and ensure the server only decrypts data the requester is entitled to inspect.

It is a powerful access path: anyone permitted to decode payloads may be able to see sensitive workflow data. See Temporal’s [codec server documentation](https://docs.temporal.io/codec-server).

### Practical scope for our platform

A first production slice would involve:

1. **Define safe activity contracts:** references and sanitized results only; no provider credentials.
2. **Build or integrate the credential gateway/broker:** trusted run binding, policy checks, credential use, and reconnect outcomes.
3. **Configure a payload codec** for the relevant Temporal clients and workers, backed by managed keys.
4. **Review metadata, errors, logs, and traces** for leakage; configure failure handling separately.
5. **Test** history and activity results for absence of tokens, concurrent execution and retries, revoked credentials, key rotation, and worker restart/replay.
6. **Decide whether operators need a codec server**, and secure it if they do.

The main principle is: **Temporal coordinates the work; the activity obtains authority to perform it at the moment of execution.** Payload encryption is additional protection for the data Temporal legitimately needs to retain—not permission to put credentials in the workflow.