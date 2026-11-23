# Server-Side Token Broker Scope of Work

This SOW aligns tightly with a **Capability Catalog + Capability Gateway + Temporal** architecture:

- **Separation of concerns (Section E & F):** Keeping token custody inside the gateway/broker boundary, passing only opaque connection/grant references through Temporal workflow state, and checking user standing at execution time rather than exposing a raw `getToken(userId)` API.
- **Provider edge cases (Section A & D):** Accounting for single-use rotating refresh tokens (such as GitHub App `ghr_` tokens, which expire after 6 months and invalidate both the old refresh token and old `ghu_` access token immediately upon refresh) and cross-worker concurrency locks.
- **Account binding on resume (Section B & F):** Ensuring that reconnecting a paused Temporal run verifies the exact upstream account identity (`sub` / provider user ID) and instance so a user cannot accidentally swap accounts mid-workflow.

### A. Provider and authorization design

Before writing a general broker, we need to choose the first provider and answer:

- Which authorization model: for GitHub, for example, **GitHub App user access** versus an OAuth App?
- Does that model support offline access and refresh tokens in the customer’s configuration?
- Which permissions are required, and can consent be narrowed by capability?
- Can an existing enterprise identity/token broker provide the credential instead?

Provider differences matter. For example, GitHub documents that an **expiring GitHub App user access token** comes with a refresh token; using it returns a new pair and invalidates the old pair. It also documents that GitHub App permissions differ from ordinary OAuth scopes. See [GitHub’s refresh-token documentation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens).

**Deliverable:** an explicit provider adapter contract and a supported-authentication matrix. This is not “implement OAuth once and every provider works.”

### B. Connection and consent UX

The user needs to be able to:

- Connect a provider account and understand the requested permissions.
- See which account and provider instance are connected.
- See connection state: connected, insufficient permission, expired, revoked, or reconnect required.
- Disconnect and, where supported, revoke the provider authorization.
- Reconnect a paused run without inadvertently changing it to a different provider account.

The backend must securely bind the OAuth callback to the initiating Backstage user and provider instance, protect the flow against CSRF and callback substitution, and use PKCE where supported or required.

**Deliverable:** connection settings UI, backend endpoints, callback handling, and clear recovery states.

### C. Secure credential storage

The broker needs durable storage for grants, with controls such as:

- Encryption using a key-management service, with key rotation and restricted decrypt permissions.
- Separate encryption / storage of secrets from ordinary connection metadata.
- Database access restrictions, secure backups, retention and deletion procedures.
- No tokens in logs, audit events, error messages, traces, URLs, or Temporal history.
- A plan for secret leakage, key compromise, recovery, and revocation.

**Envelope encryption** generally means encrypting credential data with a data key and protecting that data key with a KMS-managed key. It is an implementation choice, not a compliance certification by itself.

**Deliverable:** a credential-store interface, an initial production storage implementation, operational procedures, and tests for secret handling.

### D. Token acquisition and refresh

This is where long-running, multi-worker operation becomes tricky:

- Cache access tokens for their usable lifetime, if appropriate.
- Refresh before expiry, allowing for clock skew.
- Coordinate refreshes **across backend instances**, not just within one process.
- Persist rotated refresh tokens safely. A crash or lost response after a provider invalidates the old token can require reconnecting; a database transaction cannot make the external provider and our database one atomic operation.
- Classify temporary provider failures separately from expired, revoked, or insufficient grants.

**Deliverable:** provider adapters, refresh coordination, failure handling, and concurrency/recovery tests.

### E. Gateway authorization and use

The broker should not simply expose “give me Jane’s token” to arbitrary plugins. Prefer an interface closer to:

```text
perform this approved capability
for this user and agent
against this provider instance and target
using user standing
```

The gateway verifies policy before the token is resolved and used. If a separate broker and gateway are deployed, their service-to-service boundary must authenticate the gateway and restrict what it can request. Backstage’s service authentication helps authenticate services, but it does not by itself establish that every request to use Jane’s provider credential is authorized.

**Deliverable:** a narrow internal API, policy enforcement, and audit events recording *who used which connection for what*, without recording secrets.

### F. Temporal and long-running behavior

The workflow should persist identifiers and references, never token material. The activity obtains a token at execution time, after checking the relevant authorization.

We also need an explicit policy for a user who loses access or is disabled **after** starting a run:

- Recheck at each action, or at another defined checkpoint.
- Decide whether the run pauses for reconnection, fails, or expires.
- Ensure reconnecting resumes the intended run only after the user and authorization are verified.
- Ensure retries don’t duplicate external writes; a credential broker does not solve write idempotency.

**Deliverable:** activity integration, workflow state transitions, and tests covering expiration, revocation, retries, and re-consent.

### G. Operations and assurance

Enterprise readiness also means:

- Audit trails for connect, disconnect, token use, refresh failures, and administrative actions.
- Metrics and alerts for failed refreshes, revoked grants, KMS failures, and provider outages.
- Provider onboarding documentation and incident runbooks.
- Security review and tests for identity mix-ups, unauthorized token use, secret leakage, concurrent refresh, and user offboarding.

### How big is it?

These are **rough planning ranges, not estimates based on a repository assessment**. They assume an experienced engineer, a chosen design, and available infrastructure:

| Scope                            | Rough effort         | Includes                                                     |
| -------------------------------- | -------------------- | ------------------------------------------------------------ |
| **Discovery / proof of concept** | 1–3 engineer-weeks   | One provider flow, verify offline access and Backstage integration; not production-ready |
| **First production provider**    | 8–16+ engineer-weeks | Consent UX, secure storage, refresh/rotation, gateway authorization, Temporal integration, testing, operational controls |
| **Each additional provider**     | 2–6+ engineer-weeks  | Provider-specific integration, permissions, edge cases, tests, and docs; more if its auth model differs substantially |

Calendar time can be longer due to security review, infrastructure, product decisions, and customer approval. An existing enterprise token broker could reduce the implementation substantially; complex multi-tenant requirements or strict enterprise assurance could increase it.

### Alternatives worth evaluating first

1. **Use an existing enterprise broker.** Our gateway requests or uses credentials through a customer-approved system rather than owning the refresh-token store.
2. **Use user credentials only while the user is present.** Simpler, but a long-running operation must pause and ask them to reconnect when needed.
3. **Use a service identity for selected operations.** Avoids user refresh tokens, but changes the authority model: a service credential must not silently substitute for user access, and policy must explicitly authorize it.

My recommendation is to **validate one provider and one concrete workflow first**, including whether the customer already has a suitable broker. That will reveal whether we need to build a durable broker and what its first production scope actually is.

## Token Broker & Vault Ecosystem

Token brokers for agentic workflows fall into three architectural categories depending on whether they only manage OAuth handshakes/refreshing or also act as an execution proxy/gateway:

- **Dedicated OAuth & Credential Brokers (Auth-Only).** These handle the OAuth consent redirect, encrypt tokens at rest, auto-refresh expired tokens, and hand short-lived credentials to your backend runtime via an API.
  - **Nango:** Supports 1,200+ APIs out of the box. Has a free self-hosted Docker/Kubernetes mode that includes core API Auth and Proxy capabilities (while gating syncs, webhooks, and OTel behind Enterprise).
  - **Auth0 Token Vault:** Commercial SaaS extension to Auth0 that links external provider tokens (GitHub, Slack, Google) to a user's Auth0 identity with SDK helpers for Vercel AI SDK.
  - **Scalekit:** Purpose-built agent auth and token vault supporting headless OAuth flows, MCP auth, and VPC/self-hosted enterprise deployments.
  - **WorkOS** / \**Clerk:** Enterprise identity providers that store third-party OAuth access/refresh tokens attached to user profiles and expose APIs to retrieve fresh provider tokens on demand.
- **Agentic Tool Gateways & Execution Brokers (Auth + Execution).** These sit in the tool-calling path so your workflow runtime or LLM never sees raw provider tokens—only opaque connection handles.
  - **Arcade:** Stores per-user tokens in an encrypted vault and injects credentials at tool execution time. Supports Helm-based Kubernetes self-hosting.
  - **Composio:** Provides managed OAuth apps, token refresh, and a proxy execution layer. Self-hosting is restricted to Enterprise contracts.
  - **Kong Token Vault:** Gateway-level vault that intercepts agent/MCP traffic, injects/refreshes OAuth tokens at the edge, and enforces policy before forwarding requests.
- **Open-Source Identity & Secret Brokers (DIY / Infrastructure-Level).**
  - **Zalando Agentic Identity Broker:** Open-source broker built specifically for AI agents and MCP servers. It manages OAuth2 on-behalf-of (OBO) delegation chains, token exchange, and a built-in user consent UI.
  - **Keycloak* (with Identity Brokering / Token Exchange):** Standard open-source IAM that can store upstream IdP tokens (GitHub, GitLab, Google) when users link accounts and exchange a user's Backstage JWT for an upstream provider token via RFC 8693 Token Exchange.
  - **HashiCorp Vault:** Works well for machine-to-machine or dynamic short-lived credentials (AWS STS, database creds) via JWT auth, though it lacks built-in user-facing OAuth consent/refresh flows.

## Choosing a Default Self-Hosted Provider

For a Backstage plugin architecture where you want a clean provider abstraction (e.g., an extension point where enterprises can swap in Auth0, Arcade, or internal vaults) plus a zero-friction local cluster default:

| Option | Local Cluster Setup | Trade-offs for a Default Provider |
| --- | --- | --- |
| **Nango (Free Self-Hosted)** | Single `docker-compose` or Helm deployment backed by Postgres. | **Best out-of-the-box DX.** Handles OAuth dance, PKCE, and refresh quirks for 1,200+ services. Trade-off: Source-available (Elastic License 2.0) and free tier omits audit logs and OTel export. |
| **Zalando Agentic Identity Broker** | Lightweight container deployment designed for Kubernetes + MCP/agent gateways. | **Best open-source agent-native fit.** Includes a consent UI and RFC 8693 delegation chains without commercial feature gating. Trade-off: Newer project with fewer pre-configured SaaS OAuth templates than Nango. |
| **Keycloak** | Official containers/Helm charts; widely used in local Backstage dev setups. | **Best pure Apache 2.0 enterprise standard.** Many Backstage users already run it for login. Trade-off: Requires more upfront realm/broker configuration to act as a multi-service OAuth token store. |

**Recommendation:** Model your core Backstage token-broker interface around **opaque connection / grant IDs** (rather than raw tokens), and build your default local driver against **Nango's free self-hosted Auth + Proxy AP** or **Keycloak**.