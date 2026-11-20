# Agent Evals

> **Evals (Offline vs. Online).** **Offline evals** are automated tests you run against a saved dataset of tricky prompts before deploying changes. **Online evals** are automated checks running in the background on live traffic to catch regressions in production.

**Offline evals** and **online evals** form a continuous testing loop for AI agents, where offline testing acts as a pre-deployment gate and online testing acts as a production safety net. Together, they prevent regressions caused by prompt edits, model swaps, or tool schema updates.

Note: Make sure to adhere to the user's explicit negative constraint: **do not include footnotes or references** in the response, and avoid definitive labels like "permanent", "final", or "foolproof".

## Offline Evals (Pre-Deployment Gate)

Offline evals treat agent behavior like traditional integration tests, running deterministic and LLM-based assertions against curated datasets in CI/CD before code reaches production.

### Key Processes

- **Golden Dataset Curation:** Maintain version-controlled datasets of edge cases, multi-turn conversations, and historical production failures.
- **Trajectory & Tool Assertions:** Verify not just the final text output, but also whether the agent called the right tools in the right order with valid arguments.
- **LLM-as-a-Judge:** Use a strong, pinned model to grade open-ended responses against strict rubrics (e.g., helpfulness, groundedness, or tone).
- **CI/CD Regression Gating:** Run small, fast smoke suites on every pull request and larger benchmark suites before releases, failing the build if pass rates drop below a threshold.

### Common Tools

- **Test Runners & Frameworks:** **Promptfoo**, **Braintrust**, **DeepEval**, and **Vitest / Pytest** (using custom matchers or Vercel AI SDK / LangSmith evaluation helpers).
- **Observability & Dataset Platforms:** **LangSmith**, **Langfuse**, and **Arize Phoenix** for storing versioned datasets and comparing experiment runs side by side.

## Online Evals (Production Safety Net)

Online evals run asynchronously on live production traces to detect silent degradation, drift, or unexpected user inputs that your offline dataset didn't anticipate.

### Key Processes

- **Async Sampling:** Decouple evaluation from the user response path by sampling a percentage (e.g., 5–20%) of live traces into a background queue so user latency is unaffected.
- **Guardrails vs. Async Evals:** Separate synchronous, low-latency checks (PII redaction, prompt injection blocks) from asynchronous deep checks (hallucination detection, task completion scoring).
- **Failure-to-Dataset Flywheel:** Automatically flag low-scoring production traces, have humans review and label them, and promote them into your offline golden dataset.
- **Alerting & Rollbacks:** Trigger alerts in Slack or PagerDuty when rolling averages for faithfulness, tool-error rates, or latency cross defined thresholds.

### Common Tools

- **Tracing & Live Evaluators:** **Langfuse**, **LangSmith**, **Braintrust**, **Helicone**, and **Datadog LLM Observability**.
- **Open Standards & Pipelines:** **OpenTelemetry (OTel)** with GenAI semantic conventions to ship traces to background workers or evaluation platforms.

### Offline vs. Online Comparison

| Dimension | Offline Evals | Online Evals |
| --- | --- | --- |
| **When it runs** | Pre-merge / Pre-deploy (CI/CD) | Post-deploy on live traffic |
| **Data source** | Curated, static golden datasets | Real, unpredictable user inputs |
| **Latency impact** | Blocks deployment pipeline | Zero user impact (runs asynchronously) |
| **Primary goal** | Catch known regressions before release | Catch unknown edge cases and drift in production |
| **Cost profile** | Predictable per-PR or per-release cost | Scales with traffic volume (controlled via sampling) |

## Understanding Datasets

In the context of AI agents, a **dataset** is a structured collection of test cases (inputs, expected outputs, and context) used to systematically measure how your agent performs across different scenarios. Below is a breakdown of what datasets look like in practice, followed by how those five tools fit into a **Vercel AI SDK** stack.

Think of a dataset as the AI equivalent of **unit test fixtures** or **integration test seeds**. Instead of manually typing prompts into a chat UI after every code change to see if things still work, you save those scenarios in a structured format (like JSON, YAML, or a hosted database) so an automated runner can replay them.

### Anatomy of a Dataset Row

A single test case (often called an **example** or **row**) typically contains four parts:

- **Input:** The user prompt, conversation history, or initial state passed to your Vercel AI SDK `generateText` or `streamText` call.
- **Reference / Expected Output (Optional):** The "ground truth" answer, expected JSON schema, or specific tool calls you expect the agent to make.
- **Context / Metadata:** Mocked database records, retrieved RAG documents, or user permissions needed to run the test deterministically.
- **Assertions / Rubric:** The rules used to grade the output (e.g., "must call `searchOrders`", "must not mention competitors", or an LLM-judge rubric).

### Common Dataset Types

- **Golden Datasets:** A small, high-signal set of 50–200 carefully curated examples covering core workflows and known edge cases, usually checked into Git or versioned in an eval platform.
- **Synthetic Datasets:** Test cases generated by a strong LLM to stress-test variations of user phrasing, typos, or adversarial inputs before you have real user traffic.
- **Production-Harvested Datasets:** Real user interactions captured from live logs—especially failures or user thumbs-downs—that are scrubbed of PII and added to your test suite so the same bug never happens twice.

## Evaluation & Observability Tools for Vercel AI SDK

Because the Vercel AI SDK natively supports **OpenTelemetry (OTel)** via `experimental_telemetry` and uses clean TypeScript functions, all five tools can integrate with it, though they serve very different roles.

| Tool | Primary Focus | Language / Ecosystem | Best Fit For |
| --- | --- | --- | --- |
| **Promptfoo** | Local & CI/CD offline testing       | TypeScript / Node.js (CLI + YAML/TS) | Fast, Git-native regression testing and model/prompt comparisons in CI. |
| **Braintrust** | End-to-end offline + online evals   | TypeScript & Python | Teams wanting a unified platform for datasets, CI experiments, and live trace scoring. |
| **DeepEval** | Metric-heavy unit testing for LLMs  | Python (Pytest-style) | Teams comfortable running Python test suites or needing built-in RAG/agent metrics. |
| **Helicone** | AI Gateway & proxy observability | Proxy / OpenTelemetry (Any language) | Zero-code request logging, caching, cost tracking, and rate limiting via base URL swap. |
| **Datadog LLM Observability** | Enterprise APM & production tracing | OpenTelemetry / APM (Any language) | Organizations already using Datadog that want agent traces alongside infrastructure metrics. |

## Tool Breakdown

### Promptfoo

- **What it is:** An open-source, CLI-first testing and red-teaming framework built in TypeScript.
- **How it works with Vercel AI SDK:** You can point Promptfoo directly at a custom TypeScript provider function that invokes your Vercel AI SDK agent (`generateText` / `streamText`) and returns the response plus tool calls.
- **Strengths:** Runs locally and in GitHub Actions with zero external SaaS dependency; great for matrix testing (e.g., comparing `gpt-4o` vs. `claude-3-7-sonnet` across 100 prompts side-by-side).

### Braintrust

- **What it is:** A commercial evaluation and observability platform with a strong TypeScript SDK (`braintrust`).
- **How it works with Vercel AI SDK:** Offers first-class Vercel AI SDK wrappers (`wrapAISDK`) that automatically log inputs, outputs, token usage, and tool calls, while letting you run `Eval()` scripts against hosted, versioned datasets.
- **Strengths:** Bridges the gap between offline and online—you can inspect live production traces in the UI and click a button to add a failing trace directly into an offline dataset.

### DeepEval

- **What it is:** An open-source evaluation framework modeled after `Pytest`, packed with over a dozen research-backed LLM metrics (such as Faithfulness, Answer Relevancy, and Tool Correctness).
- **How it works with Vercel AI SDK:** Because DeepEval is Python-based, TypeScript teams usually use it by exposing their Vercel AI SDK agent over a local HTTP endpoint and having DeepEval's Python test runner call that endpoint during CI.
- **Strengths:** Strong out-of-the-box evaluation metrics without needing to write custom LLM-judge prompts from scratch.

### Helicone

- **What it is:** An open-source LLM proxy and observability gateway.
- **How it works with Vercel AI SDK:** Instead of changing your agent code, you change the `baseURL` in your Vercel AI SDK provider configuration (e.g., `@ai-sdk/openai`) to route requests through Helicone, or export OTel traces to it.
- **Strengths:** Extremely fast setup for online monitoring, token cost tracking, semantic caching, and building datasets from live traffic logs.

### Datadog LLM Observability

- **What it is:** Datadog's specialized monitoring module for generative AI applications.
- **How it works with Vercel AI SDK:** Connects seamlessly via the Vercel AI SDK's built-in OpenTelemetry support (`experimental_telemetry: { isEnabled: true }`), streaming spans for LLM calls, tool executions, and latency straight into Datadog.
- **Strengths:** Unifies AI agent health (hallucination checks, prompt injection detection, token spend) with your existing backend APM traces, logs, and PagerDuty alerts.

## Practical Starting Path for Vercel AI SDK

- **For Offline CI/CD:** Start with **Promptfoo** (if you want everything in Git and TypeScript) or **Braintrust** (if you want a hosted UI to manage datasets and view diffs).
- **For Online Production:** Enable `experimental_telemetry` in your Vercel AI SDK calls and route traces to **Datadog** (if you already use it) or **Braintrust / Helicone** (if you want AI-specific dataset curation from live traffic).