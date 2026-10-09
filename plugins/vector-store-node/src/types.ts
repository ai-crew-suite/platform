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

export interface VectorSearchResult {
  id: string;
  agentId: string;
  text: string;
  score: number; // Standardized float payload tracking mathematical match weights
}

export interface AsymmetricSearchOptions {
  text: string;    // The human-readable query string
  limit?: number;  // Maximum number of closest matches to return
}

export interface VectorStorageEngine {
  initialize(): Promise<void>;
  isHealthy(): Promise<boolean>;
  addMemory(agentId: string, text: string, vector: number[]): Promise<void>;
  /**
   * Evaluates the nearest vectors using cosine similarity distance lookups
   */
  searchSimilar(vector: number[], limit: number): Promise<VectorSearchResult[]>;
  /**
   * Automatically handles string embedding generation via an external orchestrator
   * function before querying the structural database layer.
   */
  searchAsymmetric(
    options: AsymmetricSearchOptions,
    embedder: (text: string) => Promise<number[]>
  ): Promise<VectorSearchResult[]>;
}
