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
import { Client } from '@opensearch-project/opensearch';
import {
  AbstractVectorStorageEngine,
  VectorSearchResult,
} from '@ai-crew-suite/plugin-vector-store-node';

export class AwsOpenSearchEngine extends AbstractVectorStorageEngine {
  private client: Client;
  private readonly indexName = 'backstage-agent-memories';

  constructor(nodeUrl: string, masterUser?: string, masterPassword?: string) {
    super();

    this.client = new Client({
      node: nodeUrl,
      auth: masterUser && masterPassword ? { username: masterUser, password: masterPassword } : undefined,
      ssl: { rejectUnauthorized: false }
    });
  }

  async initialize(): Promise<void> {
    // 1. Check if our custom k-NN memory index profile is already configured
    const { body: exists } = await this.client.indices.exists({ index: this.indexName });

    if (!exists) {
      // 2. Build a modern k-NN graph blueprint utilizing the highly optimized FAISS engine
      await this.client.indices.create({
        index: this.indexName,
        body: {
          settings: {
            'index.knn': true, // Activate the OpenSearch native K-Nearest Neighbor library
          },
          mappings: {
            properties: {
              id: { type: 'keyword' },
              agent_id: { type: 'keyword' },
              memory_text: { type: 'text' },
              embedding: {
                type: 'knn_vector', // Map the column using specific vector structures
                dimension: 1536,
                method: {
                  name: 'hnsw',
                  space_type: 'cosinesimil', // Cosine distance calculation index alignment
                  engine: 'faiss', // Fast C++ multi-threaded lookup matching standard cloud builds
                },
              },
            },
          },
        },
      });
    }
  }

  async isHealthy(): Promise<boolean> {
    const { body } = await this.client.ping();
    return body === true;
  }

  async addMemory(agentId: string, text: string, vector: number[]): Promise<void> {
    // Index the data directly into the cluster graph schema mapping
    await this.client.index({
      index: this.indexName,
      refresh: 'wait_for',
      body: {
        id: crypto.randomUUID(),
        agent_id: agentId,
        memory_text: text,
        embedding: vector,
      },
    });
  }

  async searchSimilar(vector: number[], limit: number = 5): Promise<VectorSearchResult[]> {
    const { body } = await this.client.search({
      index: this.indexName,
      body: {
        size: limit,
        query: {
          knn: {
            embedding: {
              vector: vector,
              k: limit,
            },
          },
        },
      },
    });

    const hits = body.hits?.hits || [];

    return hits.map((hit: any) => ({
      id: hit._source.id || hit._id,
      agentId: hit._source.agent_id,
      text: hit._source.memory_text,
      score: hit._score, // OpenSearch outputs native similarity metrics for cosine space
    }));
  }
}
