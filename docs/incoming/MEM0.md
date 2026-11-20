# Mem0

**Mem0** is an open-source, multi-layer memory framework built explicitly for AI agents. It handles tracking short-term sessions, extracting user facts, and writing them to a database. It fully supports **PostgreSQL with pgvector**.

- **How it maps:** It extracts structured entities / facts automatically in the background while filtering out conversational noise.
- **Postgres Connection:** You pass your Postgres connection string, and Mem0 automatically creates and handles vector indexes like `HNSW` or `IVFFlat`.

## Example Implementation

```typescript
import { Mem0 } from 'mem0ai'; // Ensure your env has standard DB/LLM tokens

const memory = new Mem0({
  provider: "postgres",
  config: {
    connectionString: "postgresql://user:password@localhost:5432/agent_db",
    collectionName: "agent_memories",
    embeddingModelDims: 1536 // e.g., text-embedding-3-small
  }
});

// 1. Add conversation context (triggers background fact extraction)
await memory.add("I prefer PDF invoices and my order ID is #9988.", { 
  userId: "user_123" 
});

// 2. Search memories semantically using pgvector behind the scenes
const facts = await memory.search("What is the user's invoicing preference?", { 
  userId: "user_123" 
});
```

## Memory Categories

Mem0 uses a **Metadata-Driven Architecture**. It separates memory into hierarchical **scopes** (`user_id`, `agent_id`, `run_id`) and uses customizable metadata tags to mirror any categorization scheme you design.

| Category | What it Tracks | Details |
| --- | --- | --- |
| **Agent Scope + Custom Metadata** (guidelines) | Guardrails, company rules, and execution constraints. | Save with global `agent_id` or `app_id` and metadata `{"category": "policy"}`. |
| **User Scope + Custom Categories** (preference) | User personalization adjustments (e.g., "likes dark mode"). | Mem0 extracts these automatically to the user profile layer with a `preference` tag. |
| **User / Org Scope** (fact) | Long-term factual assertions independent of a thread. | Mem0's core feature; it extracts atomic facts and updates them when contradictions occur. |
| **Run Scope + Metadata** (memory) | Summaries of completed work or past workflow outcomes. | Stored per session (`run_id` or `session_id`), perfect for keeping track of a **Temporal Workflow ID**. |
| **PostgreSQL JSONB / Vercel AI SDK** (message) | Raw chat histories, telemetry, and exact token lists. | Exclude this from Mem0's semantic store; log exact history straight to your DB or Vercel's telemetry handlers. |

## What Mem0 Does with its Configured LLM

When you pass an LLM model config to the Mem0 container, Mem0 uses it strictly as an **automated "Information Extraction & Synthesis Engine."** Mem0 doesn't use the LLM to talk to your end users, and it doesn't use it to route complex agent intents. Instead, it uses the LLM behind the scenes to power its proprietary memory management algorithm. Every time your client code adds a new interaction stream to Mem0, the container uses that LLM to execute three precise operations under the hood:

### 1. Atomic Fact Extraction

When you call `mem0.add("I prefer using Vim keybindings and I'm currently working on a HIPAA-compliant deployment")`, the text is sent to the LLM wrapped in a strict system prompt. The LLM acts as an NLP parser to extract individual, evergreen facts from the raw conversational noise. It translates the input text into clean, structured facts like:

- `User prefers Vim keybindings.`
- `User works on HIPAA-compliant deployments.`

### 2. Semantic Memory Deduplication & Updating

This is where the LLM does its heaviest lifting. Mem0 asks the LLM to cross-reference the newly extracted facts against the user's *existing* database records. The LLM performs a semantic conflict check:

- **If a fact is new:** The LLM approves it for cold-storage injection.
- **If a fact conflicts with old history** (e.g., old record says *“Prefers Emacs”* but new input says *“Prefers Vim”*): The LLM flags the old memory to be deprecated or updated.
- **If it's duplicate noise:** The LLM discards it so your vector store doesn't suffer from data bloat.

Note: In Mem0's updated April 2026 extraction engine, they shifted directionally toward single-pass ADD-only extractions to optimize token overhead, but the core reliance on the LLM to distill facts remains identical.

### 3. Entity Linking & Metadata Enrichment

The LLM reads the distilled facts to isolate key entities (like `Vim` or `HIPAA`). It links these entities across separate memory slots. This metadata enrichment allows the container's search routing matrix to perform highly efficient hybrid lookups (combining raw vector math distance with keyword matching) when your application requests memory recall later.

### What it *doesn't* do with it

Because the LLM is siloed inside this deep metadata extraction loop, **the user never sees its output directly.**

If you configure Mem0 to use a cheap, fast model like `gpt-4o-mini`, that model is only responsible for parsing text into bulleted facts. Your main application layer (e.g., your custom Backstage plugin or your `temporal-worker`) can still use a frontier model like `gpt-4o` or Claude 3.5 Sonnet to handle the actual high-level reasoning and final responses sent back to the developer.

## Why Mem0 Only Asks for One LLM and One Embedder

The core job of the Mem0 container is strictly to act as an **automated memory compiler**. It is not a general-purpose orchestrator or an agent router.

When you send a message stream or an interaction history to the Mem0 container over the network, its internal Python engine performs three distinct operations:

1. It analyzes the input text and isolates foundational facts (e.g., *"User prefers Vim keybindings"*).
2. It generates a semantic vector embedding of that fact.
3. It stores the text in a relational table (`pgvector`) and inserts the vector data into an index layout.

Because the container only uses the LLM for this specific **fact extraction and synthesis loop**, it only needs to know about one primary model stack at a time. The complex logic—where you use a cheap, fast model for basic steps and switch to a frontier model for deep reasoning—belongs entirely inside **your application code or agent execution layer** (like your custom Backstage plugin or your Temporal workers). Your application code interacts with Mem0 to fetch or save memory context, but handles model routing independently.

## Safety Gating: Mem0 vs. Client Code

**You are entirely reliant on implementing input/output safety gatekeeping inside your client code.**

Mem0 does not contain native guardrail middleware, content filtering tools, or safety alignment checks. It blindly stores and indexes whatever strings you send to its endpoint, and retrieves whatever context vectors are closest in distance to a search query.

If you are dealing with sensitive data constraints (like SOC 2, HIPAA, or strict text processing rules), you must run your safety checks *before* data hits the container:

- **Ingress (Writing Memory):** Your Backstage plugin or Temporal worker must screen the prompt or response. If it triggers a safety flag, you drop the execution track or sanitize the data *before* calling `memory.add()`.
- **Egress (Reading Memory):** When you query Mem0 for history, you should review the retrieved text strings through your local safety filtering rules before injecting them into a prompt window for a frontier model.

## 🛠️ Architecture for Vercel AI SDK & Temporal

Because **Temporal** requires strict determinism and reliability, and the **Vercel AI SDK** focuses on streaming delivery, you should structure your retrieval augmentation system around Mem0 on PostgreSQL like this:

### Configure Mem0 with Custom Metadata Labels

When initializing Mem0 using your PostgreSQL `pgvector` substrate, use **Custom Categories** to instruct the background extraction LLM how to parse and classify incoming interactions into folders:

```typescript
import { Mem0 } from 'mem0ai';

const memory = new Mem0({
  provider: "postgres",
  config: {
    connectionString: process.env.POSTGRES_URL,
    collectionName: "agent_memory_substrate",
  },
  // Define categories to explicitly map Oracle's schema
  customCategories: ["policy", "preference", "fact", "episodic"]
});
```

### Writing Memories inside Temporal Activities

In Temporal, memory updates should always occur inside non-deterministic **Activities** (never directly inside the Workflow code). You can associate the Temporal Workflow Execution ID with Mem0's `runId` to anchor your episodic data:

```typescript
// apps/temporal/activities/memoryActivities.ts
import { StreamData } from '@ai-sdk/ui-utils'; // Vercel AI SDK utility if needed

export async function persistEpisodicMemory(
  userId: string, 
  temporalWorkflowId: string, 
  summaryText: string
) {
  await memory.add(summaryText, {
    userId: userId,
    runId: temporalWorkflowId, // Anchors the episodic memory to this specific Temporal run
    metadata: { 
      category: "episodic",
      completedAt: new Date().toISOString()
    }
  });
}
```

### Retrieving Mixed Categorical Memories for Vercel AI SDK

When a user initiates a stream using Vercel's `streamText`, you can query multiple memory categories simultaneously from your Postgres database, filtering down by user scope and metadata tags:

```typescript
// apps/api/chat/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function POST(req: Request) {
  const { messages, userId, temporalWorkflowId } = await req.json();

  // Retrieve facts, preferences, and relevant policies in parallel
  const retrievedMemories = await memory.search(messages[messages.length - 1].content, {
    userId: userId,
    runId: temporalWorkflowId
  });

  // Format retrieved items nicely into your system prompt
  const memoryPromptContext = retrievedMemories
    .map((m: any) => `[${m.metadata.category.toUpperCase()}]: ${m.content}`)
    .join('\n');

  const result = await streamText({
    model: openai('gpt-4o'),
    system: `You are an enterprise assistant. Utilize the following memory context:\n${memoryPromptContext}`,
    messages,
  });

  return result.toDataStreamResponse();
}
```

### 🎯 Summary Verdict

Mem0 handles facts and preferences out of the box natively, and cleanly organizes policies and temporal episodes by combining its explicit `run_id`/`agent_id` scopes with custom metadata attributes.

## "Manage My Memory" UI Layout

A **"Manage My Memory"** settings page is an essential UX pattern for AI applications. It gives users transparency and complete control over what the AI learns about them, resolving privacy anxieties and serving as a fallback for when an LLM extracts data incorrectly.

Since memories are fundamentally a list of discrete facts, the layout must be highly clean, scannable, and actionable. Here is the typical UI/UX layout, broken down by sections, followed by an interactive design wireframe.

1. **Category Tabs (Grouping):** Instead of a single massive wall of text, memories should be automatically bucketed by category tags (e.g., *Personal, Preferences, Work, Tech Stack*).
2. **Strict Chronological or Importance Sort:** Always show the most recently extracted facts at the top.
3. **In-Place Actions:** A user shouldn't have to navigate to a new page to fix a memory. They should be able to edit the text inline or delete it in exactly one click.
4. **Transparency Tooltips:** When a user hovers over a memory, a small metadata pill or tooltip should explain *when* it was learned and optionally *how* (e.g., *"Learned during your conversation on Oct 14"*).

### Typical Layout Component Structure

![manage-my-memory-mem0](/home/kevin/Repos/ai-crew-suite/platform/docs/Implementation/images/manage-my-memory-mem0.jpg)

### Mapping the UI to the Mem0 API

When building this layout, your frontend components will directly trigger Mem0 CRUD operations behind a simple backend API wrapper:

- **Populating the Page:** Call `memory.get_all(user_id="user_123")`. Your backend loops through the results, parses the `metadata` dictionary to group items by `category`, and sends them to the UI.
- **The [✏️ Edit] Button:** Clicking edit turns the static text field into an input box. Saving it executes:

```python
# Updates the exact string and updates the system timestamp
mem0_client.update(memory_id="mem_abc123", text="Sister's name is Sarah with an H.")
```

- **The [🗑️ Delete] Button:** Triggers an immediate soft or hard deletion in the vector index:

```python
mem0_client.delete(memory_id="mem_abc123")
```

- **The [➕ Add Custom Memory] Button:** Allows the user to seed the AI manually without having to chat. This uses direct import (`infer=False`) to guarantee exact phrase matching:

```python
mem0_client.add("Speaks fluent conversational Spanish", user_id="user_123", infer=False, metadata={"category": "languages"})
```

## OSS vs. Platform Versions

If you choose to use the **Mem0 Open Source (OSS)** library, you lose access to the following major platform-exclusive capabilities:

### Advanced Memory Automation Engines

- **Mem0 Dream (Background Consolidation):** The open-source version simply accumulates text-chunks chronologically. The Platform version runs an asynchronous pipeline called "Dream" that wakes up in the background to automatically compress stale data, resolve contradictions, and clean up duplicate memories without introducing latency to your active chat.
- **Memory Decay:** The platform lets you set expiration intervals on memories so they naturally fade or delete over time, keeping your vector space highly relevant.

### Operational & Data Operations

- **Native User Feedback Tracking:** The ability to natively call the `client.feedback()` API to register thumbs up/down signals—and have the platform automatically adjust future retrieval rankings ("self-healing")—is unique to the cloud product.
- **Batch Operations:** The OSS edition expects discrete adjustments. Massive bulk execution commands like **Batch Updates** and **Batch Deletes** are reserved for the Platform. 
- **Data Export:** The platform provides native endpoints to securely packaging and exporting a user's entire memory graph or vector profile.

### Governance and Management Infrastructure

- **Web Management Dashboard:** Mem0 OSS does not come with a user interface out of the box; you have to manage everything strictly via code or direct database queries. The Platform includes a dashboard at `app.mem0.ai` to view, search, and manually override extracted facts visually.
- **Multi-Tenant Hierarchy (Orgs & Projects):** The platform handles enterprise scoping natively (Organization ➔ Projects ➔ Applications ➔ Users). In OSS, separating sandboxes for different environments or client apps requires writing your own application-level metadata filtering logic.
- **Project-Wide Event & Audit Logs:** The OSS version only retains the localized internal version history for *individual* memory nodes. The Platform maintains a centralized log of every `add`, `search`, and `delete` operation across your entire organization for debugging and compliance audit trails.

### Other

- Custom Categories
- Temporal Reasoning
- Graph Memory

While the open-source SDK provides the core algorithmic components (the "how" of parsing text into a memory graph), the platform architecture manages the background automation.

The cloud architecture abstracts three specific distributed systems:

### Asynchronous Reinforcement Pipelines

In a standard open-source setup, when you ingest a memory or submit feedback, it is typically a blocking or simple transactional database write. The cloud platform instead uses an event-driven architecture designed to process these signals asynchronously without slowing down your user's chat session.

- **The Ingestion Event Stream:** When your application calls `client.feedback()`, the signal is placed onto a high-throughput message queue (such as Apache Kafka or AWS Kinesis).
- **The Reward Function Processor:** A fleet of decoupled background microservices consumes these feedback events. It treats a `POSITIVE` signal as a reward and a `VERY_NEGATIVE` signal as a heavy penalty.
- **Vector State Adjustment:** Instead of just changing a static text file, the pipeline recalculates how that specific type of entity extraction should be weighted. If a user consistently down-votes a specific category of extraction, the reinforcement pipeline dynamically tweaks the ingestion filter parameters for that specific user or agent profile.

### Dedicated Analytical Storage

A standard vector database (like Chroma or Pgvector) is excellent at mathematical nearest-neighbor searches, but it is notoriously inefficient at aggregate analytical processing (OLAP). The cloud platform handles this split-brain problem by separating operational memory from telemetry analytics.

- **The Dual-Write Architecture:** When your application interacts with the platform, the memory text and graph nodes go into an optimized transactional tier. Simultaneously, every search score, latency metric, and feedback reason is streamed into a high-performance, column-oriented analytical database (such as **ClickHouse**).
- **Pattern Extraction at Scale:** This dedicated analytical storage allows Mem0 to run complex queries over millions of events to spot system-wide degradation. For example, it calculates metrics like **Feedback Completion Rates** or **Memory Quality Trends** over time.
- **Why this matters:** Trying to run these multi-row trend calculations on a traditional production vector database would lock your tables and degrade your real-time chat retrieval latency.

### Background Prompt Tuning Loops

When you use open-source Mem0, the prompt template that decides how to extract or compress memories is relatively static. The platform version turns prompt management into a self-correcting loop.

- **Automated Error Isolation:** When negative feedback reasons are ingested into the analytical tier, a background cron system aggregates common failure categories (e.g., "Mismatched Locations" or "Outdated Contact Details").
- **Synthetic Evaluation Sets:** The platform compiles these historical failure traces into a hidden evaluation dataset.
- **Continuous Prompt Optimization:** An internal LLM-as-a-judge system runs optimization cycles against these failure states. It subtly tests variations of the internal system instructions to see which phrasing would have successfully avoided the hallucination or extraction error. Once a prompt variant shows a higher success metric across the evaluation dataset without breaking historical memories, the platform promotes it to the runtime environment.

## Implementing Platform Features in Open Source Version

### Self-Healing Pattern

The platform (hosted) version of Mem0 provides a "self-healing" feature with a standard `client.feedback()` API method to allow users to upvote and downvote memories.

In the open-source python package (`mem0-ai`), the `Memory` core class manages local state inside your own vector database (like Qdrant, Chroma, or Pgvector). It completely lacks the cloud backend's asynchronous reinforcement pipelines, dedicated analytical storage, and background prompt tuning loops.

To replicate this exact feature in an open-source architecture, you can orchestrate a self-healing loop using a **two-pronged strategy**: an immediate vector metadata update for fast down-ranking, combined with a background cleanup job to rewrite the bad memory.

### Step 1: Immediate Damage Control (Metadata-Based Down-Ranking)

When a user submits a negative feedback signal from your chat UI, your application API route intercepts it. Instead of calling a non-existent cloud endpoint, you immediately append a penalty modifier to that memory’s metadata payload.

```typescript
import { MemoryClient } from 'mem0ai';

interface MemoryMetadata {
  feedback_score?: number;
  feedback_reasons?: string[];
  [key: string]: any;
}

const client = new MemoryClient({ apiKey: 'your-local-or-oss-key' });

/**
 * API Route Handler / Controller for User Feedback
 */
async function handleUserFeedback(memoryId: string, userReason: string): Promise<void> {
  try {
    // 1. Fetch the existing memory item to preserve its current state
    const memoryItem = await client.get(memoryId);
    
    const currentMetadata = (memoryItem.metadata as MemoryMetadata) || {};
    
    // 2. Calculate a penalty multiplier and store the historical reason
    const updatedMetadata: MemoryMetadata = {
      ...currentMetadata,
      feedback_score: (currentMetadata.feedback_score ?? 1.0) - 0.5,
      feedback_reasons: [...(currentMetadata.feedback_reasons ?? []), userReason]
    };

    // 3. Update the local vector store metadata immediately
    await client.update({
      memory_id: memoryId,
      metadata: updatedMetadata
    });
    
    // 4. Hand off the heavy rewrite task to an asynchronous background worker queue
    await memoryRepairQueue.add({ memoryId, userReason });

  } catch (error) {
    console.error(`Failed to log feedback for memory ${memoryId}:`, error);
  }
}
```

When your application handles subsequent RAG search requests via `client.search()`, you check the metadata of returned records. If `feedback_score` is less than `1.0`, your retrieval engine can mathematically multiply the similarity score to penalize it before sending it to the LLM context window.

### Step 2: Asynchronous Repair Worker (The Self-Heal Prompt)

To execute the actual structural "self-heal"—where incorrect facts are permanently corrected or disaggregated—a TypeScript background process uses your local LLM driver to re-evaluate the memory block against the correction context.

```typescript
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface RepairJob {
  memoryId: string;
  userReason: string;
}

/**
 * Background Queue Worker Process
 */
async function asyncSelfHealWorker(job: RepairJob): Promise<void> {
  const { memoryId, userReason } = job;

  try {
    // 1. Retrieve the text block and related application conversational context
    const faultyMemory = await client.get(memoryId);
    const discussionContext = await db.getConversationContext(memoryId);

    // 2. Leverage a structured schema prompt to fix entity confusion or hallucinations
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an automated memory maintenance layer. Your task is to resolve factual conflicts or bad extractions.'
        },
        {
          role: 'user',
          content: `
            Faulty Extracted Memory: "${faultyMemory.text}"
            User Correction Feedback: "${userReason}"
            Conversation Context: ${JSON.stringify(discussionContext)}

            Instructions: Review the context. If the memory is entirely false or hallucinated, return exactly the string 'DELETE'. If it simply confused distinct entities (like Paris, Texas vs France), rewrite the string cleanly to store ONLY the accurate facts. Do not provide commentary outside the requested output.
          `
        }
      ],
      temperature: 0.1
    });

    const repairedContent = response.choices[0].message.content?.trim();

    // 3. Commit the correction or deletion back to your local Mem0 instances
    if (repairedContent === 'DELETE') {
      await client.delete(memoryId);
      console.log(`Successfully purged hallucinated memory: ${memoryId}`);
    } else if (repairedContent) {
      await client.update({
        memory_id: memoryId,
        data: repairedContent
      });
      console.log(`Successfully self-healed memory state for: ${memoryId}`);
    }

  } catch (error) {
    console.error(`Background self-healing failed for job ${memoryId}:`, error);
  }
}
```

#### Engineering Trade-Offs: Cloud vs. Open Source TypeScript

| Architectural Dimension  | Mem0 Platform (Managed Cloud)                                | Self-Hosted / Open Source (TypeScript Pattern)               |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| **Ingestion Effort**     | **Zero.** Single SDK API method out of the box.              | **Medium.** Requires setting up a wrapper and a background processing utility. |
| **Queue Management**     | Managed entirely by Mem0 cloud workers.                      | Requires an internal queue layout like **BullMQ** or **Inngest** to process asynchronously. |
| **Algorithmic Autonomy** | Modifies internal platform extraction prompt weights automatically. | Relies entirely on your custom structural TypeScript prompt templates for adjustments. |
| **Data Isolation**       | Relies on transmitting trace contexts to cloud API endpoints. | **Total Control.** Keeps prompts, metadata flags, and user correction logs entirely inside your internal network cluster. |

### Replicating this locally

If you are planning out a large enterprise deployment and choose to self-host to keep user context entirely within your own cloud perimeter, you essentially have to decide how much of this automation your engineering team wants to maintain.

Most teams self-hosting the open-source version choose to **build a lightweight version of the Asynchronous Reinforcement Pipeline** using a local queue (like BullMQ or Celery) to handle modifications to memory vectors, while skipping the high-overhead analytical and automated prompt-tuning layers completely.
