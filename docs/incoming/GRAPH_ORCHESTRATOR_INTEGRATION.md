# Graph Orchestrator Architecture

In this document:

- How the backend core plugin should maintain a registry, and how agentic plugins register themselves with it
- Embedding Temporal workers in the backend plugin, and migrating to a separate Temporal worker pool when work scales

## Generic Temporal Architecture

![image-20260924020212991](/home/kevin/.config/Typora/typora-user-images/image-20260924020212991.png)

## The Plugin Architecture & Route Registry

Instead of having each agent plugin spin up its own arbitrary routes, the **Core Orchestrator Backend Plugin** should expose a registry service. Individual agent plugins depend on this service and register their workflows during initialization.

### The Core Registry Service (`plugins-agent-orchestrator-backend`)

```typescript
import { createServiceFactory, createServiceRef } from '@backstage/backend-plugin-api';

// A reference other plugins can inject to register their workflows
export interface AgentWorkflowRegistry {
  registerWorkflow(workflow: WorkflowBuilder<any, any>): void;
  getWorkflow(id: string): WorkflowBuilder<any, any> | undefined;
}

export const agentWorkflowRegistryRef = createServiceRef<AgentWorkflowRegistry>({
  id: 'agent.workflow.registry',
});
```

### How an Agent Backend Plugin Registers Itself (`plugins-alert-tuner-backend`)

```typescript
import {
    coreServices,
    createBackendPlugin,
} from '@backstage/backend-plugin-api';
import {
    agentWorkflowRegistryRef,
} from '@backstage/plugin-agent-orchestrator-backend';
import { alertTunerWorkflow } from './workflows/alertTuner';

export const alertTunerPlugin = createBackendPlugin({
  id: 'alert-tuner',
  register(env) {
    env.registerInit({
      deps: {
        registry: agentWorkflowRegistryRef,
        httpRouter: coreServices.httpRouter,
      },
      async init({ registry, httpRouter }) {
        // 1. Register the compiled fluent workflow into the core engine
        registry.registerWorkflow(alertTunerWorkflow);

        // 2. (Optional) Register agent-specific custom routes if needed
        httpRouter.use(createRouter());
      },
    });
  },
});
```

### Standardized Core HTTP Routes

The **Core Orchestrator Backend Plugin** registers unified HTTP endpoints. The frontend (and external drivers) talk to these unified endpoints, passing the `workflowId` in the path or payload.

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/api/agent-orchestrator/v1/workflows/:workflowId/execute` | Triggers a new workflow instance (creates a Temporal execution). |
| `GET`  | `/api/agent-orchestrator/v1/instances/:instanceId` | Fetches current execution state, logs, and metadata. |
| `GET`  | `/api/agent-orchestrator/v1/instances/:instanceId/artifacts` | Retrieves pinned UI components/data (`ctx.emitArtifact`). |
| `POST` | `/api/agent-orchestrator/v1/instances/:instanceId/signal` | Sends human-in-the-loop approvals or external event data. |

### Behind the Scenes: The Temporal Bridge

Your fluent API definition compiles a configuration object. When `/execute` is hit, the Core Backend maps this definition into a **Temporal Workflow**.

Because Temporal workflow code must be deterministic, your individual step handlers (`async (state, ctx) => { ... }`) **cannot execute directly inside the Temporal workflow loop** if they call external APIs, generate LLM schemas, or query databases. Instead, the Core Engine should run a generic Temporal Workflow that invokes your fluent steps as **Temporal Activities**.

## Core Engine Execution Flow

```typescript
// Core implementation detail inside agent-orchestrator-backend
httpRouter.post('/v1/workflows/:workflowId/execute', async (req, res) => {
  const { workflowId } = req.params;
  const input = req.body;

  const workflowDef = registry.getWorkflow(workflowId);
  if (!workflowDef) return res.status(404).send('Workflow not found');

  // Validate input schemas before talking to Temporal
  const validatedInput = workflowDef.meta.inputSchema.parse(input);

  // Start the orchestration in Temporal
  const handle = await temporalClient.workflow.start(
    'GenericAgentOrchestrator', {
      args: [{ workflowId, input: validatedInput }],
      taskQueue: 'agent-workflows',
      workflowId: `agent-${workflowId}-${Date.now()}`,
    }
  );

  res.status(202).json({ instanceId: handle.workflowId });
});
```

## The Generic Temporal Workflow Concept

Your Temporal workflow looks up the structure of the registered workflow (the linear sequence of `steps`, `choices`, and `outcomes`) and iterates through them:

```typescript
// Core Temporal Workflow Definition
export async function GenericAgentOrchestrator(params: { workflowId: string; input: any }) {
  // 1. Fetch step sequence and configuration from a shared activity or local state
  const blueprint = await workflowActivities.getWorkflowBlueprint(params.workflowId);
  let currentState = blueprint.initialState || {};
  let currentStepIndex = 0;

  while (currentStepIndex < blueprint.steps.length) {
    const stepName = blueprint.steps[currentStepIndex];

    // Execute the user-defined handler safely wrapped inside a Resilient Temporal Activity
    const result = await workflowActivities.executeStepActivity({
      workflowId: params.workflowId,
      stepName,
      state: currentState,
      input: params.input
    });

    // Merge state mutations back into the graph context
    currentState = { ...currentState, ...result.stateMutations };

    // Handle out-of-line conditional routing if a choice node follows this step
    const nextTarget = await workflowActivities.evaluateChoiceActivity({
      workflowId: params.workflowId,
      stepName,
      state: currentState
    });

    if (nextTarget === 'completeWithoutAction' || nextTarget === 'insufficientEvidence') {
       await workflowActivities.executeTerminalOutcome({ workflowId: params.workflowId, outcomeName: nextTarget, state: currentState });
       break;
    }

    currentStepIndex++;
  }
}
```

## The Core Plugin Defines an Extension Point

Your Core Orchestrator Backend Plugin exposes an **Extension Point**. This acts as a safe registration gateway that modules can tap into during the backend's initialization phase.

```typescript
// Location: plugins/agent-orchestrator-backend/src/extensions.ts
import { createExtensionPoint } from '@backstage/backend-plugin-api';
import { WorkflowBuilder } from './builder';

export interface AgentWorkflowExtensionPoint {
  /** Modules use this to register their agentic workflows into the engine */
  registerWorkflow(workflow: WorkflowBuilder<any, any>): void;
}

export const agentWorkflowExtensionPointRef = 
  createExtensionPoint<AgentWorkflowExtensionPoint>({
    id: 'agent.orchestrator.workflows',
  });
```

### 2. The Agent is Penned as a Backend Module

Your user-facing agent is packaged as a module targeted at the `agent-orchestrator` plugin. It takes its internal fluent api instance (`alertTunerWorkflow`) and injects it directly into the core extension point.

```typescript
// Location: plugins/alert-tuner-backend-module/src/module.ts
import { createBackendModule } from '@backstage/backend-plugin-api';
import { agentWorkflowExtensionPointRef } from '@backstage/plugin-agent-orchestrator-backend-node';
import { alertTunerWorkflow } from './workflows/alertTuner';

export const alertTunerBackendModule = createBackendModule({
  pluginId: 'agent-orchestrator', // Target the core plugin ID
  moduleId: 'alert-tuner-workflow',
  register(reg) {
    reg.registerInit({
      deps: {
        orchestrator: agentWorkflowExtensionPointRef,
      },
      async init({ orchestrator }) {
        // Register the workflow instance into the core engine locally
        orchestrator.registerWorkflow(alertTunerWorkflow);
      },
    });
  },
});
```

### 3. How the App Integrates Them Together

When the platform engineer sets up the final Backstage application backend, they simply import and pass both the Core Plugin and the individual Agent Modules to the backend instance. Everything spins up in a single Node.js runtime process.

```typescript
// Location: packages/backend/src/index.ts
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

// 1. Add the main orchestration engine plugin
backend.add(import('@backstage/plugin-agent-orchestrator-backend'));

// 2. Add as many user-facing workflow modules as you want
backend.add(import('@backstage/plugin-alert-tuner-backend-module'));
backend.add(import('@backstage/plugin-cloud-cost-tuner-backend-module'));

backend.start();
```

## The Workflow Lifecycle in a Monolith

When structured this way, your execution timeline requires zero network round-trips for logic processing:

1. **Discovery:** During `backend.start()`, `alertTunerBackendModule` registers its `WorkflowBuilder` instance containing your live, un-serializable async JS callbacks (`addStep`, `addChoice`) into an internal registry Map managed by the Core Plugin.
2. **Trigger:** A user goes to the Backstage UI and triggers the Alert Tuner. The frontend sends an HTTP `POST` to the core route: `/api/agent-orchestrator/v1/workflows/alert-tuning-workflow/execute`.
3. **Execution:** The Core Plugin retrieves the `WorkflowBuilder` from its memory map. When the Temporal worker executes a step, it uses a local Temporal Activity that points directly to the function references stored in memory, updating your Zod state cleanly and efficiently.

## Embedded vs. Pooled Temporal Workers

A basic implementation would embed the Temporal worker in the backend plugin.

![backend-microservice-architecture](/home/kevin/Repos/ai-crew-suite/platform/docs/Implementation/images/backend-microservice-architecture.jpg)

### Isolating Heavy Compute (The Worker Pool Pattern)

If your core Backstage instance gets bogged down by a heavy agent workflow, your developers will experience timeouts when loading their software catalog, searching components, or checking documentation. If your agents are doing incredibly heavy work—like running vast Vercel AI SDK embeddings, data crunching, or keeping long-running processing loops alive—and you are worried they will slow down the core Backstage catalog, you use a **Worker Pool Pattern**. You run your standard Backstage backend instances for the API traffic, but you strip the Temporal worker loop out of them. You then spin up a dedicated, minimal Node.js microservice cluster *just* to act as heavy-duty **Temporal Workers**.

- **Backstage Backend Pods:** Only handle API requests, register graphs, and kick off workflows. (Highly responsive, low CPU).
- **Dedicated Worker Pods:** Do not host the Backstage catalog or API routes. They just run `worker.run()` from the Temporal SDK, importing your workflow definitions to do the heavy lifting. (Auto-scaled aggressively based on CPU/Memory).

By moving to a **Temporal Worker Pool Pattern**, you split your backend code into two distinct tiers while sharing the exact same codebase:

| Feature / Tier | 🌐 Backstage Backend API Tier | 🏗️ Dedicated Temporal Worker Tier |
| --- | --- | --- |
| **Primary Job** | Serves Backstage UI, serves Catalog, handles Auth. | Pulls jobs from Temporal queue, executes code steps. |
| **Scaling Metric** | Scaled on HTTP request volume or user traffic.     | Scaled on pending workflow step count or CPU load. |
| **Memory / CPU** | Predictable, lightweight footprint. | Heavy, isolated, elastic compute capacity. |
| **If it Crashes...** | Developers can't see their service catalog. | Workflows pause safely; user interface stays online. |

### How Temporal Workers Work

A Temporal Worker is a lightweight, stateless Node.js process. It does not run an HTTP server, listen on any ports, or host a REST API. Instead, it creates a persistent **gRPC polling connection** to your central Temporal cluster.

1. **The Polling Loop:** The worker tells Temporal: *"I am worker pool 'agent-tasks'. Do you have any steps for me to run?"*
2. **The Execution:** When a workflow reaches a step, Temporal pushes the event data down the open connection. The worker runs your JavaScript handler locally, catches the return value, and pushes it back to Temporal.
3. **No Network Ingress:** Because workers only make *outbound* connections to Temporal, you do not need to configure complex firewalls, ingress routes, or public endpoints for your compute nodes.

### Architecture with Shared Workflow Code

To make this clean, you maintain your **Fluent API** structure. You split the runtime instantiation while keeping your workflows unified in a shared internal library (npm package or monorepo workspace).

![temporal-workers](/home/kevin/Repos/ai-crew-suite/platform/docs/Implementation/images/temporal-workers.jpg)

#### 1. In your Backstage Backend Instance

You only register the metadata and structural schema. You do not spin up workers here.

```typescript
// Backstage doesn't execute the heavy functions; it just acts as the orchestrator client
const handle = await temporalClient.workflow.start('AgentOrchestrator', {
  args: [{ workflowId: 'alert-tuning-workflow', input: req.body }],
  taskQueue: 'agent-tasks',
});
```

#### 2. In your Dedicated Worker Process (independent Node.js container)

You spin up a minimal, raw Node.js script. You import your workflow module logic directly, pass it to the worker, and let it run forever.

```typescript
import { Worker } from '@temporalio/worker';
import { alertTunerWorkflow } from '@internal/plugin-alert-tuner-backend-module';

async function runWorker() {
  const worker = await Worker.create({
    workflowsPath: require.resolve('./temporal/workflows'),
    activities: {
      // Your fluent step handlers are registered straight as activities here
      executeStepActivity: async (stepName, state) => {
         const handler = alertTunerWorkflow.getHandler(stepName);
         return await handler(state, mockCtx);
      }
    },
    taskQueue: 'agent-tasks',
  });

  // Start polling Temporal for work
  await worker.run();
}

runWorker().catch((err) => console.error(err));
```

## Auth, Logging, and Telemetry in a decoupled worker pool.

### Authentication & Context Propagation

You do not want your workers to have hardcoded root administrative tokens. If a developer runs an agent workflow, any driver tool it executes (like querying PagerDuty or editing a repo) should act under that specific user's Backstage token. 

Temporal provides **Context Propagators** that intercept outgoing client calls inside Backstage, attach metadata into the secure **Temporal Payload Headers**, and extract them on the remote Worker side.

#### Phase 1: In your Core Backstage Plugin (The Client Interceptor)

When the user clicks run, extract the active request's Backstage identity token via the `httpAuth` service and attach it to the Temporal context.

```typescript
// plugins/agent-orchestrator-backend/src/temporalClient.ts
import { interceptors } from '@temporalio/client';

export const backstageContextPropagator = {
  // 1. Intercepts the workflow initiation inside the Backstage router
  async inject(context, next) {
    // Read user token from your current execution scope / AsyncLocalStorage
    const backstageToken = httpAuthContext.getCredentials()?.token; 
    
    return {
      ...next,
      headers: {
        ...next.headers,
        'backstage-user-token': backstageToken, // Injected into Temporal payload
      },
    };
  }
};
```

#### Phase 2: In your Remote Node.js Worker (The Worker Interceptor)

On the worker side, an inbound interceptor unpacks the token from the header and binds it to your step's `ctx` object.

```typescript
// workers/src/interceptors.ts
import { ActivityInboundInterceptor, ActivityExecuteInput } from '@temporalio/worker';

export class WorkerAuthInterceptor implements ActivityInboundInterceptor {
  async execute(input: ActivityExecuteInput, next: Function) {
    // Extract token safely out of the Temporal Envelope
    const backstageToken = input.headers['backstage-user-token'];

    // Bind this token to the fluent API's step context
    const stepContextModifier = {
      auth: {
        token: backstageToken,
        getAuthenticatedClient: (driver) => driver.createClient(backstageToken)
      }
    };

    return next(input, stepContextModifier);
  }
}
```

### Logging Consistency (replicating Backstage formatting)

You don't need the Backstage core engine initialization just to get its clean, structured logger format. Backstage defaults to using Winston behind its `coreServices.logger`.

Inside your independent worker process bundle, instantiate a matching structured Winston instance. You then pass this logger to Temporal’s `Runtime` options so it intercepts both workflow lifecycle steps and your step callbacks.

```typescript
// workers/src/index.ts
import { Runtime, DefaultLogger } from '@temporalio/worker';
import winston from 'winston';

// Mirror your Backstage production JSON/Console transport exactly
const workerWinstonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json() // Keeps logs scannable in Datadog/ElasticSearch
  ),
  transports: [new winston.transports.Console()],
});

// Register with Temporal Node Runtime
Runtime.install({
  logger: {
    info: (msg, meta) => workerWinstonLogger.info(msg, meta),
    warn: (msg, meta) => workerWinstonLogger.warn(msg, meta),
    error: (msg, meta) => workerWinstonLogger.error(msg, meta),
  }
});
```

### Telemetry & Distributed Tracing (OpenTelemetry)

If a workflow starts in Backstage, invokes 4 steps on a worker, and hits an LLM provider, you want a single, unbroken trace graph in your APM tool (like Datadog or Jaeger).

Temporal includes native OpenTelemetry tracing support. By importing `@temporalio/interceptors-opentelemetry` into both your Backstage plugin client and your worker nodes, Temporal will automatically sew the distributed traces together across your network boundaries.

```typescript
// workers/src/worker.ts
import { Worker } from '@temporalio/worker';
import { OpenTelemetryActivityInboundInterceptor } from '@temporalio/interceptors-opentelemetry';

const worker = await Worker.create({
  taskQueue: 'agent-tasks',
  workflowsPath: require.resolve('./workflows'),
  activities: myImportedAgentActivities,
  interceptors: {
    // Automatically handles span extraction, linkage, and propagation
    activityInbound: [
      () => new OpenTelemetryActivityInboundInterceptor(),
      () => new WorkerAuthInterceptor() // Your custom auth logic layer
    ]
  }
});
```

### Summary of the Operational Profile

With this decoupling strategy, your services stay distinct but connected:

1. **Backstage App:** Collects configuration and parses user identity.
2. **Temporal Cloud/Cluster:** Acts as a bulletproof data conveyor belt. It doesn't read your secure auth tokens, it simply holds them in the task payload metadata wrapper.
3. **Node Worker:** Receives the envelope, extracts the trace span, applies the user's specific Backstage auth credentials, and prints structural logs configured identically to your primary platform.

## Shared Memory in Backstage Backend Modules vs. Temporal Workers

When a Backstage plugin has a backend module type, it must be installed alongside the plugins it lists as part of its group. It can then share memory space with those plugins instead of serializing data.

Because the Temporal worker lives in a completely separate runtime environment, it cannot access the live JavaScript class instances, database pools, or service references managed by Backstage's in-memory Dependency Injection (DI) system.

Everything crossing the process boundary must pass through Temporal's payload envelope as a **serialized JSON primitive**, typically over gRPC. Consequently, your worker must ingest these serialized payloads and construct its own decoupled versions of the underlying service clients.

### The Architecture: In-Memory vs. Out-of-Process

To visualize how your services must be adapted, consider how the operational boundary changes:

| Operational Service     | 🌐 Inside Backstage (In-Memory DI)                       | 🏗️ Inside Temporal Worker (Out-of-Process)                    |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| **Authentication**      | Access to `coreServices.auth` / `httpAuth` classes.     | Ingests a raw serialized JWT string (`backstage-user-token`). |
| **Driver Connectivity** | Uses initialized Backstage plugins or shared providers. | Uses pure, standalone Node.js clients initialized with the user's token. |
| **Logging**             | Injects the system-managed `coreServices.logger`.       | Instantiates a standalone `winston` instance mimicking the Backstage configuration. |
| **Database Access**     | Uses `coreServices.database` (Knex instance).           | Communicates with the state layer via API calls or its own connection string. |

### How Your Fluent API Code Adapts

To keep your code looking exactly like your original fluent design (`ctx.tools.invoke`), your **Core Engine Worker Wrapper** handles the burden of initializing these services from raw tokens *right before* executing the step callback.

When your worker boots up, it sets up an execution boundary that takes the raw incoming payload, inflates it into functional utility objects, and builds your `ctx` sandbox.

### Inside the Worker's Activity Execution Loop

```typescript
// workers/src/activities/executeStepActivity.ts
import { alertTunerWorkflow } from '@internal/plugin-alert-tuner-backend-module';
import { PagerDutyClient, DatadogClient } from '@internal/agent-drivers'; 
import { workerLogger } from '../logger';

export async function executeStepActivity(params: {
  workflowId: string;
  stepName: string;
  currentState: any;
  // Serialized context passed from Backstage via Temporal
  serializedContext: {
    backstageToken: string;
    triggerType: string;
    now: string;
  }
}) {
  const { stepName, currentState, serializedContext } = params;

  // 1. Locate the live JS handler inside the imported workflow package
  const handler = alertTunerWorkflow.getHandler(stepName);

  // 2. Inflate standalone versions of your services using the primitive token
  const inflatedCtx = {
    triggerType: serializedContext.triggerType,
    config: { now: new Date(serializedContext.now) },
    
    // Custom logging wrapper matching Backstage look-and-feel
    logger: workerLogger.child({ stepName, workflowId: params.workflowId }),

    // Re-implementing ctx.tools by injecting the serialized auth token into standalone clients
    tools: {
      invoke: async (toolId: string, payload: any) => {
        workerLogger.info(`Worker invoking tool ${toolId}`, { payload });
        
        if (toolId === 'PAGERDUTY_LIST_INCIDENTS') {
          // Initialize a standalone driver client using the user's primitive token
          const pd = new PagerDutyClient({ token: serializedContext.backstageToken });
          return await pd.listIncidents(payload);
        }
        
        throw new Error(`Tool ${toolId} not implemented on this worker pool.`);
      }
    },

    // Vercel AI SDK features run cleanly here because they are native Node libraries
    ai: {
      generateStructuredObject: async (options: any) => {
        // Core Vercel AI SDK loop runs smoothly out-of-process
        return await aiEngine.generateObject(options);
      }
    },

    emitArtifact: (name: string, data: any) => {
      // Because we can't update Backstage's DB directly, we record this mutation
      // and return it as part of the step execution payload output
      executionTracking.recordArtifact(name, data);
    }
  };

  // 3. Execute the developer's original fluent callback with the isolated context
  const stateMutations = await handler(currentState, inflatedCtx);

  // 4. Serialize mutations and artifacts back across the Temporal wire to Backstage
  return {
    stateMutations: stateMutations || {},
    emittedArtifacts: executionTracking.flushArtifacts(),
  };
}
```

### The Cleanest Structural Strategy

If you decide to isolate your heavy coding agent tasks into a dedicated worker pool, you can preserve code modularity by dividing your shared libraries carefully:

1. **`plugin-agent-orchestrator-common`**: Contains your Zod schemas, types, and the abstract fluent `WorkflowBuilder` class.
2. **`agent-drivers`**: Contains standalone, framework-agnostic Node.js API clients for Datadog and PagerDuty that accept a string token in their constructor. This allows them to run safely inside a standard Backstage plugin *or* inside a raw Node worker.
3. **`plugin-alert-tuner-backend-module`**: Houses your pure workflow definition files (the actual business logic graphs).

## Roadmap

**Starting inside Backstage plugins, benchmarking performance, and then extracting heavy compute to out-of-process workers is the gold standard approach.** It prevents premature optimization, keeps your initial velocity high, and lets you prove your plugin's business value before adding infrastructure complexity.

When it does come time to offload that compute, choosing **Temporal Workers** over natively spawning worker threads or child processes directly from your Backstage backend container offers massive structural advantages.

