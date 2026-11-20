# LLM Drivers

The Vercel AI SDK includes official drivers (called "providers") for dozens of major LLMs out of the box. You do not need to write your own unless you are connecting to a completely proprietary or custom internal API.

The SDK separates the core engine (`ai`) from individual model providers so you only install what you need and can swap models by changing a single line of code.

## Official First-Party Providers

Vercel maintains dedicated npm packages under the `@ai-sdk/*` namespace that handle each provider's specific streaming formats, tool calling, and structured outputs. Popular official packages include:

- **Major Labs:** `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google` (Gemini), `@ai-sdk/xai` (Grok), `@ai-sdk/mistral`, `@ai-sdk/deepseek`, and `@ai-sdk/cohere`.
- **Cloud Platforms:** `@ai-sdk/amazon-bedrock`, `@ai-sdk/azure`, and `@ai-sdk/google-vertex`.
- **Inference Hosts:** `@ai-sdk/groq`, `@ai-sdk/togetherai`, `@ai-sdk/fireworks`, `@ai-sdk/deepinfra`, `@ai-sdk/cerebras`, and `@ai-sdk/perplexity`.
- **Vercel AI Gateway:** You can also pass a plain model string (such as `'anthropic/claude-sonnet-5'`) directly to the core `ai` package without installing separate provider packages, routing requests through Vercel AI Gateway.

## Local Models & OpenAI-Compatible APIs

If you are running local models (like Ollama, LM Studio, or vLLM) or using third-party routers (like OpenRouter), you still don't have to build a driver from scratch:

- **OpenAI-Compatible Adapter:** The official `@ai-sdk/openai-compatible` package lets you point the SDK at any custom base URL that follows the OpenAI REST format.
- **Community Providers:** Open-source packages implement Vercel's [Language Model Specification](https://ai-sdk.dev/providers/community-providers) for tools like Ollama (`ollama-ai-provider`), Cloudflare Workers AI, and Hugging Face.