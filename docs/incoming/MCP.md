# Model Context Protocol (MCP)

The **Model Context Protocol (MCP)** is an open standard (created by Anthropic) designed to fix this limitation. Think of it like a microservice architecture built specifically for AI. Instead of writing local code for every tool, you can spin up an **MCP Server** that hosts a bunch of tools (e.g., a server that connects to GitHub, Slack, or a Postgres database).

An **MCP Server** is a lightweight, language-agnostic executable program that safely exposes three things to an AI client: **Tools** (actions the AI can take), **Resources** (data the AI can read, like files or logs), and **Prompts** (pre-built templates).

Architecturally, it behaves like a microservice specifically built for LLMs. Instead of an application connecting directly to an API, it talks to the MCP Server using the JSON-RPC 2.0 protocol.

The Vercel AI SDK provides a lightweight [MCP client](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) (`@ai-sdk/mcp`). This client connects to an MCP server, automatically downloads all its available tool definitions at runtime, and injects them straight into your SDK workflow.

Most major DevOps, platform engineering, and SaaS platforms now provide official or heavily supported Model Context Protocol (MCP) servers.

When you use MCP with the Vercel AI SDK, you fetch the remote tools and pass them directly into the standard `tools` object:

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';

// 1. Connect to an external MCP Server (e.g., a database tool)
const mcpClient = createMCPClient({
  transport: new Experimental_StdioMCPTransport({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://...'],
  }),
});

// 2. Fetch the tools from that server
const mcpTools = await mcpClient.getTools();

// 3. Pass them right into the AI SDK's tools object
const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Show me the last 3 users signed up in the database',
  tools: {
    ...mcpTools, // MCP dynamically populates this object with database tools!
  },
});

// Clean up the connection when done
await mcpClient.close();
```

## Comparison of Tools vs. MCPs

| Feature | Local `tools` Object | MCP (Model Context Protocol) |
| --- | --- | --- |
| **What is it?** | A native configuration block in the Vercel AI SDK. | An open-source protocol spec (like REST) for AI tools. |
| **Where does logic live?** | Written directly inside your application's codebase. | Hosted on a separate server (local process or cloud). |
| **How is it updated?**     | Requires changing your application code and re-deploying. | Modifying the MCP server automatically updates any connected app. |
| **Reusability** | Hard to share across different apps or platforms. | Write once, use in Vercel AI SDK, Cursor, Claude Desktop, etc. |

## Using MCPs vs. API Calls for External Services

```typescript
import { Document, VectorStoreIndex } from "@vectorstores/core";
// Dynamically imported based on user settings:
import { QdrantVectorStore } from "@vectorstores/qdrant";
// 1. Initialize the specific backend chosen by the userconst
customVectorStore = new QdrantVectorStore({
    url: process.env.USER_QDRANT_URL,
    apiKey: process.env.USER_QDRANT_API_KEY
});
// 2. The rest of your application code remains exactly the same
const index = await VectorStoreIndex.fromDocuments([document], {
    vectorStore: customVectorStore
});
```

By pivoting to MCP, your Backstage backend plugin transitions from being a complex translation layer to a lightweight **MCP Host**.

```text
[ Backstage Frontend ]
          │
[ Backstage Workflow Core (MCP Host) ]
          │ (Standardized MCP Protocol)
   ┌──────┼──────┐
   ▼      ▼      ▼
[GitHub [GitLab [Bitbucket
  MCP]    MCP]    MCP]
```

### 1. Uniform Interfaces Out-of-the-Box

MCP standardizes the schema of how tools express themselves. When your Backstage graph executor queries a Version Control MCP server, it asks for available tools via standard json-rpc. You don't need a unified internal interface anymore because **the protocol itself acts as the universal adapter interface**.

### 2. Dynamic Tool Discovery

If you want to swap GitHub out for GitLab for a specific project, you don't need to write new driver mappings. Your workflow engine just establishes a connection to the GitLab MCP Server, calls `listTools()`, and passes those tools directly to your Vercel AI SDK graph executor.

### 3. Offloading Authentication and State

One of the most annoying parts of platform engineering workflows is managing multi-tenant OAuth tokens across different tools. In 2026, enterprise MCP integration gateways like Arcade.dev or Composio exist specifically to handle auth. You can offload user token management to the gateway, and your Backstage plugin just handles the orchestration.

## Mapping Exernal Services to their MCP Endpoints

Instead of your current custom graph executor mapping to ad-hoc classes, your core backend plugin architecture would look like this:

1. **The Registry:** A configuration file or database table in Backstage mapping specific infrastructure targets to their MCP endpoints (e.g., `github: stdio -> npx @modelcontextprotocol/server-github`).
2. **The Client Session Lifecycle:** When a Backstage workflow triggers, your graph executor opens an MCP client connection (using `stdio` or `SSE` transports) to the required platform servers.
3. **The Execution Loop:** You pull down the unified tool list, hand them to your LLM graph router using the Vercel AI SDK (`experimental_createMCPClient`), and let the model determine the execution graph naturally.

### The Trade-offs to Keep in Mind

While this will drastically shrink your codebase, keep two platform engineering realities in mind:

- **Read-Only Bias:** Many official out-of-the-box MCP servers (especially in observability like Datadog) lean heavily toward **read-only context fetching** (fetching logs, alerts) rather than destructive mutations. For workflows that require active execution (like triggering a PagerDuty incident response or provisioning an AWS resource), verify that the server's tools array actually contains the mutating action you need. If it doesn't, you may need to write a tiny custom MCP server for that specific missing action.
- **Granular RBAC:** Letting an LLM execute raw tools fetched from an AWS or GitHub MCP server can be risky. Make sure to wrap your MCP clients in strict middleware that validates boundaries before the `execute` block runs.

## Auth Brokering for External Service MCPs

### Native Node-level Auth Brokering

Since you are using the Vercel AI SDK and spawning these MCP servers locally or over the network, **your Backstage backend plugin itself acts as the secure execution barrier**. You don't pass credentials to the LLM; you pass the credentials to the MCP process environment.

#### 1. Leveraging the Backstage OAuth Architecture

Backstage already has a built-in Authentication Provider system (handling GitHub OAuth, AWS IAM, GitLab, etc.). When a user triggers an agentic workflow in your Backstage UI, their session token is passed down to your backend plugin.

#### 2. Environment Injection Pattern (For `stdio`)

For local tools spun up via `stdio` (like the official GitHub MCP server), the standard method is injecting the user's ephemeral Backstage-managed OAuth token straight into the environment variables when spawning the child process.

```typescript
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';

// 1. Grab the current logged-in user's token from Backstage context
const userGitHubToken = await githubCredentialsProvider.getCredentialsForUser({
  userId: context.userId
});

// 2. Inject it safely directly into the spawned process environment
const mcpClient = createMCPClient({
  transport: new Experimental_StdioMCPTransport({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      ...process.env,
      GITHUB_PERSONAL_ACCESS_TOKEN: userGitHubToken, // Scoped entirely to this user session!
    },
  }),
});
```

**Why this works securely:** The LLM only sees a tool schema (e.g., `create_issue`). When it calls the tool, the query is executed inside a process isolated strictly to that user's access token. The AI never handles the token itself.

### Local `stdio` Servers: "Long-Running" for the Session Duration

When you run an MCP server locally on a machine or container using `stdio` transport, the process is **session-bound but eager**.

- **The Lifecycle:** When your Backstage workflow initializes an agent session, it spawns the MCP server child process. That process remains alive, humming in the background for the entire duration of that workflow or user session. Once the workflow concludes and the host client explicitly disconnects, the child process is terminated.
- **The Problem:** This behavior frequently creates "process hoarding" or leaking issues. If a platform eagerly starts up five different `stdio` tool packs (GitHub, Datadog, AWS, etc.) at the start of a session, those five processes sit idle, eating RAM and context windows, until the overall session ends.

### Network/Cloud `SSE` Servers: Forced into Being Ephemeral & Stateless

If you host MCP servers in the cloud (using `HTTP / SSE` or Streamable HTTP transport) to share them across multiple distributed Backstage pods, they are actively being pushed to become **completely ephemeral and stateless**.

An update to the **Model Context Protocol specification** explicitly removed protocol-level session initialization and tracking header objects (`Mcp-Session-Id`) from the core spec.

| Feature | Pre-Update MCP Servers | Modern/Enterprise MCP Servers |
| --- | --- | --- |
| **State** | **Stateful.** Expected a handshake and a persistent connection to keep track of a client. | **Stateless.** Operates as an independent request/response mechanism. |
| **Infrastructure** | Long-running VMs, persistent containers. | Serverless-friendly (AWS Lambda, Vercel, cloud functions). |
| **Scalability** | Hard to load-balance; tied to sticky sessions. | High scaling; any available server instance can answer a request. |

### What this means for your Backstage Architecture

Because you are building an orchestration platform, you should design your core backend plugin to treat MCP servers as **stateless and on-demand**.

1. **Implement Lazy Loading:** Do not eagerly spawn your GitHub or AWS tools the moment a user loads the plugin dashboard. Only spawn the `stdio` child process at the precise moment your graph executor triggers a node that *requires* that specific tool.
2. **Strict Idle Timeouts:** If you spin up a process to run a step in a graph workflow, do not leave it running forever. Implement a wrapper that kills the downstream process if it hasn't received a command loop request after a set interval (e.g., 2–5 minutes).
3. **Keep them Dumb:** Do not let your MCP servers store workflow or execution memory internally. The MCP server should be a purely stateless translation worker: it receives an authenticated request, hits the external API, returns the JSON payload, and clears its memory. Your central Backstage graph executor should hold the execution graph's true state.

## Stateless MCPs

When an architecture shifts to a stateless model where **"any available server instance can answer a request,"** it means the MCP server behaves exactly like a traditional, stateless REST API. The server itself holds absolutely no session memory, no user state, and no persistent credentials.

In the context of injecting user auth credentials, this means **every single incoming JSON-RPC request from your Backstage executor must carry the user's specific credentials with it.**

Here is how that works under the hood and how it changes your implementation.

#### The Stateful vs. Stateless Auth Flow

To see the difference, look at how credentials flow depending on how you host the server:

##### The Stateful Approach (Sticky Session / `stdio`)

When you spawn a local `stdio` process per user session, you inject the `GITHUB_TOKEN` into the environment variables **once** at startup. The process stays alive, remembers that token in its memory, and uses it for every subsequent tool call.

- *Downside:* If you have 10,000 active users, you have 10,000 active Node/Python processes running on your server.

##### The Stateless Approach (Shared Cloud Instances / `SSE`)

You deploy a pool of, say, 5 shared MCP server instances inside your infrastructure to handle requests for all users. When User A triggers a tool, their request hits a load balancer and lands on Instance #1. A second later, User A triggers another tool, and that request lands on Instance #4.
Because Instance #4 has no idea who User A is, **the credentials must be bundled directly inside the request payload itself.**

#### How to Inject Credentials in a Stateless Architecture

Because standard MCP tools only expect parameters like `repo` or `issue_id`, you have two primary methods to pass auth tokens dynamically through a stateless network request without leaking them to the LLM.

##### Method 1: Protocol-Level Authorization Headers (Best Practice)

When using the `SSE` (Server-Sent Events) transport, your Backstage backend plugin makes standard HTTP POST requests to the shared MCP server pool to execute tools. You inject the user's encrypted or raw auth token directly into the HTTP headers of the transport layer.

The shared MCP instance reads the header, executes the tool on behalf of that specific user, returns the data, and immediately forgets it.

```typescript
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';

// 1. Fetch the user's specific token inside Backstage
const userToken = await githubCredentialsProvider.getCredentialsForUser({ userId: context.userId });

// 2. Pass it through the transport configuration headers
const mcpClient = createMCPClient({
  transport: new Experimental_SseMCPTransport({
    url: new URL('https://mcp-shared-pool.internal'),
    // Every request sent by this client instance will include this user's header
    headers: {
      'Authorization': `Bearer ${userToken}`,
    },
  }),
});
```

##### Method 2: Request Metatranslation (Proxy Pattern)

If you are using third-party open-source MCP servers that don't natively look at HTTP authorization headers, your Backstage backend plugin acts as an auth-injecting proxy.

1. Your Graph Executor asks for a tool execution.
2. Your proxy intercepts the outbound JSON-RPC payload.
3. Your proxy securely injects an `auth` object or token into the tool's `arguments` block.
4. The proxy forwards the modified payload to whatever MCP server instance happens to be free.

### Why this is a Massive Win for Platform Engineering

While passing credentials per-request sounds like more bookkeeping, it solves the biggest hurdles of enterprise platform engineering:

- **Horizontal Scaling:** You can deploy your MCP servers as serverless functions (like AWS Lambda or Knative pods). They scale down to zero when nobody is running workflows, costing you nothing.
- **Instant Failover:** If an MCP server instance crashes mid-workflow, your Backstage executor doesn't care. It simply retries the request, the load balancer routes it to a healthy instance, and because the request contains the auth header, it executes seamlessly.
- **Zero Session Leakage:** There is zero risk of User A accidentally getting data from User B's session due to a lingering variable in a long-running process's memory.

## Writing MCP Servers

Because the protocol abstracts away the complicated "AI logic," your only job is to write a standard JavaScript or Python function that hits an API endpoint and returns JSON.

Here is exactly how you can wrap an existing vendor API to add a custom "write" capability for your Backstage workflows.

### Why Writing Your Own is Fast

You do not have to write raw JSON-RPC code. The official Vercel and Anthropic SDKs provide clean, declarative tools. To add a write capability, you only need to define three things:

1. **The Name:** What the tool is called (e.g., `create_datadog_downtime`).
2. **The Description:** A clear string explaining *when* the LLM should use it.
3. **The Schema:** A Zod object defining the input arguments so the LLM format-checks the data before hitting your server.

### Code Example: Building a Custom Datadog "Write" Server

If Datadog's official MCP only lets your agent read logs, you can build a tiny TypeScript MCP server using the `@modelcontextprotocol/sdk` to let your agent **trigger or mute alerts** via their REST API.

Here is a complete, production-ready blueprint using `stdio` transport:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// 1. Initialize a stateless MCP Server instance
const server = new McpServer({
  name: "custom-datadog-writer",
  version: "1.0.0",
});

// 2. Add your custom "Write" capability tool
server.tool(
  "mute-datadog-monitor",
  "Mutes or silences a specific Datadog monitor alert during an incident",
  // Define input schema so the LLM sends exact types
  {
    monitorId: z.number().describe("The numeric ID of the Datadog monitor"),
    scope: z.string().describe("The infrastructure scope to mute (e.g., 'host:pod-a')"),
    durationSeconds: z.number().default(3600).describe("How long to mute the alert in seconds"),
  },
  // The actual execution block that hits the vendor API
  async ({ monitorId, scope, durationSeconds }) => {
    // Auth token injected directly via process environment from your Backstage host
    const apiKey = process.env.DATADOG_API_KEY;
    const appKey = process.env.DATADOG_APP_KEY;

    try {
      const response = await fetch(`https://datadoghq.com{monitorId}/mute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "DD-API-KEY": apiKey!,
          "DD-APPLICATION-KEY": appKey!,
        },
        body: JSON.stringify({ scope, end: Math.floor(Date.now() / 1000) + durationSeconds }),
      });

      if (!response.ok) throw new Error(`Datadog API error: ${response.statusText}`);
      
      return {
        content: [{ type: "text", text: `Successfully muted monitor ${monitorId} for scope ${scope}.` }]
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Failed to mute monitor: ${error.message}` }]
      };
    }
  }
);

// 3. Connect the server to standard input/output (stdio) streams
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Stacking it in your Backstage Backend

Once you compile this code into a tiny JavaScript file (`node server.js`), integrating it into your main graph executor alongside the vendor's read-only tools is trivial using the Vercel AI SDK:

```typescript
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';

// Connect to the official Read-Only server
const officialReadOnlyClient = createMCPClient({
  transport: new Experimental_StdioMCPTransport({ command: 'npx', args: ['@datadog/mcp-official'] })
});

// Connect to your custom Write server
const myCustomWriteClient = createMCPClient({
  transport: new Experimental_StdioMCPTransport({ command: 'node', args: ['./dist/server.js'], env: { ... } })
});

// Stitch them together cleanly for the LLM graph
const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Check if there are alerts on service-b, and if so, mute them for 1 hour.',
  tools: {
    ...(await officialReadOnlyClient.getTools()), // Fetches read tools
    ...(await myCustomWriteClient.getTools()),    // Fetches your custom write tools
  }
});
```

## Available External Provider MCPs

Ready to use [toolsets](https://ai-sdk.dev/docs/foundations/tools#toolsets) (MCPs, platform specific tools with auth)

### Server-Side Execution Tools (Run entirely by the provider)

For these tools, the LLM writes code or initiates actions, runs them inside the provider's secure cloud sandboxes, and returns the finished data, text, or visual charts to you.

- **Code Interpreter / Advanced Data Analysis (OpenAI & Google):** The LLM writes and executes Python code in an isolated, sandboxed container. It evaluates complex math, runs loops, processes uploaded datasets, generates charts/plots, and outputs files.
- **Native Web Grounding / Search (Google & OpenAI):** A native tool that allows the LLM to pause generation, look up real-time information on the live internet using their respective search indexes, and inject the search results (complete with native citation metadata) directly back into the context window.
- **File / Knowledge Search (OpenAI):** Commonly known as the Retrieval-Augmented Generation (RAG) assistant layer. The model natively queries massive vector indexes attached to vector stores you create on the provider platform without you needing to engineer the vector chunking or matching manually.
- **Image Generation (OpenAI):** Models like GPT-4o can call DALL-E natively behind the scenes as a provider-defined tool to generate visual assets mid-conversation.
- **Workspace Intelligence Extensions (Google & Microsoft):** Enterprise models have native semantic protocols built explicitly to crawl data endpoints like **Google Workspace** (Docs, Sheets, Drive) or **Microsoft Graph** (Outlook, Teams, SharePoint) to surface cross-app data natively.

### Client-Side Protocol Tools (Defined by provider, executed by you)

For these tools, the provider has deeply optimized the model’s schema weights, but **you** provide the client-side sandbox or runtime environment for safety and operational flexibility. The provider specifies the tool's `inputSchema` and `description`, but you provide the `execute` function. These are sometimes called "client tools" because execution happens on your side.

Examples include Anthropic's `bash` and `text_editor` tools. The model has been specifically trained to use these tools effectively, which can result in better performance for supported tasks.

- **Computer Use / OS World Interaction (Anthropic):** A tool architecture specifically trained to interact with modern operating systems. It operates using schemas like `computer: click`, `computer: mouse_move`, and `computer: key`. The model takes screen coordinates and sends precise mouse and keyboard signals for you to execute locally on a virtual machine or container.
- **Code Repository / File Modifiers (Anthropic & GitHub):** Tools like `apply_patch` or explicit diff tools. The model is native-trained to emit structured unified diff patches, making it radically more efficient at targeting line-by-line file updates in programming repositories than rewriting an entire script.
- **Model Context Protocol (MCP) Directives:** The open standard adopted by Anthropic, Google, and others. While you host the MCP servers, modern reasoning models are explicitly trained with prior weights mapped to look for standard MCP schema primitives (e.g., standard Git skill-sets, directory trees, and databases).
