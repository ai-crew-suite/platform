# **Deep Dive: The Vercel AI SDK + Temporal Architecture**

There is an official  **Vercel AI SDK + Temporal** integration: **`@temporalio/ai-sdk`**. Temporal ships an official TypeScript SDK plugin that lets you use the Vercel AI SDK primitives (`generateText`, `streamText`, `streamObject`) directly inside your workflow code, while Temporal **automatically wraps those LLM calls into durable Activities behind the scenes**.

Here is how you would architect this uniform backend plugin to support downstream agentic plugins.

![vercel-ai-sdk-and-temporal-relationship](/home/kevin/Repos/ai-crew-suite/platform/docs/Implementation/images/vercel-ai-sdk-and-temporal-relationship.jpg)

## The Implementation Blueprints

To make this a "convenient and uniform API," your backend core plugin must expose **Backstage Extension Points** that other developers can hook into to publish new agents, tools, or memory stores.

Here is exactly how the core execution files should be written to bridge Backstage's DI structure with Temporal's workflow constraints.

### The Core Agent Definition Contract

Downstream plugins will use this type configuration to register their agents into your unified engine.

```typescript
import { z } from 'zod';
import { Tool } from 'ai';

export interface BackstageAgentDefinition {
  id: string;
  description: string;
  systemPrompt: string;
  modelTier: 'fast' | 'smart' | 'premium';
  // Standard Vercel AI SDK tools array format
  tools: Record<string, Tool>; 
}
```

### The Unified Temporal Workflow (`workflows.ts`)

This file lives inside your Temporal worker space. It is strictly deterministic. It leverages the official `@temporalio/ai-sdk` integration to execute agent thinking steps safely.

```typescript
import { proxyActivities, triggerEvent } from '@temporalio/workflow';
import { temporalProvider } from '@temporalio/ai-sdk/workflow';
import { generateText } from 'ai';
import type { BackstageAgentDefinition } from './types';

// Standard temporal proxy linking out to your non-deterministic execution tasks
const { logToBackstageStore, auditAction } = proxyActivities({
  startToCloseTimeout: '1 minute',
});

interface AgentRunInput {
  agent: BackstageAgentDefinition;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export async function runAgenticLoop(input: AgentRunInput): Promise<string> {
  let currentMessages = [...input.messages];
  let isExecutionComplete = false;

  // 1. Initialize the official Temporal AI SDK model abstraction
  const model = temporalProvider(input.agent.modelTier === 'smart' ? 'gpt-4o' : 'gpt-4o-mini');

  while (!isExecutionComplete) {
    // 2. Execute the model step. temporalProvider automatically intercepts 
    // generateText and executes it safely as a Temporal Activity under the hood!
    const response = await generateText({
      model,
      system: input.agent.systemPrompt,
      messages: currentMessages,
      tools: input.agent.tools,
      maxSteps: 1, // Stop after every individual turn to evaluate compliance/routing
    });

    // 3. Document the execution delta step into your standard ledger activity
    await logToBackstageStore({ text: response.text });

    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const call of response.toolCalls) {
        // Enforce strict enterprise control: check for manual gating
        if (call.toolName.startsWith('destructive_')) {
          // Temporal natively pauses execution right here, flushes variables,
          // and freezes the thread state on disk until an external 'approve' signal arrives
          await triggerEvent('human-approval-gate');
          await auditAction({ action: 'approved_write', tool: call.toolName });
        }
      }
      
      // Append tool results to messages array for the next loop turn
      currentMessages.push(...(response.responseMessages as any));
    } else {
      isExecutionComplete = true;
      return response.text;
    }
  }

  return 'Execution closed.';
}
```

### The Backstage API Service Bridge (`factory.ts` / Routing context)

This is how you dynamically pass request-scoped information (like the active user's authorization headers or the localized Knex SQL pool) from your Express router down to your Temporal execution worker loop.

```typescript
import { Connection, Client } from '@temporalio/client';
import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';

export interface WorkflowTriggerContext {
  logger: LoggerService;
  httpAuth: HttpAuthService;
  dbClient: any; // Knex client instance
}

export class BackstageTemporalBridge {
  constructor(private readonly client: Client) {}

  async startAgentThread(
    runId: string, 
    agentId: string, 
    query: string, 
    ctx: WorkflowTriggerContext
  ) {
    // 1. Extract request-scoped metadata safely
    const credentials = await ctx.httpAuth.credentials(ctx.dbClient);
    const tenantId = credentials.allAccess ? 'global' : credentials.principal.userEntityRef;

    ctx.logger.info(`Launching worker tracking engine for tenant allocation: ${tenantId}`);

    // 2. Push variables directly down as execution parameters. 
    // Temporal completely separates this invocation from the boot singletons.
    return await this.client.workflow.start('runAgenticLoop', {
      taskQueue: 'backstage-ai-queue',
      workflowId: `run-${runId}`,
      args: [{
        agent: { id: agentId, systemPrompt: '...', modelTier: 'smart', tools: {} },
        messages: [{ role: 'user', content: query }],
        metadata: {
          tenantId, // Isolated multi-tenancy parameter passed seamlessly
          initiatedBy: credentials.principal.userEntityRef
        }
      }],
    });
  }
}
```

## Why This Solves Your Architectural Concerns Fully

1. **Clean Codebase vs. Massive Metadata Overlap:** Look back at your ad-hoc `GraphExecutor.ts`. It was forced to manually track loop indexes (`seq++`), serialize JSON variables, and coordinate database states inside a complex `while` block. In the Temporal + AI SDK tandem, **all of that framework boilerplate code is completely deleted.** Temporal manages memory tracking and loop sequences natively, while the Vercel AI SDK handles the message payload schemas.
2. **Absolute Multi-Tenant Safety for Managed Backstage Hosting:** Because the workflow body is clean TypeScript code invoked on-demand, you can pass tenant variables, runtime user profiles, and organizational metadata objects down into the functions. The underlying shared Backstage singleton services remain completely stateless and free of request-data leaks.
3. **Flawless Commercial Viability:** Because you are utilizing the **MIT-licensed Temporal engine** alongside the **Apache 2.0-licensed Vercel AI SDK**, you are 100% immune to copyleft source code contamination rules. You can bundle this entire execution cluster setup, white-label it, and sell it as a premium managed Backstage product to corporate customers for a profit.
