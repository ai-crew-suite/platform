# 🚀 Onboarding Guide

## Building AI Agents on the Core Platform Orchestrator

Welcome to the **Enterprise Agent Core Framework**. This platform allows you to build highly resilient, compliant, and cost-bounded AI workflows inside **Spotify's Backstage IDP**, powered by **Temporal**, **Vercel AI SDK**, and **Mem0**.

## Development Prerequisites

Ensure your local development container sandbox environment is running before starting:

```bash
# Export your gateway credentials
export OPENROUTER_API_KEY="sk-or-v1-your-key"

# Boot the integrated environment (Qdrant + Temporal Dev Cluster + Postgres)
./setup-sandbox.sh
```

- **Temporal Control Console:** `http://localhost:8233`
- **Qdrant Vector Inspection Panel:** `http://localhost:6333/dashboard`

## Blueprint Implementation Template

Create a new file under `src/workflows/myAgentWorkflow.ts`. This complete blueprint demonstrates how to handle input shapes, type safety, state mutation via **Immer**, automated data compliance, budget safeguards, and multi-agent delegation.

```typescript
import { createAgentWorkflowProxy } from '@backstage/plugin-agent-core-backend';
import { catalogEntityModifyPermission } from '@backstage/plugin-catalog-common';
import { produce } from 'immer'; // Standardized for zero-copy state mutations
import { z } from 'zod';

// --- 1. DEFINE SCHEMA CONSTRAINTS ---
const InfrastructureInputSchema = z.object({
  serviceId: z.string().describe('The Backstage catalog target entity string'),
  targetRegion: z.enum(['us-east-1', 'eu-central-1']).default('us-east-1'),
});

const InfrastructureStateSchema = z.object({
  serviceOwner: z.string().default(''),
  infrastructureHealthy: z.boolean().default(false),
  generatedConfigPatch: z.string().default(''),
  scaffoldedResourceId: z.string().default(''),
  finopsSummary: z.any().optional(),
});

// --- 2. INITIALIZE ARBITRARY API SURFACES VIA PROXIES ---
export const infrastructureTriageWorkflow = createAgentWorkflowProxy<
  typeof InfrastructureStateSchema,
  typeof InfrastructureInputSchema
>({
  id: 'infrastructure-triage-workflow',
  stateSchema: InfrastructureStateSchema,
  inputSchema: InfrastructureInputSchema,
})
  // --- 3. CONFIGURE ENTERPRISE COMPLIANCE & FINOPS CEILINGS ---
  .configureCompliance({
    tenantIsolation: 'strict-logical',
    dataRedaction: {
      enabled: true,
      rules: ['HIPAA_PHI', 'US_SSN'], // Mask tokens locally before internet egress
    }
  })
  .configureFinOps({
    maxWorkflowBudget: { amount: 10.00, currency: 'USD' },
    onBudgetAlert: { thresholdPercent: 80, action: 'escalate-to-approval' }
  })

  // --- STEP 1: RESOLVE SOURCE TOPOLOGY ---
  .addStep('gatherCatalogContext', async (state, ctx) => {
    // Leverage native Backstage catalog abstractions effortlessly
    const component = await ctx.catalog.getEntity(ctx.input.serviceId);
    const ownerGroup = await ctx.catalog.getOwner(ctx.input.serviceId);

    // Read documentation specifications through firewalls using UrlReader
    const rawRunbook = await ctx.urlReader.readUrl(
      `https://github.com{ctx.input.serviceId}/triage.md`
    );

    // IMMER APPROACH: Safely return immutable state patches
    return produce(state, (draft) => {
      draft.serviceOwner = ownerGroup.metadata.name;
    });
  })

  // --- STEP 2: SECURE MUTATING STEP WITH ADAPTIVE BYPASS ---
  .addStep('applyClusterOptimization', async (state, ctx) => {
    ctx.logger.info(`Tuning K8s cluster infrastructure parameters for owner: ${state.serviceOwner}`);

    // Call native capability driver inside safety perimeters
    const result = await ctx.capabilities.backstage.kubernetes.optimizeQuotas({
      serviceId: ctx.input.serviceId,
      region: ctx.input.targetRegion
    });

    return { infrastructureHealthy: result.success };
  }, {
    authorize: {
      permission: catalogEntityModifyPermission,
      getAttributes: (ctx) => ({ entityRef: ctx.input.serviceId }),
    },
    onUnauthorized: 'skip' // ADAPTIVE BYPASS: Bypasses step safely if user lacks RBAC roles
  })

  // --- STEP 3: NATIVE AI TEXT CHUNK STREAMING ---
  .addStreamingStep('generateManifestPatch', async (state, ctx) => {
    // Intercepts conversational data, populating short-term context windows via Mem0
    const historicalHints = await ctx.memory.search({
      query: `Kubernetes drift patch configurations ${ctx.input.serviceId}`,
      limit: 2
    });

    // Stream tokens in real time directly down the Express SSE wire to the frontend card
    const patchOutput = await ctx.ai.streamText({
      prompt: `Generate a compliant k8s manifest patch for ${ctx.input.serviceId}. Context hints: ${JSON.stringify(historicalHints)}`,
      onChunk: (chunk) => ctx.logger.debug(`Streaming block: ${chunk}`)
    });

    return { generatedConfigPatch: patchOutput };
  })

  // --- STEP 4: HUMAN-IN-THE-LOOP APPROVAL VALIDATION ---
  .requireApproval('verifyDeploymentPlan', {
    prompt: 'Review the generated manifest configuration patch before dispatching to the production Scaffolder engine.',
    schema: z.object({ confirmExecution: z.boolean() }),
    onApprove: async (approvalData, state, ctx) => {
      
      // Awaken and invoke the core execution scaffolder engine template
      const execution = await ctx.capabilities.backstage.scaffolder.executeTemplate({
        templateRef: 'template:default/k8s-apply-patch',
        values: { patch: state.generatedConfigPatch }
      });

      // Permanent cryptographic attestation committed to the corporate compliance trail
      ctx.compliance.attest({
        action: 'PRODUCTION_SCAFFOLD_HOTFIX',
        reasoning: 'Automated patch validated and signed off by authorized engineer.',
        evidenceRefs: [execution.id]
      });

      return { scaffoldedResourceId: execution.id };
    },
    onReject: (state, ctx) => 'cleanupAbortedRun'
  })

  .setTerminalOutcome('cleanupAbortedRun', (state, ctx) => {
    ctx.logger.warn(`Workflow execution run path aborted by developer user ref: ${ctx.userRef}`);
  });
```

## Production CI Verification Testing Gate

Every workflow definition file must have a corresponding test suite to ensure graph integrity before code merging. Create `src/workflows/__tests__/myAgentWorkflow.test.ts`:

```typescript
import { createTestHarness } from '@backstage/plugin-agent-core-backend/testing';
import { infrastructureTriageWorkflow } from '../myAgentWorkflow';

describe('Workflow Verification CI Gates', () => {
  it('should compile with zero graph path anomalies and process inputs safely', async () => {
    // Instantiates the isolated, clock-advancing in-memory test simulator harness
    const harness = createTestHarness(infrastructureTriageWorkflow);

    // Pre-seed mock values for capability drivers securely
    harness.capabilities.backstage.catalog.getEntity.mockResolvedValue({ metadata: { name: 'catalog-service' } });
    harness.capabilities.backstage.catalog.getOwner.mockResolvedValue({ metadata: { name: 'platform-team' } });
    harness.capabilities.urlReader.readUrl.mockResolvedValue(Buffer.from('Mock Runbook Data'));

    // Step execution iteration processing loop
    const updatedState = await harness.next(
      { serviceId: 'catalog-service', targetRegion: 'us-east-1' }, 
      'gatherCatalogContext'
    );

    // Assert states behave deterministically
    expect(updatedState.serviceOwner).toBe('platform-team');
    
    // Safety check confirming no developer accidentally leaked plaintext keys from ctx.secrets
    expect(harness).toHaveNoLeakedSecrets();
  });
});
```

## Operational Best Practices Checklist

- **State Reductions (Immer Usage):** Always utilize `produce(state, (draft) => { ... })` when mutating large objects inside your step handlers. This prevents references from cross-contaminating previous execution markers.
- **The Replay Restriction:** Never declare volatile operators (`new Date()`, `Math.random()`, or dynamic network calls) outside of a `ctx.capabilities` or a step activity wrapper. Doing so breaks Temporal's trace replay engine and stalls production worker containers.
- **Context Token Shielding:** Never place raw string tokens into the `state` engine array dictionary. Always funnel keys securely through `ctx.secrets.getScopedVaultSecret()`. This emits a protected reference envelope that scrubs plaintext data from logs, dashboards, and databases automatically.
