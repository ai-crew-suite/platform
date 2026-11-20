# Vercel AI SDK

## Capabilities of Supported Models

### 🧩 Object Generation (Structured Outputs)

This means the model can natively **guarantee its output matches a specific JSON schema** (like a Zod schema).

- When checked, you can use the SDK's `generateObject` or `streamObject` functions.
- Rather than relying on lucky prompting (e.g., *"please respond in JSON"*), the model uses strict constraints (like OpenAI's Structured Outputs) to ensure your backend receives perfectly typed data without parsing errors.

### 🛠️ Tool Usage (Function Calling)

This tells you if the model can **call external functions or APIs** that you define.

- If supported, you can pass a `tools` object to functions like `generateText`.
- The model will automatically analyze the user prompt, determine if it needs to use a tool (like `getWeather` or `searchDatabase`), and output a structured response telling your application to execute that function with specific parameters.

### 🔄 Tool Streaming

While "Tool Usage" means the model can call tools, **Tool Streaming** means the model can **stream the tool invocations and their results back to the user interface in real-time**. This is crucial for user experience. It allows the frontend to show loading indicators or incremental progress steps (e.g., *"Searching database..."*) while a multi-step agent workflow is executing in the background.

### 🌊 Streaming

This indicates if the model supports **token-by-token text streaming** via functions like `streamText`. When supported, the AI doesn't make the user wait for the entire paragraph to finish generating; it starts rendering words on the screen immediately as they are being computed, drastically reducing perceived latency.

## The Standard `tools` Object (Local Tools)

Traditionally, when you want an LLM to be able to do something (like check a database or get the weather), you write a local `tools` object directly in your code using a schema library like **Zod**.

You define the tool's description (so the AI knows when to use it), the parameters it accepts, and an `execute` function that actually runs the code.

```typescript
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'What is the weather in New York?',
  // This is the tools object:
  tools: {
    getWeather: tool({
      description: 'Get the current weather for a location',
      parameters: z.object({
        city: z.string().describe('The city to get weather for'),
      }),
      execute: async ({ city }) => {
        // Your actual backend logic/API call goes here
        return { weather: 'Sunny', temperature: '72°F' }; 
      },
    }),
  },
});
```
