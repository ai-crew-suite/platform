# Scaffolder Notes

We originally had this broken out as a separate driver. But it involves the internal Backstage scaffolder functionality. This was the note we had previously:

> Policy Registries are evaluated by the role nodes to verify that variable metrics (such as allowing public access blocks or provisioning non-standard storage sizes) do not violate enterprise platform engineering guardrails.

Based on your note and architectural context, this specific mechanism is referring to **Infrastructure-as-Code (IaC) compliance checking and cloud posture governance** rather than typical runtime user authentication.

In a platform engineering ecosystem centered around Backstage, when an agent or a developer tries to provision cloud resources (like an S3 bucket or an AWS EBS volume), the system must verify that "variable metrics" (e.g., trying to enable public access or requesting a non-standard 10TB drive) don't violate enterprise guardrails.

### The Industry Standard Vocabulary

**Policy Enforcement Point (PEP)** is a generic security architecture term, not a native Backstage-specific construct. It comes from the global industry standard for enterprise access control architectures (specifically defined in **XACML** and adopted across zero-trust frameworks).

When designing enterprise platform architectures, access control is broken down into four distinct abstractions:

- **PEP (Policy Enforcement Point):** The place that intercepts user actions, asks for a decision, and blocks or allows the action based on the answer. *In your architecture, your Backend Plugin Router or your Compliance Wrapper acts as the PEP.*
- **PDP (Policy Decision Point):** The brains that evaluate rules to give an answer. *OPA, OpenFGA, or Backstage’s internal permission engine serve as the PDP.*
- **PAP (Policy Administration Point):** Where the rules are created and stored. *Your Git policy registry, the Spotify GUI, or an administrative dashboard serve as the PAP.*
- **PIP (Policy Information Point):** The source of extra data needed to make a choice. *The Backstage Software Catalog or a user groups database act as the PIP.*

### Does Backstage Have a Native Equivalent?

Yes. While Backstage follows this pattern, it uses slightly different terminology in its code base:

| Standard Generic Term                 | Native Backstage Equivalent                                  |
| ------------------------------------- | ------------------------------------------------------------ |
| **PEP** (Policy Enforcement Point)    | **`PermissionEvaluator` / `authorize` hooks**                |
| **PDP** (Policy Decision Point)       | **`PermissionPolicy` (the local authorization backend module)** |
| **PAP** (Policy Administration Point) | **`app-config.yaml` / Commercial RBAC Plugin UI**            |
| **PIP** (Policy Information Point)    | **`CatalogClient` / Catalog Graph Data**                     |

## The Built-In Approach: Backstage Software Templates & Scaffolder

If this workflow happens during resource creation, it uses the built-in **Backstage Scaffolder (Software Templates)**.

- **How it works:** Backstage uses **JSON Schema** to define the inputs a user (or your agentic workflow) can pass when provisioning a new component.
- **The Guardrail:** You can embed validation logic directly into the template's schema using `ui:options` or custom frontend/backend validation rules. For example, you can write a regex validation to reject non-standard storage sizes or block a boolean toggle like `publicAccess: true` before the backend execution engine ever takes over.

## The Dominant Third-Party Plug-in Approach: OPA + Conftest / Terrascan

Your note explicitly references **"Policy Registries"** and **"Platform Engineering Guardrails."** In large cloud organizations using Backstage, this almost universally points to integrating **Open Policy Agent (OPA)** via static analysis tools like **[Conftest](https://www.conftest.dev/)** or **[Terrascan](https://runterrascan.io/)** inside the deployment pipeline.

```text
[ Agent Workflow / Scaffolder ] ➔ Generates IaC (Terraform / K8s Manifests)
                                          │
                                          ▼
                         [ Backstage Scaffolder Backend Task ]
                                          │
    (Evaluates Guardrails)                ▼
   [ Policy Registry ] ◄───────── [ Conftest / OPA ]
  (Rego files check metrics)              │
                                          ▼
                        [ Target Cloud / Role Nodes Deployment ]
```

How it fits your exact note:

1. **The Policy Registry:** A centralized Git repository where the cloud infrastructure team stores enterprise compliance rules written in Rego (e.g., *"Storage sizes must be between 10GB and 100GB"* or *"S3 bucket public access blocks must be set to true"*).
2. **Evaluation by "Role Nodes":** In this context, "role nodes" likely refers to the target deployment executors (like a Kubernetes Admission Controller running OPA Gatekeeper, or a CI/CD runner executing a specific IAM execution role).
3. **The Backstage Integration:** When your agentic backend plugin uses a "driver" to provision something, it generates a manifest (like Terraform or crossplane configuration). Before applying it, the plugin invokes a wrapper that pipes the manifest through OPA/Conftest. If the resource parameters ("variable metrics") violate the policy registry, the deployment is aborted, and the error is bubbled back up to the agent.

## How to integrate this into your Design Document

Since you are writing an agentic workflow platform that uses drivers, you should position this note under a **"Pre-Deployment Compliance & Guardrails"** section.

Instead of building custom schema validators for every external platform (Datadog, Pagerduty, AWS), your core plugin can support a **Dry-Run / Linting phase**. When an agent generates a configuration payload:

- The core plugin outputs the raw configuration JSON.
- It passes that JSON to an OPA validation step (using your documentation's sample Rego policies).
- If OPA flags a violation (e.g., `storage_size > 100`), the engine halts execution before passing the command to the system-credential-heavy driver.

## Implementing a Policy Enforcement Point

In this platform engineering pattern, your **wrapper acts as a Policy Enforcement Point (PEP)** sitting cleanly between your core plugin's orchestrator and the execution driver.

Because you want your plugin to remain lightweight and decoupled from the customer's actual environment variables, you do **not** want to bundle a massive binary like Conftest or execute un-isolated bash subprocesses directly in your plugin code.

Instead, the wrapper uses a structured **in-memory JSON translation pattern**. Here is exactly how that wrapper intercepts, tests, and evaluates manifests before firing a tool driver.

# The Architecture Workflow

Instead of writing custom wrappers for every format (Terraform HCL, Kubernetes YAML, Crossplane), your code abstracts the step by taking advantage of OPA and Conftest's native ability to parse **arbitrary JSON structure**.

```text
[ Your Agent Workflow ]
          │ (Generates Manifest Object)
          ▼
[ Your Plugin's Core Orchestrator ]
          │ 
          ▼
[ Compliance Wrapper (The Guardrail PEP) ]
          │ 
          ├── 1. Serialize manifest object to standard JSON.
          ├── 2. HTTP POST JSON payload to the OPA / Conftest service endpoint.
          │
          ▼ [ OPA / Conftest Policy Engine ] (Evaluates enterprise Rego bundle)
          │
          ├── 3. Returns structured evaluation results (allow/deny + error metrics).
          │
          ▼
[ Evaluator Logic ]
          ├── Result: DENY ──► Short-circuit pipeline & bubble errors to Agent UI
          └── Result: ALLOW ─► Pass raw manifest object down to target Driver (AWS, Crossplane)
```

## Engineering Code Sketch: The Compliance Wrapper

You can build this logic into a modular helper service within your plugin's backend. This approach translates runtime values cleanly, allowing you to pass them over an internal network to the organization's validation engine.

```typescript
import { InputError, NotAllowedError } from '@backstage/errors';
import fetch from 'node-fetch'; // Or utilize Backstage's coreServices.fetchApi

interface ComplianceCheckOptions {
  toolId: string;
  driverName: string;
  // This is the raw manifest payload generated by your agent workflow
  manifest: Record<string, any>; 
}

export class InfrastructureComplianceWrapper {
  private readonly conftestUrl: string;

  constructor(config: { conftestUrl: string }) {
    // Usually points to an internal corporate sidecar or centralized OPA agent
    this.conftestUrl = config.conftestUrl || 'http://localhost:8181/v1/data/compliance';
  }

  /**
   * Pipes a generated manifest directly through policy registries before driver execution
   */
  async validateManifest(options: ComplianceCheckOptions): Promise<void> {
    const { toolId, driverName, manifest } = options;

    // 1. Structure the input payload so corporate Rego files can read it predictably
    const payload = {
      input: {
        metadata: {
          tool_id: toolId,
          driver: driverName,
          timestamp: new Date().toISOString(),
        },
        // Conftest/OPA natively treats this nested JSON block identically to parsed YAML/HCL
        resource_manifest: manifest, 
      },
    };

    try {
      // 2. Fire the in-memory payload to the local or centralized OPA evaluation engine
      const response = await fetch(this.conftestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Compliance service returned status code: ${response.status}`);
      }

      const result = await response.json();

      // 3. Inspect the standard OPA JSON structure mapping to compliance rules
      // (Assuming the enterprise Rego rule returns a list of violated constraints)
      if (result?.result?.deny && result.result.deny.length > 0) {
        const violations = result.result.deny.join('; ');
        
        // Block execution IMMEDIATELY before the driver handles system credentials
        throw new NotAllowedError(
          `Enterprise Platform Engineering Guardrail Violation: ${violations}`
        );
      }

      // Success: If there are no deny metrics, the wrapper resolves silently
    } catch (error: any) {
      if (error instanceof NotAllowedError) throw error;
      
      // Fail-Closed vs Fail-Open architecture posture toggle
      throw new InputError(`Compliance pipeline failed to evaluate: ${error.message}`);
    }
  }
}
```

### What this provides in your Design Document

1. **Format Agnostic Operations:** Your TypeScript backend code doesn't care whether the agent built a Crossplane CRD or a Terraform plan dictionary. The driver constructs a plain JavaScript Object, and your wrapper treats it cleanly as an `input.resource_manifest` block.
2. **Deterministic Pre-flight Sandbox:** This layout makes it easy to add a **"Dry-Run Mode"** to your agentic fluent API. The agent can construct a plan, send it down, trigger the wrapper, and discover if a value (like an un-encrypted volume) is blocked *before any expensive cloud state changes occur*.
3. ***\*No Heavy Code Dependencies:\**** End users configure the `conftestUrl` endpoint inside their standard `app-config.yaml` file. If they don't want compliance checking, you bypass the wrapper or instantiate a mock service that returns true out-of-the-box.

## Architecture

This greenfield architectural layout integrates both **Human-in-the-Loop (HIL) state orchestration** and **Pluggable Evaluation Engine adapters** for your 18 agentic workflow plugins.

By treating compliance errors as state machines, your open-source code remains highly flexible. This allows a startup to use basic local JSON validation, while a large enterprise can plug in a centralized Conftest or Terrascan server without changing your core plugin logic.

### The Async State Machine: Merging Auth, Governance, and HIL

When an agent triggers an action that is either **destructive** or **violates a policy that permits an override**, you cannot block the execution loop with a simple HTTP 403 response. Instead, you change the workflow’s lifecycle state.

#### The Authorization & Compliance Event Schema

When a tool execution fails an authorization check, your backend router surfaces a standard **`WorkflowEvent`** payload to your frontend UI components:

```json
{
  "eventId": "evt_01j8x2a9b3c4d5e6f7g8h9i0",
  "workflowId": "wf_datadog_cleanup_prod",
  "timestamp": "2026-09-29T15:00:00Z",
  "type": "EXECUTION_BLOCKED",
  "stage": "PRE_FLIGHT_GUARDRAIL",
  "severity": "HIGH",
  "error": {
    "code": "POLICY_VIOLATION",
    "message": "Enterprise platform engineering guardrails violated.",
    "reasons": [
      "Datadog monitor muting duration (48 hours) exceeds the maximum allowed 24 hours.",
      "Destructive action 'datadog.monitor.delete' requires explicit peer review or HIL approval."
    ]
  },
  "hil": {
    "status": "AWAITING_APPROVAL",
    "approvalType": "PEER_OVERRIDE",
    "requiredRoles": ["group:default/sre-leads"],
    "actionPayloadToken": "jwt_serialized_state_token_containing_original_payload"
  }
}
```

#### Frontend Mapping Strategy

- **For Hard Violations:** If the block is permanent, the UI renders the `error.reasons` collection inside an alert card, halting the agent loop.
- **For HIL Escalation:** If the block allows a workaround, the UI detects `hil.status == "AWAITING_APPROVAL"`. It uses the `requiredRoles` array to dynamically show an **"Approve Execution / Request Override"** interaction pane to users with matching claims, or displays a pending state for standard users.

#### Open-Source Flexibility: The Pluggable Governance Provider Architecture

To support different customer maturity levels (from simple configurations to complex setups with OPA, Conftest, or Terrascan), you can abstract your Policy Enforcement Point (PEP) using a **Strategy Pattern**.

Your core plugin backend defines a generic interface. End users choose their preferred compliance provider inside their standard Backstage `app-config.yaml` file:

```yaml
# app-config.yaml configuration variations
agenticWorkflows:
  # Option A: Simple Local Scaffolding Validation (Default)
  governance:
    provider: local-schema
    rulesPath: ./policies/basic-limits.json

  # Option B: Advanced Enterprise OPA/Conftest Deployment
  # governance:
  #   provider: conftest-http
  #   endpoint: http://internal.net
  #   failClosed: true
```

#### The TypeScript Provider Interface

Your core backend calls this interface directly inside the runtime loop:

```typescript
export interface GovernanceEvaluationResult {
  allowed: boolean;
  violations: string[];
  requiresHIL: boolean;
}

export interface GovernanceProvider {
  name: string;
  evaluateImperative(action: string, payload: Record<string, any>, context: any): Promise<GovernanceEvaluationResult>;
  evaluateDeclarative(manifest: Record<string, any>, context: any): Promise<GovernanceEvaluationResult>;
}
```

You can then bundle these pre-built, open-source compliance providers directly with your backend module:

1. **`LocalSchemaProvider` (Out-of-the-box):** Parses incoming arguments against a basic declarative JSON list of min/max values. It requires zero infrastructure dependencies, making it perfect for small development teams.
2. **`ConftestHttpProvider` (Enterprise):** Serializes the JSON configuration payload, makes an HTTP call to a Conftest sidecar, and parses standard target string outputs.
3. **`TerrascanProvider` (Enterprise IaC):** Runs whenever an agent generates declarative cloud templates (Terraform/Kubernetes/Crossplane), piping the files into a local binary or microservice hook.

### Blueprinting Your Design Document

When writing your greenfield design document, place this architecture under a **"State Orchestration & Governance Matrix"** heading.

Structure the section around these three foundational pillars:

- **The Unified Token Handshake:** The frontend automatically passes the user's Backstage Identity Token on every agent execution step.
- **The Non-Blocking PEP Execution:** The plugin orchestrator blocks backend tool execution without locking up frontend threads, changing the workflow state to `AWAITING_APPROVAL` when an exception triggers.
- **The Abstracted Compliance Hook:** State execution is decoupled from the downstream verification engine.

### Database State Schema (PostgreSQL & Redis)

Because you are planning for a distributed architecture, you want a **hybrid caching and persistence model**.

- **Redis** handles highly transient, short-lived streaming events and active agent execution steps.
- **PostgreSQL** serves as the hard ledger of record for tracking, auditing, and processing HIL requests that may sit open for hours or days while waiting for an engineer's approval.

#### PostgreSQL Ledger Schema

This schema uses standard PostgreSQL constraints to record and audit every workflow request. It stores the payload securely as an encrypted or signed token, or inside a native JSONB column.

```sql
-- Enums for workflow state transitions
CREATE TYPE hil_status AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE execution_type AS ENUM ('IMPERATIVE', 'DECLARATIVE');

CREATE TABLE agent_workflow_states (
    workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_ref VARCHAR(255) NOT NULL,            -- Backstage user string (e.g., 'user:default/alice')
    plugin_id VARCHAR(100) NOT NULL,           -- Which of the 18 plugin pairs triggered this
    tool_id VARCHAR(100) NOT NULL,             -- Specific tool registry entry
    exec_type execution_type NOT NULL,
    current_status hil_status DEFAULT 'PENDING_APPROVAL',
    
    -- Raw inputs generated by the agent before being blocked
    tool_payload JSONB NOT NULL,               
    
    -- Cache target governance evaluation results for auditing
    policy_violations TEXT[] DEFAULT '{}',     
    
    -- Targeted roles authorized to clear this specific block
    required_roles TEXT[] NOT NULL DEFAULT '{}', 
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Indexing for fast dashboard lookup for approvers
CREATE INDEX idx_workflow_pending_roles ON agent_workflow_states USING gin (required_roles) 
WHERE current_status = 'PENDING_APPROVAL';

CREATE INDEX idx_workflow_user ON agent_workflow_states(user_ref);
```

#### Redis Ephemeral State Caching

While PostgreSQL holds the ledger, your distributed backend execution instances use **Redis** to synchronize the live state machine via Pub/Sub or key expiration keys.

- **Key:** `agent:workflow:status:{workflow_id}`
  - **Value:** String enum value matching `hil_status` (`PENDING_APPROVAL`).
  - **TTL:** 14400 seconds (4 hours matching `expires_at`).
- **Key:** `agent:workflow:lock:{tool_id}:{resource_hash}`
  - **Purpose:** Distributed lock to prevent an autonomous agent loop from double-submitting duplicate structural changes while a current request is sitting in the HIL state queue.

### Frontend React Hook State Event Listener

On the Backstage frontend plugin layer, your UI requires a clean, non-blocking way to listen for `EXECUTION_BLOCKED` event payloads over Server-Sent Events (SSE) or WebSockets, and then transition the agent chat or dashboard view smoothly.

This React hook consumes your plugin’s core API client and updates the UI context dynamically.

```typescript
import { useState, useEffect } from 'react';
import { useApi, identityApiRef } from '@backstage/core-plugin-api';

export interface HILState {
  workflowId: string;
  status: 'IDLE' | 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'FAILED';
  reasons: string[];
  requiredRoles: string[];
}

export function useAgentWorkflowState(workflowId: string) {
  const identityApi = useApi(identityApiRef);
  const [hilState, setHilState] = useState<HILState>({
    workflowId,
    status: 'IDLE',
    reasons: [],
    requiredRoles: [],
  });
  const [isApprover, setIsApprover] = useState(false);

  useEffect(() => {
    let eventSource: EventSource;

    async function initWorkflowListener() {
      // 1. Fetch user identity to check against required HIL groups
      const identity = await identityApi.getBackstageIdentity();
      const userGroups = identity.ownershipEntityRefs || [];

      // 2. Open an internal Server-Sent Events (SSE) connection to your backend plugin router
      eventSource = new EventSource(`/api/agent-workflows/stream/${workflowId}`, {
        withCredentials: true,
      });

      eventSource.addEventListener('EXECUTION_BLOCKED', (event: any) => {
        const payload = JSON.parse(event.data);
        
        // 3. Evaluate if the current viewer has matching claims to approve the action
        const matchingRole = payload.hil.requiredRoles.some((role: string) => 
          userGroups.includes(role)
        );

        setHilState({
          workflowId: payload.workflowId,
          status: 'AWAITING_APPROVAL',
          reasons: payload.error.reasons,
          requiredRoles: payload.hil.requiredRoles,
        });
        
        setIsApprover(matchingRole);
      });

      eventSource.addEventListener('EXECUTION_RESUMED', () => {
        setHilState(prev => ({ ...prev, status: 'APPROVED', reasons: [] }));
      });

      eventSource.addEventListener('EXECUTION_CANCELLED', () => {
        setHilState(prev => ({ ...prev, status: 'REJECTED' }));
      });
    }

    if (workflowId) {
      initWorkflowListener();
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [workflowId, identityApi]);

  // 4. Exposed interaction triggers to tie to UI buttons
  const resolveWorkflowAction = async (decision: 'APPROVE' | 'REJECT') => {
    const token = (await identityApi.getCredentials()).token;
    
    await fetch(`/api/agent-workflows/hil/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ workflowId, decision }),
    });
  };

  return { hilState, isApprover, resolveWorkflowAction };
}
```

#### UI Component Usage Strategy

When rendering one of your **18 workflow plugin UIs**, you consume this hook directly at the top component level:

```tsx
export const AgentInteractionPane = ({ workflowId }) => {
  const { hilState, isApprover, resolveWorkflowAction } = useAgentWorkflowState(workflowId);

  if (hilState.status === 'AWAITING_APPROVAL') {
    return (
      <div className="governance-alert-card">
        <h3>🛡️ Policy Action Required</h3>
        <ul>
          {hilState.reasons.map((msg, i) => <li key={i}>{msg}</li>)}
        </ul>
        
        {isApprover ? (
          <div className="action-buttons">
            <button onClick={() => resolveWorkflowAction('APPROVE')}>Override & Approve</button>
            <button onClick={() => resolveWorkflowAction('REJECT')}>Deny Action</button>
          </div>
        ) : (
          <p>⏳ Pending review from an engineering lead holding roles: {hilState.requiredRoles.join(', ')}</p>
        )}
      </div>
    );
  }

  return <StandardAgentChatWindow />;
};
```

This layout gives you clean coverage across both storage, streaming messaging, and state visibility in a greenfield setting.

### Backend Server-Sent Events (SSE) Stream Pipeline Configuration

Using Server-Sent Events (SSE) is the ideal lightweight alternative to WebSockets for this architecture because it is natively **unidirectional (server-to-client)**, runs cleanly over standard HTTP/S, and handles reconnection automatically.

In your distributed architecture, instances will scale horizontally. When an administrator approves a workflow on **Instance A**, the user's browser might be connected to **Instance B**. To resolve this across instances, the SSE router uses a **Redis Pub/Sub** engine to broadcast state changes across all nodes.

Here is the implementation configuration for your backend plugin router using modern Backstage patterns:

```typescript
import { Router } from 'express';
import RouterBuilder from 'express-promise-router';
import { Response } from 'express';
import { coreServices } from '@backstage/backend-plugin-api';
import Redis from 'ioredis';

export async function createSseRouter(options: {
  redisClient: Redis;
  identity: typeof coreServices.identity;
}): Promise<Router> {
  const { redisClient, identity } = options;
  const router = RouterBuilder();
  
  // A secondary Redis client dedicated exclusively to blocking Pub/Sub subscriptions
  const pubSubClient = redisClient.duplicate();
  await pubSubClient.connect();

  router.get('/stream/:workflowId', async (req, res) => {
    const { workflowId } = req.params;

    // 1. Establish strict SSE HTTP Headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // Prevents proxies/load-balancers (like Nginx) from buffering bytes
      'X-Accel-Buffering': 'no', 
    });

    // Send initial connection confirmation event
    res.write(`event: CONNECTED\ndata: ${JSON.stringify({ workflowId })}\n\n`);

    // 2. Subscribe to the specific Redis Pub/Sub channel for this unique workflow
    const channelName = `workflow:events:${workflowId}`;
    await pubSubClient.subscribe(channelName);

    // 3. Listener to push incoming messages straight down the SSE connection pipe
    const messageHandler = (channel: string, message: string) => {
      if (channel === channelName) {
        const eventPayload = JSON.parse(message); // e.g., { type: 'EXECUTION_BLOCKED', data: {...} }
        res.write(`event: ${eventPayload.type}\ndata: ${JSON.stringify(eventPayload.data)}\n\n`);
      }
    };

    pubSubClient.on('message', messageHandler);

    // 4. Heartbeat keep-alive ping interval to prevent router/ingress firewalls from closing idle connections
    const heartbeat = setInterval(() => {
      res.write(': heartbeat ping\n\n');
    }, 30000);

    // 5. Clean up allocations immediately if the client disconnects or moves away
    req.on('close', async () => {
      clearInterval(heartbeat);
      pubSubClient.off('message', messageHandler);
      await pubSubClient.unsubscribe(channelName);
      res.end();
    });
  });

  return router;
}
```

### Fail-Closed Recovery Logic (Redis Network Partition)

Because your drivers rely on **system credentials** to execute high-impact adjustments across platforms like AWS and Datadog, your default posture during an infrastructure failure must be **Fail-Closed** (Secure-by-Default). If a network partition cuts off communication to your Redis lock registry, the execution engine must drop safety assumptions and refuse to run.

#### The Failure Scenario

An agent requests a highly destructive tool deployment. While your backend plugin evaluates the governance rules, the Redis cluster splits or goes offline. The engine cannot pull or verify the active HIL locks.

#### Implementation of the Resilient Execution Loop

Your backend engine wraps execution blocks inside an **atomic database fallback check** using a circuit-breaker configuration pattern.

```typescript
import { NotAllowedError, ServiceUnavailableError } from '@backstage/errors';
import Redis from 'ioredis';
import { Knex } from 'knex';

interface ExecutionContext {
  workflowId: string;
  toolId: string;
  db: Knex;
  redis: Redis;
}

export async function secureExecuteWorkflowStep(ctx: ExecutionContext, executeDriverCallback: () => Promise<any>) {
  const { workflowId, toolId, db, redis } = ctx;
  const lockKey = `agent:workflow:lock:${toolId}`;
  let lockAcquired = false;

  try {
    // 1. Attempt to secure a distributed lock in Redis with a strict 30-second timeout
    // If Redis is partitioned or dead, this will instantly throw a connection error
    const lockResponse = await redis.set(lockKey, workflowId, 'NX', 'PX', 30000);
    lockAcquired = lockResponse === 'OK';

    if (!lockAcquired) {
      throw new NotAllowedError(`Execution blocked: A conflicting tool execution lock is already held.`);
    }

  } catch (redisError: any) {
    // 2. NETWORK PARTITION RECOVERY OR FAIL-CLOSED LEAP
    console.error(`[CRITICAL] Redis connection partition detected during verification: ${redisError.message}`);
    
    // Fall back to the persistent PostgreSQL layer to inspect if this item has been explicitly rejected or locked
    try {
      const dbFallbackCheck = await db('agent_workflow_states')
        .select('current_status')
        .where({ workflow_id: workflowId })
        .first();

      // If the relational database confirms it is not cleanly pre-approved, fail-closed out-of-hand
      if (!dbFallbackCheck || dbFallbackCheck.current_status !== 'APPROVED') {
        throw new NotAllowedError('Fail-Closed Enforcement: Shared coordination ledger is unreachable. Dropping execution.');
      }
      
      // If PostgreSQL explicitly states 'APPROVED', we can log a warning but proceed safely
      console.warn(`[RECOVERY] Redis unavailable, but PostgreSQL state verifies absolute approval. Bypassing lock layer.`);
    } catch (dbError) {
      // If BOTH storage architectures are down or partitioned, halt completely
      throw new ServiceUnavailableError('Total system persistence partition. Agent platform is locked to protect endpoints.');
    }
  }

  // 3. Fire the execution callback now that safety has been guaranteed
  try {
    const output = await executeDriverCallback();
    return output;
  } finally {
    // 4. Release lock cleanly if we acquired it through Redis
    if (lockAcquired) {
      await redis.del(lockKey).catch((e) => console.error('Failed to clear ephemeral lock key', e));
    }
  }
}
```

### Architectural Rules for Your Design Document

Include these key design patterns under the **"Distributed System Resilience"** section of your architecture guidelines:

- **Heartbeat Isolation:** Ensure SSE streams utilize a `30000ms` explicit heartbeat sequence. This guarantees that corporate network tools (like cloud-native reverse proxies or Cloudflare tunnels) don’t drop silent background client streams.
- **Dual Engine Synchronization:** Redis functions as the lightning-fast transaction signal system, but **PostgreSQL remains the source of absolute truth**. If the signals drop, always default to reading the hard disk ledger state.
- **Explicit Lock Ownership:** Never apply generic global keys for agent locks. Keep locks scoped directly to the tool id combined with targeted parameters (`toolId:resourceId`) so single-driver failures do not take down the other 17 active workflow plugin pairs.

### PostgreSQL Database Migration Script

This migration script is structured for **Knex.js**, which is the native query builder and migration engine packaged inside Backstage backend distributions. It translates the design models into optimized database tables with robust validation constraints and compound indexing.

```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Create native enum types safely if they don't exist
  await knex.raw(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hil_status') THEN
        CREATE TYPE hil_status AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'execution_type') THEN
        CREATE TYPE execution_type AS ENUM ('IMPERATIVE', 'DECLARATIVE');
      END IF;
    END $$;
  `);

  // 2. Build the Core Workflow States Ledger Table
  await knex.schema.createTable('agent_workflow_states', (table) => {
    table.uuid('workflow_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('user_ref', 255).notNullable();
    table.string('plugin_id', 100).notNullable();
    table.string('tool_id', 100).notNullable();
    
    // Enum bindings
    table.specificType('current_status', 'hil_status').defaultTo('PENDING_APPROVAL').notNullable();
    table.specificType('exec_type', 'execution_type').notNullable();
    
    // JSONB payload architecture for complex metadata objects
    table.jsonb('tool_payload').notNullable();
    
    // Array columns natively mapping to string arrays in Node.js
    table.specificType('policy_violations', 'text[]').defaultTo('{}').notNullable();
    table.specificType('required_roles', 'text[]').defaultTo('{}').notNullable();
    
    // Timestamps
    table.timestamps(true, true); // Adds created_at and updated_at with zone defaults
    table.timestamp('expires_at', { useTz: true }).notNullable();
  });

  // 3. Construct Targeted Performance and Partial Security Indexes
  await knex.raw(`
    CREATE INDEX idx_workflow_pending_roles 
    ON agent_workflow_states USING gin (required_roles) 
    WHERE current_status = 'PENDING_APPROVAL';
  `);

  await knex.schema.alterTable('agent_workflow_states', (table) => {
    table.index(['user_ref'], 'idx_workflow_user');
    table.index(['current_status', 'expires_at'], 'idx_workflow_cleanup');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('agent_workflow_states');
  await knex.raw('DROP TYPE IF EXISTS hil_status;');
  await knex.raw('DROP TYPE IF EXISTS execution_type;');
}
```

### Backend Re-Verification Logic (`/hil/resolve` Endpoint)

When an engineering lead clicks "Override & Approve" in the UI, you cannot trust the client-side role evaluation. The backend router must re-authenticate the client, fetch their authoritative real-time group hierarchy from the **Backstage Identity Provider Layer**, compare it against the immutable record in PostgreSQL, and cleanly update the tracking states.

Here is the architectural verification loop implementation:

```typescript
import { Router } from 'express';
import RouterBuilder from 'express-promise-router';
import { coreServices } from '@backstage/backend-plugin-api';
import { InputError, NotAllowedError, NotFoundError } from '@backstage/errors';
import Redis from 'ioredis';
import { Knex } from 'knex';

export async function createHilResolveRouter(options: {
  db: Knex;
  redisClient: Redis;
  identity: typeof coreServices.identity;
}): Promise<Router> {
  const { db, redisClient, identity } = options;
  const router = RouterBuilder();

  router.post('/hil/resolve', async (req, res, next) => {
    try {
      const { workflowId, decision } = req.body; // decision: 'APPROVE' | 'REJECT'

      if (!workflowId || !['APPROVE', 'REJECT'].includes(decision)) {
        throw new InputError('Invalid parameters passed to HIL resolution payload.');
      }

      // 1. Authenticate user caller context from incoming framework headers
      const userCredentials = await identity.getCredentials(req);
      const userAuthInfo = await identity.getIdentity({ credentials: userCredentials });
      
      if (!userAuthInfo) {
        throw new NotAllowedError('Authentication failed: Missing structural profile signature.');
      }

      // Gather active group ownerships (e.g., ['group:default/sre-leads', 'group:default/staff'])
      const callerGroups = userAuthInfo.identity.ownershipEntityRefs;

      // 2. Fetch the state record directly from PostgreSQL database ledger
      const record = await db('agent_workflow_states')
        .where({ workflow_id: workflowId })
        .first();

      if (!record) {
        throw new NotFoundError(`Workflow record targeting ID ${workflowId} could not be resolved.`);
      }

      if (record.current_status !== 'PENDING_APPROVAL') {
        throw new InputError('This workflow execution step has already been finalized or expired.');
      }

      // Check temporal expiration limits
      if (new Date() > new Date(record.expires_at)) {
        await db('agent_workflow_states')
          .where({ workflow_id: workflowId })
          .update({ current_status: 'EXPIRED', updated_at: new Date() });
        throw new InputError('The lifecycle window for this manual override has expired.');
      }

      // 3. STRATEGIC AUTHORIZATION OVERRIDE VALIDATION
      if (decision === 'APPROVE') {
        const hasValidRole = record.required_roles.some((requiredRole: string) =>
          callerGroups.includes(requiredRole)
        );

        if (!hasValidRole) {
          throw new NotAllowedError(
            `Unauthorized execution release attempt. User lacks one of the required authorization structures: ${record.required_roles.join(', ')}`
          );
        }
      }

      // 4. Atomic Transaction State Commit
      const targetFinalStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      
      await db('agent_workflow_states')
        .where({ workflow_id: workflowId })
        .update({
          current_status: targetFinalStatus,
          updated_at: new Date()
        });

      // 5. Broadcast State Change Event across horizontal nodes via Redis Pub/Sub channel
      const eventChannel = `workflow:events:${workflowId}`;
      const streamMessage = {
        type: decision === 'APPROVE' ? 'EXECUTION_RESUMED' : 'EXECUTION_CANCELLED',
        data: {
          resolver: userAuthInfo.identity.userEntityRef,
          timestamp: new Date().toISOString()
        }
      };

      await redisClient.publish(eventChannel, JSON.stringify(streamMessage));

      res.json({ status: 'success', transitionedTo: targetFinalStatus });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
```

### Architectural Rules for Your Design Document

Include these key design metrics under the **"Human-in-the-Loop State Security"** section:

- **Token-Agnostic Assertions:** The backend verification loop relies directly on `identity.getIdentity()` to pull active group assignments. This abstracts your logic entirely away from whether the customer uses Okta, Entra ID, or simple local catalog relations.
- **Fail-Over Ledger Transitions:** When a workflow state changes to `APPROVED`, the backend service orchestrator picks up this signal via Redis, but pulls the original parameters securely from the Postgres JSONB table (`tool_payload`) to prevent parameter injection attacks between rejection checks and actual execution.
- **Garbage Collection Policies:** Add a section explicitly stating that expired records (`current_status = 'EXPIRED'`) are scrubbed daily via a background worker cron using the composite index `idx_workflow_cleanup` to avoid storage bloating over millions of automated operations.

### Data Scrubbing Cron Worker & Scheduler Logic

To prevent your distributed database from bloating with stale transient data across millions of automated agent runs, you need a resilient, non-overlapping background task.

Using modern Backstage patterns, you can build this utilizing the native **`coreServices.scheduler`** (`TaskScheduler`). This service ensures that if you scale your plugin backend across multiple Kubernetes pods, the task runs on a distributed lock—meaning it **only runs on one instance at a time**.

#### The Scheduler Implementation

```typescript
import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';
import { Knex } from 'knex';

export const agentWorkflowCleanupModule = createBackendModule({
  pluginId: 'agent-workflows',
  moduleId: 'db-cleanup',
  register(env) {
    env.registerInit({
      deps: {
        database: coreServices.database,
        scheduler: coreServices.scheduler,
      },
      async init({ database, scheduler }) {
        const db: Knex = await database.getClient();

        // 1. Define the distributed task run parameters
        await scheduler.scheduleTask({
          id: 'agent_workflow_cleanup_worker',
          frequency: { days: 1 }, // Runs once a day
          timeout: { minutes: 15 }, // Lock times out if the server crashes mid-run
          fn: async () => {
            console.info('[CLEANUP-WORKER] Starting automated data scrubbing for expired workflows...');
            
            const now = new Date();

            try {
              // 2. Perform a multi-phase cascading cleanup inside a safe transaction
              await db.transaction(async (trx) => {
                // Phase A: Automatically flag un-actioned workflows that crossed their expires_at threshold
                const expiredCount = await trx('agent_workflow_states')
                  .where('current_status', 'PENDING_APPROVAL')
                  .andWhere('expires_at', '<', now)
                  .update({
                    current_status: 'EXPIRED',
                    updated_at: now,
                  });

                if (expiredCount > 0) {
                  console.info(`[CLEANUP-WORKER] Transitioned ${expiredCount} stale workflow(s) to EXPIRED.`);
                }

                // Phase B: Prune hard rows for completed/rejected/expired workflows older than retention policy (e.g., 30 days)
                const retentionCutoff = new Date();
                retentionCutoff.setDate(retentionCutoff.getDate() - 30);

                const deletedCount = await trx('agent_workflow_states')
                  .whereIn('current_status', ['APPROVED', 'REJECTED', 'EXPIRED'])
                  .andWhere('updated_at', '<', retentionCutoff)
                  .del();

                console.info(`[CLEANUP-WORKER] Hard deleted ${deletedCount} audit rows older than 30-day retention boundaries.`);
              });

            } catch (error) {
              console.error('[CLEANUP-WORKER] Critical database scrubbing execution failure:', error);
            }
          },
        });
      },
    });
  },
});
```

### Form Handshaking: Mapping Tool Registry to Native Backstage JSON Schemas

The Backstage Software Templates engine utilizes **react-jsonschema-form (RJSF)** natively. By matching your agent forms exactly to this structural format, your 18 agentic plugin pairs can automatically render custom input components inside standard Backstage UI components without you writing custom frontend React code for every single workflow.

When a tool registry driver defines its required input capabilities, it structures its entry utilizing the native **Backstage Template parameter metadata contract**.

#### The JSON Schema Contract (Registry Definition)

Here is how your Tool Registry structures its specification payload (stored inside your distributed Postgres database/Redis cluster) so that it maps natively into standard Backstage scaffolding forms:

```json
{
  "tool_id": "datadog-escalation-agent",
  "display_name": "Datadog Alert Mutation Form",
  "parameters": {
    "title": "Mute Datadog Monitors",
    "description": "Configure dynamic scoping attributes for temporary alert overrides.",
    "type": "object",
    "required": ["monitor_id", "scope", "duration_hours"],
    "properties": {
      "monitor_id": {
        "title": "Target Monitor Identification ID",
        "type": "integer",
        "minimum": 1
      },
      "scope": {
        "title": "Deployment Scope Vector",
        "type": "string",
        "default": "env:staging",
        "enum": ["env:development", "env:staging", "env:production"]
      },
      "duration_hours": {
        "title": "Override Windows (Hours)",
        "type": "number",
        "maximum": 72,
        "ui:autofocus": true
      }
    }
  }
}
```

#### Reusing Native Backstage UI Layouts

Because Backstage registers specific field pickers under its namespace, you can introduce special rendering behaviors directly inside your parameter dictionaries by feeding **`uiSchema` mapping extensions** directly down to the UI:

```json
{
  "ui:options": {
    "rows": 4,
    "placeholder": "Provide explicit justification logic for your platform engineering bypass layer..."
  },
  "ui:widget": "textarea"
}
```

#### How the Frontend Automatically Processes the Form

On your frontend plugin wrapper layer, when the agent invokes a tool request, you simply import and instantiate the native wrapper:

```tsx
import React from 'react';
import { Form } from '@backstage/plugin-scaffolder-react';

export const DynamicAgentToolForm = ({ registryItem, onSubmit }) => {
  // Pass the raw tool database schema parameters directly down to the native renderer
  return (
    <Form
      schema={registryItem.parameters}
      onSubmit={({ formData }) => onSubmit(formData)}
      validator={undefined} // Leverages Backstage's internal semantic validators
    />
  );
};
```

### Integrating These Concepts into Your Greenfield Design Document

1. **Under "Distributed Tasks & Maintenance"**: Highlight that the data scrubbing cron avoids multi-pod race conditions by embedding itself into Backstage’s native distributed `TaskScheduler`. It treats state cleanup as a transactional state shift before hard deleting records.
2. **Under "Frontend Architecture & Extensibility"**: Clearly declare that your plugin does not build bespoke UI forms for its 18 plugin pairs. It enforces **JSON Schema / RJSF conformance** inside the tool registry, providing instant visual compatibility with any standard open-source or custom Backstage component distribution.
