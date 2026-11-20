# Permissions, RBAC, and OPA

## Service-Account Tokens

Choosing between Backstage **Auth Providers** (user-delegated auth via the user's token for a platform like GitHub) and **Service-Account Tokens** (app-level auth) is one of the most critical decisions for agentic workflows.

Because your plugins power **AI agents** that act on behalf of users or infrastructure, the choice impacts security, auditability, and what the agent is allowed to do.

## Backstage Auth Providers (User Token Flow)

This approach authenticates the individual Backstage user using OAuth2.0. The agent acts explicitly **on behalf of that specific logged-in user**.

**How it works:** When a user triggers an agentic workflow (like `kubernetes-ai-responder`), Backstage uses its `AuthAPI` to request an OAuth token for that user (e.g., their personal GitHub, Slack, or Jira token) and forwards it to the plugin.

### **Pros**

- **Inherited Permissions:** The AI agent can only see and touch what that exact user has access to. A junior engineer cannot accidentally use an agent to delete a production database via Datadog.
- **Perfect Auditing:** Third-party system logs will show *"Action performed by Jane Doe via Backstage App."*

### **Cons**

- **Background Failure:** AI agents running on background crons or webhooks (like `alert-ai-tuner` scanning logs at 2:00 AM) will **fail** because there is no logged-in user to provide a token.
- **Token Expiration:** If a workflow takes a long time, the user's OAuth token might expire mid-execution.

## Service-Account Tokens (App-Level Flow)

This approach uses a single, centralized credential (API key, App Token, or Client Secret) hardcoded into the Backstage backend configuration (`app-config.yaml`).

**How it works:** The agent bypasses user identity completely. It talks to PagerDuty, Slack, or Datadog using a master "Backstage Bot" account.

### **Pros**

- **Always Available:** Perfect for autonomous or asynchronous agents (e.g., `oncall-ai-handover-assistant` compiling data automatically at shift change).
- **Simpler Setup:** Users do not have to continuously log into external tools inside Backstage.

### **Cons**

- **Over-Privileged AI:** The agent typically operates with broad admin or read-all access. A prompt-injection attack or an AI hallucination could lead to data leaks or unintended actions across the entire company.
- **Poor Auditing:** Every single action in Jira or Slack looks like it was done by `backstage-bot`, hiding who actually prompted the AI.

## The Verdict: A Hybrid Strategy for AI Agents

For agentic workflows, you usually cannot choose just one. You should apply them based on the **nature of the plugin**:

| Plugin Type                             | Recommended Auth Method                            | Reason                                                       |
| --------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| **Observability** (`datadog`, `splunk`) | **Service-Account**                                | Agents need to read raw infrastructure metrics and logs. Individual user tokens for tools like Splunk are notoriously difficult to manage or restrict. |
| **Incident Management** (`pagerduty`)   | **Service-Account** (Read) / **User Auth** (Write) | Reading who is on call can use a bot token. Acknowledge, resolve, or override actions should require the user's token. |
| **Project Management** (`jira`)         | **User Auth**                                      | AI agents creating or assigning tickets must do so under the author's real identity for accurate project history. |
| **Communication** (`slack`)             | **Hybrid:** **Service-Account** / **User Auth**    | Bot tokens are best for posting automated summaries to public channels. User tokens are required if the agent needs to read private DMs or post *as* the user. |

## What is Open Policy Agent (OPA)?

**Open Policy Agent (OPA)** **is an open-source, general-purpose policy engine** that unifies and decouples policy enforcement from application code. Instead of hardcoding authorization logic (like role checks or access control lists) directly into your software, you offload those decisions to OPA.

- **The Language:** Policies are written in a declarative, domain-specific language called **Rego**.
- **The Process:** Your application sends a JSON query to OPA containing context (e.g., *Who is the user? What action are they trying to take? What resource are they accessing?*). OPA evaluates this against your Rego rules and returns a structured JSON decision (such as `allow: true` or conditional filters).

### How Common is OPA with Spotify Backstage IDP?

Using OPA with Spotify Backstage is **moderately common and growing rapidly**, particularly in large enterprise environments.

By default, Backstage provides a built-in standard **Permission Framework**. However, as an Internal Developer Portal (IDP) scales, managing Role-Based Access Control (RBAC) directly inside TypeScript code or redeploying the portal just to tweak a permission rule becomes a bottleneck. Platform engineering teams turn to OPA because it allows them to centralize organization-wide security policies, updating access rules instantly without altering or redeploying the Backstage codebase.

### How is the Integration Done?

Integrating OPA with Backstage does **not** typically require building an in-house custom plugin from scratch. Instead, it relies on community-supported ecosystem wrappers.

The integration is primarily handled using the **Backstage OPA Permissions Wrapper Plugin**.

![Backstage-OPA-Permissions-Wrapper-Plugin](/home/kevin/Repos/ai-crew-suite/platform/docs/incoming/images/Backstage-OPA-Permissions-Wrapper-Plugin.jpg)

#### Step-by-Step Implementation:

1. **Install the Wrapper:** You add the OPA permission backend module to your Backstage backend application. This acts as an extension to Backstage’s native permission framework.
2. **Intercept Requests:** When a user attempts an action (e.g., viewing a software catalog component or deleting a backend resource), Backstage generates an authorization request. The OPA wrapper intercepts this request and forwards the user's identity and action metadata to OPA.
3. **Evaluate via Rego:** OPA runs the request against your external Rego policies.
4. ***\*Enforce Decisions:\**** OPA returns a decision back to the plugin. This can be a hard ***\*boolean decision\**** (`allow`/`deny`) or a ***\*conditional decision\****. For example, if a user wants to read catalog entities, OPA can return a conditional filter ensuring they only see entities owned by their specific team.

## Why the Tool Registry is the Wrong Enforcement Layer

While the tool registry *needs* to store metadata about which roles or permissions are required to execute a tool, the actual **authorization enforcement should happen at the API layer (the Backend Plugin entry point) or within an isolated Execution Engine / Guardrail layer.**

1. **Separation of Concerns:** A registry should be a passive directory of capabilities (a "lookup phonebook"). Mixing data storage with enforcement logic complicates the registry's codebase, slows down queries, and makes it difficult to audit policies independently.
2. **The "Agent Over-Privilege" Problem:** Agents don't just call tools; they reason about them. If the registry filters out tools before the agent can even see them, the agent won't understand *why* it can't fulfill a request, breaking the "fluent" experience. Conversely, if the registry lets the agent see everything, the agent might write a plan to call a restricted tool. Enforcement must catch the request *before* the driver executes.
3. **Data Mutation Disconnect:** If your registry moves to a distributed architecture (PostgreSQL or Redis), putting complex, dynamic RBAC evaluation inside it creates a synchronization nightmare. OPA policies or Backstage permissions update state independently of your tool definitions.

### The Recommended Architecture: Layered Access Control

Instead of putting enforcement inside the registry, place it at the **Ingress (API/Plugin Layer)** and the **Egress (Execution/Guardrail Layer)**.

![layered-access-control](/home/kevin/Repos/ai-crew-suite/platform/docs/incoming/images/layered-access-control.jpg)

#### Layer 1: Ingress Access Control (Backstage Permission Framework / OPA)

- **Where:** The entry-point routers of your Core Backend Plugin.
- **What it does:** Checks if the interacting user has the high-level right to trigger the agent or use the workflow engine at all.
- **How:** It leverages native Backstage permissions. If a user shouldn't be running agents, they get blocked right here.

#### Layer 2: Pre-Execution Guardrail (Where OPA shines for Agents)

- **Where:** Inside your agent's execution loop, *right before* a tool driver is actually invoked.
- **What it does:** The Tool Registry supplies the **metadata** (e.g., `tool_id: "pagerduty-trigger-incident"`, `required_role: "sre-lead"`). The execution engine sends a JSON payload to OPA containing:
  1. The **User Context** (Claims from the Backstage Identity token).
  2. The **Tool Metadata** fetched from the registry.
  3. The **Runtime Context** (e.g., what parameters the agent is passing to the tool—like trying to delete a production dashboard vs. reading a dev metric).
- **Why this works:** OPA evaluates the combination of user + tool + arguments dynamically. Because the drivers use system credentials, this layer acts as your hard sandbox boundary.

### How to Structure the Tool Registry Metadata

To support this design, the Tool Registry should strictly store the **policy requirements** as static metadata, but not execute them.

```json
{
  "tool_id": "datadog-delete-dashboard",
  "display_name": "Delete Datadog Dashboard",
  "driver": "datadog",
  "security": {
    "required_permission": "datadog.dashboard.delete",
    "risk_level": "high"
  }
}
```

When your distributed registry (PostgreSQL/Redis) returns this tool definition, your core backend handles passing `security.required_permission` over to OPA alongside the user's active token to determine if the driver should fire.

## Handling Layer 2 (Pre-Execution Guardrail) Without OPA (Graceful Degradation)

If an end-user installs your plugin but does **not** run OPA, you do **not** have to lose granularity. Instead, you should design your Policy Enforcement Point (PEP) to use a **provider-agnostic architecture** (e.g., a Strategy Pattern).

In your plugin code, you define an `AuthorizationService` interface. You then provide two built-in implementations:

```text
[ PEP / AuthorizationService Interface ]
         ├──► [ Strategy A: Native Backstage Permission Evaluator ] (Default)
         └──► [ Strategy B: OPA Client Evaluator ]                  (Optional Config)
```

- **The Default Strategy (No OPA):** Your code falls back to using Backstage’s native `@backstage/plugin-permission-node` library. It passes the user's `BackstageIdentityResponse` and a custom permission definition (e.g., `executeToolPermission` with attributes like `toolId` or `riskLevel`) directly to Backstage’s own local policy evaluator.
- **The Result:** The system maintains high granularity. The only difference is that without OPA, the admin configures these granular rules inside the Backstage backend code (via a native `PermissionPolicy`), rather than in an external OPA Rego server.

### Your Code vs. OPA: What You Need to Worry About

From a code perspective, **the end-user's exact OPA infrastructure should remain entirely opaque to you.** You should **not** write OPA-specific client logic directly into your core plugin business logic.

What you need to do in code:

1. **Define Permissions:** Create standard Backstage permission definitions using `@backstage/plugin-permission-common`.
2. **Expose Metadata:** Ensure your execution loop feeds relevant metadata (like `toolId`, `driver`, `riskLevel`, and the target arguments) into Backstage's native `PermissionEvaluator`.

What you need to provide in docs:

Because ecosystem wrappers (like the *Roadie OPA Permissions Wrapper*) map native Backstage permission requests into JSON payloads sent to OPA, your job is simply documentation. You should outline:

- **The Permission Schema:** Document the exact keys, attributes, and resource types your plugin passes to the permission framework.
- **Sample Rego Policies:** Provide a copy-pasteable Rego snippet showing how an administrator can intercept your specific tool attributes to write a guardrail rule.

Example of what you would put in your documentation:

```markdown
package backstage.authz

default allow = false

# Allow anyone to run low-risk tools

allow {
    input.permission.name == "agent.tool.execute"
    input.resource.attributes.risk_level == "low"
}

# Only allow members of the SRE group to execute critical production tools

allow {
    input.permission.name == "agent.tool.execute"
    input.resource.attributes.tool_id == "pagerduty-trigger-incident"
    input.identity.claims.groups[_] == "group:default/sre-team"
}
```

## Other Authorization Systems Used with Backstage

While OPA dominates the *decoupled policy engine* space for cloud-native apps, there are other architectures and cloud platforms commonly tied to Backstage authorization. They generally fall into three categories:

### A. Fine-Grained Authorization (FGA) / ReBAC Systems

Instead of standard role-based access, some advanced enterprises look toward **Relationship-Based Access Control (ReBAC)**, inspired by Google's Zanzibar paper.

- **OpenFGA (by Okta Auth0):** A highly popular open-source FGA engine. Platform teams use it with Backstage to determine access via complex relationships (e.g., *"If User A is a member of Team B, and Team B owns Repository C, then User A can execute a PagerDuty tool on Component C"*).

### B. Cloud and Identity Provider (IdP) Groups

For many organizations, the ideal state is avoiding access-control logic inside Backstage entirely. They push group logic back up to their corporate cloud identity stack:

- **Entra ID (Azure AD), Okta, and Keycloak:** Organizations use Backstage's ingestion engine to sync corporate groups directly into the Backstage Catalog. The native Backstage backend is then configured with lightweight rules saying: `if (user.groups.includes('azure-sre-admin')) { allow() }`.

### Do you need to do anything special to support OpenFGA or Entra ID in your plugin code?

**No, you do not need to do anything special in your plugin code.**

Your code should remain completely agnostic to OpenFGA and Microsoft Entra ID. The Backstage ecosystem separates user authentication/ingestion from authorization checks:

![auth](/home/kevin/Repos/ai-crew-suite/platform/docs/Implementation/images/auth.jpg)

- **For Entra ID (Azure AD):** Entra ID is handled purely at the **Backstage infrastructure layer**. The organization sets up an Entra ID Auth Provider and an Org Catalog Ingestion provider. This imports the user's Microsoft security groups (e.g., `group:default/sre-admins`) directly into the Backstage Catalog as `Group` entities. Inside your plugin code, you simply fetch the user’s `BackstageIdentityResponse` payload, which natively lists these groups.
- **For OpenFGA:** Just like OPA, OpenFGA hooks directly into the core **Backstage Permission Framework** via an adapter plugin. When your plugin issues a standard `permissionEvaluator.authorize()` call, the OpenFGA adapter intercepts it, translates your parameters into a relation tuple query, and handles the handshake.

### What you must write in your plugin code:

To guarantee seamless support for *any* downstream auth engine, your plugin only needs to export standard, native Backstage permission definitions using `@backstage/plugin-permission-common`. For example:

```typescript
import { createPermission } from '@backstage/plugin-permission-common';

export const agentToolExecutePermission = createPermission({
  name: 'agent.tool.execute',
  attributes: {
    action: 'update',
  },
  resourceType: 'agent-tool', // Defines the resource scope for external evaluation
});
```

As long as your plugin feeds the execution metadata (`toolId`, `riskLevel`) into this resource context during evaluation, OpenFGA or Entra ID dynamic rules will look at it flawlessly.

### Do AWS, Google Cloud, and other platforms have similar identity structures used with Backstage?

**Yes. Every major hyperscaler and enterprise Identity Provider (IdP) has a mirrored capability** for pulling groups and authenticating users inside Backstage.

Large organizations sync these specific platforms into Backstage depending on their architecture:

| Cloud / Identity Platform | How it maps into Backstage | Common Enterprise Use Case |
| --- | --- | --- |
| **Microsoft Entra ID** | Ingested via Microsoft Graph API into Catalog `Group` entities. | Mapping corporate Active Directory teams directly to tool execution rules. |
| **Okta** | Ingested via Okta Org API into Catalog `Group` entities.     | Centralized enterprise lifecycle management and SSO. |
| **Google Cloud (GCP Workspace)** | Ingested via Google Directory API into Catalog `Group` entities. | Teams heavily reliant on G Suite/Google Cloud IAM infrastructure. |
| **AWS ALB Auth** | Authenticates incoming headers when Backstage sits behind an AWS Application Load Balancer. | Decoupled cloud network ingress authentication. |

### The Architectural Takeaway for Your Agent API

Because your tool registry's drivers are executing actions using **system credentials** (e.g., a shared administrative token for Datadog or PagerDuty), your plugin must trust Backstage to supply a unified list of group ownerships, regardless of whether those groups originated from AWS IAM, Entra ID, or Okta.

By designing your fluent API to strictly ask Backstage's Permission Framework: *"Is user X allowed to execute tool Y with parameters Z?"*, your code remains beautifully decoupled from the shifting corporate identity infrastructure of your end users.

## Core Crew Suite Backend Plugin Router Implementation of RBAC

Here is a structural blueprint for how your **Core Backend Plugin's Router** should intercept incoming requests, extract the user's identity, gather tool parameters, and pass them to the Backstage **`PermissionEvaluator`** before executing any tool drivers.

This architecture leverages modern Backstage practices (such as the new **`coreServices`** system introduced in the Backstage Backend System upgrade).

```typescript
import { createBackendPlugin, coreServices } from '@backstage/backend-plugin-api';
import { Router } from 'express';
import RouterBuilder from 'express-promise-router';
import { InputError, NotAllowedError } from '@backstage/errors';
import { createPermission } from '@backstage/plugin-permission-common';

// 1. Define the granular tool execution permission
export const agentToolExecutePermission = createPermission({
  name: 'agent.tool.execute',
  attributes: { action: 'update' },
  resourceType: 'agent-tool',
});

// 2. Create the backend plugin wrapper
export const agentWorkflowPlugin = createBackendPlugin({
  pluginId: 'agent-workflows',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        permissions: coreServices.permissions,
        identity: coreServices.identity,
        // Assuming your tool registry service is injected here
        toolRegistry: myCustomToolRegistryServiceRef, 
      },
      async init({ httpRouter, permissions, identity, toolRegistry }) {
        
        const router = RouterBuilder();
        router.use(Router.json());

        // POST Route to trigger a tool execution
        router.post('/execute/:toolId', async (req, res, next) => {
          try {
            const { toolId } = req.params;
            const { toolArguments } = req.body; // e.g., { "dashboardId": "123" }

            // A. Fetch tool metadata from your tool registry
            const toolMeta = await toolRegistry.getToolById(toolId);
            if (!toolMeta) {
              throw new InputError(`Tool ${toolId} not found in registry.`);
            }

            // B. Extract the interacting user's credentials from incoming request headers
            const credentials = await identity.getCredentials(req);
            
            // C. Pass the token and structured parameters to the PermissionEvaluator
            const decision = await permissions.authorize(
              [
                {
                  permission: agentToolExecutePermission,
                  // The resourceRef serves as the unique identifier for target evaluations
                  resourceRef: toolId, 
                  // Resource context mapping (crucial for OPA, OpenFGA, and native policy checks)
                  resourceContext: {
                    toolId: toolId,
                    driver: toolMeta.driver,         // e.g., 'datadog'
                    riskLevel: toolMeta.riskLevel,   // e.g., 'high'
                    arguments: toolArguments,         // Runtime context payload
                  },
                },
              ],
              { credentials } // Automatically binds the caller's identity (Entra ID, Okta, etc.)
            );

            // D. Evaluate the authorization decision
            if (decision[0].result === 'DENY') {
              throw new NotAllowedError(
                `User is not authorized to execute tool: ${toolId}`
              );
            }

            // E. Safe to execute elevated system credentials now!
            // const executionResult = await toolRegistry.executeDriver(toolId, toolArguments);
            
            res.json({ status: 'success', data: { message: "Tool executed successfully" } });
          } catch (error) {
            next(error);
          }
        });

        httpRouter.use(router);
      },
    });
  },
});
```

### Why this structure solves your requirements perfectly:

1. **`identity.getCredentials(req)`**: This natively unpacks the incoming authorization tokens. Whether the end user logged into Backstage via **Entra ID, Okta, or Google Cloud**, Backstage converts that authentication into its internal `credentials` object. You do not have to parse JWTs manually.
2. **`resourceContext`**: This is where you pass down the exact metadata parameters from your distributed registry (`driver`, `riskLevel`) along with the live `arguments`. If the system is using **OPA**, the OPA wrapper converts this exact payload into a JSON string and fires it to the Rego rules engine. If it uses **Spotify RBAC or OpenFGA**, their respective adapters parse these dictionary attributes to validate access.
3. **Decoupled execution**: If `permissions.authorize` returns `DENY`, the request drops immediately. Your actual driver layer containing the sensitive **system credentials** is never invoked and remains perfectly sandboxed.
