# Directory and File Layout

```bash
├── packages/
│
│   # =========================================================================
│   # PACKAGE 1: BACKSTAGE NODE PLUGIN (Contracts, Types, Extension Points)
│   # =========================================================================
│   ├── backstage-plugin-agent-node/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                 # Main export entrypoint for all drivers & core
│   │       │
│   │       ├── extension-points/        # Targets where separate driver plugins register
│   │       │   ├── platform-driver.extension-point.ts  # For observability, VCS, etc.
│   │       │   ├── storage-driver.extension-point.ts   # For pgvector, qdrant, etc.
│   │       │   └── security-driver.extension-point.ts  # For HashiCorp Vault, AWS KMS, etc.
│   │       │
│   │       ├── blueprints/              # Backstage Blueprints enforcing strict driver interfaces
│   │       │   ├── platform-driver.blueprint.ts
│   │       │   ├── storage-driver.blueprint.ts
│   │       │   └── security-driver.blueprint.ts
│   │       │
│   │       ├── events/          # Strict event schemas and type definitions
│   │       │   ├── audit.types.ts
│   │       │   ├── system.types.ts
│   │       │   └── workflow.types.ts
│   │       │
│   │       ├── api/
│   │       │   ├── fluent-api.types.ts
│   │       │   └── context.types.ts
│   │       │
│   │       └── utils/                   # PII/PHI masking/validation primitives used by drivers
│   │           └── validation.ts
│   │
│   # =========================================================================
│   # PACKAGE 2: CORE AGENT BACKEND PLUGIN (The Orchestration Engine)
│   # =========================================================================
│   ├── backstage-plugin-agent-backend/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                 
│   │   │   ├── plugin.ts                
│   │   │   │
│   │   │   # =========================================================================
│   │   │   # 1. SHARED CORE ENGINE (Accessible by both Web Routers & Workers)
│   │   │   # =========================================================================
│   │   │   ├── engine/
│   │   │   │   ├── fluent/              
│   │   │   │   │   ├── base.ts          # Defs for the base AgentBuilder class & shared internal state
│   │   │   │   │   ├── builder.ts       # Composition Root (Combines all mixins/traits into final class)
│   │   │   │   │   # --- EXISTING MIXIN DOMAINS ---
│   │   │   │   │   │
│   │   │   │   │   ├── agent/           # Agent configuration domain methods
│   │   │   │   │   │   ├── identity.ts  # .withName(), .withInstructions()
│   │   │   │   │   │   └── model.ts     # .withTemperature(), .withLLMProvider()
│   │   │   │   │   │
│   │   │   │   │   ├── memory/          # Memory tracking & optimization domain methods
│   │   │   │   │   │   ├── long-term.ts # .withUserMemory(), .withMem0Sync()
│   │   │   │   │   │   └── short-term.ts# .withContextWindow(), .withBufferLimit()
│   │   │   │   │   # --- NEW RAG MIXIN DOMAIN ---
│   │   │   │   │   └── retrieval/       # API chaining for search parameters & sources
│   │   │   │   │   │   ├── sources.ts   # .withStaticDocuments(), .withWebSearch()
│   │   │   │   │   │   └── search.ts    # .withVectorSearch(), .withSimilarityThreshold()
│   │   │   │   │   │
│   │   │   │   │   ├── tools/           # Vercel AI SDK Tool execution hook methods
│   │   │   │   │   │   ├── standard.ts  # .withSystemTools(), .withAllowedActions()
│   │   │   │   │   │   └── custom.ts    # .withDynamicTool()
│   │   │   │   │   │
│   │   │   │   │   └── workflow/        # Execution & Signal coordination domain methods
│   │   │   │   │       ├── signals.ts   # .onSignal(), .waitForSignal()
│   │   │   │   │       └── lifecycle.ts # .onStart(), .onTimeout(), .compile()
│   │   │   │   │
│   │   │   │   └── compiler/            
│   │   │   │       └── serialization.ts # Compiles grouped engine traits into a JSON execution graph
│   │   │   │
│   │   │   # =========================================================================
│   │   │   # 2. RUNTIME 1: SYNCHRONOUS HTTP LAYER (Receives requests & starts workflows)
│   │   │   # =========================================================================
│   │   │   ├── http/                    
│   │   │   │   ├── router/              
│   │   │   │   │   ├── routes.ts        # Handlers invoke the builder & dispatch to Temporal
│   │   │   │   │   └── middleware/
│   │   │   │   │       ├── auth.ts      
│   │   │   │   │       ├── compliance-ctx.ts
│   │   │   │   │       └── error.ts     
│   │   │   │   └── client/
│   │   │   │       └── temporal-dispatcher.ts # Client wrapper triggering the generic workflow
│   │   │   │
│   │   │   # =========================================================================
│   │   │   # 3. RUNTIME 2: ASYNCHRONOUS TEMPORAL WORKER LOOP (The Interpreter Environment)
│   │   │   # =========================================================================
│   │   │   ├── worker/                  
│   │   │   │   └── temporal/            
│   │   │   │       ├── worker.ts        # Boots the Temporal worker process
│   │   │   │       │
│   │   │   │       ├── workflows/       
│   │   │   │       │   ├── index.ts     
│   │   │   │       │   └── dynamic-agent-executor.workflow.ts # ◄ THE ONLY WORKFLOW: Interprets the serializable definitions
│   │   │   │       │
│   │   │   │       ├── activities/      # Discrete, side-effect safe steps managed by the workflow
│   │   │   │       │   ├── index.ts
│   │   │   │       │   ├── driver-proxy.activity.ts
│   │   │   │       │   ├── compliance-reporting.activity.ts
│   │   │   │       │   ├── llm-call.activity.ts # Wraps Vercel AI SDK execution in activities
│   │   │   │       │   # --- NEW RAG COMPUTATION ACTIVITIES ---
│   │   │   │       │   └── retrieval.activity.ts # Handles chunking, vector fetching, and re-ranking
│   │   │   │       │
│   │   │   │       └── context/         # The 50+ utility methods injected into activities/tasks
│   │   │   │           ├── execution-ctx.ts 
│   │   │   │           ├── ai-helpers.ts # Exposes @temporalio/ai-sdk workflow primitives safely
│   │   │   │           └── compliance-helpers.ts
│   │   │   │
│   │   │   # =========================================================================
│   │   │   # 4. CROSS-CUTTING COMPLIANCE & CONFIGURATION INFRASTRUCTURE
│   │   │   # =========================================================================
│   │   │   ├── platform/                
│   │   │   │   ├── config/              
│   │   │   │   │   ├── temporal.ts
│   │   │   │   │   └── mem0.ts
│   │   │   │   └── compliance/          
│   │   │   │       ├── audit-logger.ts  
│   │   │   │       ├── encryption.ts    
│   │   │   │       └── retention.ts     
│   │   │   │
│   │   │   └── services/                # Low-level client instances used by activities/routers
│   │   │       ├── ai/                  # Vercel AI SDK low-level driver routing
│   │   │       │   ├── client.ts        
│   │   │       │   ├── streams.ts       
│   │   │       │   └── tools/
│   │   │       │
│   │   │       # --- CORE RAG SERVICE LAYER ---
│   │   │       ├── retrieval/           # Orchestrates core RAG business pipelines
│   │   │       │   ├── chunking.ts      # Text splitting strategies (token/semantic based)
│   │   │       │   ├── embedding.ts     # Maps text to vectors via Vercel AI SDK
│   │   │       │   └── reranking.ts     # Optimizes retrieved context node relevance scores
│   │   │       │
│   │   │       └── memory/              # Mem0 low-level interface
│   │   │           ├── client.ts        
│   │   │           └── guardrails.ts    
│   │   │
│   │   └── tests/                       
│   │       ├── setup.ts                 
│   │       ├── unit/                    # Validates builder serialization output forms match specs
│   │       ├── integration/             
│   │       └── temporal/                # Tests the generic interpreter using sample JSON payloads
│   │           └── dynamic-agent-executor.test.ts
```
