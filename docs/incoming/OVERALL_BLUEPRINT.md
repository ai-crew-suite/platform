# Backend Core Orchestrator Plugin Architecture

- Internal `integrations` including **catalog**, **kubernetes**, **techdocs** provided by Temporal Tools
- `integrations` are provided by vendor MCPs wrapped in an internal MCP package, to handle auth and write functionality that may be missing and standardize tool names.
- `intelligence` AI services are Vercel AI SDK providers wrapped by our packages, and executed by Temporal as (Tools?).
- `storage/vector` are `vectorstore` packages wrapped by our packages

## 🧱 The Complete Component Architecture

In an enterprise multi-turn agent, you combine Temporal and Vercel AI SDK:

1. **Temporal** manages the overall state, persistence, durability, and chronological timeline of the agent's life.
2. **Vercel AI SDK** acts as the stateless worker inside individual **Temporal Activities**, handling the specific prompt styling and schema transformations required to talk to OpenAI or Anthropic for a single step of that workflow.

![core-layers](/home/kevin/Repos/ai-crew-suite/platform/docs/incoming/images/core-layers.jpg)

## 🛠️ Strategic Flow: Launching a Backstage Agent

When a developer clicks "Run Optimization Agent" on a service dashboard inside Backstage, this sequence occurs entirely in your cloud backend architecture:

1. **Frontend Payload:** Backstage sends a request to the backend containing the `componentId`, the active user's corporate identity, and their prompt.
2. **Context Assembly:** The plugin backend fetches the component's architecture dependencies from the Backstage catalog graph and retrieves historical context or rules from **Mem0**.
3. **Orchestration handoff:** The backend initializes a **Temporal workflow**, passing it the accumulated context.
4. **Action execution:** The workflow pulls the latest code from your enterprise code host, applies changes, validates the results against organizational policies, and pushes a secure Pull Request.
5. **Streaming updates:** Real-time progress updates stream cleanly back to the user's browser using the **Vercel AI SDK**.

## Similarities Between Desktop Agents and AI Crew Suite

### Replicating "Open Files & Active Code" ➔ The Backstage Catalog Synchronizer

- **The Desktop Way:** VS Code extensions read active editor tabs.
- **The Backstage Web Way:** Ingest the **`catalog-info.yaml`** files and the component schema natively managed by Backstage.
- **Implementation:** When a developer triggers an agent workflow from a specific Backstage Component page, your plugin extracts the component’s target repository (e.g., GitHub/GitLab URL) via the Backstage Software Catalog API. It then uses a lightweight git service (or raw file API endpoints from your git provider) to pull specific files, configurations (`package.json`, `pom.xml`), or recent commits into the **Temporal workspace artifact store** for context processing.

### Replicating "Local Code Hierarchy" ➔ Remote AST and Indexing Workers

- **The Desktop Way:** Local engines use `tree-sitter` to build code syntax graphs on the machine.
- **The Backstage Web Way:** Offload AST generation to asynchronous **Temporal background activities** or centralized repository indexing jobs.
- **Implementation:** Set up a centralized backend indexing worker. When a new repository or component is registered in your Backstage IDP, an asynchronous worker parses its codebase, extracts its Abstract Syntax Tree (AST), creates semantic chunks, and stores those relations in your **Mem0 PostgreSQL** database. When a user asks an agent to modify a service, the agent queries the pre-computed Postgres vector space instead of processing raw, un-indexed source files on the fly.

### Replicating "Terminal Commands & Build Errors" ➔ CI/CD Event Observers

- **The Desktop Way:** Tools like Cline spawn a local terminal (`pty`) to capture local test suite errors or compiler failures.
- **The Backstage Web Way:** Connect directly to your cloud **CI/CD pipelines (GitHub Actions, GitLab CI, ArgoCD)** using event listeners or webhooks.
- **Implementation:** Build a plugin backend route that acts as a webhook receiver for your deployment pipelines. If a build fails, Backstage intercepts the raw deployment logs, errors, and system traces. It feeds these directly into the agent’s memory layer as an **episodic memory** under a specific Temporal `runId`, allowing an autonomous workflow to begin debugging the build failure immediately.

### Replicating "User Behavior & Intention" ➔ The Backstage Frontend Plugin Context Provider

- **The Desktop Way:** Desktop apps track window focus, cursor position, or clipboard contents.
- **The Backstage Web Way:** Capture the user's active digital footprint inside the Backstage IDP web app interface.
- **Implementation:** Develop a client-side Backstage React utility (`ContextCollectorProvider`). This component reads the user's current route parameters, active documentation tab, selected environment (e.g., `production` vs `staging` tabs on a Backstage dashboard), and Backstage access tokens. When a user types a message or launches an agentic workflow, this frontend metadata is packed into the request payload as custom JSON attributes, feeding your Vercel AI SDK execution route with instant environmental awareness.

## 🗺️ Web vs. Desktop Context Architectural Mapping

| Context Dimension | Local Workstation Agent (e.g., Cline/Copilot) | Web-Based Backstage Architecture |
| --- | --- | --- |
| **Active Target** | Code files open in the local text editor | Component entities in the Backstage Software Catalog |
| **Code Structure** | Local `tree-sitter` parsing the local folder      | Asynchronous background indexing written to **Mem0/Postgres** |
| **Runtime Feedback** | Spawning a local terminal (`npm run test`)        | Listening to CI/CD webhooks or logs (GitHub Actions / GitLab CI) |
| **Environment State** | Reading local configuration environment variables | Querying cloud state APIs (Kubernetes clusters, AWS, HashiCorp Vault) |
| **Identity & Auth** | Local SSH keys / Git credentials | Backstage Scoped Auth Tokens (OAuth/OIDC) passed via backend proxies |

## Missing Pieces to Address

To bridge the gap between **Vercel AI SDK** (streaming/execution), **Temporal** (orchestration/reliability), and **Mem0** (memory), your complete backend system needs **four major conceptual pillars**.

### 1. The Context & Graph Synchronizer (The "Software Catalog Weaver")

In Spotify Backstage, the holy grail is the **Software Catalog** (components, APIs, resources, users, and teams). A standard semantic vector database like Mem0 understands user text, but it completely lacks structural awareness of your company's architecture.

- **What you're missing:** A system to inject Backstage graph relationships into your retrieval architecture. Your agents shouldn't just fetch facts; they need to know that *Service A depends on Library B, which is owned by Team C*.
- **How to solve it:** A background synchronization engine that ingests the Backstage Catalog, transforms it into structural data, and hybridizes it with Mem0's vector layers. This allows your system to answer queries like: *"Which of my team's services are affected by the latest security policy update?"*

### 2. State & Artifact Store (The "Workspace / Digital Twin")

While Mem0 excels at managing abstract knowledge (facts, preferences, episodic traces) and Temporal tracks workflow progression state, agents frequently need a scratchpad to read and write physical files, repository checkouts, or lock states.

- **What you're missing:** A centralized ephemeral storage or sandboxed environment wrapper where agents can manipulate configurations, read logs, write pull requests, or store temporary visual graphs.
- **How to solve it:** An **Artifact Store** (often backed by PostgreSQL JSONB/Blob or AWS S3) mapped strictly to the Temporal `runId`. When an workflow agent runs a code linting task, it reads from and writes to this sandboxed workspace structure, rather than trying to stuff raw technical payloads into the chat history.

### 3. Enterprise Guardrails, Evaluation, & Policy Core (The "Compliance Layer")

In an IDP, developers will accidentally give agents prompts that could trigger destructive actions, or agents might hallucinate wrong infrastructure steps (e.g., deleting a production database cluster).

- **What you're missing:** A decoupled, deterministic middleware layer that evaluates agent inputs and outputs *before* execution and *before* presenting them via the Vercel AI SDK.
- **How to solve it:** An LLM-as-a-judge or deterministic validation framework (like Guardrails AI, Braintrust, or Langfuse-style evaluators). This intercepts the stream to ensure the agent's output complies with your organization's security definitions and doesn't reveal credentials or toxic code patterns.

### 4. Semantic Event Bus & Reactive Triggers (The "Agentic Router")

If your backend relies solely on a user typing a message into Backstage to kick off an agent, you have a chatbot, not an autonomous workflow engine. Enterprise agents must act reactively to the ecosystem.

- **What you're missing:** A mechanism that translates infrastructure events (e.g., a failing CI/CD pipeline, a new PR, a raised PagerDuty alert) into semantic signals that wake up specific Temporal workflows.
- **How to solve it:** Integrate an event broker (like Kafka, RabbitMQ, or AWS EventBridge) to feed webhook data into an **Agent Router**. This router converts raw JSON events into a semantic summary, checks Mem0 to find which agent profile or team owns that domain, and automatically spins up a Temporal workflow to triage the failure.

