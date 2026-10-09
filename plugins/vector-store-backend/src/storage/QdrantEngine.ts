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
import { QdrantClient } from '@qdrant/js-client-rest';
import {
  AbstractVectorStorageEngine,
  VectorSearchResult,
} from '@ai-crew-suite/plugin-vector-store-node';

export class QdrantEngine extends AbstractVectorStorageEngine {
  private client: QdrantClient;

  constructor(url: string) {
    super();

    this.client = new QdrantClient({ url });
  }

  async initialize(): Promise<void> {
    const collections = await this.client.getCollections();
    const exists = collections.collections.some(c => c.name === 'agent_memories');

    if (!exists) {
      await this.client.createCollection('agent_memories', {
        vectors: {
          size: 1536,
          distance: 'Cosine',
        },
      });
    }
  }

  async isHealthy(): Promise<boolean> {
    const telemetry = await this.client.clusterTelemetry();
    return !!telemetry;
  }

  async addMemory(agentId: string, text: string, vector: number[]): Promise<void> {
    await this.client.upsert('agent_memories', {
      wait: true,
      points: [{ id: crypto.randomUUID(), vector, payload: { agentId, text } }]
    });
  }

  async searchSimilar(vector: number[], limit: number = 5): Promise<VectorSearchResult[]> {
    const response = await this.client.query('agent_memories', {
      query: vector,
      limit: limit,
      with_payload: true,
    });

    return response.points.map(point => ({
      id: String(point.id),
      agentId: String(point.payload?.['agentId']),
      text: String(point.payload?.['text']),
      score: point.score, // Qdrant naturally outputs metric scores matching your collection profile
    }));
  }
}
