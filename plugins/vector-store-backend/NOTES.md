# Vector Store Notes

Usage in backends:

```typescript
// plugins/platform-backend/src/plugin.ts
import { createBackendPlugin, coreServices } from '@backstage/backend-plugin-api';
import { vectorStoreServiceRef } from '@internal/plugin-vector-store-node';
import { OpenAI } from 'openai'; // Or Ollama client, Bedrock client, etc.

export const platformAiBackendPlugin = createBackendPlugin({
  pluginId: 'platform-ai-coordinator',
  deps: {
    vectorStore: vectorStoreServiceRef,
    config: coreServices.rootConfig,
  },
  async register(env) {
    const openai = new OpenAI({ apiKey: env.config.getString('openai.token') });

    env.registerInit({
      deps: { vectorStore: env.vectorStore },
      async init({ vectorStore }) {
        
        // Define our custom embedding abstraction logic mapping directly onto OpenAI's API
        const openAiEmbedder = async (text: string): Promise<number[]> => {
          const response = await openai.embeddings.create({
            model: 'text-embedding-3-small', // Generates high-performance 1536 dim matrices
            input: text,
          });
          return response.data[0].embedding;
        };
    
        // Execute an Asymmetric query pipeline cleanly inside your application framework
        const memories = await vectorStore.searchAsymmetric(
          { text: 'How do I resolve pipeline authentication errors?', limit: 3 },
          openAiEmbedder
        );
        
        // Output contains matching IDs, texts, and calculated cosine similarity scores
      },
    });
  },
});
```
