# LLM Observability with Langfuse

Langfuse is an open-source LLM engineering and observability platform designed to help developers monitor, debug, evaluate, and manage Large Language Model (LLM) applications and multi-agent workflows. It functions essentially as a "flight recorder" for AI applications, eliminating the "black box" problem by tracking every single step an LLM or agent takes. It fits perfectly into a `Temporal + Vercel AI SDK + Mem0` toolchain.

## Langfuse Four Core Pillars

### Hierarchical Tracing & Observability

Langfuse captures the entire execution graph of your application in production.

- **Granular Logs:** It maps out nested steps, including the initial user prompt, vector database retrieval (RAG) context, specific tool/API calls, and the final model generation.
- **Resource Tracking:** For every single step in a trace, it automatically logs critical operational metrics: **exact token usage, latency, and financial cost**.
- **Framework Agnostic:** It is OpenTelemetry-native and integrates directly via SDKs with standard toolchains like the Vercel AI SDK, LangChain, LlamaIndex, and raw OpenAI/Anthropic API calls.

### Evaluation & Guardrails

To help teams move away from manual, anecdotal testing, Langfuse provides structured mechanisms to score output quality.

- **Automated Evals (LLM-as-a-Judge):** You can set up automated evaluators to score live production traces or test runs for specific criteria like toxicity, relevance, and hallucinations.
- **Human Feedback Loops:** It tracks user feedback (such as thumbs up/down or explicit ratings) directly from your frontend application and attaches it to the corresponding trace.
- **Datasets & Experiments:** You can create evaluation datasets from production failure modes to benchmark new prompts or models before releasing them to users.

### Centralized Prompt Management

It decouples prompt engineering from application code deployment.

- **Version Control:** You can write, test, and version-control prompts directly within the Langfuse UI.
- **Dynamic Deployments:** Prompts can be promoted to production, staged, or rolled back instantly via the API without redeploying your core application backend.
- **Performance Caching:** It utilizes server-side and client-side caching to ensure fetching the latest prompt doesn't introduce unwanted latency overhead.

### Metrics & Analytics Dashboards

Langfuse aggregates transactional data into higher-level engineering dashboards.

- **Usage Trends:** It provides bird's-eye metrics tracking overall system performance, error rates, token spending, and quality scores over time.
- **Production Underpinnings:** Under the hood, it relies on ClickHouse for lightning-fast, high-throughput analytical query processing, alongside PostgreSQL for transactional application states.

## 🧱 How Langfuse Integrates with Your Stack

![langfuse-stack-integration](/home/kevin/Repos/ai-crew-suite/platform/docs/Implementation/images/langfuse-stack-integration.jpg)

### 1. Vercel AI SDK (Native Compatibility)

The Vercel AI SDK has built-in support for OpenTelemetry telemetry. Langfuse provides a tiny, official integration handler (`@langfuse/vercel-ai`). You simply pass this handler into your `generateText` call inside the workflow:

```typescript
const { text } = await generateText({
  model: temporalProvider.languageModel('gpt-4o'),
  prompt: userInput,
  experimental_telemetry: langfuse.getVercelAITelemetry(), // Automatically logs tokens, prompts, and tool results
});
```

### 2. Temporal (The Root Trace)

Temporal provides the durable backbone of your agent. When a user kicks off a new task, you can use the Temporal **Workflow ID** or **Run ID** as the root `traceId` in Langfuse. This ensures that even if your agent takes 4 days to finish due to human approval steps or long API retries, every single attempt, tool call, and LLM retry is bound to that single tracking number in your Langfuse dashboard.

### 3. Mem0 (The Context Span)

When you invoke your activity `proxyActivities.fetchMem0Memory()`, you can wrap that code inside a custom Langfuse "Span." This allows you to visually inspect the exact memory strings Mem0 retrieved alongside the prompt sent to GPT-4o, giving you a clear view of why the LLM answered the way it did.

## 🎨 What Your Dashboard Looks Like

When an agent execution occurs inside your Backstage setup, you can open Langfuse and view a clean, waterfall-style timeline:

- 🌐 **Trace:** `order-processing-id-123` (Your Temporal Workflow ID)
  - 🧠 *Span:* `fetchMem0Memory` (Logs what memory context was extracted)
  - 🤖 *Generation:* `gpt-4o` (Logs the system prompt, token counts, and latency)
  - 🛠️ *Span:* `scaffoldComponent` (Logs the inputs/outputs of the Backstage tool your agent fired)
  - 💾 *Span:* `saveToMem0` (Logs the updated graph changes written back to long-term memory)

Using this specific setup avoids any lock-in to the LangChain ecosystem while granting you total visibility over your customized agent state machine.

## Langfuse Deployment Stack

A self-hosted Langfuse stack consists of a few **core decoupled container services and storage engines** that can easily be run via Docker Compose or targeted to cloud-native orchestrators like Kubernetes (EKS/GKE) or AWS ECS.

The standard self-hosted architecture is structured as follows:

![langfuse-deployment-stack](/home/kevin/Repos/ai-crew-suite/platform/docs/Implementation/images/langfuse-deployment-stack.jpg)

### The Component Breakdown

#### Compute Engines

- **`langfuse-server`**: This is the core application layer built as a Next.js (Node.js) web app. It handles incoming API traffic from your application SDKs, handles user authentication, serves the web UI dashboards, and manages the prompt repository.
- **`langfuse-worker`**: A dedicated backend worker container that processes heavy, non-blocking asynchronous background operations. It manages the queue for batch tracing ingestion, runs automated evaluations (such as matching LLM-as-a-judge score patterns), and compiles long-term analytics.

#### Storage & Database Tier

- **PostgreSQL (v16+)**: Acts as the transactional operational database. It stores users, organizations, API access keys, fine-grained RBAC permissions, audit logs, and versioned prompt strings.
- **ClickHouse**: The high-performance, column-oriented OLAP database that serves as the backbone for Langfuse v2.x architecture. It ingests thousands of nested telemetry steps per second without locking tables, handling raw log traces, token calculations, and real-time dashboard aggregation efficiently.
- **Redis or Valkey (Optional but highly recommended):** Used for managing the job queues passed between the API server and the background workers to guarantee message safety and absorb traffic spikes.

### Production Reference: Minimal `docker-compose.yml`

This basic setup links the decoupled services, mounts local storage volumes, and wires up an initial root administrator account.

```yaml
version: '3.8'

services:
  # 1. Transactional Database
  postgres:
    image: postgres:16-alpine
    container_name: langfuse-postgres
    environment:
      POSTGRES_USER: langfuse_user
      POSTGRES_PASSWORD: secure_pg_password
      POSTGRES_DB: langfuse
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U langfuse_user -d langfuse"]
      interval: 5s
      timeout: 5s
      retries: 5

  # 2. Analytics OLAP Database
  clickhouse:
    image: clickhouse/clickhouse-server:24.3-alpine
    container_name: langfuse-clickhouse
    volumes:
      - chdata:/var/lib/clickhouse
    ports:
      - "8123:8123"
      - "9000:9000"
    express: true

  # 3. Main Web Application Server
  langfuse-server:
    image: langfuse/langfuse:2
    container_name: langfuse-server
    depends_on:
      postgres:
        condition: service_healthy
      clickhouse:
        condition: service_started
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - NEXTAUTH_URL=http://localhost:3000
      - NEXTAUTH_SECRET=generate_a_long_random_signing_key_here
      - SALT=generate_another_random_salt_string_here
      # DB Connections
      - DATABASE_URL=postgresql://langfuse_user:secure_pg_password@postgres:5432/langfuse
      - CLICKHOUSE_URL=http://clickhouse:8123/default
      # Initial Admin Setup
      - LANGFUSE_INIT_ORG_NAME=Dev-Platform-Engineering
      - LANGFUSE_INIT_PROJECT_NAME=LLM-Core-Traces
      - LANGFUSE_INIT_USER_EMAIL=admin@internal.tools
      - LANGFUSE_INIT_USER_PASSWORD=secure_admin_password_123
      # Workers & Queueing (Inline if keeping topology small)
      - LANGFUSE_ENABLE_WORKER_EXECUTION=true 

volumes:
  pgdata:
  chdata:
```

### Architectural Decisions for Scaling Out

When moving this setup into an enterprise cluster environment (such as EKS via AWS Terraform modules), you will typically make three specific infrastructure modifications:

1. **Isolate the Workers:** Turn off `LANGFUSE_ENABLE_WORKER_EXECUTION` on your front-facing server containers. Spin up separate replicas of the same image with `LANGFUSE_ENABLE_WORKER_EXECUTION=false` for the Web UI API pods, and separate backend pods running explicitly as a dedicated worker pool.
2. **Offload Databases to Managed Services:** Replace the containerized databases with production-grade cloud services:
   - Point `DATABASE_URL` to a multi-AZ **Amazon RDS PostgreSQL** instance.
   - Point `CLICKHOUSE_URL` to an enterprise **ClickHouse Cloud** workspace or managed ClickHouse cluster.
3. **Decouple NextAuth Secrets:** Pull the `NEXTAUTH_SECRET`, `SALT`, and database connection strings entirely out of your manifests and load them dynamically using an orchestrator secret engine (like AWS Secrets Manager or HashiCorp Vault) injected at the container entrypoint.
