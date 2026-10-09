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
import {
  AbstractVectorStorageEngine,
  VectorSearchResult,
} from '@ai-crew-suite/plugin-vector-store-node';

interface InMemoryRecord {
  id: string;
  agentId: string;
  text: string;
  vector: number[];
}

export class InMemoryEngine extends AbstractVectorStorageEngine {
  private memoryStore: InMemoryRecord[] = [];

  async initialize(): Promise<void> {
    this.memoryStore = [];
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async addMemory(agentId: string, text: string, vector: number[]): Promise<void> {
    this.memoryStore.push({
      id: crypto.randomUUID(),
      agentId,
      text,
      vector,
    });
  }

  async searchSimilar(vector: number[], limit: number = 5): Promise<VectorSearchResult[]> {
    // 1. Compute cosine similarity against all stored arrays manually
    const scored = this.memoryStore.map(record => {
      const score = this.calculateCosineSimilarity(vector, record.vector);
      return {
        id: record.id,
        agentId: record.agentId,
        text: record.text,
        score,
      };
    });

    // 2. Sort from highest similarity (closest to 1.0) to lowest and truncate
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
