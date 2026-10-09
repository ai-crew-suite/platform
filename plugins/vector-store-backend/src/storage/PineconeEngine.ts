/*
 * Copyright 2026 The AI Crew Suite Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { Pinecone, Index } from '@pinecone-database/pinecone';
import {
  AbstractVectorStorageEngine,
  VectorSearchResult,
} from '@ai-crew-suite/plugin-vector-store-node';

export class PineconeEngine extends AbstractVectorStorageEngine {
  private client: Pinecone;
  private indexInstance?: Index;

  constructor(private readonly apiKey: string, private readonly indexName: string) {
    super();
    this.client = new Pinecone({ apiKey: this.apiKey });
  }

  async initialize(): Promise<void> {
    // 1. Check if the required index exists
    const indexesList = await this.client.listIndexes();
    const exists = indexesList.indexes?.some(idx => idx.name === this.indexName);

    if (!exists) {
      // 2. Provision a modern, cost-efficient serverless index allocation
      await this.client.createIndex({
        name: this.indexName,
        dimension: 1536,
        metric: 'cosine', // Matches standard pgvector math strategies
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1',
          },
        },
      });

      // 3. Simple backoff loop waiting for Pinecone API DNS propagation to complete
      let isReady = false;
      while (!isReady) {
        const desc = await this.client.describeIndex(this.indexName);
        if (desc.status.ready) {
          isReady = true;
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    this.indexInstance = this.client.index(this.indexName);
  }

  async isHealthy(): Promise<boolean> {
    if (!this.indexInstance) return false;
    const stats = await this.indexInstance.describeIndexStats();
    return !!stats;
  }

  async addMemory(agentId: string, text: string, vector: number[]): Promise<void> {
    if (!this.indexInstance) {
      throw new Error('Pinecone engine not initialized.');
    }

    // Pinecone expects a clean upside upsert record structure
    await this.indexInstance.upsert({
      records: [
        {
          id: crypto.randomUUID(),
          values: vector,
          metadata: {
            agentId,
            text,
          },
        },
      ],
    });
  }

  async searchSimilar(vector: number[], limit: number = 5): Promise<VectorSearchResult[]> {
    if (!this.indexInstance) throw new Error('Pinecone engine not active.');

    const queryResponse = await this.indexInstance.query({
      vector: vector,
      topK: limit,
      includeMetadata: true,
    });

    return (queryResponse.matches || []).map(match => ({
      id: match.id,
      agentId: String(match.metadata?.agentId),
      text: String(match.metadata?.text),
      score: match.score ?? 0,
    }));
  }
}
