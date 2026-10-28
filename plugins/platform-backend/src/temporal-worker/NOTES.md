# Notes on Temporal Worker

In a Temporal architecture, the **Temporal Server (Cluster)** container we just parameterized is a language-agnostic state coordinator. It does not run your actual workflow or activity logic; it merely manages state transitions, queues, timers, and retry logic.

The **Temporal Worker** is the execution engine. It is a long-running Node.js process that polls your standalone Temporal Cluster via gRPC, grabs queued tasks, runs your JavaScript/TypeScript code, and reports the results back.

Here is how the responsibilities are split:

```
[ Backstage App / Client ]
         │ (Trigger Workflow via Client SDK)
         ▼
[ Temporal Server (Cluster) Container (Port 7233) ] ◄──┐
         │ (Hosts Task Queues & Orchestrates State)     │ Polls for work /
         ▼                                              │ Returns results
[ packages/temporal-worker (The Node Process) ] ────────┘
   ├── Executes workflows (e.g., AI Crew orchestration loops)
   └── Executes activities (e.g., Calling Mem0, pulling DB context)
```

## Functional Breakdown of the Files

### `src/instrumentation.ts` (The Telemetry Gatekeeper)

- **What it does:** Boots an OpenTelemetry Node SDK process *before* anything else loads. It hooks into standard system libraries to capture outbound calls and sets up an export stream to ship traces straight to your custom `otel-collector` container over gRPC.
- **Why it matters:** Without this, your workflow runs inside a black box. With it, you get a clean trace graph showing how long an entire AI agent chain took, down to the exact millisecond.

### `src/worker.ts` (The Execution Loop Daemon)

- **What it does:** Establishes the gRPC connection pool to your Temporal Server. It registers your workflows (the blueprint curves) and your activities (the operational context pieces), then listens indefinitely to a specific target queue (e.g., `ai-crew-tasks`).
- **Why it matters:** It injects the `OpenTelemetryInboundInterceptor` and `OpenTelemetryOutboundInterceptor`. This propagates the W3C trace context, allowing Grafana Tempo to stitch together a unified timeline tracking your system traffic.

## Who the Caller Is

The `temporal-worker` package is an **autonomous microservice**. It has two types of interactions:

### The Operational Caller: The System Daemon

The worker is a background daemon process. It is standardly called by a process manager or container controller inside your deployment topologies.

- **Local Development:** Run natively via your monorepo thread manager (`yarn workspace @ai-crew-suite/temporal-worker run start`).
- **CI / Production:** Wrapped inside its own dedicated runtime container layer (e.g., `Dockerfile.worker`) and started up as a sibling container to your Backstage app backend.

### The Functional Caller: Backstage Backend Factory (or any API Client)

Your worker never gets hit directly by HTTP calls. Instead, when an engineer interacts with a declarative UI Task Wizard in the frontend, your Backstage Backend Factory acts as the functional client:

1. The Backstage backend uses the lightweight `temporalio/client` SDK to issue a gRPC `workflowClient.start()` call to the **Temporal Cluster container**.
2. The Temporal Cluster drops the job into the `ai-crew-tasks` queue.
3. The **Temporal Worker** polls the cluster, pops the job off the queue, executes your code, and passes metrics back up to your Prometheus and Tempo stacks.

## How to Wire It Up and Configure It

Here is the concrete implementation to bring this package to life in your workspace.

### `packages/temporal-worker/package.json`

```json
{
  "name": "@ai-crew-suite/temporal-worker",
  "version": "1.0.0",
  "main": "dist/worker.js",
  "license": "Apache-2.0",
  "scripts": {
    "build": "tsc -b",
    "start": "node dist/worker.js"
  },
  "dependencies": {
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/exporter-trace-otlp-grpc": "^0.54.0",
    "@opentelemetry/resources": "^1.26.0",
    "@opentelemetry/sdk-node": "^0.54.0",
    "@opentelemetry/semantic-conventions": "^1.28.0",
    "@temporalio/interceptors-opentelemetry": "^1.11.0",
    "@temporalio/worker": "^1.11.0"
  },
  "devDependencies": {
    "typescript": "^5.5.4"
  }
}
```

### Add Caching Integration to the Global `turbo.jsonc`

Ensure your Turborepo workspace compiles this worker cleanly before launching your multi-service runtime layers:

```json
    "build:worker": {
      "inputs": ["packages/temporal-worker/src/**/*"],
      "cache": true,
      "outputs": ["packages/temporal-worker/dist/**"]
    }
```

## Workflows vs. Activities: Splitting the Logic

In a Temporal architecture, your code must be strictly separated into two execution models:

- **Workflows (`workflows.ts`)**: These must be **completely deterministic**. They handle state coordination, retry flows, loops, and conditional logic. They cannot make network requests, read files, or generate random numbers directly, because Temporal regularly replays them to reconstruct state during a recovery event.
- **Activities (`activities.ts`)**: This is where you perform **non-deterministic operations**. They handle network calls, database queries, file writing, and AI completions. If an activity fails, Temporal logs the failure and handles the retry policy defined by the workflow without affecting the state engine.

## Functional Sample Source Files

### `packages/temporal-worker/src/workflows.ts`

This workflow orchestrates an abstract AI execution graph, calling sequential activity tasks while tracking progress deterministically.

```typescript
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';

// Establish activity execution thresholds with deterministic retry configurations
const { extractMem0Context, executeAgentLogic, updateEpisodicMemory } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2m',
  retryPolicy: {
    initialInterval: '2s',
    backoffCoefficient: 2,
    maximumAttempts: 5,
  },
});

interface CrewWorkflowInput {
  userId: string;
  sessionId: string;
  prompt: string;
}

interface CrewWorkflowOutput {
  status: string;
  agentResponse: str;
}

export async function runAiCrewWorkflow(input: CrewWorkflowInput): Promise<CrewWorkflowOutput> {
  // 1. Fetch relevant historical contexts from Mem0 long-term memory via an activity
  const historicalContext = await extractMem0Context({
    userId: input.userId,
    query: input.prompt,
  });

  // 2. Pass the combined prompt and retrieved memory history down to the LLM agent execution activity
  const agentResponse = await executeAgentLogic({
    prompt: input.prompt,
    context: historicalContext,
  });

  // 3. Commit new insights and episodic observations back to the Mem0 cluster asynchronously
  await updateEpisodicMemory({
    userId: input.userId,
    sessionId: input.sessionId,
    lastInteraction: input.prompt,
    agentOutput: agentResponse,
  });

  return {
    status: 'COMPLETED',
    agentResponse,
  };
}
```

### `packages/temporal-worker/src/activities.ts`

This is where your functional integrations execute. These blocks call your custom `mem0` service endpoints and communicate with your AI infrastructure.

```typescript
import axios from 'axios';

const MEM0_API_URL = process.env.MEM0_API_URL || 'http://localhost:8000';

interface MemoryActivityInput { userId: string; query: str; }
interface AgentActivityInput { prompt: string; context: string; }
interface SyncMemoryInput { userId: string; sessionId: string; lastInteraction: string; agentOutput: str; }

export async function extractMem0Context(input: MemoryActivityInput): Promise<string> {
  try {
    const response = await axios.post(`${MEM0_API_URL}/api/v1/memories/search`, {
      user_id: input.userId,
      query: input.query,
      top_k: 5
    });
    
    // Parse the results out of the custom Mem0 REST framework payload
    const memories = response.data?.results || [];
    return memories.map((m: any) => m.memory).join('\n');
  } catch (error: any) {
    throw new Error(`Failed to extract context from Mem0: ${error.message}`);
  }
}

export async function executeAgentLogic(input: AgentActivityInput): Promise<string> {
  // In a real application, you would invoke your LangChain, LlamaIndex, or raw OpenAI completion block here
  console.log('🤖 Processing prompt with context length:', input.context.length);
  return `Processed your request with historical memory context. Agent analysis complete.`;
}

export async function updateEpisodicMemory(input: SyncMemoryInput): Promise<void> {
  try {
    await axios.post(`${MEM0_API_URL}/api/v1/memories`, {
      user_id: input.userId,
      session_id: input.sessionId,
      messages: [
        { role: 'user', content: input.lastInteraction },
        { role: 'assistant', content: input.agentOutput }
      ]
    });
  } catch (error: any) {
    // We log and throw so Temporal can handle the activity retry scheme gracefully
    console.error(`Memory tracking sync failed: ${error.message}`);
    throw error;
  }
}
```

### `packages/deploy/containers/temporal-worker/Dockerfile`

This is a standard multi-stage Dockerfile that mirrors your other internal images. It isolates the built JavaScript artifacts and discards your development tools to keep the image compact.

```dockerfile
# ==========================================
# STAGE 1: Dependency Assembly & Cache
# ==========================================
FROM node:20-alpine AS installer
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

ARG SKELETON_DIR
COPY ${SKELETON_DIR} .
RUN yarn install --immutable

# ==========================================
# STAGE 2: Workspace Compilation
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=installer /app .
COPY . .
RUN yarn turbo run build --filter=@ai-crew-suite/temporal-worker
RUN yarn install --production --immutable && yarn cache clean

# ==========================================
# STAGE 3: Slim Runtime Environment
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 temporalworker

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/temporal-worker/dist ./dist
COPY --from=builder /app/packages/temporal-worker/package.json ./package.json

USER 1001

EXPOSE 9464

# Automatically run the worker process on boot
CMD ["node", "dist/worker.js"]
```

## The Architectural Choice: Embedded Plugin vs. Standalone Worker

When choosing between running your Temporal workers directly inside a Backstage backend plugin (embedded) or running them as a completely separate containerized microservice (standalone), consider these factors:

### Comparison Matrix

| Deciding Factor          | Embedded in Backstage Plugin                                 | Standalone Microservice Container                            |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| **Resource Isolation**   | **Poor.** Heavily computing an AI chain or parsing long vector context blocks can block or crash the core Backstage HTTP event loop. | **Excellent.** The worker runs in its own container boundaries. It can scale up or crash independently without dropping the user-facing Backstage UI panel. |
| **Dependency Conflicts** | **High risk.** Backstage uses a very specific set of package versions. Importing heavy ML toolkits (like LangChain) or specific system libraries can cause dependency version clashes. | **Zero risk.** The worker uses its own isolated `package.json` manifest. You can use any library versions you need. |
| **Scaling Mechanics**    | **Inflexible.** To process a high volume of background tasks, you are forced to scale your entire Backstage API server group horizontally. | **Granular.** You can dynamically scale just your worker container group to handle heavy workloads while leaving your Backstage API server lightweight. |
| **Deployment Footprint** | **Simpler initially.** One single application artifact to maintain, manage, and push through your deployment pipelines. | **Operational overhead.** Requires maintaining a separate Dockerfile target and managing another service entry in your cluster configs. |

### Architectural Recommendation

- **Use the Embedded Approach if:** Your workflows are purely operational scripts with minimal overhead (e.g., firing a rapid webhook, triggering an external Jenkins job, or making a basic DB write), and you want to keep your deployment footprint as simple as possible.
- **Use the Standalone Microservice approach if:** You are orchestration **AI agent loops, multi-turn LLM reasoning tracks, or sync operations with Mem0/pgvector**. This completely isolates these heavy workloads, ensuring your core developer portal remains fast, stable, and decoupled.

##  Sample Backstage API Endpoint Function

To wire this up inside your Backstage ecosystem, you will use the official `@temporalio/client` SDK inside a new-backend-compatible Backstage router plugin (typically situated inside `packages/backend/src/plugins/aiCrew.ts` or a dedicated package).

When a developer interacts with your platform, the plugin intercepts the HTTP payload, connects to your parameterized **Temporal Cluster Container** via gRPC, and fires off the workflow asynchronously.

Here is how to implement the backend plugin endpoint using the modern Backstage backend system.

### 1. The Backstage Backend Plugin Implementation

`packages/backend/src/plugins/aiCrew.ts`

```typescript
import { createBackendPlugin, coreServices } from '@backstage/backend-plugin-api';
import { Connection, Client } from '@temporalio/client';
import { runAiCrewWorkflow } from '@ai-crew-suite/temporal-worker/dist/workflows';
import { Router } from 'express';
import bodyParser from 'body-parser';

export const aiCrewBackendPlugin = createBackendPlugin({
  pluginId: 'ai-crew',
  register(env) {
    // 1. Ingest core platform capabilities from the Backstage container engine
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
      },
      async init({ httpRouter, logger, config }) {
        // 2. Resolve environmental parameters using your configured fallbacks
        const temporalAddress = config.getOptionalString('temporal.address') || 'temporal-cluster:7233';
        const taskQueue = config.getOptionalString('temporal.taskQueue') || 'ai-crew-tasks';

        logger.info(`📡 Connecting to standalone Temporal Cluster at gRPC endpoint: ${temporalAddress}`);
        
        // 3. Establish the persistent gRPC connection channel to the Temporal container
        const connection = await Connection.connect({ address: temporalAddress });
        const client = new Client({ connection });

        const router = Router();
        router.use(bodyParser.json());

        // 4. Expose the execution gateway REST endpoint for frontend or CLI callers
        router.post('/trigger-crew', async (req, res) => {
          const { userId, sessionId, prompt } = req.body;

          if (!userId || !sessionId || !prompt) {
            res.status(400).json({ error: 'Missing mandatory fields: userId, sessionId, or prompt.' });
            return;
          }

          try {
            logger.info(`🚀 Dispatching Agent Workflow Execution for User: ${userId} to queue: ${taskQueue}`);

            // 5. Trigger the workflow. This drops the task payload instantly into the Temporal 
            // queue and returns a handle immediately without blocking the Backstage API thread.
            const handle = await client.workflow.start(runAiCrewWorkflow, {
              taskQueue,
              workflowId: `crew-session-${sessionId}-${Date.now()}`,
              args: [{ userId, sessionId, prompt }],
            });

            // Return the unique tracking IDs back to the UI panel instantly
            res.status(202).json({
              message: 'AI Crew execution pipeline triggered successfully.',
              workflowId: handle.workflowId,
              runId: handle.firstExecutionRunId,
            });

          } catch (error: any) {
            logger.error(`❌ Failed to drop workflow onto Temporal Cluster: ${error.message}`);
            res.status(500).json({ error: 'Internal scheduling pipeline failure.' });
          }
        });

        // Register the configured routing matrix with Backstage's HTTP network layer
        httpRouter.use(router);
      },
    });
  },
});
```

### 2. Configuration Appending (Local & Remote)

`app-config.yaml` / `app-config.production.yaml`

To ensure your Backstage container can locate the network paths, append the block definitions to your core application configurations:

```yaml
temporal:
  # Resolves instantly to the internal compose DNS name we parameterizable in compose.yaml
  address: ${TEMPORAL_ADDRESS:-localhost:7233}
  taskQueue: ${TEMPORAL_TASK_QUEUE:-ai-crew-tasks}
```

### 3. Adding App Dependencies

Ensure your backend package layout captures the client libraries cleanly without dragging in heavy worker compilation runtimes:

```bash
yarn workspace @internal/backend add @temporalio/client @ai-crew-suite/temporal-worker
```

### How the Runtime Flow Resolves:

1. **The Request:** The Backstage frontend sends a `POST` request to `http://localhost:7007/api/ai-crew/trigger-crew`.
2. **The Handshake:** Your backend plugin acts as a fast pass-through client. It connects over gRPC to `temporal-cluster:7233`, passes the payload data into the cluster, and breaks out immediately.
3. **The Worker Pickup:** Your standalone **`temporal-worker` container** catches the event notice from the cluster queue, begins logging OpenTelemetry data, executes your `workflows.ts` timeline, and queries your `mem0-service` backend.
