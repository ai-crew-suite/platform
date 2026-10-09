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
// plugins/vector-store-node/src/storage/MilvusEngine.ts
import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import {
  AbstractVectorStorageEngine,
  VectorSearchResult,
} from '@ai-crew-suite/plugin-vector-store-node';

export class MilvusEngine extends AbstractVectorStorageEngine {
  private client: MilvusClient;
  private readonly collectionName = 'agent_memory_embeddings';

  constructor(address: string, username?: string, password?: string) {
    super();

    this.client = new MilvusClient({
      address,
      username,
      password,
    });
  }

  async initialize(): Promise<void> {
    // 1. Check if the target collection already exists
    const hasCollection = await this.client.hasCollection({
      collection_name: this.collectionName,
    });

    if (!hasCollection.value) {
      // 2. Define a strict relational field schema required by Milvus
      await this.client.createCollection({
        collection_name: this.collectionName,
        fields: [
          {
            name: 'id',
            data_type: DataType.VarChar,
            max_length: 36,
            is_primary_key: true,
          },
          {
            name: 'agent_id',
            data_type: DataType.VarChar,
            max_length: 255,
          },
          {
            name: 'embedding',
            data_type: DataType.FloatVector,
            dim: 1536, // Must match your target vector dimensionality
          },
        ],
      });

      // 3. Create a vector index (Milvus requires this step explicitly to allow querying)
      await this.client.createIndex({
        collection_name: this.collectionName,
        field_name: 'embedding',
        index_name: 'vector_idx',
        extra_params: {
          index_type: 'HNSW', // Standard high-performance math lookup matching your config
          metric_type: 'COSINE', // Cosine distance calculation index matching pgvector/qdrant
          params: JSON.stringify({ M: 16, efConstruction: 64 }),
        },
      });
    }

    // 4. Milvus requires collections to be explicitly loaded into memory before use
    await this.client.loadCollectionSync({
      collection_name: this.collectionName,
    });
  }

  async isHealthy(): Promise<boolean> {
    const health = await this.client.checkHealth();
    return health.isHealthy;
  }

  async addMemory(agentId: string, text: string, vector: number[]): Promise<void> {
    await this.client.insert({
      collection_name: this.collectionName,
      fields_data: [
        {
          id: crypto.randomUUID(),
          agent_id: agentId,
          embedding: vector, // Array of 1536 floats directly mapped
          // Note: Text/metadata can be added as stringified JSON payloads if schema holds a dynamic field
        },
      ],
    });
  }

  async searchSimilar(vector: number[], limit: number = 5): Promise<VectorSearchResult[]> {
    const searchResponse = await this.client.search({
      collection_name: this.collectionName,
      vector: [vector], // Milvus expects a batch multi-search nested array wrapper layout
      limit: limit,
      output_fields: ['agent_id', 'memory_text'],
    });

    return searchResponse.results.map(res => ({
      id: String(res.id),
      agentId: String(res.agent_id),
      text: String(res.memory_text),
      score: res.score,
    }));
  }
}
