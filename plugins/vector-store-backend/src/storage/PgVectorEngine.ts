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
import { Knex } from 'knex';
import {
  AbstractVectorStorageEngine,
  VectorSearchResult,
} from '@ai-crew-suite/plugin-vector-store-node';

export class PgVectorEngine extends AbstractVectorStorageEngine {
  constructor(private readonly knex: Knex) {
    super();
  }

  async initialize(): Promise<void> {
    await this.knex.raw('CREATE EXTENSION IF NOT EXISTS vector;');
    await this.knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    const hasTable = await this.knex.schema.hasTable('agent_memory_embeddings');
    if (!hasTable) {
      await this.knex.schema.createTable('agent_memory_embeddings', (table) => {
        table.uuid('id').primary().defaultTo(this.knex.raw('uuid_generate_v4()'));
        table.string('agent_id').notNullable();
        table.specificType('embedding', 'vector(1536)').notNullable();
      });

      await this.knex.raw(`
        CREATE INDEX IF NOT EXISTS agent_memory_vector_idx
        ON agent_memory_embeddings USING hnsw (embedding vector_cosine_ops);
      `);
    }
  }

  async isHealthy(): Promise<boolean> {
    await this.knex.raw('SELECT 1;');
    return true;
  }

  async addMemory(agentId: string, text: string, vector: number[]): Promise<void> {
    await this.knex('agent_memory_embeddings').insert({
      agent_id: agentId,
      embedding: this.knex.raw('?::vector', [JSON.stringify(vector)])
    });
  }

  async searchSimilar(vector: number[], limit: number = 5): Promise<VectorSearchResult[]> {
    const vectorStr = JSON.stringify(vector);

    // 1 - (embedding <=> input) maps distance directly back to standard similarity score metrics
    const results = await this.knex.raw(`
      SELECT id, agent_id, memory_text,
            (1 - (embedding <=> ?::vector)) as similarity_score
      FROM agent_memory_embeddings
      ORDER BY embedding <=> ?::vector
      LIMIT ?;
    `, [vectorStr, vectorStr, limit]);

    return results.rows.map((row: any) => ({
      id: row.id,
      agentId: row.agent_id,
      text: row.memory_text,
      score: Number(row.similarity_score),
    }));
  }
}
